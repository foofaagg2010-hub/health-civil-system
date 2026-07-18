const { getSupabase, authenticate, handleOptions, error, success } = require('./_shared');

exports.handler = async (event) => {
    const preflight = handleOptions(event);
    if (preflight) return preflight;

    if (event.httpMethod !== 'GET') return error(405, 'Method not allowed');

    const auth = await authenticate(event);
    if (auth.error) return error(auth.status, auth.error);

    try {
        const supabase = getSupabase();
        const search = event.queryStringParameters?.search || '';

        let workflowQuery = supabase
            .from('birth_workflow_logs')
            .select('id, performed_by, performed_by_name, performed_by_role, stage, details, metadata, performed_at, created_at')
            .order('performed_at', { ascending: false })
            .limit(200);

        if (search) {
            const searchTerm = `%${search}%`;
            workflowQuery = workflowQuery.or(`performed_by_name.ilike.${searchTerm},details.ilike.${searchTerm},stage.ilike.${searchTerm}`);
        }

        const { data: workflowLogs } = await workflowQuery;

        let activityQuery = supabase
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);

        if (search) {
            const searchTerm = `%${search}%`;
            activityQuery = activityQuery.or(`username.ilike.${searchTerm},details.ilike.${searchTerm},action.ilike.${searchTerm}`);
        }

        const { data: activityLogs } = await activityQuery;

        const formattedWorkflow = (workflowLogs || []).map(log => ({
            id: 'w' + log.id,
            username: log.performed_by_name || 'غير معروف',
            action: log.stage || '---',
            details: log.details || '---',
            created_at: log.performed_at || log.created_at,
            type: 'birth'
        }));

        const formattedActivity = (activityLogs || []).map(log => ({
            id: 'a' + log.id,
            username: log.username || 'غير معروف',
            action: log.action || '---',
            details: log.details || '---',
            created_at: log.created_at,
            type: 'activity'
        }));

        const allLogs = [...formattedWorkflow, ...formattedActivity]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 500);

        return success(allLogs);

    } catch (err) {
        console.error('Logs error:', err);
        return error(500, 'خطأ داخلي في الخادم');
    }
};
