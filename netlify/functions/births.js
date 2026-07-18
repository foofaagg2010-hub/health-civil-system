// netlify/functions/births.js
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

        // جلب صلاحيات المستخدم
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, username, role_type, branch_name, region, can_edit')
            .eq('id', session.user_id)
            .single();

        if (userError || !user) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'User not found' }) };
        }

        console.log('👤 المستخدم:', user.username, 'الدور:', user.role_type, 'الفرع:', user.branch_name);

        // ===== GET - جلب المواليد =====
        if (event.httpMethod === 'GET') {
            const page = parseInt(event.queryStringParameters?.page) || 1;
            const limit = parseInt(event.queryStringParameters?.limit) || 50;
            const status = event.queryStringParameters?.status;
            const search = event.queryStringParameters?.search;
            const offset = (page - 1) * limit;

            console.log('📊 طلب جلب المواليد - الصفحة:', page, 'الحالة:', status, 'البحث:', search);

            let query = supabase.from('births').select('*', { count: 'exact' });

            // ===== تصفية حسب الدور والفرع =====
            const roleType = user.role_type || user.role;

            if (roleType === 'midwife') {
                query = query.eq('midwife_id', session.user_id);
                console.log('🔍 تصفية: قابلة - midwife_id =', session.user_id);
            } else if (roleType === 'health_officer' || roleType === 'supervisor') {
                if (user.branch_name) {
                    query = query.eq('branch_name', user.branch_name);
                    console.log('🔍 تصفية: موظف صحة - branch_name =', user.branch_name);
                }
            } else if (roleType === 'civil_officer') {
                if (user.branch_name) {
                    query = query.eq('branch_name', user.branch_name);
                    console.log('🔍 تصفية: موظف أحوال - branch_name =', user.branch_name);
                }
            } else if (roleType === 'admin') {
                console.log('🔍 تصفية: مدير - لا توجد تصفية');
            }

            // تصفية حسب الحالة
            if (status && status !== 'all' && status !== 'undefined') {
                if (status === 'not_issued') {
                    query = query.not('status', 'eq', 'certificate_issued');
                    query = query.not('status', 'eq', 'rejected');
                    query = query.not('status', 'eq', 'cancelled');
                } else {
                    query = query.eq('status', status);
                }
                console.log('🔍 تصفية الحالة:', status);
            }

            // البحث
            if (search && search.trim()) {
                const searchTerm = `%${search.trim()}%`;
                query = query.or(`father_name.ilike.${searchTerm},mother_name.ilike.${searchTerm},birth_number.ilike.${searchTerm}`);
                console.log('🔍 البحث عن:', searchTerm);
            }

            const { data: births, error, count } = await query
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) {
                console.error('❌ خطأ في جلب المواليد:', error);
                return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
            }

            console.log('✅ تم جلب', births?.length || 0, 'من أصل', count || 0, 'سجل');

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    births: births || [],
                    total: count || 0,
                    page: page,
                    totalPages: Math.ceil((count || 0) / limit),
                    user: {
                        role_type: user.role_type,
                        branch_name: user.branch_name,
                        region: user.region
                    }
                })
            };
        }

        // ===== PUT - تحديث مولود =====
        if (event.httpMethod === 'PUT') {
            const { birthId, status, health_officer_id, is_notified, notification_date, is_certificate_issued, certificate_issue_date, certificate_number, civil_officer_id, branch_name } = JSON.parse(event.body);

            if (!birthId) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'birthId مطلوب' }) };
            }

            const roleType = user.role_type || user.role;
            if (roleType !== 'admin' && roleType !== 'health_officer' && roleType !== 'civil_officer' && roleType !== 'supervisor') {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'غير مصرح لك بتعديل المواليد' }) };
            }

            if (roleType !== 'admin') {
                const { data: birthCheck, error: checkError } = await supabase
                    .from('births')
                    .select('branch_name')
                    .eq('id', birthId)
                    .single();

                if (checkError) {
                    console.error('❌ خطأ في التحقق من الفرع:', checkError);
                } else if (birthCheck && birthCheck.branch_name !== user.branch_name) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'لا يمكنك تعديل مولود من فرع آخر' }) };
                }
            }

            const updates = {};
            if (status) updates.status = status;
            if (health_officer_id) updates.health_officer_id = health_officer_id;
            if (is_notified !== undefined) updates.is_notified = is_notified;
            if (notification_date) updates.notification_date = notification_date;
            if (is_certificate_issued !== undefined) updates.is_certificate_issued = is_certificate_issued;
            if (certificate_issue_date) updates.certificate_issue_date = certificate_issue_date;
            if (certificate_number) updates.certificate_number = certificate_number;
            if (civil_officer_id) updates.civil_officer_id = civil_officer_id;
            if (branch_name) updates.branch_name = branch_name;
            updates.updated_at = new Date().toISOString();

            const { data: birth, error: updateError } = await supabase
                .from('births')
                .update(updates)
                .eq('id', birthId)
                .select()
                .single();

            if (updateError) {
                console.error('❌ خطأ في التحديث:', updateError);
                return { statusCode: 500, headers, body: JSON.stringify({ error: updateError.message }) };
            }

            if (status) {
                const stageMap = {
                    'confirmed': 'reviewed_by_health',
                    'printed': 'notification_printed',
                    'notified_civil': 'sent_to_civil',
                    'civil_received': 'received_by_civil',
                    'certificate_issued': 'certificate_issued'
                };

                await supabase
                    .from('birth_workflow_logs')
                    .insert({
                        birth_id: birthId,
                        stage: stageMap[status] || 'reviewed_by_health',
                        performed_by: session.user_id,
                        performed_by_name: user.username,
                        performed_by_role: user.role_type,
                        details: `تحديث حالة المولود إلى ${status}`,
                        metadata: { previous_status: birth?.status }
                    });
            }

            console.log('✅ تم تحديث المولود بنجاح:', birthId);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'تم تحديث المولود بنجاح',
                    birth: birth
                })
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };

    } catch (error) {
        console.error('❌ خطأ في births:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error: ' + error.message }) };
    }
};