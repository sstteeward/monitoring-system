import { supabase } from '../lib/supabaseClient';

export interface Message {
    id: string;
    sender_id: string;
    receiver_id: string;
    content: string;
    created_at: string;
    read_at: string | null;
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
