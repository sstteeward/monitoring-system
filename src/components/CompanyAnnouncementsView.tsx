import React, { useEffect, useRef, useState } from 'react';
import { companyService, type AnnouncementInput } from '../services/companyService';
import { profileService } from '../services/profileService';
import { notificationService, type Announcement } from '../services/notificationService';
import AnnouncementsBoard from './AnnouncementsBoard';
import './AnnouncementsView.css';
import './CompanyAnnouncementsView.css';

const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try { return JSON.stringify(err); } catch { return 'Unknown error'; }
};

interface FormState {
    title: string;
    content: string;
}

const EMPTY_FORM: FormState = { title: '', content: '' };

/**
 * Company portal announcements — the shared {@link AnnouncementsBoard} plus the
 * company's own compose/edit/delete controls. A company may only manage the
 * announcements it authored; coordinator and admin announcements addressed to
 * companies are read-only here, which the database enforces as well.
 */
const CompanyAnnouncementsView: React.FC = () => {
    const [companyId, setCompanyId] = useState<string | null>(null);
    const [companyError, setCompanyError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Announcement | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [attachment, setAttachment] = useState<File | null>(null);
    const [existingAttachment, setExistingAttachment] = useState<{ name: string } | null>(null);
    const [removeExistingAttachment, setRemoveExistingAttachment] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
    const [deleting, setDeleting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        profileService.getCurrentProfile()
            .then(profile => {
                if (!profile?.company_id) throw new Error('You are not associated with any company.');
                setCompanyId(profile.company_id);
            })
            .catch(err => {
                console.error('Failed to resolve the company profile:', err);
                setCompanyError(getErrorMessage(err));
            });
    }, []);

    /** Only the company's own announcements are editable. */
    const isOwn = (announcement: Announcement) => announcement.created_by_role === 'company';

    const openCreateModal = () => {
        setEditing(null);
        setForm(EMPTY_FORM);
        setAttachment(null);
        setExistingAttachment(null);
        setRemoveExistingAttachment(false);
        setFormError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setShowModal(true);
    };

    const openEditModal = (announcement: Announcement) => {
        setEditing(announcement);
        setForm({ title: announcement.title, content: announcement.content });
        setAttachment(null);
        setRemoveExistingAttachment(false);
        setFormError(null);
        setExistingAttachment(announcement.attachment_url
            ? { name: announcement.attachment_name || 'Attachment' }
            : null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setShowModal(true);
    };

    const closeModal = () => {
        if (submitting) return;
        setShowModal(false);
        setEditing(null);
        setAttachment(null);
        setExistingAttachment(null);
        setRemoveExistingAttachment(false);
        setFormError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyId) return;
        if (!form.title.trim() || !form.content.trim()) {
            setFormError('Please fill in the title and message.');
            return;
        }

        setSubmitting(true);
        setFormError(null);
        try {
            let attachmentUrl: string | null = null;
            let attachmentName: string | null = null;

            if (attachment) {
                const uploaded = await companyService.uploadAnnouncementAttachment(companyId, attachment);
                attachmentUrl = uploaded.file_path;
                attachmentName = uploaded.file_name;
            } else if (editing?.attachment_url && !removeExistingAttachment) {
                // Editing without picking a new file keeps the current attachment.
                attachmentUrl = editing.attachment_url;
                attachmentName = editing.attachment_name || null;
            }

            if (editing) {
                await companyService.updateAnnouncement(editing.id, {
                    title: form.title,
                    content: form.content,
                    attachment_url: attachmentUrl,
                    attachment_name: attachmentName,
                });
            } else {
                const input: AnnouncementInput = {
                    company_id: companyId,
                    title: form.title,
                    content: form.content,
                    category: 'company',
                    attachment_url: attachmentUrl,
                    attachment_name: attachmentName,
                };
                await companyService.createAnnouncement(input);
            }

            closeModal();
            setRefreshKey(key => key + 1);
        } catch (err) {
            console.error('Failed to save announcement:', err);
            setFormError(getErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            if (deleteTarget.attachment_url) {
                await companyService.deleteAnnouncementAttachment(deleteTarget.attachment_url).catch(() => undefined);
            }
            await companyService.deleteAnnouncement(deleteTarget.id);
            setDeleteTarget(null);
            setRefreshKey(key => key + 1);
        } catch (err) {
            console.error('Failed to delete announcement:', err);
            setFormError(getErrorMessage(err));
        } finally {
            setDeleting(false);
        }
    };

    if (companyError) {
        return (
            <div className="view-container fade-in">
                <div className="ca-error-banner">
                    <strong>Error:</strong> {companyError}
                </div>
            </div>
        );
    }

    return (
        <>
            <AnnouncementsBoard
                title="Company Announcements"
                subtitle="Post updates, meetings and important notices for your interns."
                refreshKey={refreshKey}
                // The company's own posts plus school announcements addressed to
                // companies — the same authorized feed every other portal uses.
                source={notificationService.getMyAnnouncements}
                resolveAttachmentUrl={companyService.getAnnouncementAttachmentUrl}
                emptyTitle="No announcements yet"
                emptyDescription="Post an announcement to keep your assigned interns informed and updated."
                headerAction={
                    <button type="button" className="anb-btn anb-btn-primary" onClick={openCreateModal}>
                        New announcement
                    </button>
                }
                renderDetailActions={announcement => isOwn(announcement) ? (
                    <>
                        <button type="button" className="anb-btn anb-btn-quiet" onClick={() => openEditModal(announcement)}>
                            Edit
                        </button>
                        <button type="button" className="anb-btn ca-btn-danger" onClick={() => setDeleteTarget(announcement)}>
                            Delete
                        </button>
                    </>
                ) : null}
            />

            {/* Create / Edit */}
            {showModal && (
                <div className="anb-overlay" onClick={closeModal} role="presentation">
                    <div
                        className="anb-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="ca-compose-title"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="anb-modal-head">
                            <h3 id="ca-compose-title" className="anv-compose-title">
                                {editing ? 'Edit announcement' : 'New announcement'}
                            </h3>
                            <button type="button" className="anb-modal-close" onClick={closeModal} aria-label="Close">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="anb-modal-body">
                                <div className="anv-field">
                                    <label className="anv-label" htmlFor="ca-title">Title</label>
                                    <input
                                        id="ca-title"
                                        type="text"
                                        className="anv-input"
                                        value={form.title}
                                        onChange={e => setForm({ ...form, title: e.target.value })}
                                        placeholder="Enter announcement title..."
                                        required
                                    />
                                </div>

                                <div className="anv-field">
                                    <label className="anv-label" htmlFor="ca-message">Message</label>
                                    <textarea
                                        id="ca-message"
                                        className="anv-input anv-textarea"
                                        value={form.content}
                                        onChange={e => setForm({ ...form, content: e.target.value })}
                                        placeholder="Write your announcement message..."
                                        rows={5}
                                        required
                                    />
                                </div>

                                <div className="anv-field">
                                    <label className="anv-label" htmlFor="ca-file">Optional attachment</label>
                                    <input
                                        id="ca-file"
                                        ref={fileInputRef}
                                        type="file"
                                        className="ca-file-input"
                                        onChange={e => setAttachment(e.target.files?.[0] || null)}
                                        onClick={e => { e.currentTarget.value = ''; setAttachment(null); }}
                                    />
                                    {attachment && <span className="ca-existing-file">{attachment.name}</span>}
                                    {existingAttachment && !attachment && (
                                        <div className="ca-attachment-row">
                                            <span className="ca-existing-file">✓ {existingAttachment.name}</span>
                                            <button
                                                type="button"
                                                className="ca-remove-attachment"
                                                onClick={() => {
                                                    setExistingAttachment(null);
                                                    setRemoveExistingAttachment(true);
                                                }}
                                            >
                                                Remove attachment
                                            </button>
                                        </div>
                                    )}
                                    <p className="ca-form-hint">Your announcements are posted under your company identity and reach your assigned interns.</p>
                                </div>

                                {formError && <div className="anv-error">{formError}</div>}
                            </div>

                            <div className="anb-modal-foot">
                                <button type="button" className="anb-btn anb-btn-quiet" onClick={closeModal} disabled={submitting}>
                                    Cancel
                                </button>
                                <button type="submit" className="anb-btn anb-btn-primary" disabled={submitting}>
                                    {submitting
                                        ? (editing ? 'Saving…' : 'Posting…')
                                        : (editing ? 'Save changes' : 'Post announcement')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete confirmation */}
            {deleteTarget && (
                <div className="anb-overlay" onClick={() => !deleting && setDeleteTarget(null)} role="presentation">
                    <div
                        className="anb-modal ca-confirm"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="ca-delete-title"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="anb-modal-body" style={{ textAlign: 'center' }}>
                            <div className="ca-delete-icon">🗑️</div>
                            <h3 id="ca-delete-title" className="anv-compose-title">Delete announcement?</h3>
                            <p className="ca-confirm-text">
                                “{deleteTarget.title}” will be removed from your company announcements.
                            </p>
                        </div>
                        <div className="anb-modal-foot">
                            <button type="button" className="anb-btn anb-btn-quiet" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                                Cancel
                            </button>
                            <button type="button" className="anb-btn ca-btn-danger" onClick={handleDelete} disabled={deleting}>
                                {deleting ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default CompanyAnnouncementsView;
