// netlify/functions/send-push.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://xhqfiuecmodoefzxesof.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhocWZpdWVjbW9kb2Vmenhlc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjQzMjAsImV4cCI6MjA5NzkwMDMyMH0.wTQU63rLayMAacfPd9IQIX5a4n-NChTIdDiRc22HWNM';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }
    
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    
    try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // التحقق من الجلسة
        const { data: session, error: sessionError } = await supabase
            .from('admin_sessions')
            .select('user_id')
            .eq('token', token)
            .gte('expires_at', new Date().toISOString())
            .single();
        
        if (sessionError || !session) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid session' }) };
        }
        
        const { birthId, birthNumber, title, body } = JSON.parse(event.body);
        
        // هنا يمكنك إرسال إشعارات عبر Web Push
        // أو عبر واتساب، أو البريد الإلكتروني
        
        // تسجيل الإشعار في قاعدة البيانات
        await supabase
            .from('birth_workflow_logs')
            .insert({
                birth_id: birthId,
                stage: 'sent_to_civil',
                performed_by: session.user_id,
                performed_by_name: 'System',
                performed_by_role: 'system',
                details: `إشعار: تم إرسال المولود ${birthNumber} للأحوال`,
                metadata: { notification: { title, body } }
            });
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'تم إرسال الإشعار'
            })
        };
        
    } catch (error) {
        console.error('Send push error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};