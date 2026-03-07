import { supabase } from '../lib/supabaseClient';

export interface Message {
    id: string;
    sender_id: string;
    receiver_id: string;
    content: string;
    created_at: string;
    read_at: string | null;
    edited_at?: string | null;
}

export const messageService = {
    /**
     * Fetch conversation between the current user and another specific user
     */
    async getConversation(otherUserId: string): Promise<Message[]> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
            .order('created_at', { ascending: true });

        if (error) {
            console.error("Error fetching conversation:", error);
            throw error;
        }

        return data as Message[];
    },

    /**
     * Send a new message
     */
    async sendMessage(receiver_id: string, content: string): Promise<Message> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data, error } = await supabase
            .from('messages')
            .insert([{ sender_id: user.id, receiver_id, content }])
            .select()
            .single();

        if (error) {
            console.error("Error sending message:", error);
            throw error;
        }

        return data as Message;
    },

    /**
     * Mark all unread messages from a specific user as read
     */
    async markAsRead(senderId: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('sender_id', senderId)
            .eq('receiver_id', user.id)
            .is('read_at', null);

        if (error) {
            console.error("Error marking messages as read:", error);
        }
    },

    /**
     * Mark all read messages from a specific user as unread (sets read_at to null)
     */
    async markAsUnread(senderId: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('messages')
            .update({ read_at: null })
            .eq('sender_id', senderId)
            .eq('receiver_id', user.id)
            .not('read_at', 'is', null);

        if (error) {
            console.error("Error marking messages as unread:", error);
        }
    },

    /**
     * Mark a single specific message as read
     */
    async markSingleMessageAsRead(messageId: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('id', messageId)
            .eq('receiver_id', user.id)
            .is('read_at', null);

        if (error) {
            console.error("Error marking specific message as read:", error);
        }
    },

    /**
     * Mark a single specific message as unread
     */
    async markSingleMessageAsUnread(messageId: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('messages')
            .update({ read_at: null })
            .eq('id', messageId)
            .eq('receiver_id', user.id)
            .not('read_at', 'is', null);

        if (error) {
            console.error("Error marking specific message as unread:", error);
        }
    },

    /**
     * Edit a sent message
     */
    async updateMessage(messageId: string, newContent: string): Promise<Message> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data, error } = await supabase
            .from('messages')
            .update({ content: newContent, edited_at: new Date().toISOString() })
            .eq('id', messageId)
            .eq('sender_id', user.id)
            .select()
            .single();

        if (error) {
            console.error("Error updating message:", error);
            throw error;
        }

        return data as Message;
    },

    /**
     * Delete a sent message
     */
    async deleteMessage(messageId: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { error } = await supabase
            .from('messages')
            .delete()
            .eq('id', messageId)
            .eq('sender_id', user.id);

        if (error) {
            console.error("Error deleting message:", error);
            throw error;
        }
    },

    /**
     * Delete an entire conversation between the current user and another user
     */
    async deleteConversation(otherUserId: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // We delete all messages where this user is either sender or receiver, AND the other user is the opposite
        const { error } = await supabase
            .from('messages')
            .delete()
            .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`);

        if (error) {
            console.error("Error deleting conversation:", error);
            throw error;
        }
    },

    /**
     * Subscribe to new messages addressed to the current user or sent by the current user
     */
    subscribeToMessages(currentUserId: string, onNewMessage: (msg: Message) => void) {
        return supabase
            .channel('messages_channel')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `receiver_id=eq.${currentUserId}`
                },
                (payload) => onNewMessage(payload.new as Message)
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `sender_id=eq.${currentUserId}`
                },
                (payload) => onNewMessage(payload.new as Message)
            )
            .subscribe();
    },

    /**
     * Presence logic: track online users
     */
    trackPresence(currentUserId: string, onSync: (onlineUserIds: Set<string>) => void) {
        const presenceChannel = supabase.channel('online_users', {
            config: {
                presence: {
                    key: currentUserId,
                },
            },
        });

        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = presenceChannel.presenceState();
                const onlineIds = new Set<string>();
                for (const key in state) {
                    onlineIds.add(key);
                }
                onSync(onlineIds);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await presenceChannel.track({
                        user_id: currentUserId,
                        online_at: new Date().toISOString(),
                    });
                }
            });

        return presenceChannel;
    }
};
