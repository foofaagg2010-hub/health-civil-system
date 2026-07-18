// netlify/functions/users.js
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

    const userId = event.headers['x-user-id'];
    if (!userId) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'User ID required' }) };
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

        // جلب صلاحية المستخدم الحالي
        const { data: currentUser, error: currentUserError } = await supabase
            .from('users')
            .select('role, role_type, can_view_users, branch_name, is_active')
            .eq('id', parseInt(userId))
            .single();

        if (currentUserError) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'User not found' }) };
        }

        // التحقق من أن المستخدم نشط
        if (!currentUser.is_active) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'الحساب غير نشط' }) };
        }

        // التحقق من صلاحية إدارة المستخدمين
        const canManageUsers = currentUser.role === 'admin' || currentUser.can_view_users === true;
        if (!canManageUsers) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'غير مصرح لك بإدارة المستخدمين' }) };
        }

        // ===== GET - جلب المستخدمين =====
        if (event.httpMethod === 'GET') {
            let query = supabase
                .from('users')
                .select('id, username, role, role_type, branch_name, is_active, last_login, can_edit, can_view_logs, can_view_users, phone_number, whatsapp_number, hospital_name, region, district')
                .order('id', { ascending: true });

            // إذا كان المستخدم ليس admin، يرى فقط مستخدمين فرعه
            if (currentUser.role !== 'admin') {
                query = query.eq('branch_name', currentUser.branch_name);
            }

            const { data: users, error } = await query;

            if (error) {
                console.error('Users fetch error:', error);
                return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(users || [])
            };
        }

        // ===== POST - إضافة مستخدم جديد =====
        if (event.httpMethod === 'POST') {
            if (currentUser.role !== 'admin') {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'غير مصرح لك بإضافة مستخدمين' }) };
            }

            const { username, password, role_type, branch_name, phone_number, region, hospital_name, can_edit, can_view_logs, can_view_users } = JSON.parse(event.body);

            if (!username || !password || !role_type || !branch_name) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'اسم المستخدم وكلمة المرور والدور والفرع مطلوبة' }) };
            }

            // التحقق من عدم وجود مستخدم بنفس الاسم
            const { data: existing, error: checkError } = await supabase
                .from('users')
                .select('id')
                .eq('username', username)
                .single();

            if (existing) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'اسم المستخدم موجود بالفعل' }) };
            }

            // تحديد الدور العام بناءً على role_type
            let role = 'employee';
            if (role_type === 'admin') role = 'admin';
            else if (role_type === 'health_officer' || role_type === 'civil_officer' || role_type === 'supervisor') role = 'supervisor';
            else if (role_type === 'midwife') role = 'employee';

            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert({
                    username,
                    password_hash: password,
                    role: role,
                    role_type: role_type,
                    branch_name: branch_name,
                    phone_number: phone_number || null,
                    region: region || null,
                    hospital_name: hospital_name || null,
                    is_active: true,
                    can_edit: can_edit || false,
                    can_view_logs: can_view_logs || false,
                    can_view_users: can_view_users || false,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (insertError) {
                console.error('User insert error:', insertError);
                return { statusCode: 500, headers, body: JSON.stringify({ error: insertError.message }) };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, user: newUser })
            };
        }

        // ===== PUT - تحديث مستخدم =====
        if (event.httpMethod === 'PUT') {
            if (currentUser.role !== 'admin') {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'غير مصرح لك بتعديل المستخدمين' }) };
            }

            const { id, username, password, branch_name, role_type, phone_number, region, hospital_name, is_active, can_edit, can_view_logs, can_view_users } = JSON.parse(event.body);

            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'معرف المستخدم مطلوب' }) };
            }

            const updates = {
                username,
                branch_name,
                role_type,
                phone_number,
                region,
                hospital_name,
                is_active,
                can_edit: can_edit || false,
                can_view_logs: can_view_logs || false,
                can_view_users: can_view_users || false,
                updated_at: new Date().toISOString()
            };

            // تحديث الدور العام
            if (role_type === 'admin') updates.role = 'admin';
            else if (role_type === 'health_officer' || role_type === 'civil_officer' || role_type === 'supervisor') updates.role = 'supervisor';
            else updates.role = 'employee';

            if (password) updates.password_hash = password;

            const { error: updateError } = await supabase
                .from('users')
                .update(updates)
                .eq('id', id);

            if (updateError) {
                console.error('User update error:', updateError);
                return { statusCode: 500, headers, body: JSON.stringify({ error: updateError.message }) };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true })
            };
        }

        // ===== DELETE - حذف مستخدم =====
        if (event.httpMethod === 'DELETE') {
            if (currentUser.role !== 'admin') {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'غير مصرح لك بحذف المستخدمين' }) };
            }

            const id = event.queryStringParameters?.id;

            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'معرف المستخدم مطلوب' }) };
            }

            // منع حذف المستخدم الحالي
            if (parseInt(id) === parseInt(userId)) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'لا يمكنك حذف حسابك الحالي' }) };
            }

            const { error } = await supabase
                .from('users')
                .delete()
                .eq('id', id);

            if (error) {
                console.error('User delete error:', error);
                return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true })
            };
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };

    } catch (error) {
        console.error('Users error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error: ' + error.message }) };
    }
};