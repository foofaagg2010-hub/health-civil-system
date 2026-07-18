// netlify/functions/logs.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://xhqfiuecmodoefzxesof.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhocWZpdWVjbW9kb2Vmenhlc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjQzMjAsImV4cCI6MjA5NzkwMDMyMH0.wTQU63rLayMAacfPd9IQIX5a4n-NChTIdDiRc22HWNM';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id'
            }
        };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const token = event.headers.authorization?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: session, error: sessionError } = await supabase
            .from('admin_sessions')
            .select('user_id')
            .eq('token', token)
            .gte('expires_at', new Date().toISOString())
            .single();

        if (sessionError || !session) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid session' }) };
        }

        const search = event.queryStringParameters?.search || '';

        let query = supabase
            .from('birth_workflow_logs')
            .select('*, users!inner(username)')
            .order('performed_at', { ascending: false })
            .limit(100);

        if (search) {
            const searchTerm = `%${search}%`;
            query = query.or(`performed_by_name.ilike.${searchTerm},details.ilike.${searchTerm},stage.ilike.${searchTerm}`);
        }

        const { data: logs, error } = await query;

        if (error) {
            console.error('Logs fetch error:', error);
            return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
        }

        const formattedLogs = (logs || []).map(log => ({
            id: log.id,
            username: log.users?.username || log.performed_by_name || 'غير معروف',
            action: log.stage || log.details || '---',
            details: log.details || '---',
            created_at: log.performed_at || log.created_at
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(formattedLogs)
        };

    } catch (error) {
        console.error('Logs error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};
