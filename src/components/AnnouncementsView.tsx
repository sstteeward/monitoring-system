import React, { useState, useEffect } from 'react';
import { notificationService, type Announcement, type UserNotification } from '../services/notificationService';
import { supabase } from '../lib/supabaseClient';
import './AnnouncementsView.css';

interface AnnouncementsViewProps {
    viewType?: 'documents' | 'school';
    isCoordinator?: boolean;
}

const AnnouncementsView: React.FC<AnnouncementsViewProps> = ({ viewType = 'school', isCoordinator = false }) => {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [notifications, setNotifications] = useState<UserNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

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

    const toggleExpand = (id: string) => setExpandedId(prev => (prev === id ? null : id));

    if (loading && announcements.length === 0) return <div className="loading-state">Loading announcements...</div>;

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
                    <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                        {showForm ? 'Cancel' : 'Post New Announcement'}
                    </button>
                )}
            </header>

            {/* Create form */}
            {isCoordinator && showForm && (
                <div style={{ backgroundColor: 'var(--layer-2)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '2rem' }}>
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

            <div className="announcements-list">
                {viewType === 'school' ? (
                    announcements.length > 0 ? (
                        announcements.map(item => {
                            const isOpen = expandedId === item.id;
                            return (
                                <div
                                    key={item.id}
                                    className={`announcement-card clickable${isOpen ? ' expanded' : ''}`}
                                    onClick={() => toggleExpand(item.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={e => e.key === 'Enter' && toggleExpand(item.id)}
                                    aria-expanded={isOpen}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="announcement-header">
                                        <h3 className="announcement-card-title">{item.title}</h3>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                                            <span className="announcement-date">
                                                {new Date(item.created_at).toLocaleDateString()}
                                            </span>
                                            <svg
                                                width="16" height="16" viewBox="0 0 24 24" fill="none"
                                                stroke="currentColor" strokeWidth="2.5"
                                                strokeLinecap="round" strokeLinejoin="round"
                                                style={{
                                                    color: 'var(--text-muted)',
                                                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                                    transition: 'transform 0.22s ease',
                                                    flexShrink: 0,
                                                }}
                                            >
                                                <polyline points="6 9 12 15 18 9" />
                                            </svg>
                                        </div>
                                    </div>

                                    <div className="announcement-author">From: {item.author}</div>

                                    {/* Collapsed — short preview */}
                                    {!isOpen && (
                                        <div className="announcement-preview" style={{ color: 'var(--text-muted)', fontSize: '0.87rem', marginTop: '0.5rem', lineHeight: 1.5 }}>
                                            {item.content.length > 120 ? item.content.slice(0, 120) + '…' : item.content}
                                        </div>
                                    )}

                                    {/* Expanded — full content */}
                                    {isOpen && (
                                        <div className="announcement-content" style={{ marginTop: '0.75rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                            {item.content}
                                        </div>
                                    )}
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
        </div>
    );
};

export default AnnouncementsView;
