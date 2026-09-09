import { supabase } from '../lib/supabaseClient';
import { createAuditLog } from './auditService';
import {
    TemplateFileError,
    buildTemplatePath,
    hasPdfSignature,
    validatePdfMetadata,
    type EvaluationDocumentType,
    type EvaluationScoreKey,
    type EvaluationScores,
    type EvaluationStatus,
} from '../utils/evaluationForms';

/**
 * The company-based evaluation workflow.
 *
 *     coordinator publishes ONE template per company
 *              -> the system generates one evaluation per assigned student
 *              -> the company answers each one in the portal
 *              -> student, adviser and coordinator are told
 *
 * Nothing here fans a document out per student, and nothing here decides who
 * gets notified: `publish_evaluation_template()` and `save_evaluation_draft()`
 * resolve the company roster, the adviser and the recipients server-side from
 * the relationships that already exist. The client never supplies an address and
 * never picks a student.
 */

export interface EvaluationCompany {
    company_id: string;
    company_name: string;
    student_count: number;
    templates_on_file: number;
    has_evaluation: boolean;
    /** Without a portal account nobody at the company can sign in to evaluate. */
    has_portal_account: boolean;
    evaluation_deadline: string | null;
    submitted_count: number;
    total_evaluations: number;
}

export interface CompanyTemplate {
    document_type: EvaluationDocumentType;
    title: string;
    template_id: string | null;
    file_name: string | null;
    file_path: string | null;
    file_size: number | null;
    version: number | null;
    is_digital_form: boolean;
    evaluation_deadline: string | null;
    uploaded_at: string | null;
    uploaded_by_name: string | null;
    previous_versions: number;
}

export interface EvaluationWorklistRow {
    evaluation_id: string | null;
    student_id: string;
    student_name: string | null;
    student_email: string | null;
    course: string | null;
    section: string | null;
    status: EvaluationStatus;
    started_at: string | null;
    submitted_at: string | null;
    total_score: number | null;
    overall_rating: number | null;
    evaluator_name: string | null;
    template_id: string | null;
    evaluation_deadline: string | null;
}

export interface StudentEvaluation {
    evaluation_id: string | null;
    student_id: string;
    student_name: string | null;
    company_id: string | null;
    company_name: string | null;
    evaluator_name: string | null;
    status: EvaluationStatus;
    submitted_at: string | null;
    total_score: number | null;
    overall_rating: number | null;
    /** Null until the company submits — a half-filled draft is not a result. */
    scores: EvaluationScores | null;
    comments: string | null;
    strengths: string | null;
    weaknesses: string | null;
    recommendations: string | null;
    template_id: string | null;
    template_file_path: string | null;
    evaluation_deadline: string | null;
}

export interface AdviserEvaluationRow {
    evaluation_id: string | null;
    student_id: string;
    student_name: string | null;
    section: string | null;
    company_name: string | null;
    evaluator_name: string | null;
    status: EvaluationStatus;
    submitted_at: string | null;
    total_score: number | null;
    comments: string | null;
}

export interface EvaluationAnswers {
    scores: EvaluationScores;
    comments?: string | null;
    strengths?: string | null;
    weaknesses?: string | null;
    recommendations?: string | null;
}

/** Everything the browser can check before a byte of the template is uploaded. */
export async function validateTemplateFile(file: File): Promise<void> {
    validatePdfMetadata({ name: file.name, type: file.type, size: file.size });
    const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (!hasPdfSignature(header)) {
        throw new TemplateFileError('That file is not a readable PDF. Please upload another copy.');
    }
}

export const evaluationService = {
    validateFile: validateTemplateFile,

    // ── Coordinator ─────────────────────────────────────────────────────────

    /** Companies the coordinator can publish for, with their completion counts. */
    async getCompanies(): Promise<EvaluationCompany[]> {
        const { data, error } = await supabase.rpc('get_evaluation_companies');
        if (error) throw error;
        return (data || []) as EvaluationCompany[];
    },

    /** The three document slots for one company. */
    async getCompanyTemplates(companyId: string): Promise<CompanyTemplate[]> {
        const { data, error } = await supabase.rpc('get_company_templates', { p_company_id: companyId });
        if (error) throw error;
        return (data || []) as CompanyTemplate[];
    },

    /**
     * Publish the official document for a company — once, for every student it
     * hosts. Replacing one archives the version it supersedes rather than
     * overwriting it, so evaluations already answered still resolve to the
     * document they were answered from.
     */
    async publishTemplate(
        companyId: string,
        documentType: EvaluationDocumentType,
        file: File,
        deadline?: string | null,
    ): Promise<{ templateId: string; version: number }> {
        await validateTemplateFile(file);

        const filePath = buildTemplatePath(companyId, documentType, crypto.randomUUID());

        const { error: uploadError } = await supabase.storage
            .from('company_documents')
            .upload(filePath, file, { contentType: 'application/pdf', upsert: false });
        if (uploadError) throw uploadError;

        const { data, error } = await supabase.rpc('publish_evaluation_template', {
            p_company_id: companyId,
            p_document_type: documentType,
            p_file_path: filePath,
            p_file_name: file.name,
            p_file_type: 'application/pdf',
            p_file_size: file.size,
            p_deadline: deadline || null,
        });

        if (error) {
            // Nothing was published, so nothing must be left in the bucket — and
            // nobody has been notified, which is why the record comes second.
            await supabase.storage.from('company_documents').remove([filePath]).catch(() => undefined);
            throw error;
        }

        const template = (Array.isArray(data) ? data[0] : data) as { id: string; version: number };

        await createAuditLog({
            action: 'UPLOAD',
            module: 'Evaluations',
            description: template.version > 1
                ? `Published version ${template.version} of the ${documentType.replace('_', ' ')} for a company`
                : `Published the official ${documentType.replace('_', ' ')} for a company`,
            targetType: 'evaluation_template',
            targetId: template.id,
        }).catch(() => undefined);

        return { templateId: template.id, version: template.version };
    },

    // ── Shared worklist (company portal and coordinator monitoring) ─────────

    /**
     * One row per student the company hosts, with where their evaluation stands.
     *
     * Reading it also materialises evaluations for students assigned since the
     * template was published, which is why nobody has to re-publish to pick up a
     * new intern.
     */
    async getWorklist(companyId: string): Promise<EvaluationWorklistRow[]> {
        const { data, error } = await supabase.rpc('get_company_evaluation_worklist', { p_company_id: companyId });
        if (error) throw error;
        return (data || []) as EvaluationWorklistRow[];
    },

    // ── Company ─────────────────────────────────────────────────────────────

    /** Save progress without submitting. Safe to call as often as you like. */
    async saveDraft(evaluationId: string, answers: EvaluationAnswers): Promise<void> {
        const { error } = await supabase.rpc('save_evaluation_draft', {
            p_evaluation_id: evaluationId,
            p_scores: answers.scores,
            p_comments: answers.comments ?? null,
            p_strengths: answers.strengths ?? null,
            p_weaknesses: answers.weaknesses ?? null,
            p_recommendations: answers.recommendations ?? null,
            p_submit: false,
        });
        if (error) throw error;
    },

    /**
     * Submit. The server re-checks that every criterion is rated, computes the
     * score and notifies the student, their adviser and the coordinators — so a
     * submission cannot be recorded without the people who need it being told.
     */
    async submit(evaluationId: string, answers: EvaluationAnswers): Promise<{ totalScore: number | null }> {
        const { data, error } = await supabase.rpc('save_evaluation_draft', {
            p_evaluation_id: evaluationId,
            p_scores: answers.scores,
            p_comments: answers.comments ?? null,
            p_strengths: answers.strengths ?? null,
            p_weaknesses: answers.weaknesses ?? null,
            p_recommendations: answers.recommendations ?? null,
            p_submit: true,
        });
        if (error) throw error;

        const row = (Array.isArray(data) ? data[0] : data) as { id: string; total_score: number | null };

        await createAuditLog({
            action: 'SUBMIT',
            module: 'Evaluations',
            description: 'Submitted the SIL/OJT evaluation for a student',
            targetType: 'evaluation',
            targetId: row?.id ?? evaluationId,
            newValues: { total_score: row?.total_score },
        }).catch(() => undefined);

        return { totalScore: row?.total_score ?? null };
    },

    /** The saved answers for one evaluation, so a draft reopens where it was left. */
    async getEvaluation(evaluationId: string): Promise<{
        scores: EvaluationScores;
        comments: string | null;
        strengths: string | null;
        weaknesses: string | null;
        recommendations: string | null;
        status: EvaluationStatus;
    } | null> {
        const { data, error } = await supabase
            .from('evaluations')
            .select('attendance_score, punctuality_score, communication_score, professionalism_score, technical_skills_score, problem_solving_score, teamwork_score, initiative_score, adaptability_score, work_quality_score, responsibility_score, comments, strengths, weaknesses, recommendations, status')
            .eq('id', evaluationId)
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;

        const scoreKeys: EvaluationScoreKey[] = [
            'attendance_score', 'punctuality_score', 'communication_score', 'professionalism_score',
            'technical_skills_score', 'problem_solving_score', 'teamwork_score', 'initiative_score',
            'adaptability_score', 'work_quality_score', 'responsibility_score',
        ];

        const record = data as Record<string, unknown>;
        const scores: EvaluationScores = {};
        for (const key of scoreKeys) scores[key] = (record[key] as number | null) ?? null;

        return {
            scores,
            comments: (record.comments as string | null) ?? null,
            strengths: (record.strengths as string | null) ?? null,
            weaknesses: (record.weaknesses as string | null) ?? null,
            recommendations: (record.recommendations as string | null) ?? null,
            status: (record.status as EvaluationStatus) ?? 'not_started',
        };
    },

    // ── Student and adviser ─────────────────────────────────────────────────

    async getStudentEvaluation(studentId: string): Promise<StudentEvaluation | null> {
        const { data, error } = await supabase.rpc('get_student_evaluation', { p_student_id: studentId });
        if (error) throw error;
        const rows = (data || []) as StudentEvaluation[];
        return rows.length > 0 ? rows[0] : null;
    },

    async getAdviserEvaluations(): Promise<AdviserEvaluationRow[]> {
        const { data, error } = await supabase.rpc('get_adviser_evaluations');
        if (error) throw error;
        return (data || []) as AdviserEvaluationRow[];
    },

    /** Acknowledge a submitted result. Never changes what the company answered. */
    async markReviewed(evaluationId: string): Promise<void> {
        const { error } = await supabase.rpc('mark_evaluation_reviewed', { p_evaluation_id: evaluationId });
        if (error) throw error;
    },

    // ── The official PDF ────────────────────────────────────────────────────

    /**
     * A short-lived link to the official document. The bucket is private, so
     * this is the only way to open one, and the storage policies decide whether
     * the caller gets a link at all.
     */
    async getTemplateUrl(filePath: string, expiresInSeconds = 60 * 60): Promise<string> {
        const { data, error } = await supabase.storage
            .from('company_documents')
            .createSignedUrl(filePath, expiresInSeconds);
        if (error) throw error;
        return data.signedUrl;
    },

    async getTemplateDownloadUrl(filePath: string, fileName: string): Promise<string> {
        const { data, error } = await supabase.storage
            .from('company_documents')
            .createSignedUrl(filePath, 60 * 60, { download: fileName });
        if (error) throw error;
        return data.signedUrl;
    },
};
