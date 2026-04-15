import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

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
        { value: 'bug', label: 'Bug Report', icon: '🐛', color: '#ef4444' },
        { value: 'suggestion', label: 'Suggestion', icon: '💡', color: '#10b981' },
        { value: 'other', label: 'Other', icon: '💬', color: '#f59e0b' }
    ];

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            animation: 'fadeIn 0.2s ease-out'
        }} onClick={onClose}>
            <div style={{
                background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
                borderRadius: '20px',
                width: '95%',
                maxWidth: '480px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                overflow: 'hidden',
                animation: 'slideUp 0.3s ease-out'
            }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    padding: '1.5rem 1.5rem 2rem',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: -30,
                        right: -30,
                        width: '100px',
                        height: '100px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '50%'
                    }} />
                    <div style={{
                        position: 'absolute',
                        bottom: -20,
                        left: -20,
                        width: '60px',
                        height: '60px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '50%'
                    }} />
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <h3 style={{
                                margin: 0,
                                color: '#fff',
                                fontSize: '1.4rem',
                                fontWeight: 700,
                                letterSpacing: '-0.02em'
                            }}>Send Feedback</h3>
                            <p style={{
                                margin: '0.4rem 0 0',
                                color: 'rgba(255, 255, 255, 0.7)',
                                fontSize: '0.85rem'
                            }}>Help us improve your experience</p>
                        </div>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'rgba(255, 255, 255, 0.15)',
                                border: 'none',
                                borderRadius: '10px',
                                width: '36px',
                                height: '36px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#fff',
                                fontSize: '1.2rem',
                                transition: 'all 0.2s'
                            }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {success ? (
                    <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                        <div style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1.25rem',
                            fontSize: '2.5rem',
                            boxShadow: '0 10px 30px rgba(16, 185, 129, 0.4)'
                        }}>
                            ✓
                        </div>
                        <h4 style={{ color: '#f8fafc', marginBottom: '0.5rem', fontSize: '1.25rem', fontWeight: 600 }}>Thank You!</h4>
                        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Your feedback has been submitted successfully.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
                        {/* Feedback Type */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{
                                display: 'block',
                                color: '#e2e8f0',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                marginBottom: '0.75rem'
                            }}>
                                Category
                            </label>
                            <div style={{ display: 'flex', gap: '0.6rem' }}>
                                {feedbackTypes.map((t) => (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => setType(t.value as any)}
                                        style={{
                                            flex: 1,
                                            padding: '0.75rem 0.5rem',
                                            borderRadius: '12px',
                                            border: '2px solid',
                                            borderColor: type === t.value ? t.color : 'rgba(255, 255, 255, 0.1)',
                                            background: type === t.value ? `${t.color}15` : 'transparent',
                                            color: type === t.value ? t.color : '#94a3b8',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '0.25rem'
                                        }}
                                    >
                                        <span style={{ fontSize: '1.2rem' }}>{t.icon}</span>
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Message */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{
                                display: 'block',
                                color: '#e2e8f0',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                marginBottom: '0.75rem'
                            }}>
                                Your Feedback
                            </label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Describe your issue or suggestion in detail..."
                                required
                                style={{
                                    width: '100%',
                                    minHeight: '140px',
                                    padding: '1rem',
                                    borderRadius: '14px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    color: '#f8fafc',
                                    border: '2px solid rgba(255, 255, 255, 0.1)',
                                    fontSize: '0.9rem',
                                    fontFamily: 'inherit',
                                    resize: 'vertical',
                                    outline: 'none',
                                    transition: 'all 0.2s',
                                    boxSizing: 'border-box'
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = '#10b981';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.2)';
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                    e.target.style.boxShadow = 'none';
                                }}
                            />
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    flex: 1,
                                    padding: '0.85rem',
                                    borderRadius: '12px',
                                    border: '2px solid rgba(255, 255, 255, 0.15)',
                                    background: 'transparent',
                                    color: '#94a3b8',
                                    fontSize: '0.9rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || !content.trim()}
                                style={{
                                    flex: 2,
                                    padding: '0.85rem',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: submitting ? '#10b981' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    color: '#fff',
                                    fontSize: '0.9rem',
                                    fontWeight: 600,
                                    cursor: submitting ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: submitting ? 'none' : '0 4px 15px rgba(16, 185, 129, 0.4)'
                                }}
                            >
                                {submitting ? 'Sending...' : 'Submit Feedback'}
                            </button>
                        </div>
                    </form>
                )}

                <style>{`
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes slideUp {
                        from { opacity: 0; transform: translateY(20px) scale(0.95); }
                        to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                `}</style>
            </div>
        </div>
    );
};

export default FeedbackModal;