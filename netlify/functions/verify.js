const { getSupabase, corsHeaders, handleOptions, error, success } = require('./_shared');

exports.handler = async (event) => {
    const preflight = handleOptions(event);
    if (preflight) return preflight;

    try {
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) return error(401, 'Unauthorized');

        const supabase = getSupabase();

        const { data: session, error: sessionError } = await supabase
            .from('admin_sessions')
            .select('user_id, expires_at')
            .eq('token', token)
            .single();

        if (sessionError || !session) return error(401, 'Invalid session');

        if (new Date(session.expires_at) < new Date()) return error(401, 'Session expired');

        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, username, branch_name, role, role_type, can_edit, can_view_logs, can_view_users, hospital_name, region')
            .eq('id', session.user_id)
            .single();

        if (userError || !user) return error(404, 'User not found');

        return success({
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
        });

    } catch (err) {
        console.error('Verify error:', err);
        return error(500, 'Internal server error');
    }
};
