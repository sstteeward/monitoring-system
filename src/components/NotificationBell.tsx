import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../contexts/NotificationsContext';
import type { UserNotification } from '../services/notificationService';
import { notificationIcon, relativeTime } from '../utils/notifications';
import NotificationCenter from './NotificationCenter';
import './Notifications.css';

/**
 * The notification bell, identical in every portal.
 *
 * Renders nothing outside a NotificationsProvider, so a portal that has not been
 * wired up yet degrades quietly instead of crashing.
 */

const NotificationBell: React.FC = () => {
    const notifications = useNotifications();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [centerOpen, setCenterOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open]);

    const unread = notifications?.unreadCount ?? 0;
    const badge = useMemo(() => (unread > 9 ? '9+' : String(unread)), [unread]);

    if (!notifications) return null;

    const { recent, loading, markRead, markAllRead, routeFor } = notifications;

    const openNotification = (notification: UserNotification) => {
        void markRead(notification.id);
        setOpen(false);
        const route = routeFor(notification);
        if (route) navigate(route);
    };

    return (
        <>
            <div className="ntf-bell-wrap">
                <button
                    type="button"
                    className={`ntf-bell${open ? ' is-open' : ''}`}
                    onClick={() => setOpen(value => !value)}
                    aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
                    aria-expanded={open}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    {unread > 0 && <span className="ntf-badge">{badge}</span>}
                </button>

                {open && (
                    <>
                        <div className="ntf-scrim" onClick={() => setOpen(false)} />
                        <div className="ntf-panel" ref={panelRef} role="dialog" aria-label="Notifications">
                            <div className="ntf-panel-head">
                                <div className="ntf-panel-title">
                                    Notifications
                                    {unread > 0 && <span className="ntf-panel-count">{unread} new</span>}
                                </div>
                                {unread > 0 && (
                                    <button type="button" className="ntf-link" onClick={() => void markAllRead()}>
                                        Mark all read
                                    </button>
                                )}
                            </div>

                            <div className="ntf-panel-list">
                                {loading ? (
                                    <div className="ntf-panel-empty">Loading notifications…</div>
                                ) : recent.length === 0 ? (
                                    <div className="ntf-panel-empty">
                                        <div className="ntf-empty-icon" aria-hidden="true">🔔</div>
                                        <div>You have no notifications yet.</div>
                                    </div>
                                ) : (
                                    recent.map(item => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            className={`ntf-item${item.is_read ? '' : ' unread'}`}
                                            onClick={() => openNotification(item)}
                                        >
                                            <span className="ntf-item-icon" aria-hidden="true">{notificationIcon(item)}</span>
                                            <span className="ntf-item-body">
                                                <span className="ntf-item-title">{item.title}</span>
                                                <span className="ntf-item-message">{item.message}</span>
                                                <span className="ntf-item-time">{relativeTime(item.created_at)}</span>
                                            </span>
                                            {!item.is_read && <span className="ntf-item-dot" aria-hidden="true" />}
                                        </button>
                                    ))
                                )}
                            </div>

                            <div className="ntf-panel-foot">
                                <button
                                    type="button"
                                    className="ntf-link"
                                    onClick={() => { setOpen(false); setCenterOpen(true); }}
                                >
                                    View all notifications
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {centerOpen && <NotificationCenter onClose={() => setCenterOpen(false)} />}
        </>
    );
};

export default NotificationBell;
