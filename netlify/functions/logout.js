const { getSupabase, handleOptions, error, success } = require('./_shared');

exports.handler = async (event) => {
    const preflight = handleOptions(event);
    if (preflight) return preflight;

    if (event.httpMethod !== 'POST') return error(405, 'Method not allowed');

    try {
        const supabase = getSupabase();
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) return success({ success: true, message: 'لا توجد جلسة' });

        const { data: session } = await supabase
            .from('admin_sessions')
            .select('user_id')
            .eq('token', token)
            .single();

        if (session) {
            const { data: user } = await supabase
                .from('users')
                .select('username')
                .eq('id', session.user_id)
                .single();

            await supabase
                .from('activity_logs')
                .insert({
                    user_id: session.user_id,
                    username: user?.username || 'غير معروف',
                    action: 'تسجيل الخروج',
                    details: `تسجيل خروج للمستخدم ${user?.username || 'غير معروف'}`
                });
        }

        const { error: deleteError } = await supabase
            .from('admin_sessions')
            .delete()
            .eq('token', token);

        if (deleteError) {
            console.error('Logout error:', deleteError);
        }

        return success({ success: true, message: 'تم تسجيل الخروج بنجاح' });

    } catch (err) {
        console.error('Logout error:', err);
        return error(500, 'خطأ داخلي في الخادم');
    }
};
