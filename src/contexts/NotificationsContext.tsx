import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
    notificationService,
    type NotificationPreferences,
    type UserNotification,
} from '../services/notificationService';

/**
 * The single notification subscription for a signed-in session.
 *
 * Every portal mounts this once, so the app holds exactly one realtime channel
 * no matter how many bells, panels or toasts are on screen. The channel is
 * filtered on the authenticated user's id and RLS re-checks each row, so a
 * session can only ever receive its own notifications.
 */

export type PortalRole = 'admin' | 'coordinator' | 'adviser' | 'student' | 'company';

interface NotificationsContextValue {
    /** The most recent notifications, for the bell dropdown. */
    recent: UserNotification[];
    unreadCount: number;
    loading: boolean;
    error: string | null;
    /** True while the realtime channel is connected. */
    live: boolean;
    preferences: NotificationPreferences | null;
    role: PortalRole;
    /** Notifications that arrived in this session and have not been shown yet. */
    toasts: UserNotification[];
    dismissToast: (id: string) => void;
    refresh: () => Promise<void>;
    markRead: (id: string) => Promise<void>;
    markUnread: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
    remove: (id: string) => Promise<void>;
    savePreferences: (patch: Partial<Omit<NotificationPreferences, 'user_id'>>) => Promise<void>;
    /** In-app route a notification should open, or null when it has no target. */
    routeFor: (notification: UserNotification) => string | null;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const PORTAL_ROOT: Record<PortalRole, string> = {
    admin: '/admin',
    coordinator: '/coordinator',
    adviser: '/adviser',
    student: '/student',
    company: '/company',
};

/** How many notifications the bell dropdown keeps in memory. */
const RECENT_LIMIT = 20;
/** How long a toast stays on screen. */
const TOAST_TIMEOUT_MS = 6000;

/**
 * Where a notification leads, given what it is about and who is reading it.
 * Returning null means the notification is informational and opens nothing.
 */
function resolveRoute(notification: UserNotification, role: PortalRole): string | null {
    const root = PORTAL_ROOT[role];
    const relatedType = notification.related_type ?? notification.source_type ?? null;
    const relatedId = notification.related_id ?? notification.source_id ?? null;

    switch (relatedType) {
        case 'announcement': {
            if (role === 'company') return `${root}/announcements`;
            const query = relatedId ? `?id=${encodeURIComponent(relatedId)}` : '';
            return `${root}/announcement${query}`;
        }
        case 'journal':
            if (role === 'student') return `${root}/journal`;
            if (role === 'company') return `${root}/journals`;
            if (role === 'adviser' || role === 'coordinator') return `${root}/approvals`;
            return null;
        case 'attendance':
            return role === 'student' ? `${root}/dtr` : `${root}/attendance`;
        case 'section':
            return role === 'adviser' ? `${root}/sections` : `${root}/advisers`;
        case 'company_request':
        case 'company':
            if (role === 'coordinator') return `${root}/companies`;
            if (role === 'admin') return `${root}/companies`;
            return `${root}/profile`;
        case 'student':
            if (role === 'adviser') return `${root}/students`;
            if (role === 'coordinator' || role === 'admin') return `${root}/students`;
            return null;
        case 'requirement':
            // The student manages their own requirements; reviewers land on the
            // verification worklist.
            if (role === 'student') return `${root}/documents`;
            if (role === 'coordinator' || role === 'admin') return `${root}/requirements`;
            return null;
        case 'grade':
            return role === 'student' ? `${root}/profile` : null;
        case 'department_request':
            return role === 'admin' ? `${root}/departments` : `${root}/profile`;
        default:
            return null;
    }
}

export const NotificationsProvider: React.FC<{ role: PortalRole; children: React.ReactNode }> = ({
    role,
    children,
}) => {
    const [userId, setUserId] = useState<string | null>(null);
    const [recent, setRecent] = useState<UserNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [live, setLive] = useState(false);
    const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
    const [toasts, setToasts] = useState<UserNotification[]>([]);

    /** Ids already surfaced as a toast, so a re-delivery never pops twice. */
    const toastedIds = useRef<Set<string>>(new Set());
    /** Set once the first load completes, so the backlog is not toasted on login. */
    const readyForToasts = useRef(false);
    /** Mirrors the in-app preference so the realtime handler reads it without re-subscribing. */
    const inAppEnabled = useRef(true);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id ?? null));
    }, []);

    const refresh = useCallback(async () => {
        setError(null);
        try {
            const [page, counts] = await Promise.all([
                notificationService.listNotifications({ limit: RECENT_LIMIT }),
                notificationService.getNotificationCounts(),
            ]);
            setRecent(page.notifications);
            setUnreadCount(counts.unread);
        } catch (err) {
            console.error('Failed to load notifications:', err);
            setError(err instanceof Error ? err.message : 'Could not load notifications.');
        } finally {
            setLoading(false);
            readyForToasts.current = true;
        }
    }, []);

    useEffect(() => {
        if (!userId) return;
        void refresh();
        notificationService.getNotificationPreferences()
            .then(setPreferences)
            .catch(err => console.error('Failed to load notification preferences:', err));
    }, [userId, refresh]);

    useEffect(() => {
        inAppEnabled.current = preferences?.in_app_enabled ?? true;
    }, [preferences?.in_app_enabled]);

    useEffect(() => {
        if (!userId) return;

        return notificationService.subscribeToUserNotifications(userId, {
            onInsert: notification => {
                setRecent(previous => (
                    previous.some(item => item.id === notification.id)
                        ? previous
                        : [notification, ...previous].slice(0, RECENT_LIMIT)
                ));
                if (!notification.is_read) setUnreadCount(count => count + 1);

                // Toast only genuinely new arrivals, only once each, and only if
                // the user has left in-app pop-ups on. The bell and the centre
                // keep working either way — the preference silences the pop-up,
                // it does not hide the notification.
                if (
                    readyForToasts.current
                    && inAppEnabled.current
                    && !toastedIds.current.has(notification.id)
                ) {
                    toastedIds.current.add(notification.id);
                    setToasts(previous => [...previous, notification].slice(-3));
                }
            },
            onUpdate: notification => {
                setRecent(previous => previous.map(item => (
                    item.id === notification.id ? notification : item
                )));
                // Another tab may have read or unread it; the count is cheap to re-derive.
                void notificationService.getNotificationCounts()
                    .then(counts => setUnreadCount(counts.unread))
                    .catch(() => undefined);
            },
            onDelete: id => {
                setRecent(previous => previous.filter(item => item.id !== id));
                void notificationService.getNotificationCounts()
                    .then(counts => setUnreadCount(counts.unread))
                    .catch(() => undefined);
            },
            onStatusChange: status => {
                const connected = status === 'SUBSCRIBED';
                setLive(connected);
                // Supabase reconnects on its own; anything that happened while the
                // socket was down is picked up by this re-sync.
                if (connected && readyForToasts.current) void refresh();
            },
        });
    }, [userId, refresh]);

    // Toasts expire on their own so they never sit over the UI.
    useEffect(() => {
        if (toasts.length === 0) return;
        const timer = window.setTimeout(() => {
            setToasts(previous => previous.slice(1));
        }, TOAST_TIMEOUT_MS);
        return () => window.clearTimeout(timer);
    }, [toasts]);

    const dismissToast = useCallback((id: string) => {
        setToasts(previous => previous.filter(item => item.id !== id));
    }, []);

    const markRead = useCallback(async (id: string) => {
        const target = recent.find(item => item.id === id);
        if (target?.is_read) return;

        setRecent(previous => previous.map(item => (
            item.id === id ? { ...item, is_read: true, read_at: new Date().toISOString() } : item
        )));
        setUnreadCount(count => Math.max(0, count - 1));

        try {
            await notificationService.markAsRead(id);
        } catch (err) {
            console.error('Failed to mark the notification as read:', err);
            await refresh();
        }
    }, [recent, refresh]);

    const markUnread = useCallback(async (id: string) => {
        setRecent(previous => previous.map(item => (
            item.id === id ? { ...item, is_read: false, read_at: null } : item
        )));
        setUnreadCount(count => count + 1);

        try {
            await notificationService.markAsUnread(id);
        } catch (err) {
            console.error('Failed to mark the notification as unread:', err);
            await refresh();
        }
    }, [refresh]);

    const markAllRead = useCallback(async () => {
        const previous = recent;
        const previousCount = unreadCount;
        const readAt = new Date().toISOString();
        setRecent(items => items.map(item => ({ ...item, is_read: true, read_at: item.read_at ?? readAt })));
        setUnreadCount(0);

        try {
            await notificationService.markAllNotificationsRead();
        } catch (err) {
            console.error('Failed to mark all notifications as read:', err);
            setRecent(previous);
            setUnreadCount(previousCount);
        }
    }, [recent, unreadCount]);

    const remove = useCallback(async (id: string) => {
        const target = recent.find(item => item.id === id);
        setRecent(previous => previous.filter(item => item.id !== id));
        if (target && !target.is_read) setUnreadCount(count => Math.max(0, count - 1));

        try {
            await notificationService.deleteNotification(id);
        } catch (err) {
            console.error('Failed to delete the notification:', err);
            await refresh();
        }
    }, [recent, refresh]);

    const savePreferences = useCallback(async (patch: Partial<Omit<NotificationPreferences, 'user_id'>>) => {
        const previous = preferences;
        if (previous) setPreferences({ ...previous, ...patch });

        try {
            // The whole row is upserted, so an unchanged toggle keeps its value
            // rather than falling back to the column default.
            const current: Partial<Omit<NotificationPreferences, 'user_id'>> = previous
                ? {
                    in_app_enabled: previous.in_app_enabled,
                    email_enabled: previous.email_enabled,
                    email_announcements: previous.email_announcements,
                    email_journal: previous.email_journal,
                    email_attendance: previous.email_attendance,
                    email_assignments: previous.email_assignments,
                    email_system: previous.email_system,
                }
                : {};
            await notificationService.saveNotificationPreferences({ ...current, ...patch });
        } catch (err) {
            console.error('Failed to save notification preferences:', err);
            setPreferences(previous);
            throw err;
        }
    }, [preferences]);

    const routeFor = useCallback(
        (notification: UserNotification) => resolveRoute(notification, role),
        [role],
    );

    const value = useMemo<NotificationsContextValue>(() => ({
        recent,
        unreadCount,
        loading,
        error,
        live,
        preferences,
        role,
        toasts,
        dismissToast,
        refresh,
        markRead,
        markUnread,
        markAllRead,
        remove,
        savePreferences,
        routeFor,
    }), [
        recent, unreadCount, loading, error, live, preferences, role, toasts,
        dismissToast, refresh, markRead, markUnread, markAllRead, remove, savePreferences, routeFor,
    ]);

    return (
        <NotificationsContext.Provider value={value}>
            {children}
        </NotificationsContext.Provider>
    );
};

/**
 * Notification state for the current portal. Returns null outside a provider so
 * a component can render without one rather than crashing the portal.
 */
export function useNotifications(): NotificationsContextValue | null {
    return useContext(NotificationsContext);
}
