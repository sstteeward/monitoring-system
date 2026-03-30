import React, { useEffect, useState } from 'react';
import { profileService, type Profile } from '../services/profileService';
import { supabase } from '../lib/supabaseClient';
import { FormSkeleton } from './Skeletons';
import { departmentRequestService, type DepartmentChangeRequest } from '../services/departmentRequestService';
import { adminService, type Department } from '../services/adminService';

interface Company { id: string; name: string; address?: string; }

interface ProfileViewProps {
    onProfileUpdated?: (profile: Profile) => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({ onProfileUpdated }) => {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);

    // Student-specific fields
    const [requiredHours, setRequiredHours] = useState(500);
    const [grade, setGrade] = useState('');
    const [absences, setAbsences] = useState(0);

    // Company
    const [companies, setCompanies] = useState<Company[]>([]);
    const [companyId, setCompanyId] = useState<string>('');
    const [companySearch, setCompanySearch] = useState('');
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

    // Department Change Request
    const [departments, setDepartments] = useState<Department[]>([]);
    const [activeRequest, setActiveRequest] = useState<DepartmentChangeRequest | null>(null);
    const [requestDeptId, setRequestDeptId] = useState('');
    const [requestReason, setRequestReason] = useState('');
    const [requestLoading, setRequestLoading] = useState(false);
    const [showDeptModal, setShowDeptModal] = useState(false);
    const [deptSearch, setDeptSearch] = useState('');
    const [showDeptDropdownModal, setShowDeptDropdownModal] = useState(false);

    useEffect(() => { loadProfile(); loadCompanies(); loadDepartmentInfo(); }, []);

    const loadDepartmentInfo = async () => {
        try {
            const [depts, req] = await Promise.all([
                adminService.getDepartments(),
                departmentRequestService.getMyRequest()
            ]);
            setDepartments(depts);
            setActiveRequest(req);
        } catch (err) {
            console.error("Failed to load department info:", err);
        }
    };

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
                setAvatarUrl(data.avatar_url ?? null);
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
        setError(null);
        try {
            let currentAvatarUrl = avatarUrl;
            if (avatarFile) {
                currentAvatarUrl = await profileService.uploadAvatar(avatarFile);
            }

            await profileService.updateProfile({
                first_name: firstName,
                last_name: lastName,
                required_ojt_hours: requiredHours,
                grade,
                absences,
                company_id: companyId || null,
                avatar_url: currentAvatarUrl,
            });
            setSuccess(true);
            await loadProfile();
            const updated = await profileService.getCurrentProfile();
            if (updated) {
                onProfileUpdated?.(updated);
            }
            setAvatarFile(null);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            setError(err.message ?? 'Failed to save profile.');
        } finally {
            setSaving(false);
        }
    };

    const handleRequestDeptChange = async () => {
        if (!requestDeptId) return;
        // Resolve current department ID: use department_id if available, otherwise match by name
        const currentDeptId = profile?.department_id 
            || departments.find(d => d.name.toLowerCase() === profile?.department?.toLowerCase())?.id;
        if (!currentDeptId) {
            setError('Could not determine your current department. Please contact an administrator.');
            return;
        }
        setRequestLoading(true);
        try {
            await departmentRequestService.submitRequest(currentDeptId, requestDeptId, requestReason);
            setSuccess(true);
            setShowDeptModal(false);
            setRequestDeptId('');
            setRequestReason('');
            await loadDepartmentInfo();
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            setError(err.message ?? "Failed to submit request.");
        } finally {
            setRequestLoading(false);
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
                {/* Left Side — Sidebar Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Avatar card */}
                    <div className="profile-avatar-card" style={{ ...card, marginBottom: 0 }}>
                        <div
                            style={{
                                width: 90, height: 90, borderRadius: '50%',
                                background: avatarUrl ? `url(${avatarUrl}) center/cover no-repeat` : 'linear-gradient(135deg, #10b981, #059669)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '2rem', fontWeight: 700, color: '#fff',
                                boxShadow: '0 8px 24px rgba(16,185,129,0.3)', letterSpacing: '0.05em',
                                cursor: 'pointer', position: 'relative', overflow: 'hidden'
                            }}
                            onClick={() => document.getElementById('avatar-upload')?.click()}
                            title="Click to change profile photo"
                        >
                            {!avatarUrl && initials}
                            <input
                                id="avatar-upload"
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleAvatarChange}
                            />
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

                    {/* Department Management — Integrated Sidebar Card */}
                    <div style={{ ...card, marginBottom: 0, overflow: 'hidden', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-bright)' }}>Department</h3>
                            {activeRequest?.status === 'pending' && (
                                <span style={{ 
                                    background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', 
                                    color: '#f59e0b', padding: '0.2rem 0.5rem', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' 
                                }}>
                                    Pending
                                </span>
                            )}
                        </div>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <div style={{ 
                                padding: '1rem', 
                                background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.05))', 
                                border: '1px solid rgba(16,185,129,0.2)', 
                                borderRadius: 14,
                                position: 'relative',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ 
                                        width: 28, height: 28, borderRadius: 8, 
                                        background: 'linear-gradient(135deg, #10b981, #059669)', 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                                        boxShadow: '0 4px 12px rgba(16,185,129,0.25)'
                                    }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-bright)' }}>
                                        {departments.find(d => d.id === profile?.department_id)?.name || profile?.department || 'Unassigned'}
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '2.25rem' }}>
                                    Assigned Department
                                </div>
                            </div>
                        </div>

                        {activeRequest?.status === 'pending' ? (
                            <div style={{ 
                                padding: '1rem', background: 'rgba(255,255,255,0.02)', 
                                border: '1px solid var(--border)', borderRadius: 14,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', color: '#f59e0b', fontSize: '0.78rem', fontWeight: 600 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
                                    Change Requested
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                    <span style={{ textDecoration: 'line-through', opacity: 0.4 }}>{activeRequest.current_dept?.name}</span>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                                    <span style={{ color: '#10b981', fontWeight: 700 }}>{activeRequest.requested_dept?.name}</span>
                                </div>
                            </div>
                        ) : (
                            <button 
                                className="btn btn-secondary" 
                                style={{ 
                                    width: '100%', justifyContent: 'center', 
                                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                    padding: '0.65rem', fontSize: '0.82rem', fontWeight: 600,
                                    borderRadius: 12, transition: 'all 0.2s'
                                }}
                                onClick={() => setShowDeptModal(true)}
                                onMouseOver={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                                onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
                            >
                                Request Transfer
                            </button>
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

                        <button 
                            type="submit" 
                            className="btn btn-primary" 
                            style={{ width: '100%', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            disabled={saving}
                        >
                            {saving ? 'Saving...' : 'Save Profile Changes'}
                        </button>
                    </form>
                </div>
            </div>

            {/* Department Request Modal */}
            {showDeptModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: 20, padding: '2rem', width: '90%', maxWidth: 460,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                        animation: 'fadeIn 0.2s ease',
                    }}>
                        <h3 style={{ color: 'var(--text-bright)', margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 700 }}>Request Dept Change</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '0 0 1.5rem' }}>
                            Select the department you wish to transfer to. This request requires approval.
                        </p>
                        <div style={{ marginBottom: '1.25rem', position: 'relative' }}>
                            <label style={labelStyle}>New Department</label>
                            <div 
                                style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem' }}
                                onClick={() => setShowDeptDropdownModal(!showDeptDropdownModal)}
                            >
                                <span style={{ color: requestDeptId ? 'var(--text-bright)' : 'var(--text-dim)', fontSize: '0.85rem' }}>
                                    {departments.find(d => d.id === requestDeptId)?.name || 'Select a department...'}
                                </span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, transform: showDeptDropdownModal ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>
                            </div>
                            {showDeptDropdownModal && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0,
                                    background: '#16181d', border: '1px solid var(--border)',
                                    borderRadius: 14, zIndex: 2000, maxHeight: 220, overflowY: 'auto',
                                    boxShadow: '0 12px 48px rgba(0,0,0,0.6)', marginTop: 8,
                                    animation: 'fadeIn 0.15s ease',
                                }}>
                                    {/* Search input inside dropdown */}
                                    <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: '#16181d', zIndex: 10 }}>
                                        <input
                                            autoFocus
                                            style={{ ...inputStyle, height: '32px', fontSize: '0.8rem', background: 'var(--bg-card)', marginBottom: 0 }}
                                            placeholder="Search departments..."
                                            value={deptSearch}
                                            onChange={e => setDeptSearch(e.target.value)}
                                            onClick={e => e.stopPropagation()}
                                        />
                                    </div>
                                    {departments
                                        .filter(d => d.id !== profile?.department_id && d.name.toLowerCase().includes(deptSearch.toLowerCase()))
                                        .map(d => (
                                            <div
                                                key={d.id}
                                                onClick={(e) => { e.stopPropagation(); setRequestDeptId(d.id); setShowDeptDropdownModal(false); setDeptSearch(''); }}
                                                style={{
                                                    padding: '0.75rem 1rem', cursor: 'pointer',
                                                    borderBottom: '1px solid var(--border)',
                                                    background: requestDeptId === d.id ? 'rgba(16,185,129,0.15)' : 'transparent',
                                                    transition: 'background 0.1s',
                                                    color: requestDeptId === d.id ? 'var(--text-bright)' : 'var(--text-secondary)',
                                                    fontSize: '0.85rem'
                                                }}
                                                onMouseOver={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.1)')}
                                                onMouseOut={e => (e.currentTarget.style.background = requestDeptId === d.id ? 'rgba(16,185,129,0.15)' : 'transparent')}
                                            >
                                                {d.name}
                                            </div>
                                        ))
                                    }
                                    {departments.filter(d => d.id !== profile?.department_id && d.name.toLowerCase().includes(deptSearch.toLowerCase())).length === 0 && (
                                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                                            No matching departments found.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div style={{ marginBottom: '1.75rem' }}>
                            <label style={labelStyle}>Reason / Notes <span style={{ color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                            <textarea
                                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                                value={requestReason}
                                onChange={e => setRequestReason(e.target.value)}
                                placeholder="Briefly explain why you're requesting this transfer..."
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={() => setShowDeptModal(false)}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRequestDeptChange}
                                disabled={!requestDeptId || requestLoading}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                            >
                                {requestLoading ? 'Submitting...' : 'Submit Request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Danger Zone */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: '1.5rem 2rem' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 700, color: '#f87171' }}>Danger Zone</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Signing out will end your current session. You'll need to log in again to access the dashboard.</p>
                <button
                    className="btn btn-secondary"
                    style={{ color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}
                    onClick={() => setShowLogoutConfirm(true)}
                >
                    Sign Out
                </button>
            </div>

            {/* Click outside to close company dropdown */}
            {showCompanyDropdown && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setShowCompanyDropdown(false)} />
            )}

            {/* Logout Confirmation Modal */}
            {showLogoutConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.3)',
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
                        <h3 style={{ textAlign: 'center', color: 'var(--text-primary)', margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 600 }}>Sign Out?</h3>
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 1.75rem' }}>
                            Are you sure you want to sign out of your account? You will need to log in again to access the dashboard.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={() => setShowLogoutConfirm(false)}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit', transition: 'background 0.15s' }}
                                onMouseOver={e => e.currentTarget.style.background = 'var(--bg-card)'}
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

export default ProfileView;
