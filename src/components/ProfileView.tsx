import React, { useEffect, useState } from 'react';
import { profileService, type Profile } from '../services/profileService';
import { supabase } from '../lib/supabaseClient';
import { FormSkeleton } from './Skeletons';

interface Company { id: string; name: string; address?: string; }

const ProfileView: React.FC = () => {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');

    // Student-specific fields
    const [requiredHours, setRequiredHours] = useState(500);
    const [grade, setGrade] = useState('');
    const [absences, setAbsences] = useState(0);

    // Company
    const [companies, setCompanies] = useState<Company[]>([]);
    const [companyId, setCompanyId] = useState<string>('');
    const [companySearch, setCompanySearch] = useState('');
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

    useEffect(() => { loadProfile(); loadCompanies(); }, []);

    const loadCompanies = async () => {
        const { data } = await supabase.from('companies').select('id, name, address').order('name');
        setCompanies(data ?? []);
    };

    const loadProfile = async () => {
        try {
            setLoading(true);
            const data = await profileService.getCurrentProfile();
            if (data) {
                setProfile(data);
                setFirstName(data.first_name ?? '');
                setLastName(data.last_name ?? '');
                setEmail(data.email ?? '');
                setRequiredHours(data.required_ojt_hours ?? 500);
                setGrade(data.grade ?? '');
                setAbsences(data.absences ?? 0);
                setCompanyId(data.company_id ?? '');
            }
        } catch (err) {
            console.error('Failed to load profile:', err);
        } finally {
            setLoading(false);
        }
    };

    // After companies are loaded, sync the search field
    useEffect(() => {
        if (companyId && companies.length > 0) {
            const c = companies.find(c => c.id === companyId);
            if (c) setCompanySearch(c.name);
        }
    }, [companyId, companies]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            await profileService.updateProfile({
                first_name: firstName,
                last_name: lastName,
                required_ojt_hours: requiredHours,
                grade,
                absences,
                company_id: companyId || null,
            });
            setSuccess(true);
            await loadProfile();
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            setError(err.message ?? 'Failed to save profile.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="view-container">
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '2rem' }}>
                <FormSkeleton />
            </div>
        </div>
    );

    const initials = [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase() || email?.[0]?.toUpperCase() || '?';
    const joinDate = profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
    const selectedCompany = companies.find(c => c.id === companyId);
    const filteredCompanies = companies.filter(c => c.name.toLowerCase().includes(companySearch.toLowerCase()));

    const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' };
    const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.9rem', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.88rem', fontFamily: 'Inter, sans-serif', outline: 'none' };
    const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.75rem 2rem', marginBottom: '1.25rem' };

    return (
        <div className="view-container fade-in">
            <div className="view-header">
                <div>
                    <h2 className="view-title">My Profile</h2>
                    <p className="view-subtitle">Manage your personal information and academic details</p>
                </div>
            </div>

            {/* Top row: avatar card + edit form */}
            <div className="profile-top-grid">

                {/* Left — Avatar card */}
                <div className="profile-avatar-card" style={{ ...card, marginBottom: 0 }}>
                    <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 700, color: '#fff', boxShadow: '0 8px 24px rgba(16,185,129,0.3)', letterSpacing: '0.05em' }}>
                        {initials}
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-bright)', marginBottom: '0.25rem' }}>
                            {[firstName, lastName].filter(Boolean).join(' ') || 'Your Name'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'capitalize', marginBottom: '0.5rem' }}>
                            {profile?.account_type ?? 'Student'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{email}</div>
                    </div>
                    <div style={{ width: '100%', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Member since</span>
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{joinDate}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>SIL Hours</span>
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{requiredHours}h required</span>
                        </div>
                        {selectedCompany && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Company</span>
                                <span style={{ color: '#10b981', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{selectedCompany.name}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right — Edit form */}
                <div style={{ ...card, marginBottom: 0 }}>
                    <h3 style={{ margin: '0 0 1.5rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-bright)' }}>Personal Information</h3>
                    <form onSubmit={handleSave}>
                        <div className="profile-name-grid">
                            <div>
                                <label style={labelStyle}>First Name</label>
                                <input style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
                            </div>
                            <div>
                                <label style={labelStyle}>Last Name</label>
                                <input style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={labelStyle}>Email Address</label>
                            <input style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} value={email} readOnly title="Email is managed by your account" />
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>Email is managed by your Supabase account and cannot be edited here.</p>
                        </div>

                        {/* Internship Company */}
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginBottom: '1.25rem' }}>
                            <h4 style={{ margin: '0 0 1rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-bright)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Internship Company</h4>
                            <div style={{ position: 'relative' }}>
                                <label style={labelStyle}>Company Name</label>
                                <input
                                    style={inputStyle}
                                    value={companySearch}
                                    onChange={e => { setCompanySearch(e.target.value); setShowCompanyDropdown(true); setCompanyId(''); }}
                                    onFocus={() => setShowCompanyDropdown(true)}
                                    placeholder="Search or select a company…"
                                    autoComplete="off"
                                />
                                {showCompanyDropdown && filteredCompanies.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                        borderRadius: 12, zIndex: 1000, maxHeight: 200, overflowY: 'auto',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.3)', marginTop: 4,
                                    }}>
                                        {filteredCompanies.map(c => (
                                            <div
                                                key={c.id}
                                                onClick={() => { setCompanyId(c.id); setCompanySearch(c.name); setShowCompanyDropdown(false); }}
                                                style={{
                                                    padding: '0.65rem 1rem', cursor: 'pointer',
                                                    borderBottom: '1px solid var(--border)',
                                                    background: companyId === c.id ? 'rgba(16,185,129,0.1)' : 'transparent',
                                                    transition: 'background 0.12s',
                                                }}
                                                onMouseOver={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.07)')}
                                                onMouseOut={e => (e.currentTarget.style.background = companyId === c.id ? 'rgba(16,185,129,0.1)' : 'transparent')}
                                            >
                                                <div style={{ fontWeight: 500, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{c.name}</div>
                                                {c.address && <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 2 }}>{c.address}</div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {showCompanyDropdown && filteredCompanies.length === 0 && companySearch.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                        borderRadius: 12, padding: '0.75rem 1rem', color: 'var(--text-muted)',
                                        fontSize: '0.85rem', zIndex: 1000, marginTop: 4,
                                    }}>
                                        No companies found. Ask your coordinator to add it.
                                    </div>
                                )}
                            </div>
                            {selectedCompany && (
                                <div style={{ marginTop: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontSize: '0.82rem' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    {selectedCompany.name}{selectedCompany.address ? ` — ${selectedCompany.address}` : ''}
                                </div>
                            )}
                        </div>

                        {/* Academic fields */}
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginBottom: '1.25rem' }}>
                            <h4 style={{ margin: '0 0 1rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-bright)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Academic Details</h4>
                            <div className="profile-academic-grid">
                                <div>
                                    <label style={labelStyle}>Required SIL Hours</label>
                                    <input style={inputStyle} type="number" min={0} value={requiredHours} onChange={e => setRequiredHours(Number(e.target.value))} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Grade</label>
                                    <input style={inputStyle} value={grade} onChange={e => setGrade(e.target.value)} placeholder="e.g. 1.25" />
                                </div>
                                <div>
                                    <label style={labelStyle}>Total Absences</label>
                                    <input style={inputStyle} type="number" min={0} value={absences} onChange={e => setAbsences(Number(e.target.value))} />
                                </div>
                            </div>
                        </div>

                        {/* Feedback */}
                        {success && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '0.65rem 1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                                Profile updated successfully.
                            </div>
                        )}
                        {error && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '0.65rem 1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                {error}
                            </div>
                        )}

                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </form>
                </div>
            </div>

            {/* Danger Zone */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: '1.5rem 2rem' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 700, color: '#f87171' }}>Danger Zone</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Signing out will end your current session. You'll need to log in again to access the dashboard.</p>
                <button
                    className="btn btn-secondary"
                    style={{ color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}
                    onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}
                >
                    Sign Out
                </button>
            </div>

            {/* Click outside to close company dropdown */}
            {showCompanyDropdown && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setShowCompanyDropdown(false)} />
            )}
        </div>
    );
};

export default ProfileView;
