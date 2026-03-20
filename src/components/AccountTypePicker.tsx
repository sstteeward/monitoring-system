import React, { useState } from 'react';

interface Props {
    onPick: (type: 'student' | 'coordinator') => Promise<void>;
}

const AccountTypePicker: React.FC<Props> = ({ onPick }) => {
    const [selected, setSelected] = useState<'student' | 'coordinator'>('student');
    const [loading, setLoading] = useState(false);

    const handleContinue = async () => {
        setLoading(true);
        await onPick(selected);
        setLoading(false);
    };

    return (
        <div style={{
            minHeight: '100vh',
            width: '100%',
            background: 'var(--bg-page)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'inherit',
            padding: '2rem 1.5rem',
            boxSizing: 'border-box',
        }}>
            <div style={{
                width: '100%',
                maxWidth: 460,
                margin: '0 auto',
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div style={{
                        width: 60, height: 60, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        boxShadow: '0 8px 32px rgba(16,185,129,0.35)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1.25rem',
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                        </svg>
                    </div>
                    <h1 style={{ color: 'var(--text-bright)', fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.5rem' }}>
                        What's your role?
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: 0 }}>
                        Choose the account type that best describes you.
                    </p>
                </div>

                {/* Option cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>

                    {/* Student */}
                    <button
                        onClick={() => setSelected('student')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '1.25rem',
                            padding: '1.25rem 1.5rem', borderRadius: 16, cursor: 'pointer',
                            border: `2px solid ${selected === 'student' ? '#10b981' : 'var(--border)'}`,
                            background: selected === 'student' ? 'rgba(16,185,129,0.12)' : 'var(--bg-card)',
                            boxShadow: selected === 'student' ? '0 4px 20px rgba(16,185,129,0.15)' : 'none',
                            textAlign: 'left', transition: 'all 0.2s', fontFamily: 'inherit',
                        }}
                    >
                        <div style={{
                            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                            background: selected === 'student' ? 'rgba(16,185,129,0.25)' : 'var(--bg-elevated)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: selected === 'student' ? '#34d399' : 'var(--text-dim)',
                            transition: 'all 0.2s',
                        }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                                <path d="M6 12v5c3 3 9 3 12 0v-5" />
                            </svg>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: selected === 'student' ? 'var(--text-bright)' : 'var(--text-primary)', marginBottom: '0.25rem' }}>
                                Student
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                Track OJT hours, submit journals & documents
                            </div>
                        </div>
                        <div style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            border: `2px solid ${selected === 'student' ? '#10b981' : 'var(--border)'}`,
                            background: selected === 'student' ? '#10b981' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s',
                        }}>
                            {selected === 'student' && (
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                    <path d="M2.5 6l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                        </div>
                    </button>

                    {/* Coordinator */}
                    <button
                        onClick={() => setSelected('coordinator')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '1.25rem',
                            padding: '1.25rem 1.5rem', borderRadius: 16, cursor: 'pointer',
                            border: `2px solid ${selected === 'coordinator' ? '#10b981' : 'var(--border)'}`,
                            background: selected === 'coordinator' ? 'rgba(16,185,129,0.12)' : 'var(--bg-card)',
                            boxShadow: selected === 'coordinator' ? '0 4px 20px rgba(16,185,129,0.15)' : 'none',
                            textAlign: 'left', transition: 'all 0.2s', fontFamily: 'inherit',
                        }}
                    >
                        <div style={{
                            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                            background: selected === 'coordinator' ? 'rgba(16,185,129,0.25)' : 'var(--bg-elevated)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: selected === 'coordinator' ? '#34d399' : 'var(--text-dim)',
                            transition: 'all 0.2s',
                        }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: selected === 'coordinator' ? 'var(--text-bright)' : 'var(--text-primary)', marginBottom: '0.25rem' }}>
                                Coordinator
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                Supervise students, review submissions &amp; manage departments
                            </div>
                        </div>
                        <div style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            border: `2px solid ${selected === 'coordinator' ? '#10b981' : 'var(--border)'}`,
                            background: selected === 'coordinator' ? '#10b981' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s',
                        }}>
                            {selected === 'coordinator' && (
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                    <path d="M2.5 6l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                        </div>
                    </button>
                </div>

                {/* Warning for coordinator */}
                {selected === 'coordinator' && (
                    <div style={{
                        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                        borderRadius: 12, padding: '0.85rem 1rem', marginBottom: '1.25rem',
                        fontSize: '0.83rem', color: '#fbbf24', lineHeight: 1.5,
                    }}>
                        ⚠️ Coordinator accounts require admin approval before you can sign in.
                    </div>
                )}

                {/* Continue button */}
                <button
                    onClick={handleContinue}
                    disabled={loading}
                    style={{
                        width: '100%', padding: '0.9rem',
                        borderRadius: 12, border: 'none',
                        background: loading ? 'rgba(16,185,129,0.5)' : 'linear-gradient(135deg, #10b981, #059669)',
                        boxShadow: '0 4px 16px rgba(16,185,129,0.35)',
                        color: '#fff', fontSize: '0.95rem', fontWeight: 700,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s', fontFamily: 'inherit',
                    }}
                >
                    {loading ? 'Setting up your account...' : `Continue as ${selected === 'student' ? 'Student' : 'Coordinator'} →`}
                </button>
            </div>
        </div>
    );
};

export default AccountTypePicker;
