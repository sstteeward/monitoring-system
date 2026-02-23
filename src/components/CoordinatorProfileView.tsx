import React, { useEffect, useState } from 'react';
import { profileService, type Profile } from '../services/profileService';
import { supabase } from '../lib/supabaseClient';

interface CoordinatorProfileViewProps {
    initialProfile: Profile | null;
    onProfileUpdated?: (p: Profile) => void;
}

const CoordinatorProfileView: React.FC<CoordinatorProfileViewProps> = ({ initialProfile, onProfileUpdated }) => {
    const [profile, setProfile] = useState<Profile | null>(initialProfile);
    const [firstName, setFirstName] = useState(initialProfile?.first_name ?? '');
    const [lastName, setLastName] = useState(initialProfile?.last_name ?? '');
    const [email, setEmail] = useState(initialProfile?.email ?? '');
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!initialProfile) {
            profileService.getCurrentProfile().then(p => {
                if (p) {
                    setProfile(p);
                    setFirstName(p.first_name ?? '');
                    setLastName(p.last_name ?? '');
                    setEmail(p.email ?? '');
                }
            });
        }
    }, [initialProfile]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSuccess(false);
        setError(null);
        try {
            await profileService.updateProfile({ first_name: firstName, last_name: lastName });
            setSuccess(true);
            const updated = await profileService.getCurrentProfile();
            if (updated) {
                setProfile(updated);
                onProfileUpdated?.(updated);
            }
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            setError(err.message ?? 'Failed to save changes.');
        } finally {
            setSaving(false);
        }
    };

    const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || '?';
    const joinDate = profile?.created_at
        ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : '—';

    const inputStyle: React.CSSProperties = {
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '9px',
        padding: '0.65rem 1rem',
        color: 'var(--text-bright)',
        fontSize: '0.9rem',
        fontFamily: 'Inter, sans-serif',
        width: '100%',
        outline: 'none',
        transition: 'border-color 0.18s, box-shadow 0.18s',
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: 'var(--text-muted)',
        marginBottom: '0.4rem',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
    };

    const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px' };

    return (
        <div className="view-container fade-in">
            <div className="view-header">
                <div>
                    <h2 className="view-title">My Profile</h2>
                    <p className="view-subtitle">Manage your coordinator account information</p>
                </div>
            </div>

            <div className="profile-top-grid">
                {/* Left — Avatar card */}
                <div className="profile-avatar-card" style={{ ...cardStyle, padding: '2rem 1.5rem' }}>
                    {/* Big avatar */}
                    <div style={{
                        width: 90, height: 90, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '2rem', fontWeight: 700, color: '#fff',
                        boxShadow: '0 8px 24px rgba(16,185,129,0.3)', letterSpacing: '0.05em'
                    }}>
                        {initials}
                    </div>

                    <div style={{ textAlign: 'center' }} className="profile-hero-text">
                        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-bright)' }}>
                            {firstName && !firstName.includes('@') ? `${firstName} ${lastName}`.trim() : 'Coordinator'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#10b981', marginTop: '0.25rem', fontWeight: 600 }}>
                            ● Coordinator
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }} className="d-none-mobile">{email}</div>
                    </div>

                    <div style={{ width: '100%', borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {[
                            { label: 'Role', value: 'Coordinator' },
                            { label: 'Member Since', value: joinDate },
                            { label: 'Account Status', value: 'Active' },
                        ].map(item => (
                            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                                <span style={{ fontWeight: 600, color: item.label === 'Account Status' ? '#10b981' : 'var(--text-bright)' }}>{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right — Edit form */}
                <div style={{ ...cardStyle, padding: '1.75rem 2rem' }}>
                    <h3 style={{ margin: '0 0 1.5rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-bright)' }}>Personal Information</h3>
                    <form onSubmit={handleSave}>
                        <div className="profile-name-grid">
                            <div>
                                <label style={labelStyle}>First Name</label>
                                <input
                                    style={inputStyle}
                                    value={firstName}
                                    onChange={e => setFirstName(e.target.value)}
                                    placeholder="First name"
                                    onFocus={e => { e.target.style.borderColor = '#10b981'; e.target.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.12)'; }}
                                    onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Last Name</label>
                                <input
                                    style={inputStyle}
                                    value={lastName}
                                    onChange={e => setLastName(e.target.value)}
                                    placeholder="Last name"
                                    onFocus={e => { e.target.style.borderColor = '#10b981'; e.target.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.12)'; }}
                                    onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={labelStyle}>Email Address</label>
                            <input
                                style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
                                value={email}
                                readOnly
                                title="Email cannot be changed here"
                            />
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>Email is managed by your Supabase account and cannot be edited here.</p>
                        </div>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={labelStyle}>Role</label>
                            <input
                                style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
                                value="Coordinator"
                                readOnly
                            />
                        </div>

                        {/* Feedback */}
                        {error && (
                            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '0.7rem 1rem', marginBottom: '1rem', color: '#f87171', fontSize: '0.85rem' }}>
                                {error}
                            </div>
                        )}
                        {success && (
                            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px', padding: '0.7rem 1rem', marginBottom: '1rem', color: '#10b981', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                Profile updated successfully!
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={saving}
                                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', minWidth: '140px' }}
                            >
                                {saving ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span className="cd-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                                        Saving…
                                    </span>
                                ) : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Danger zone */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '16px', padding: '1.5rem 2rem' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 700, color: '#f87171' }}>Danger Zone</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Signing out will end your current session. You'll need to log in again to access the coordinator dashboard.</p>
                <button
                    className="btn btn-secondary"
                    style={{ color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}
                    onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}
                >
                    Sign Out
                </button>
            </div>
        </div>
    );
};

export default CoordinatorProfileView;
