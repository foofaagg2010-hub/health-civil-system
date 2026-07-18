const { getSupabase, authenticate, corsHeaders, handleOptions, error, success } = require('./_shared');

exports.handler = async (event) => {
    const preflight = handleOptions(event);
    if (preflight) return preflight;

    if (event.httpMethod !== 'POST') return error(405, 'Method not allowed');

    const auth = await authenticate(event);
    if (auth.error) return error(auth.status, auth.error);

    const { user, session } = auth;

    if (user.role_type !== 'midwife') return error(403, 'غير مصرح لك');

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

        const birthData = {
            birth_number: birthNumber,
            midwife_id: session.user_id,
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
            delivery_type: data.delivery_type || null,
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
            status: 'pending',
            registration_source: 'midwife',
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
            console.error('Midwife insert error:', insertError);
            return error(500, 'فشل تسجيل المولود: ' + insertError.message);
        }

        await supabase
            .from('birth_workflow_logs')
            .insert({
                birth_id: birth.id,
                stage: 'created_by_midwife',
                performed_by: session.user_id,
                performed_by_name: user.username,
                performed_by_role: 'midwife',
                details: `تم تسجيل مولود جديد بواسطة القابلة ${user.username}`,
                metadata: { source: 'midwife_panel' }
            });

        return success({
            success: true,
            message: 'تم تسجيل المولود بنجاح وإرساله إلى مكتب الصحة',
            birth: birth
        });

    } catch (err) {
        console.error('Midwife-submit error:', err);
        return error(500, 'خطأ داخلي في الخادم');
    }
};
