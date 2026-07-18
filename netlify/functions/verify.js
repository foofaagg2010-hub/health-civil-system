// netlify/functions/verify.js
const { createClient } = require('@supabase/supabase-js');

// إعدادات Supabase - من متغيرات البيئة
const supabaseUrl = process.env.SUPABASE_URL || 'https://xhqfiuecmodoefzxesof.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhocWZpdWVjbW9kb2Vmenhlc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjQzMjAsImV4cCI6MjA5NzkwMDMyMH0.wTQU63rLayMAacfPd9IQIX5a4n-NChTIdDiRc22HWNM';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };
    
    try {
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
        }
        
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // التحقق من الجلسة
        const { data: session, error: sessionError } = await supabase
            .from('admin_sessions')
            .select('user_id, expires_at')
            .eq('token', token)
            .single();
        
        if (sessionError || !session) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid session' }) };
        }
        
        // التحقق من انتهاء الصلاحية
        if (new Date(session.expires_at) < new Date()) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Session expired' }) };
        }
        
        // جلب بيانات المستخدم
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, username, branch_name, role, role_type, can_edit, can_view_logs, can_view_users, hospital_name, region')
            .eq('id', session.user_id)
            .single();
        
        if (userError || !user) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'User not found' }) };
        }
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                user_id: user.id,
                username: user.username,
                branch: user.branch_name,
                role: user.role,
                role_type: user.role_type || user.role,
                can_edit: user.can_edit || false,
                can_view_logs: user.can_view_logs || false,
                can_view_users: user.can_view_users || false,
                hospital_name: user.hospital_name,
                region: user.region
            })
        };
        
    } catch (error) {
        console.error('Verify error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};