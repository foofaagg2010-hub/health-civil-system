// netlify/functions/test-db.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://xhqfiuecmodoefzxesof.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhocWZpdWVjbW9kb2Vmenhlc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjQzMjAsImV4cCI6MjA5NzkwMDMyMH0.wTQU63rLayMAacfPd9IQIX5a4n-NChTIdDiRc22HWNM';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // اختبار 1: الاتصال بقاعدة البيانات
        const { data: healthCheck, error: healthError } = await supabase.from('users').select('count', { count: 'exact', head: true });

        let result = {
            supabase_url: supabaseUrl ? 'موجود' : 'مفقود',
            supabase_key: supabaseKey ? 'موجود (اول 10 احرف: ' + supabaseKey.substring(0, 10) + '...)' : 'مفقود',
            key_role: '',
            tests: {}
        };

        // فك JWT لمعرفة نوع المفتاح
        try {
            const parts = supabaseKey.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                result.key_role = payload.role || 'غير معروف';
                result.key_details = payload;
            }
        } catch (e) {}

        // اختبار قراءة جدول users
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, username, role, role_type')
            .limit(5);

        result.tests.read_users = {
            success: !usersError,
            count: users?.length || 0,
            users: users || [],
            error: usersError ? usersError.message : null
        };

        // اختبار وجود admin_sessions
        const { data: sessions, error: sessionsError } = await supabase
            .from('admin_sessions')
            .select('id')
            .limit(1);

        result.tests.admin_sessions = {
            exists: !sessionsError,
            error: sessionsError ? sessionsError.message : null
        };

        // اختبار وجود birth_workflow_logs
        const { data: logs, error: logsError } = await supabase
            .from('birth_workflow_logs')
            .select('id')
            .limit(1);

        result.tests.birth_workflow_logs = {
            exists: !logsError,
            error: logsError ? logsError.message : null
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result, null, 2)
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message, stack: error.stack })
        };
    }
};
