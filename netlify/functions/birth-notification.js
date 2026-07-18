const { getSupabase, authenticate, handleOptions, error, success } = require('./_shared');

exports.handler = async (event) => {
    const preflight = handleOptions(event);
    if (preflight) return preflight;

    const auth = await authenticate(event);
    if (auth.error) return error(auth.status, auth.error);

    const { user, session } = auth;
    const supabase = getSupabase();

    if (event.httpMethod === 'POST') {
        const { birthId } = JSON.parse(event.body);

        if (!birthId) return error(400, 'birthId مطلوب');

        const { data: birth, error: birthError } = await supabase
            .from('births')
            .select('*, printed_count')
            .eq('id', birthId)
            .single();

        if (birthError || !birth) return error(404, 'المولود غير موجود');

        const yearPart = new Date().getFullYear();
        const newCount = (birth.printed_count || 0) + 1;

        const { data: existingNotifs } = await supabase
            .from('birth_notifications')
            .select('notification_number')
            .like('notification_number', `N-${yearPart}-%`)
            .order('notification_number', { ascending: false })
            .limit(1);

        let nextNumber = 1;
        if (existingNotifs && existingNotifs.length > 0) {
            const lastNum = parseInt(existingNotifs[0].notification_number.split('-')[2]);
            if (!isNaN(lastNum)) nextNumber = lastNum + 1;
        }

        let notificationNumber = null;
        let attempts = 0;
        while (notificationNumber === null && attempts < 100) {
            const paddedNumber = String(nextNumber).padStart(6, '0');
            const testNumber = `N-${yearPart}-${paddedNumber}`;
            const { data: check } = await supabase
                .from('birth_notifications')
                .select('notification_number')
                .eq('notification_number', testNumber)
                .maybeSingle();
            if (!check) {
                notificationNumber = testNumber;
            } else {
                nextNumber++;
            }
            attempts++;
        }

        if (!notificationNumber) {
            notificationNumber = `N-${yearPart}-${String(Date.now()).slice(-6)}`;
        }

        const notificationData = {
            birth_id: birthId,
            notification_number: notificationNumber,
            printed_by: session.user_id,
            printed_at: new Date().toISOString(),
            midwife_signed: true,
            hospital_director_signed: true,
            notes: `نسخة ${newCount}`
        };

        const { data: notification, error: insertError } = await supabase
            .from('birth_notifications')
            .insert(notificationData)
            .select()
            .single();

        if (insertError) {
            console.error('Notification insert error:', insertError);
            return error(500, 'فشل إنشاء الإخطار');
        }

        await supabase
            .from('births')
            .update({
                status: 'printed',
                printed_count: newCount,
                updated_at: new Date().toISOString()
            })
            .eq('id', birthId);

        await supabase
            .from('birth_workflow_logs')
            .insert({
                birth_id: birthId,
                stage: 'notification_printed',
                performed_by: session.user_id,
                performed_by_name: user.username,
                performed_by_role: 'health_officer',
                details: `تم طباعة إخطار الولادة (نسخة ${newCount})`,
                metadata: { notification_id: notification.id, copy_number: newCount }
            });

        return success({
            success: true,
            message: 'تم إنشاء إخطار الطباعة بنجاح',
            notification: notification,
            birth: { ...birth, printed_count: newCount },
            copy_number: newCount
        });
    }

    if (event.httpMethod === 'GET') {
        const birthId = event.queryStringParameters?.birthId;
        if (!birthId) return error(400, 'birthId مطلوب');

        const { data: notification, error: fetchError } = await supabase
            .from('birth_notifications')
            .select('*, births(*)')
            .eq('birth_id', birthId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            return error(500, 'خطأ في جلب الإخطار');
        }

        return success(notification || null);
    }

    return error(405, 'Method not allowed');
};
