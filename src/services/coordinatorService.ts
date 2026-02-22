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
    }
};
