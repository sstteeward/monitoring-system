import { supabase } from '../lib/supabaseClient';
import type { GeoJSONPolygon } from '../utils/geoUtils';
import type { Profile } from './profileService';
import type { Timesheet } from './timeTracking';
import { notificationService } from './notificationService';
import { createAuditLog } from './auditService';
import { canonicalSectionName } from '../utils/sections';
import { EMAIL_ALREADY_REGISTERED_MESSAGE, isDuplicateEmailError, normalizeEmail } from '../utils/email';

/**
 * Student head count per canonical section name (upper-cased, e.g. "DIT-1A").
 *
 * `profiles.section` is not reliably the full section name — older records hold
 * just the letter with the course code and year level in their own columns — so
 * counting has to resolve each profile rather than match `sections.name`
 * directly. Matching directly is what made every section report 0 students.
 */
async function countStudentsBySection(): Promise<Record<string, number>> {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, section, course, year_level')
        .eq('account_type', 'student');

    if (error) {
        console.error('Error counting students by section:', error);
        throw error;
    }

    const counts: Record<string, number> = {};
    (data || []).forEach(p => {
        const canonical = canonicalSectionName(p.section, p.course, p.year_level);
        if (canonical) counts[canonical] = (counts[canonical] || 0) + 1;
    });
    return counts;
}

// Define a type for Daily Journals since it might not be exported from journalService
export interface DailyJournal {
    id: string;
    user_id: string;
    entry_date: string;
    tasks: string;
    learnings: string;
    created_at: string;
    updated_at: string;
}

export interface Company {
    id: string;
    name: string;
    address: string | null;
    contact_person: string | null;
    contact_position?: string | null;
    contact_email: string | null;
    industry: string | null;
    website?: string | null;
    logo_url?: string | null;
    department_id: string | null;
    latitude: number | null;
    longitude: number | null;
    geofence_radius: number | null;
    geofence_polygon: any | null; // GeoJSON FeatureCollection
    geofence_mode: 'circular' | 'polygon' | 'hybrid' | null; // Which mode is active
    department_name?: string; // virtual, from join
    created_at: string;
    updated_at: string;
    intern_count?: number; // virtual, populated by query joins
    is_handled?: boolean; // virtual, from junction table
}

export interface CompanyRequest {
    id: string;
    name: string;
    requested_by: string | null;
    student_name: string | null;
    request_type?: 'student_company' | 'company_account';
    contact_email?: string | null;
    contact_phone?: string | null;
    address?: string | null;
    industry?: string | null;
    website?: string | null;
    description?: string | null;
    position?: string | null;
    logo_url?: string | null;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
    latitude?: number | null;
    longitude?: number | null;
    geofence_radius?: number | null;
    geofence_polygon?: GeoJSONPolygon | null;
}

const defaultPermissions: Record<string, boolean> = {
    can_approve_journals: true,
    can_export_reports: true,
    can_delete_students: false
};

async function checkPermission(permissionKey: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: profile } = await supabase
        .from('profiles')
        .select('account_type, permissions')
        .eq('auth_user_id', user.id)
        .single();

    if (!profile) return false;

    // Admins have all permissions implicitly
    if (profile.account_type === 'admin') return true;

    // Check specific permission for coordinators
    if (!profile.permissions) return defaultPermissions[permissionKey] ?? true;
    
    // Parse if it's a string somehow
    let perms = profile.permissions;
    if (typeof perms === 'string') {
        try { perms = JSON.parse(perms); } catch (e) { perms = {}; }
    }
    
    return perms[permissionKey] !== undefined && perms[permissionKey] !== null
        ? !!perms[permissionKey] 
        : (defaultPermissions[permissionKey] ?? true);
}

export const coordinatorService = {
    /**
     * Fetch all students (profiles where account_type = 'student')
     */
    async getAllStudents(departmentId?: string) {
        let query = supabase
            .from('profiles')
            .select('*')
            .eq('account_type', 'student');
        
        if (departmentId) {
            query = query.eq('department_id', departmentId);
        }

        const { data, error } = await query
            .order('last_name', { ascending: true });

        if (error) {
            console.error("Error fetching students list:", error);
            throw error;
        }

        const students = data as Profile[];

        // Map company names to students
        const { data: companiesData } = await supabase.from('companies').select('id, name');
        if (companiesData) {
            const companyMap = new Map(companiesData.map((c: any) => [c.id, c.name]));
            students.forEach(s => {
                if (s.company_id) {
                    s.company = { name: companyMap.get(s.company_id) || 'Unknown' };
                }
            });
        }

        // Map department names to students
        const { data: departmentsData } = await supabase.from('departments').select('id, name');
        if (departmentsData) {
            const deptMap = new Map(departmentsData.map((d: any) => [d.id, d.name]));
            students.forEach(s => {
                if (s.department_id) {
                    s.department_info = { name: deptMap.get(s.department_id) || 'Unknown' };
                }
            });
        }

        return students;
    },

    /**
     * Fetch all pending documents across all students, with profile info merged in
     */
    async getPendingDocuments(departmentId?: string) {
        // Step 1: fetch pending documents
        const { data: docs, error: docsError } = await supabase
            .from('student_documents')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (docsError) {
            console.error("Error fetching pending documents:", docsError);
            throw docsError;
        }

        if (!docs || docs.length === 0) return [];

        // Step 2: collect unique user_ids and fetch matching profiles
        const userIds = [...new Set(docs.map((d: any) => d.user_id))];
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('auth_user_id, first_name, last_name, email, department_id')
            .in('auth_user_id', userIds);

        if (profilesError) {
            console.error("Error fetching profiles for documents:", profilesError);
            throw profilesError;
        }

        let filteredProfiles = profiles ?? [];
        if (departmentId) {
            filteredProfiles = filteredProfiles.filter(p => p.department_id === departmentId);
        }

        // Step 3: merge — attach profile info onto each document
        const profileMap: Record<string, any> = {};
        filteredProfiles.forEach((p: any) => { profileMap[p.auth_user_id] = p; });

        return docs
            .filter((d: any) => profileMap[d.user_id]) // Only keep docs for students in the filteredProfiles
            .map((j: any) => ({
                ...j,
                profiles: profileMap[j.user_id] ?? null,
            }));
    },

    /**
     * Approve or reject a document
     */
    async updateDocumentStatus(documentId: string, status: 'approved' | 'rejected') {
        const hasPermission = await checkPermission('can_approve_journals');
        if (!hasPermission) throw new Error("You do not have permission to approve/reject journals.");

        const { error } = await supabase
            .from('student_documents')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', documentId);

        if (error) {
            console.error(`Error updating document to ${status}:`, error);
            throw error;
        }

        try {
            await createAuditLog({
                action: status === 'approved' ? 'APPROVE' : 'REJECT',
                module: 'Documents',
                description: `${status === 'approved' ? 'Approved' : 'Rejected'} student document`,
                targetType: 'student_document',
                targetId: documentId,
            });
        } catch {}

        return true;
    },

    /**
     * Fetch all pending journals across all students
     */
    async getPendingJournals(departmentId?: string) {
        // Step 1: fetch pending journals
        const { data: journals, error: journalsError } = await supabase
            .from('daily_journals')
            .select('*')
            .eq('approval_status', 'pending')
            .order('created_at', { ascending: false });

        if (journalsError) {
            console.error("Error fetching pending journals:", journalsError);
            throw journalsError;
        }

        if (!journals || journals.length === 0) return [];

        // Step 2: collect unique user_ids and fetch matching profiles
        const userIds = [...new Set(journals.map((d: any) => d.user_id))];
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('auth_user_id, first_name, last_name, email, department_id')
            .in('auth_user_id', userIds);

        if (profilesError) {
            console.error("Error fetching profiles for journals:", profilesError);
            throw profilesError;
        }

        let filteredProfiles = profiles ?? [];
        if (departmentId) {
            filteredProfiles = filteredProfiles.filter(p => p.department_id === departmentId);
        }

        // Step 3: merge — attach profile info onto each journal
        const profileMap: Record<string, any> = {};
        filteredProfiles.forEach((p: any) => { profileMap[p.auth_user_id] = p; });

        return journals
            .filter((j: any) => profileMap[j.user_id])
            .map((j: any) => ({
                ...j,
                profiles: profileMap[j.user_id] ?? null,
            }));
    },

    /**
     * Approve or reject a journal
     */
    async updateJournalStatus(journalId: string, status: 'approved' | 'rejected') {
        const hasPermission = await checkPermission('can_approve_journals');
        if (!hasPermission) throw new Error("You do not have permission to approve/reject journals.");

        const { error } = await supabase
            .from('daily_journals')
            .update({ approval_status: status, updated_at: new Date().toISOString() })
            .eq('id', journalId);

        if (error) {
            console.error(`Error updating journal to ${status}:`, error);
            throw error;
        }

        try {
            await createAuditLog({
                action: status === 'approved' ? 'APPROVE' : 'REJECT',
                module: 'Journals',
                description: `${status === 'approved' ? 'Approved' : 'Rejected'} daily journal entry`,
                targetType: 'daily_journal',
                targetId: journalId,
            });
        } catch {}

        return true;
    },

    /**
     * Fetch all pending timesheets across all students
     */
    async getPendingTimesheets(departmentId?: string) {
        const { data: timesheets, error: timesheetsError } = await supabase
            .from('timesheets')
            .select('*')
            .eq('status', 'completed')
            .eq('approval_status', 'pending')
            .order('clock_out', { ascending: false });

        if (timesheetsError) {
            console.error("Error fetching pending timesheets:", timesheetsError);
            throw timesheetsError;
        }

        if (!timesheets || timesheets.length === 0) return [];

        const userIds = [...new Set(timesheets.map((d: any) => d.user_id))];
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('auth_user_id, first_name, last_name, email, department_id')
            .in('auth_user_id', userIds);

        if (profilesError) {
            console.error("Error fetching profiles for timesheets:", profilesError);
            throw profilesError;
        }

        let filteredProfiles = profiles ?? [];
        if (departmentId) {
            filteredProfiles = filteredProfiles.filter(p => p.department_id === departmentId);
        }

        const profileMap: Record<string, any> = {};
        filteredProfiles.forEach((p: any) => { profileMap[p.auth_user_id] = p; });

        return timesheets
            .filter((ts: any) => profileMap[ts.user_id])
            .map((ts: any) => ({
                ...ts,
                profiles: profileMap[ts.user_id] ?? null,
            }));
    },

    /**
     * Approve or reject a timesheet
     */
    async updateTimesheetStatus(timesheetId: string, status: 'approved' | 'rejected') {
        const hasPermission = await checkPermission('can_approve_journals');
        if (!hasPermission) throw new Error("You do not have permission to approve/reject timesheets.");

        const { error } = await supabase
            .from('timesheets')
            .update({ approval_status: status })
            .eq('id', timesheetId);

        if (error) {
            console.error(`Error updating timesheet to ${status}:`, error);
            throw error;
        }

        try {
            await createAuditLog({
                action: status === 'approved' ? 'APPROVE' : 'REJECT',
                module: 'Attendance',
                description: `${status === 'approved' ? 'Approved' : 'Rejected'} student timesheet`,
                targetType: 'timesheet',
                targetId: timesheetId,
            });
        } catch {}

        return true;
    },

    /**
     * Fetch timesheets for a specific student
     */
    async getStudentTimesheets(studentId: string) {
        const { data, error } = await supabase
            .from('timesheets')
            .select('*')
            .eq('user_id', studentId)
            .order('clock_in', { ascending: false });

        if (error) {
            console.error("Error fetching student timesheets:", error);
            throw error;
        }

        return data as Timesheet[];
    },

    /**
     * Fetch daily journals for a specific student
     */
    async getStudentJournals(studentId: string) {
        const { data, error } = await supabase
            .from('daily_journals')
            .select('*')
            .eq('user_id', studentId)
            .order('entry_date', { ascending: false });

        if (error) {
            console.error("Error fetching student journals:", error);
            throw error;
        }

        return data as DailyJournal[];
    },

    // ─── Company Methods ───────────────────────────────────────────────

    /**
     * Fetch all companies with department info and handled status
     */
    async getAllCompanies() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // 1. Fetch companies and join with department name if possible
        const { data: companiesData, error: compError } = await supabase
            .from('companies')
            .select('*, departments(name)')
            .order('name', { ascending: true });

        if (compError) {
            console.error("Error fetching companies:", compError);
            throw compError;
        }

        // 2. Fetch handled companies for this coordinator
        const { data: handledData } = await supabase
            .from('coordinator_handled_companies')
            .select('company_id')
            .eq('coordinator_id', user.id);

        const handledIds = new Set((handledData ?? []).map(h => h.company_id));

        // 3. Count interns for each company
        const { data: profileCounts } = await supabase
            .from('profiles')
            .select('company_id')
            .eq('account_type', 'student')
            .not('company_id', 'is', null);

        const internCounts: Record<string, number> = {};
        if (profileCounts) {
            profileCounts.forEach(p => {
                if (p.company_id) internCounts[p.company_id] = (internCounts[p.company_id] || 0) + 1;
            });
        }

        // 4. Transform data
        return (companiesData as any[]).map(c => ({
            ...c,
            department_name: c.departments?.name || 'Uncategorized',
            intern_count: internCounts[c.id] || 0,
            is_handled: handledIds.has(c.id)
        })) as Company[];
    },

    /**
     * Toggle whether a coordinator is handling a company
     */
    async toggleCompanyHandling(companyId: string, isHandling: boolean) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        if (isHandling) {
            const { error } = await supabase
                .from('coordinator_handled_companies')
                .insert([{ coordinator_id: user.id, company_id: companyId }]);
            if (error && error.code !== '23505') throw error; // ignore duplicate key
        } else {
            const { error } = await supabase
                .from('coordinator_handled_companies')
                .delete()
                .eq('coordinator_id', user.id)
                .eq('company_id', companyId);
            if (error) throw error;
        }
        return true;
    },

    /**
     * Fetch all departments (utility for dropdowns)
     */
    async getAllDepartments() {
        const { data, error } = await supabase
            .from('departments')
            .select('id, name')
            .order('name', { ascending: true });
        
        if (error) throw error;
        return data as { id: string; name: string }[];
    },

    /**
     * Fetch students assigned to a particular company
     */
    async getStudentsByCompany(companyId: string) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('account_type', 'student')
            .eq('company_id', companyId)
            .order('last_name', { ascending: true });

        if (error) {
            console.error("Error fetching students by company:", error);
            throw error;
        }

        return data as Profile[];
    },

    /**
     * Assign a student to a company (or unassign with null)
     */
    async assignStudentToCompany(studentId: string, companyId: string | null) {
        const { error } = await supabase
            .from('profiles')
            .update({ company_id: companyId })
            .eq('id', studentId);

        if (error) {
            console.error("Error assigning student to company:", error);
            throw error;
        }

        try {
            await createAuditLog({
                action: companyId ? 'ASSIGN' : 'UNASSIGN',
                module: 'Students',
                description: companyId ? `Assigned student to company: ${companyId}` : 'Unassigned student from company',
                targetType: 'student',
                targetId: studentId,
            });
        } catch {}

        return true;
    },

    /**
     * Create a new company
     */
    async createCompany(company: Omit<Company, 'id' | 'created_at' | 'updated_at' | 'intern_count'>) {
        const { data, error } = await supabase
            .from('companies')
            .insert([company])
            .select()
            .single();

        if (error) {
            console.error("Error creating company:", error);
            throw error;
        }

        try {
            await createAuditLog({
                action: 'CREATE',
                module: 'Companies',
                description: `Created new company: ${data.name}`,
                targetType: 'company',
                targetId: data.id,
                targetName: data.name,
                newValues: data,
            });
        } catch {}

        return data as Company;
    },

    /**
     * Update an existing company
     */
    async updateCompany(companyId: string, updates: Partial<Company>) {
        const { data, error } = await supabase
            .from('companies')
            .update(updates)
            .eq('id', companyId)
            .select()
            .single();

        if (error) {
            console.error("Error updating company:", error);
            throw error;
        }

        try {
            await createAuditLog({
                action: 'UPDATE',
                module: 'Companies',
                description: `Updated company details for ${data.name || companyId}`,
                targetType: 'company',
                targetId: companyId,
                targetName: data.name,
                newValues: updates,
            });
        } catch {}

        return data as Company;
    },

    /**
     * Delete a student
     */
    async deleteStudent(studentId: string) {
        const hasPermission = await checkPermission('can_delete_students');
        if (!hasPermission) throw new Error("You do not have permission to delete students.");

        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', studentId);

        if (error) {
            console.error("Error deleting student:", error);
            throw error;
        }

        try {
            await createAuditLog({
                action: 'DELETE',
                module: 'Students',
                description: `Deleted student: ${studentId}`,
                targetType: 'student',
                targetId: studentId,
            });
        } catch {}

        return true;
    },

    // ─── Company Request Methods ────────────────────────────────────────

    /**
     * Fetch all pending company requests
     */
    async getPendingCompanyRequests() {
        const { data, error } = await supabase
            .from('company_requests')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching company requests:', error);
            throw error;
        }

        return (data ?? []) as CompanyRequest[];
    },

    /**
     * Approve a company request: create the real company then mark ALL requests
     * with the same name (case-insensitive) as approved to avoid duplicates.
     */
    async approveCompanyRequest(name: string, options?: { department_id?: string, handle_company?: boolean }) {
        // 0. Fetch the pending requests matching this name to extract geofence details and student IDs
        const { data: requests, error: fetchReqErr } = await supabase
            .from('company_requests')
            .select('*')
            .eq('status', 'pending')
            .ilike('name', name);

        if (fetchReqErr) {
            console.error('Error fetching company requests:', fetchReqErr);
            throw fetchReqErr;
        }

        // We will use the geofence details from the first request that has them (if any)
        const requestWithGeofence = requests?.find(req => req.latitude || req.geofence_polygon);

        // 1. Check if a company with this name already exists (case-insensitive)
        const { data: existing } = await supabase
            .from('companies')
            .select('*')
            .ilike('name', name)
            .limit(1)
            .maybeSingle();

        let company: Company;

        if (existing) {
            // Company already exists — reuse it, don't create a duplicate
            company = existing as Company;
            if (options?.department_id) {
                const { error: updateErr } = await supabase.from('companies').update({ department_id: options.department_id }).eq('id', company.id);
                if (updateErr) console.error('Error updating company department:', updateErr);
            }
        } else {
            // Insert a new company with the geofence data from the request
            const insertPayload: Partial<Company> = { 
                name,
                department_id: options?.department_id || null
            };
            if (requestWithGeofence) {
                insertPayload.latitude = requestWithGeofence.latitude;
                insertPayload.longitude = requestWithGeofence.longitude;
                insertPayload.geofence_radius = requestWithGeofence.geofence_radius;
                insertPayload.geofence_polygon = requestWithGeofence.geofence_polygon;
                insertPayload.geofence_mode = requestWithGeofence.geofence_polygon ? 'polygon' : 'circular';
            }

            const { data: newCompany, error: createErr } = await supabase
                .from('companies')
                .insert([insertPayload])
                .select()
                .single();

            if (createErr) {
                console.error('Error creating company from request:', createErr);
                throw createErr;
            }
            company = newCompany as Company;
        }

        // 2. Mark ALL pending requests with the same name as approved
        const { error: updateErr } = await supabase
            .from('company_requests')
            .update({ status: 'approved' })
            .eq('status', 'pending')
            .ilike('name', name); // case-insensitive match

        if (updateErr) {
            console.error('Error batch-approving company requests:', updateErr);
            throw updateErr;
        }

        // 3. Handle the company if requested
        if (options?.handle_company) {
            try {
                await this.toggleCompanyHandling(company.id, true);
                company.is_handled = true;
            } catch (err) {
                console.error('Error auto-handling company:', err);
            }
        }

        // 3. Auto-assign the requesting students to this new company & notify them
        if (requests && requests.length > 0) {
            const studentIds = requests.map(req => req.requested_by).filter(Boolean);
            if (studentIds.length > 0) {
                // Update their profiles
                const { data: assignedRows, error: profileErr } = await supabase
                    .from('profiles')
                    .update({ company_id: company.id })
                    .in('auth_user_id', studentIds)
                    .select('auth_user_id');

                if (profileErr) {
                    console.error('Error auto-assigning students to company:', profileErr);
                }

                const assignedIds = new Set((assignedRows ?? []).map(row => row.auth_user_id));
                const missingIds = studentIds.filter(id => !assignedIds.has(id));
                if (missingIds.length > 0) {
                    const { error: rpcError } = await supabase.rpc('assign_profile_company', {
                        p_user_ids: missingIds,
                        p_company_id: company.id,
                    });
                    if (rpcError) {
                        console.warn('assign_profile_company RPC unavailable or failed:', rpcError);
                    }
                }

                for (const studentId of studentIds) {
                    await notificationService.createNotification(
                        studentId,
                        'Company Request Approved',
                        `Your request to add the company ${name} has been approved! You can now access your dashboard.`,
                        'success',
                        { notificationType: 'company', relatedType: 'company', relatedId: company.id },
                    ).catch(err => console.error('Error sending approval notification:', err));

                }
            }
        }

        return company;
    },

    /**
     * Approve a company self-registration, create the partner record, and
     * connect the applicant's supervisor account to it.
     */
    async approveCompanyAccountRequest(requestId: string, options?: { department_id?: string, handle_company?: boolean }) {
        const { data: request, error: requestError } = await supabase
            .from('company_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (requestError) throw requestError;
        if (!request?.requested_by) throw new Error('This company application is missing its account owner.');

        const { data: existing } = await supabase
            .from('companies')
            .select('*')
            .ilike('name', request.name)
            .limit(1)
            .maybeSingle();

        let company: Company;
        if (existing) {
            company = existing as Company;
            const companyUpdates: Partial<Company> = {};
            if (options?.department_id) companyUpdates.department_id = options.department_id;
            if (request.position) companyUpdates.contact_position = request.position;
            if (request.logo_url) companyUpdates.logo_url = request.logo_url;
            if (Object.keys(companyUpdates).length > 0) {
                const { error } = await supabase
                    .from('companies')
                    .update(companyUpdates)
                    .eq('id', company.id);
                if (error) throw error;
                company = { ...company, ...companyUpdates };
            }
        } else {
            const { data: created, error: createError } = await supabase
                .from('companies')
                .insert({
                    name: request.name,
                    address: request.address || null,
                    contact_person: request.student_name || null,
                    contact_position: request.position || null,
                    contact_email: request.contact_email || null,
                    industry: request.industry || null,
                    website: request.website || null,
                    logo_url: request.logo_url || null,
                    department_id: options?.department_id || null,
                })
                .select()
                .single();

            if (createError) throw createError;
            company = created as Company;
        }

        const { error: profileError } = await supabase
            .from('profiles')
            .update({ company_id: company.id, account_type: 'company', is_active: true })
            .eq('auth_user_id', request.requested_by);
        if (profileError) throw profileError;

        const { error: requestUpdateError } = await supabase
            .from('company_requests')
            .update({ status: 'approved' })
            .eq('id', requestId);
        if (requestUpdateError) throw requestUpdateError;

        if (options?.handle_company) {
            await this.toggleCompanyHandling(company.id, true);
            company = { ...company, is_handled: true };
        }

        // 4. Notify the applicant that their company account has been verified
        if (request?.requested_by) {
            await notificationService.createNotification(
                request.requested_by,
                'Company Account Verified',
                `Your company application for ${company.name} has been reviewed and approved by the coordinator. You can now access the Company Portal.`,
                'success',
                { notificationType: 'company', relatedType: 'company', relatedId: company.id },
            ).catch(err => console.error('Error sending verification notification:', err));

        }

        return company;
    },

    async rejectCompanyRequest(requestId: string) {
        // Fetch the request first to know who requested it
        const { data: request } = await supabase
            .from('company_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        const { error } = await supabase
            .from('company_requests')
            .update({ status: 'rejected' })
            .eq('id', requestId);

        if (error) {
            console.error('Error rejecting company request:', error);
            throw error;
        }

        // Send a notification so the requester knows to try again
        if (request?.requested_by) {
            const isCompanyAccount = request.request_type === 'company_account';

            await notificationService.createNotification(
                request.requested_by,
                isCompanyAccount ? 'Company Application Not Verified' : 'Company Request Rejected',
                isCompanyAccount
                    ? `Your company application for ${request.name} was reviewed but not approved. Please contact a coordinator for details or submit a new application.`
                    : `Your request to add the company ${request.name} was rejected. Please select or request a different company.`,
                'warning',
                { notificationType: 'company', relatedType: 'company_request', relatedId: requestId },
            ).catch(err => console.error('Error sending rejection notification:', err));

        }

        return true;
    },

    /**
     * Delete a company by ID
     */
    async deleteCompany(companyId: string) {
        const { error } = await supabase
            .from('companies')
            .delete()
            .eq('id', companyId);

        if (error) {
            console.error('Error deleting company:', error);
            throw error;
        }
        return true;
    },

    // ─── Department Methods ──────────────────────────────────────────────

    /**
     * Fetch the current coordinator's assigned department
     */
    async getMyDepartment() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: profile } = await supabase
            .from('profiles')
            .select('department_id')
            .eq('auth_user_id', user.id)
            .single();

        if (!profile?.department_id) return null;

        const { data: department, error } = await supabase
            .from('departments')
            .select('*')
            .eq('id', profile.department_id)
            .single();

        if (error) {
            console.error('Error fetching department:', error);
            return null;
        }

        return department as { id: string; name: string; description: string | null; created_at: string };
    },

    /**
     * Fetch students assigned to a specific department
     */
    async getStudentsByDepartment(departmentId: string) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('account_type', 'student')
            .eq('department_id', departmentId)
            .order('last_name', { ascending: true });

        if (error) {
            console.error('Error fetching students by department:', error);
            throw error;
        }

        const students = data as Profile[];

        // Map company names
        const { data: companiesData } = await supabase.from('companies').select('id, name');
        if (companiesData) {
            const companyMap = new Map(companiesData.map((c: any) => [c.id, c.name]));
            students.forEach(s => {
                if (s.company_id) {
                    s.company = { name: companyMap.get(s.company_id) || 'Unknown' };
                }
            });
        }

        // Map department names
        const { data: deptsData } = await supabase.from('departments').select('id, name');
        if (deptsData) {
            const deptMap = new Map(deptsData.map((d: any) => [d.id, d.name]));
            students.forEach(s => {
                if (s.department_id) {
                    s.department_info = { name: deptMap.get(s.department_id) || 'Unknown' };
                }
            });
        }

        return students;
    },

    /**
     * Fetch students not assigned to any department
     */
    async getUnassignedStudents() {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('account_type', 'student')
            .is('department_id', null)
            .order('last_name', { ascending: true });

        if (error) {
            console.error('Error fetching unassigned students:', error);
            throw error;
        }

        return data as Profile[];
    },

    /**
     * Assign or unassign a student to/from a department
     */
    async assignStudentToDepartment(studentId: string, departmentId: string | null) {
        let deptName = null;
        if (departmentId) {
            const { data } = await supabase.from('departments').select('name').eq('id', departmentId).single();
            if (data) deptName = data.name;
        }

        const { error } = await supabase
            .from('profiles')
            .update({ department_id: departmentId, department: deptName })
            .eq('id', studentId);

        if (error) {
            console.error('Error assigning student to department:', error);
            throw error;
        }

        return true;
    },

    // ─── Dashboard Stats Methods ────────────────────────────────────────

    /**
     * Fetch comprehensive stats for the coordinator dashboard
     */
    async getOverviewStats(departmentId?: string) {
        // Query for students filtered by department if provided
        let studentsQuery = supabase
            .from('profiles')
            .select('*')
            .eq('account_type', 'student');
        
        if (departmentId) {
            studentsQuery = studentsQuery.eq('department_id', departmentId);
        }

        // Query for timesheets filtered by department students if provided
        let timesheetsQuery = supabase
            .from('timesheets')
            .select('user_id, clock_in, clock_out, status');
        
        // Query for journals filtered by department students if provided
        let recentJournalsQuery = supabase.from('daily_journals')
            .select('id, user_id, entry_date, created_at, tasks')
            .order('created_at', { ascending: false })
            .limit(5);

        // Fetch pending documents
        const { data: pendingDocs } = await supabase
            .from('student_documents')
            .select('id, user_id')
            .eq('status', 'pending');

        // Fetch pending journals
        const { data: pendingJournals } = await supabase
            .from('daily_journals')
            .select('id, user_id')
            .eq('approval_status', 'pending');

        // Fetch pending timesheets
        const { data: pendingTimesheets } = await supabase
            .from('timesheets')
            .select('id, user_id')
            .eq('status', 'completed')
            .eq('approval_status', 'pending');

        // Fetch pending department change requests
        const { data: pendingDeptRequests } = await supabase
            .from('department_change_requests')
            .select('id, user_id')
            .eq('status', 'pending');

        const [studentsRes, timesheetsRes, journalsRes] = await Promise.all([
            studentsQuery.order('last_name', { ascending: true }),
            timesheetsQuery,
            recentJournalsQuery
        ]);

        const students = (studentsRes.data || []) as Profile[];
        const studentIds = students.map(s => s.auth_user_id);
        const studentIdSet = new Set(studentIds);

        // Filter pending docs by these students if departmentId is provided
        const filteredPendingDocsCount = (pendingDocs || [])
            .filter(d => !departmentId || studentIdSet.has(d.user_id)).length;

        // Filter pending journals by these students if departmentId is provided
        const filteredPendingJournalsCount = (pendingJournals || [])
            .filter(j => !departmentId || studentIdSet.has(j.user_id)).length;

        // Filter pending timesheets by these students if departmentId is provided
        const filteredPendingTimesheetsCount = (pendingTimesheets || [])
            .filter(t => !departmentId || studentIdSet.has(t.user_id)).length;

        // Filter pending dept change requests by these students if departmentId is provided
        const filteredPendingDeptRequestsCount = (pendingDeptRequests || [])
            .filter(req => !departmentId || studentIdSet.has(req.user_id)).length;

        const totalPendingApprovals = filteredPendingDocsCount + filteredPendingJournalsCount + filteredPendingTimesheetsCount + filteredPendingDeptRequestsCount;

        const assignedStudents = students.filter(s => s.company_id != null);
        const atRiskStudents = students.filter(s => (s.absences || 0) >= 3);

        const studentHours: Record<string, number> = {};
        let weeklyActivityCount = 0;

        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        if (timesheetsRes.data) {
            timesheetsRes.data.forEach((ts: any) => {
                // Only count if student is in the current (filtered) list
                if (departmentId && !studentIdSet.has(ts.user_id)) return;

                if (ts.status === 'completed' && ts.clock_out) {
                    const start = new Date(ts.clock_in).getTime();
                    const end = new Date(ts.clock_out).getTime();
                    const hours = (end - start) / (1000 * 3600);
                    studentHours[ts.user_id] = (studentHours[ts.user_id] || 0) + hours;
                }

                const clockInDate = new Date(ts.clock_in);
                if (clockInDate >= startOfWeek) {
                    weeklyActivityCount++;
                }
            });
        }

        let completedCount = 0;
        let inProgressCount = 0;
        const progressData: Array<{ name: string; hours: number; target: number; avatar?: string; id: string }> = [];

        students.forEach(s => {
            const hours = studentHours[s.auth_user_id] || 0;
            const target = s.required_ojt_hours || 400;

            if (hours >= target) {
                completedCount++;
            } else if (hours > 0) {
                inProgressCount++;
            }

            if (s.company_id) {
                progressData.push({
                    id: s.id,
                    name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown Student',
                    hours: Math.round(hours * 10) / 10,
                    target,
                    avatar: s.avatar_url || undefined
                });
            }
        });

        const studentMap = new Map(students.map(s => [s.auth_user_id, s]));
        const recentActivity = (journalsRes.data || [])
            .filter(j => !departmentId || studentIdSet.has(j.user_id))
            .map(j => {
            const student = studentMap.get(j.user_id);
            return {
                ...j,
                student_name: student ? `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown Student' : 'Unknown Student',
                student_avatar: student?.avatar_url || undefined
            };
        });

        return {
            totalAssigned: assignedStudents.length,
            completed: completedCount,
            inProgress: inProgressCount,
            atRisk: atRiskStudents.length,
            pendingApprovals: (filteredPendingDocsCount || 0) + (filteredPendingJournalsCount || 0), // Journals + Docs
            pendingJournals: filteredPendingJournalsCount,
            pendingTimesheets: filteredPendingTimesheetsCount,
            pendingDeptRequests: filteredPendingDeptRequestsCount,
            totalPendingCount: totalPendingApprovals, // for the sidebar badge
            pendingTimeLogs: filteredPendingTimesheetsCount,
            recentActivity,
            thisWeekActivityCount: weeklyActivityCount,
            progressData: progressData.sort((a, b) => b.hours - a.hours)
        };
    },

    /**
     * Update a student's grade
     */
    async updateStudentGrade(studentId: string, grade: string) {
        const { error } = await supabase
            .from('profiles')
            .update({ grade })
            .eq('auth_user_id', studentId);

        if (error) {
            console.error('Error updating student grade:', error);
            throw error;
        }

        // Notify the student
        try {
            await notificationService.createNotification(
                studentId,
                'Grade Updated',
                `Your final grade has been updated to: ${grade}. View it in your Profile.`,
                'success',
                { notificationType: 'general', relatedType: 'grade', relatedId: studentId },
            );
        } catch (notifErr) {
            console.error('Failed to notify student about grade update:', notifErr);
        }

        return true;
    },

    /**
     * Update a student's section
     */
    async updateStudentSection(studentId: string, section: string) {
        const { error } = await supabase
            .from('profiles')
            .update({ section })
            .eq('auth_user_id', studentId);

        if (error) {
            console.error('Error updating student section:', error);
            throw error;
        }
        return true;
    },

    /**
     * Bulk update all students from an old section name to a new section name
     */
    async bulkUpdateSectionName(oldSection: string, newSection: string, departmentId?: string, course?: string, yearLevel?: string) {
        // If departmentId is provided, we only update students in that department
        let query = supabase
            .from('profiles')
            .update({ section: newSection });

        // Build the query conditions
        let finalQuery;
        if (oldSection === 'Unassigned Section') {
            finalQuery = query.is('section', null).eq('account_type', 'student');
        } else {
            finalQuery = query.eq('section', oldSection).eq('account_type', 'student');
        }

        if (departmentId) {
            finalQuery = finalQuery.eq('department_id', departmentId);
        }
        
        if (course) {
            if (course === 'Unassigned Course') finalQuery = finalQuery.is('course', null);
            else finalQuery = finalQuery.eq('course', course);
        }
        
        if (yearLevel) {
            if (yearLevel === 'Unassigned Year') finalQuery = finalQuery.is('year_level', null);
            else finalQuery = finalQuery.eq('year_level', yearLevel);
        }

        const { error } = await finalQuery;

        if (error) {
            console.error('Error bulk updating section:', error);
            throw error;
        }
        return true;
    },

    // ─── Adviser & Section Management Methods ─────────────────────────────

    /**
     * Fetch all advisers with their assigned sections and student count
     */
    async getAllAdvisers() {
        // 1. Fetch profiles where account_type = 'adviser'
        const { data: advisers, error: advError } = await supabase
            .from('profiles')
            .select('*')
            .eq('account_type', 'adviser')
            .order('last_name', { ascending: true });

        if (advError) {
            console.error('Error fetching advisers:', advError);
            throw advError;
        }

        if (!advisers || advisers.length === 0) return [];

        const adviserUserIds = advisers.map(a => a.auth_user_id);

        // 2. Fetch active section assignments for these advisers
        const { data: assignments } = await supabase
            .from('adviser_sections')
            .select(`
                id,
                adviser_id,
                section_id,
                status,
                assigned_at,
                sections:section_id (
                    id,
                    name,
                    course_code
                )
            `)
            .in('adviser_id', adviserUserIds)
            .eq('status', 'active');

        // Map assigned sections per adviser
        const assignedSectionsMap: Record<string, { id: string; name: string; course_code: string }[]> = {};
        const allAssignedSectionNames: string[] = [];

        (assignments || []).forEach((asgn: any) => {
            if (asgn.sections) {
                if (!assignedSectionsMap[asgn.adviser_id]) {
                    assignedSectionsMap[asgn.adviser_id] = [];
                }
                assignedSectionsMap[asgn.adviser_id].push({
                    id: asgn.sections.id,
                    name: asgn.sections.name,
                    course_code: asgn.sections.course_code
                });
                allAssignedSectionNames.push(asgn.sections.name);
            }
        });

        // 3. Count students in each section. `profiles.section` may still hold a
        //    legacy letter ("A") instead of the full name ("DIT-1A"), so the
        //    value is canonicalised before being counted.
        const sectionStudentCounts = allAssignedSectionNames.length > 0
            ? await countStudentsBySection()
            : {};

        // 4. Combine and compute student count per adviser
        return advisers.map(a => {
            const sections = assignedSectionsMap[a.auth_user_id] || [];
            const studentCount = sections.reduce(
                (sum, sec) => sum + (sectionStudentCounts[sec.name.trim().toUpperCase()] || 0),
                0
            );
            return {
                ...a,
                assigned_sections: sections,
                sections_count: sections.length,
                students_count: studentCount,
                adviser_type: a.adviser_type || (a.course === 'DHT' ? 'HT Adviser' : a.course === 'DIT' ? 'IT Adviser' : 'HT Adviser')
            };
        });
    },

    /**
     * Fetch all sections with their currently assigned adviser and student count
     */
    async getAllSections() {
        const { data: sections, error: secError } = await supabase
            .from('sections')
            .select('*')
            .order('name', { ascending: true });

        if (secError) {
            console.error('Error fetching sections:', secError);
            throw secError;
        }

        if (!sections || sections.length === 0) return [];

        const sectionIds = sections.map(s => s.id);

        // Fetch assignments for these sections
        const { data: assignments } = await supabase
            .from('adviser_sections')
            .select(`
                id,
                adviser_id,
                section_id,
                status,
                assigned_at
            `)
            .in('section_id', sectionIds)
            .eq('status', 'active');

        const adviserIds = (assignments || []).map(a => a.adviser_id);
        let adviserProfiles: Record<string, Profile> = {};

        if (adviserIds.length > 0) {
            const { data: advList } = await supabase
                .from('profiles')
                .select('*')
                .in('auth_user_id', adviserIds);

            (advList || []).forEach(a => {
                adviserProfiles[a.auth_user_id] = a;
            });
        }

        const assignmentMap: Record<string, any> = {};
        (assignments || []).forEach(asgn => {
            const adv = adviserProfiles[asgn.adviser_id];
            assignmentMap[asgn.section_id] = {
                assignment_id: asgn.id,
                adviser_id: asgn.adviser_id,
                adviser_name: adv ? `${adv.first_name || ''} ${adv.last_name || ''}`.trim() : 'Unknown Adviser',
                adviser_type: adv?.adviser_type || (adv?.course === 'DHT' ? 'HT Adviser' : 'IT Adviser'),
                adviser_email: adv?.email,
                assigned_at: asgn.assigned_at
            };
        });

        // Count students per section, resolving legacy section values first.
        const counts = await countStudentsBySection();

        return sections.map(s => ({
            ...s,
            student_count: counts[s.name.trim().toUpperCase()] || 0,
            assignment: assignmentMap[s.id] || null,
            adviser_id: assignmentMap[s.id]?.adviser_id || null,
            adviser_name: assignmentMap[s.id]?.adviser_name || null,
            adviser_type: assignmentMap[s.id]?.adviser_type || null,
            adviser_email: assignmentMap[s.id]?.adviser_email || null,
        }));
    },

    /**
     * Create a new section
     */
    async createSection(name: string, courseCode: 'DHT' | 'DIT', departmentId?: string) {
        const { data, error } = await supabase
            .from('sections')
            .insert([{
                name: name.trim().toUpperCase(),
                course_code: courseCode,
                department_id: departmentId || null
            }])
            .select()
            .single();

        if (error) {
            console.error('Error creating section:', error);
            throw error;
        }

        try {
            await createAuditLog({
                action: 'CREATE',
                module: 'User Management',
                description: `Created section ${data.name} for course ${courseCode}`,
                targetType: 'section',
                targetId: data.id,
                targetName: data.name
            });
        } catch {}

        return data;
    },

    /**
     * Delete a section
     */
    async deleteSection(sectionId: string, sectionName: string) {
        const { error } = await supabase
            .from('sections')
            .delete()
            .eq('id', sectionId);

        if (error) {
            console.error('Error deleting section:', error);
            throw error;
        }

        try {
            await createAuditLog({
                action: 'DELETE',
                module: 'User Management',
                description: `Deleted section ${sectionName}`,
                targetType: 'section',
                targetId: sectionId,
                targetName: sectionName
            });
        } catch {}

        return true;
    },

    /**
     * Create an Adviser account
     */
    async createAdviserAccount(data: {
        email: string;
        password?: string;
        firstName: string;
        lastName: string;
        course: 'DHT' | 'DIT';
        adviserType: 'HT Adviser' | 'IT Adviser';
    }) {
        const adviserType = data.course === 'DHT' ? 'HT Adviser' : 'IT Adviser';
        const normalizedEmail = normalizeEmail(data.email);

        // 1. One email = one account, system-wide. An address already held by a
        //    student, coordinator, company or admin account is refused rather
        //    than converted — silently repurposing someone's existing account
        //    was how the same email ended up on two portals.
        const { data: emailTaken, error: emailCheckError } = await supabase
            .rpc('is_email_registered', { p_email: normalizedEmail });
        if (emailCheckError) throw emailCheckError;
        if (emailTaken) {
            throw new Error(EMAIL_ALREADY_REGISTERED_MESSAGE);
        }

        // 2. Sign up via Supabase Auth
        const tempPassword = data.password || 'Adviser@12345';
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: normalizedEmail,
            password: tempPassword,
            options: {
                data: {
                    first_name: data.firstName.trim(),
                    last_name: data.lastName.trim(),
                    account_type: 'adviser',
                    course: data.course,
                    adviser_type: adviserType
                }
            }
        });

        if (signUpError) {
            console.error('Error signing up adviser:', signUpError);
            // Lost a race against another registration, or the check was
            // bypassed — the database refused it. Same message either way.
            if (isDuplicateEmailError(signUpError)) {
                throw new Error(EMAIL_ALREADY_REGISTERED_MESSAGE);
            }
            throw signUpError;
        }

        if (signUpData.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
            throw new Error(EMAIL_ALREADY_REGISTERED_MESSAGE);
        }

        if (signUpData.user) {
            // Upsert profile row to guarantee fields are set
            const { error: profileError } = await supabase.from('profiles').upsert({
                auth_user_id: signUpData.user.id,
                email: normalizedEmail,
                first_name: data.firstName.trim(),
                last_name: data.lastName.trim(),
                account_type: 'adviser',
                course: data.course,
                adviser_type: adviserType,
                is_active: true
            }, { onConflict: 'auth_user_id' });

            if (profileError) {
                if (isDuplicateEmailError(profileError)) {
                    throw new Error(EMAIL_ALREADY_REGISTERED_MESSAGE);
                }
                throw profileError;
            }
        }

        try {
            await createAuditLog({
                action: 'CREATE',
                module: 'User Management',
                description: `Created new ${adviserType} account for ${data.email} (${data.course})`,
                targetType: 'user',
                targetName: `${data.firstName} ${data.lastName}`,
            });
        } catch {}

        return signUpData;
    },

    /**
     * Update an Adviser's details
     */
    async updateAdviserInfo(adviserId: string, updates: Partial<Profile>) {
        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('auth_user_id', adviserId);

        if (error) {
            console.error('Error updating adviser info:', error);
            throw error;
        }

        try {
            await createAuditLog({
                action: 'UPDATE',
                module: 'User Management',
                description: `Updated adviser details for user ${adviserId}`,
                targetType: 'user',
                targetId: adviserId
            });
        } catch {}

        return true;
    },

    /**
     * Activate or Deactivate an Adviser account
     */
    async setAdviserStatus(adviserId: string, isActive: boolean) {
        const { error } = await supabase
            .from('profiles')
            .update({ is_active: isActive })
            .eq('auth_user_id', adviserId);

        if (error) {
            console.error('Error updating adviser active status:', error);
            throw error;
        }

        try {
            await createAuditLog({
                action: 'STATUS_CHANGE',
                module: 'User Management',
                description: `${isActive ? 'Activated' : 'Deactivated'} adviser account: ${adviserId}`,
                targetType: 'user',
                targetId: adviserId
            });
        } catch {}

        return true;
    },

    /**
     * Assign or reassign an Adviser to a Section with strict course compatibility check
     */
    async assignAdviserToSection(adviserId: string, sectionId: string) {
        // 1. Fetch section info
        const { data: section, error: secErr } = await supabase
            .from('sections')
            .select('id, name, course_code')
            .eq('id', sectionId)
            .single();

        if (secErr || !section) {
            throw new Error('Section not found.');
        }

        // 2. Fetch adviser info
        const { data: adviser, error: advErr } = await supabase
            .from('profiles')
            .select('id, auth_user_id, first_name, last_name, course, adviser_type, is_active')
            .eq('auth_user_id', adviserId)
            .single();

        if (advErr || !adviser) {
            throw new Error('Adviser not found.');
        }

        if (adviser.is_active === false) {
            throw new Error('Cannot assign an inactive adviser. Please activate the account first.');
        }

        // 3. Strict Course Compatibility Validation
        const isDHTSection = section.course_code === 'DHT';
        const isDITSection = section.course_code === 'DIT';
        const isHTAdviser = adviser.adviser_type === 'HT Adviser' || adviser.course === 'DHT';
        const isITAdviser = adviser.adviser_type === 'IT Adviser' || adviser.course === 'DIT';

        if (isDHTSection && !isHTAdviser) {
            throw new Error('Course mismatch: DHT sections can only be assigned to HT Advisers.');
        }
        if (isDITSection && !isITAdviser) {
            throw new Error('Course mismatch: DIT sections can only be assigned to IT Advisers.');
        }

        // 4. Try RPC function first
        const { error: rpcErr } = await supabase.rpc('coordinator_assign_adviser_section', {
            p_adviser_id: adviserId,
            p_section_id: sectionId
        });

        if (rpcErr) {
            console.warn('RPC coordinator_assign_adviser_section error, fallback to upsert:', rpcErr);
            const { data: { user } } = await supabase.auth.getUser();

            const { error: upsertErr } = await supabase
                .from('adviser_sections')
                .upsert({
                    adviser_id: adviserId,
                    section_id: sectionId,
                    assigned_by: user?.id,
                    status: 'active',
                    assigned_at: new Date().toISOString()
                }, { onConflict: 'section_id' });

            if (upsertErr) throw upsertErr;
        }

        // Notify Adviser
        try {
            await notificationService.createNotification(
                adviserId,
                'New Section Assigned',
                `You have been assigned as the Section Adviser for ${section.name} (${section.course_code}).`,
                'info',
                { notificationType: 'assignment', relatedType: 'section', relatedId: sectionId },
            );
        } catch (notifErr) {
            console.warn('Notification failed:', notifErr);
        }

        // Audit log
        try {
            await createAuditLog({
                action: 'ASSIGN',
                module: 'User Management',
                description: `Assigned adviser ${adviser.first_name} ${adviser.last_name} to section ${section.name}`,
                targetType: 'section',
                targetId: sectionId,
                targetName: section.name
            });
        } catch {}

        return true;
    },

    /**
     * Assign one Adviser to several Sections in a single action.
     *
     * An adviser may hold any number of sections, so each section is assigned
     * independently and a failure on one (for example a course mismatch) does
     * not discard the ones that succeeded. Assigning a section the adviser
     * already holds is a no-op rather than a duplicate row.
     *
     * Returns the sections that were assigned and any that could not be.
     */
    async assignAdviserToSections(adviserId: string, sectionIds: string[]) {
        const assigned: string[] = [];
        const failed: { sectionId: string; message: string }[] = [];

        for (const sectionId of sectionIds) {
            try {
                await this.assignAdviserToSection(adviserId, sectionId);
                assigned.push(sectionId);
            } catch (err) {
                failed.push({
                    sectionId,
                    message: err instanceof Error ? err.message : 'Assignment failed.',
                });
            }
        }

        return { assigned, failed };
    },

    /**
     * Remove an Adviser assignment from a section
     */
    async removeAdviserFromSection(sectionId: string) {
        const { error: rpcErr } = await supabase.rpc('coordinator_remove_adviser_section', {
            p_section_id: sectionId
        });

        if (rpcErr) {
            console.warn('RPC coordinator_remove_adviser_section failed, fallback to delete:', rpcErr);
            const { error } = await supabase
                .from('adviser_sections')
                .delete()
                .eq('section_id', sectionId);

            if (error) throw error;
        }

        try {
            await createAuditLog({
                action: 'UNASSIGN',
                module: 'User Management',
                description: `Removed adviser assignment from section ${sectionId}`,
                targetType: 'section',
                targetId: sectionId
            });
        } catch {}

        return true;
    },

    /**
     * Reassign a section from one Adviser to another
     */
    async reassignSectionAdviser(sectionId: string, newAdviserId: string) {
        return this.assignAdviserToSection(newAdviserId, sectionId);
    }
};
