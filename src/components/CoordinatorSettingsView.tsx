import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface CoordinatorSettingsViewProps {
    // Pass the current theme state from the dashboard so it can be toggled
    isDark: boolean;
    onToggleTheme: () => void;
}

const CoordinatorSettingsView: React.FC<CoordinatorSettingsViewProps> = ({ isDark, onToggleTheme }) => {
    const [changingPassword, setChangingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwSaving, setPwSaving] = useState(false);
    const [pwSuccess, setPwSuccess] = useState(false);
    const [pwError, setPwError] = useState<string | null>(null);

    const [passkeyLoading, setPasskeyLoading] = useState(false);
    const [passkeySuccess, setPasskeySuccess] = useState(false);
    const [passkeyError, setPasskeyError] = useState<string | null>(null);

    const [emailNotifications, setEmailNotifications] = useState(true);
    const [browserNotifications, setBrowserNotifications] = useState(false);
    const [notifSaved, setNotifSaved] = useState(false);

    const handleSaveNotifications = () => {
        setNotifSaved(true);
        setTimeout(() => setNotifSaved(false), 2500);
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPwError(null);
        if (newPassword.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
        if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return; }
        setPwSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            setPwSuccess(true);
            setNewPassword('');
            setConfirmPassword('');
            setChangingPassword(false);
            setTimeout(() => setPwSuccess(false), 3000);
        } catch (err: any) {
            setPwError(err.message ?? 'Failed to update password.');
        } finally {
            setPwSaving(false);
        }
    };

    const handleRegisterPasskey = async () => {
        setPasskeyError(null);
        setPasskeySuccess(false);
        setPasskeyLoading(true);
        try {
            const { error } = await supabase.auth.mfa.webauthn.register({
                friendlyName: 'Face ID / Touch ID'
            });
            if (error) throw error;

            setPasskeySuccess(true);
            setTimeout(() => setPasskeySuccess(false), 3000);
        } catch (err: any) {
            setPasskeyError(err.message ?? 'Failed to register passkey.');
        } finally {
            setPasskeyLoading(false);
        }
    };

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
    };

    const card: React.CSSProperties = {
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '1.5rem 2rem',
    };

    const sectionTitle: React.CSSProperties = {
        fontSize: '0.88rem',
        fontWeight: 700,
        color: 'var(--text-bright)',
        margin: '0 0 0.35rem',
    };

    const sectionSub: React.CSSProperties = {
        fontSize: '0.78rem',
        color: 'var(--text-muted)',
        margin: '0 0 1.25rem',
    };

    return (
        <div className="view-container fade-in">
            <div className="view-header">
                <div>
                    <h2 className="view-title">Settings</h2>
                    <p className="view-subtitle">Customize your coordinator account preferences</p>
                </div>
            </div>

            {/* ── Appearance ── */}
            <div style={card}>
                <h3 style={sectionTitle}>Appearance</h3>
                <p style={sectionSub}>Choose your preferred dashboard theme.</p>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    {(['dark', 'light'] as const).map(theme => {
                        const active = theme === 'dark' ? isDark : !isDark;
                        return (
                            <button
                                key={theme}
                                onClick={onToggleTheme}
                                style={{
                                    flex: 1,
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    border: active ? '2px solid #10b981' : '2px solid var(--border)',
                                    background: active ? 'rgba(16,185,129,0.07)' : 'var(--bg-elevated)',
                                    cursor: 'pointer',
                                    fontFamily: 'Inter, sans-serif',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                }}
                            >
                                <span style={{ fontSize: '1.5rem' }}>{theme === 'dark' ? '🌙' : '☀️'}</span>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-bright)', textTransform: 'capitalize' }}>{theme} Mode</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{theme === 'dark' ? 'Easy on the eyes' : 'Classic bright view'}</div>
                                </div>
                                {active && (
                                    <span style={{ marginLeft: 'auto', color: '#10b981' }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Notifications ── */}
            <div style={card}>
                <h3 style={sectionTitle}>Notifications</h3>
                <p style={sectionSub}>Control when and how you are notified.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    {[
                        { label: 'Email Notifications', sub: 'Receive document approval alerts via email', value: emailNotifications, set: setEmailNotifications },
                        { label: 'Browser Notifications', sub: 'Show push notifications in your browser', value: browserNotifications, set: setBrowserNotifications },
                    ].map(item => (
                        <label key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--bg-elevated)', borderRadius: '10px', border: '1px solid var(--border)', cursor: 'pointer' }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-bright)' }}>{item.label}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{item.sub}</div>
                            </div>
                            {/* Toggle */}
                            <div
                                onClick={() => item.set(!item.value)}
                                style={{ width: 44, height: 24, borderRadius: 12, background: item.value ? '#10b981' : 'var(--border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer' }}
                            >
                                <div style={{ position: 'absolute', top: 3, left: item.value ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
                            </div>
                        </label>
                    ))}
                </div>
                {notifSaved && <div style={{ fontSize: '0.82rem', color: '#10b981' }}>✓ Notification preferences saved.</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={handleSaveNotifications}>Save Preferences</button>
                </div>
            </div>

            {/* ── Security ── */}
            <div style={card}>
                <h3 style={sectionTitle}>Security</h3>
                <p style={sectionSub}>Manage your password and account security.</p>
                {pwSuccess && (
                    <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px', padding: '0.7rem 1rem', marginBottom: '1rem', color: '#10b981', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        Password updated successfully!
                    </div>
                )}
                {!changingPassword ? (
                    <button className="btn btn-secondary" onClick={() => setChangingPassword(true)}>
                        Change Password
                    </button>
                ) : (
                    <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>New Password</label>
                            <input type="password" style={inputStyle} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" required />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Confirm Password</label>
                            <input type="password" style={inputStyle} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" required />
                        </div>
                        {pwError && <div style={{ color: '#f87171', fontSize: '0.82rem' }}>{pwError}</div>}
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => { setChangingPassword(false); setPwError(null); setNewPassword(''); setConfirmPassword(''); }}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={pwSaving} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', minWidth: '130px' }}>
                                {pwSaving ? 'Saving…' : 'Update Password'}
                            </button>
                        </div>
                    </form>
                )}

                {/* Biometric Login (Passkey) - HIDDEN UNTIL SUPABASE CLOUD ENABLES WEBAUTHN NATIVELY */}
                {/*
                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-bright)', marginBottom: '0.35rem' }}>Biometric Login (Passkey)</h4>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Use Face ID, Touch ID, or Windows Hello to sign in without a password.</p>

                    {passkeySuccess && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '0.65rem 1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                            Passkey registered successfully!
                        </div>
                    )}
                    {passkeyError && <div style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{passkeyError}</div>}

                    <button className="btn btn-secondary" onClick={handleRegisterPasskey} disabled={passkeyLoading}>
                        {passkeyLoading ? 'Waiting for prompt…' : 'Register Face ID / Touch ID'}
                    </button>
                </div>
                */}
            </div>

            {/* ── About ── */}
            <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                        <h3 style={{ ...sectionTitle, marginBottom: '0.2rem' }}>SIL Monitoring System</h3>
                        <p style={{ ...sectionSub, marginBottom: 0 }}>Asian College Dumaguete — Coordinator Portal</p>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '0.3rem 0.8rem', borderRadius: '99px', border: '1px solid var(--border)' }}>
                        v1.0.0
                    </span>
                </div>

                {/* Socials Section */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Socials</div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <a href="https://web.facebook.com/AsianCollegeDumaguete/" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
                            Facebook
                        </a>
                        <a href="https://www.asiancollege.edu.ph/" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#10b981', textDecoration: 'none', fontWeight: 500 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                            Website
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CoordinatorSettingsView;
