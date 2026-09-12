/**
 * The grading calculation and validation layer.
 *
 * Everything the Official Grading Sheet decides about a number — is it a legal
 * grade, does it pass, what is the sheet allowed to do next — is decided here,
 * not inside a component. The rules are duplicated in SQL (see
 * `supabase_grading_sheet.sql`: the `grading_item_remarks` trigger and
 * `save_grading_sheet_grades`) because the database is the authority; this copy
 * exists so the adviser sees the same answer before a round trip. Keep the two
 * in step.
 *
 * Nothing here is hard-coded to 0–100 or to a passing mark of 75: the range and
 * the threshold arrive from `grading_settings` and are frozen onto each sheet
 * when it is created.
 */

/** The workflow states an Official Grading Sheet moves through. */
export type GradingSheetStatus = 'draft' | 'for_review' | 'verified' | 'finalized';

export type GradeRemarks = 'PASSED' | 'FAILED';

/** Weightings of the SIL components the final grade may be built from. */
export interface GradingComponents {
    company_evaluation: number;
    adviser_evaluation: number;
    attendance: number;
    journals: number;
    requirements: number;
}

/** `public.grading_settings` — institution policy, not code. */
export interface GradingSettings {
    subject_code: string;
    course_description: string;
    min_grade: number;
    max_grade: number;
    passing_grade: number;
    components: GradingComponents;
}

/** The range and threshold a single sheet was created under. */
export interface GradeScale {
    min_grade: number;
    max_grade: number;
    passing_grade: number;
}

export const DEFAULT_GRADE_SCALE: GradeScale = {
    min_grade: 0,
    max_grade: 100,
    passing_grade: 75,
};

export const STATUS_LABELS: Record<GradingSheetStatus, string> = {
    draft: 'Draft',
    for_review: 'For Review',
    verified: 'Verified',
    finalized: 'Finalized',
};

/** The order the workflow runs in, used by the status rail in the UI. */
export const STATUS_ORDER: GradingSheetStatus[] = ['draft', 'for_review', 'verified', 'finalized'];

export const STATUS_DESCRIPTIONS: Record<GradingSheetStatus, string> = {
    draft: 'Grades can be entered and edited.',
    for_review: 'Submitted to the Coordinator. Grades are locked.',
    verified: 'Reviewed and verified by the Coordinator.',
    finalized: 'Closed academic record. Read-only for everyone.',
};

/** Only a draft is editable — that single rule drives every control in the UI. */
export const canEditGrades = (status: GradingSheetStatus): boolean => status === 'draft';

export const canSubmit = (status: GradingSheetStatus): boolean => status === 'draft';

export const canVerify = (status: GradingSheetStatus): boolean => status === 'for_review';

export const canReturn = (status: GradingSheetStatus): boolean =>
    status === 'for_review' || status === 'verified';

export const canFinalize = (status: GradingSheetStatus): boolean => status === 'verified';

export const isLocked = (status: GradingSheetStatus): boolean => status === 'finalized';

/**
 * PASSED / FAILED from the grade and the sheet's own passing mark.
 *
 * A student with no grade yet has no remark — a blank row must never print
 * "FAILED" on an official document just because nothing was entered.
 */
export function remarksFor(
    grade: number | null | undefined,
    passingGrade: number,
): GradeRemarks | null {
    if (grade === null || grade === undefined || !Number.isFinite(grade)) return null;
    return grade >= passingGrade ? 'PASSED' : 'FAILED';
}

export interface GradeValidation {
    /** True when the input is acceptable — including a deliberate blank. */
    ok: boolean;
    /** The parsed grade, or null for a blank (meaning "not encoded yet"). */
    value: number | null;
    /** Why it was rejected, ready to show beside the field. */
    error: string | null;
}

/**
 * Validate one typed final grade.
 *
 * A blank clears the grade rather than storing zero; anything that is not a
 * plain number is rejected outright, so "85a", "–", "N/A" and a pasted formula
 * can never reach the database. Two decimal places are kept, matching
 * `numeric(5,2)` in the schema.
 */
export function validateFinalGrade(
    raw: string | number | null | undefined,
    scale: GradeScale,
): GradeValidation {
    if (raw === null || raw === undefined) return { ok: true, value: null, error: null };

    const text = String(raw).trim();
    if (text === '') return { ok: true, value: null, error: null };

    // Number() would accept "1e2", " 0x10" and "Infinity"; the sheet accepts a
    // decimal number and nothing else.
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) {
        return { ok: false, value: null, error: 'Enter a number, for example 85 or 87.50.' };
    }

    const value = Math.round(Number(text) * 100) / 100;
    if (!Number.isFinite(value)) {
        return { ok: false, value: null, error: 'Enter a number, for example 85 or 87.50.' };
    }
    if (value < scale.min_grade || value > scale.max_grade) {
        return {
            ok: false,
            value: null,
            error: `The final grade must be between ${formatGrade(scale.min_grade)} and ${formatGrade(scale.max_grade)}.`,
        };
    }

    return { ok: true, value, error: null };
}

/** "85", "87.5" — trailing zeros are noise on a printed sheet. */
export function formatGrade(grade: number | string | null | undefined): string {
    if (grade === null || grade === undefined || grade === '') return '';
    const value = typeof grade === 'number' ? grade : Number(grade);
    if (!Number.isFinite(value)) return '';
    return String(Math.round(value * 100) / 100);
}

/**
 * One component of the final grade, already expressed on the sheet's scale.
 *
 * `score` is null when the component has no data for that student — an
 * unfinished company evaluation, a student with no journals yet. A null
 * component is excluded and the remaining weights are re-normalised, so the
 * calculation never silently scores a missing component as zero.
 */
export interface ComponentScore {
    key: keyof GradingComponents;
    score: number | null;
}

export interface CalculatedGrade {
    /** The weighted result, or null when no component had any data. */
    grade: number | null;
    /** Components that actually contributed, with the weight each was given. */
    used: Array<{ key: keyof GradingComponents; score: number; weight: number }>;
    /** Components skipped for want of data. */
    missing: Array<keyof GradingComponents>;
    /** Share of the configured weighting that was available, 0–1. */
    coverage: number;
}

/**
 * The SIL grade calculation service.
 *
 * final = Σ(component score × component weight) ÷ Σ(available weights)
 *
 * The adviser still confirms the result before it becomes a final grade — this
 * proposes, it does not encode. Weights come from `grading_settings.components`
 * so the institution can change the mix without a code change.
 */
export function calculateFinalGrade(
    components: ComponentScore[],
    weights: GradingComponents,
    scale: GradeScale = DEFAULT_GRADE_SCALE,
): CalculatedGrade {
    const used: CalculatedGrade['used'] = [];
    const missing: CalculatedGrade['missing'] = [];
    let totalWeight = 0;
    let configuredWeight = 0;

    for (const component of components) {
        const weight = Number(weights[component.key] ?? 0);
        configuredWeight += weight;

        if (component.score === null || !Number.isFinite(component.score) || weight <= 0) {
            if (weight > 0) missing.push(component.key);
            continue;
        }

        // A component cannot pull the result outside the sheet's own range.
        const score = Math.min(Math.max(component.score, scale.min_grade), scale.max_grade);
        used.push({ key: component.key, score, weight });
        totalWeight += weight;
    }

    if (totalWeight === 0) {
        return { grade: null, used: [], missing, coverage: 0 };
    }

    const weighted = used.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight;

    return {
        grade: Math.round(weighted * 100) / 100,
        used,
        missing,
        coverage: configuredWeight > 0 ? totalWeight / configuredWeight : 0,
    };
}

/** Human labels for the components, shared by the UI and the audit history. */
export const COMPONENT_LABELS: Record<keyof GradingComponents, string> = {
    company_evaluation: 'Company Evaluation',
    adviser_evaluation: 'Adviser Evaluation',
    attendance: 'Attendance / DTR',
    journals: 'Journal Completion',
    requirements: 'Required Documents',
};

/** How an audit action reads in the grade history panel. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
    create: 'Grading sheet created',
    reassign: 'Reassigned to a new adviser',
    grade_entered: 'Grade entered',
    grade_changed: 'Grade changed',
    submit: 'Submitted for verification',
    verify: 'Verified by the Coordinator',
    return: 'Returned for correction',
    finalize: 'Finalized',
};

/**
 * Progress of one sheet, for the dashboard row.
 * A sheet is only submittable once every student carries a grade.
 */
export function gradingProgress(graded: number, total: number): {
    complete: boolean;
    remaining: number;
    percent: number;
} {
    const remaining = Math.max(total - graded, 0);
    return {
        complete: total > 0 && remaining === 0,
        remaining,
        percent: total > 0 ? Math.round((graded / total) * 100) : 0,
    };
}

/** "2024-2025 · Second Semester" */
export function formatTerm(schoolYear: string, semester: string): string {
    const name = semester
        ? semester.charAt(0).toUpperCase() + semester.slice(1).toLowerCase()
        : '';
    return name ? `${schoolYear} · ${name} Semester` : schoolYear;
}
