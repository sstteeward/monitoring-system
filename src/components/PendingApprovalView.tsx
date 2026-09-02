import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { profileService, type Profile } from '../services/profileService';
import './PendingApprovalView.css';

interface PendingApprovalViewProps {
    profile?: Profile | null;
}

interface MetaRow {
    label: string;
    value: string;
}

const PendingApprovalView: React.FC<PendingApprovalViewProps> = ({ profile: initialProfile }) => {
    const [profile, setProfile] = useState<Profile | null>(initialProfile || null);

    useEffect(() => {
        if (!initialProfile) {
            profileService.getCurrentProfile().then(p => setProfile(p)).catch(() => {});
        }
    }, [initialProfile]);

    // Unchanged: end the session, then land on the login screen. The full page
    // load clears any in-memory app state left over from the signed-in session.
    const handleSignOut = async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    const isStudent = profile?.account_type === 'student';
    const isAdviser = profile?.account_type === 'adviser';
    const isRejected = profile?.approval_status === 'rejected';

    const title = isRejected ? 'Registration Not Approved' : 'Account Pending Approval';
    const chipLabel = isRejected ? 'Not Approved' : 'Pending Approval';

    /** Who the account is waiting on, and the details that identify it. */
    const meta: MetaRow[] = [];
    if (isStudent) {
        meta.push({ label: 'Section', value: profile?.section || 'Not yet assigned' });
        meta.push({ label: 'Reviewed by', value: 'Section Adviser' });
    } else if (isAdviser) {
        if (profile?.department) meta.push({ label: 'Department', value: profile.department });
        meta.push({ label: 'Reviewed by', value: 'SIL Coordinator' });
    } else {
        meta.push({ label: 'Reviewed by', value: 'System Administrator' });
    }

    const paragraphs = (): string[] => {
        if (isStudent) {
            if (isRejected) {
                return ['Your student registration was reviewed by your Section Adviser and was not approved.'];
            }
            return [
                `Your student account has been successfully registered and is currently awaiting approval from your Section Adviser${profile?.section ? ` (${profile.section})` : ''}.`,
                'Once your section adviser verifies and approves your enrollment, you will be able to access your full student internship dashboard and clock in/out.',
            ];
        }
        if (isAdviser) {
            return [
                'Your adviser account has been created and is awaiting assignment and activation from the SIL Coordinator.',
                'Please check back later, or contact your department SIL Coordinator if this is taking longer than expected.',
            ];
        }
        return [
            'Your coordinator account has been created, but it requires administrator approval before you can access the dashboard.',
            'Please check back later, or contact your system administrator if this is taking longer than expected.',
        ];
    };

    return (
        <div className="pav-page">
            <div className="pav-card">
                <div className={`pav-icon${isRejected ? ' rejected' : ''}`} aria-hidden="true">
                    {isRejected ? (
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                    ) : (
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                    )}
                </div>

                <h1 className="pav-title">{title}</h1>

                <span className={`pav-chip${isRejected ? ' rejected' : ''}`}>
                    <span className="pav-dot" aria-hidden="true" />
                    {chipLabel}
                </span>

                <div className="pav-body">
                    {paragraphs().map(text => <p key={text}>{text}</p>)}
                </div>

                {isRejected && profile?.adviser_remarks && (
                    <div className="pav-remarks" role="note">
                        <span className="pav-remarks-label">Adviser reason</span>
                        {profile.adviser_remarks}
                    </div>
                )}

                {meta.length > 0 && (
                    <div className="pav-meta">
                        {meta.map(row => (
                            <div className="pav-meta-row" key={row.label}>
                                <span className="pav-meta-label">{row.label}</span>
                                <span className="pav-meta-value">{row.value}</span>
                            </div>
                        ))}
                    </div>
                )}

                <div className="pav-actions">
                    <button type="button" className="pav-btn" onClick={handleSignOut}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="19" y1="12" x2="5" y2="12" />
                            <polyline points="12 19 5 12 12 5" />
                        </svg>
                        Return to Login
                    </button>
                    <p className="pav-footnote">
                        Signing out does not cancel your request — your account stays in the review queue.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PendingApprovalView;
