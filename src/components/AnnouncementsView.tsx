import React, { useState, useEffect } from 'react';
import { notificationService, type Announcement, type UserNotification, type AnnouncementReaction } from '../services/notificationService';
import { supabase } from '../lib/supabaseClient';
import { ListSkeleton } from './Skeletons';
import './AnnouncementsView.css';

interface AnnouncementsViewProps {
    viewType?: 'documents' | 'school';
    isCoordinator?: boolean;
}

const AnnouncementsView: React.FC<AnnouncementsViewProps> = ({ viewType = 'school', isCoordinator = false }) => {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [notifications, setNotifications] = useState<UserNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

    // Reactions state
    const [reactions, setReactions] = useState<AnnouncementReaction[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [showReactionsModal, setShowReactionsModal] = useState(false);
    const [activeReactionTab, setActiveReactionTab] = useState<'all' | 'like' | 'celebrate' | 'heart' | 'acknowledge'>('all');

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user) setCurrentUserId(data.user.id);
        });
    }, []);

    useEffect(() => {
        if (selectedAnnouncement) {
            notificationService.getAnnouncementReactions(selectedAnnouncement.id)
                .then(data => setReactions(data))
                .catch(console.error);
        } else {
            setReactions([]);
        }
    }, [selectedAnnouncement]);

    const handleToggleReaction = async (type: 'like' | 'celebrate' | 'heart' | 'acknowledge') => {
        if (!selectedAnnouncement || !currentUserId) return;
        
        const isReacted = reactions.some(r => r.user_id === currentUserId && r.reaction_type === type);
        let updatedReactions = [...reactions];
        
        if (isReacted) {
             updatedReactions = updatedReactions.filter(r => !(r.user_id === currentUserId && r.reaction_type === type));
        } else {
             updatedReactions.push({
                 id: Math.random().toString(),
                 announcement_id: selectedAnnouncement.id,
                 user_id: currentUserId,
                 reaction_type: type,
                 created_at: new Date().toISOString()
             });
        }
        setReactions(updatedReactions);

        try {
            await notificationService.toggleReaction(selectedAnnouncement.id, type);
            const fresh = await notificationService.getAnnouncementReactions(selectedAnnouncement.id);
            setReactions(fresh);
        } catch (error) {
            console.error(error);
            const fresh = await notificationService.getAnnouncementReactions(selectedAnnouncement.id);
            setReactions(fresh);
        }
    };

    // New Announcement Form State
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showForm, setShowForm] = useState(false);

    useEffect(() => { loadData(); }, [viewType]);

    const loadData = async () => {
        setLoading(true);
        try {
            if (viewType === 'school') {
                const data = await notificationService.getAnnouncements();
                setAnnouncements(data || []);
            } else {
                const data = await notificationService.getUserNotifications();
                setNotifications(data || []);
            }
        } catch (err) {
            console.error('Error loading data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim() || !newContent.trim()) return;
        setIsSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            let authorName = 'Coordinator';
            if (user) {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('first_name, last_name')
                    .eq('auth_user_id', user.id)
                    .single();
                if (profileData?.first_name) {
                    authorName = [profileData.first_name, profileData.last_name].filter(Boolean).join(' ');
                }
            }
            const { error } = await supabase
                .from('announcements')
                .insert([{ title: newTitle, content: newContent, author: authorName }]);
            if (error) throw error;
            setNewTitle(''); setNewContent(''); setShowForm(false);
            loadData();
        } catch (err) {
            console.error('Error creating announcement:', err);
            alert('Failed to post announcement. Make sure the Supabase RLS policy for coordinators to INSERT announcements has been applied.');
        } finally {
            setIsSubmitting(false);
        }
    };



    // Removal of old simple loading state return

    return (
        <div className="announcements-container fade-in">
            <header className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 className="view-title">
                        {viewType === 'school' ? 'School Announcements' : 'Document Status'}
                    </h2>
                    <p className="view-subtitle">
                        {viewType === 'school'
                            ? 'Stay updated with the latest news from the administration.'
                            : 'Notifications regarding your OJT documents and requirements.'}
                    </p>
                </div>
                {isCoordinator && viewType === 'school' && (
                    <button className="btn btn-primary" onClick={() => { setSelectedAnnouncement(null); setShowForm(!showForm); }}>
                        {showForm ? 'Cancel' : 'Post New Announcement'}
                    </button>
                )}
            </header>

            {/* Selected Announcement Detail View */}
            {selectedAnnouncement ? (
                <div className="announcement-detail fade-in" style={{ backgroundColor: 'var(--bg-card)', padding: '2rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <button
                        onClick={() => setSelectedAnnouncement(null)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: '1.5rem', fontSize: '0.9rem', padding: 0 }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        Back to Announcements
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-bright)' }}>{selectedAnnouncement.title}</h2>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                            {new Date(selectedAnnouncement.created_at).toLocaleDateString()}
                        </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2rem' }}>
                        FROM: {selectedAnnouncement.author.toUpperCase()}
                    </div>

                    <div style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {selectedAnnouncement.content}
                    </div>

                    <div className="reactions-container">
                        <div className="reactions-bar">
                            {([ {type: 'like', emoji: '👍'}, {type: 'celebrate', emoji: '🙌'}, {type: 'heart', emoji: '❤️'} ] as const).map(({type, emoji}) => {
                                const count = reactions.filter(r => r.reaction_type === type).length;
                                const isReacted = reactions.some(r => r.reaction_type === type && r.user_id === currentUserId);
                                return (
                                    <button
                                        key={type}
                                        className={`reaction-btn ${isReacted ? 'active' : ''}`}
                                        onClick={() => handleToggleReaction(type)}
                                    >
                                        <span className="emoji">{emoji}</span>
                                        {count > 0 && <span className="count">{count}</span>}
                                    </button>
                                );
                            })}
                            
                            <button
                                className={`reaction-btn ack-btn ${reactions.some(r => r.reaction_type === 'acknowledge' && r.user_id === currentUserId) ? 'active' : ''}`}
                                onClick={() => handleToggleReaction('acknowledge')}
                            >
                                <span className="emoji">✅</span>
                                <span className="ack-text">Acknowledge</span>
                                {reactions.filter(r => r.reaction_type === 'acknowledge').length > 0 && (
                                     <span className="count ack-count">{reactions.filter(r => r.reaction_type === 'acknowledge').length}</span>
                                )}
                            </button>
                        </div>
                        
                        {reactions.length > 0 && (
                            <div className="reactions-summary" data-tooltip={(() => {
                                const names = reactions.map(r => `${r.profiles?.first_name || 'Someone'} ${r.profiles?.last_name || ''}`.trim());
                                if (names.length === 0) return '';
                                if (names.length <= 5) return names.join('\n');
                                return `${names.slice(0, 5).join('\n')}\nand ${names.length - 5} more...`;
                            })()} onClick={() => {
                                setActiveReactionTab('all');
                                setShowReactionsModal(true);
                            }}>
                                <span className="summary-text">{reactions.length} reaction{reactions.length > 1 ? 's' : ''}</span>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <>
                    {/* Create form */}
                    {isCoordinator && showForm && (
                        <div style={{ backgroundColor: 'var(--bg-elevated)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '2rem' }}>
                            <h3 style={{ marginBottom: '1rem', color: 'var(--text-bright)' }}>Create Announcement</h3>
                            <form onSubmit={handleCreateAnnouncement}>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Title</label>
                                    <input type="text" className="form-input" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="E.g., Midterm Requirements Deadline" required />
                                </div>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Message</label>
                                    <textarea className="form-input" value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Enter the details of the announcement..." rows={4} required />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                        {isSubmitting ? 'Posting...' : 'Post Announcement'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Announcements list */}
                    {loading ? (
                        <div className="announcements-list">
                            <ListSkeleton items={3} />
                        </div>
                    ) : (
                        <div className="announcements-list">
                            {viewType === 'school' ? (
                                announcements.length > 0 ? (
                                    announcements.map(item => {
                                        return (
                                            <div
                                                key={item.id}
                                                className="announcement-card clickable"
                                                onClick={() => setSelectedAnnouncement(item)}
                                                style={{
                                                    background: 'var(--bg-card)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '12px',
                                                    padding: '1.5rem',
                                                    marginBottom: '1rem',
                                                    cursor: 'pointer',
                                                    transition: 'transform 0.2s, box-shadow 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                                                    e.currentTarget.style.borderColor = 'var(--border-hover)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = 'none';
                                                    e.currentTarget.style.borderColor = 'var(--border)';
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-bright)' }}>{item.title}</h3>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                                                        {new Date(item.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="empty-state">No school announcements at this time.</div>
                                )
                            ) : (
                                notifications.length > 0 ? (
                                    notifications.map(item => (
                                        <div key={item.id} className={`notification-card ${item.type} ${item.is_read ? 'read' : ''}`}>
                                            <div className="notification-icon">
                                                {item.type === 'danger' && '⚠️'}
                                                {item.type === 'warning' && '🔔'}
                                                {item.type === 'success' && '✅'}
                                                {item.type === 'info' && 'ℹ️'}
                                            </div>
                                            <div className="notification-content">
                                                <h3 className="notification-card-title">{item.title}</h3>
                                                <p className="notification-message">{item.message}</p>
                                                <span className="notification-date">
                                                    {new Date(item.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                            {!item.is_read && <div className="unread-dot" />}
                                        </div>
                                    ))
                                ) : (
                                    <div className="empty-state">All your documents are in order! No pending notifications.</div>
                                )
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Reactions Modal */}
            {showReactionsModal && (
                <div className="modal-overlay" onClick={() => setShowReactionsModal(false)}>
                    <div className="reactions-modal fade-in" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-bright)' }}>Reactions</h3>
                            <button className="close-btn" onClick={() => setShowReactionsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        
                        <div className="reactions-tabs">
                            <button className={`tab-btn ${activeReactionTab === 'all' ? 'active' : ''}`} onClick={() => setActiveReactionTab('all')}>
                                All ({reactions.length})
                            </button>
                            {([ {type: 'like', emoji: '👍'}, {type: 'celebrate', emoji: '🙌'}, {type: 'heart', emoji: '❤️'}, {type: 'acknowledge', emoji: '✅'} ] as const).map(({type, emoji}) => {
                                const count = reactions.filter(r => r.reaction_type === type).length;
                                if (count === 0) return null;
                                return (
                                    <button 
                                        key={type}
                                        className={`tab-btn ${activeReactionTab === type ? 'active' : ''}`} 
                                        onClick={() => setActiveReactionTab(type)}
                                    >
                                        {emoji} {count}
                                    </button>
                                );
                            })}
                        </div>
                        
                        <div className="reactions-list">
                            {reactions
                                .filter(r => activeReactionTab === 'all' || r.reaction_type === activeReactionTab)
                                .map(r => (
                                <div key={r.id} className="reaction-user-item">
                                    <div className="user-info">
                                        <div className="user-avatar" style={{ 
                                            backgroundImage: `url(${r.profiles?.avatar_url || 'https://ui-avatars.com/api/?background=random&name=' + encodeURIComponent(r.profiles?.first_name || 'User')})`,
                                            backgroundSize: 'cover'
                                        }}></div>
                                        <span className="user-name">{r.profiles?.first_name || 'Anonymous'} {r.profiles?.last_name || ''}</span>
                                    </div>
                                    <div className="user-reaction-emoji">
                                        {r.reaction_type === 'like' && '👍'}
                                        {r.reaction_type === 'celebrate' && '🙌'}
                                        {r.reaction_type === 'heart' && '❤️'}
                                        {r.reaction_type === 'acknowledge' && '✅'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnnouncementsView;
