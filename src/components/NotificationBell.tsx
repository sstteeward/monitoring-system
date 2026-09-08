import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

/** Gap between the bell and the panel, and the panel's minimum breathing room
 *  against the viewport edges. */
const PANEL_GAP = 8;
const VIEWPORT_MARGIN = 8;

interface PanelPosition {
    top: number;
    right: number;
    maxHeight: number;
}

const NotificationBell: React.FC = () => {
    const notifications = useNotifications();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [centerOpen, setCenterOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const bellRef = useRef<HTMLButtonElement>(null);
    const [position, setPosition] = useState<PanelPosition | null>(null);

    /*
     * The panel is rendered into document.body rather than beside the bell.
     *
     * In the portal shells the bell sits inside `.topbar`, which is
     * `position: sticky` WITH a `z-index`, so it opens its own stacking
     * context — a panel nested in it could never paint above `.sidebar`
     * (z-index 110) or the chat widget (9999) no matter how high its own
     * z-index went. The topbar also sits inside `.dashboard-main`
     * (`overflow-y: auto`) and `.dashboard-container` (`overflow: hidden`),
     * either of which clips an absolutely positioned child.
     *
     * Portalling escapes all three. The trade-off is that the panel no longer
     * inherits the bell's offset parent, so its position is measured from the
     * bell instead — and re-measured whenever anything could move it.
     */
    const reposition = useCallback(() => {
        const bell = bellRef.current;
        if (!bell) return;
        const rect = bell.getBoundingClientRect();
        const top = rect.bottom + PANEL_GAP;
        // Anchor the panel's right edge to the bell's, then keep it inside the
        // viewport if the bell is close to the edge.
        const right = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.right);
        const maxHeight = Math.max(180, window.innerHeight - top - VIEWPORT_MARGIN);
        setPosition(prev =>
            prev && prev.top === top && prev.right === right && prev.maxHeight === maxHeight
                ? prev
                : { top, right, maxHeight }
        );
    }, []);

    // Before paint, so the panel never flashes at the wrong place.
    useLayoutEffect(() => {
        if (!open) return;
        reposition();
    }, [open, reposition]);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKeyDown);

        // `true` so this also catches scrolling of `.dashboard-main`, which is
        // the actual scroll container in the portal shells, not the window.
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);

        // Catches everything a scroll/resize listener misses: the sidebar's
        // width transition, a responsive breakpoint changing the header, or
        // browser zoom reflowing the bar.
        const observer = new ResizeObserver(reposition);
        if (bellRef.current) observer.observe(bellRef.current);
        observer.observe(document.documentElement);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
            observer.disconnect();
        };
    }, [open, reposition]);

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
                    ref={bellRef}
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

                {open && position && createPortal(
                    <>
                        <div className="ntf-scrim" onClick={() => setOpen(false)} />
                        <div
                            className="ntf-panel"
                            ref={panelRef}
                            role="dialog"
                            aria-label="Notifications"
                            style={{
                                top: `${position.top}px`,
                                right: `${position.right}px`,
                                // Not `maxHeight`: an inline max-height would beat
                                // the stylesheet's design cap. The rule folds this
                                // into a min() instead.
                                ['--ntf-max-height' as string]: `${position.maxHeight}px`,
                            } as React.CSSProperties}
                        >
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
                    </>,
                    document.body
                )}
            </div>

            {centerOpen && <NotificationCenter onClose={() => setCenterOpen(false)} />}
        </>
    );
};

export default NotificationBell;
