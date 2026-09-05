import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../contexts/NotificationsContext';
import { notificationIcon, relativeTime } from '../utils/notifications';
import './Notifications.css';

/**
 * Transient toasts for notifications that arrive while the user is working.
 *
 * The context only queues genuinely new arrivals and remembers which ids it has
 * already surfaced, so a realtime reconnect or a duplicate event cannot pop the
 * same notification twice. Each toast dismisses itself; clicking one opens the
 * related page and marks it read.
 */
const NotificationToaster: React.FC = () => {
    const notifications = useNotifications();
    const navigate = useNavigate();

    if (!notifications || notifications.toasts.length === 0) return null;

    const { toasts, dismissToast, markRead, routeFor } = notifications;

    return (
        <div className="ntf-toaster" role="region" aria-label="New notifications" aria-live="polite">
            {toasts.map(item => {
                const route = routeFor(item);
                return (
                    <div key={item.id} className="ntf-toast">
                        <button
                            type="button"
                            className="ntf-toast-main"
                            onClick={() => {
                                void markRead(item.id);
                                dismissToast(item.id);
                                if (route) navigate(route);
                            }}
                        >
                            <span className="ntf-toast-icon" aria-hidden="true">{notificationIcon(item)}</span>
                            <span className="ntf-toast-body">
                                <span className="ntf-toast-kicker">New notification</span>
                                <span className="ntf-toast-title">{item.title}</span>
                                <span className="ntf-toast-message">{item.message}</span>
                                <span className="ntf-toast-time">{relativeTime(item.created_at)}</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            className="ntf-toast-close"
                            onClick={() => dismissToast(item.id)}
                            aria-label="Dismiss notification"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                    </div>
                );
            })}
        </div>
    );
};

export default NotificationToaster;
