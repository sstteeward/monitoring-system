import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
    notificationService,
    type Announcement,
    type AnnouncementPriority,
    type AnnouncementReaction,
    type AnnouncementType,
} from '../services/notificationService';
import CustomSelect from './CustomSelect';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import './AnnouncementsBoard.css';

/**
 * The one announcement surface, shared by every portal — Student, Adviser,
 * Coordinator, Company and Admin.
 *
 * The board renders the reading experience (cards, search/filter/sort, detail
 * modal, read tracking). What each role is allowed to *do* stays with the
 * portal: pass `headerAction` for a create button and `renderDetailActions` for
 * per-announcement controls. What each role is allowed to *see* is decided by
 * the database — `get_my_announcements` is role-aware and RLS backs it up — so
 * this component never filters by role itself.
 */
export interface AnnouncementsBoardProps {
    title?: string;
    subtitle?: string;
    /** Overrides the default `getMyAnnouncements()` fetch. */
    source?: () => Promise<Announcement[]>;
    /** Announcement to open on mount (notification deep link). */
    openAnnouncementId?: string | null;
    /** Fired once the deep-linked announcement has been opened, or failed to. */
    onOpenAnnouncementHandled?: () => void;
    /** Fired after read state changes, so a portal can refresh its bell. */
    onReadStateChanged?: () => void;
    /** Change this value to force a reload (e.g. after creating an announcement). */
    refreshKey?: number;
    /** Rendered at the top-right of the header — typically a create button. */
    headerAction?: React.ReactNode;
    /** Rendered in the detail modal footer — typically edit/delete. */
    renderDetailActions?: (announcement: Announcement) => React.ReactNode;
    /** Resolves a stored attachment path to a signed URL. */
    resolveAttachmentUrl?: (path: string) => Promise<string>;
    /** Set false where read state is not tracked for this feed. */
    enableReadTracking?: boolean;
    /** Reactions on the detail view; on for every portal by default. */
    enableReactions?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
}

const REACTIONS = [
    { type: 'like', emoji: '👍', label: 'Like' },
    { type: 'celebrate', emoji: '🙌', label: 'Celebrate' },
    { type: 'heart', emoji: '❤️', label: 'Love' },
] as const;

type ReactionType = AnnouncementReaction['reaction_type'];

type ReadFilter = 'all' | 'unread' | 'read';
type SortOrder = 'newest' | 'oldest';

const PRIORITY_LABEL: Record<AnnouncementPriority, string> = {
    low: 'Low',
    normal: 'Normal',
    high: 'Important',
    urgent: 'Urgent',
};

const TYPE_LABEL: Record<AnnouncementType, string> = {
    general: 'General',
    academic: 'Academic',
    event: 'Event',
    deadline: 'Deadline',
    reminder: 'Reminder',
    policy: 'Policy',
    emergency: 'Emergency',
};

const ROLE_LABEL: Record<string, string> = {
    company: 'Company',
    coordinator: 'SIL Coordinator',
    admin: 'School Administrator',
    adviser: 'Section Adviser',
    student: 'Student',
};

const Icon = {
    search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
    refresh: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>,
    clip: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>,
    close: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
    check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
};

/** Publication moment — when it went live, not when the row was written. */
const liveAt = (a: Announcement): string => a.published_at || a.created_at;

const formatDate = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const formatTime = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

const initialsOf = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';

/** A company announcement is published under the company's identity, not a person's. */
const publisherOf = (a: Announcement): string =>
    a.category === 'company'
        ? (a.company_name || a.company?.name || a.author || 'Company')
        : (a.creator_name || a.author || 'School Administration');

const publisherRoleOf = (a: Announcement): string =>
    ROLE_LABEL[a.created_by_role || ''] || (a.category === 'company' ? 'Company' : 'School');

const AnnouncementsBoard: React.FC<AnnouncementsBoardProps> = ({
    title = 'School Announcements',
    subtitle = 'Stay updated with important announcements from the school.',
    source,
    openAnnouncementId,
    onOpenAnnouncementHandled,
    onReadStateChanged,
    refreshKey = 0,
    headerAction,
    renderDetailActions,
    resolveAttachmentUrl,
    enableReadTracking = true,
    enableReactions = true,
    emptyTitle = 'No announcements yet',
    emptyDescription = "You're all caught up. Announcements will appear here when they are published.",
}) => {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [selected, setSelected] = useState<Announcement | null>(null);
    const [openingDeepLink, setOpeningDeepLink] = useState(false);
    const [markingAll, setMarkingAll] = useState(false);

    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [readFilter, setReadFilter] = useState<ReadFilter>('all');
    const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

    const [reactions, setReactions] = useState<AnnouncementReaction[]>([]);
    const [showReactors, setShowReactors] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // `source` is often an inline arrow function, so it is held in a ref rather
    // than a dependency — otherwise the board would refetch on every render.
    const sourceRef = useRef(source);
    sourceRef.current = source;

    const load = useCallback(async (options?: { silent?: boolean }) => {
        if (!options?.silent) setLoading(true);
        setError(null);
        try {
            const fetcher = sourceRef.current ?? notificationService.getMyAnnouncements;
            setAnnouncements(await fetcher());
        } catch (err) {
            console.error('Failed to load announcements:', err);
            // A failed request must never render as "no announcements" — that
            // would read as nothing having been published.
            setError(err instanceof Error ? err.message : 'We could not load announcements.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load, refreshKey]);

    // Newly published announcements arrive without a refresh. The realtime
    // payload is only a signal — the list is refetched through the authorized
    // query, so nothing unauthorized can slip in through the socket.
    useEffect(() => notificationService.subscribeToAnnouncements(() => {
        void load({ silent: true });
    }), [load]);

    const markRead = useCallback(async (announcement: Announcement) => {
        if (!enableReadTracking || announcement.is_read) return;
        // Optimistic, so the unread count and badge update instantly; reverted
        // if the write fails.
        setAnnouncements(prev => prev.map(a => a.id === announcement.id ? { ...a, is_read: true } : a));
        setSelected(prev => prev && prev.id === announcement.id ? { ...prev, is_read: true } : prev);
        try {
            await notificationService.markAnnouncementRead(announcement.id);
            onReadStateChanged?.();
        } catch (err) {
            console.error('Failed to mark announcement as read:', err);
            setAnnouncements(prev => prev.map(a => a.id === announcement.id ? { ...a, is_read: false } : a));
        }
    }, [enableReadTracking, onReadStateChanged]);

    const openAnnouncement = useCallback((announcement: Announcement) => {
        setSelected(announcement);
        void markRead(announcement);
    }, [markRead]);

    const handleMarkAllRead = async () => {
        setMarkingAll(true);
        const previous = announcements;
        setAnnouncements(prev => prev.map(a => ({ ...a, is_read: true })));
        try {
            await notificationService.markAllAnnouncementsRead();
            onReadStateChanged?.();
        } catch (err) {
            console.error('Failed to mark all announcements as read:', err);
            setAnnouncements(previous);
            setNotice('We could not mark everything as read. Please try again.');
        } finally {
            setMarkingAll(false);
        }
    };

    // Arriving from a notification: this one announcement is fetched on its own
    // so the deep link works even for something outside the current page.
    useEffect(() => {
        if (!openAnnouncementId) return;
        let cancelled = false;

        setOpeningDeepLink(true);
        setNotice(null);
        notificationService.getAnnouncementForMe(openAnnouncementId)
            .then(found => {
                if (cancelled) return;
                if (found) openAnnouncement(found);
                else setNotice('That announcement is no longer available.');
            })
            .catch(err => {
                if (cancelled) return;
                console.error('Failed to open announcement:', err);
                setNotice('You no longer have access to that announcement.');
            })
            .finally(() => {
                if (cancelled) return;
                setOpeningDeepLink(false);
                onOpenAnnouncementHandled?.();
            });

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openAnnouncementId]);

    useEffect(() => {
        if (!enableReactions) return;
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user) setCurrentUserId(data.user.id);
        });
    }, [enableReactions]);

    // Reactions belong to the open announcement, so they are loaded with it and
    // dropped when it closes.
    useEffect(() => {
        setShowReactors(false);
        if (!enableReactions || !selected) {
            setReactions([]);
            return;
        }
        let cancelled = false;
        notificationService.getAnnouncementReactions(selected.id)
            .then(data => { if (!cancelled) setReactions(data); })
            .catch(err => console.error('Failed to load reactions:', err));
        return () => { cancelled = true; };
    }, [enableReactions, selected]);

    const toggleReaction = async (type: ReactionType) => {
        if (!selected || !currentUserId) return;
        const mine = reactions.some(r => r.user_id === currentUserId && r.reaction_type === type);

        // Optimistic, then reconciled with the server's own count.
        setReactions(prev => mine
            ? prev.filter(r => !(r.user_id === currentUserId && r.reaction_type === type))
            : [...prev, {
                id: `optimistic-${type}`,
                announcement_id: selected.id,
                user_id: currentUserId,
                reaction_type: type,
                created_at: new Date().toISOString(),
            }]);

        try {
            await notificationService.toggleReaction(selected.id, type);
        } catch (err) {
            console.error('Failed to toggle reaction:', err);
        } finally {
            try {
                setReactions(await notificationService.getAnnouncementReactions(selected.id));
            } catch (err) {
                console.error('Failed to refresh reactions:', err);
            }
        }
    };

    // Escape closes the detail dialog, and the page behind it never scrolls.
    useEffect(() => {
        if (!selected) return;
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
        window.addEventListener('keydown', onKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = '';
        };
    }, [selected]);

    const unreadCount = useMemo(
        () => (enableReadTracking ? announcements.filter(a => !a.is_read).length : 0),
        [announcements, enableReadTracking],
    );

    /** Only the types actually present, so a filter can never return nothing. */
    const typeOptions = useMemo(() => {
        const present = Array.from(new Set(announcements.map(a => a.type || 'general')));
        return [
            { value: 'all', label: 'All categories' },
            ...present.map(t => ({ value: t, label: TYPE_LABEL[t as AnnouncementType] || t })),
        ];
    }, [announcements]);

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return announcements
            .filter(a => {
                if (enableReadTracking && readFilter === 'unread' && a.is_read) return false;
                if (enableReadTracking && readFilter === 'read' && !a.is_read) return false;
                if (typeFilter !== 'all' && (a.type || 'general') !== typeFilter) return false;
                if (!term) return true;
                return a.title.toLowerCase().includes(term)
                    || a.content.toLowerCase().includes(term)
                    || publisherOf(a).toLowerCase().includes(term);
            })
            .sort((a, b) => {
                const diff = new Date(liveAt(b)).getTime() - new Date(liveAt(a)).getTime();
                return sortOrder === 'newest' ? diff : -diff;
            });
    }, [announcements, search, readFilter, typeFilter, sortOrder, enableReadTracking]);

    const { currentPage, setCurrentPage, totalPages, paginatedItems, totalItems, itemsPerPage } =
        usePagination(visible, 12);

    // Narrowing the results must not strand the reader on a page that no longer
    // exists, so any filter change returns to the first page.
    useEffect(() => { setCurrentPage(1); }, [search, typeFilter, readFilter, sortOrder, setCurrentPage]);

    const hasActiveFilters = Boolean(search.trim()) || typeFilter !== 'all' || readFilter !== 'all';

    const clearFilters = () => {
        setSearch('');
        setTypeFilter('all');
        setReadFilter('all');
    };

    const openAttachment = async (announcement: Announcement) => {
        if (!announcement.attachment_url) return;
        const resolve = resolveAttachmentUrl ?? notificationService.getAnnouncementAttachmentUrl;
        try {
            window.open(await resolve(announcement.attachment_url), '_blank', 'noopener,noreferrer');
        } catch (err) {
            console.error('Failed to open attachment:', err);
            setNotice('The attachment could not be opened. Please try again.');
        }
    };

    const renderBadges = (a: Announcement, opts?: { showUnread?: boolean }) => {
        const priority = (a.priority || 'normal') as AnnouncementPriority;
        const type = (a.type || 'general') as AnnouncementType;
        return (
            <>
                {opts?.showUnread && enableReadTracking && !a.is_read && (
                    <span className="anb-chip anb-chip-unread"><span className="anb-dot" />Unread</span>
                )}
                <span className="anb-chip anb-chip-type">{TYPE_LABEL[type] || type}</span>
                {(priority === 'high' || priority === 'urgent') && (
                    <span className={`anb-chip anb-chip-priority ${priority}`}>{PRIORITY_LABEL[priority]}</span>
                )}
                {a.category === 'company' && <span className="anb-chip anb-chip-source">Company</span>}
                {a.status && a.status !== 'published' && (
                    <span className="anb-chip anb-chip-status">{a.status}</span>
                )}
                {a.attachment_url && (
                    <span className="anb-chip anb-chip-attachment" title={a.attachment_name || 'Attachment'}>
                        {Icon.clip}1
                    </span>
                )}
            </>
        );
    };

    return (
        <div className="anb fade-in">
            <header className="anb-header">
                <div className="anb-header-text">
                    <h2 className="anb-title">{title}</h2>
                    <p className="anb-subtitle">{subtitle}</p>
                </div>
                <div className="anb-header-actions">
                    {enableReadTracking && unreadCount > 0 && (
                        <>
                            <span className="anb-unread-count">{unreadCount} unread</span>
                            <button
                                type="button"
                                className="anb-btn anb-btn-quiet"
                                onClick={() => void handleMarkAllRead()}
                                disabled={markingAll}
                            >
                                {Icon.check}
                                {markingAll ? 'Marking…' : 'Mark all as read'}
                            </button>
                        </>
                    )}
                    <button
                        type="button"
                        className="anb-icon-btn"
                        onClick={() => void load()}
                        aria-label="Refresh announcements"
                        title="Refresh"
                    >
                        {Icon.refresh}
                    </button>
                    {headerAction}
                </div>
            </header>

            {notice && (
                <div className="anb-notice" role="status">
                    <span>{notice}</span>
                    <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">{Icon.close}</button>
                </div>
            )}

            {/* The toolbar stays mounted while loading so the layout never jumps. */}
            <div className="anb-toolbar">
                <div className="anb-search">
                    <span className="anb-search-icon">{Icon.search}</span>
                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search title, message or publisher..."
                        aria-label="Search announcements"
                    />
                </div>
                <div className="anb-filters">
                    <CustomSelect value={typeFilter} onChange={setTypeFilter} options={typeOptions} />
                    {enableReadTracking && (
                        <CustomSelect
                            value={readFilter}
                            onChange={value => setReadFilter(value as ReadFilter)}
                            options={[
                                { value: 'all', label: 'Read & unread' },
                                { value: 'unread', label: 'Unread only' },
                                { value: 'read', label: 'Read only' },
                            ]}
                        />
                    )}
                    <CustomSelect
                        value={sortOrder}
                        onChange={value => setSortOrder(value as SortOrder)}
                        options={[
                            { value: 'newest', label: 'Newest first' },
                            { value: 'oldest', label: 'Oldest first' },
                        ]}
                    />
                </div>
            </div>

            {loading ? (
                <div className="anb-grid" aria-busy="true">
                    {[0, 1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="anb-card anb-card-skeleton">
                            <div className="anb-skel anb-skel-chip" />
                            <div className="anb-skel anb-skel-title" />
                            <div className="anb-skel anb-skel-line" />
                            <div className="anb-skel anb-skel-line short" />
                            <div className="anb-skel anb-skel-foot" />
                        </div>
                    ))}
                </div>
            ) : error ? (
                <div className="anb-state anb-state-error">
                    <div className="anb-state-icon" aria-hidden="true">⚠️</div>
                    <h3>Could not load announcements</h3>
                    <p>{error}</p>
                    <button type="button" className="anb-btn anb-btn-primary" onClick={() => void load()}>Try again</button>
                </div>
            ) : visible.length === 0 ? (
                <div className="anb-state">
                    <div className="anb-state-icon" aria-hidden="true">📢</div>
                    {hasActiveFilters ? (
                        <>
                            <h3>No matching announcements</h3>
                            <p>No announcement matches your current search and filters.</p>
                            <button type="button" className="anb-btn anb-btn-quiet" onClick={clearFilters}>Clear filters</button>
                        </>
                    ) : (
                        <>
                            <h3>{emptyTitle}</h3>
                            <p>{emptyDescription}</p>
                        </>
                    )}
                </div>
            ) : (
                <>
                    <div className="anb-grid">
                        {paginatedItems.map(item => {
                            const unread = enableReadTracking && !item.is_read;
                            const publisher = publisherOf(item);
                            const published = liveAt(item);

                            return (
                                <article
                                    key={item.id}
                                    className={`anb-card${unread ? ' is-unread' : ''}`}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Open announcement: ${item.title}`}
                                    onClick={() => openAnnouncement(item)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            openAnnouncement(item);
                                        }
                                    }}
                                >
                                    <div className="anb-card-chips">{renderBadges(item, { showUnread: true })}</div>

                                    <h3 className="anb-card-title">{item.title}</h3>
                                    <p className="anb-card-preview">{item.content}</p>

                                    <footer className="anb-card-foot">
                                        <div className="anb-publisher">
                                            <span className="anb-avatar" aria-hidden="true">{initialsOf(publisher)}</span>
                                            <span className="anb-publisher-name" title={publisher}>{publisher}</span>
                                        </div>
                                        <div className="anb-meta">
                                            <span>{formatDate(published)}</span>
                                            <span className="anb-meta-sep" aria-hidden="true">·</span>
                                            <span>{formatTime(published)}</span>
                                        </div>
                                    </footer>
                                </article>
                            );
                        })}
                    </div>

                    {totalPages > 1 && (
                        <div className="anb-pagination">
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalItems={totalItems}
                                itemsPerPage={itemsPerPage}
                                onPageChange={setCurrentPage}
                                itemName="announcements"
                            />
                        </div>
                    )}
                </>
            )}

            {openingDeepLink && !selected && (
                <div className="anb-overlay">
                    <div className="anb-modal anb-modal-loading">Opening announcement…</div>
                </div>
            )}

            {selected && (
                <div className="anb-overlay" onClick={() => setSelected(null)} role="presentation">
                    <div
                        className="anb-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="anb-modal-title"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="anb-modal-head">
                            <div className="anb-card-chips">
                                {renderBadges(selected)}
                                {enableReadTracking && (
                                    <span className={`anb-chip ${selected.is_read ? 'anb-chip-read' : 'anb-chip-unread'}`}>
                                        {selected.is_read ? 'Read' : <><span className="anb-dot" />Unread</>}
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                className="anb-modal-close"
                                onClick={() => setSelected(null)}
                                aria-label="Close announcement"
                            >
                                {Icon.close}
                            </button>
                        </div>

                        <div className="anb-modal-body">
                            <h2 id="anb-modal-title" className="anb-modal-title">{selected.title}</h2>

                            <div className="anb-byline">
                                <span className="anb-avatar anb-avatar-lg" aria-hidden="true">
                                    {initialsOf(publisherOf(selected))}
                                </span>
                                <div className="anb-byline-text">
                                    <div className="anb-byline-name">{publisherOf(selected)}</div>
                                    <div className="anb-byline-sub">
                                        {publisherRoleOf(selected)}
                                        <span className="anb-meta-sep" aria-hidden="true">·</span>
                                        {formatDate(liveAt(selected))}
                                        <span className="anb-meta-sep" aria-hidden="true">·</span>
                                        {formatTime(liveAt(selected))}
                                    </div>
                                </div>
                            </div>

                            <div className="anb-modal-content">{selected.content}</div>

                            {selected.attachment_url && (
                                <div className="anb-attachments">
                                    <div className="anb-attachments-label">Attachment</div>
                                    <button
                                        type="button"
                                        className="anb-attachment"
                                        onClick={() => void openAttachment(selected)}
                                    >
                                        {Icon.clip}
                                        <span>{selected.attachment_name || 'View attachment'}</span>
                                    </button>
                                </div>
                            )}

                            {enableReactions && (
                                <div className="anb-reactions">
                                    <div className="anb-reaction-bar">
                                        {REACTIONS.map(({ type, emoji, label }) => {
                                            const count = reactions.filter(r => r.reaction_type === type).length;
                                            const mine = reactions.some(r => r.reaction_type === type && r.user_id === currentUserId);
                                            return (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    className={`anb-reaction${mine ? ' active' : ''}`}
                                                    onClick={() => void toggleReaction(type)}
                                                    aria-pressed={mine}
                                                    aria-label={label}
                                                    title={label}
                                                >
                                                    <span className="anb-reaction-emoji">{emoji}</span>
                                                    {count > 0 && <span className="anb-reaction-count">{count}</span>}
                                                </button>
                                            );
                                        })}
                                        {(() => {
                                            const count = reactions.filter(r => r.reaction_type === 'acknowledge').length;
                                            const mine = reactions.some(r => r.reaction_type === 'acknowledge' && r.user_id === currentUserId);
                                            return (
                                                <button
                                                    type="button"
                                                    className={`anb-reaction anb-reaction-ack${mine ? ' active' : ''}`}
                                                    onClick={() => void toggleReaction('acknowledge')}
                                                    aria-pressed={mine}
                                                >
                                                    <span className="anb-reaction-emoji">✅</span>
                                                    <span>Acknowledge</span>
                                                    {count > 0 && <span className="anb-reaction-count">{count}</span>}
                                                </button>
                                            );
                                        })()}
                                    </div>

                                    {reactions.length > 0 && (
                                        <button
                                            type="button"
                                            className="anb-reaction-summary"
                                            onClick={() => setShowReactors(!showReactors)}
                                            aria-expanded={showReactors}
                                        >
                                            {reactions.length} reaction{reactions.length > 1 ? 's' : ''}
                                        </button>
                                    )}

                                    {showReactors && reactions.length > 0 && (
                                        <ul className="anb-reactor-list">
                                            {reactions.map(r => {
                                                const name = `${r.profiles?.first_name || 'Someone'} ${r.profiles?.last_name || ''}`.trim();
                                                const emoji = REACTIONS.find(x => x.type === r.reaction_type)?.emoji ?? '✅';
                                                return (
                                                    <li key={r.id} className="anb-reactor">
                                                        <span className="anb-avatar" aria-hidden="true">{initialsOf(name)}</span>
                                                        <span className="anb-reactor-name">{name}</span>
                                                        <span aria-hidden="true">{emoji}</span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="anb-modal-foot">
                            {renderDetailActions?.(selected)}
                            <button type="button" className="anb-btn anb-btn-quiet" onClick={() => setSelected(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnnouncementsBoard;
