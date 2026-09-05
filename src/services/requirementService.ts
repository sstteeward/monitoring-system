import { supabase } from '../lib/supabaseClient';
import { createAuditLog } from './auditService';

/**
 * OJT/SIL requirement documents.
 *
 * Built on the existing `student_documents` table and the private `documents`
 * storage bucket — no parallel table, no second bucket. What is new here is the
 * typed requirement: one row per student per requirement, with submission and
 * review metadata, guarded server-side (see supabase_ojt_requirements_waiver.sql).
 */

export const PARENT_CLEARANCE_WAIVER = 'PARENT_CLEARANCE_WAIVER' as const;

export type RequirementDocumentType = 'GENERAL' | typeof PARENT_CLEARANCE_WAIVER;

/**
 * Stored status values. "Not submitted" is the absence of a row rather than a
 * stored value, so it only appears in the reviewer worklist.
 */
export type RequirementStatus =
    | 'not_submitted'
    | 'pending'
    | 'approved'
    | 'revision_required'
    | 'rejected';

export interface RequirementDocument {
    id: string;
    user_id: string;
    title: string;
    file_name: string;
    file_path: string;
    file_type: string;
    file_size: number | null;
    document_type: RequirementDocumentType;
    status: RequirementStatus;
    submitted_at: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    reviewer_remarks: string | null;
    created_at: string;
    updated_at: string;
}

/** One student's standing for a requirement, including those who never submitted. */
export interface StudentRequirementRow {
    document_id: string | null;
    student_user_id: string;
    student_name: string | null;
    student_email: string | null;
    course: string | null;
    section: string | null;
    company_name: string | null;
    document_type: RequirementDocumentType;
    file_name: string | null;
    file_path: string | null;
    file_type: string | null;
    file_size: number | null;
    status: RequirementStatus;
    submitted_at: string | null;
    reviewed_by: string | null;
    reviewer_name: string | null;
    reviewed_at: string | null;
    reviewer_remarks: string | null;
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

/** What the file input advertises, including the extensions iOS reports oddly. */
export const ACCEPT_ATTRIBUTE = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';

export const STATUS_LABEL: Record<RequirementStatus, string> = {
    not_submitted: 'Not Submitted',
    pending: 'For Verification',
    approved: 'Approved',
    revision_required: 'Revision Required',
    rejected: 'Revision Required',
};

export function formatFileSize(bytes: number | null | undefined): string {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A requirement only counts as met once a reviewer has approved it. */
export function isRequirementComplete(status: RequirementStatus | null | undefined): boolean {
    return status === 'approved';
}

export class FileValidationError extends Error {}

/**
 * Reject a file before it is ever uploaded, with a message a student can act on.
 *
 * Beyond type and size this actually opens the file: a photo that failed to copy
 * off a phone, or a PDF truncated mid-transfer, passes every metadata check and
 * then arrives at the coordinator as an unreadable blob.
 */
export async function validateRequirementFile(file: File): Promise<void> {
    const name = file.name.toLowerCase();
    const extensionOk = /\.(jpe?g|png|pdf)$/.test(name);
    const mimeOk = (ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type);

    // Some Android browsers report an empty MIME type, so the extension is the
    // fallback rather than an extra hurdle.
    if (!mimeOk && !extensionOk) {
        throw new FileValidationError('Unsupported file type. Please upload a JPG, PNG, or PDF.');
    }

    if (file.size === 0) {
        throw new FileValidationError('That file is empty. Please choose another copy.');
    }

    if (file.size > MAX_FILE_BYTES) {
        throw new FileValidationError(
            `File is too large (${formatFileSize(file.size)}). Maximum size is 10 MB.`,
        );
    }

    const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');

    if (isPdf) {
        // "%PDF-" — anything else is not a PDF whatever the name says.
        const signature = String.fromCharCode(...header);
        if (signature !== '%PDF-') {
            throw new FileValidationError('Unable to read this file. Please upload another copy.');
        }
        return;
    }

    // Decoding proves the image is not truncated or corrupt.
    await new Promise<void>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            if (image.naturalWidth < 200 || image.naturalHeight < 200) {
                reject(new FileValidationError(
                    'That image is too small to read. Please take a clearer, closer photo of the whole form.',
                ));
                return;
            }
            resolve();
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new FileValidationError('Unable to read this file. Please upload another copy.'));
        };
        image.src = url;
    });
}

function extensionFor(file: File): string {
    const fromName = file.name.split('.').pop()?.toLowerCase();
    if (fromName && /^(jpe?g|png|pdf)$/.test(fromName)) return fromName;
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type === 'image/png') return 'png';
    return 'jpg';
}

export const requirementService = {
    /** Re-exported so a component can check a file before staging a preview. */
    validateFile: validateRequirementFile,

    /** The signed-in student's row for a requirement, or null if never submitted. */
    async getMyRequirement(documentType: RequirementDocumentType = PARENT_CLEARANCE_WAIVER) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('student_documents')
            .select('*')
            .eq('user_id', user.id)
            .eq('document_type', documentType)
            .maybeSingle();

        if (error) throw error;
        return (data as RequirementDocument | null) ?? null;
    },

    /**
     * Upload the signed form and put it in the verification queue.
     *
     * The upload happens first; only once the file is safely stored is the row
     * written, and a failed row write removes the orphaned file again. Replacing
     * an existing submission also clears the old file so the bucket does not
     * accumulate superseded copies.
     */
    async submitRequirement(
        file: File,
        documentType: RequirementDocumentType = PARENT_CLEARANCE_WAIVER,
        title = "Parent's Clearance & Waiver",
    ): Promise<RequirementDocument> {
        await validateRequirementFile(file);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('You need to be signed in to upload a requirement.');

        const existing = await this.getMyRequirement(documentType);
        if (existing?.status === 'approved') {
            throw new Error('This requirement has been approved and can no longer be replaced.');
        }

        const filePath = `${user.id}/waiver/${crypto.randomUUID()}.${extensionFor(file)}`;

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, file, {
                contentType: file.type || 'application/octet-stream',
                upsert: false,
            });
        if (uploadError) throw uploadError;

        const payload = {
            user_id: user.id,
            title,
            document_type: documentType,
            file_name: file.name,
            file_path: filePath,
            file_type: file.type || 'application/octet-stream',
            file_size: file.size,
        };

        const { data, error } = existing
            ? await supabase.from('student_documents').update(payload).eq('id', existing.id).select().single()
            : await supabase.from('student_documents').insert(payload).select().single();

        if (error) {
            await supabase.storage.from('documents').remove([filePath]).catch(() => undefined);
            throw error;
        }

        // The superseded file is only removed once the row points at the new one.
        if (existing?.file_path && existing.file_path !== filePath) {
            await supabase.storage.from('documents').remove([existing.file_path]).catch(() => undefined);
        }

        await createAuditLog({
            action: 'SUBMIT',
            module: 'Documents',
            description: existing
                ? `Replaced ${title} and resubmitted it for verification`
                : `Submitted ${title} for verification`,
            targetType: 'student_document',
            targetId: (data as RequirementDocument).id,
        }).catch(() => undefined);

        return data as RequirementDocument;
    },

    /** Withdraw a submission that has not been approved. */
    async withdrawRequirement(document: RequirementDocument) {
        const { error } = await supabase
            .from('student_documents')
            .delete()
            .eq('id', document.id);
        if (error) throw error;

        await supabase.storage.from('documents').remove([document.file_path]).catch(() => undefined);

        await createAuditLog({
            action: 'DELETE',
            module: 'Documents',
            description: `Removed ${document.title} submission`,
            targetType: 'student_document',
            targetId: document.id,
        }).catch(() => undefined);

        return true;
    },

    /**
     * A short-lived link to a stored document. The bucket is private, so this is
     * the only way to view one, and RLS decides whether the caller gets a link.
     */
    async getFileUrl(filePath: string, expiresInSeconds = 60 * 60) {
        const { data, error } = await supabase.storage
            .from('documents')
            .createSignedUrl(filePath, expiresInSeconds);
        if (error) throw error;
        return data.signedUrl;
    },

    /** Reviewer worklist: every student, submitted or not. */
    async getStudentRequirements(documentType: RequirementDocumentType = PARENT_CLEARANCE_WAIVER) {
        const { data, error } = await supabase
            .rpc('get_student_requirements', { p_document_type: documentType });
        if (error) throw error;
        return (data || []) as StudentRequirementRow[];
    },

    /**
     * Approve a submission, or send it back with a reason. Authorization and the
     * "a revision must explain itself" rule are enforced inside the RPC, which
     * also notifies the student.
     */
    async reviewRequirement(documentId: string, decision: 'approved' | 'revision_required', remarks?: string) {
        const { data, error } = await supabase.rpc('review_student_document', {
            p_document_id: documentId,
            p_decision: decision,
            p_remarks: remarks ?? null,
        });
        if (error) throw error;

        await createAuditLog({
            action: decision === 'approved' ? 'APPROVE' : 'REJECT',
            module: 'Documents',
            description: decision === 'approved'
                ? 'Approved a student OJT requirement'
                : `Requested a revision on a student OJT requirement: ${remarks ?? ''}`.trim(),
            targetType: 'student_document',
            targetId: documentId,
        }).catch(() => undefined);

        return data as RequirementDocument;
    },

    /** Recorded so a coordinator can see who has actually collected the form. */
    async logTemplateDownload() {
        await createAuditLog({
            action: 'DOWNLOAD',
            module: 'Documents',
            description: "Downloaded the official Parent's Clearance & Waiver form",
            targetType: 'student_document',
        }).catch(() => undefined);
    },
};
