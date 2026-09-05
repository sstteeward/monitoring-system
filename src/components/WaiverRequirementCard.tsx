import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    requirementService,
    FileValidationError,
    formatFileSize,
    ACCEPT_ATTRIBUTE,
    STATUS_LABEL,
    type RequirementDocument,
} from '../services/requirementService';
import { downloadWaiverForm, openWaiverFormForPrinting, type WaiverFormData } from '../utils/waiverTemplate';
import { profileService } from '../services/profileService';
import './Requirements.css';

/**
 * Parent's Clearance & Waiver — the student's side.
 *
 * This is a documentation workflow, not an e-signature one: the student
 * downloads the official form, signs it on paper with their parent or guardian,
 * photographs or scans it, and uploads the copy for a coordinator to verify.
 * The printed, signed page stays the official document.
 */

interface WaiverRequirementCardProps {
    /** Called whenever the requirement's status changes, so a checklist can refresh. */
    onStatusChange?: (document: RequirementDocument | null) => void;
}

const SUBMIT_REMINDER =
    'Please make sure the entire document is visible, clear, readable, dated, and signed by '
    + 'both the student and parent/guardian.';

const CHECKLIST = [
    'All required fields are completed',
    'Student signature is visible',
    'Parent/Guardian signature is visible',
    'The document is dated',
    'The entire document is captured',
    'Text is readable and the photo is not blurry',
];

/** The physical-signature workflow, spelled out so nobody assumes e-signing. */
const INSTRUCTIONS = [
    'Download the official waiver.',
    'Print the form.',
    'Complete the required information.',
    'Student and parent/legitimate guardian must physically sign the document.',
    'Take a clear photo or scan of the completed document.',
    'Upload the signed document to the system.',
    'Submit it for verification.',
];

function formatDateTime(value: string | null | undefined) {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
}

const WaiverRequirementCard: React.FC<WaiverRequirementCardProps> = ({ onStatusChange }) => {
    const [document_, setDocument] = useState<RequirementDocument | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [pendingPreview, setPendingPreview] = useState<string | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [dragActive, setDragActive] = useState(false);

    const [viewerUrl, setViewerUrl] = useState<string | null>(null);
    const [viewerLoading, setViewerLoading] = useState(false);
    const [showRemarks, setShowRemarks] = useState(false);
    const [downloadingForm, setDownloadingForm] = useState(false);

    const [formData, setFormData] = useState<WaiverFormData>({});

    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const record = await requirementService.getMyRequirement();
            setDocument(record);
            onStatusChange?.(record);
        } catch (err) {
            console.error('Failed to load the waiver requirement:', err);
            setLoadError(err instanceof Error ? err.message : 'We could not load this requirement.');
        } finally {
            setLoading(false);
        }
        // onStatusChange is often an inline callback; re-running on it would loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { void load(); }, [load]);

    // Everything the school already knows is printed onto the blank form, so the
    // student never retypes it. Signature lines are always left empty.
    useEffect(() => {
        profileService.getCurrentProfile()
            .then(profile => {
                if (!profile) return;
                setFormData({
                    studentName: [profile.first_name, profile.middle_name, profile.last_name]
                        .filter(Boolean).join(' ').trim() || null,
                    companyName: profile.company?.name ?? null,
                    course: profile.course ?? null,
                    section: profile.section ?? null,
                });
            })
            .catch(err => console.error('Could not load your details for the waiver form:', err));
    }, []);

    // An object URL is a live handle on the chosen file; drop it when it changes.
    useEffect(() => () => {
        if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    }, [pendingPreview]);

    const status = document_?.status ?? 'not_submitted';
    const isApproved = status === 'approved';
    const needsRevision = status === 'revision_required' || status === 'rejected';

    const chooseFile = async (file: File | null | undefined) => {
        if (!file) return;
        setFileError(null);
        setChecking(true);
        try {
            // Validate before showing a preview, so a bad file is caught while the
            // student still has the original in front of them.
            await requirementService.validateFile(file);
            if (pendingPreview) URL.revokeObjectURL(pendingPreview);
            setPendingFile(file);
            setPendingPreview(URL.createObjectURL(file));
        } catch (err) {
            setPendingFile(null);
            setPendingPreview(null);
            setFileError(err instanceof FileValidationError || err instanceof Error
                ? err.message
                : 'We could not read that file. Please try another copy.');
        } finally {
            setChecking(false);
            // Allow re-picking the same file after an error.
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (cameraInputRef.current) cameraInputRef.current.value = '';
        }
    };

    const clearPending = () => {
        if (pendingPreview) URL.revokeObjectURL(pendingPreview);
        setPendingFile(null);
        setPendingPreview(null);
        setFileError(null);
    };

    const submit = async () => {
        if (!pendingFile) return;
        setSubmitting(true);
        setFileError(null);
        try {
            const saved = await requirementService.submitRequirement(pendingFile);
            clearPending();
            setDocument(saved);
            onStatusChange?.(saved);
        } catch (err) {
            console.error('Failed to submit the waiver:', err);
            setFileError(err instanceof Error ? err.message : 'The upload failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const openStoredDocument = async () => {
        if (!document_) return;
        setViewerLoading(true);
        try {
            setViewerUrl(await requirementService.getFileUrl(document_.file_path));
        } catch (err) {
            console.error('Failed to open the stored document:', err);
            setFileError('We could not open your uploaded document. Please try again.');
        } finally {
            setViewerLoading(false);
        }
    };

    const downloadForm = async () => {
        setDownloadingForm(true);
        try {
            await downloadWaiverForm(formData);
            void requirementService.logTemplateDownload();
        } finally {
            setDownloadingForm(false);
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        void chooseFile(e.dataTransfer.files?.[0]);
    };

    if (loading) {
        return (
            <section className="req-card">
                <div className="req-skeleton req-skeleton-title" />
                <div className="req-skeleton req-skeleton-line" />
                <div className="req-skeleton req-skeleton-line short" />
                <div className="req-skeleton req-skeleton-actions" />
            </section>
        );
    }

    return (
        <section className="req-card" aria-labelledby="req-waiver-title">
            <header className="req-head">
                <div className="req-head-main">
                    <span className="req-icon" aria-hidden="true">📄</span>
                    <div>
                        <h3 id="req-waiver-title" className="req-title">Parent&apos;s Clearance &amp; Waiver Form</h3>
                        <p className="req-sub">Required OJT/SIL document</p>
                    </div>
                </div>
                <span className={`req-status req-status-${status}`}>
                    <span className="req-status-dot" aria-hidden="true" />
                    {STATUS_LABEL[status]}
                </span>
            </header>

            {loadError && (
                <div className="req-alert req-alert-error" role="alert">
                    <span>{loadError}</span>
                    <button type="button" className="req-btn req-btn-quiet" onClick={() => void load()}>Try again</button>
                </div>
            )}

            <p className="req-desc">
                Please download the official waiver form, complete it with your parent/guardian, sign
                the document, then upload a clear photo, scanned copy, or PDF of the completed form.
            </p>

            {!isApproved && (
                <details className="req-instructions">
                    <summary>How to complete this requirement</summary>
                    <ol>{INSTRUCTIONS.map(step => <li key={step}>{step}</li>)}</ol>
                    <p className="req-note">
                        This is <strong>not</strong> an electronic signature workflow. The student and
                        parent/guardian must physically sign the printed document. The uploaded
                        photo or PDF is for digital documentation, record keeping and verification.
                    </p>
                </details>
            )}

            {/* ── Approved ─────────────────────────────────────────────────── */}
            {isApproved && (
                <div className="req-panel req-panel-approved">
                    <div className="req-panel-head">
                        <strong>✓ Approved</strong>
                        <span className="req-locked">Locked</span>
                    </div>
                    <dl className="req-meta">
                        <div><dt>File</dt><dd>{document_?.file_name}</dd></div>
                        <div><dt>Submitted</dt><dd>{formatDateTime(document_?.submitted_at)}</dd></div>
                        <div><dt>Approved</dt><dd>{formatDateTime(document_?.reviewed_at)}</dd></div>
                    </dl>
                    <p className="req-note">
                        This requirement is complete. The document can no longer be replaced unless a
                        coordinator requests a revision.
                    </p>
                </div>
            )}

            {/* ── Revision required ────────────────────────────────────────── */}
            {needsRevision && (
                <div className="req-panel req-panel-revision">
                    <div className="req-panel-head"><strong>⚠ Revision Required</strong></div>
                    {showRemarks ? (
                        <blockquote className="req-remarks">
                            <span className="req-remarks-label">Coordinator remarks</span>
                            {document_?.reviewer_remarks || 'No remarks were recorded.'}
                        </blockquote>
                    ) : (
                        <button type="button" className="req-btn req-btn-quiet" onClick={() => setShowRemarks(true)}>
                            View remarks
                        </button>
                    )}
                    <p className="req-note">Reviewed {formatDateTime(document_?.reviewed_at)}</p>
                </div>
            )}

            {/* ── For verification ─────────────────────────────────────────── */}
            {status === 'pending' && document_ && (
                <div className="req-panel">
                    <dl className="req-meta">
                        <div><dt>File</dt><dd>{document_.file_name}</dd></div>
                        <div><dt>Size</dt><dd>{formatFileSize(document_.file_size)}</dd></div>
                        <div><dt>Submitted</dt><dd>{formatDateTime(document_.submitted_at)}</dd></div>
                    </dl>
                    <p className="req-note">
                        Your waiver is waiting for a coordinator to verify it. You can still replace it
                        while it is under review.
                    </p>
                </div>
            )}

            {/* ── Staged file, awaiting an explicit submit ──────────────────── */}
            {pendingFile && !isApproved && (
                <div className="req-panel req-preview">
                    <div className="req-preview-media">
                        {pendingFile.type === 'application/pdf' ? (
                            <object data={pendingPreview ?? ''} type="application/pdf" aria-label="Selected PDF preview">
                                <div className="req-preview-fallback">
                                    <span aria-hidden="true">📄</span>
                                    <span>PDF ready to submit</span>
                                    <a href={pendingPreview ?? '#'} target="_blank" rel="noopener noreferrer">Open preview</a>
                                </div>
                            </object>
                        ) : (
                            <img src={pendingPreview ?? ''} alt="Preview of the waiver you selected" />
                        )}
                    </div>

                    <dl className="req-meta">
                        <div><dt>File</dt><dd>{pendingFile.name}</dd></div>
                        <div><dt>Size</dt><dd>{formatFileSize(pendingFile.size)}</dd></div>
                        <div><dt>Selected</dt><dd>{formatDateTime(new Date().toISOString())}</dd></div>
                    </dl>

                    <div className="req-checklist">
                        <span className="req-checklist-title">Before submitting, make sure:</span>
                        <ul>{CHECKLIST.map(item => <li key={item}>{item}</li>)}</ul>
                        <p className="req-checklist-note">{SUBMIT_REMINDER}</p>
                    </div>

                    <div className="req-actions">
                        <button type="button" className="req-btn req-btn-primary" onClick={() => void submit()} disabled={submitting}>
                            {submitting ? 'Submitting…' : 'Submit for Verification'}
                        </button>
                        <button type="button" className="req-btn req-btn-quiet" onClick={() => fileInputRef.current?.click()} disabled={submitting}>
                            Replace File
                        </button>
                        <button type="button" className="req-btn req-btn-quiet" onClick={clearPending} disabled={submitting}>
                            Remove
                        </button>
                    </div>
                </div>
            )}

            {fileError && <div className="req-alert req-alert-error" role="alert">{fileError}</div>}

            {/* ── Upload surface ───────────────────────────────────────────── */}
            {!isApproved && !pendingFile && (
                <div
                    className={`req-drop${dragActive ? ' is-active' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={onDrop}
                >
                    <p className="req-drop-title">
                        Upload a clear and readable photo or scanned copy of your signed waiver.
                    </p>
                    <p className="req-drop-hint">JPG, PNG or PDF · up to 10 MB</p>
                    <div className="req-drop-actions">
                        <button type="button" className="req-btn req-btn-primary req-btn-lg" onClick={() => cameraInputRef.current?.click()} disabled={checking}>
                            📷 Take Photo
                        </button>
                        <button type="button" className="req-btn req-btn-quiet req-btn-lg" onClick={() => fileInputRef.current?.click()} disabled={checking}>
                            Choose File
                        </button>
                    </div>
                    {checking && <p className="req-drop-hint">Checking your file…</p>}
                    <p className="req-drop-desktop">or drag and drop the file here</p>
                </div>
            )}

            {/* One input opens the camera on a phone; the other browses files. */}
            <input
                ref={cameraInputRef}
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                capture="environment"
                className="req-file-input"
                onChange={e => void chooseFile(e.target.files?.[0])}
            />
            <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                className="req-file-input"
                onChange={e => void chooseFile(e.target.files?.[0])}
            />

            <div className="req-actions req-actions-footer">
                <button type="button" className="req-btn req-btn-quiet" onClick={() => void downloadForm()} disabled={downloadingForm}>
                    {downloadingForm ? 'Preparing…' : 'Download Official Form'}
                </button>
                <button type="button" className="req-btn req-btn-ghost" onClick={() => openWaiverFormForPrinting(formData)}>
                    Print
                </button>
                {document_ && (
                    <button type="button" className="req-btn req-btn-quiet" onClick={() => void openStoredDocument()} disabled={viewerLoading}>
                        {viewerLoading ? 'Opening…' : 'View Document'}
                    </button>
                )}
            </div>

            {viewerUrl && (
                <div className="req-viewer-overlay" onClick={() => setViewerUrl(null)} role="presentation">
                    <div className="req-viewer" role="dialog" aria-modal="true" aria-label="Your uploaded waiver" onClick={e => e.stopPropagation()}>
                        <header className="req-viewer-head">
                            <strong>{document_?.file_name}</strong>
                            <div className="req-actions">
                                <a className="req-btn req-btn-quiet" href={viewerUrl} target="_blank" rel="noopener noreferrer">Download</a>
                                <button type="button" className="req-btn req-btn-ghost" onClick={() => setViewerUrl(null)}>Close</button>
                            </div>
                        </header>
                        <div className="req-viewer-body">
                            {document_?.file_type === 'application/pdf'
                                ? <iframe src={viewerUrl} title="Uploaded waiver" />
                                : <img src={viewerUrl} alt="Your uploaded waiver" />}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default WaiverRequirementCard;
