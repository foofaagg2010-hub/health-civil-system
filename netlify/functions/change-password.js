const bcrypt = require('bcryptjs');
const { getSupabase, authenticate, handleOptions, error, success } = require('./_shared');

exports.handler = async (event) => {
    const preflight = handleOptions(event);
    if (preflight) return preflight;

    if (event.httpMethod !== 'POST') return error(405, 'Method not allowed');

    const auth = await authenticate(event);
    if (auth.error) return error(auth.status, auth.error);

    const { user, session } = auth;

    try {
        const supabase = getSupabase();
        const { old_password, new_password } = JSON.parse(event.body);

        if (!old_password || !new_password) {
            return error(400, 'كلمة المرور القديمة والجديدة مطلوبة');
        }

        if (new_password.length < 6) {
            return error(400, 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
        }

        let passwordValid = false;
        if (user.password_hash && user.password_hash.startsWith('$2')) {
            passwordValid = await bcrypt.compare(old_password, user.password_hash);
        } else if (user.password_hash) {
            passwordValid = (user.password_hash === old_password);
        }

        if (!passwordValid) {
            return error(401, 'كلمة المرور القديمة غير صحيحة');
        }

        const newHash = await bcrypt.hash(new_password, 12);

        const { error: updateError } = await supabase
            .from('users')
            .update({ password_hash: newHash, updated_at: new Date().toISOString() })
            .eq('id', user.id);

        if (updateError) {
            console.error('Password change error:', updateError);
            return error(500, 'فشل تغيير كلمة المرور');
        }

        await supabase
            .from('activity_logs')
            .insert({
                user_id: user.id,
                username: user.username,
                action: 'تغيير كلمة المرور',
                details: `تم تغيير كلمة المرور للمستخدم ${user.username}`,
                metadata: { source: 'user_profile' }
            });

        return success({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });

    } catch (err) {
        console.error('Change password error:', err);
        return error(500, 'خطأ داخلي في الخادم');
    }
};
