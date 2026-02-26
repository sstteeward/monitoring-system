import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { messageService, type Message } from '../services/messageService';
import { profileService, type Profile } from '../services/profileService';
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
            await messageService.sendMessage(activeThreadUser.auth_user_id, content);
            // Assuming Realtime picks it up and appends it to 'messages'
        } catch (e: any) {
            console.error('Failed to send message:', e.message, e.details, e.hint, e);
            alert(`Failed to send message: ${e.message || 'Unknown error'}`);
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
                                    <div className="chat-list-avatar" style={{ width: 32, height: 32, fontSize: '0.75rem' }}>
                                        {activeThreadUser.avatar_url ? <img src={activeThreadUser.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : getInitials(activeThreadUser)}
                                        <div className={`online-indicator ${activeThreadUser.isOnline ? '' : 'offline'}`} style={{ width: 8, height: 8 }} />
                                    </div>
                                    <div>
                                        {getName(activeThreadUser)}
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
                                    return (
                                        <div key={msg.id} className={`chat-message ${isMine ? 'sent' : 'received'}`}>
                                            {msg.content}
                                            <span className="chat-time">
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            <form className="chat-input-area" onSubmit={handleSend}>
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
                                }).map(u => (
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
                                    </div>
                                )) : (
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
        </div>
    );
};

export default ChatWidget;
