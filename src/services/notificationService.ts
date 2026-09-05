import { supabase } from '../lib/supabaseClient';

/** The roles an announcement can be addressed to. */
export type AnnouncementAudience = 'all' | 'student' | 'adviser' | 'coordinator' | 'company' | 'admin';

export type AnnouncementPriority = 'low' | 'normal' | 'high' | 'urgent';

/** Editorial category shown on the card, distinct from `category` (the source). */
export type AnnouncementType = 'general' | 'academic' | 'event' | 'deadline' | 'reminder' | 'policy' | 'emergency';

export interface Announcement {
    id: string;
    title: string;
    content: string;
    author: string | null;
    created_at: string;
    updated_at?: string | null;
    published_at?: string | null;
    company_id?: string | null;
    created_by?: string | null;
    created_by_role?: 'company' | 'coordinator' | 'admin' | 'student' | null;
    category?: 'company' | 'coordinator' | null;
    type?: AnnouncementType | null;
    status?: 'published' | 'draft' | 'archived' | string;
    priority?: AnnouncementPriority | null;
    target_audience?: AnnouncementAudience[] | null;
    attachment_url?: string | null;
    attachment_name?: string | null;
    company_name?: string | null;
    creator_name?: string | null;
    /** Read state of the signed-in user, from `announcement_reads`. */
    is_read?: boolean;
    company?: { name: string } | null;
}

/** Routing category — decides the icon, the email preference and where a click goes. */
export type NotificationType =
    | 'announcement'
    | 'journal_approved'
    | 'journal_rejected'
    | 'journal_revision'
    | 'attendance'
    | 'assignment'
    | 'company'
    | 'system'
    | 'reminder'
    | 'general';

/** Visual severity, unchanged from the original schema. */
export type NotificationSeverity = 'info' | 'warning' | 'success' | 'danger';

export interface UserNotification {
    id: string;
    user_id: string;
    title: string;
    message: string;
    type: NotificationSeverity;
    is_read: boolean;
    created_at: string;
    read_at?: string | null;
    recipient_role?: string | null;
    notification_type?: NotificationType;
    related_type?: string | null;
    related_id?: string | null;
    email_sent?: boolean;
    email_sent_at?: string | null;
    /** Legacy aliases of related_type / related_id, kept in sync by the database. */
    source_type?: string | null;
    source_id?: string | null;
}

export interface NotificationPreferences {
    user_id: string;
    in_app_enabled: boolean;
    email_enabled: boolean;
    email_announcements: boolean;
    email_journal: boolean;
    email_attendance: boolean;
    email_assignments: boolean;
    email_system: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<NotificationPreferences, 'user_id'> = {
    in_app_enabled: true,
    email_enabled: true,
    email_announcements: true,
    email_journal: true,
    email_attendance: true,
    email_assignments: true,
    email_system: true,
};

/** Options accepted by every notification-creating helper. */
export interface NotifyOptions {
    severity?: NotificationSeverity;
    notificationType?: NotificationType;
    relatedType?: string;
    relatedId?: string | null;
}

export interface NotificationQuery {
    limit?: number;
    offset?: number;
    /** 'all' | 'unread' | 'read' */
    state?: 'all' | 'unread' | 'read';
    notificationType?: NotificationType | 'all';
    search?: string;
}

export interface AnnouncementReaction {
    id: string;
    announcement_id: string;
    user_id: string;
    reaction_type: 'like' | 'celebrate' | 'heart' | 'acknowledge';
    created_at: string;
    profiles?: {
        first_name: string;
        last_name: string;
        avatar_url?: string;
    };
}

export const notificationService = {
    async getAnnouncements() {
        const { data, error } = await supabase
            .from('announcements')
            .select('*, company:companies(name)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as Announcement[];
    },

    /**
     * Every announcement the signed-in user is authorized to see, newest first,
     * with the publisher's name and the user's own read state attached.
     *
     * The audience/role filtering happens inside `get_my_announcements`, so the
     * caller never has to (and never gets to) decide what it may read. RLS on
     * `announcements` enforces the same rules for direct table access.
     */
    async getMyAnnouncements() {
        const { data, error } = await supabase.rpc('get_my_announcements');

        if (error) throw error;
        return (data || []) as Announcement[];
    },

    /**
     * Open a single announcement. Access is re-verified server-side, so a
     * fabricated id in the deep link cannot reach another role's announcement.
     */
    async getAnnouncementForMe(announcementId: string) {
        const { data, error } = await supabase
            .rpc('get_announcement_for_me', { p_announcement_id: announcementId });

        if (error) throw error;
        const rows = (data || []) as Announcement[];
        return rows.length > 0 ? rows[0] : null;
    },

    /**
     * Record that the user opened this announcement. Writes `announcement_reads`
     * and clears the matching bell notification in one server-side call, so the
     * card badge and the bell can never disagree.
     */
    async markAnnouncementRead(announcementId: string) {
        const { error } = await supabase
            .rpc('mark_announcement_read', { p_announcement_id: announcementId });

        if (error) throw error;
        return true;
    },

    /**
     * Mark every announcement the user can currently see as read. The server
     * derives that set from the same authorized query the list uses, so this can
     * never touch an announcement the user is not allowed to read.
     *
     * @returns how many announcements were newly marked.
     */
    async markAllAnnouncementsRead() {
        const { data, error } = await supabase.rpc('mark_all_announcements_read');

        if (error) throw error;
        return (data ?? 0) as number;
    },

    /**
     * Newly published announcements reach an open portal without a refresh.
     * Realtime respects RLS, so a subscriber is only told about announcements it
     * is allowed to read — but the payload is deliberately not trusted here: the
     * caller re-fetches through `getMyAnnouncements`.
     */
    subscribeToAnnouncements(onChange: () => void) {
        const channel = supabase
            .channel('announcements-feed')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'announcements' },
                () => onChange(),
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    },

    /**
     * Open a single announcement. Access is verified server-side via the
     * get_student_announcement RPC — a student can only ever read an
     * announcement for the company they are (or were) assigned to, or a
     * school-wide coordinator announcement.
     *
     * @deprecated Student-only. Use {@link getAnnouncementForMe}, which applies
     * the same server-side check for every role.
     */
    async getStudentAnnouncement(announcementId: string) {
        const { data, error } = await supabase
            .rpc('get_student_announcement', { p_announcement_id: announcementId });

        if (error) throw error;
        const rows = (data || []) as Announcement[];
        return rows.length > 0 ? rows[0] : null;
    },

    async getAnnouncementAttachmentUrl(filePath: string) {
        const { data, error } = await supabase.storage
            .from('company_documents')
            .createSignedUrl(filePath, 3600);
        if (error) throw error;
        return data.signedUrl;
    },

    async getUserNotifications() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('user_notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as UserNotification[];
    },

    /**
     * One page of the signed-in user's notifications. RLS restricts the rows to
     * the caller, so the filters here are for the reader's convenience, not for
     * access control.
     */
    async listNotifications(query: NotificationQuery = {}) {
        const { limit = 20, offset = 0, state = 'all', notificationType = 'all', search } = query;

        let request = supabase
            .from('user_notifications')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (state === 'unread') request = request.eq('is_read', false);
        if (state === 'read') request = request.eq('is_read', true);
        if (notificationType !== 'all') request = request.eq('notification_type', notificationType);
        if (search?.trim()) {
            const term = search.trim().replace(/[%,()]/g, ' ');
            request = request.or(`title.ilike.%${term}%,message.ilike.%${term}%`);
        }

        const { data, error, count } = await request;
        if (error) throw error;

        return {
            notifications: (data || []) as UserNotification[],
            total: count ?? 0,
            hasMore: (count ?? 0) > offset + (data?.length ?? 0),
        };
    },

    /** Badge counts, computed server-side so the client never has to page to count. */
    async getNotificationCounts() {
        const { data, error } = await supabase.rpc('get_my_notification_counts');
        if (error) throw error;
        const row = (Array.isArray(data) ? data[0] : data) as { total: number; unread: number } | undefined;
        return { total: Number(row?.total ?? 0), unread: Number(row?.unread ?? 0) };
    },

    /**
     * Live notifications for one user.
     *
     * The subscription is filtered on `user_id` server-side and RLS re-checks
     * every row, so a subscriber cannot receive another user's notifications.
     * `onStatusChange` reports the channel state — the caller re-syncs counts on
     * a reconnect, which is what keeps the badge correct after a dropout.
     */
    subscribeToUserNotifications(
        userId: string,
        handlers:
            | ((notification: UserNotification) => void)
            | {
                onInsert?: (notification: UserNotification) => void;
                onUpdate?: (notification: UserNotification) => void;
                onDelete?: (id: string) => void;
                onStatusChange?: (status: string) => void;
            },
    ) {
        const callbacks = typeof handlers === 'function' ? { onInsert: handlers } : handlers;
        const filter = `user_id=eq.${userId}`;

        const channel = supabase
            .channel(`user-notifications-${userId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'user_notifications', filter },
                payload => callbacks.onInsert?.(payload.new as UserNotification),
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'user_notifications', filter },
                payload => callbacks.onUpdate?.(payload.new as UserNotification),
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'user_notifications', filter },
                payload => callbacks.onDelete?.((payload.old as { id: string }).id),
            )
            .subscribe(status => callbacks.onStatusChange?.(status));

        return () => {
            void supabase.removeChannel(channel);
        };
    },

    async markAsRead(id: string) {
        const { error } = await supabase
            .from('user_notifications')
            .update({ is_read: true })
            .eq('id', id);

        if (error) throw error;
        return true;
    },

    async markAsUnread(id: string) {
        const { error } = await supabase
            .from('user_notifications')
            .update({ is_read: false })
            .eq('id', id);

        if (error) throw error;
        return true;
    },

    /** Marks only the caller's own notifications — enforced inside the RPC. */
    async markAllNotificationsRead() {
        const { data, error } = await supabase.rpc('mark_all_notifications_read');
        if (error) throw error;
        return (data ?? 0) as number;
    },

    async deleteNotification(id: string) {
        const { error } = await supabase
            .from('user_notifications')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    },

    async getNotificationPreferences(): Promise<NotificationPreferences | null> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('notification_preferences')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) throw error;
        // No row yet means the user has never changed anything — the database
        // treats that as "everything on", so the UI must show the same.
        return (data as NotificationPreferences | null)
            ?? { user_id: user.id, ...DEFAULT_NOTIFICATION_PREFERENCES };
    },

    async saveNotificationPreferences(patch: Partial<Omit<NotificationPreferences, 'user_id'>>) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error } = await supabase
            .from('notification_preferences')
            .upsert(
                { user_id: user.id, ...DEFAULT_NOTIFICATION_PREFERENCES, ...patch },
                { onConflict: 'user_id' },
            );

        if (error) throw error;
        return true;
    },

    /**
     * Create a notification for specific users.
     *
     * Inserting into `user_notifications` directly is blocked by RLS — this RPC
     * is the only supported writer. It decides server-side whether the caller may
     * notify each recipient, so a student cannot write into another student's
     * inbox. Returns how many notifications were actually created.
     */
    async notifyUsers(userIds: string[], title: string, message: string, options: NotifyOptions = {}) {
        const recipients = Array.from(new Set(userIds.filter(Boolean)));
        if (recipients.length === 0) return 0;

        const { data, error } = await supabase.rpc('notify_users', {
            p_user_ids: recipients,
            p_title: title,
            p_message: message,
            p_type: options.severity ?? 'info',
            p_notification_type: options.notificationType ?? 'general',
            p_related_type: options.relatedType ?? null,
            p_related_id: options.relatedId ?? null,
        });

        if (error) throw error;
        return (data ?? 0) as number;
    },

    /** Notify everyone holding a role — how an event reaches "all coordinators". */
    async notifyRoles(
        roles: Array<'admin' | 'coordinator' | 'adviser' | 'student' | 'company'>,
        title: string,
        message: string,
        options: NotifyOptions & { departmentId?: string | null } = {},
    ) {
        const { data, error } = await supabase.rpc('notify_roles', {
            p_roles: roles,
            p_title: title,
            p_message: message,
            p_type: options.severity ?? 'info',
            p_notification_type: options.notificationType ?? 'general',
            p_related_type: options.relatedType ?? null,
            p_related_id: options.relatedId ?? null,
            p_department_id: options.departmentId ?? null,
        });

        if (error) throw error;
        return (data ?? 0) as number;
    },

    async getAnnouncementReactions(announcementId: string) {
        const { data, error } = await supabase
            .from('announcement_reactions')
            .select(`
                *,
                profiles:user_id (
                    first_name,
                    last_name,
                    avatar_url
                )
            `)
            .eq('announcement_id', announcementId);

        if (error) throw error;
        return data as AnnouncementReaction[];
    },

    async toggleReaction(announcementId: string, reactionType: 'like' | 'celebrate' | 'heart' | 'acknowledge') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Check if reaction already exists
        const { data: existing } = await supabase
            .from('announcement_reactions')
            .select('id')
            .eq('announcement_id', announcementId)
            .eq('user_id', user.id)
            .eq('reaction_type', reactionType)
            .maybeSingle();

        if (existing) {
            // Remove reaction
            const { error } = await supabase
                .from('announcement_reactions')
                .delete()
                .eq('id', existing.id);
            if (error) throw error;
            return { action: 'removed' };
        } else {
            // Add reaction
            const { error } = await supabase
                .from('announcement_reactions')
                .insert([{
                    announcement_id: announcementId,
                    user_id: user.id,
                    reaction_type: reactionType
                }]);
            if (error) throw error;
            return { action: 'added' };
        }
    },

    /**
     * Notify a single user.
     *
     * Kept for the existing call sites; it now goes through {@link notifyUsers}
     * rather than inserting directly, which is what makes it work at all — the
     * direct insert it used to do was rejected by RLS every time.
     */
    async createNotification(
        userId: string,
        title: string,
        message: string,
        type: NotificationSeverity = 'info',
        options: Omit<NotifyOptions, 'severity'> = {},
    ) {
        await this.notifyUsers([userId], title, message, { ...options, severity: type });
        return true;
    },

    /**
     * Escalate a blocked clock-in to the people who can act on it: every admin,
     * and the coordinators of the student's own department.
     */
    async notifyAntiCheatFlag(
        studentProfile: { first_name?: string | null; last_name?: string | null; department_id?: string | null },
        reason: string,
    ) {
        const studentName = [studentProfile.first_name, studentProfile.last_name].filter(Boolean).join(' ') || 'A student';
        const message = `Security Alert: ${studentName} was blocked from clocking in due to: ${reason}. Please review their recent activity.`;

        try {
            await this.notifyRoles(['admin'], '🚨 Anti-Cheat Alert', message, {
                severity: 'danger',
                notificationType: 'system',
            });

            await this.notifyRoles(['coordinator'], '🚨 Anti-Cheat Alert', message, {
                severity: 'danger',
                notificationType: 'system',
                departmentId: studentProfile.department_id ?? null,
            });
        } catch (err) {
            // A failed alert must never block the clock-in flow that raised it.
            console.error('Failed to notify admins/coordinators of anti-cheat flag:', err);
        }
    }
};
