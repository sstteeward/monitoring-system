import { supabase } from '../lib/supabaseClient';
import type { Profile } from './profileService';
import { notificationService } from './notificationService';
import { createAuditLog } from './auditService';

export interface Section {
    id: string;
    name: string;
    course_code: 'DHT' | 'DIT';
    department_id?: string | null;
    created_at: string;
    student_count?: number;
    adviser_id?: string | null;
    adviser_name?: string | null;
    adviser_type?: string | null;
}

export interface AdviserSectionAssignment {
    id: string;
    adviser_id: string;
    section_id: string;
    assigned_at: string;
    assigned_by?: string | null;
    status: 'active' | 'inactive';
    section?: Section;
}

export interface StudentMonitoringRecord extends Profile {
    rendered_hours: number;
    progress_percentage: number;
    attendance_rate: number;
    journal_status: 'Up to Date' | 'Pending Review' | 'Behind' | 'No Entries';
    pending_journals_count: number;
    requirements_completed: number;
    requirements_total: number;
    is_at_risk: boolean;
}

export const adviserService = {
    /**
     * Fetch sections currently assigned to the logged-in Adviser
     */
    async getMySections(): Promise<Section[]> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('adviser_sections')
            .select(`
                id,
                section_id,
                status,
                assigned_at,
                sections:section_id (
                    id,
                    name,
                    course_code,
                    department_id,
                    created_at
                )
            `)
            .eq('adviser_id', user.id)
            .eq('status', 'active');

        if (error) {
            console.error('Error fetching adviser sections:', error);
            throw error;
        }

        const sectionsList: Section[] = (data || [])
            .map((item: any) => item.sections)
            .filter(Boolean);

        if (sectionsList.length === 0) return [];

        // Count students in each section
        const sectionNames = sectionsList.map(s => s.name);
        const { data: studentProfiles } = await supabase
            .from('profiles')
            .select('section')
            .eq('account_type', 'student')
            .in('section', sectionNames);

        const counts: Record<string, number> = {};
        (studentProfiles || []).forEach(p => {
            if (p.section) {
                counts[p.section] = (counts[p.section] || 0) + 1;
            }
        });

        return sectionsList.map(s => ({
            ...s,
            student_count: counts[s.name] || 0
        })).sort((a, b) => a.name.localeCompare(b.name));
    },

    /**
     * Fetch all students belonging to the Adviser's assigned sections
     */
    async getMyStudents(filters?: { section?: string; status?: string; search?: string }): Promise<Profile[]> {
        const sections = await this.getMySections();
        const sectionNames = sections.map(s => s.name);

        if (sectionNames.length === 0) return [];

        let query = supabase
            .from('profiles')
            .select('*')
            .eq('account_type', 'student')
            .in('section', sectionNames);

        if (filters?.section && filters.section !== 'all') {
            query = query.eq('section', filters.section);
        }

        const { data, error } = await query.order('last_name', { ascending: true });
        if (error) {
            console.error('Error fetching adviser students:', error);
            throw error;
        }

        let students = (data || []) as Profile[];

        // Filter search term in-memory if provided
        if (filters?.search?.trim()) {
            const term = filters.search.trim().toLowerCase();
            students = students.filter(s =>
                `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase().includes(term) ||
                (s.email || '').toLowerCase().includes(term) ||
                (s.section || '').toLowerCase().includes(term)
            );
        }

        // Attach company names
        const companyIds = students.map(s => s.company_id).filter(Boolean) as string[];
        if (companyIds.length > 0) {
            const { data: companies } = await supabase
                .from('companies')
                .select('id, name')
                .in('id', companyIds);
            
            if (companies) {
                const map = new Map(companies.map(c => [c.id, c.name]));
                students.forEach(s => {
                    if (s.company_id) {
                        s.company = { name: map.get(s.company_id) || 'Unknown' };
                    }
                });
            }
        }

        return students;
    },

    /**
     * Get pending student account registrations for assigned sections
     */
    async getPendingStudentApprovals(): Promise<Profile[]> {
        const sections = await this.getMySections();
        const sectionNames = sections.map(s => s.name);

        if (sectionNames.length === 0) return [];

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('account_type', 'student')
            .in('section', sectionNames)
            .or('approval_status.eq.pending,is_active.eq.false')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching pending student approvals:', error);
            throw error;
        }

        return (data || []) as Profile[];
    },

    /**
     * Approve a student's account registration
     */
    async approveStudentAccount(studentId: string, remarks?: string): Promise<boolean> {
        const { data: { user } } = await supabase.auth.getUser();

        // 1. Try RPC first for server-enforced validation
        const { error: rpcError } = await supabase.rpc('adviser_approve_student', {
            p_student_id: studentId,
            p_remarks: remarks || null
        });

        if (rpcError) {
            console.warn('RPC adviser_approve_student failed, using direct update fallback:', rpcError);
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    is_active: true,
                    approval_status: 'approved',
                    adviser_remarks: remarks || null,
                    approved_by: user?.id,
                    approved_at: new Date().toISOString()
                })
                .eq('auth_user_id', studentId);

            if (updateError) {
                // Try with id as fallback
                const { error: idError } = await supabase
                    .from('profiles')
                    .update({
                        is_active: true,
                        approval_status: 'approved',
                        adviser_remarks: remarks || null,
                        approved_by: user?.id,
                        approved_at: new Date().toISOString()
                    })
                    .eq('id', studentId);

                if (idError) throw idError;
            }
        }

        // Notify the student
        try {
            await notificationService.createNotification(
                studentId,
                'Account Approved!',
                `Your student account has been approved by your Section Adviser. Welcome to the SIL/OJT Monitoring System!`,
                'success'
            );
        } catch (notifErr) {
            console.warn('Notification failed:', notifErr);
        }

        // Create audit log
        try {
            await createAuditLog({
                action: 'APPROVE',
                module: 'User Management',
                description: `Approved student registration for student: ${studentId}`,
                targetType: 'student',
                targetId: studentId,
            });
        } catch {}

        return true;
    },

    /**
     * Reject a student's account registration
     */
    async rejectStudentAccount(studentId: string, reason: string): Promise<boolean> {
        const { data: { user } } = await supabase.auth.getUser();

        const { error: rpcError } = await supabase.rpc('adviser_reject_student', {
            p_student_id: studentId,
            p_status: 'rejected',
            p_remarks: reason
        });

        if (rpcError) {
            console.warn('RPC adviser_reject_student failed, using direct update fallback:', rpcError);
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    is_active: false,
                    approval_status: 'rejected',
                    adviser_remarks: reason,
                    approved_by: user?.id,
                    approved_at: new Date().toISOString()
                })
                .or(`auth_user_id.eq.${studentId},id.eq.${studentId}`);

            if (updateError) throw updateError;
        }

        try {
            await notificationService.createNotification(
                studentId,
                'Account Registration Update',
                `Your account registration was not approved: ${reason}`,
                'danger'
            );
        } catch (notifErr) {
            console.warn('Notification failed:', notifErr);
        }

        try {
            await createAuditLog({
                action: 'REJECT',
                module: 'User Management',
                description: `Rejected student registration for student ${studentId}: ${reason}`,
                targetType: 'student',
                targetId: studentId,
            });
        } catch {}

        return true;
    },

    /**
     * Request correction from student regarding their account details
     */
    async requestStudentCorrection(studentId: string, instructions: string): Promise<boolean> {
        const { data: { user } } = await supabase.auth.getUser();

        const { error: rpcError } = await supabase.rpc('adviser_reject_student', {
            p_student_id: studentId,
            p_status: 'correction_requested',
            p_remarks: instructions
        });

        if (rpcError) {
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    is_active: false,
                    approval_status: 'correction_requested',
                    adviser_remarks: instructions,
                    approved_by: user?.id,
                    approved_at: new Date().toISOString()
                })
                .or(`auth_user_id.eq.${studentId},id.eq.${studentId}`);

            if (updateError) throw updateError;
        }

        try {
            await notificationService.createNotification(
                studentId,
                'Correction Requested for Registration',
                `Your Section Adviser requested changes: ${instructions}`,
                'warning'
            );
        } catch (notifErr) {
            console.warn('Notification failed:', notifErr);
        }

        try {
            await createAuditLog({
                action: 'UPDATE',
                module: 'User Management',
                description: `Requested correction for student ${studentId}: ${instructions}`,
                targetType: 'student',
                targetId: studentId,
            });
        } catch {}

        return true;
    },

    /**
     * Fetch comprehensive dashboard overview stats for the Adviser
     */
    async getDashboardStats() {
        const sections = await this.getMySections();
        const sectionNames = sections.map(s => s.name);

        if (sectionNames.length === 0) {
            return {
                mySectionsCount: 0,
                myStudentsCount: 0,
                pendingApprovalsCount: 0,
                studentsOnOjtCount: 0,
                studentsNotDeployedCount: 0,
                studentsAtRiskCount: 0,
                pendingJournalsCount: 0,
                pendingDocsCount: 0,
                pendingTimesheetsCount: 0,
                totalPendingCount: 0,
                sections: [],
                recentActivity: []
            };
        }

        const students = await this.getMyStudents();
        const studentUserIds = students.map(s => s.auth_user_id).filter(Boolean);

        // Fetch pending student accounts
        const pendingStudents = students.filter(s => s.approval_status === 'pending' || s.is_active === false);

        // Placements
        const studentsOnOjt = students.filter(s => !!s.company_id && s.is_active !== false);
        const studentsNotDeployed = students.filter(s => !s.company_id && s.is_active !== false);
        const studentsAtRisk = students.filter(s => (s.absences || 0) >= 3);

        // Timesheets, journals, documents for assigned students
        let pendingJournalsCount = 0;
        let pendingDocsCount = 0;
        let pendingTimesheetsCount = 0;
        let recentJournals: any[] = [];

        if (studentUserIds.length > 0) {
            const [jRes, dRes, tRes, recJRes] = await Promise.all([
                supabase.from('daily_journals').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending').in('user_id', studentUserIds),
                supabase.from('student_documents').select('id', { count: 'exact', head: true }).eq('status', 'pending').in('user_id', studentUserIds),
                supabase.from('timesheets').select('id', { count: 'exact', head: true }).eq('status', 'completed').eq('approval_status', 'pending').in('user_id', studentUserIds),
                supabase.from('daily_journals').select('id, user_id, entry_date, tasks, created_at').in('user_id', studentUserIds).order('created_at', { ascending: false }).limit(5)
            ]);

            pendingJournalsCount = jRes.count || 0;
            pendingDocsCount = dRes.count || 0;
            pendingTimesheetsCount = tRes.count || 0;
            recentJournals = recJRes.data || [];
        }

        const studentMap = new Map(students.map(s => [s.auth_user_id, s]));
        const recentActivity = recentJournals.map(j => {
            const student = studentMap.get(j.user_id);
            return {
                ...j,
                student_name: student ? `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown Student' : 'Unknown Student',
                student_avatar: student?.avatar_url || undefined,
                section: student?.section || ''
            };
        });

        const totalPendingCount = pendingStudents.length + pendingJournalsCount + pendingDocsCount + pendingTimesheetsCount;

        return {
            mySectionsCount: sections.length,
            myStudentsCount: students.length,
            pendingApprovalsCount: pendingStudents.length,
            studentsOnOjtCount: studentsOnOjt.length,
            studentsNotDeployedCount: studentsNotDeployed.length,
            studentsAtRiskCount: studentsAtRisk.length,
            pendingJournalsCount,
            pendingDocsCount,
            pendingTimesheetsCount,
            totalPendingCount,
            sections,
            recentActivity
        };
    },

    /**
     * Get detailed student monitoring list with hours, attendance, and requirements status
     */
    async getDetailedStudentMonitoring(sectionFilter?: string): Promise<StudentMonitoringRecord[]> {
        const students = await this.getMyStudents({ section: sectionFilter });
        const studentUserIds = students.map(s => s.auth_user_id).filter(Boolean);

        if (studentUserIds.length === 0) return [];

        // Fetch timesheets
        const { data: timesheets } = await supabase
            .from('timesheets')
            .select('user_id, clock_in, clock_out, status')
            .in('user_id', studentUserIds);

        // Fetch journals
        const { data: journals } = await supabase
            .from('daily_journals')
            .select('user_id, approval_status, created_at')
            .in('user_id', studentUserIds);

        // Fetch documents
        const { data: documents } = await supabase
            .from('student_documents')
            .select('user_id, status')
            .in('user_id', studentUserIds);

        // Calculate hours per student
        const hoursMap: Record<string, number> = {};
        (timesheets || []).forEach(ts => {
            if (ts.status === 'completed' && ts.clock_out) {
                const start = new Date(ts.clock_in).getTime();
                const end = new Date(ts.clock_out).getTime();
                const hours = (end - start) / (1000 * 3600);
                hoursMap[ts.user_id] = (hoursMap[ts.user_id] || 0) + hours;
            }
        });

        // Journals status per student
        const pendingJournalsMap: Record<string, number> = {};
        const totalJournalsMap: Record<string, number> = {};
        (journals || []).forEach(j => {
            totalJournalsMap[j.user_id] = (totalJournalsMap[j.user_id] || 0) + 1;
            if (j.approval_status === 'pending') {
                pendingJournalsMap[j.user_id] = (pendingJournalsMap[j.user_id] || 0) + 1;
            }
        });

        // Documents status per student
        const docsTotalMap: Record<string, number> = {};
        const docsCompletedMap: Record<string, number> = {};
        (documents || []).forEach(d => {
            docsTotalMap[d.user_id] = (docsTotalMap[d.user_id] || 0) + 1;
            if (d.status === 'approved') {
                docsCompletedMap[d.user_id] = (docsCompletedMap[d.user_id] || 0) + 1;
            }
        });

        return students.map(s => {
            const uid = s.auth_user_id;
            const renderedHours = Math.round((hoursMap[uid] || 0) * 10) / 10;
            const requiredHours = s.required_ojt_hours || 500;
            const progressPct = Math.min(Math.round((renderedHours / requiredHours) * 100), 100);

            // Attendance calculation (e.g. absences deduction)
            const absences = s.absences || 0;
            const attendanceRate = Math.max(100 - (absences * 5), 0);

            const pendingJ = pendingJournalsMap[uid] || 0;
            const totalJ = totalJournalsMap[uid] || 0;
            let jStatus: StudentMonitoringRecord['journal_status'] = 'Up to Date';
            if (totalJ === 0) jStatus = 'No Entries';
            else if (pendingJ > 0) jStatus = 'Pending Review';

            const reqsCompleted = docsCompletedMap[uid] || 0;
            const reqsTotal = docsTotalMap[uid] || 10;

            const isAtRisk = absences >= 3 || (progressPct < 25 && s.company_id != null);

            return {
                ...s,
                rendered_hours: renderedHours,
                progress_percentage: progressPct,
                attendance_rate: attendanceRate,
                journal_status: jStatus,
                pending_journals_count: pendingJ,
                requirements_completed: reqsCompleted,
                requirements_total: reqsTotal > 0 ? reqsTotal : 10,
                is_at_risk: isAtRisk
            };
        });
    },

    /**
     * Fetch pending journals for assigned students
     */
    async getPendingJournals(): Promise<any[]> {
        const students = await this.getMyStudents();
        const studentUserIds = students.map(s => s.auth_user_id).filter(Boolean);

        if (studentUserIds.length === 0) return [];

        const { data, error } = await supabase
            .from('daily_journals')
            .select('*')
            .in('user_id', studentUserIds)
            .eq('approval_status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const studentMap = new Map(students.map(s => [s.auth_user_id, s]));
        return (data || []).map(j => ({
            ...j,
            profiles: studentMap.get(j.user_id) || null
        }));
    },

    /**
     * Fetch pending documents for assigned students
     */
    async getPendingDocuments(): Promise<any[]> {
        const students = await this.getMyStudents();
        const studentUserIds = students.map(s => s.auth_user_id).filter(Boolean);

        if (studentUserIds.length === 0) return [];

        const { data, error } = await supabase
            .from('student_documents')
            .select('*')
            .in('user_id', studentUserIds)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const studentMap = new Map(students.map(s => [s.auth_user_id, s]));
        return (data || []).map(d => ({
            ...d,
            profiles: studentMap.get(d.user_id) || null
        }));
    },

    /**
     * Fetch pending timesheets for assigned students
     */
    async getPendingTimesheets(): Promise<any[]> {
        const students = await this.getMyStudents();
        const studentUserIds = students.map(s => s.auth_user_id).filter(Boolean);

        if (studentUserIds.length === 0) return [];

        const { data, error } = await supabase
            .from('timesheets')
            .select('*')
            .in('user_id', studentUserIds)
            .eq('status', 'completed')
            .eq('approval_status', 'pending')
            .order('clock_out', { ascending: false });

        if (error) throw error;

        const studentMap = new Map(students.map(s => [s.auth_user_id, s]));
        return (data || []).map(t => ({
            ...t,
            profiles: studentMap.get(t.user_id) || null
        }));
    },

    /**
     * Update journal status
     */
    async updateJournalStatus(journalId: string, status: 'approved' | 'rejected'): Promise<boolean> {
        const { error } = await supabase
            .from('daily_journals')
            .update({ approval_status: status, updated_at: new Date().toISOString() })
            .eq('id', journalId);

        if (error) throw error;

        try {
            await createAuditLog({
                action: status === 'approved' ? 'APPROVE' : 'REJECT',
                module: 'Journals',
                description: `${status === 'approved' ? 'Approved' : 'Rejected'} student journal entry`,
                targetType: 'daily_journal',
                targetId: journalId,
            });
        } catch {}

        return true;
    },

    /**
     * Update document status
     */
    async updateDocumentStatus(documentId: string, status: 'approved' | 'rejected'): Promise<boolean> {
        const { error } = await supabase
            .from('student_documents')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', documentId);

        if (error) throw error;

        try {
            await createAuditLog({
                action: status === 'approved' ? 'APPROVE' : 'REJECT',
                module: 'Documents',
                description: `${status === 'approved' ? 'Approved' : 'Rejected'} student requirement document`,
                targetType: 'student_document',
                targetId: documentId,
            });
        } catch {}

        return true;
    },

    /**
     * Update timesheet status
     */
    async updateTimesheetStatus(timesheetId: string, status: 'approved' | 'rejected'): Promise<boolean> {
        const { error } = await supabase
            .from('timesheets')
            .update({ approval_status: status })
            .eq('id', timesheetId);

        if (error) throw error;

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
    }
};
