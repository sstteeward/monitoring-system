import { supabase } from '../lib/supabaseClient';

export interface Announcement {
    id: string;
    title: string;
    content: string;
    author: string | null;
    created_at: string;
    company_id?: string | null;
    created_by?: string | null;
    created_by_role?: 'company' | 'coordinator' | 'admin' | 'student' | null;
    category?: 'company' | 'coordinator' | null;
    status?: string;
    attachment_url?: string | null;
    attachment_name?: string | null;
    company_name?: string | null;
    creator_name?: string | null;
    company?: { name: string } | null;
}

export interface UserNotification {
    id: string;
    user_id: string;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'success' | 'danger';
    is_read: boolean;
    created_at: string;
    source_type?: 'announcement' | null;
    source_id?: string | null;
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
     * Open a single announcement. Access is verified server-side via the
     * get_student_announcement RPC — a student can only ever read an
     * announcement for the company they are (or were) assigned to, or a
     * school-wide coordinator announcement.
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

    subscribeToUserNotifications(userId: string, onInsert: (notification: UserNotification) => void) {
        const channel = supabase
            .channel(`user-notifications-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'user_notifications',
                    filter: `user_id=eq.${userId}`,
                },
                (payload) => onInsert(payload.new as UserNotification),
            )
            .subscribe();

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

    async createNotification(userId: string, title: string, message: string, type: 'info' | 'warning' | 'success' | 'danger' = 'info') {
        const { error } = await supabase
            .from('user_notifications')
            .insert([{
                user_id: userId,
                title,
                message,
                type,
                is_read: false
            }]);

        if (error) {
            console.error("Error creating notification:", error);
            throw error;
        }
        return true;
    },

    async notifyAntiCheatFlag(studentProfile: any, reason: string) {
        try {
            const { data: admins } = await supabase.from('profiles').select('id, auth_user_id, account_type, department_id').eq('account_type', 'admin');
            const { data: coordinators } = await supabase.from('profiles').select('id, auth_user_id, account_type, department_id').eq('account_type', 'coordinator').eq('department_id', studentProfile.department_id || '');

            const targets = [...(admins || []), ...(coordinators || [])];
            
            // Deduplicate by auth_user_id
            const uniqueTargets = Array.from(new Map(targets.map(item => [item.auth_user_id, item])).values());

            const message = `Security Alert: ${studentProfile.first_name} ${studentProfile.last_name} was blocked from clocking in due to: ${reason}. Please review their recent activity.`;

            // 2. Dispatch notifications
            const inserts = uniqueTargets.map(target => ({
                user_id: target.auth_user_id,
                title: '🚨 Anti-Cheat Alert',
                message,
                type: 'danger',
                is_read: false
            }));

            if (inserts.length > 0) {
                await supabase.from('user_notifications').insert(inserts);
            }
        } catch (err) {
            console.error("Failed to notify admins/coordinators of anti-cheat flag:", err);
        }
    }
};
