const { getSupabase, authenticate, corsHeaders, handleOptions, error, success } = require('./_shared');

exports.handler = async (event) => {
    const preflight = handleOptions(event);
    if (preflight) return preflight;

    if (event.httpMethod !== 'POST') return error(405, 'Method not allowed');

    const auth = await authenticate(event);
    if (auth.error) return error(auth.status, auth.error);

    const { session } = auth;

    try {
        const supabase = getSupabase();
        const { birthId, birthNumber, title, body } = JSON.parse(event.body);

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

        return success({ success: true, message: 'تم إرسال الإشعار' });

    } catch (err) {
        console.error('Send push error:', err);
        return error(500, 'خطأ داخلي في الخادم');
    }
};
