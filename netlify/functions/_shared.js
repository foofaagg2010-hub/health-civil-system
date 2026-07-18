const { createClient } = require('@supabase/supabase-js');

function requireEnv(name) {
    const val = process.env[name];
    if (!val) throw new Error(`Missing required env: ${name}`);
    return val;
}

function getSupabase() {
    return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'));
}

async function authenticate(event) {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { error: 'Unauthorized', status: 401 };

    const supabase = getSupabase();
    const { data: session, error: sessionError } = await supabase
        .from('admin_sessions')
        .select('user_id')
        .eq('token', token)
        .gte('expires_at', new Date().toISOString())
        .single();

    if (sessionError || !session) return { error: 'Invalid session', status: 401 };

    const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user_id)
        .single();

    if (userError || !user) return { error: 'User not found', status: 403 };
    if (!user.is_active) return { error: 'الحساب غير نشط', status: 403 };

    return { session, user };
}

function allowedOrigin() {
    return process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.SITE_URL || '*';
}

function corsHeaders(event) {
    const origin = event.headers?.origin || event.headers?.Origin || '';
    const allowed = allowedOrigin();
    const match = allowed === '*' || origin === allowed || (allowed !== '*' && origin.endsWith('.netlify.app'));
    return {
        'Access-Control-Allow-Origin': match ? origin : (allowed === '*' ? '*' : 'null'),
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json'
    };
}

function handleOptions(event) {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: corsHeaders(event)
        };
    }
    return null;
}

function error(status, message) {
    return {
        statusCode: status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: message })
    };
}

function success(data, statusCode = 200) {
    return {
        statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    };
}

module.exports = { getSupabase, authenticate, corsHeaders, handleOptions, error, success };
