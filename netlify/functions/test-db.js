const { getSupabase, authenticate, corsHeaders, handleOptions, error, success } = require('./_shared');

exports.handler = async (event) => {
    const preflight = handleOptions(event);
    if (preflight) return preflight;

    const auth = await authenticate(event);
    if (auth.error) return error(auth.status, auth.error);

    try {
        const supabase = getSupabase();

        const { data: healthCheck, error: healthError } = await supabase
            .from('users')
            .select('count', { count: 'exact', head: true });

        const result = {
            status: healthError ? 'error' : 'ok',
            timestamp: new Date().toISOString(),
            user: {
                id: auth.user.id,
                username: auth.user.username,
                role: auth.user.role
            }
        };

        return success(result);

    } catch (err) {
        console.error('Test-db error:', err);
        return error(500, 'Internal server error');
    }
};
