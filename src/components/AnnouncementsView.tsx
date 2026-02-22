import React, { useState, useEffect } from 'react';
import { notificationService, type Announcement, type UserNotification } from '../services/notificationService';
import './AnnouncementsView.css';

interface AnnouncementsViewProps {
    viewType: 'documents' | 'school';
}

const AnnouncementsView: React.FC<AnnouncementsViewProps> = ({ viewType }) => {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [notifications, setNotifications] = useState<UserNotification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                if (viewType === 'school') {
                    const data = await notificationService.getAnnouncements();
                    setAnnouncements(data);
                } else {
                    const data = await notificationService.getUserNotifications();
                    setNotifications(data);
                }
            } catch (err) {
                console.error('Error loading data:', err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [viewType]);

    if (loading) return <div className="loading-state">Loading announcements...</div>;

    return (
        <div className="announcements-container">
            <header className="view-header">
                <h2 className="view-title">
                    {viewType === 'school' ? 'School Announcements' : 'Document Status'}
                </h2>
                <p className="view-subtitle">
                    {viewType === 'school'
                        ? 'Stay updated with the latest news from the administration.'
                        : 'Notifications regarding your OJT documents and requirements.'}
                </p>
            </header>

            <div className="announcements-list">
                {viewType === 'school' ? (
                    announcements.length > 0 ? (
                        announcements.map(item => (
                            <div key={item.id} className="announcement-card">
                                <div className="announcement-header">
                                    <h3 className="announcement-card-title">{item.title}</h3>
                                    <span className="announcement-date">
                                        {new Date(item.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="announcement-author">From: {item.author}</div>
                                <div className="announcement-content">{item.content}</div>
                            </div>
                        ))
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
