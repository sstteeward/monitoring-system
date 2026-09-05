import type { NotificationType, UserNotification } from '../services/notificationService';

/** Icon per notification category, shared by the bell, the centre and toasts. */
const TYPE_ICON: Record<NotificationType, string> = {
    announcement: '📢',
    journal_approved: '✅',
    journal_rejected: '⛔',
    journal_revision: '✏️',
    attendance: '🕒',
    assignment: '🔗',
    company: '🏢',
    system: '⚙️',
    reminder: '⏰',
    general: '🔔',
};

export function notificationIcon(notification: UserNotification): string {
    return TYPE_ICON[(notification.notification_type ?? 'general') as NotificationType] ?? '🔔';
}

/** "Just now", "5m ago", "3h ago", "4d ago", then an absolute date. */
export function relativeTime(value: string): string {
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return '';

    const seconds = Math.round((Date.now() - then) / 1000);
    if (seconds < 45) return 'Just now';
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.round(seconds / 86400)}d ago`;
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
