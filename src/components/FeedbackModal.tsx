import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import './AdminDashboard.css'; // Reuse some admin styles or we can add specific ones

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, userId }) => {
    const [type, setType] = useState<'bug' | 'suggestion' | 'other'>('suggestion');
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim()) return;

        setSubmitting(true);
        try {
            const { error } = await supabase
                .from('feedback')
                .insert([
                    {
                        user_id: userId,
                        type,
                        content,
                        status: 'new'
                    }
                ]);

            if (error) throw error;

            setSuccess(true);
            setTimeout(() => {
                onClose();
                setSuccess(false);
                setContent('');
                setType('suggestion');
            }, 2000);
        } catch (err) {
            console.error('Error submitting feedback:', err);
            alert('Failed to submit feedback. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="admin-modal-overlay" style={{ zIndex: 1000 }}>
            <div className="admin-modal-content" style={{ maxWidth: '500px', width: '90%' }}>
                <div className="admin-modal-header">
                    <h3 className="admin-modal-title">Submit Feedback</h3>
                    <button className="admin-modal-close" onClick={onClose}>&times;</button>
                </div>

                {success ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: 'rgba(16, 185, 129, 0.1)', color: '#10b981',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 1rem', fontSize: '2rem'
                        }}>
                            ✓
                        </div>
                        <h4 style={{ color: '#f8fafc', marginBottom: '0.5rem' }}>Thank you!</h4>
                        <p style={{ color: '#94a3b8' }}>Your feedback has been submitted to the admin.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                                Feedback Type
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                {(['bug', 'suggestion', 'other'] as const).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setType(t)}
                                        style={{
                                            padding: '0.6rem',
                                            borderRadius: '8px',
                                            border: '1px solid',
                                            borderColor: type === t ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                                            background: type === t ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                                            color: type === t ? '#10b981' : '#94a3b8',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            textTransform: 'capitalize',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                                Message
                            </label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Tell us what's on your mind..."
                                required
                                style={{
                                    width: '100%',
                                    minHeight: '120px',
                                    padding: '0.75rem',
                                    borderRadius: '8px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    color: '#f8fafc',
                                    fontSize: '0.9rem',
                                    resize: 'vertical',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                className="admin-btn-secondary"
                                style={{ flex: 1 }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="admin-btn-primary"
                                disabled={submitting || !content.trim()}
                                style={{ flex: 2 }}
                            >
                                {submitting ? 'Submitting...' : 'Send Feedback'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default FeedbackModal;
