import { supabase } from '../lib/supabaseClient';
import type { Profile } from './profileService';
import type { Timesheet } from './timeTracking';

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
    created_at: string;
    updated_at: string;
    intern_count?: number; // virtual, populated by query joins
}

export interface CompanyRequest {
    id: string;
    name: string;
    requested_by: string | null;
    student_name: string | null;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
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
    async getAllStudents() {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('account_type', 'student')
            .order('last_name', { ascending: true });

        if (error) {
            console.error("Error fetching students list:", error);
            throw error;
        }

        return data as Profile[];
    },

    /**
     * Fetch all pending documents across all students, with profile info merged in
     */
    async getPendingDocuments() {
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
            .select('auth_user_id, first_name, last_name, email')
            .in('auth_user_id', userIds);

        if (profilesError) {
            console.error("Error fetching profiles for documents:", profilesError);
            throw profilesError;
        }

        // Step 3: merge — attach profile info onto each document
        const profileMap: Record<string, any> = {};
        (profiles ?? []).forEach((p: any) => { profileMap[p.auth_user_id] = p; });

        return docs.map((doc: any) => ({
            ...doc,
            profiles: profileMap[doc.user_id] ?? null,
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
     * Fetch all companies with a count of interns assigned
     */
    async getAllCompanies() {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error("Error fetching companies:", error);
            throw error;
        }

        // For each company, count the students with that company_id
        const companies = data as Company[];
        const { data: profiles } = await supabase
            .from('profiles')
            .select('company_id')
            .eq('account_type', 'student')
            .not('company_id', 'is', null);

        if (profiles) {
            const counts: Record<string, number> = {};
            profiles.forEach(p => {
                if (p.company_id) counts[p.company_id] = (counts[p.company_id] || 0) + 1;
            });
            companies.forEach(c => { c.intern_count = counts[c.id] || 0; });
        }

        return companies;
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
     * Update a student's grade
     */
    async updateStudentGrade(studentId: string, grade: string) {
        const hasPermission = await checkPermission('can_edit_grades');
        if (!hasPermission) throw new Error("You do not have permission to edit grades.");

        const { error } = await supabase
            .from('profiles')
            .update({ grade })
            .eq('id', studentId);

        if (error) {
            console.error("Error updating grade:", error);
            throw error;
        }

        return true;
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
    async approveCompanyRequest(name: string) {
        // 1. Insert one company (coordinator context — RLS allows this)
        const { data: newCompany, error: createErr } = await supabase
            .from('companies')
            .insert([{ name }])
            .select()
            .single();

        if (createErr) {
            console.error('Error creating company from request:', createErr);
            throw createErr;
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

        return newCompany as Company;
    },

    /**
     * Reject a company request
     */
    async rejectCompanyRequest(requestId: string) {
        const { error } = await supabase
            .from('company_requests')
            .update({ status: 'rejected' })
            .eq('id', requestId);

        if (error) {
            console.error('Error rejecting company request:', error);
            throw error;
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
};
