import React, { useEffect, useRef, useState } from 'react';
import { companyService, type Announcement, type AnnouncementInput } from '../services/companyService';
import { profileService } from '../services/profileService';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import { ListSkeleton } from './Skeletons';
import './AnnouncementsView.css';
import './CompanyAnnouncementsView.css';

const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try { return JSON.stringify(err); } catch { return 'Unknown error'; }
};

interface FormState {
    id: string | null;
    title: string;
    content: string;
    category: 'company';
}

const EMPTY_FORM: FormState = { id: null, title: '', content: '', category: 'company' };

const CompanyAnnouncementsView: React.FC = () => {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [companyId, setCompanyId] = useState<string | null>(null);
    const [selected, setSelected] = useState<Announcement | null>(null);

    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Announcement | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [attachment, setAttachment] = useState<File | null>(null);
    const [existingAttachment, setExistingAttachment] = useState<{ name: string; url: string } | null>(null);
    const [removeExistingAttachment, setRemoveExistingAttachment] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
    const [deleting, setDeleting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { currentPage, setCurrentPage, totalPages, paginatedItems, totalItems, itemsPerPage } = usePagination(announcements, 10);

    useEffect(() => { loadAnnouncements(); }, []);

    const loadAnnouncements = async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await profileService.getCurrentProfile();
            if (!profile?.company_id) {
                throw new Error("You are not associated with any company.");
            }
            setCompanyId(profile.company_id);
            const data = await companyService.getAnnouncements(profile.company_id);
            setAnnouncements(data as Announcement[]);
        } catch (err) {
            console.error('Failed to load announcements:', err);
            setError(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const isOwn = (announcement: Announcement) => announcement.created_by_role === 'company';

    const openCreateModal = () => {
        setEditing(null);
        setForm(EMPTY_FORM);
        setAttachment(null);
        setExistingAttachment(null);
        setRemoveExistingAttachment(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setShowModal(true);
    };

    const openEditModal = async (announcement: Announcement) => {
        setEditing(announcement);
        setForm({ id: announcement.id, title: announcement.title, content: announcement.content, category: 'company' });
        setAttachment(null);
        setRemoveExistingAttachment(false);
        if (fileInputRef.current) fileInputRef.current.value = '';

        if (announcement.attachment_url) {
            try {
                const url = await companyService.getAnnouncementAttachmentUrl(announcement.attachment_url);
                setExistingAttachment({ name: announcement.attachment_name || 'Attachment', url });
            } catch {
                setExistingAttachment(null);
            }
        } else {
            setExistingAttachment(null);
        }
        setShowModal(true);
    };

    const closeModal = () => {
        if (submitting) return;
        setShowModal(false);
        setEditing(null);
        setAttachment(null);
        setExistingAttachment(null);
        setRemoveExistingAttachment(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyId) return;
        if (!form.title.trim() || !form.content.trim()) {
            alert('Please fill in the title and message.');
            return;
        }

        setSubmitting(true);
        try {
            let attachmentUrl: string | null = null;
            let attachmentName: string | null = null;

            if (attachment) {
                const uploaded = await companyService.uploadAnnouncementAttachment(companyId, attachment);
                attachmentUrl = uploaded.file_path;
                attachmentName = uploaded.file_name;
            } else if (editing?.attachment_url && !removeExistingAttachment) {
                // Keep the existing attachment when editing without a new file.
                attachmentUrl = editing.attachment_url;
                attachmentName = editing.attachment_name || null;
            }

            if (editing) {
                await companyService.updateAnnouncement(editing.id, {
                    title: form.title,
                    content: form.content,
                    attachment_url: attachmentUrl,
                    attachment_name: attachmentName
                });
            } else {
                const input: AnnouncementInput = {
                    company_id: companyId,
                    title: form.title,
                    content: form.content,
                    category: 'company',
                    attachment_url: attachmentUrl,
                    attachment_name: attachmentName
                };
                await companyService.createAnnouncement(input);
            }

            closeModal();
            setSelected(null);
            await loadAnnouncements();
        } catch (err) {
            console.error('Failed to save announcement:', err);
            alert(`Failed to save announcement: ${getErrorMessage(err)}`);
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
            setSelected(null);
            await loadAnnouncements();
        } catch (err) {
            console.error('Failed to delete announcement:', err);
            alert(`Failed to delete announcement: ${getErrorMessage(err)}`);
        } finally {
            setDeleting(false);
        }
    };

    if (error) return (
        <div className="view-container fade-in">
            <div className="ca-error-banner">
                <strong>Error:</strong> {error}
            </div>
        </div>
    );

    return (
        <div className="announcements-container fade-in">
            <header className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 className="view-title">Company Announcements</h2>
                    <p className="view-subtitle">Post updates, meetings, and important notices for your interns.</p>
                </div>
                <button className="btn btn-primary" onClick={openCreateModal}>
                    + New Announcement
                </button>
            </header>

            {/* Selected Announcement Detail View */}
            {selected ? (
                <div className="announcement-detail glass-card fade-in" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
                    <button
                        onClick={() => setSelected(null)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: '1.5rem', fontSize: '0.9rem', padding: 0 }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        Back to Announcements
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-bright)', overflowWrap: 'anywhere' }}>{selected.title}</h2>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                            {new Date(selected.created_at).toLocaleDateString()}
                        </span>
                    </div>

                    {selected.category && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                            <span
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                    padding: '0.28rem 0.65rem', borderRadius: '8px',
                                    fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                                    border: '1px solid',
                                    background: selected.category === 'company' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                                    color: selected.category === 'company' ? '#10b981' : '#3b82f6',
                                    borderColor: selected.category === 'company' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)'
                                }}
                            >
                                {selected.category === 'company' ? '🟢 Company Announcement' : '🔵 Coordinator Announcement'}
                            </span>
                            {(selected.company_name || selected.creator_name) && (
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                    {selected.company_name || selected.creator_name}
                                </span>
                            )}
                        </div>
                    )}

                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2rem', overflowWrap: 'anywhere' }}>
                        FROM: {(selected.creator_name || selected.company_name || 'Company').toUpperCase()}
                    </div>

                    <div style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {selected.content}
                    </div>

                    {selected.attachment_url && (
                        <div style={{ marginTop: '1.25rem' }}>
                            <button
                                onClick={() => {
                                    companyService.getAnnouncementAttachmentUrl(selected.attachment_url as string)
                                        .then(url => window.open(url, '_blank'))
                                        .catch(() => alert('Unable to open attachment.'));
                                }}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                                    padding: '0.5rem 0.9rem', borderRadius: '8px',
                                    border: '1px dashed rgba(16, 185, 129, 0.4)', background: 'var(--bg-elevated)',
                                    color: 'var(--primary)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit'
                                }}
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                                {selected.attachment_name || 'View Attachment'}
                            </button>
                        </div>
                    )}

                    {isOwn(selected) && (
                        <div className="ca-actions" style={{ marginTop: '1.5rem' }}>
                            <button className="ca-action-btn" onClick={() => openEditModal(selected)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                Edit
                            </button>
                            <button className="ca-action-btn ca-action-delete" onClick={() => setDeleteTarget(selected)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            ) : loading ? (
                <div className="announcements-list">
                    <ListSkeleton items={3} />
                </div>
            ) : announcements.length > 0 ? (
                <>
                    <div className="announcements-list">
                        {paginatedItems.map(item => {
                            const isCompany = item.category === 'company';
                            return (
                                <div
                                    key={item.id}
                                    className="announcement-card clickable glass-card"
                                    onClick={() => setSelected(item)}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-bright)', overflowWrap: 'anywhere' }}>{item.title}</h3>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                                            {new Date(item.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                padding: '0.22rem 0.55rem', borderRadius: '6px',
                                                fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                                                border: '1px solid',
                                                background: isCompany ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                                                color: isCompany ? '#10b981' : '#3b82f6',
                                                borderColor: isCompany ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)'
                                            }}
                                        >
                                            {isCompany ? '🟢 Company' : '🔵 Coordinator'}
                                        </span>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                            {isCompany
                                                ? (item.company_name || item.author || 'Your Company')
                                                : (item.creator_name || 'SIL Coordinator')}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            itemsPerPage={itemsPerPage}
                            onPageChange={setCurrentPage}
                            itemName="announcements"
                        />
                    </div>
                </>
            ) : (
                <div className="ca-empty-state glass-card">
                    <div className="ca-empty-icon">📢</div>
                    <h3>No announcements yet</h3>
                    <p>Post an announcement to keep your assigned interns informed and updated.</p>
                    <button className="btn-primary" onClick={openCreateModal}>
                        + New Announcement
                    </button>
                </div>
            )}

            {/* Create / Edit Modal */}
            {showModal && (
                <div className="ca-modal-overlay" onClick={closeModal}>
                    <div className="ca-modal" onClick={e => e.stopPropagation()}>
                        <div className="ca-modal-header">
                            <h3>{editing ? 'Edit Announcement' : 'New Announcement'}</h3>
                            <button className="ca-modal-close" onClick={closeModal} aria-label="Close">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="ca-form-group">
                                <label className="ca-form-label">Title</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                    placeholder="Enter announcement title..."
                                    required
                                />
                            </div>

                            <div className="ca-form-group">
                                <label className="ca-form-label">Category</label>
                                <select
                                    className="form-input"
                                    value="company"
                                    onChange={() => setForm({ ...form, category: 'company' })}
                                >
                                    <option value="company">Company Announcement</option>
                                    <option value="coordinator" disabled title="Coordinator Announcements can only be created by the SIL Coordinator.">
                                        Coordinator Announcement (Coordinator only)
                                    </option>
                                </select>
                                <p className="ca-form-hint">Your announcements are posted under your company identity.</p>
                            </div>

                            <div className="ca-form-group">
                                <label className="ca-form-label">Message</label>
                                <textarea
                                    className="form-input ca-textarea"
                                    value={form.content}
                                    onChange={e => setForm({ ...form, content: e.target.value })}
                                    placeholder="Write your announcement message..."
                                    rows={5}
                                    required
                                />
                            </div>

                            <div className="ca-form-group">
                                <label className="ca-form-label">Optional Attachment</label>
                                <div className="ca-upload-row">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        className="ca-file-input"
                                        onChange={e => setAttachment(e.target.files?.[0] || null)}
                                        onClick={e => { e.currentTarget.value = ''; setAttachment(null); }}
                                    />
                                    {(existingAttachment && !attachment) && (
                                        <span className="ca-existing-file">
                                            ✓ {existingAttachment.name}
                                        </span>
                                    )}
                                    {attachment && (
                                        <span className="ca-existing-file">{attachment.name}</span>
                                    )}
                                </div>
                                {existingAttachment && !attachment && (
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
                                )}
                            </div>

                            <div className="ca-modal-actions">
                                <button type="button" className="btn-secondary" onClick={closeModal} disabled={submitting}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary" disabled={submitting}>
                                    {submitting ? (editing ? 'Saving...' : 'Posting...') : (editing ? 'Save Changes' : 'Post Announcement')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="ca-modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
                    <div className="ca-modal ca-delete-modal" onClick={e => e.stopPropagation()}>
                        <div className="ca-delete-icon">🗑️</div>
                        <h3>Delete Announcement?</h3>
                        <p>This announcement will be removed from your company announcements.</p>
                        <div className="ca-modal-actions">
                            <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                                Cancel
                            </button>
                            <button type="button" className="ca-delete-btn" onClick={handleDelete} disabled={deleting}>
                                {deleting ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CompanyAnnouncementsView;
