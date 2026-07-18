const bcrypt = require('bcryptjs');
const { getSupabase, authenticate, corsHeaders, handleOptions, error, success } = require('./_shared');

exports.handler = async (event) => {
    const preflight = handleOptions(event);
    if (preflight) return preflight;

    const auth = await authenticate(event);
    if (auth.error) return error(auth.status, auth.error);

    const { user: currentUser } = auth;
    const supabase = getSupabase();

    const canManageUsers = currentUser.role === 'admin' || currentUser.can_view_users === true;
    if (!canManageUsers) return error(403, 'غير مصرح لك بإدارة المستخدمين');

    if (event.httpMethod === 'GET') {
        let query = supabase
            .from('users')
            .select('id, username, role, role_type, branch_name, is_active, last_login, can_edit, can_view_logs, can_view_users, phone_number, whatsapp_number, hospital_name, region, district')
            .order('id', { ascending: true });

        if (currentUser.role !== 'admin') {
            query = query.eq('branch_name', currentUser.branch_name);
        }

        const { data: users, error: fetchError } = await query;

        if (fetchError) {
            console.error('Users fetch error:', fetchError);
            return error(500, 'خطأ في جلب المستخدمين');
        }

        return success(users || []);
    }

    if (event.httpMethod === 'POST') {
        if (currentUser.role !== 'admin') return error(403, 'غير مصرح لك بإضافة مستخدمين');

        const { username, password, role_type, branch_name, phone_number, region, hospital_name, can_edit, can_view_logs, can_view_users } = JSON.parse(event.body);

        if (!username || !password || !role_type || !branch_name) {
            return error(400, 'اسم المستخدم وكلمة المرور والدور والفرع مطلوبة');
        }

        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .single();

        if (existing) return error(400, 'اسم المستخدم موجود بالفعل');

        let role = 'employee';
        if (role_type === 'admin') role = 'admin';
        else if (role_type === 'health_officer' || role_type === 'civil_officer' || role_type === 'supervisor') role = 'supervisor';
        else if (role_type === 'midwife') role = 'employee';

        const password_hash = await bcrypt.hash(password, 12);

        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
                username,
                password_hash,
                role,
                role_type,
                branch_name,
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
            return error(500, 'خطأ في إضافة المستخدم');
        }

        return success({ success: true, user: newUser });
    }

    if (event.httpMethod === 'PUT') {
        if (currentUser.role !== 'admin') return error(403, 'غير مصرح لك بتعديل المستخدمين');

        const { id, username, password, branch_name, role_type, phone_number, region, hospital_name, is_active, can_edit, can_view_logs, can_view_users } = JSON.parse(event.body);

        if (!id) return error(400, 'معرف المستخدم مطلوب');

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

        if (role_type === 'admin') updates.role = 'admin';
        else if (role_type === 'health_officer' || role_type === 'civil_officer' || role_type === 'supervisor') updates.role = 'supervisor';
        else updates.role = 'employee';

        if (password) {
            updates.password_hash = await bcrypt.hash(password, 12);
        }

        const { error: updateError } = await supabase
            .from('users')
            .update(updates)
            .eq('id', id);

        if (updateError) {
            console.error('User update error:', updateError);
            return error(500, 'خطأ في تحديث المستخدم');
        }

        return success({ success: true });
    }

    if (event.httpMethod === 'DELETE') {
        if (currentUser.role !== 'admin') return error(403, 'غير مصرح لك بحذف المستخدمين');

        const id = event.queryStringParameters?.id;
        if (!id) return error(400, 'معرف المستخدم مطلوب');

        if (parseInt(id) === currentUser.id) {
            return error(400, 'لا يمكنك حذف حسابك الحالي');
        }

        const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error('User delete error:', deleteError);
            return error(500, 'خطأ في حذف المستخدم');
        }

        return success({ success: true });
    }

    return error(405, 'Method not allowed');
};
