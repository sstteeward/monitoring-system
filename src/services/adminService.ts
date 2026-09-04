import { supabase } from '../lib/supabaseClient';
import type { Profile } from './profileService';
import { createAuditLog } from './auditService';

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
    /**
     * The abbreviation, and the value that profiles.course and
     * sections.course_code actually store. Those columns reference a course by
     * text rather than by foreign key, so the code — never the name — is the
     * stable identity. Renaming a course must leave this untouched.
     */
    code: string;
    description?: string | null;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

/** How many live records point at a given course code. */
export interface CourseUsage {
    /** Student profiles only — what the "Students" column shows. */
    students: number;
    /** Every profile, students plus advisers/coordinators. */
    profiles: number;
    /** Rows in `sections` whose course_code matches. */
    sections: number;
    /** True when anything at all references the course. */
    inUse: boolean;
}

/** Codes are matched case-insensitively and trim-insensitively everywhere. */
const normaliseCode = (value: string | null | undefined) => (value ?? '').trim().toUpperCase();

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
    async updateUserRole(userId: string, role: 'student' | 'coordinator' | 'admin' | 'company') {
        const { error } = await supabase
            .rpc('admin_update_user_role', { target_user_id: userId, new_role: role });

        if (error) {
            console.error("Error updating user role:", error);
            throw error;
        }

        return true;
    },

    /**
     * Set or clear a user's company_id association
     */
    async setUserCompany(userId: string, companyId: string | null) {
        const { error } = await supabase
            .from('profiles')
            .update({ company_id: companyId })
            .eq('auth_user_id', userId);

        if (error) {
            console.error("Error setting user company:", error);
            throw error;
        }
        return true;
    },

    /**
     * Get all companies for dropdown
     */
    async getAllCompanies() {
        const { data, error } = await supabase
            .from('companies')
            .select('id, name')
            .order('name');

        if (error) {
            console.error("Error fetching companies:", error);
            return [];
        }
        return data;
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

    async updateDepartment(id: string, name: string, description: string) {
        const { data, error } = await supabase
            .from('departments')
            .update({ name, description })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        await this.logAction('update_department', 'departments', id, { name, description });
        return data as Department;
    },

    // --- Courses ---
    async getCourses() {
        const { data, error } = await supabase
            .from('courses')
            .select('*')
            .order('name', { ascending: true });
        if (error) return [];
        // `code` and `is_active` were added after the table shipped; default
        // them here so a client running against an un-migrated database still
        // renders instead of blanking the course list.
        return (data || []).map((row: any) => ({
            ...row,
            code: row.code ?? row.description ?? row.name,
            is_active: row.is_active ?? true,
        })) as Course[];
    },

    /**
     * Courses offered to a student picking one for the first time.
     *
     * Deactivating a course withdraws it from new selections only — it stays in
     * the table and keeps serving every record that already references it, so
     * `keepCode` re-admits the value a profile has already saved and nothing is
     * silently dropped from a half-finished onboarding form.
     */
    async getSelectableCourses(keepCode?: string | null) {
        const courses = await this.getCourses();
        const keep = normaliseCode(keepCode);
        return courses.filter(c => c.is_active !== false || (!!keep && normaliseCode(c.code) === keep));
    },

    /**
     * Counts the records pointing at each course code, keyed by upper-cased
     * code. Both link columns are plain text, so this is the only way to know
     * whether a course is safe to delete.
     */
    async getCourseUsage(): Promise<Record<string, CourseUsage>> {
        const [{ data: profiles }, { data: sections }] = await Promise.all([
            supabase.from('profiles').select('course, account_type'),
            supabase.from('sections').select('course_code'),
        ]);

        const usage: Record<string, CourseUsage> = {};
        const bucket = (code: string) => {
            if (!usage[code]) usage[code] = { students: 0, profiles: 0, sections: 0, inUse: false };
            return usage[code];
        };

        for (const p of profiles || []) {
            const code = normaliseCode((p as any).course);
            if (!code) continue;
            const entry = bucket(code);
            entry.profiles += 1;
            if ((p as any).account_type === 'student') entry.students += 1;
            entry.inUse = true;
        }

        for (const s of sections || []) {
            const code = normaliseCode((s as any).course_code);
            if (!code) continue;
            const entry = bucket(code);
            entry.sections += 1;
            entry.inUse = true;
        }

        return usage;
    },

    async createCourse(input: { name: string; code: string; description?: string | null; isActive?: boolean }) {
        const { data, error } = await supabase
            .from('courses')
            .insert([{
                name: input.name.trim(),
                code: input.code.trim().toUpperCase(),
                description: input.description?.trim() || null,
                is_active: input.isActive ?? true,
            }])
            .select()
            .single();
        if (error) throw error;
        await this.logAction('create_course', 'courses', data.id, { name: data.name });
        return data as Course;
    },

    /**
     * Updates a course in place. The row id is the key, so renaming is safe:
     * only `code` is referenced by other tables, and changing it is what the
     * caller must guard against (see AdminCoursesView's in-use check).
     */
    async updateCourse(id: string, input: { name: string; code: string; description?: string | null; isActive: boolean }) {
        const { data, error } = await supabase
            .from('courses')
            .update({
                name: input.name.trim(),
                code: input.code.trim().toUpperCase(),
                description: input.description?.trim() || null,
                is_active: input.isActive,
            })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        await this.logAction('update_course', 'courses', id, { name: data.name });
        return data as Course;
    },

    async setCourseStatus(id: string, isActive: boolean, name: string) {
        const { data, error } = await supabase
            .from('courses')
            .update({ is_active: isActive })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        await this.logAction(isActive ? 'activate_course' : 'deactivate_course', 'courses', id, { name, is_active: isActive });
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
            // Map old params to new AuditAction and AuditModule
            let newAction: any = 'UPDATE';
            let newModule: any = 'User Management';
            let targetType = table_name;
            let description = `${action} on ${table_name}`;

            const actUpper = action.toUpperCase();
            if (actUpper.includes('CREATE')) {
                newAction = 'CREATE';
            } else if (actUpper.includes('DELETE')) {
                newAction = 'DELETE';
            } else if (actUpper.includes('LOGIN')) {
                newAction = 'LOGIN';
            } else if (actUpper.includes('LOGOUT')) {
                newAction = 'LOGOUT';
            } else if (actUpper.includes('FAILED')) {
                newAction = 'LOGIN_FAILED';
            } else if (actUpper.includes('APPROVE')) {
                newAction = 'APPROVE';
            } else if (actUpper.includes('REJECT')) {
                newAction = 'REJECT';
            } else if (actUpper.includes('ASSIGN')) {
                newAction = 'ASSIGN';
            } else if (actUpper.includes('UNASSIGN')) {
                newAction = 'UNASSIGN';
            } else if (actUpper.includes('PASSWORD')) {
                newAction = 'PASSWORD_CHANGE';
            } else if (actUpper.includes('ROLE')) {
                newAction = 'ROLE_CHANGE';
            } else if (actUpper.includes('PERMISSION')) {
                newAction = 'PERMISSION_CHANGE';
            } else if (actUpper.includes('STATUS') || actUpper.includes('ACTIVATE') || actUpper.includes('DEACTIVATE') || actUpper.includes('LOCK') || actUpper.includes('UNLOCK')) {
                newAction = 'STATUS_CHANGE';
            } else if (actUpper.includes('UPLOAD')) {
                newAction = 'UPLOAD';
            } else if (actUpper.includes('DOWNLOAD')) {
                newAction = 'DOWNLOAD';
            } else if (actUpper.includes('BACKUP')) {
                newAction = 'BACKUP';
            } else if (actUpper.includes('RESTORE')) {
                newAction = 'RESTORE';
            }

            // Map table_name / action to Module
            if (table_name === 'system_settings') {
                newModule = 'System Settings';
                description = `Updated system setting: ${record_id}`;
            } else if (table_name === 'departments') {
                newModule = 'Departments';
                if (newAction === 'CREATE') description = `Created department: ${details?.name || record_id}`;
                else if (newAction === 'UPDATE') description = `Updated department: ${details?.name || record_id}`;
                else if (newAction === 'DELETE') description = `Deleted department: ${details?.name || record_id}`;
            } else if (table_name === 'courses') {
                newModule = 'Courses';
                if (newAction === 'CREATE') description = `Created course: ${details?.name || record_id}`;
                else if (newAction === 'DELETE') description = `Deleted course: ${details?.name || record_id}`;
                else if (newAction === 'STATUS_CHANGE') {
                    description = `${details?.is_active ? 'Activated' : 'Deactivated'} course: ${details?.name || record_id}`;
                } else if (newAction === 'UPDATE') description = `Updated course: ${details?.name || record_id}`;
            } else if (table_name === 'profiles') {
                if (actUpper.includes('PERMISSION')) {
                    newModule = 'Role Permissions';
                    description = `Updated permissions for user: ${record_id}`;
                } else if (actUpper.includes('ROLE')) {
                    newModule = 'Role Permissions';
                    description = `Updated role for user: ${record_id} to ${details?.account_type || ''}`;
                } else if (actUpper.includes('DELETE_STUDENT') || actUpper.includes('DELETE_ACCOUNT')) {
                    newModule = 'User Management';
                    description = `Deleted user account: ${record_id}`;
                } else if (actUpper.includes('ACTIVATE') || actUpper.includes('DEACTIVATE') || actUpper.includes('STATUS')) {
                    newModule = 'User Management';
                    description = `${actUpper.includes('ACTIVATE') && !actUpper.includes('DEACTIVATE') ? 'Activated' : 'Deactivated'} user account: ${record_id}`;
                } else if (actUpper.includes('UNLOCK')) {
                    newModule = 'User Management';
                    description = `Unlocked user account: ${record_id}`;
                } else if (actUpper.includes('ASSIGN_DEPARTMENT')) {
                    newModule = 'User Management';
                    description = `Assigned department to user ${record_id}: ${details?.department_id || ''}`;
                } else {
                    newModule = 'User Management';
                }
            } else if (table_name === 'multiple' && actUpper.includes('BACKUP')) {
                newModule = 'Backup & Restore';
                description = `Performed system backup of tables: ${details?.tables?.join(', ') || ''}`;
            }

            await createAuditLog({
                action: newAction,
                module: newModule,
                description,
                targetType,
                targetId: record_id || undefined,
                targetName: details?.name || details?.userName || details?.target_name || undefined,
                newValues: details || undefined,
            });
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
    },

    /**
     * Fetch security alerts (Anti-cheat flags)
     * Optional departmentId to filter for coordinator view
     */
    async getSecurityAlerts(departmentId?: string) {
        // Use the RPC function to bypass RLS on the profiles table and fetch joined data
        const { data: rawLogs, error } = await supabase.rpc('admin_get_security_alerts');

        if (error) {
            console.error("Error fetching security alerts via RPC:", error);
            // Fallback if RPC doesn't exist yet
            return await this._getSecurityAlertsFallback(departmentId);
        }

        if (!rawLogs || rawLogs.length === 0) return [];

        // Map the flat RPC result back to the nested structure the UI expects
        let merged = rawLogs.map((log: any) => ({
            id: log.id,
            user_id: log.user_id,
            action: log.action,
            table_name: log.table_name,
            record_id: log.record_id,
            details: log.details,
            ip_address: log.ip_address,
            device_fingerprint: log.device_fingerprint,
            created_at: log.created_at,
            latitude: log.latitude,
            longitude: log.longitude,
            accuracy: log.accuracy,
            distance_from_geofence: log.distance_from_geofence,
            location_address: log.location_address,
            map_url: log.map_url,
            profiles: log.user_id ? {
                first_name: log.profile_first_name,
                last_name: log.profile_last_name,
                email: log.profile_email,
                account_type: log.profile_account_type,
                department_id: log.profile_department_id,
                company_id: log.profile_company_id
            } : null
        }));

        // Filter by department if provided (coordinator scoping)
        if (departmentId) {
            merged = await this._filterByDepartment(merged, departmentId);
        }

        return merged;
    },

    async _getSecurityAlertsFallback(departmentId?: string) {
        const { data: rawLogs, error: rawError } = await supabase
            .from('audit_logs')
            .select('*')
            .eq('action', 'anti_cheat_flag')
            .order('created_at', { ascending: false })
            .limit(200);

        if (rawError) return [];
        if (!rawLogs || rawLogs.length === 0) return [];

        const userIds = [...new Set(rawLogs.map((l: any) => l.user_id).filter(Boolean))];
        let profileMap: Record<string, any> = {};

        if (userIds.length > 0) {
            const { data: profilesData } = await supabase
                .from('profiles')
                .select('auth_user_id, first_name, last_name, email, account_type, department_id, company_id')
                .in('auth_user_id', userIds);

            if (profilesData) {
                profilesData.forEach((p: any) => { profileMap[p.auth_user_id] = p; });
            }
        }

        let merged = rawLogs.map((log: any) => ({
            ...log,
            profiles: profileMap[log.user_id] || null,
        }));

        if (departmentId) {
            merged = await this._filterByDepartment(merged, departmentId);
        }

        return merged;
    },

    /** Helper: filter security alerts by coordinator's department/handled companies */
    async _filterByDepartment(alerts: any[], departmentId: string) {
        let handledCompanyIds: string[] = [];
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: handledData } = await supabase
                .from('coordinator_handled_companies')
                .select('company_id')
                .eq('coordinator_id', user.id);
            if (handledData) {
                handledCompanyIds = handledData.map(h => h.company_id);
            }
        }

        return alerts.filter(log => {
            const isSameDepartment = log.profiles?.department_id === departmentId;
            const isHandledCompany = log.profiles?.company_id && handledCompanyIds.includes(log.profiles.company_id);
            return isSameDepartment || isHandledCompany;
        });
    },

    /**
     * Fetch device fingerprint history for a user
     */
    async getDeviceHistory(userId: string) {
        const { data, error } = await supabase
            .from('device_fingerprints')
            .select('*')
            .eq('user_id', userId)
            .order('last_seen_at', { ascending: false });

        if (error) {
            console.error('[AdminService] Error fetching device history:', error);
            return [];
        }

        return data;
    }
};


