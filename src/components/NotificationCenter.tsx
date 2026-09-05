import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../contexts/NotificationsContext';
import {
    notificationService,
    type NotificationType,
    type UserNotification,
} from '../services/notificationService';
import CustomSelect from './CustomSelect';
import { notificationIcon, relativeTime } from '../utils/notifications';
import './Notifications.css';

/**
 * The full notification centre, shared by every portal.
 *
 * Queries are paged and filtered in the database rather than in memory, so a
 * user with thousands of notifications only ever loads the page they are
 * looking at. RLS restricts every query to the signed-in user.
 */

interface NotificationCenterProps {
    onClose: () => void;
}

type StateFilter = 'all' | 'unread' | 'read';

const PAGE_SIZE = 20;

const TYPE_OPTIONS: { value: NotificationType | 'all'; label: string }[] = [
    { value: 'all', label: 'All categories' },
    { value: 'announcement', label: 'Announcements' },
    { value: 'journal_approved', label: 'Journal approved' },
    { value: 'journal_rejected', label: 'Journal rejected' },
    { value: 'journal_revision', label: 'Revision requested' },
    { value: 'attendance', label: 'Attendance' },
    { value: 'assignment', label: 'Assignments' },
    { value: 'company', label: 'Company' },
    { value: 'system', label: 'System' },
    { value: 'reminder', label: 'Reminders' },
    { value: 'general', label: 'General' },
];

const NotificationCenter: React.FC<NotificationCenterProps> = ({ onClose }) => {
    const notifications = useNotifications();
    const navigate = useNavigate();

    const [items, setItems] = useState<UserNotification[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [state, setState] = useState<StateFilter>('all');
    const [typeFilter, setTypeFilter] = useState<NotificationType | 'all'>('all');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    /** Guards against a slow earlier query landing on top of a newer one. */
    const requestId = useRef(0);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
        return () => window.clearTimeout(timer);
    }, [search]);

    const load = useCallback(async (nextOffset: number, append: boolean) => {
        const currentRequest = requestId.current + 1;
        requestId.current = currentRequest;

        if (append) setLoadingMore(true); else setLoading(true);
        setError(null);

        try {
            const page = await notificationService.listNotifications({
                limit: PAGE_SIZE,
                offset: nextOffset,
                state,
                notificationType: typeFilter,
                search: debouncedSearch,
            });
            if (requestId.current !== currentRequest) return;

            setItems(previous => (append ? [...previous, ...page.notifications] : page.notifications));
            setTotal(page.total);
            setOffset(nextOffset + page.notifications.length);
            setHasMore(page.hasMore);
        } catch (err) {
            if (requestId.current !== currentRequest) return;
            console.error('Failed to load notifications:', err);
            setError(err instanceof Error ? err.message : 'Could not load your notifications.');
        } finally {
            if (requestId.current === currentRequest) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [state, typeFilter, debouncedSearch]);

    useEffect(() => { void load(0, false); }, [load]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    const unread = notifications?.unreadCount ?? 0;

    const emptyMessage = useMemo(() => {
        if (debouncedSearch.trim() || typeFilter !== 'all' || state !== 'all') {
            return { title: 'No matching notifications', body: 'Try a different search or filter.' };
        }
        return { title: 'No notifications yet', body: "You're all caught up. New updates will appear here." };
    }, [debouncedSearch, typeFilter, state]);

    if (!notifications) return null;

    const { markRead, markUnread, markAllRead, remove, routeFor } = notifications;

    /** Keeps the centre's own list in step with the shared context state. */
    const patchLocal = (id: string, patch: Partial<UserNotification>) => {
        setItems(previous => previous.map(item => (item.id === id ? { ...item, ...patch } : item)));
    };

    const openNotification = (notification: UserNotification) => {
        if (!notification.is_read) {
            patchLocal(notification.id, { is_read: true, read_at: new Date().toISOString() });
            void markRead(notification.id);
        }
        const route = routeFor(notification);
        if (route) {
            onClose();
            navigate(route);
        }
    };

    return (
        <div className="ntf-center-overlay" onClick={onClose} role="presentation">
            <div
                className="ntf-center"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ntf-center-title"
                onClick={e => e.stopPropagation()}
            >
                <header className="ntf-center-head">
                    <div>
                        <h2 id="ntf-center-title" className="ntf-center-title">Notifications</h2>
                        <p className="ntf-center-sub">
                            {total} total{unread > 0 ? ` · ${unread} unread` : ''}
                            {notifications.live ? '' : ' · reconnecting…'}
                        </p>
                    </div>
                    <div className="ntf-center-head-actions">
                        {unread > 0 && (
                            <button type="button" className="ntf-btn ntf-btn-quiet" onClick={() => {
                                setItems(previous => previous.map(item => ({ ...item, is_read: true })));
                                void markAllRead();
                            }}>
                                Mark all as read
                            </button>
                        )}
                        <button type="button" className="ntf-center-close" onClick={onClose} aria-label="Close notifications">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                    </div>
                </header>

                <div className="ntf-center-toolbar">
                    <div className="ntf-tabs" role="tablist" aria-label="Read state">
                        {(['all', 'unread', 'read'] as StateFilter[]).map(value => (
                            <button
                                key={value}
                                type="button"
                                role="tab"
                                aria-selected={state === value}
                                className={`ntf-tab${state === value ? ' active' : ''}`}
                                onClick={() => setState(value)}
                            >
                                {value === 'all' ? 'All' : value === 'unread' ? 'Unread' : 'Read'}
                            </button>
                        ))}
                    </div>
                    <div className="ntf-center-filters">
                        <div className="ntf-search">
                            <input
                                type="search"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search notifications..."
                                aria-label="Search notifications"
                            />
                        </div>
                        <CustomSelect
                            value={typeFilter}
                            onChange={value => setTypeFilter(value as NotificationType | 'all')}
                            options={TYPE_OPTIONS}
                        />
                    </div>
                </div>

                <div className="ntf-center-body">
                    {loading ? (
                        <div className="ntf-skeletons">
                            {[0, 1, 2, 3, 4].map(i => <div key={i} className="ntf-skeleton" />)}
                        </div>
                    ) : error ? (
                        <div className="ntf-center-state">
                            <div className="ntf-empty-icon" aria-hidden="true">⚠️</div>
                            <h3>Could not load notifications</h3>
                            <p>{error}</p>
                            <button type="button" className="ntf-btn ntf-btn-primary" onClick={() => void load(0, false)}>
                                Try again
                            </button>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="ntf-center-state">
                            <div className="ntf-empty-icon" aria-hidden="true">🔔</div>
                            <h3>{emptyMessage.title}</h3>
                            <p>{emptyMessage.body}</p>
                        </div>
                    ) : (
                        <>
                            <ul className="ntf-center-list">
                                {items.map(item => (
                                    <li key={item.id} className={`ntf-row${item.is_read ? '' : ' unread'}`}>
                                        <button
                                            type="button"
                                            className="ntf-row-main"
                                            onClick={() => openNotification(item)}
                                        >
                                            <span className="ntf-item-icon" aria-hidden="true">{notificationIcon(item)}</span>
                                            <span className="ntf-item-body">
                                                <span className="ntf-item-title">{item.title}</span>
                                                <span className="ntf-item-message">{item.message}</span>
                                                <span className="ntf-item-time">
                                                    {relativeTime(item.created_at)}
                                                    {' · '}
                                                    {new Date(item.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                                                </span>
                                            </span>
                                        </button>
                                        <div className="ntf-row-actions">
                                            <button
                                                type="button"
                                                className="ntf-row-action"
                                                onClick={() => {
                                                    if (item.is_read) {
                                                        patchLocal(item.id, { is_read: false, read_at: null });
                                                        void markUnread(item.id);
                                                    } else {
                                                        patchLocal(item.id, { is_read: true, read_at: new Date().toISOString() });
                                                        void markRead(item.id);
                                                    }
                                                }}
                                            >
                                                {item.is_read ? 'Mark unread' : 'Mark read'}
                                            </button>
                                            <button
                                                type="button"
                                                className="ntf-row-action danger"
                                                onClick={() => {
                                                    setItems(previous => previous.filter(row => row.id !== item.id));
                                                    setTotal(count => Math.max(0, count - 1));
                                                    void remove(item.id);
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>

                            {hasMore && (
                                <div className="ntf-center-more">
                                    <button
                                        type="button"
                                        className="ntf-btn ntf-btn-quiet"
                                        onClick={() => void load(offset, true)}
                                        disabled={loadingMore}
                                    >
                                        {loadingMore ? 'Loading…' : 'Load more'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotificationCenter;
