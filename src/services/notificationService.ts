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
    }
};
