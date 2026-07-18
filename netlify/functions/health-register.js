// netlify/functions/health-register.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://xhqfiuecmodoefzxesof.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhocWZpdWVjbW9kb2Vmenhlc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjQzMjAsImV4cCI6MjA5NzkwMDMyMH0.wTQU63rLayMAacfPd9IQIX5a4n-NChTIdDiRc22HWNM';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id'
            }
        };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const token = event.headers.authorization?.split(' ')[1];
    if (!token) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // التحقق من الجلسة
        const { data: session, error: sessionError } = await supabase
            .from('admin_sessions')
            .select('user_id')
            .eq('token', token)
            .gte('expires_at', new Date().toISOString())
            .single();

        if (sessionError || !session) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid session' }) };
        }

        // جلب بيانات المستخدم
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, username, role_type, branch_name, region, hospital_name')
            .eq('id', session.user_id)
            .single();

        if (userError || (user.role_type !== 'health_officer' && user.role_type !== 'admin')) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'غير مصرح لك' }) };
        }

        const data = JSON.parse(event.body);

        // التحقق من البيانات المطلوبة
        const required = ['baby_gender', 'father_name', 'mother_name', 'birth_place', 'birth_type', 'mother_phone'];
        for (const field of required) {
            if (!data[field]) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: `حقل ${field} مطلوب` }) };
            }
        }

        // تحضير تاريخ الولادة
        let birthDate = data.birth_date || new Date().toISOString().split('T')[0];

        // ===== توليد رقم المولود التلقائي (محسّن) =====
        const yearPart = new Date(birthDate).getFullYear();
        
        // جلب أكبر رقم موجود حالياً
        const { data: existingBirths, error: fetchError } = await supabase
            .from('births')
            .select('birth_number')
            .like('birth_number', `B-${yearPart}-%`)
            .order('birth_number', { ascending: false })
            .limit(1);

        let nextNumber = 1;
        if (existingBirths && existingBirths.length > 0) {
            const lastNum = parseInt(existingBirths[0].birth_number.split('-')[2]);
            if (!isNaN(lastNum)) {
                nextNumber = lastNum + 1;
            }
        }

        // محاولة العثور على رقم غير مستخدم (في حالة وجود ثغرات)
        let birthNumber = null;
        let attempts = 0;
        const maxAttempts = 100;

        while (birthNumber === null && attempts < maxAttempts) {
            const paddedNumber = String(nextNumber).padStart(6, '0');
            const testNumber = `B-${yearPart}-${paddedNumber}`;
            
            // التحقق من عدم وجود هذا الرقم
            const { data: check, error: checkError } = await supabase
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

        if (!birthNumber) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'فشل توليد رقم المولود' }) };
        }

        // ===== توليد رقم الإخطار التلقائي =====
        const notifYearPart = new Date().getFullYear();
        const { data: existingNotifs, error: notifFetchError } = await supabase
            .from('birth_notifications')
            .select('notification_number')
            .like('notification_number', `N-${notifYearPart}-%`)
            .order('notification_number', { ascending: false })
            .limit(1);

        let nextNotifNumber = 1;
        if (existingNotifs && existingNotifs.length > 0) {
            const lastNum = parseInt(existingNotifs[0].notification_number.split('-')[2]);
            if (!isNaN(lastNum)) {
                nextNotifNumber = lastNum + 1;
            }
        }

        let notificationNumber = null;
        let notifAttempts = 0;
        while (notificationNumber === null && notifAttempts < maxAttempts) {
            const paddedNotif = String(nextNotifNumber).padStart(6, '0');
            const testNotif = `N-${notifYearPart}-${paddedNotif}`;
            
            const { data: check, error: checkError } = await supabase
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

        // ===== إنشاء بيانات المولود =====
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

        // إدراج المولود
        const { data: birth, error: insertError } = await supabase
            .from('births')
            .insert(birthData)
            .select()
            .single();

        if (insertError) {
            console.error('❌ خطأ في الإدراج:', insertError);
            return { statusCode: 500, headers, body: JSON.stringify({ error: insertError.message }) };
        }

        // ===== إنشاء إخطار تلقائي =====
        const notificationData = {
            birth_id: birth.id,
            notification_number: notificationNumber,
            printed_by: session.user_id,
            printed_at: new Date().toISOString(),
            midwife_signed: true,
            hospital_director_signed: true,
            notes: 'تم إنشاء الإخطار تلقائياً'
        };

        const { data: notification, error: notifInsertError } = await supabase
            .from('birth_notifications')
            .insert(notificationData)
            .select()
            .single();

        if (notifInsertError) {
            console.warn('⚠️ فشل إنشاء الإخطار التلقائي:', notifInsertError);
        }

        // تحديث حالة المولود إلى "printed"
        await supabase
            .from('births')
            .update({ status: 'printed' })
            .eq('id', birth.id);

        // تسجيل في سير العمل
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

        console.log('✅ تم تسجيل المولود بنجاح:', birthNumber);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'تم تسجيل المولود بنجاح',
                birth: birth,
                notification: notification || null
            })
        };

    } catch (error) {
        console.error('❌ خطأ في health-register:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};