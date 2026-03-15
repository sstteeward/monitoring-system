import React, { useState, useEffect } from 'react';
import { adminService, type Feedback } from '../services/adminService';
import { TableSkeleton } from './Skeletons';

interface AdminFeedbackViewProps {
    onFeedbackAction?: () => void;
}

const AdminFeedbackView: React.FC<AdminFeedbackViewProps> = ({ onFeedbackAction }) => {
    const [feedbackItems, setFeedbackItems] = useState<Feedback[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<'all' | 'new' | 'reviewed' | 'resolved'>('all');
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    useEffect(() => {
        loadFeedback();
    }, []);

    const loadFeedback = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await adminService.getFeedback();
            setFeedbackItems(data);
        } catch (err: any) {
            console.error('Failed to load feedback:', err);
            setError(err.message || 'Failed to load feedback. Check your database setup.');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (id: string, newStatus: 'new' | 'reviewed' | 'resolved') => {
        setUpdatingId(id);
        try {
            await adminService.updateFeedbackStatus(id, newStatus);
            setFeedbackItems(prevItems =>
                prevItems.map(item => item.id === id ? { ...item, status: newStatus } : item)
            );
            if (onFeedbackAction) onFeedbackAction();
        } catch (error) {
            console.error('Failed to update status:', error);
        } finally {
            setUpdatingId(null);
        }
    };

    const filteredFeedback = feedbackItems.filter(item => {
        if (filterStatus === 'all') return true;
        return item.status === filterStatus;
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'new': return { bg: 'var(--badge-student-bg)', color: 'var(--badge-student-text)', border: 'var(--border)' }; // Reuse student for danger/new
            case 'reviewed': return { bg: 'var(--badge-admin-bg)', color: 'var(--badge-admin-text)', border: 'var(--border)' }; // Reuse admin for warning/reviewed
            case 'resolved': return { bg: 'var(--badge-student-bg)', color: 'var(--badge-student-text)', border: 'var(--border)' };
            default: return { bg: 'var(--bg-elevated)', color: 'var(--text-muted)', border: 'var(--border)' };
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'bug': return { bg: 'var(--badge-student-bg)', color: 'var(--badge-student-text)' };
            case 'suggestion': return { bg: 'var(--badge-coordinator-bg)', color: 'var(--badge-coordinator-text)' };
            case 'other': return { bg: 'var(--bg-elevated)', color: 'var(--text-muted)' };
            default: return { bg: 'var(--bg-elevated)', color: 'var(--text-muted)' };
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--admin-text-primary)' }}>User Feedback</h2>
                    <p style={{ color: 'var(--admin-text-secondary)', margin: 0, fontSize: '0.95rem' }}>View bugs, suggestions, and feedback from users</p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {(['all', 'new', 'reviewed', 'resolved'] as const).map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            style={{
                                background: filterStatus === status ? 'var(--primary)' : 'var(--bg-elevated)',
                                color: filterStatus === status ? '#fff' : 'var(--text-muted)',
                                border: `1px solid ${filterStatus === status ? 'var(--primary)' : 'var(--border)'}`,
                                padding: '0.4rem 0.8rem',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                                textTransform: 'capitalize',
                                transition: 'all 0.2s'
                            }}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="admin-table-card">
                    <TableSkeleton rows={5} cols={4} />
                </div>
            ) : error ? (
                <div style={{
                    background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '12px', padding: '2rem', textAlign: 'center', color: '#f87171'
                }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.5rem' }}>
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p style={{ margin: 0, fontWeight: 500 }}>{error}</p>
                    <button
                        onClick={loadFeedback}
                        style={{
                            marginTop: '1rem', background: 'transparent', color: '#f87171',
                            border: '1px solid #f87171', padding: '0.4rem 1rem', borderRadius: '6px',
                            cursor: 'pointer', fontSize: '0.8rem'
                        }}
                    >
                        Retry
                    </button>
                </div>
            ) : filteredFeedback.length === 0 ? (
                <div style={{
                    background: 'var(--admin-card-bg)', border: '1px dashed var(--admin-border)',
                    borderRadius: '12px', padding: '4rem 2rem', textAlign: 'center'
                }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 1rem' }}>
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <h3 style={{ color: 'var(--admin-text-primary)', fontSize: '1.1rem', margin: '0 0 0.5rem' }}>No Feedback Found</h3>
                    <p style={{ color: 'var(--admin-text-secondary)', fontSize: '0.9rem', margin: 0 }}>There is no feedback matching the current filter.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {filteredFeedback.map(item => {
                        const statusColors = getStatusColor(item.status);
                        const typeColors = getTypeColor(item.type);
                        const user = item.profiles;

                        return (
                            <div key={item.id} style={{
                                background: 'var(--admin-card-bg)',
                                border: '1px solid var(--admin-border)',
                                borderRadius: '12px',
                                padding: '1.5rem',
                                transition: 'transform 0.2s, box-shadow 0.2s',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <div style={{
                                            background: 'var(--bg-elevated)', color: 'var(--primary)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '1rem', fontWeight: 600
                                        }}>
                                            {user?.first_name?.[0] || 'U'}
                                        </div>
                                        <div>
                                            <div style={{ color: 'var(--admin-text-primary)', fontWeight: 600, fontSize: '0.95rem' }}>
                                                {user ? `${user.first_name} ${user.last_name}` : 'Unknown User'}
                                            </div>
                                            <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span>{user?.account_type || 'User'}</span>
                                                <span>•</span>
                                                <span>{formatDate(item.created_at)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                        <span style={{
                                            background: typeColors.bg, color: typeColors.color,
                                            padding: '0.2rem 0.6rem', borderRadius: '4px',
                                            fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
                                            letterSpacing: '0.05em'
                                        }}>
                                            {item.type}
                                        </span>
                                        <span style={{
                                            background: statusColors.bg, color: statusColors.color,
                                            border: `1px solid ${statusColors.border}`,
                                            padding: '0.2rem 0.6rem', borderRadius: '12px',
                                            fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize'
                                        }}>
                                            {item.status}
                                        </span>
                                    </div>
                                </div>

                                <div style={{
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    padding: '1rem',
                                    color: 'var(--admin-text-primary)',
                                    fontSize: '0.95rem',
                                    lineHeight: '1.5',
                                    whiteSpace: 'pre-wrap',
                                    marginBottom: '1.25rem'
                                }}>
                                    {item.content}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--admin-border)', paddingTop: '1rem' }}>
                                    {item.status !== 'new' && (
                                        <button
                                            onClick={() => handleUpdateStatus(item.id, 'new')}
                                            disabled={updatingId === item.id}
                                            style={{
                                                background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)',
                                                padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer'
                                            }}
                                        >
                                            Mark as New
                                        </button>
                                    )}
                                    {item.status !== 'reviewed' && (
                                        <button
                                            onClick={() => handleUpdateStatus(item.id, 'reviewed')}
                                            disabled={updatingId === item.id}
                                            style={{
                                                background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.2)',
                                                padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer'
                                            }}
                                        >
                                            Mark as Reviewed
                                        </button>
                                    )}
                                    {item.status !== 'resolved' && (
                                        <button
                                            onClick={() => handleUpdateStatus(item.id, 'resolved')}
                                            disabled={updatingId === item.id}
                                            style={{
                                                background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)',
                                                padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer'
                                            }}
                                        >
                                            Mark as Resolved
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default AdminFeedbackView;
