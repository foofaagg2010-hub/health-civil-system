const { getSupabase, authenticate, corsHeaders, handleOptions, error, success } = require('./_shared');

exports.handler = async (event) => {
    const preflight = handleOptions(event);
    if (preflight) return preflight;

    if (event.httpMethod !== 'POST') return error(405, 'Method not allowed');

    const auth = await authenticate(event);
    if (auth.error) return error(auth.status, auth.error);

    const { user, session } = auth;

    if (user.role_type !== 'health_officer' && user.role_type !== 'admin') {
        return error(403, 'غير مصرح لك');
    }

    try {
        const supabase = getSupabase();
        const data = JSON.parse(event.body);

        const required = ['baby_gender', 'father_name', 'mother_name', 'birth_place', 'birth_type', 'mother_phone'];
        for (const field of required) {
            if (!data[field]) return error(400, `حقل ${field} مطلوب`);
        }

        let birthDate = data.birth_date || new Date().toISOString().split('T')[0];
        const yearPart = new Date(birthDate).getFullYear();

        const { data: existingBirths } = await supabase
            .from('births')
            .select('birth_number')
            .like('birth_number', `B-${yearPart}-%`)
            .order('birth_number', { ascending: false })
            .limit(1);

        let nextNumber = 1;
        if (existingBirths && existingBirths.length > 0) {
            const lastNum = parseInt(existingBirths[0].birth_number.split('-')[2]);
            if (!isNaN(lastNum)) nextNumber = lastNum + 1;
        }

        let birthNumber = null;
        let attempts = 0;
        while (birthNumber === null && attempts < 100) {
            const paddedNumber = String(nextNumber).padStart(6, '0');
            const testNumber = `B-${yearPart}-${paddedNumber}`;
            const { data: check } = await supabase
                .from('births')
                .select('birth_number')
                .eq('birth_number', testNumber)
                .maybeSingle();
            if (!check) {
                birthNumber = testNumber;
            } else {
                nextNumber++;
            }
            attempts++;
        }

        if (!birthNumber) return error(500, 'فشل توليد رقم المولود');

        const notifYearPart = new Date().getFullYear();
        const { data: existingNotifs } = await supabase
            .from('birth_notifications')
            .select('notification_number')
            .like('notification_number', `N-${notifYearPart}-%`)
            .order('notification_number', { ascending: false })
            .limit(1);

        let nextNotifNumber = 1;
        if (existingNotifs && existingNotifs.length > 0) {
            const lastNum = parseInt(existingNotifs[0].notification_number.split('-')[2]);
            if (!isNaN(lastNum)) nextNotifNumber = lastNum + 1;
        }

        let notificationNumber = null;
        let notifAttempts = 0;
        while (notificationNumber === null && notifAttempts < 100) {
            const paddedNotif = String(nextNotifNumber).padStart(6, '0');
            const testNotif = `N-${notifYearPart}-${paddedNotif}`;
            const { data: check } = await supabase
                .from('birth_notifications')
                .select('notification_number')
                .eq('notification_number', testNotif)
                .maybeSingle();
            if (!check) {
                notificationNumber = testNotif;
            } else {
                nextNotifNumber++;
            }
            notifAttempts++;
        }

        if (!notificationNumber) {
            notificationNumber = `N-${notifYearPart}-${String(Date.now()).slice(-6)}`;
        }

        const birthData = {
            birth_number: birthNumber,
            health_officer_id: session.user_id,
            baby_gender: data.baby_gender,
            father_name: data.father_name,
            mother_name: data.mother_name,
            mother_national_id: data.mother_national_id || null,
            father_national_id: data.father_national_id || null,
            birth_place: data.birth_place,
            birth_governorate: data.birth_governorate || user.region || '',
            birth_district: data.birth_district || '',
            birth_date: birthDate,
            birth_time: data.birth_time || null,
            birth_type: data.birth_type,
            delivery_type: data.delivery_type || 'طبيعي',
            mother_age: data.mother_age || null,
            mother_phone: data.mother_phone,
            mother_address: data.mother_address || '',
            baby_weight: data.baby_weight ? parseFloat(data.baby_weight) : null,
            baby_height: data.baby_height ? parseFloat(data.baby_height) : null,
            health_status: data.health_status || 'جيد',
            health_notes: data.health_notes || null,
            twin_baby_gender: data.twin_baby_gender || null,
            twin_baby_weight: data.twin_baby_weight ? parseFloat(data.twin_baby_weight) : null,
            twin_baby_height: data.twin_baby_height ? parseFloat(data.twin_baby_height) : null,
            twin_health_status: data.twin_health_status || null,
            twin_health_notes: data.twin_health_notes || null,
            status: 'confirmed',
            registration_source: 'health_officer',
            registration_note: data.registration_note || '',
            created_by: session.user_id,
            branch_name: user.branch_name || user.region || data.birth_governorate || ''
        };

        const { data: birth, error: insertError } = await supabase
            .from('births')
            .insert(birthData)
            .select()
            .single();

        if (insertError) {
            console.error('Birth insert error:', insertError);
            return error(500, 'فشل تسجيل المولود');
        }

        const notificationData = {
            birth_id: birth.id,
            notification_number: notificationNumber,
            printed_by: session.user_id,
            printed_at: new Date().toISOString(),
            midwife_signed: true,
            hospital_director_signed: true,
            notes: 'تم إنشاء الإخطار تلقائياً'
        };

        const { data: notification } = await supabase
            .from('birth_notifications')
            .insert(notificationData)
            .select()
            .single();

        await supabase
            .from('births')
            .update({ status: 'printed' })
            .eq('id', birth.id);

        await supabase
            .from('birth_workflow_logs')
            .insert({
                birth_id: birth.id,
                stage: 'notification_printed',
                performed_by: session.user_id,
                performed_by_name: user.username,
                performed_by_role: 'health_officer',
                details: `تم تسجيل مولود جديد وطباعة الإخطار بواسطة ${user.username}`,
                metadata: { source: 'health_officer_panel' }
            });

        return success({
            success: true,
            message: 'تم تسجيل المولود بنجاح',
            birth: birth,
            notification: notification || null
        });

    } catch (err) {
        console.error('Health-register error:', err);
        return error(500, 'خطأ داخلي في الخادم');
    }
};
