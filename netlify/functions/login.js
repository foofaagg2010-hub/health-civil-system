const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getSupabase, handleOptions, error, success } = require('./_shared');

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

exports.handler = async (event) => {
    const preflight = handleOptions(event);
    if (preflight) return preflight;

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const { username, password } = JSON.parse(event.body);

        if (!username || !password) {
            return { statusCode: 400, body: JSON.stringify({ error: 'اسم المستخدم وكلمة المرور مطلوبة' }) };
        }

        const supabase = getSupabase();
        const ip = event.headers['client-ip'] || event.headers['x-forwarded-for'] || event.headers['x-nf-client-connection-ip'] || 'unknown';

        const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

        const { count: recentAttempts } = await supabase
            .from('login_attempts')
            .select('id', { count: 'exact', head: true })
            .eq('ip_address', ip)
            .eq('success', false)
            .gte('attempted_at', since);

        if (recentAttempts >= MAX_ATTEMPTS) {
            return { statusCode: 429, body: JSON.stringify({ error: `تم تجاوز الحد المسموح. حاول بعد ${WINDOW_MINUTES} دقيقة` }) };
        }

        const { data: users, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('username', username);

        if (userError || !users || users.length === 0) {
            await supabase.from('login_attempts').insert({ ip_address: ip, username, success: false });
            return { statusCode: 401, body: JSON.stringify({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }) };
        }

        const user = users[0];

        let passwordValid = false;
        if (user.password_hash && user.password_hash.startsWith('$2')) {
            passwordValid = await bcrypt.compare(password, user.password_hash);
        } else if (user.password_hash) {
            passwordValid = (user.password_hash === password);
            if (passwordValid) {
                const newHash = await bcrypt.hash(password, 12);
                await supabase
                    .from('users')
                    .update({ password_hash: newHash })
                    .eq('id', user.id);
                console.log('⬆️ تمت ترقية كلمة مرور المستخدم', user.username, 'من نص عادي إلى bcrypt');
            }
        }

        if (!passwordValid) {
            await supabase.from('login_attempts').insert({ ip_address: ip, username, success: false });
            return { statusCode: 401, body: JSON.stringify({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }) };
        }

        if (!user.is_active) {
            return { statusCode: 401, body: JSON.stringify({ error: 'الحساب غير نشط' }) };
        }

        await supabase.from('login_attempts').insert({ ip_address: ip, username, success: true });

        const sessionToken = crypto.randomBytes(64).toString('hex');
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 8);

        const { error: sessionError } = await supabase
            .from('admin_sessions')
            .insert({
                user_id: user.id,
                token: sessionToken,
                expires_at: expiresAt.toISOString()
            });

        if (sessionError) {
            console.error('Session error:', sessionError);
            return { statusCode: 500, body: JSON.stringify({ error: 'فشل إنشاء الجلسة' }) };
        }

        await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', user.id);

        await supabase
            .from('activity_logs')
            .insert({
                user_id: user.id,
                username: user.username,
                action: 'تسجيل الدخول',
                details: `تسجيل دخول للمستخدم ${user.username}`,
                ip_address: ip
            });

        return success({
            success: true,
            token: sessionToken,
            user: {
                id: user.id,
                username: user.username,
                branch: user.branch_name,
                role: user.role,
                role_type: user.role_type || user.role,
                can_edit: user.can_edit || false,
                can_view_logs: user.can_view_logs || false,
                can_view_users: user.can_view_users || false,
                hospital_name: user.hospital_name,
                region: user.region
            }
        });

    } catch (err) {
        console.error('Login error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: 'خطأ داخلي في الخادم' }) };
    }
};
