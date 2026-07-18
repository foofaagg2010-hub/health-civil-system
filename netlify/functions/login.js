// netlify/functions/login.js
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// إعدادات Supabase - من متغيرات البيئة
const supabaseUrl = process.env.SUPABASE_URL || 'https://xhqfiuecmodoefzxesof.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhocWZpdWVjbW9kb2Vmenhlc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjQzMjAsImV4cCI6MjA5NzkwMDMyMH0.wTQU63rLayMAacfPd9IQIX5a4n-NChTIdDiRc22HWNM';

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
    
    try {
        const { username, password } = JSON.parse(event.body);
        
        if (!username || !password) {
            return { statusCode: 400, body: JSON.stringify({ error: 'اسم المستخدم وكلمة المرور مطلوبة' }) };
        }
        
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // البحث عن المستخدم
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('username', username);
        
        if (userError) {
            console.error('Supabase query error:', userError);
            return { statusCode: 401, body: JSON.stringify({ error: 'خطأ في الاتصال بقاعدة البيانات: ' + userError.message }) };
        }
        if (!users || users.length === 0) {
            return { statusCode: 401, body: JSON.stringify({ error: 'اسم المستخدم غير صحيح' }) };
        }
        
        const user = users[0];
        
        // التحقق من كلمة المرور
        let passwordValid = false;
        if (user.password_hash && user.password_hash.startsWith('$2')) {
            passwordValid = await bcrypt.compare(password, user.password_hash);
        } else if (user.password_hash) {
            passwordValid = (user.password_hash === password);
        }
        
        if (!passwordValid) {
            return { statusCode: 401, body: JSON.stringify({ error: 'كلمة المرور غير صحيحة' }) };
        }
        
        if (!user.is_active) {
            return { statusCode: 401, body: JSON.stringify({ error: 'الحساب غير نشط' }) };
        }
        
        // إنشاء جلسة
        const sessionToken = crypto.randomBytes(64).toString('hex');
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 8);
        
        // حفظ الجلسة
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
        
        // تحديث آخر دخول
        await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', user.id);
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
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
            })
        };
        
    } catch (error) {
        console.error('Login error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'خطأ داخلي في الخادم' }) };
    }
};