const { getSupabase, authenticate, corsHeaders, handleOptions, error, success } = require('./_shared');

exports.handler = async (event) => {
    const preflight = handleOptions(event);
    if (preflight) return preflight;

    const auth = await authenticate(event);
    if (auth.error) return error(auth.status, auth.error);

    const { user, session } = auth;
    const supabase = getSupabase();

    if (event.httpMethod === 'GET') {
        const page = parseInt(event.queryStringParameters?.page) || 1;
        const limit = parseInt(event.queryStringParameters?.limit) || 50;
        const status = event.queryStringParameters?.status;
        const search = event.queryStringParameters?.search;
        const offset = (page - 1) * limit;

        let query = supabase.from('births').select('*', { count: 'exact' });

        const roleType = user.role_type || user.role;

        if (roleType === 'midwife') {
            query = query.eq('midwife_id', session.user_id);
        } else if (roleType === 'health_officer' || roleType === 'supervisor' || roleType === 'civil_officer') {
            if (user.branch_name) {
                query = query.eq('branch_name', user.branch_name);
            }
        }

        if (status && status !== 'all' && status !== 'undefined') {
            if (status === 'not_issued') {
                query = query.not('status', 'eq', 'certificate_issued');
                query = query.not('status', 'eq', 'rejected');
                query = query.not('status', 'eq', 'cancelled');
            } else {
                query = query.eq('status', status);
            }
        }

        if (search && search.trim()) {
            const searchTerm = `%${search.trim()}%`;
            query = query.or(`father_name.ilike.${searchTerm},mother_name.ilike.${searchTerm},birth_number.ilike.${searchTerm}`);
        }

        const { data: births, error: fetchError, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (fetchError) {
            console.error('Births fetch error:', fetchError);
            return error(500, 'خطأ في جلب المواليد');
        }

        // جلب أسماء المستخدمين المرتبطين (للتوقيع في التقارير)
        let enrichedBirths = births || [];
        if (enrichedBirths.length > 0) {
            const userIds = new Set();
            enrichedBirths.forEach(b => { if (b.midwife_id) userIds.add(b.midwife_id); if (b.health_officer_id) userIds.add(b.health_officer_id); });
            if (userIds.size > 0) {
                const { data: users } = await supabase.from('users').select('id, username').in('id', [...userIds]);
                if (users) {
                    enrichedBirths = enrichedBirths.map(b => ({
                        ...b,
                        midwife_name: users.find(u => u.id === b.midwife_id)?.username || null,
                        health_officer_name: users.find(u => u.id === b.health_officer_id)?.username || null,
                    }));
                }
            }
        }

        return success({
            births: enrichedBirths,
            total: count || 0,
            page: page,
            totalPages: Math.ceil((count || 0) / limit),
            user: {
                role_type: user.role_type,
                branch_name: user.branch_name,
                region: user.region
            }
        });
    }

    if (event.httpMethod === 'PUT') {
        const { birthId, status, health_officer_id, is_notified, notification_date, is_certificate_issued, certificate_issue_date, certificate_number, civil_officer_id } = JSON.parse(event.body);

        if (!birthId) return error(400, 'birthId مطلوب');

        const roleType = user.role_type || user.role;
        if (roleType !== 'admin' && roleType !== 'health_officer' && roleType !== 'civil_officer' && roleType !== 'supervisor') {
            return error(403, 'غير مصرح لك بتعديل المواليد');
        }

        if (roleType !== 'admin') {
            const { data: birthCheck, error: checkError } = await supabase
                .from('births')
                .select('branch_name')
                .eq('id', birthId)
                .single();

            if (!checkError && birthCheck && birthCheck.branch_name !== user.branch_name) {
                return error(403, 'لا يمكنك تعديل مولود من فرع آخر');
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
        updates.updated_at = new Date().toISOString();

        const { data: birth, error: updateError } = await supabase
            .from('births')
            .update(updates)
            .eq('id', birthId)
            .select()
            .single();

        if (updateError) {
            console.error('Birth update error:', updateError);
            return error(500, 'خطأ في تحديث المولود');
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

        return success({ success: true, message: 'تم تحديث المولود بنجاح', birth: birth });
    }

    return error(405, 'Method not allowed');
};
