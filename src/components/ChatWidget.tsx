import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { messageService, type Message } from '../services/messageService';
import { type Profile } from '../services/profileService';
import UserProfileModal from './UserProfileModal';
import './ChatWidget.css';

interface ChatWidgetProps {
    currentUser: any;
    currentProfile: Profile;
}

type UserWithStatus = Profile & { isOnline: boolean; unreadCount: number };

const ChatWidget: React.FC<ChatWidgetProps> = ({ currentUser }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeThreadUser, setActiveThreadUser] = useState<UserWithStatus | null>(null);
    const [users, setUsers] = useState<UserWithStatus[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

    // To keep track of messages globally to calculate unread counts for the badge
    const [allMessages, setAllMessages] = useState<Message[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [listFilter, setListFilter] = useState<'all' | 'unread' | 'users'>('all');

    // Message Options State
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
    const [conversationMenuId, setConversationMenuId] = useState<string | null>(null);
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);

    // Click outside to close menu
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (openMenuId && !(e.target as Element).closest('.chat-message-menu-container')) {
                setOpenMenuId(null);
            }
            if (conversationMenuId && !(e.target as Element).closest('.chat-conversation-menu-container')) {
                setConversationMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openMenuId, conversationMenuId]);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        loadUsers();
    }, [isOpen]);

    useEffect(() => {
        if (!currentUser) return;

        // Subscribe to incoming messages
        const messageSub = messageService.subscribeToMessages(currentUser.id, (msg) => {
            setAllMessages((prev) => [...prev, msg]);
            if (activeThreadUser && (msg.sender_id === activeThreadUser.auth_user_id || msg.receiver_id === activeThreadUser.auth_user_id)) {
                setMessages((prev) => [...prev, msg]);
            }
        });

        // Subscribe to presence
        const presenceChannel = messageService.trackPresence(currentUser.id, (onlineIds) => {
            setOnlineUserIds(onlineIds);
        });

        // Initialize all messages to calculate global unread logic
        loadAllMyMessages();

        return () => {
            if (messageSub) messageSub.unsubscribe();
            presenceChannel.unsubscribe();
        };
    }, [currentUser, activeThreadUser]);

    useEffect(() => {
        // Scroll to bottom when messages change
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const loadAllMyMessages = async () => {
        try {
            // Fetch all messages where current user is sender or receiver to build initial unread state
            const { data } = await supabase
                .from('messages')
                .select('*')
                .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
                .order('created_at', { ascending: true });
            if (data) setAllMessages(data as Message[]);
        } catch (e) {
            console.error("Failed to load initial messages", e);
        }
    };

    const loadUsers = async () => {
        try {
            let fetchedUsers: Profile[] = [];

            // Fetch all users except the current user
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .neq('auth_user_id', currentUser.id); // exclude themselves

            if (data) fetchedUsers = data as Profile[];

            const usersWithStatus: UserWithStatus[] = fetchedUsers.map(u => ({
                ...u,
                isOnline: onlineUserIds.has(u.auth_user_id ?? ''),
                unreadCount: allMessages.filter(m => m.sender_id === u.auth_user_id && m.read_at === null).length
            }));

            // Optional: Sort so unread is at the top, then online, then alphabetically
            usersWithStatus.sort((a, b) => {
                if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
                if (a.isOnline === b.isOnline) {
                    return (a.first_name || '').localeCompare(b.first_name || '');
                }
                return a.isOnline ? -1 : 1;
            });

            setUsers(usersWithStatus);
        } catch (err) {
            console.error('Error loading users for chat:', err);
        }
    };

    // Update isOnline and unreadCount when onlineUserIds or allMessages change
    useEffect(() => {
        if (!isOpen) return;
        setUsers(prev => prev.map(u => ({
            ...u,
            isOnline: onlineUserIds.has(u.auth_user_id ?? ''),
            unreadCount: allMessages.filter(m => m.sender_id === u.auth_user_id && m.read_at === null && m.receiver_id === currentUser.id).length
        })));
    }, [onlineUserIds, allMessages, isOpen]);

    const openThread = async (user: UserWithStatus) => {
        if (!user.auth_user_id) return;
        setActiveThreadUser(user);

        try {
            const history = await messageService.getConversation(user.auth_user_id);
            setMessages(history);

            // Mark as read
            await messageService.markAsRead(user.auth_user_id);
            // Update local state to clear unread
            setAllMessages(prev => prev.map(m => m.sender_id === user.auth_user_id && !m.read_at ? { ...m, read_at: new Date().toISOString() } : m));

        } catch (e) {
            console.error('Failed to load thread:', e);
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !activeThreadUser?.auth_user_id) return;

        const content = newMessage.trim();
        setNewMessage('');

        try {
            if (editingMessageId) {
                // Handle Update
                await messageService.updateMessage(editingMessageId, content);

                // Optimistically update local state (if Realtime INSERT/UPDATE is not catching updates)
                setMessages(prev => prev.map(m => m.id === editingMessageId ? { ...m, content, edited_at: new Date().toISOString() } : m));
                setAllMessages(prev => prev.map(m => m.id === editingMessageId ? { ...m, content, edited_at: new Date().toISOString() } : m));

                setEditingMessageId(null);
            } else {
                // Handle new send
                await messageService.sendMessage(activeThreadUser.auth_user_id, content);
                // Assumption: Realtime picks it up and appends it to 'messages'
            }
        } catch (e: any) {
            console.error('Failed to send/update message:', e.message, e.details, e.hint, e);
            alert(`Failed to send message: ${e.message || 'Unknown error'}`);
        }
    };

    const handleDeleteMessage = async (msgId: string) => {
        if (!confirm("Are you sure you want to delete this message?")) return;
        setOpenMenuId(null);
        try {
            await messageService.deleteMessage(msgId);
            // Optimistically remove from state
            setMessages(prev => prev.filter(m => m.id !== msgId));
            setAllMessages(prev => prev.filter(m => m.id !== msgId));
        } catch (e: any) {
            alert(`Failed to delete message: ${e.message || 'Unknown error'}`);
        }
    };

    const handleEditInitiate = (msg: Message) => {
        setOpenMenuId(null);
        setEditingMessageId(msg.id);
        setNewMessage(msg.content);
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const handleMarkAsRead = async (msg: Message) => {
        setOpenMenuId(null);
        try {
            await messageService.markSingleMessageAsRead(msg.id);
            // Optimistically update
            const now = new Date().toISOString();
            setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read_at: now } : m));
            setAllMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read_at: now } : m));
        } catch (e: any) {
            console.error('Failed to mark as read', e);
        }
    };

    const handleMarkAsUnread = async (msg: Message) => {
        setOpenMenuId(null);
        try {
            await messageService.markSingleMessageAsUnread(msg.id);
            // Optimistically update
            setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read_at: null } : m));
            setAllMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read_at: null } : m));
        } catch (e: any) {
            console.error('Failed to mark as unread', e);
        }
    };

    const handleForwardInitiate = (msg: Message) => {
        setOpenMenuId(null);
        setForwardMessage(msg);
    };

    const handleForwardExecute = async (targetUser: UserWithStatus) => {
        if (!forwardMessage || !targetUser.auth_user_id) return;
        try {
            await messageService.sendMessage(targetUser.auth_user_id, forwardMessage.content);
            alert(`Message forwarded to ${getName(targetUser)}`);
            setForwardMessage(null);
        } catch (e: any) {
            alert(`Failed to forward message: ${e.message || 'Unknown error'}`);
        }
    };

    const handleDeleteConversation = async (otherUser: UserWithStatus, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!otherUser.auth_user_id) return;
        if (!confirm(`Are you sure you want to delete the entire conversation with ${getName(otherUser)}?`)) return;
        setConversationMenuId(null);
        try {
            await messageService.deleteConversation(otherUser.auth_user_id);
            // Optimistically update: remove all messages involving this user
            setAllMessages(prev => prev.filter(m => !(
                (m.sender_id === otherUser.auth_user_id && m.receiver_id === currentUser.id) ||
                (m.receiver_id === otherUser.auth_user_id && m.sender_id === currentUser.id)
            )));
        } catch (err: any) {
            alert(`Failed to delete conversation: ${err.message || 'Unknown error'}`);
        }
    };

    const handleMarkConversationRead = async (otherUser: UserWithStatus, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!otherUser.auth_user_id) return;
        setConversationMenuId(null);
        try {
            await messageService.markAsRead(otherUser.auth_user_id);
            const now = new Date().toISOString();
            setAllMessages(prev => prev.map(m => m.sender_id === otherUser.auth_user_id && !m.read_at ? { ...m, read_at: now } : m));
        } catch (err) {
            console.error('Failed to mark conversation read', err);
        }
    };

    const handleMarkConversationUnread = async (otherUser: UserWithStatus, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!otherUser.auth_user_id) return;
        setConversationMenuId(null);
        try {
            await messageService.markAsUnread(otherUser.auth_user_id);
            setAllMessages(prev => prev.map(m => m.sender_id === otherUser.auth_user_id && m.read_at ? { ...m, read_at: null } : m));
        } catch (err) {
            console.error('Failed to mark conversation unread', err);
        }
    };

    const getInitials = (p: Profile) => `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}`.toUpperCase() || '?';
    const getName = (p: Profile) => `${p.first_name} ${p.last_name}`.trim() || p.email?.split('@')[0] || 'User';

    const globalUnreadCount = allMessages.filter(m =>
        m.receiver_id === currentUser.id &&
        m.read_at === null &&
        users.some(u => u.auth_user_id === m.sender_id)
    ).length;

    return (
        <div className="chat-widget-container">
            {isOpen && (
                <div className="chat-window">
                    {activeThreadUser ? (
                        // ─── THREAD VIEW ───
                        <div className="chat-thread">
                            <div className="chat-header">
                                <div className="chat-header-title">
                                    <button className="chat-back-btn" onClick={() => setActiveThreadUser(null)}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                                    </button>
                                    <div
                                        className="chat-list-avatar"
                                        style={{ width: 32, height: 32, fontSize: '0.75rem', cursor: 'pointer' }}
                                        title="View profile"
                                        onClick={() => setViewProfileId(activeThreadUser.id)}
                                    >
                                        {activeThreadUser.avatar_url ? <img src={activeThreadUser.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : getInitials(activeThreadUser)}
                                        <div className={`online-indicator ${activeThreadUser.isOnline ? '' : 'offline'}`} style={{ width: 8, height: 8 }} />
                                    </div>
                                    <div>
                                        <span
                                            style={{ cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
                                            title="View profile"
                                            onClick={() => setViewProfileId(activeThreadUser.id)}
                                        >
                                            {getName(activeThreadUser)}
                                        </span>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                                            {activeThreadUser.isOnline ? 'Online' : 'Offline'}
                                        </div>
                                    </div>
                                </div>
                                <button className="chat-close-btn" onClick={() => setIsOpen(false)}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                </button>
                            </div>

                            <div className="chat-messages">
                                {messages.map(msg => {
                                    const isMine = msg.sender_id === currentUser.id;
                                    const showMenu = openMenuId === msg.id;
                                    const isRead = !!msg.read_at;

                                    return (
                                        <div key={msg.id} className={`chat-message-container ${isMine ? 'sent' : 'received'}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', marginBottom: '0.5rem' }}>
                                            <div className="chat-bubble-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem', flexDirection: isMine ? 'row-reverse' : 'row' }}>
                                                <div className={`chat-message ${isMine ? 'sent' : 'received'}`} style={{ marginBottom: 0 }}>
                                                    {msg.content}
                                                    <span className="chat-time" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        {msg.edited_at && <span style={{ fontSize: '0.65rem', fontStyle: 'italic', opacity: 0.8 }}>(edited)</span>}
                                                    </span>
                                                </div>

                                                {/* Options Button (visible on hover) */}
                                                <div className="chat-message-menu-container" style={{ position: 'relative' }}>
                                                    <button
                                                        className="chat-message-options-btn"
                                                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(showMenu ? null : msg.id); }}
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                                                    </button>

                                                    {showMenu && (
                                                        <div className="chat-message-dropdown" style={{
                                                            position: 'absolute',
                                                            [isMine ? 'right' : 'left']: '100%',
                                                            top: 0,
                                                            background: 'var(--bg-card)',
                                                            border: '1px solid var(--border)',
                                                            borderRadius: '8px',
                                                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                                            padding: '4px',
                                                            zIndex: 50,
                                                            minWidth: '120px',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '2px'
                                                        }}>
                                                            {isMine && (
                                                                <button className="chat-menu-item" onClick={() => handleEditInitiate(msg)}>
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                                                    Edit
                                                                </button>
                                                            )}
                                                            {isMine && (
                                                                <button className="chat-menu-item danger" onClick={() => handleDeleteMessage(msg.id)}>
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                                    Delete
                                                                </button>
                                                            )}
                                                            <button className="chat-menu-item" onClick={() => handleForwardInitiate(msg)}>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"></polyline><path d="M4 18v-2a4 4 0 0 1 4-4h12"></path></svg>
                                                                Forward
                                                            </button>
                                                            {!isMine && !isRead && (
                                                                <button className="chat-menu-item" onClick={() => handleMarkAsRead(msg)}>
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                                    Mark Read
                                                                </button>
                                                            )}
                                                            {!isMine && isRead && (
                                                                <button className="chat-menu-item" onClick={() => handleMarkAsUnread(msg)}>
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4l3 3"></path></svg>
                                                                    Mark Unread
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {isMine && isRead && (
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px', marginRight: '8px' }}>
                                                    Read
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* FORWARD OVERLAY */}
                            {forwardMessage && (
                                <div className="chat-forward-overlay" style={{
                                    position: 'absolute', inset: 0, background: 'var(--bg-card)', zIndex: 100, display: 'flex', flexDirection: 'column'
                                }}>
                                    <div className="chat-header" style={{ borderBottom: '1px solid var(--border)' }}>
                                        <div className="chat-header-title">Forward Message</div>
                                        <button className="chat-close-btn" onClick={() => setForwardMessage(null)}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                        </button>
                                    </div>
                                    <div style={{ padding: '1rem', background: 'var(--bg-elevated)', fontSize: '0.85rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                                        "{forwardMessage.content}"
                                    </div>
                                    <div className="chat-list" style={{ flex: 1, overflowY: 'auto' }}>
                                        {users.map(u => (
                                            <div key={u.auth_user_id} className="chat-list-item" onClick={() => handleForwardExecute(u)}>
                                                <div className="chat-list-avatar">
                                                    {u.avatar_url ? <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : getInitials(u)}
                                                </div>
                                                <div className="chat-list-info">
                                                    <span className="chat-list-name">{getName(u)}</span>
                                                </div>
                                                <button style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', cursor: 'pointer' }}>
                                                    Send
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <form className="chat-input-area" onSubmit={handleSend} style={{ position: 'relative' }}>
                                {editingMessageId && (
                                    <div style={{ position: 'absolute', top: '-28px', left: 0, right: 0, background: 'var(--bg-elevated)', padding: '4px 12px', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
                                        <span>Editing message...</span>
                                        <button type="button" onClick={() => { setEditingMessageId(null); setNewMessage(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
                                    </div>
                                )}
                                <input
                                    type="text"
                                    className="chat-input"
                                    placeholder="Type a message..."
                                    value={newMessage}
                                    onChange={e => setNewMessage(e.target.value)}
                                />
                                <button type="submit" className="chat-send-btn" disabled={!newMessage.trim()}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                                        <line x1="22" y1="2" x2="11" y2="13" stroke="#10b981" />
                                        <polygon points="22 2 15 22 11 13 2 9 22 2" stroke="#10b981" />
                                    </svg>
                                </button>
                            </form>
                        </div>
                    ) : (
                        // ─── CONVERSATION LIST ───
                        <>
                            <div className="chat-header" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'stretch' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div className="chat-header-title">Messages</div>
                                    <button className="chat-close-btn" onClick={() => setIsOpen(false)}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    </button>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => setListFilter('all')}
                                        style={{
                                            padding: '0.4rem 1rem',
                                            borderRadius: '20px',
                                            border: 'none',
                                            background: listFilter === 'all' ? 'var(--primary)' : 'var(--bg-elevated)',
                                            color: listFilter === 'all' ? 'white' : 'var(--text-muted)',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            fontWeight: listFilter === 'all' ? '600' : 'normal',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        All
                                    </button>
                                    <button
                                        onClick={() => setListFilter('unread')}
                                        style={{
                                            padding: '0.4rem 1rem',
                                            borderRadius: '20px',
                                            border: 'none',
                                            background: listFilter === 'unread' ? 'var(--primary)' : 'var(--bg-elevated)',
                                            color: listFilter === 'unread' ? 'white' : 'var(--text-muted)',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            fontWeight: listFilter === 'unread' ? '600' : 'normal',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        Unread
                                    </button>
                                    <button
                                        onClick={() => setListFilter('users')}
                                        style={{
                                            padding: '0.4rem 1rem',
                                            borderRadius: '20px',
                                            border: 'none',
                                            background: listFilter === 'users' ? 'var(--primary)' : 'var(--bg-elevated)',
                                            color: listFilter === 'users' ? 'white' : 'var(--text-muted)',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            fontWeight: listFilter === 'users' ? '600' : 'normal',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        Users
                                    </button>
                                </div>
                            </div>
                            <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)' }}>
                                <input
                                    type="text"
                                    placeholder="Search users..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem 1rem',
                                        borderRadius: '20px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg-elevated)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.85rem'
                                    }}
                                />
                            </div>
                            <div className="chat-list">
                                {users.filter(u => {
                                    if (listFilter === 'unread' && u.unreadCount === 0) return false;
                                    const name = getName(u).toLowerCase();
                                    const q = searchQuery.toLowerCase();
                                    const hasHistory = allMessages.some(m => m.sender_id === u.auth_user_id || m.receiver_id === u.auth_user_id);

                                    if (q) return name.includes(q);
                                    if (listFilter === 'users') return true; // Show all valid profiles
                                    return hasHistory || u.isOnline; // Otherwise show online users or users with history by default
                                }).length > 0 ? users.filter(u => {
                                    if (listFilter === 'unread' && u.unreadCount === 0) return false;
                                    const name = getName(u).toLowerCase();
                                    const q = searchQuery.toLowerCase();
                                    const hasHistory = allMessages.some(m => m.sender_id === u.auth_user_id || m.receiver_id === u.auth_user_id);

                                    if (q) return name.includes(q);
                                    if (listFilter === 'users') return true;
                                    return hasHistory || u.isOnline;
                                }).sort((a, b) => {
                                    // 1. Unread count (descending)
                                    if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
                                    // 2. Online status (online first)
                                    if (a.isOnline && !b.isOnline) return -1;
                                    if (!a.isOnline && b.isOnline) return 1;
                                    // 3. Alphabetical fallback
                                    return getName(a).localeCompare(getName(b));
                                }).map(u => {
                                    const showConvMenu = conversationMenuId === u.auth_user_id;
                                    return (
                                        <div key={u.auth_user_id} className="chat-list-item" onClick={() => openThread(u)}>
                                            <div className="chat-list-avatar">
                                                {u.avatar_url ? <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : getInitials(u)}
                                                <div className={`online-indicator ${u.isOnline ? '' : 'offline'}`} />
                                            </div>
                                            <div className="chat-list-info">
                                                <span className="chat-list-name">{getName(u)}</span>
                                                <span className="chat-list-preview" style={{ color: u.isOnline ? '#10b981' : 'var(--text-muted)' }}>
                                                    {u.isOnline ? 'Active now' : 'Offline'}
                                                </span>
                                            </div>
                                            {u.unreadCount > 0 && <div className="chat-list-unread" />}

                                            <div className="chat-conversation-menu-container" style={{ position: 'relative', marginLeft: 'auto' }}>
                                                <button
                                                    className="chat-conversation-options-btn"
                                                    onClick={(e) => { e.stopPropagation(); setConversationMenuId(showConvMenu ? null : u.auth_user_id); }}
                                                >
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                                                </button>

                                                {showConvMenu && (
                                                    <div className="chat-message-dropdown" style={{
                                                        position: 'absolute',
                                                        right: '100%',
                                                        top: 0,
                                                        background: 'var(--bg-card)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '8px',
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                                        padding: '4px',
                                                        zIndex: 50,
                                                        minWidth: '150px',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '2px'
                                                    }}>
                                                        {u.unreadCount > 0 && (
                                                            <button className="chat-menu-item" onClick={(e) => handleMarkConversationRead(u, e)}>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                                Mark Read
                                                            </button>
                                                        )}
                                                        {u.unreadCount === 0 && (
                                                            <button className="chat-menu-item" onClick={(e) => handleMarkConversationUnread(u, e)}>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4l3 3"></path></svg>
                                                                Mark Unread
                                                            </button>
                                                        )}
                                                        <button className="chat-menu-item" onClick={(e) => { e.stopPropagation(); setConversationMenuId(null); setViewProfileId(u.id); }}>
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                                            View Profile
                                                        </button>
                                                        <button className="chat-menu-item danger" onClick={(e) => handleDeleteConversation(u, e)}>
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                            Delete Chat
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                        {searchQuery ? 'No users found.' : 'No recent messages.'}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            <button className="chat-toggle-btn" onClick={() => setIsOpen(!isOpen)} title="Messages">
                {isOpen ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                )}
                {!isOpen && globalUnreadCount > 0 && (
                    <div className="chat-unread-badge">{globalUnreadCount}</div>
                )}
            </button>

            <UserProfileModal
                profileId={viewProfileId}
                onClose={() => setViewProfileId(null)}
            />
        </div>
    );
};

export default ChatWidget;
