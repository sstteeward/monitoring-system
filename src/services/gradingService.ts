import { supabase } from '../lib/supabaseClient';
import { createAuditLog } from './auditService';
import type {
    GradeScale,
    GradingSettings,
    GradingSheetStatus,
} from '../utils/grading';

/**
 * The Official Grading Sheet service.
 *
 * Every call goes through a SECURITY DEFINER function. The grade tables grant
 * no INSERT, UPDATE or DELETE to `authenticated`, so there is deliberately no
 * `.from('grading_sheet_items').update(...)` anywhere in this file — a grade
 * that changed without a status check and an audit record is not reachable from
 * the client.
 */

/** Supabase rejects with a plain object; keep the server's message. */
const asError = (error: { message?: string; hint?: string } | null, fallback: string): Error =>
    new Error(error?.message || error?.hint || fallback);

export interface SchoolYear {
    id: string;
    school_year: string;
    semester: 'FIRST' | 'SECOND' | 'SUMMER';
    is_active: boolean;
}

/** One student row on the sheet. Identity is read from the profile, never stored here. */
export interface GradingSheetItem {
    id: string;
    student_id: string;
    final_grade: number | null;
    remarks: 'PASSED' | 'FAILED' | null;
    grade_status: 'pending' | 'encoded';
    entered_at: string | null;
    entered_by_name: string | null;
    student_number: string | null;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    suffix: string | null;
    /** "ABDUL AZIZ, MARIAM ISLAM B." — composed in SQL from the profile. */
    student_name: string | null;
}

export interface GradingSheet extends GradeScale {
    id: string;
    status: GradingSheetStatus;
    subject_code: string;
    course_description: string;
    return_reason: string | null;
    returned_at: string | null;
    submitted_at: string | null;
    verified_at: string | null;
    finalized_at: string | null;
    created_at: string;
    updated_at: string;
    section: { id: string; name: string; course_code: string };
    school_year: { id: string; school_year: string; semester: string };
    adviser: { id: string | null; name: string; adviser_type: string | null };
    verified_by_name: string | null;
    items: GradingSheetItem[];
}

/** A row in "My Grading Sheets" / the coordinator's queue. */
export interface GradingSheetSummary {
    id: string;
    section_id: string;
    section_name: string;
    course_code: string;
    school_year_id?: string;
    school_year: string;
    semester: string;
    adviser_name?: string | null;
    status: GradingSheetStatus;
    student_count: number;
    graded_count: number;
    return_reason?: string | null;
    submitted_at: string | null;
    verified_at: string | null;
    finalized_at: string | null;
    updated_at: string;
}

export interface GradeHistoryEntry {
    id: string;
    action: string;
    old_grade: number | null;
    new_grade: number | null;
    old_status: string | null;
    new_status: string | null;
    reason: string | null;
    created_at: string;
    user_name: string | null;
    user_role: string | null;
    student_name: string | null;
}

/** One edited grade, as `save` expects it. */
export interface GradeEdit {
    item_id: string;
    final_grade: number | null;
}

export const gradingService = {
    /** Every school year + semester the institution has configured. */
    async getSchoolYears(): Promise<SchoolYear[]> {
        const { data, error } = await supabase.rpc('get_school_years');
        if (error) throw asError(error, 'Failed to load the list of school years.');
        return (data || []) as SchoolYear[];
    },

    /** The passing mark, the allowed range and the component weights. */
    async getSettings(): Promise<GradingSettings> {
        const { data, error } = await supabase.rpc('get_grading_settings');
        if (error) throw asError(error, 'Failed to load the grading configuration.');
        return data as GradingSettings;
    },

    /** The adviser's own sheets, one per section per term. */
    async getMySheets(): Promise<GradingSheetSummary[]> {
        const { data, error } = await supabase.rpc('get_my_grading_sheets');
        if (error) throw asError(error, 'Failed to load your grading sheets.');
        return (data || []) as GradingSheetSummary[];
    },

    /** The coordinator's verification queue. Drafts never appear here. */
    async getCoordinatorSheets(status?: GradingSheetStatus | 'all'): Promise<GradingSheetSummary[]> {
        const { data, error } = await supabase.rpc('get_coordinator_grading_sheets', {
            p_status: !status || status === 'all' ? null : status,
        });
        if (error) throw asError(error, 'Failed to load grading sheets for review.');
        return (data || []) as GradingSheetSummary[];
    },

    /**
     * Open (creating on first use) the sheet for one section in one term, and
     * return its id. The roster is re-synced server-side on every open, so a
     * student who transferred in appears without anyone re-creating the sheet.
     */
    async openSheet(sectionId: string, schoolYearId: string): Promise<string> {
        const { data, error } = await supabase.rpc('open_grading_sheet', {
            p_section_id: sectionId,
            p_school_year_id: schoolYearId,
        });
        if (error) throw asError(error, 'Failed to open the grading sheet for this section.');
        return data as string;
    },

    /** The whole sheet, with its student rows already in official order. */
    async getSheet(sheetId: string): Promise<GradingSheet> {
        const { data, error } = await supabase.rpc('get_grading_sheet', { p_sheet_id: sheetId });
        if (error) throw asError(error, 'Failed to load the grading sheet.');
        if (!data) throw new Error('That grading sheet could not be found.');
        return data as GradingSheet;
    },

    /**
     * Save the grades the adviser changed.
     *
     * Only edited rows are sent, and the server ignores any whose value did not
     * actually change — re-saving an untouched sheet writes no history.
     */
    async saveGrades(sheetId: string, edits: GradeEdit[], reason?: string): Promise<number> {
        if (edits.length === 0) return 0;

        const { data, error } = await supabase.rpc('save_grading_sheet_grades', {
            p_sheet_id: sheetId,
            p_grades: edits,
            p_reason: reason?.trim() || null,
        });
        if (error) throw asError(error, 'Failed to save the grades.');

        const changed = Number((data as { changed?: number })?.changed ?? 0);

        // The grade history is the authoritative record; this mirrors the change
        // into the portal-wide activity log the same way every other module does.
        if (changed > 0) {
            try {
                await createAuditLog({
                    action: 'UPDATE',
                    module: 'Grading',
                    description: `Saved ${changed} final grade${changed === 1 ? '' : 's'} on an Official Grading Sheet`,
                    targetType: 'grading_sheet',
                    targetId: sheetId,
                });
            } catch { /* a failed activity log must never undo a saved grade */ }
        }

        return changed;
    },

    /** Hand the sheet to the coordinator. Every student must carry a grade. */
    async submit(sheetId: string): Promise<void> {
        const { error } = await supabase.rpc('submit_grading_sheet', { p_sheet_id: sheetId });
        if (error) throw asError(error, 'Failed to submit the grading sheet.');

        try {
            await createAuditLog({
                action: 'SUBMIT',
                module: 'Grading',
                description: 'Submitted an Official Grading Sheet for coordinator verification',
                targetType: 'grading_sheet',
                targetId: sheetId,
            });
        } catch { /* ignore */ }
    },

    /** Coordinator: the sheet is correct. */
    async verify(sheetId: string): Promise<void> {
        const { error } = await supabase.rpc('verify_grading_sheet', { p_sheet_id: sheetId });
        if (error) throw asError(error, 'Failed to verify the grading sheet.');

        try {
            await createAuditLog({
                action: 'APPROVE',
                module: 'Grading',
                description: 'Verified an Official Grading Sheet',
                targetType: 'grading_sheet',
                targetId: sheetId,
            });
        } catch { /* ignore */ }
    },

    /** Coordinator: send it back. The reason reaches the adviser's notifications. */
    async returnForCorrection(sheetId: string, reason: string): Promise<void> {
        const { error } = await supabase.rpc('return_grading_sheet', {
            p_sheet_id: sheetId,
            p_reason: reason,
        });
        if (error) throw asError(error, 'Failed to return the grading sheet.');

        try {
            await createAuditLog({
                action: 'REJECT',
                module: 'Grading',
                description: `Returned an Official Grading Sheet for correction: ${reason}`,
                targetType: 'grading_sheet',
                targetId: sheetId,
            });
        } catch { /* ignore */ }
    },

    /** Close the record. After this nobody can edit it. */
    async finalize(sheetId: string): Promise<void> {
        const { error } = await supabase.rpc('finalize_grading_sheet', { p_sheet_id: sheetId });
        if (error) throw asError(error, 'Failed to finalize the grading sheet.');

        try {
            await createAuditLog({
                action: 'UPDATE',
                module: 'Grading',
                description: 'Finalized an Official Grading Sheet',
                targetType: 'grading_sheet',
                targetId: sheetId,
            });
        } catch { /* ignore */ }
    },

    /**
     * Set (or clear) a student's official student number.
     *
     * The number is identity data on the profile, not a grading-sheet column —
     * the sheet reads it from there. An adviser may set it only for students in
     * their own assigned sections; the server enforces that, the format and
     * uniqueness.
     */
    async setStudentNumber(studentId: string, studentNumber: string | null): Promise<string | null> {
        const { data, error } = await supabase.rpc('set_student_number', {
            p_student_id: studentId,
            p_student_number: studentNumber,
        });
        if (error) throw asError(error, 'The student number could not be saved.');

        const saved = (data as { student_number?: string | null })?.student_number ?? null;

        try {
            await createAuditLog({
                action: 'UPDATE',
                module: 'Students',
                description: saved
                    ? `Set the official student number for a student to ${saved}`
                    : 'Cleared a student\'s official student number',
                targetType: 'student',
                targetId: studentId,
            });
        } catch { /* a failed activity log must never undo a saved number */ }

        return saved;
    },

    /**
     * Grade history — the whole sheet, or one student's row when `itemId` is
     * given. Records are immutable in the database.
     */
    async getHistory(sheetId: string, itemId?: string | null): Promise<GradeHistoryEntry[]> {
        const { data, error } = await supabase.rpc('get_grading_sheet_history', {
            p_sheet_id: sheetId,
            p_item_id: itemId || null,
        });
        if (error) throw asError(error, 'Failed to load the grade history.');
        return (data || []) as GradeHistoryEntry[];
    },
};
