import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTheme } from '../contexts/ThemeContext';
import { adminService } from '../services/adminService';

type AdminSettingsTab = 'system' | 'appearance' | 'layout' | 'security' | 'about';

const AdminSettingsView: React.FC<{ 
    profile: any;
    sidebarMode?: 'expanded' | 'collapsed' | 'hover';
    setSidebarMode?: (mode: 'expanded' | 'collapsed' | 'hover') => void;
}> = ({ profile, sidebarMode, setSidebarMode }) => {
    const { theme, setTheme } = useTheme();
    const isDark = theme === 'dark';
    const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

    const [activeTab, setActiveTab] = useState<AdminSettingsTab>('system');

    // System Settings State
    const [loading, setLoading] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);

    const [ojtHours, setOjtHours] = useState({ required: 300, max_daily: 8 });
    const [journalRules, setJournalRules] = useState({ deadline_days: 7 });
    const [maintenance, setMaintenance] = useState({ enabled: false, message: "" });

    // Password State
    const [changingPassword, setChangingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwSaving, setPwSaving] = useState(false);
    const [pwSuccess, setPwSuccess] = useState(false);
    const [pwError, setPwError] = useState<string | null>(null);

    const [showTerms, setShowTerms] = useState(false);
    const [showPrivacy, setShowPrivacy] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const data = await adminService.getSystemSettings();
            data.forEach(s => {
                if (s.key === 'ojt_hours') setOjtHours(s.value);
                if (s.key === 'journal_submission') setJournalRules(s.value);
                if (s.key === 'maintenance_mode') setMaintenance(s.value);
            });
        } catch (e) {
            console.error("Failed to load settings", e);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSetting = async (key: string, value: any) => {
        setSavingSettings(true);
        try {
            await adminService.updateSystemSetting(key, value);
        } catch (e) {
            alert(`Failed to save ${key}`);
        } finally {
            setSavingSettings(false);
        }
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
    const sectionTitle: React.CSSProperties = { margin: '0 0 0.35rem', fontSize: '1.05rem', fontWeight: 700, color: 'var(--admin-text-primary)' };
    const sectionSub: React.CSSProperties = { fontSize: '0.85rem', color: 'var(--admin-text-secondary)', marginBottom: '1.25rem' };
    const inputStyle: React.CSSProperties = { width: '100%', padding: '0.65rem 0.9rem', background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', borderRadius: 10, color: 'var(--admin-text-primary)', fontSize: '0.88rem', fontFamily: 'Inter, sans-serif', outline: 'none', marginBottom: '0.75rem' };

    const tabs: { key: AdminSettingsTab; label: string; icon: JSX.Element; desc: string }[] = [
        {
            key: 'system', label: 'System', desc: 'OJT rules & config',
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
        },
        {
            key: 'appearance', label: 'Appearance', desc: 'Theme & display',
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
        },
        {
            key: 'layout', label: 'Layout', desc: 'Sidebar behavior',
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
        },
        {
            key: 'security', label: 'Security', desc: 'Password & login',
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
        },
        {
            key: 'about', label: 'About', desc: 'Info & legal',
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
        },
    ];

    if (loading) return <div style={{ padding: '2rem', color: '#94a3b8' }}>Loading settings...</div>;

    return (
        <div className="fade-in">
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
                    {activeTab === 'system' && (
                        <div className="glass-card fade-in" style={card}>
                            <h3 style={sectionTitle}>System Configuration</h3>
                            <p style={sectionSub}>Manage global rules and parameters. Changes take effect immediately.</p>

                            {/* OJT Hours */}
                            <div style={{ padding: '1rem', background: 'var(--bg-elevated)', border: '1px solid var(--admin-border)', borderRadius: 12, marginBottom: '1rem' }}>
                                <h4 style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: 'var(--admin-text-primary)' }}>OJT Requirements</h4>
                                <div className="admin-settings-inner-grid">
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--admin-text-secondary)' }}>
                                        Total Required Hours
                                        <input style={{ ...inputStyle, marginTop: '0.4rem' }} type="number" value={ojtHours.required} onChange={e => setOjtHours({ ...ojtHours, required: parseInt(e.target.value) || 0 })} />
                                    </label>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--admin-text-secondary)' }}>
                                        Max Daily Hours Limit
                                        <input style={{ ...inputStyle, marginTop: '0.4rem' }} type="number" value={ojtHours.max_daily} onChange={e => setOjtHours({ ...ojtHours, max_daily: parseInt(e.target.value) || 0 })} />
                                    </label>
                                </div>
                                <button className="primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => handleSaveSetting('ojt_hours', ojtHours)} disabled={savingSettings}>Save Configuration</button>
                            </div>

                            {/* Journal Rules */}
                            <div style={{ padding: '1rem', background: 'var(--bg-elevated)', border: '1px solid var(--admin-border)', borderRadius: 12, marginBottom: '1rem' }}>
                                <h4 style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: 'var(--admin-text-primary)' }}>Journal Submissions</h4>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--admin-text-secondary)', marginBottom: '0.5rem' }}>
                                    Submission Deadline (Days after DTR)
                                    <input style={{ ...inputStyle, marginTop: '0.4rem', maxWidth: '200px', display: 'block' }} type="number" value={journalRules.deadline_days} onChange={e => setJournalRules({ ...journalRules, deadline_days: parseInt(e.target.value) || 0 })} />
                                </label>
                                <button className="primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => handleSaveSetting('journal_submission', journalRules)} disabled={savingSettings}>Save Deadlines</button>
                            </div>

                            {/* Maintenance Mode */}
                            <div style={{ padding: '1rem', background: 'rgba(244, 63, 94, 0.05)', border: '1px solid rgba(244, 63, 94, 0.2)', borderRadius: 12 }}>
                                <h4 style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#f43f5e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                                    Maintenance Mode
                                </h4>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', cursor: 'pointer' }}>
                                    <div style={{ width: '40px', height: '22px', background: maintenance.enabled ? '#f43f5e' : 'var(--border-strong)', borderRadius: '11px', position: 'relative', transition: 'all 0.2s' }}>
                                        <div style={{ width: '18px', height: '18px', background: 'white', borderRadius: '50%', position: 'absolute', top: '2px', left: maintenance.enabled ? '20px' : '2px', transition: 'all 0.2s' }} />
                                    </div>
                                    <input type="checkbox" checked={maintenance.enabled} onChange={e => setMaintenance({ ...maintenance, enabled: e.target.checked })} style={{ display: 'none' }} />
                                    <span style={{ fontSize: '0.85rem', color: 'var(--admin-text-secondary)' }}>Enable Maintenance Mode</span>
                                </label>
                                {maintenance.enabled && (
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--admin-text-secondary)' }}>
                                        Maintenance Message
                                        <input style={{ ...inputStyle, marginTop: '0.4rem' }} value={maintenance.message} onChange={e => setMaintenance({ ...maintenance, message: e.target.value })} />
                                    </label>
                                )}
                                <button className="primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: maintenance.enabled ? '#f43f5e' : 'var(--primary)' }} onClick={() => handleSaveSetting('maintenance_mode', maintenance)} disabled={savingSettings}>Update Maintenance State</button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'appearance' && (
                        <div className="glass-card fade-in" style={card}>
                            <h3 style={sectionTitle}>Appearance</h3>
                            <p style={sectionSub}>Dashboard theme.</p>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button onClick={() => !isDark && toggleTheme()} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, cursor: isDark ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.82rem', transition: 'all .25s', background: isDark ? 'rgba(16, 185, 129, 0.15)' : 'var(--admin-bg)', border: isDark ? '2px solid var(--admin-primary)' : '2px solid var(--admin-border)', color: isDark ? '#34d399' : 'var(--admin-text-secondary)' }}>
                                    Dark
                                </button>
                                <button onClick={() => isDark && toggleTheme()} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, cursor: !isDark ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.82rem', transition: 'all .25s', background: !isDark ? 'rgba(13, 148, 136, 0.15)' : 'var(--admin-bg)', border: !isDark ? '2px solid var(--admin-secondary)' : '2px solid var(--admin-border)', color: !isDark ? '#0d9488' : 'var(--admin-text-secondary)' }}>
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
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    {(['expanded', 'collapsed', 'hover'] as const).map(mode => (
                                        <button key={mode} onClick={() => setSidebarMode(mode)} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, cursor: sidebarMode === mode ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.82rem', transition: 'all .25s', background: sidebarMode === mode ? 'rgba(16, 185, 129, 0.15)' : 'var(--admin-bg)', border: sidebarMode === mode ? '2px solid var(--admin-primary)' : '2px solid var(--admin-border)', color: sidebarMode === mode ? '#34d399' : 'var(--admin-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', textTransform: 'capitalize', minWidth: '100px' }}>
                                            {mode === 'hover' ? 'Expand on hover' : mode}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ color: 'var(--admin-text-secondary)', fontSize: '0.85rem' }}>Sidebar layout settings are not available.</p>
                            )}
                        </div>
                    )}

                    {activeTab === 'security' && (
                        <div className="glass-card fade-in" style={card}>
                            <h3 style={sectionTitle}>Security</h3>
                            <p style={sectionSub}>Update super admin password.</p>
                            {pwSuccess && (
                                <div style={{ color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '0.65rem 1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                                    Password updated.
                                </div>
                            )}
                            {!changingPassword ? (
                                <button className="role-select" style={{ width: '100%' }} onClick={() => setChangingPassword(true)}>Change Password</button>
                            ) : (
                                <form onSubmit={handleChangePassword}>
                                    <input style={inputStyle} type="password" placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                                    <input style={inputStyle} type="password" placeholder="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                                    {pwError && <div style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{pwError}</div>}
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button type="submit" className="role-select" style={{ flex: 1, background: 'var(--admin-primary)', color: 'white' }} disabled={pwSaving}>{pwSaving ? '…' : 'Save'}</button>
                                        <button type="button" className="role-select" style={{ flex: 1 }} onClick={() => { setChangingPassword(false); setPwError(null); }}>Cancel</button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}

                    {activeTab === 'about' && (
                        <div className="glass-card fade-in" style={card}>
                            <h3 style={sectionTitle}>Admin Info</h3>
                            <p style={sectionSub}>Account and application details.</p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.5rem 0', borderBottom: '1px solid var(--admin-border)' }}>
                                <span style={{ color: 'var(--admin-text-secondary)' }}>Admin</span>
                                <span style={{ color: 'var(--admin-text-primary)' }}>{profile?.first_name}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.5rem 0', borderBottom: '1px solid var(--admin-border)' }}>
                                <span style={{ color: 'var(--admin-text-secondary)' }}>Status</span>
                                <span style={{ color: '#10b981', fontWeight: 600 }}>Active</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.5rem 0', borderBottom: '1px solid var(--admin-border)' }}>
                                <span style={{ color: 'var(--admin-text-secondary)' }}>Application</span>
                                <span style={{ color: 'var(--admin-text-primary)', fontWeight: 500 }}>SIL Monitoring System</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.5rem 0' }}>
                                <span style={{ color: 'var(--admin-text-secondary)' }}>Version</span>
                                <span style={{ color: 'var(--admin-text-primary)', fontWeight: 500 }}>1.0.0</span>
                            </div>

                            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--admin-border)' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--admin-text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Legal</div>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button className="role-select" onClick={() => setShowTerms(true)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Terms & Conditions</button>
                                    <button className="role-select" onClick={() => setShowPrivacy(true)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>Privacy Policy</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Legal Modals */}
            {showTerms && (
                <div className="modal-overlay fade-in" onClick={() => setShowTerms(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                    <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ background: 'var(--admin-card-bg)', padding: '2rem', borderRadius: 16, maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--admin-border)' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '1.2rem', color: 'var(--admin-text-primary)' }}>Terms & Conditions</h3>
                        <div style={{ fontSize: '0.88rem', color: 'var(--admin-text-secondary)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <p><strong>1. Acceptance of Terms</strong><br/>By accessing and using the SIL Monitoring System, you agree to be bound by these Terms and Conditions.</p>
                            <p><strong>2. User Accounts</strong><br/>You are responsible for maintaining the confidentiality of your account credentials.</p>
                            <p><strong>3. Use of Service</strong><br/>This system is strictly provided for tracking and managing SIL hours.</p>
                            <p><strong>4. Modifications</strong><br/>We reserve the right to modify these terms at any time.</p>
                        </div>
                        <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                            <button className="role-select" style={{ background: 'var(--admin-primary)', color: 'white' }} onClick={() => setShowTerms(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
            {showPrivacy && (
                <div className="modal-overlay fade-in" onClick={() => setShowPrivacy(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                    <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ background: 'var(--admin-card-bg)', padding: '2rem', borderRadius: 16, maxWidth: 500, width: '90%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--admin-border)' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '1.2rem', color: 'var(--admin-text-primary)' }}>Privacy Policy</h3>
                        <div style={{ fontSize: '0.88rem', color: 'var(--admin-text-secondary)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <p><strong>1. Data Collection</strong><br/>We collect personal information strictly to facilitate the SIL program.</p>
                            <p><strong>2. Data Usage</strong><br/>Your data is used solely for educational monitoring purposes.</p>
                            <p><strong>3. Data Protection</strong><br/>We implement robust security measures to protect your information.</p>
                            <p><strong>4. Third Parties</strong><br/>We do not share your personal data without your explicit consent.</p>
                        </div>
                        <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
                            <button className="role-select" style={{ background: 'var(--admin-primary)', color: 'white' }} onClick={() => setShowPrivacy(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminSettingsView;
