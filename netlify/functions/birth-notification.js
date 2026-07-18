// netlify/functions/birth-notification.js
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

        // POST - إنشاء إخطار طباعة
        if (event.httpMethod === 'POST') {
            const { birthId, printedBy } = JSON.parse(event.body);

            if (!birthId) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'birthId مطلوب' }) };
            }

            // التحقق من وجود المولود
            const { data: birth, error: birthError } = await supabase
                .from('births')
                .select('*')
                .eq('id', birthId)
                .single();

            if (birthError || !birth) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'المولود غير موجود' }) };
            }

            // ===== توليد رقم الإخطار التلقائي (محسّن) =====
            const yearPart = new Date().getFullYear();
            
            const { data: existingNotifs, error: notifFetchError } = await supabase
                .from('birth_notifications')
                .select('notification_number')
                .like('notification_number', `N-${yearPart}-%`)
                .order('notification_number', { ascending: false })
                .limit(1);

            let nextNumber = 1;
            if (existingNotifs && existingNotifs.length > 0) {
                const lastNum = parseInt(existingNotifs[0].notification_number.split('-')[2]);
                if (!isNaN(lastNum)) {
                    nextNumber = lastNum + 1;
                }
            }

            let notificationNumber = null;
            let attempts = 0;
            const maxAttempts = 100;

            while (notificationNumber === null && attempts < maxAttempts) {
                const paddedNumber = String(nextNumber).padStart(6, '0');
                const testNumber = `N-${yearPart}-${paddedNumber}`;
                
                const { data: check, error: checkError } = await supabase
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

            // إنشاء سجل إخطار
            const notificationData = {
                birth_id: birthId,
                notification_number: notificationNumber,
                printed_by: printedBy || session.user_id,
                printed_at: new Date().toISOString(),
                midwife_signed: true,
                hospital_director_signed: true,
                notes: 'تم طباعة إخطار الولادة'
            };

            const { data: notification, error: insertError } = await supabase
                .from('birth_notifications')
                .insert(notificationData)
                .select()
                .single();

            if (insertError) {
                console.error('❌ خطأ في إنشاء الإخطار:', insertError);
                return { statusCode: 500, headers, body: JSON.stringify({ error: insertError.message }) };
            }

            // تحديث حالة المولود إلى "printed"
            await supabase
                .from('births')
                .update({ 
                    status: 'printed',
                    updated_at: new Date().toISOString()
                })
                .eq('id', birthId);

            // تسجيل في سير العمل
            await supabase
                .from('birth_workflow_logs')
                .insert({
                    birth_id: birthId,
                    stage: 'notification_printed',
                    performed_by: session.user_id,
                    performed_by_name: sessionStorage.getItem('admin_username') || 'موظف',
                    performed_by_role: 'health_officer',
                    details: 'تم طباعة إخطار الولادة',
                    metadata: { notification_id: notification.id }
                });

            console.log('✅ تم إنشاء الإخطار:', notificationNumber);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'تم إنشاء إخطار الطباعة بنجاح',
                    notification: notification,
                    birth: birth
                })
            };
        }

        // GET - جلب إخطار معين
        if (event.httpMethod === 'GET') {
            const birthId = event.queryStringParameters?.birthId;

            if (!birthId) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'birthId مطلوب' }) };
            }

            const { data: notification, error } = await supabase
                .from('birth_notifications')
                .select('*, births(*)')
                .eq('birth_id', birthId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') {
                return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(notification || null)
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };

    } catch (error) {
        console.error('❌ خطأ في birth-notification:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};