import { supabase } from '../lib/supabaseClient';
import { adminService } from './adminService';
import { notificationService } from './notificationService';

export interface DepartmentChangeRequest {
    id: string;
    user_id: string;
    current_department_id: string;
    requested_department_id: string;
    status: 'pending' | 'approved' | 'rejected';
    remarks?: string;
    actioned_by?: string;
    created_at: string;
    updated_at?: string;
    profiles?: {
        first_name: string;
        last_name: string;
        avatar_url?: string;
    };
    current_dept?: { name: string };
    requested_dept?: { name: string };
}

export const departmentRequestService = {
    /**
     * Submit a new department change request
     */
    async submitRequest(currentDeptId: string, requestedDeptId: string, remarks: string = '') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data, error } = await supabase
            .from('department_change_requests')
            .insert([{
                user_id: user.id,
                current_department_id: currentDeptId,
                requested_department_id: requestedDeptId,
                remarks: remarks || null,
                status: 'pending'
            }])
            .select()
            .single();

        if (error) throw error;

        // Notify admins about the new request
        try {
            const { data: admins } = await supabase
                .from('profiles')
                .select('auth_user_id')
                .eq('account_type', 'admin');

            if (admins) {
                for (const admin of admins) {
                    await notificationService.createNotification(
                        admin.auth_user_id,
                        'New Dept Change Request',
                        `A student has submitted a department transfer request.`,
                        'info'
                    );
                }
            }
        } catch (err) {
            console.error("Failed to notify admins:", err);
        }

        return data as DepartmentChangeRequest;
    },

    /**
     * Get the current user's most recent (active) pending request
     */
    async getMyRequest(): Promise<DepartmentChangeRequest | null> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('department_change_requests')
            .select(`
                *,
                current_dept:current_department_id (name),
                requested_dept:requested_department_id (name)
            `)
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        return data as DepartmentChangeRequest | null;
    },

    /**
     * Fetch pending requests for a specific department or all (if admin)
     */
    async getPendingRequests(departmentId?: string) {
        let query = supabase
            .from('department_change_requests')
            .select(`
                *,
                current_dept:current_department_id (name),
                requested_dept:requested_department_id (name)
            `)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (departmentId) {
            query = query.eq('current_department_id', departmentId);
        }

        const { data, error } = await query;
        if (error) throw error;
        const requests = (data || []) as DepartmentChangeRequest[];

        // Enrich with profile data (user_id → auth.users, so we join profiles via auth_user_id)
        if (requests.length > 0) {
            const userIds = requests.map(r => r.user_id);
            const { data: profiles } = await supabase
                .from('profiles')
                .select('auth_user_id, first_name, last_name, avatar_url')
                .in('auth_user_id', userIds);

            if (profiles) {
                const profileMap = new Map(profiles.map(p => [p.auth_user_id, p]));
                return requests.map(r => ({
                    ...r,
                    profiles: profileMap.get(r.user_id) || null
                })) as DepartmentChangeRequest[];
            }
        }

        return requests;
    },

    /**
     * Fetch all requests for the current student (history)
     */
    async getMyHistory() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('department_change_requests')
            .select(`
                *,
                current_dept:current_department_id (name),
                requested_dept:requested_department_id (name)
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as DepartmentChangeRequest[];
    },

    /**
     * Action a pending request (Approve/Reject)
     */
    async actionRequest(requestId: string, status: 'approved' | 'rejected', remarks?: string) {
        const { data: { user: approver } } = await supabase.auth.getUser();
        if (!approver) throw new Error("Not authenticated");

        const { data: request, error: fetchError } = await supabase
            .from('department_change_requests')
            .select('user_id, requested_department_id')
            .eq('id', requestId)
            .single();

        if (fetchError) throw fetchError;

        const { error } = await supabase
            .from('department_change_requests')
            .update({
                status,
                remarks: remarks || null,
                actioned_by: approver.id
            })
            .eq('id', requestId);

        if (error) throw error;

        // If approved, update the student's profile with the new department
        if (status === 'approved') {
            // Fetch the new department name
            const { data: dept } = await supabase
                .from('departments')
                .select('name')
                .eq('id', request.requested_department_id)
                .single();

            // Update profile: both department_id and the text department field
            await supabase
                .from('profiles')
                .update({
                    department_id: request.requested_department_id,
                    department: dept?.name ?? null
                })
                .eq('auth_user_id', request.user_id);
        }

        // Notify the student about the decision
        try {
            await notificationService.createNotification(
                request.user_id,
                `Dept Change ${status.charAt(0).toUpperCase() + status.slice(1)}`,
                `Your department transfer request has been ${status}.${remarks ? ` Remarks: ${remarks}` : ''}`,
                status === 'approved' ? 'success' : 'danger'
            );
        } catch (err) {
            console.error("Failed to notify student:", err);
        }

        // Audit Log
        await adminService.logAction(
            `department_request_${status}`,
            'department_change_requests',
            requestId,
            { status, remarks }
        );

        return true;
    }
};
