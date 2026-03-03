import React, { useEffect, useState } from 'react';
import { profileService, type Profile } from '../services/profileService';
import { supabase } from '../lib/supabaseClient';

interface AdminProfileViewProps {
    initialProfile: Profile | null;
    onProfileUpdated?: (p: Profile) => void;
}

const AdminProfileView: React.FC<AdminProfileViewProps> = ({ initialProfile, onProfileUpdated }) => {
    const [profile, setProfile] = useState<Profile | null>(initialProfile);
    const [firstName, setFirstName] = useState(initialProfile?.first_name ?? '');
    const [lastName, setLastName] = useState(initialProfile?.last_name ?? '');
    const [email, setEmail] = useState(initialProfile?.email ?? '');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile?.avatar_url ?? null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    useEffect(() => {
        if (!initialProfile) {
            profileService.getCurrentProfile().then(p => {
                if (p) {
                    setProfile(p);
                    setFirstName(p.first_name ?? '');
                    setLastName(p.last_name ?? '');
                    setEmail(p.email ?? '');
                    setAvatarUrl(p.avatar_url ?? null);
                }
            });
        }
    }, [initialProfile]);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            setAvatarFile(file);
            setAvatarUrl(URL.createObjectURL(file)); // Preview
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSuccess(false);
        setError(null);
        try {
            let currentAvatarUrl = avatarUrl;
            if (avatarFile) {
                currentAvatarUrl = await profileService.uploadAvatar(avatarFile);
            }

            await profileService.updateProfile({
                first_name: firstName,
                last_name: lastName,
                avatar_url: currentAvatarUrl,
            });
            setSuccess(true);
            const updated = await profileService.getCurrentProfile();
            if (updated) {
                setProfile(updated);
                onProfileUpdated?.(updated);
            }
            setAvatarFile(null);
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
        background: 'var(--admin-bg)',
        border: '1px solid var(--admin-border)',
        borderRadius: '9px',
        padding: '0.65rem 1rem',
        color: 'var(--admin-text-primary)',
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
        color: 'var(--admin-text-secondary)',
        marginBottom: '0.4rem',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
    };

    const cardStyle: React.CSSProperties = { background: 'var(--admin-card-bg)', border: '1px solid var(--admin-border)', borderRadius: '16px' };

    return (
        <div className="fade-in">
            <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--admin-text-primary)' }}>Admin Profile</h2>
                <p style={{ color: 'var(--admin-text-secondary)', margin: 0, fontSize: '0.9rem' }}>Manage your administrator account information and settings</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 2fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                {/* Left — Avatar card */}
                <div style={{ ...cardStyle, padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {/* Big avatar */}
                    <div
                        style={{
                            width: 90, height: 90, borderRadius: '50%', flexShrink: 0,
                            background: avatarUrl ? `url(${avatarUrl}) center/cover no-repeat` : 'linear-gradient(135deg, #10b981, #059669)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '2rem', fontWeight: 700, color: '#fff',
                            boxShadow: '0 8px 24px rgba(16,185,129,0.3)', letterSpacing: '0.05em',
                            cursor: 'pointer', position: 'relative', overflow: 'hidden',
                            marginBottom: '1rem'
                        }}
                        onClick={() => document.getElementById('admin-avatar-upload')?.click()}
                        title="Click to change profile photo"
                    >
                        {!avatarUrl && initials}
                        <input
                            id="admin-avatar-upload"
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleAvatarChange}
                        />
                    </div>

                    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--admin-text-primary)' }}>
                            {firstName && !firstName.includes('@')
                                ? `${firstName} ${lastName}`.trim()
                                : email
                                    ? email.split('@')[0].split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
                                    : 'Admin'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#10b981', marginTop: '0.25rem', fontWeight: 600 }}>
                            ● Super Admin
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-secondary)', marginTop: '0.5rem' }}>{email}</div>
                    </div>

                    <div style={{ width: '100%', borderTop: '1px solid var(--admin-border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {[
                            { label: 'Role', value: 'Administrator' },
                            { label: 'Member Since', value: joinDate },
                            { label: 'Account Status', value: 'Active' },
                        ].map(item => (
                            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                                <span style={{ color: 'var(--admin-text-secondary)' }}>{item.label}</span>
                                <span style={{ fontWeight: 600, color: item.label === 'Account Status' ? '#10b981' : 'var(--admin-text-primary)' }}>{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right — Edit form */}
                <div style={{ ...cardStyle, padding: '1.75rem 2rem' }}>
                    <h3 style={{ margin: '0 0 1.5rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--admin-text-primary)' }}>Personal Information</h3>
                    <form onSubmit={handleSave}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                            <div>
                                <label style={labelStyle}>First Name</label>
                                <input
                                    style={inputStyle}
                                    value={firstName}
                                    onChange={e => setFirstName(e.target.value)}
                                    placeholder="First name"
                                    onFocus={e => { e.target.style.borderColor = '#10b981'; e.target.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.12)'; }}
                                    onBlur={e => { e.target.style.borderColor = 'var(--admin-border)'; e.target.style.boxShadow = 'none'; }}
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
                                    onBlur={e => { e.target.style.borderColor = 'var(--admin-border)'; e.target.style.boxShadow = 'none'; }}
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
                            <p style={{ fontSize: '0.72rem', color: 'var(--admin-text-secondary)', marginTop: '0.35rem' }}>Email is managed by your Supabase account and cannot be edited here.</p>
                        </div>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={labelStyle}>Role</label>
                            <input
                                style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
                                value="Super Admin"
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
                                disabled={saving}
                                style={{
                                    background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', minWidth: '140px',
                                    color: 'white', padding: '0.65rem 1.5rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.9rem',
                                    cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'all 0.2s',
                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                                }}
                                onMouseOver={e => { if (!saving) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.3)'; } }}
                                onMouseOut={e => { if (!saving) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.2)'; } }}
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Danger zone */}
            <div style={{ background: 'var(--admin-card-bg)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '16px', padding: '1.5rem 2rem' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 700, color: '#f87171' }}>Danger Zone</h3>
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '1rem' }}>Signing out will end your current session. You'll need to log in again to access the admin dashboard.</p>
                <button
                    style={{
                        color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)',
                        padding: '0.65rem 1.5rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                        transition: 'background 0.2s'
                    }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                    onMouseOut={e => e.currentTarget.style.background = 'rgba(239,68,68,0.05)'}
                    onClick={() => setShowLogoutConfirm(true)}
                >
                    Sign Out
                </button>
            </div>

            {/* Logout Confirmation Modal */}
            {showLogoutConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'var(--admin-bg)', border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 20, padding: '2rem', width: '90%', maxWidth: 420,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                        animation: 'fadeIn 0.2s ease',
                    }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                        </div>
                        <h3 style={{ textAlign: 'center', color: '#f8fafc', margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 600 }}>Sign Out?</h3>
                        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem', margin: '0 0 1.75rem' }}>
                            Are you sure you want to sign out of your account? You will need to log in again to access the dashboard.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={() => setShowLogoutConfirm(false)}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: '1px solid var(--admin-border)', background: 'rgba(30, 41, 59, 0.5)', color: '#94a3b8', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit', transition: 'background 0.15s' }}
                                onMouseOver={e => e.currentTarget.style.background = 'rgba(30, 41, 59, 0.8)'}
                                onMouseOut={e => e.currentTarget.style.background = 'rgba(30, 41, 59, 0.5)'}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(239,68,68,0.35)', transition: 'opacity 0.15s' }}
                                onMouseOver={e => e.currentTarget.style.opacity = '0.9'}
                                onMouseOut={e => e.currentTarget.style.opacity = '1'}
                            >
                                Yes, Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminProfileView;
