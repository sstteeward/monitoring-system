import React, { useEffect, useState } from 'react';
import { profileService, type Profile } from '../services/profileService';
import { supabase } from '../lib/supabaseClient';
import NameFieldsGroup from './onboarding/NameFieldsGroup';
import AddressLevelsSelector from './onboarding/AddressLevelsSelector';
import { addressLevelsFromProfile, useAddressLevels } from './onboarding/useAddressLevels';
import {
    addressLevelsToProfileColumns,
    formatFullName,
    getAgeCutoffDate,
    nameLevelsToProfileColumns,
    validateAddressLevels,
    validateBirthday,
    validateContactNumber,
    validateNameLevels,
    type FieldChrome,
    type NameLevels,
} from './onboarding/onboardingFields';

interface CoordinatorProfileViewProps {
    initialProfile: Profile | null;
    onProfileUpdated?: (p: Profile) => void;
}

const nameLevelsFromProfile = (p: Profile | null): NameLevels => ({
    firstName: p?.first_name ?? '',
    middleName: p?.middle_name ?? '',
    lastName: p?.last_name ?? '',
    suffix: p?.suffix ?? '',
});

const CoordinatorProfileView: React.FC<CoordinatorProfileViewProps> = ({ initialProfile, onProfileUpdated }) => {
    const [profile, setProfile] = useState<Profile | null>(initialProfile);
    const [name, setName] = useState<NameLevels>(() => nameLevelsFromProfile(initialProfile));
    const [birthday, setBirthday] = useState(initialProfile?.birthday ?? '');
    const [contactNumber, setContactNumber] = useState(initialProfile?.contact_number ?? '');
    const [email, setEmail] = useState(initialProfile?.email ?? '');

    // Address by level — same structure as Adviser, Student and Company onboarding.
    const addressLevels = useAddressLevels(addressLevelsFromProfile(initialProfile));
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
                    setName(nameLevelsFromProfile(p));
                    setBirthday(p.birthday ?? '');
                    setContactNumber(p.contact_number ?? '');
                    setEmail(p.email ?? '');
                    setAvatarUrl(p.avatar_url ?? null);
                    addressLevels.setAddress(addressLevelsFromProfile(p));
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
        // Shared rules — identical to Student, Adviser and Company onboarding.
        const validationError = validateNameLevels(name)
            ?? validateBirthday(birthday)
            ?? validateContactNumber(contactNumber)
            ?? validateAddressLevels(addressLevels.address);
        if (validationError) {
            setError(validationError);
            return;
        }

        setSaving(true);
        setSuccess(false);
        setError(null);
        try {
            let currentAvatarUrl = avatarUrl;
            if (avatarFile) {
                currentAvatarUrl = await profileService.uploadAvatar(avatarFile);
            }

            const nameColumns = nameLevelsToProfileColumns(name);
            const addressColumns = addressLevelsToProfileColumns(addressLevels.address);

            try {
                await profileService.updateProfile({
                    ...nameColumns,
                    birthday: birthday || null,
                    contact_number: contactNumber.trim(),
                    ...addressColumns,
                    avatar_url: currentAvatarUrl,
                });
            } catch (saveErr: unknown) {
                const message = (saveErr instanceof Error ? saveErr.message : String(saveErr ?? '')).toLowerCase();
                const isMissingColumn = message.includes('could not find')
                    || message.includes('schema cache')
                    || message.includes('does not exist');
                if (!isMissingColumn) throw saveErr;

                // Database has not run the by-level migration yet — save what it can hold.
                const { suffix: _suffix, ...legacyName } = nameColumns;
                await profileService.updateProfile({
                    ...legacyName,
                    birthday: birthday || null,
                    contact_number: contactNumber.trim(),
                    address: addressColumns.address,
                    avatar_url: currentAvatarUrl,
                });
            }
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

    const initials = `${name.firstName[0] ?? ''}${name.lastName[0] ?? ''}`.toUpperCase() || '?';
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

    const cardStyle: React.CSSProperties = { borderRadius: '16px' };

    /** Coordinator styling passed into the shared field components. */
    const nameChrome: FieldChrome = {
        group: 'form-field-row cols-4',
        labelStyle,
        inputStyle,
        requiredMark: ' *',
    };

    const addressChrome: FieldChrome = {
        group: 'form-field-row cols-2',
        labelStyle,
        inputStyle,
        requiredMark: ' *',
    };

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
                <div className="profile-avatar-card glass-card" style={{ ...cardStyle, padding: '2rem 1.5rem' }}>
                    {/* Big avatar */}
                    <div
                        style={{
                            width: 90, height: 90, borderRadius: '50%', flexShrink: 0,
                            background: avatarUrl ? `url(${avatarUrl}) center/cover no-repeat` : 'linear-gradient(135deg, #10b981, #059669)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '2rem', fontWeight: 700, color: '#fff',
                            boxShadow: '0 8px 24px rgba(16,185,129,0.3)', letterSpacing: '0.05em',
                            cursor: 'pointer', position: 'relative', overflow: 'hidden'
                        }}
                        onClick={() => document.getElementById('coordinator-avatar-upload')?.click()}
                        title="Click to change profile photo"
                    >
                        {!avatarUrl && initials}
                        <input
                            id="coordinator-avatar-upload"
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleAvatarChange}
                        />
                    </div>

                    <div style={{ textAlign: 'center' }} className="profile-hero-text">
                        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-bright)' }}>
                            {name.firstName && !name.firstName.includes('@')
                                ? formatFullName(name)
                                : email
                                    ? email.split('@')[0].split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
                                    : 'Coordinator'}
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
                <div className="glass-card" style={{ ...cardStyle, padding: '1.75rem 2rem' }}>
                    <h3 style={{ margin: '0 0 1.5rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-bright)' }}>Personal Information</h3>
                    <form onSubmit={handleSave}>
                        {/* Name by level — shared with Student, Adviser and Company onboarding */}
                        <div style={{ marginBottom: '1.25rem' }}>
                            <NameFieldsGroup value={name} onChange={setName} chrome={nameChrome} />
                        </div>

                        <div className="form-field-row cols-2" style={{ marginBottom: '1.25rem' }}>
                            <div>
                                <label style={labelStyle}>Birthday *</label>
                                <input
                                    style={inputStyle}
                                    type="date"
                                    value={birthday}
                                    max={getAgeCutoffDate()}
                                    onChange={e => setBirthday(e.target.value)}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Contact No. *</label>
                                <input
                                    style={inputStyle}
                                    type="tel"
                                    value={contactNumber}
                                    onChange={e => setContactNumber(e.target.value)}
                                    placeholder="e.g. 0912..."
                                />
                            </div>
                        </div>

                        {/* Address by level — shared with Student, Adviser and Company onboarding */}
                        <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <AddressLevelsSelector levels={addressLevels} chrome={addressChrome} />
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
            <div className="glass-card" style={{ border: '1px solid rgba(239,68,68,0.2)', padding: '1.5rem 2rem', borderRadius: 16 }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 700, color: '#f87171' }}>Sign Out?</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Signing out will end your current session. You'll need to log in again to access the coordinator dashboard.</p>
                <button
                    className="btn btn-secondary"
                    style={{ color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}
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
                    <div className="glass-card" style={{
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 20, padding: '2rem', width: '90%', maxWidth: 420,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
                        animation: 'fadeIn 0.2s ease',
                    }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                        </div>
                        <h3 style={{ textAlign: 'center', color: 'var(--text-primary)', margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 600 }}>Sign Out?</h3>
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 1.75rem' }}>
                            Are you sure you want to sign out of your account? You will need to log in again to access the dashboard.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={() => setShowLogoutConfirm(false)}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit', transition: 'background 0.15s' }}
                                onMouseOver={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                                onMouseOut={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
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

export default CoordinatorProfileView;
