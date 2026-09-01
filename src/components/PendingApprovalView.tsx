import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { profileService, type Profile } from '../services/profileService';

interface PendingApprovalViewProps {
    profile?: Profile | null;
}

const PendingApprovalView: React.FC<PendingApprovalViewProps> = ({ profile: initialProfile }) => {
    const [profile, setProfile] = useState<Profile | null>(initialProfile || null);

    useEffect(() => {
        if (!initialProfile) {
            profileService.getCurrentProfile().then(p => setProfile(p)).catch(() => {});
        }
    }, [initialProfile]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        window.location.href = '/';
    };

    const isStudent = profile?.account_type === 'student';
    const isAdviser = profile?.account_type === 'adviser';

    const getMessage = () => {
        if (isStudent) {
            if (profile?.approval_status === 'rejected') {
                return (
                    <>
                        Your student registration was rejected by your Section Adviser.
                        {profile?.adviser_remarks && (
                            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8, color: '#ef4444', fontSize: '0.9rem' }}>
                                <strong>Adviser Reason:</strong> {profile.adviser_remarks}
                            </div>
                        )}
                    </>
                );
            }
            return (
                <>
                    Your student account has been registered and is currently <strong>Pending Approval</strong> from your Section Adviser ({profile?.section || 'assigned section'}).
                    <br /><br />
                    Once your section adviser verifies and approves your enrollment, you will be able to access your full student internship dashboard and clock in/out.
                </>
            );
        }
        if (isAdviser) {
            return (
                <>
                    Your adviser account has been created and is awaiting assignment and activation from the SIL Coordinator.
                    <br /><br />
                    Please check back later or contact your department SIL Coordinator.
                </>
            );
        }
        return (
            <>
                Your coordinator account has been created, but it requires administrator approval before you can access the dashboard.
                <br /><br />
                Please check back later or contact your system administrator.
            </>
        );
    };

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            width: '100%',
            backgroundColor: 'var(--bg-primary)',
            padding: '2rem'
        }}>
            <div style={{
                backgroundColor: 'var(--bg-secondary)',
                padding: '3rem',
                borderRadius: '16px',
                boxShadow: 'var(--shadow-lg)',
                textAlign: 'center',
                maxWidth: '480px',
                width: '100%'
            }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    color: '#f59e0b',
                    borderRadius: '50%',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    margin: '0 auto 1.5rem auto'
                }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                </div>
                <h1 style={{ color: 'var(--text-primary)', marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 600 }}>
                    {profile?.approval_status === 'rejected' ? 'Registration Not Approved' : 'Account Pending Approval'}
                </h1>
                <div style={{ color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: '1.6' }}>
                    {getMessage()}
                </div>
                <button
                    onClick={handleSignOut}
                    style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        width: '100%',
                        transition: 'opacity 0.2s',
                    }}
                    onMouseOver={e => e.currentTarget.style.opacity = '0.9'}
                    onMouseOut={e => e.currentTarget.style.opacity = '1'}
                >
                    Return to Login
                </button>
            </div>
        </div>
    );
};

export default PendingApprovalView;
