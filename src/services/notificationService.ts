import { supabase } from '../lib/supabaseClient';

export interface Announcement {
    id: string;
    title: string;
    content: string;
    author: string;
    created_at: string;
}

export interface UserNotification {
    id: string;
    user_id: string;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'success' | 'danger';
    is_read: boolean;
    created_at: string;
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
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as Announcement[];
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
    }
};
