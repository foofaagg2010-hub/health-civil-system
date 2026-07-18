const { getSupabase, authenticate, corsHeaders, handleOptions, error, success } = require('./_shared');

exports.handler = async (event) => {
    const preflight = handleOptions(event);
    if (preflight) return preflight;

    if (event.httpMethod !== 'GET') return error(405, 'Method not allowed');

    const auth = await authenticate(event);
    if (auth.error) return error(auth.status, auth.error);

    try {
        const supabase = getSupabase();
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

        const { data: logs, error: fetchError } = await query;

        if (fetchError) {
            console.error('Logs fetch error:', fetchError);
            return error(500, 'خطأ في جلب السجلات');
        }

        const formattedLogs = (logs || []).map(log => ({
            id: log.id,
            username: log.users?.username || log.performed_by_name || 'غير معروف',
            action: log.stage || log.details || '---',
            details: log.details || '---',
            created_at: log.performed_at || log.created_at
        }));

        return success(formattedLogs);

    } catch (err) {
        console.error('Logs error:', err);
        return error(500, 'خطأ داخلي في الخادم');
    }
};
