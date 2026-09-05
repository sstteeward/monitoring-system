import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import {
    type AnnouncementAudience,
    type AnnouncementPriority,
    type AnnouncementType,
} from '../services/notificationService';
import AnnouncementsBoard from './AnnouncementsBoard';
import './AnnouncementsView.css';

interface AnnouncementsViewProps {
    /**
     * Whether this portal may publish school-wide announcements. The database
     * is the real gate (RLS allows coordinators and admins only) — this just
     * decides whether the compose UI is offered.
     */
    canPublish?: boolean;
    title?: string;
    subtitle?: string;
    /** Called after read state changes, so the portal can refresh its bell. */
    onReadStateChanged?: () => void;
}

const AUDIENCE_OPTIONS: { value: AnnouncementAudience; label: string }[] = [
    { value: 'all', label: 'Everyone' },
    { value: 'student', label: 'Students' },
    { value: 'adviser', label: 'Advisers' },
    { value: 'coordinator', label: 'Coordinators' },
    { value: 'company', label: 'Companies' },
];

/**
 * School announcements for the Student, Adviser, Coordinator and Admin portals.
 *
 * The reading experience lives in {@link AnnouncementsBoard}, shared with the
 * Company portal. This wrapper adds the compose form for the roles allowed to
 * publish, and turns a `?id=` deep link from the notification bell into an open
 * announcement.
 */
const AnnouncementsView: React.FC<AnnouncementsViewProps> = ({
    canPublish = false,
    title,
    subtitle,
    onReadStateChanged,
}) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const announcementIdParam = searchParams.get('id');

    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newType, setNewType] = useState<AnnouncementType>('general');
    const [newPriority, setNewPriority] = useState<AnnouncementPriority>('normal');
    // Which portals receive it. 'all' is exclusive — picking it clears the rest.
    const [newAudience, setNewAudience] = useState<AnnouncementAudience[]>(['all']);

    const toggleAudience = (role: AnnouncementAudience) => {
        setNewAudience(prev => {
            if (role === 'all') return ['all'];
            const without = prev.filter(r => r !== 'all');
            const next = without.includes(role)
                ? without.filter(r => r !== role)
                : [...without, role];
            return next.length === 0 ? ['all'] : next;
        });
    };

    const resetForm = () => {
        setNewTitle('');
        setNewContent('');
        setNewType('general');
        setNewPriority('normal');
        setNewAudience(['all']);
        setFormError(null);
    };

    const closeForm = () => {
        if (submitting) return;
        setShowForm(false);
        resetForm();
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim() || !newContent.trim()) return;

        setSubmitting(true);
        setFormError(null);
        try {
            // The author name is a display fallback only; the database trigger
            // re-derives the creator and role from the authenticated session.
            const { data: { user } } = await supabase.auth.getUser();
            let authorName: string | null = null;
            if (user) {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('first_name, last_name')
                    .eq('auth_user_id', user.id)
                    .single();
                if (profileData?.first_name) {
                    authorName = [profileData.first_name, profileData.last_name].filter(Boolean).join(' ');
                }
            }

            const { error } = await supabase
                .from('announcements')
                .insert([{
                    title: newTitle.trim(),
                    content: newContent.trim(),
                    author: authorName,
                    type: newType,
                    priority: newPriority,
                    target_audience: newAudience,
                }]);
            if (error) throw error;

            setShowForm(false);
            resetForm();
            setRefreshKey(key => key + 1);
        } catch (err) {
            console.error('Error creating announcement:', err);
            setFormError(err instanceof Error ? err.message : 'Failed to post the announcement.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <AnnouncementsBoard
                title={title}
                subtitle={subtitle}
                refreshKey={refreshKey}
                openAnnouncementId={announcementIdParam}
                // Drop the ?id= once it has been opened, so returning to this
                // page later does not re-open the same announcement.
                onOpenAnnouncementHandled={() => {
                    const next = new URLSearchParams(searchParams);
                    next.delete('id');
                    setSearchParams(next, { replace: true });
                }}
                onReadStateChanged={onReadStateChanged}
                headerAction={canPublish ? (
                    <button type="button" className="anb-btn anb-btn-primary" onClick={() => setShowForm(true)}>
                        New announcement
                    </button>
                ) : undefined}
                emptyTitle="No announcements yet"
                emptyDescription={canPublish
                    ? 'Nothing has been published yet. Post an announcement to reach the portals you select.'
                    : "You're all caught up. School announcements will appear here when they are published."}
            />

            {showForm && (
                <div className="anb-overlay" onClick={closeForm} role="presentation">
                    <div
                        className="anb-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="anv-compose-title"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="anb-modal-head">
                            <h3 id="anv-compose-title" className="anv-compose-title">New announcement</h3>
                            <button type="button" className="anb-modal-close" onClick={closeForm} aria-label="Close">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>

                        <form onSubmit={handleCreate}>
                            <div className="anb-modal-body">
                                <div className="anv-field">
                                    <label className="anv-label" htmlFor="anv-title">Title</label>
                                    <input
                                        id="anv-title"
                                        type="text"
                                        className="anv-input"
                                        value={newTitle}
                                        onChange={e => setNewTitle(e.target.value)}
                                        placeholder="E.g. Midterm requirements deadline"
                                        required
                                    />
                                </div>

                                <div className="anv-field">
                                    <label className="anv-label" htmlFor="anv-message">Message</label>
                                    <textarea
                                        id="anv-message"
                                        className="anv-input anv-textarea"
                                        value={newContent}
                                        onChange={e => setNewContent(e.target.value)}
                                        placeholder="Write the details of the announcement..."
                                        rows={5}
                                        required
                                    />
                                </div>

                                {/* Who receives it. The server enforces this audience in RLS
                                    and in the notification fan-out, so it is not a display hint. */}
                                <div className="anv-field">
                                    <span className="anv-label">Target audience</span>
                                    <div className="anv-chip-row">
                                        {AUDIENCE_OPTIONS.map(option => {
                                            const active = newAudience.includes(option.value);
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    className={`anv-choice${active ? ' active' : ''}`}
                                                    onClick={() => toggleAudience(option.value)}
                                                    aria-pressed={active}
                                                >
                                                    {option.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="anv-field-row">
                                    <div className="anv-field">
                                        <label className="anv-label" htmlFor="anv-type">Category</label>
                                        <select
                                            id="anv-type"
                                            className="anv-input"
                                            value={newType}
                                            onChange={e => setNewType(e.target.value as AnnouncementType)}
                                        >
                                            <option value="general">General</option>
                                            <option value="academic">Academic</option>
                                            <option value="event">Event</option>
                                            <option value="deadline">Deadline</option>
                                            <option value="reminder">Reminder</option>
                                            <option value="policy">Policy</option>
                                            <option value="emergency">Emergency</option>
                                        </select>
                                    </div>
                                    <div className="anv-field">
                                        <label className="anv-label" htmlFor="anv-priority">Priority</label>
                                        <select
                                            id="anv-priority"
                                            className="anv-input"
                                            value={newPriority}
                                            onChange={e => setNewPriority(e.target.value as AnnouncementPriority)}
                                        >
                                            <option value="low">Low</option>
                                            <option value="normal">Normal</option>
                                            <option value="high">Important</option>
                                            <option value="urgent">Urgent</option>
                                        </select>
                                    </div>
                                </div>

                                {formError && <div className="anv-error">{formError}</div>}
                            </div>

                            <div className="anb-modal-foot">
                                <button type="button" className="anb-btn anb-btn-quiet" onClick={closeForm} disabled={submitting}>
                                    Cancel
                                </button>
                                <button type="submit" className="anb-btn anb-btn-primary" disabled={submitting}>
                                    {submitting ? 'Posting…' : 'Post announcement'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default AnnouncementsView;
