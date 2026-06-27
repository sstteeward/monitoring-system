import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTheme } from '../contexts/ThemeContext';

interface SettingsViewProps {
    sidebarMode?: 'expanded' | 'collapsed' | 'hover';
    setSidebarMode?: (mode: 'expanded' | 'collapsed' | 'hover') => void;
}

type SettingsTab = 'appearance' | 'layout' | 'notifications' | 'security' | 'about';

const SettingsView: React.FC<SettingsViewProps> = ({ sidebarMode, setSidebarMode }) => {
    const { theme, setTheme } = useTheme();
    const isDark = theme === 'dark';
    const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

    const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

    const [emailNotifications, setEmailNotifications] = useState(true);
    const [browserNotifications, setBrowserNotifications] = useState(false);
    const [notifSaved, setNotifSaved] = useState(false);

    const [changingPassword, setChangingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwSaving, setPwSaving] = useState(false);
    const [pwSuccess, setPwSuccess] = useState(false);
    const [pwError, setPwError] = useState<string | null>(null);

    const [showTerms, setShowTerms] = useState(false);
    const [showPrivacy, setShowPrivacy] = useState(false);

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

    const card: React.CSSProperties = { padding: '1.75rem 2rem', marginBottom: '1.25rem' };
    const sectionTitle: React.CSSProperties = { margin: '0 0 0.35rem', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-bright)' };
    const sectionSub: React.CSSProperties = { fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.25rem' };
    const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border)', marginTop: '1rem' };
    const inputStyle: React.CSSProperties = { width: '100%', padding: '0.65rem 0.9rem', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.88rem', fontFamily: 'Inter, sans-serif', outline: 'none', marginBottom: '0.75rem' };

    const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
        <div onClick={onChange} style={{ width: 44, height: 24, borderRadius: 12, background: checked ? '#10b981' : 'var(--border-strong)', cursor: 'pointer', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 3, left: checked ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
        </div>
    );

    const tabs: { key: SettingsTab; label: string; icon: JSX.Element; desc: string }[] = [
        {
            key: 'appearance', label: 'Appearance', desc: 'Theme & display',
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
        },
        {
            key: 'layout', label: 'Layout', desc: 'Sidebar behavior',
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
        },
        {
            key: 'notifications', label: 'Notifications', desc: 'Alerts & emails',
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        },
        {
            key: 'security', label: 'Security', desc: 'Password & login',
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
        },
        {
            key: 'about', label: 'About', desc: 'App info & legal',
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
        },
    ];

    return (
        <div className="view-container fade-in">
            <div className="view-header">
                <div>
                    <h2 className="view-title">Settings</h2>
                    <p className="view-subtitle">Customize your account preferences</p>
                </div>
            </div>

            <div className="settings-layout">
                {/* ── Sidebar Tabs ── */}
                <div className="settings-sidebar">
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            className={`settings-tab${activeTab === tab.key ? ' active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            <div className="settings-tab-icon">{tab.icon}</div>
                            <div className="settings-tab-text">
                                <div className="settings-tab-label">{tab.label}</div>
                                <div className="settings-tab-desc">{tab.desc}</div>
                            </div>
                        </button>
                    ))}
                </div>

                {/* ── Content Panel ── */}
                <div className="settings-content">
                    {activeTab === 'appearance' && (
                        <div className="glass-card fade-in" style={card}>
                            <h3 style={sectionTitle}>Appearance</h3>
                            <p style={sectionSub}>Choose your preferred dashboard theme.</p>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button onClick={() => !isDark && toggleTheme()} style={{ flex: 1, padding: '1.1rem 1rem', borderRadius: 14, cursor: isDark ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.88rem', transition: 'all .25s', background: isDark ? 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(13,148,136,0.1))' : 'var(--bg-elevated)', border: isDark ? '2px solid var(--primary)' : '2px solid var(--border)', color: isDark ? '#34d399' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', boxShadow: isDark ? '0 0 0 4px rgba(16,185,129,0.12)' : 'none' }}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                                    Dark
                                </button>
                                <button onClick={() => isDark && toggleTheme()} style={{ flex: 1, padding: '1.1rem 1rem', borderRadius: 14, cursor: !isDark ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.88rem', transition: 'all .25s', background: !isDark ? 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(251,191,36,0.08))' : 'var(--bg-elevated)', border: !isDark ? '2px solid #f59e0b' : '2px solid var(--border)', color: !isDark ? '#f59e0b' : 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', boxShadow: !isDark ? '0 0 0 4px rgba(245,158,11,0.12)' : 'none' }}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                                    Light
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'layout' && (
                        <div className="glass-card fade-in" style={card}>
                            <h3 style={sectionTitle}>Sidebar Layout</h3>
                            <p style={sectionSub}>Choose how the sidebar behaves.</p>
                            {sidebarMode && setSidebarMode ? (
                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                    {(['expanded', 'collapsed', 'hover'] as const).map(mode => (
                                        <button key={mode} onClick={() => setSidebarMode(mode)} style={{ flex: 1, padding: '1.1rem 1rem', borderRadius: 14, cursor: sidebarMode === mode ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.88rem', transition: 'all .25s', background: sidebarMode === mode ? 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(13,148,136,0.1))' : 'var(--bg-elevated)', border: sidebarMode === mode ? '2px solid var(--primary)' : '2px solid var(--border)', color: sidebarMode === mode ? '#34d399' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', boxShadow: sidebarMode === mode ? '0 0 0 4px rgba(16,185,129,0.12)' : 'none', textTransform: 'capitalize', minWidth: '120px' }}>
                                            {mode === 'hover' ? 'Expand on hover' : mode}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sidebar layout settings are not available.</p>
                            )}
                        </div>
                    )}

                    {activeTab === 'notifications' && (
                        <div className="glass-card fade-in" style={card}>
                            <h3 style={sectionTitle}>Notifications</h3>
                            <p style={sectionSub}>Control how you receive updates.</p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-bright)', marginBottom: '0.2rem' }}>Email Notifications</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Receive weekly summaries of your SIL hours.</div>
                                </div>
                                <Toggle checked={emailNotifications} onChange={() => setEmailNotifications(v => !v)} />
                            </div>
                            <div style={row}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-bright)', marginBottom: '0.2rem' }}>Browser Alerts</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Get desktop alerts when you forget to clock out.</div>
                                </div>
                                <Toggle checked={browserNotifications} onChange={() => setBrowserNotifications(v => !v)} />
                            </div>
                            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary" onClick={handleSaveNotifications}>
                                    {notifSaved ? '✓ Saved' : 'Save Preferences'}
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'security' && (
                        <div className="glass-card fade-in" style={card}>
                            <h3 style={sectionTitle}>Security</h3>
                            <p style={sectionSub}>Manage your login credentials.</p>
                            {pwSuccess && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '0.65rem 1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                                    Password updated successfully.
                                </div>
                            )}
                            {!changingPassword ? (
                                <button className="btn btn-secondary" onClick={() => setChangingPassword(true)}>Change Password</button>
                            ) : (
                                <form onSubmit={handleChangePassword}>
                                    <input style={inputStyle} type="password" placeholder="New password (min. 8 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                                    <input style={inputStyle} type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                                    {pwError && <div style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{pwError}</div>}
                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        <button type="submit" className="btn btn-primary" disabled={pwSaving}>{pwSaving ? 'Updating…' : 'Update Password'}</button>
                                        <button type="button" className="btn btn-secondary" onClick={() => { setChangingPassword(false); setPwError(null); setNewPassword(''); setConfirmPassword(''); }}>Cancel</button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}

                    {activeTab === 'about' && (
                        <div className="glass-card fade-in" style={card}>
                            <h3 style={sectionTitle}>About</h3>
                            <p style={sectionSub}>Application information.</p>
                            {[
                                ['Application', 'SIL Monitoring System'],
                                ['Version', '1.0.0'],
                                ['Institution', 'Asian College Dumaguete'],
                                ['Account Type', 'Student'],
                            ].map(([label, value]) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                                    <span style={{ color: 'var(--text-bright)', fontWeight: 500 }}>{value}</span>
                                </div>
                            ))}
                            <div style={{ marginTop: '1.25rem' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Socials</div>
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
                            <div style={{ marginTop: '1.25rem' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Legal</div>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button className="btn btn-secondary" onClick={() => setShowTerms(true)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Terms & Conditions</button>
                                    <button className="btn btn-secondary" onClick={() => setShowPrivacy(true)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Privacy Policy</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showTerms && (
                <div className="modal-overlay fade-in" onClick={() => setShowTerms(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                    <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: 16, maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '1.2rem', color: 'var(--text-bright)' }}>Terms & Conditions</h3>
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <p><strong>1. Acceptance of Terms</strong><br/>By accessing and using the SIL Monitoring System, you agree to be bound by these Terms and Conditions.</p>
                            <p><strong>2. User Accounts</strong><br/>You are responsible for maintaining the confidentiality of your account credentials.</p>
                            <p><strong>3. Use of Service</strong><br/>This system is strictly provided for tracking and managing Student Internship Learning (SIL) hours.</p>
                            <p><strong>4. Modifications</strong><br/>We reserve the right to modify these terms at any time.</p>
                        </div>
                        <div style={{ marginTop: '1.5rem', textAlign: 'right' }}><button className="btn btn-primary" onClick={() => setShowTerms(false)}>Close</button></div>
                    </div>
                </div>
            )}
            {showPrivacy && (
                <div className="modal-overlay fade-in" onClick={() => setShowPrivacy(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                    <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: 16, maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '1.2rem', color: 'var(--text-bright)' }}>Privacy Policy</h3>
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <p><strong>1. Data Collection</strong><br/>We collect personal information strictly to facilitate the SIL program.</p>
                            <p><strong>2. Data Usage</strong><br/>Your data is used solely for educational monitoring purposes.</p>
                            <p><strong>3. Data Protection</strong><br/>We implement robust security measures to protect your information.</p>
                            <p><strong>4. Third Parties</strong><br/>We do not share your personal data without your explicit consent.</p>
                        </div>
                        <div style={{ marginTop: '1.5rem', textAlign: 'right' }}><button className="btn btn-primary" onClick={() => setShowPrivacy(false)}>Close</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsView;
