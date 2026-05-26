import { supabase } from '../lib/supabaseClient';
import type { GeoJSONPolygon } from '../utils/geoUtils';
import type { Profile } from './profileService';
import type { Timesheet } from './timeTracking';
import { notificationService } from './notificationService';
import { emailService } from './emailService';

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
    contact_email: string | null;
    industry: string | null;
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
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
    latitude?: number | null;
    longitude?: number | null;
    geofence_radius?: number | null;
    geofence_polygon?: GeoJSONPolygon | null;
}

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
    return profile.permissions ? !!profile.permissions[permissionKey] : true; // Default true if no permissions set
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
                const { error: profileErr } = await supabase
                    .from('profiles')
                    .update({ company_id: company.id })
                    .in('auth_user_id', studentIds);

                if (profileErr) {
                    console.error('Error auto-assigning students to company:', profileErr);
                }

                // Send notifications (both in-app and email)
                const { data: studentProfiles } = await supabase
                    .from('profiles')
                    .select('email, first_name, last_name, auth_user_id')
                    .in('auth_user_id', studentIds);

                const profileMap = new Map((studentProfiles ?? []).map(p => [p.auth_user_id, p]));

                for (const studentId of studentIds) {
                    await notificationService.createNotification(
                        studentId,
                        'Company Request Approved',
                        `Your request to add the company ${name} has been approved! You can now access your dashboard.`,
                        'success'
                    ).catch(err => console.error('Error sending approval notification:', err));

                    const profile = profileMap.get(studentId);
                    if (profile && profile.email) {
                        const studentName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Student';
                        await emailService.sendCompanyApprovalEmail(profile.email, studentName, name)
                            .catch(err => console.error('Error sending approval email:', err));
                    }
                }
            }
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

        // Send a notification to the student so they know to try again
        if (request?.requested_by) {
            await notificationService.createNotification(
                request.requested_by,
                'Company Request Rejected',
                `Your request to add the company ${request.name} was rejected. Please select or request a different company.`,
                'warning'
            ).catch(err => console.error('Error sending rejection notification:', err));

            // Fetch the requesting student's profile to get their email
            const { data: profile } = await supabase
                .from('profiles')
                .select('email, first_name, last_name')
                .eq('auth_user_id', request.requested_by)
                .single();

            if (profile && profile.email) {
                const studentName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Student';
                await emailService.sendCompanyRejectionEmail(profile.email, studentName, request.name)
                    .catch(err => console.error('Error sending rejection email:', err));
            }
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
                'success'
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
    }
};
