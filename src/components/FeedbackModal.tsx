import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import './FeedbackModal.css';

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

    const feedbackTypes = [
        { value: 'bug', label: 'Bug Report', icon: '🐛' },
        { value: 'suggestion', label: 'Suggestion', icon: '💡' },
        { value: 'other', label: 'Other', icon: '💬' }
    ];

    return (
        <div className="feedback-modal-overlay" onClick={onClose}>
            <div className="feedback-modal-content" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="feedback-modal-header">
                    <div className="header-accent-1" />
                    <div className="header-accent-2" />
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <h3 className="feedback-modal-title">Send Feedback</h3>
                            <p className="feedback-modal-subtitle">Help us improve your experience</p>
                        </div>
                        <button onClick={onClose} className="close-button">✕</button>
                    </div>
                </div>

                {success ? (
                    <div className="success-container">
                        <div className="success-icon">✓</div>
                        <h4 style={{ color: 'var(--text-bright)', marginBottom: '0.5rem', fontSize: '1.5rem', fontWeight: 700 }}>Thank You!</h4>
                        <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Your feedback has been submitted successfully.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="feedback-form">
                        {/* Feedback Type */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label className="feedback-label">Category</label>
                            <div className="feedback-type-grid">
                                {feedbackTypes.map((t) => (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => setType(t.value as any)}
                                        className={`type-option ${type === t.value ? 'active' : ''}`}
                                    >
                                        <span className="type-icon">{t.icon}</span>
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Message */}
                        <div style={{ marginBottom: '2rem' }}>
                            <label className="feedback-label">Your Feedback</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Describe your issue or suggestion in detail..."
                                required
                                className="feedback-textarea"
                            />
                        </div>

                        {/* Actions */}
                        <div className="feedback-actions">
                            <button type="button" onClick={onClose} className="btn-cancel">
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || !content.trim()}
                                className="btn-submit-feedback"
                            >
                                {submitting ? 'Sending...' : 'Submit Feedback'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default FeedbackModal;