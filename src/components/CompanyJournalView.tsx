import React, { useEffect, useState } from 'react';
import { companyService } from '../services/companyService';
import { profileService, type Profile } from '../services/profileService';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import UserProfileModal from './UserProfileModal';
import UserClickableName from './UserClickableName';

export interface DailyJournal {
    id: string;
    user_id: string;
    entry_date: string;
    tasks: string;
    learnings: string;
    status: 'pending' | 'approved' | 'rejected' | 'revision_requested';
    reviewer_comments: string | null;
    reviewed_at: string | null;
    photo_urls?: string[];
    profiles?: {
        first_name: string;
        last_name: string;
        avatar_url: string;
    };
}

const CompanyJournalView: React.FC = () => {
    const [journals, setJournals] = useState<DailyJournal[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'reviewed'>('pending');
    
    // Review Modal State
    const [reviewingJournal, setReviewingJournal] = useState<DailyJournal | null>(null);
    const [reviewComments, setReviewComments] = useState('');
    const [reviewing, setReviewing] = useState(false);
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);

    const {
        currentPage,
        setCurrentPage,
        totalPages,
        paginatedItems: paginatedJournals,
        totalItems,
        itemsPerPage
    } = usePagination(journals, 10);

    useEffect(() => { loadJournals(); }, [filterStatus]);

    const loadJournals = async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await profileService.getCurrentProfile();
            if (!profile?.company_id) {
                throw new Error("You are not associated with any company.");
            }
            
            const assignedStudents = await companyService.getAssignedStudents(profile.company_id);
            const studentIds = assignedStudents.map(s => s.id);
            
            if (studentIds.length === 0) {
                setJournals([]);
                return;
            }

            let data;
            if (filterStatus === 'pending') {
                data = await companyService.getPendingJournals(studentIds);
            } else {
                data = await companyService.getAllJournals(studentIds);
                if (filterStatus === 'reviewed') {
                    data = data.filter((j: DailyJournal) => j.status !== 'pending');
                }
            }
            
            setJournals(data as DailyJournal[]);
        } catch (err: any) {
            console.error('Failed to load journals:', err);
            setError(err?.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const handleReviewSubmit = async (status: 'approved' | 'rejected' | 'revision_requested') => {
        if (!reviewingJournal) return;
        
        if (status !== 'approved' && !reviewComments.trim()) {
            alert('Please provide comments when rejecting or requesting revisions.');
            return;
        }

        setReviewing(true);
        try {
            await companyService.updateJournalStatus(reviewingJournal.id, status, reviewComments);
            setReviewingJournal(null);
            setReviewComments('');
            loadJournals(); // Reload list
        } catch (err: any) {
            console.error('Failed to submit review:', err);
            alert(`Failed to submit review: ${err.message}`);
        } finally {
            setReviewing(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
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
                    <h2 className="view-title" style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Journal Management</h2>
                    <p className="view-subtitle" style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
                        Review daily journals submitted by your interns
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                    <button 
                        onClick={() => setFilterStatus('pending')}
                        style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, border: '1px solid var(--border)', background: filterStatus === 'pending' ? 'var(--primary)' : 'var(--bg-elevated)', color: filterStatus === 'pending' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                        Pending Review
                    </button>
                    <button 
                        onClick={() => setFilterStatus('reviewed')}
                        style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, border: '1px solid var(--border)', background: filterStatus === 'reviewed' ? 'var(--primary)' : 'var(--bg-elevated)', color: filterStatus === 'reviewed' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                        Reviewed
                    </button>
                    <button 
                        onClick={() => setFilterStatus('all')}
                        style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, border: '1px solid var(--border)', background: filterStatus === 'all' ? 'var(--primary)' : 'var(--bg-elevated)', color: filterStatus === 'all' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                        All
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}>Loading journals...</div>
                </div>
            ) : journals.length === 0 ? (
                <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No {filterStatus !== 'all' ? filterStatus : ''} journals found.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {paginatedJournals.map(journal => (
                        <div key={journal.id} className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-card)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <div 
                                        style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', cursor: 'pointer' }}
                                        onClick={() => setViewProfileId(journal.user_id)}
                                    >
                                        {journal.profiles?.first_name?.[0] || '?'}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '1rem' }}>
                                            <UserClickableName userId={journal.user_id} userName={`${journal.profiles?.first_name} ${journal.profiles?.last_name}`} />
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            {formatDate(journal.entry_date)}
                                        </div>
                                    </div>
                                </div>
                                <span style={{
                                    padding: '0.25rem 0.75rem',
                                    borderRadius: '20px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    background: journal.status === 'approved' ? 'rgba(16,185,129,0.1)' : 
                                                journal.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 
                                                journal.status === 'revision_requested' ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)',
                                    color: journal.status === 'approved' ? '#10b981' : 
                                           journal.status === 'rejected' ? '#ef4444' : 
                                           journal.status === 'revision_requested' ? '#f59e0b' : '#3b82f6',
                                    textTransform: 'capitalize'
                                }}>
                                    {journal.status.replace('_', ' ')}
                                </span>
                            </div>
                            
                            <div style={{ background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '8px' }}>
                                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Tasks</h4>
                                <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.95rem', lineHeight: 1.5 }}>{journal.tasks}</p>
                            </div>
                            
                            <div style={{ background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '8px' }}>
                                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Learnings</h4>
                                <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.95rem', lineHeight: 1.5 }}>{journal.learnings}</p>
                            </div>

                            {journal.status === 'pending' && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                                    <button 
                                        className="btn-primary" 
                                        style={{ padding: '0.5rem 1.5rem' }}
                                        onClick={() => {
                                            setReviewingJournal(journal);
                                            setReviewComments('');
                                        }}
                                    >
                                        Review Entry
                                    </button>
                                </div>
                            )}

                            {journal.reviewer_comments && (
                                <div style={{ marginTop: '0.5rem', padding: '1rem', borderLeft: '3px solid var(--primary)', background: 'rgba(59,130,246,0.05)', borderRadius: '0 8px 8px 0' }}>
                                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.85rem', color: 'var(--primary)' }}>Reviewer Comments</h4>
                                    <p style={{ margin: 0, fontSize: '0.9rem' }}>{journal.reviewer_comments}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {!loading && journals.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setCurrentPage}
                        itemName="journals"
                    />
                </div>
            )}

            {/* Review Modal */}
            {reviewingJournal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
                    <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '600px', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Review Journal Entry</h3>
                            <button onClick={() => setReviewingJournal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        
                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Student</div>
                                <div style={{ fontWeight: 600 }}>{reviewingJournal.profiles?.first_name} {reviewingJournal.profiles?.last_name}</div>
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Feedback / Comments</label>
                                <textarea
                                    value={reviewComments}
                                    onChange={(e) => setReviewComments(e.target.value)}
                                    placeholder="Provide feedback on the journal entry..."
                                    style={{ width: '100%', height: '120px', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', resize: 'vertical' }}
                                />
                            </div>
                        </div>

                        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1rem', justifyContent: 'flex-end', background: 'var(--bg-elevated)' }}>
                            <button 
                                onClick={() => handleReviewSubmit('rejected')}
                                disabled={reviewing}
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #ef4444', color: '#ef4444', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Reject
                            </button>
                            <button 
                                onClick={() => handleReviewSubmit('revision_requested')}
                                disabled={reviewing}
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #f59e0b', color: '#f59e0b', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Request Revision
                            </button>
                            <button 
                                onClick={() => handleReviewSubmit('approved')}
                                disabled={reviewing}
                                style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Approve
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <UserProfileModal
                profileId={viewProfileId}
                onClose={() => setViewProfileId(null)}
            />
        </div>
    );
};

export default CompanyJournalView;
