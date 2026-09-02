/**
 * Section naming rules, shared by onboarding and section management.
 *
 * A section name encodes three things: Course code + Year level + Section letter.
 *   DIT + 3rd Year + A  →  "DIT-3A"
 *
 * That name is the value stored in `profiles.section` and in `sections.name`,
 * so these helpers are the single place that composes and decomposes it. Every
 * course/year combination supports section letters A through J.
 */

/** Every section letter a course/year combination can have. */
export const SECTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;

/** Year levels offered in onboarding, in order. */
export const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'] as const;

/** Year numbers a generated section name can use. */
export const SECTION_YEARS = [1, 2, 3, 4] as const;

/** A row from the `sections` table (only the columns these helpers need). */
export interface SectionRow {
    id?: string;
    name: string;
    course_code?: string | null;
}

export interface ParsedSectionName {
    courseCode: string;
    year: number;
    letter: string;
}

export interface SectionOption {
    value: string;
    label: string;
}

/** "3rd Year" → 3. Also accepts a bare "3". Returns null when unset/unknown. */
export function yearNumberFromLevel(yearLevel: string | null | undefined): number | null {
    if (!yearLevel) return null;
    const match = String(yearLevel).match(/(\d+)/);
    if (!match) return null;
    const year = Number(match[1]);
    return Number.isFinite(year) && year > 0 ? year : null;
}

/**
 * Normalises a selected course into the short code used in section names.
 * Course options store the code ("DIT") when the course row has one; when only
 * a full name is available there is no code to derive, so this returns ''.
 */
export function courseCodeFromValue(course: string | null | undefined): string {
    const value = (course ?? '').trim().toUpperCase();
    return /^[A-Z0-9]{2,10}$/.test(value) ? value : '';
}

/** "DIT-3A" → { courseCode: 'DIT', year: 3, letter: 'A' }. Null if it is not a generated name. */
export function parseSectionName(name: string | null | undefined): ParsedSectionName | null {
    const match = (name ?? '').trim().toUpperCase().match(/^([A-Z0-9]{2,10})-(\d)([A-Z])$/);
    if (!match) return null;
    return { courseCode: match[1], year: Number(match[2]), letter: match[3] };
}

/** Composes "DIT-3A" from its parts. */
export function buildSectionName(courseCode: string, year: number, letter: string): string {
    return `${courseCode.trim().toUpperCase()}-${year}${letter.trim().toUpperCase()}`;
}

const optionFor = (name: string, courseCode: string): SectionOption => ({
    value: name,
    label: courseCode ? `${name} (${courseCode})` : name,
});

/** Does a stored section row belong to the given course code? */
function rowMatchesCourse(row: SectionRow, courseCode: string): boolean {
    if (!courseCode) return true;
    const code = (row.course_code ?? '').trim().toUpperCase();
    if (code && (code === courseCode || courseCode.includes(code))) return true;
    // Fall back to the name itself for rows with a missing/short course_code.
    return parseSectionName(row.name)?.courseCode === courseCode;
}

interface BuildSectionOptionsArgs {
    /** The course value selected in the form (a code such as "DIT"). */
    course?: string | null;
    /** The year level selected in the form ("3rd Year"). */
    yearLevel?: string | null;
    /** Rows loaded from the `sections` table, if any. */
    sections?: SectionRow[];
    /** Currently saved value — always kept selectable so nothing is silently dropped. */
    currentValue?: string | null;
}

/**
 * Section choices for the onboarding dropdown.
 *
 * Letters A–J are offered for the selected course + year level whether or not a
 * row exists in `sections` yet, so a database that has only been seeded with
 * A–C still presents the full range. Stored rows that fall outside the A–J
 * pattern (legacy or coordinator-created names) are appended, never lost.
 */
export function buildSectionOptions({
    course,
    yearLevel,
    sections = [],
    currentValue,
}: BuildSectionOptionsArgs): SectionOption[] {
    const courseCode = courseCodeFromValue(course);
    const year = yearNumberFromLevel(yearLevel);

    const options: SectionOption[] = [];
    const seen = new Set<string>();
    const add = (option: SectionOption) => {
        const key = option.value.toUpperCase();
        if (seen.has(key)) return;
        seen.add(key);
        options.push(option);
    };

    if (courseCode) {
        // Generate A–J for the selected year, or for every year when the student
        // has not picked one yet.
        const years = year ? [year] : [...SECTION_YEARS];
        for (const y of years) {
            for (const letter of SECTION_LETTERS) {
                add(optionFor(buildSectionName(courseCode, y, letter), courseCode));
            }
        }
    }

    // Keep any stored section that the generated range does not cover.
    for (const row of sections) {
        if (!row?.name) continue;
        if (!rowMatchesCourse(row, courseCode)) continue;
        const parsed = parseSectionName(row.name);
        if (courseCode && year && parsed && parsed.year !== year) continue;
        add(optionFor(row.name, (row.course_code ?? parsed?.courseCode ?? '').toUpperCase()));
    }

    // Without a course we cannot generate names, so offer whatever is stored.
    if (options.length === 0) {
        for (const row of sections) {
            if (!row?.name) continue;
            add(optionFor(row.name, (row.course_code ?? '').toUpperCase()));
        }
    }

    // Never drop the value the student already has saved.
    if (currentValue?.trim()) {
        const parsed = parseSectionName(currentValue);
        add(optionFor(currentValue.trim(), parsed?.courseCode ?? ''));
    }

    return options;
}
