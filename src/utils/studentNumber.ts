/**
 * The official school student number.
 *
 * Printed beside every name on the Official Grading Sheet ("2023-24610795"),
 * so it is identity data and lives on `public.profiles.student_number` — never
 * copied onto a grading sheet row. See src/utils/gradingSheetDocument.ts.
 *
 * The rule is duplicated in SQL (`public.set_student_number`) because the
 * database is the authority; this copy exists so a student sees the answer
 * before a round trip. Keep the two in step.
 */

/** Admission year + the school's running number, e.g. 2023-24610795. */
const STUDENT_NUMBER_PATTERN = /^(\d{4})-(\d{4,12})$/;

/** The earliest admission year the format accepts. */
const MIN_YEAR = 1900;

export interface StudentNumberValidation {
    ok: boolean;
    /** The normalised value, or null when the field was left blank. */
    value: string | null;
    error: string | null;
}

/**
 * Normalise and validate a typed student number.
 *
 * A blank is accepted and clears the field: the number is issued by the
 * registrar, and a student who does not have it to hand must still be able to
 * finish registering. The adviser fills the gap later from the grading sheet,
 * which is where a missing number actually matters.
 */
export function validateStudentNumber(raw: string | null | undefined): StudentNumberValidation {
    if (raw === null || raw === undefined) return { ok: true, value: null, error: null };

    // Full-width and en/em dashes are common when this is pasted from a
    // registration form or a spreadsheet; treat them as the plain hyphen.
    const text = String(raw)
        .replace(/[‐-―－]/g, '-')
        .replace(/\s+/g, '')
        .trim();

    if (text === '') return { ok: true, value: null, error: null };

    const match = STUDENT_NUMBER_PATTERN.exec(text);
    if (!match) {
        return {
            ok: false,
            value: null,
            error: 'Use the format printed on your registration form, e.g. 2023-24610795.',
        };
    }

    const year = Number(match[1]);
    // An admission year in the future, or before the college existed, is a
    // typo rather than a real number.
    if (year < MIN_YEAR || year > new Date().getFullYear() + 1) {
        return { ok: false, value: null, error: `${match[1]} is not a valid admission year.` };
    }

    return { ok: true, value: text, error: null };
}

/** The stored form, for comparing two numbers or keying a lookup. */
export const normaliseStudentNumber = (raw: string | null | undefined): string | null =>
    validateStudentNumber(raw).value;

/** Is this student number already used by a different student in the list? */
export function findDuplicateStudentNumber<T>(
    entries: Array<{ key: T; studentNumber: string | null }>,
): T | null {
    const seen = new Map<string, T>();
    for (const entry of entries) {
        const value = normaliseStudentNumber(entry.studentNumber);
        if (!value) continue;
        if (seen.has(value)) return entry.key;
        seen.set(value, entry.key);
    }
    return null;
}
