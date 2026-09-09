/**
 * The SIL/OJT evaluation, as a form rather than a PDF.
 *
 * The coordinator uploads the official document once per company; the company
 * then answers it inside the portal. These are the rules both halves of that
 * share — what the criteria are, how a rating turns into a score, and what a
 * template upload is allowed to be — so the browser and the database agree
 * without either trusting the other (see supabase_evaluation_templates.sql).
 */

export type EvaluationDocumentType = 'evaluation' | 'annex_b' | 'annex_c';

export const EVALUATION_DOCUMENT_TYPES: EvaluationDocumentType[] = ['evaluation', 'annex_b', 'annex_c'];

export const DOCUMENT_LABEL: Record<EvaluationDocumentType, string> = {
    evaluation: 'Evaluation',
    annex_b: 'Annex B',
    annex_c: 'Annex C',
};

/**
 * Only the evaluation is answered in the system. Annex B and Annex C are filed
 * as the official reference documents they are — turning every PDF into a form
 * would invent questions nobody asked for.
 */
export const DOCUMENT_DESCRIPTION: Record<EvaluationDocumentType, string> = {
    evaluation: 'Completed digitally by the company for each assigned student.',
    annex_b: 'Reference document. Companies and students can view and download it.',
    annex_c: 'Reference document. Companies and students can view and download it.',
};

export function isDigitalForm(type: EvaluationDocumentType): boolean {
    return type === 'evaluation';
}

// ─── The rubric ──────────────────────────────────────────────────────────────

/** One scored criterion. The keys are the columns on public.evaluations. */
export interface EvaluationCriterion {
    key: EvaluationScoreKey;
    label: string;
    hint: string;
}

export type EvaluationScoreKey =
    | 'attendance_score'
    | 'punctuality_score'
    | 'communication_score'
    | 'professionalism_score'
    | 'technical_skills_score'
    | 'problem_solving_score'
    | 'teamwork_score'
    | 'initiative_score'
    | 'adaptability_score'
    | 'work_quality_score'
    | 'responsibility_score';

/**
 * The institution's eleven criteria, grouped the way the printed form reads.
 * The grouping is presentation only — every criterion carries the same weight,
 * which is what makes the overall score a plain mean.
 */
export const EVALUATION_SECTIONS: { title: string; criteria: EvaluationCriterion[] }[] = [
    {
        title: 'A. Work Performance',
        criteria: [
            { key: 'attendance_score', label: 'Attendance', hint: 'Reports for duty as scheduled.' },
            { key: 'punctuality_score', label: 'Punctuality', hint: 'Arrives and returns from breaks on time.' },
            { key: 'work_quality_score', label: 'Quality of Work', hint: 'Output is accurate and complete.' },
            { key: 'responsibility_score', label: 'Responsibility', hint: 'Sees assigned tasks through.' },
        ],
    },
    {
        title: 'B. Skills and Judgement',
        criteria: [
            { key: 'technical_skills_score', label: 'Technical Skills', hint: 'Applies the skills the role requires.' },
            { key: 'problem_solving_score', label: 'Problem Solving', hint: 'Works through difficulties sensibly.' },
            { key: 'communication_score', label: 'Communication', hint: 'Expresses and listens clearly.' },
        ],
    },
    {
        title: 'C. Professional Conduct',
        criteria: [
            { key: 'professionalism_score', label: 'Professionalism', hint: 'Conduct, grooming and courtesy.' },
            { key: 'teamwork_score', label: 'Teamwork', hint: 'Works well with the rest of the team.' },
            { key: 'initiative_score', label: 'Initiative', hint: 'Acts without waiting to be told.' },
            { key: 'adaptability_score', label: 'Adaptability', hint: 'Adjusts to new tasks and conditions.' },
        ],
    },
];

export const EVALUATION_CRITERIA: EvaluationCriterion[] =
    EVALUATION_SECTIONS.flatMap(section => section.criteria);

/** The 1-5 scale the database CHECK constraints already enforce. */
export const RATING_SCALE: { value: number; label: string }[] = [
    { value: 5, label: 'Excellent' },
    { value: 4, label: 'Very Good' },
    { value: 3, label: 'Good' },
    { value: 2, label: 'Fair' },
    { value: 1, label: 'Poor' },
];

export function ratingLabel(value: number | null | undefined): string {
    return RATING_SCALE.find(option => option.value === value)?.label ?? '—';
}

export type EvaluationScores = Partial<Record<EvaluationScoreKey, number | null>>;

/** How many of the eleven criteria carry a rating. */
export function ratedCount(scores: EvaluationScores): number {
    return EVALUATION_CRITERIA.filter(criterion => {
        const value = scores[criterion.key];
        return typeof value === 'number' && value >= 1 && value <= 5;
    }).length;
}

export function isComplete(scores: EvaluationScores): boolean {
    return ratedCount(scores) === EVALUATION_CRITERIA.length;
}

/**
 * The overall result, as the form shows it while it is being filled in.
 *
 * Deliberately the same arithmetic the database applies on submit — an unweighted
 * mean of the eleven criteria, reported both on the 1-5 scale and as a
 * percentage — so the number the evaluator watches is the number that is stored.
 * Returns null until every criterion is rated, because a mean of a subset would
 * read as a score and mean nothing.
 */
export function computeScore(scores: EvaluationScores): { rating: number; percentage: number } | null {
    if (!isComplete(scores)) return null;
    const total = EVALUATION_CRITERIA.reduce((sum, criterion) => sum + (scores[criterion.key] as number), 0);
    const rating = total / EVALUATION_CRITERIA.length;
    return {
        rating: Math.round(rating * 100) / 100,
        percentage: Math.round((rating / 5) * 100 * 100) / 100,
    };
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export type EvaluationStatus = 'not_started' | 'in_progress' | 'submitted' | 'reviewed';

export const STATUS_LABEL: Record<EvaluationStatus, string> = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    submitted: 'Submitted',
    reviewed: 'Reviewed',
};

/** Outstanding work for the company, as the dashboard counts it. */
export function isPending(status: EvaluationStatus): boolean {
    return status === 'not_started' || status === 'in_progress';
}

// ─── Deadlines ───────────────────────────────────────────────────────────────

/**
 * How a deadline reads today. Whole days in the school's own timezone rather
 * than the viewer's, so a company in another timezone is never told something is
 * overdue a day early.
 */
export function describeDeadline(
    deadline: string | null | undefined,
    now: Date = new Date(),
): { tone: 'none' | 'ok' | 'soon' | 'overdue'; text: string } {
    if (!deadline) return { tone: 'none', text: 'No deadline set' };

    const dayKey = (value: Date) =>
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', dateStyle: 'short' }).format(value);

    const today = Date.parse(`${dayKey(now)}T00:00:00Z`);
    const due = Date.parse(`${deadline.slice(0, 10)}T00:00:00Z`);
    const days = Math.round((due - today) / 86_400_000);

    if (days < 0) return { tone: 'overdue', text: days === -1 ? 'Overdue by 1 day' : `Overdue by ${-days} days` };
    if (days === 0) return { tone: 'soon', text: 'Due today' };
    if (days === 1) return { tone: 'soon', text: 'Due tomorrow' };
    return { tone: days <= 7 ? 'soon' : 'ok', text: `Due in ${days} days` };
}

export function formatDeadline(deadline: string | null | undefined): string {
    if (!deadline) return '—';
    return new Date(`${deadline.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
    });
}

// ─── The official PDF ────────────────────────────────────────────────────────

export const MAX_TEMPLATE_BYTES = 15 * 1024 * 1024;
export const TEMPLATE_ACCEPT_ATTRIBUTE = '.pdf,application/pdf';

export class TemplateFileError extends Error {}

export function formatFileSize(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * The checks that need no I/O. A browser sometimes reports an empty MIME type,
 * so the extension is a fallback rather than a second hurdle — the magic-byte
 * check is what actually proves the file is a PDF.
 */
export function validatePdfMetadata(file: { name: string; type: string; size: number }): void {
    const extensionOk = file.name.toLowerCase().endsWith('.pdf');
    const mimeOk = file.type === 'application/pdf';

    if (!mimeOk && !extensionOk) {
        throw new TemplateFileError('Only PDF files can be uploaded. Please choose a PDF.');
    }
    if (file.size === 0) {
        throw new TemplateFileError('That file is empty. Please choose another copy.');
    }
    if (file.size > MAX_TEMPLATE_BYTES) {
        throw new TemplateFileError(
            `File is too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(MAX_TEMPLATE_BYTES)}.`,
        );
    }
}

/** True when the first bytes of a file are the PDF signature, "%PDF-". */
export function hasPdfSignature(header: Uint8Array): boolean {
    const signature = [0x25, 0x50, 0x44, 0x46, 0x2d];
    if (header.length < signature.length) return false;
    return signature.every((byte, index) => header[index] === byte);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where a company's official document is stored.
 *
 * The first segment is the company's own folder in the existing
 * `company_documents` bucket, which is what makes the bucket's existing read
 * policy hand the file to that company and its students without a new rule.
 * Nothing here comes from the uploaded filename, so a crafted name cannot escape
 * the folder; the RPC re-derives this exact shape before it will record an
 * upload.
 */
export function buildTemplatePath(companyId: string, documentType: EvaluationDocumentType, fileId: string): string {
    if (!UUID.test(companyId)) throw new TemplateFileError('That company record is not valid.');
    if (!UUID.test(fileId)) throw new TemplateFileError('Could not generate a storage name for this file.');
    if (!EVALUATION_DOCUMENT_TYPES.includes(documentType)) throw new TemplateFileError('Unknown document type.');
    return `${companyId.toLowerCase()}/sil-templates/${documentType}/${fileId.toLowerCase()}.pdf`;
}
