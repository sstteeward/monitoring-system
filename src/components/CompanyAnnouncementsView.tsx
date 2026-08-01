import React, { useEffect, useState } from 'react';
import { companyService, type Announcement } from '../services/companyService';
import { profileService } from '../services/profileService';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';

const AnnouncementTypes = ['general', 'meeting', 'reminder', 'holiday', 'schedule_change', 'training'] as const;

const CompanyAnnouncementsView: React.FC = () => {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [companyId, setCompanyId] = useState<string | null>(null);

    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({ title: '', content: '', type: 'general' as Announcement['type'] });

    const {
        currentPage,
        setCurrentPage,
        totalPages,
        paginatedItems: paginatedAnnouncements,
        totalItems,
        itemsPerPage
    } = usePagination(announcements, 10);

    useEffect(() => { loadAnnouncements(); }, []);

    const loadAnnouncements = async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await profileService.getCurrentProfile();
            if (!profile?.company_id) {
                throw new Error("You are not associated with any company.");
            }
            setCompanyId(profile.company_id);
            const data = await companyService.getAnnouncements(profile.company_id);
            setAnnouncements(data as Announcement[]);
        } catch (err: any) {
            console.error('Failed to load announcements:', err);
            setError(err?.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyId) return;
        if (!formData.title.trim() || !formData.content.trim()) {
            alert('Please fill in all required fields.');
            return;
        }

        setSubmitting(true);
        try {
            await companyService.createAnnouncement({
                company_id: companyId,
                title: formData.title,
                content: formData.content,
                type: formData.type
            });
            setShowForm(false);
            setFormData({ title: '', content: '', type: 'general' });
            loadAnnouncements();
        } catch (err: any) {
            console.error('Failed to create announcement:', err);
            alert(`Failed to create announcement: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this announcement?')) return;
        try {
            await companyService.deleteAnnouncement(id);
            setAnnouncements(prev => prev.filter(a => a.id !== id));
        } catch (err: any) {
            console.error('Failed to delete announcement:', err);
            alert(`Failed to delete announcement: ${err.message}`);
        }
    };

    const getTypeColor = (type: Announcement['type']) => {
        switch (type) {
            case 'meeting': return { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6' };
            case 'reminder': return { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b' };
            case 'holiday': return { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981' };
            case 'schedule_change': return { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444' };
            case 'training': return { bg: 'rgba(139, 92, 246, 0.1)', text: '#8b5cf6' };
            default: return { bg: 'var(--bg-elevated)', text: 'var(--text-secondary)' };
        }
    };

    if (error) return (
        <div className="view-container fade-in">
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '1.5rem 2rem', color: '#f87171' }}>
                <strong>Error:</strong> {error}
            </div>
        </div>
    );

    return (
        <div className="view-container fade-in">
            <div className="view-header" style={{ flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                    <h2 className="view-title" style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Company Announcements</h2>
                    <p className="view-subtitle" style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
                        Post updates, meetings, and important notices for your interns
                    </p>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                        {showForm ? 'Cancel' : 'New Announcement'}
                    </button>
                </div>
            </div>

            {showForm && (
                <form className="glass-card fade-in" style={{ padding: '2rem', marginBottom: '2rem', border: '1px solid var(--primary)', boxShadow: '0 4px 20px rgba(59, 130, 246, 0.1)' }} onSubmit={handleSubmit}>
                    <h3 style={{ margin: '0 0 1.5rem 0' }}>Create Announcement</h3>
                    
                    <div style={{ display: 'grid', gap: '1.5rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Title</label>
                            <input 
                                type="text" 
                                className="form-input" 
                                style={{ width: '100%' }} 
                                value={formData.title} 
                                onChange={e => setFormData({...formData, title: e.target.value})} 
                                placeholder="Enter announcement title" 
                                required 
                            />
                        </div>
                        
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Type</label>
                            <select 
                                className="form-input" 
                                style={{ width: '100%' }} 
                                value={formData.type} 
                                onChange={e => setFormData({...formData, type: e.target.value as Announcement['type']})}
                            >
                                {AnnouncementTypes.map(type => (
                                    <option key={type} value={type}>{type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Content</label>
                            <textarea 
                                className="form-input" 
                                style={{ width: '100%', minHeight: '120px', resize: 'vertical' }} 
                                value={formData.content} 
                                onChange={e => setFormData({...formData, content: e.target.value})} 
                                placeholder="Write your announcement here..." 
                                required 
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                        <button type="button" className="btn-secondary" onClick={() => setShowForm(false)} disabled={submitting}>Cancel</button>
                        <button type="submit" className="btn-primary" disabled={submitting}>
                            {submitting ? 'Posting...' : 'Post Announcement'}
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}>Loading announcements...</div>
                </div>
            ) : announcements.length === 0 ? (
                <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No announcements found. Click "New Announcement" to create one.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {paginatedAnnouncements.map(announcement => {
                        const typeColors = getTypeColor(announcement.type);
                        return (
                            <div key={announcement.id} className="glass-card" style={{ padding: '1.5rem', position: 'relative' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                            <span style={{ 
                                                padding: '0.2rem 0.6rem', 
                                                borderRadius: '6px', 
                                                fontSize: '0.75rem', 
                                                fontWeight: 600,
                                                background: typeColors.bg,
                                                color: typeColors.text,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.05em'
                                            }}>
                                                {announcement.type.replace('_', ' ')}
                                            </span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                {new Date(announcement.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{announcement.title}</h3>
                                    </div>
                                    <button 
                                        onClick={() => handleDelete(announcement.id)}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem', opacity: 0.7 }}
                                        title="Delete announcement"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                    </button>
                                </div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                    {announcement.content}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {!loading && announcements.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setCurrentPage}
                        itemName="announcements"
                    />
                </div>
            )}
        </div>
    );
};

export default CompanyAnnouncementsView;
