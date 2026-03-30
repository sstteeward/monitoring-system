import { supabase } from '../lib/supabaseClient';
import type { Profile } from './profileService';

export interface Feedback {
    id: string;
    user_id: string;
    type: 'bug' | 'suggestion' | 'other';
    content: string;
    status: 'new' | 'reviewed' | 'resolved';
    created_at: string;
    profiles?: Profile; // Joined data
}

export interface SystemSetting {
    key: string;
    value: any;
    description: string;
}

export interface Department {
    id: string;
    name: string;
    description: string;
}

export interface Course {
    id: string;
    name: string;
    description?: string;
}

export interface AuditLog {
    id: string;
    user_id: string;
    action: string;
    table_name: string;
    record_id: string;
    details: any;
    ip_address: string;
    created_at: string;
    profiles?: Profile; // Joined
}

export const adminService = {
    /**
     * Fetch all profiles (students, coordinators, and admins)
     */
    async getAllProfiles() {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('last_name', { ascending: true });

        if (error) {
            console.error("Error fetching all profiles:", error);
            throw error;
        }

        return data as Profile[];
    },

    /**
     * Search for profiles by name or email
     */
    async searchProfiles(query: string) {
        if (!query || query.length < 2) return [];

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
            .order('last_name', { ascending: true })
            .limit(10);

        if (error) {
            console.error("Error searching profiles:", error);
            throw error;
        }

        return data as Profile[];
    },

    /**
     * Fetch all coordinators
     */
    async getAllCoordinators() {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('account_type', 'coordinator')
            .order('last_name', { ascending: true });

        if (error) {
            console.error("Error fetching coordinators:", error);
            throw error;
        }

        return data as Profile[];
    },

    /**
     * Update a user's role/account_type
     */
    async updateUserRole(userId: string, role: 'student' | 'coordinator' | 'admin') {
        const { error } = await supabase
            .rpc('admin_update_user_role', { target_user_id: userId, new_role: role });

        if (error) {
            console.error("Error updating user role:", error);
            throw error;
        }

        return true;
    },

    /**
     * Update a user's permissions (JSONB)
     */
    async updateUserPermissions(userId: string, permissions: any) {
        const { error } = await supabase
            .rpc('admin_update_user_permissions', { target_user_id: userId, new_permissions: permissions });

        if (error) {
            console.error("Error updating permissions:", error);
            throw error;
        }
        return true;
    },

    /**
     * Set a user's active status
     */
    async setUserActiveStatus(userId: string, isActive: boolean) {
        const { error } = await supabase
            .rpc('admin_update_user_status', { target_user_id: userId, new_status: isActive });

        if (error) {
            console.error("Error updating active status:", error);
            throw error;
        }
        return true;
    },

    /**
     * Delete a user's account permanently
     */
    async deleteUserAccount(userId: string) {
        const { error } = await supabase
            .rpc('admin_delete_user', { target_user_id: userId });

        if (error) {
            console.error("Error deleting user account:", error);
            throw error;
        }
        return true;
    },

    /**
     * Reset a user's failed login attempts or unlock account
     */
    async unlockUserAccount(userId: string) {
        const { error } = await supabase
            .rpc('admin_unlock_user_account', { target_user_id: userId });

        if (error) {
            console.error("Error unlocking account:", error);
            throw error;
        }
        return true;
    },

    /**
     * Fetch system stats
     */
    async getSystemStats() {
        const [
            { count: studentCount },
            { count: coordinatorCount },
            { count: companyCount },
            { count: departmentCount },
            { count: totalLogs },
            { count: pendingDocs },
            { count: pendingJournals },
            { count: pendingDeptRequests }
        ] = await Promise.all([
            supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('account_type', 'student'),
            supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('account_type', 'coordinator'),
            supabase.from('companies').select('*', { count: 'exact', head: true }),
            supabase.from('departments').select('*', { count: 'exact', head: true }),
            supabase.from('audit_logs').select('*', { count: 'exact', head: true }),
            supabase.from('student_documents').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.from('daily_journals').select('*', { count: 'exact', head: true }).eq('approval_status', 'pending'),
            supabase.from('department_change_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending')
        ]);

        return {
            studentCount: studentCount || 0,
            coordinatorCount: coordinatorCount || 0,
            companyCount: companyCount || 0,
            departmentCount: departmentCount || 0,
            totalLogs: totalLogs || 0,
            pendingApprovalsCount: (pendingDocs || 0) + (pendingJournals || 0) + (pendingDeptRequests || 0)
        };
    },

    /**
     * Get system health metrics
     */
    async getSystemHealth() {
        const start = performance.now();
        // Ping to check latency
        await supabase.from('system_settings').select('key').limit(1);
        const latency = Math.round(performance.now() - start);

        // Active users today (from timesheets)
        const todayStr = new Date().toISOString().split('T')[0];
        const { data: activeUsers } = await supabase
            .from('timesheets')
            .select('user_id')
            .gte('clock_in', `${todayStr}T00:00:00Z`);

        const uniqueActiveUsers = new Set(activeUsers?.map(t => t.user_id)).size;

        // DB Size proxy (row counts)
        const { count: docCount } = await supabase.from('student_documents').select('*', { count: 'exact', head: true });
        const { count: timesheetCount } = await supabase.from('timesheets').select('*', { count: 'exact', head: true });
        const { count: logCount } = await supabase.from('audit_logs').select('*', { count: 'exact', head: true });

        return {
            status: latency < 1000 ? 'healthy' : 'degraded',
            latencyMs: latency,
            activeUsersToday: uniqueActiveUsers,
            dbRows: (docCount ?? 0) + (timesheetCount ?? 0) + (logCount ?? 0),
            lastChecked: new Date().toISOString()
        };
    },

    /**
     * Fetch all feedback with user profiles
     */
    async getFeedback() {
        const { data, error } = await supabase
            .from('feedback')
            .select(`
                *,
                profiles (
                    first_name,
                    last_name,
                    email,
                    account_type
                )
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching feedback:", error);
            throw error;
        }

        return data as Feedback[];
    },

    /**
     * Count new feedback entries
     */
    async getNewFeedbackCount() {
        const { count, error } = await supabase
            .from('feedback')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'new');

        if (error) {
            console.error("Error counting new feedback:", error);
            return 0;
        }

        return count || 0;
    },

    /**
     * Update feedback status
     */
    async updateFeedbackStatus(id: string, status: 'new' | 'reviewed' | 'resolved') {
        const { error } = await supabase
            .from('feedback')
            .update({ status })
            .eq('id', id);

        if (error) {
            console.error("Error updating feedback status:", error);
            throw error;
        }

        return true;
    },

    // --- Enterprise Features: System Settings ---
    async getSystemSettings() {
        const { data, error } = await supabase
            .from('system_settings')
            .select('*')
            .order('key', { ascending: true });

        if (error) {
            console.error("Error fetching system settings:", error);
            // Don't throw if table doesn't exist yet (before migration)
            return [];
        }

        return data as SystemSetting[];
    },

    async updateSystemSetting(key: string, value: any) {
        const { error } = await supabase
            .from('system_settings')
            .update({ value, updated_at: new Date().toISOString() })
            .eq('key', key);

        if (error) {
            console.error(`Error updating system setting ${key}:`, error);
            throw error;
        }

        // --- Audit Log: Update Setting ---
        await this.logAction('update_setting', 'system_settings', key, { new_value: value });

        return true;
    },

    // --- Enterprise Features: Departments ---
    async getDepartments() {
        const { data, error } = await supabase
            .from('departments')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            // Might not exist yet
            return [];
        }
        return data as Department[];
    },

    async createDepartment(name: string, description: string) {
        const { data, error } = await supabase
            .from('departments')
            .insert([{ name, description }])
            .select()
            .single();

        if (error) throw error;
        await this.logAction('create_department', 'departments', data.id, { name, description });
        return data as Department;
    },

    // --- Courses ---
    async getCourses() {
        const { data, error } = await supabase
            .from('courses')
            .select('*')
            .order('name', { ascending: true });
        if (error) return [];
        return data as Course[];
    },

    async createCourse(name: string, description?: string) {
        const { data, error } = await supabase
            .from('courses')
            .insert([{ name, description }])
            .select()
            .single();
        if (error) throw error;
        await this.logAction('create_course', 'courses', data.id, { name });
        return data as Course;
    },

    async deleteCourse(id: string, name: string) {
        const { error } = await supabase.from('courses').delete().eq('id', id);
        if (error) throw error;
        await this.logAction('delete_course', 'courses', id, { name });
    },

    // --- Enterprise Features: Audit Logging ---
    async logAction(action: string, table_name: string, record_id: string | null = null, details: any = null) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            await supabase.from('audit_logs').insert([{
                user_id: session.user.id,
                action,
                table_name,
                record_id,
                details
            }]);
        } catch (e) {
            console.error("Failed to insert audit log", e);
        }
    },

    async getAuditLogs() {
        const { data, error } = await supabase
            .from('audit_logs')
            .select(`
                *,
                profiles (
                    first_name,
                    last_name,
                    email,
                    account_type
                )
            `)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error("Error fetching audit logs:", error);
            return [];
        }

        return data as AuditLog[];
    }
};


