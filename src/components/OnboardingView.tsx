import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { adminService } from '../services/adminService';
import type { Profile } from '../services/profileService';
import CustomSelect from './CustomSelect';

interface Company { id: string; name: string; address?: string; }

interface OnboardingViewProps {
    profile: Profile;
    onComplete: () => void;
}

const OnboardingView: React.FC<OnboardingViewProps> = ({ profile, onComplete }) => {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState('');
    const [search, setSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [firstName, setFirstName] = useState(profile.first_name ?? '');
    const [lastName, setLastName] = useState(profile.last_name ?? '');
    const [birthday, setBirthday] = useState(profile.birthday ?? '');
    const [address, setAddress] = useState(profile.address ?? '');
    const [contactNumber, setContactNumber] = useState(profile.contact_number ?? '');
    const [yearLevel, setYearLevel] = useState(profile.year_level ?? '');
    const [section, setSection] = useState(profile.section ?? '');
    const [course, setCourse] = useState(profile.course ?? '');
    const [department, setDepartment] = useState(profile.department ?? '');
    const [requiredHours, setRequiredHours] = useState(profile.required_ojt_hours ?? 400);
    const [saving, setSaving] = useState(false);
    const [requestingCompany, setRequestingCompany] = useState(false);
    const [requestSent, setRequestSent] = useState(false);
    const [requestedName, setRequestedName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<1 | 2>(1);
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
    const [courses, setCourses] = useState<{ id: string; name: string; description?: string }[]>([]);

    useEffect(() => {
        supabase.from('companies').select('id, name, address').order('name').then(({ data }) => {
            setCompanies(data ?? []);
        });
        adminService.getDepartments().then(setDepartments);
        adminService.getCourses().then(setCourses);
    }, []);

    const filtered = companies.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    const selectedCompany = companies.find(c => c.id === selectedCompanyId);

    const handleSelectCompany = (c: Company) => {
        setSelectedCompanyId(c.id);
        setSearch(c.name);
        setShowDropdown(false);
    };

    const handleRequestCompany = async () => {
        const name = search.trim();
        if (!name) return;
        setRequestingCompany(true);
        setError(null);
        try {
            const { error: err } = await supabase
                .from('company_requests')
                .insert({
                    name,
                    student_name: `${firstName} ${lastName}`.trim() || null,
                    status: 'pending',
                });
            if (err) throw err;
            setRequestedName(name);
            setRequestSent(true);
            setShowDropdown(false);
        } catch (err: any) {
            setError(err.message ?? 'Failed to submit request.');
        } finally {
            setRequestingCompany(false);
        }
    };


    const handleNext = (e: React.FormEvent) => {
        e.preventDefault();
        if (!firstName.trim() || !lastName.trim()) {
            setError('Please enter your full name.');
            return;
        }
        if (!birthday || !address.trim() || !contactNumber.trim() || !yearLevel.trim() || !section.trim() || !course.trim() || !department.trim()) {
            setError('Please fill in all required fields.');
            return;
        }
        setError(null);
        setStep(2);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCompanyId && !requestSent) {
            setError('Please select your internship company or request a new one.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const authId = (await supabase.auth.getUser()).data.user?.id;
            const { error: err } = await supabase
                .from('profiles')
                .update({
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    birthday: birthday || null,
                    address: address.trim() || null,
                    contact_number: contactNumber.trim() || null,
                    year_level: yearLevel.trim() || null,
                    section: section.trim() || null,
                    course: course.trim() || null,
                    department: department.trim() || null,
                    ...(selectedCompanyId ? { company_id: selectedCompanyId } : {}),
                    required_ojt_hours: requiredHours,
                })
                .eq('auth_user_id', authId);

            if (err) throw err;
            onComplete();
        } catch (err: any) {
            setError(err.message ?? 'Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            width: '100%',
            background: 'var(--bg-page)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem 1rem',
        }}>
            <div style={{ width: '100%', maxWidth: 520 }}>

                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div style={{
                        width: 60, height: 60, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        boxShadow: '0 8px 32px rgba(16,185,129,0.35)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1rem',
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                    </div>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-bright)', margin: 0 }}>
                        Welcome to SIL Monitoring
                    </h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.4rem', fontSize: '0.9rem' }}>
                        {step === 1 ? "Let's confirm your name before we get started." : "Where are you doing your internship?"}
                    </p>
                </div>

                {/* Progress dots */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
                    {[1, 2].map(s => (
                        <div key={s} style={{
                            width: s === step ? 28 : 10,
                            height: 10, borderRadius: 10,
                            background: s <= step ? '#10b981' : 'var(--bg-elevated)',
                            transition: 'width 0.3s, background 0.3s',
                        }} />
                    ))}
                </div>

                {/* Card */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 20,
                    padding: '2rem',
                    boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
                }}>
                    {error && (
                        <div style={{
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                            borderRadius: 10, padding: '0.7rem 1rem', marginBottom: '1.25rem',
                            color: '#f87171', fontSize: '0.85rem',
                        }}>{error}</div>
                    )}

                    {/* ── Step 1: Personal Info ── */}
                    {step === 1 && (
                        <form onSubmit={handleNext}>
                            <div style={{ marginBottom: '1.25rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                                    <div>
                                        <label style={labelSt}>First Name *</label>
                                        <input style={inputSt} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Juan" required />
                                    </div>
                                    <div>
                                        <label style={labelSt}>Last Name *</label>
                                        <input style={inputSt} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="dela Cruz" required />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                                    <div>
                                        <label style={labelSt}>Birthday *</label>
                                        <input style={inputSt} type="date" value={birthday} onChange={e => setBirthday(e.target.value)} required />
                                    </div>
                                    <div>
                                        <label style={labelSt}>Contact Number *</label>
                                        <input style={inputSt} type="tel" value={contactNumber} onChange={e => setContactNumber(e.target.value)} placeholder="e.g. 09123456789" required />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '1.25rem' }}>
                                    <label style={labelSt}>Complete Address *</label>
                                    <input style={inputSt} value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, Brgy, City, Province" required />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                                    <div>
                                        <label style={labelSt}>Course *</label>
                                        <CustomSelect
                                            value={course}
                                            onChange={setCourse}
                                            placeholder="Select Course"
                                            options={courses.map(c => ({
                                                value: c.description || c.name,
                                                label: c.description ? `${c.description} — ${c.name}` : c.name,
                                            }))}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelSt}>Department *</label>
                                        <CustomSelect
                                            value={department}
                                            onChange={setDepartment}
                                            placeholder="Select Department"
                                            options={departments.map(d => ({ value: d.name, label: d.name }))}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                                    <div>
                                        <label style={labelSt}>Year Level *</label>
                                        <CustomSelect
                                            value={yearLevel}
                                            onChange={setYearLevel}
                                            placeholder="Select Year"
                                            options={[
                                                { value: '1st Year', label: '1st Year' },
                                                { value: '2nd Year', label: '2nd Year' },
                                                { value: '3rd Year', label: '3rd Year' },
                                                { value: '4th Year', label: '4th Year' },
                                            ]}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelSt}>Section *</label>
                                        <input style={inputSt} value={section} onChange={e => setSection(e.target.value)} placeholder="e.g. A" required />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '0.5rem' }}>
                                    <label style={labelSt}>Required SIL Hours</label>
                                    <input style={inputSt} type="number" min={0} value={requiredHours}
                                        onChange={e => setRequiredHours(Number(e.target.value))} />
                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                                    </p>
                                </div>
                            </div>
                            <button type="submit" style={btnPrimary}>
                                Continue →
                            </button>
                        </form>
                    )}

                    {/* ── Step 2: Company ── */}
                    {step === 2 && (
                        <form onSubmit={handleSubmit}>
                            <div style={{ marginBottom: showDropdown ? '14rem' : '1.5rem', position: 'relative', transition: 'margin-bottom 0.2s' }}>
                                <label style={labelSt}>Internship Company</label>
                                <input
                                    style={inputSt}
                                    value={search}
                                    onChange={e => { setSearch(e.target.value); setShowDropdown(true); setSelectedCompanyId(''); }}
                                    onFocus={() => setShowDropdown(true)}
                                    placeholder="Search or select a company…"
                                    autoComplete="off"
                                />
                                {/* Dropdown */}
                                {showDropdown && filtered.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                        borderRadius: 12, zIndex: 100, maxHeight: 220, overflowY: 'auto',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)', marginTop: 4,
                                    }}>
                                        {filtered.map(c => (
                                            <div
                                                key={c.id}
                                                onClick={() => handleSelectCompany(c)}
                                                style={{
                                                    padding: '0.75rem 1rem', cursor: 'pointer',
                                                    borderBottom: '1px solid var(--border)',
                                                    transition: 'background 0.12s',
                                                    background: selectedCompanyId === c.id ? 'rgba(16,185,129,0.1)' : 'transparent',
                                                }}
                                                onMouseOver={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.08)')}
                                                onMouseOut={e => (e.currentTarget.style.background = selectedCompanyId === c.id ? 'rgba(16,185,129,0.1)' : 'transparent')}
                                            >
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-bright)' }}>{c.name}</div>
                                                {c.address && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{c.address}</div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {showDropdown && filtered.length === 0 && search.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                        borderRadius: 12, zIndex: 100, marginTop: 4,
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden',
                                    }}>
                                        <div style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                                            No companies match &ldquo;{search}&rdquo;
                                        </div>
                                        <button
                                            type="button"
                                            disabled={requestingCompany}
                                            onClick={handleRequestCompany}
                                            style={{
                                                width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
                                                padding: '0.75rem 1rem', background: 'transparent', border: 'none',
                                                cursor: requestingCompany ? 'not-allowed' : 'pointer',
                                                color: '#10b981', fontSize: '0.88rem', fontWeight: 600,
                                                fontFamily: 'Inter, sans-serif', textAlign: 'left',
                                            }}
                                            onMouseOver={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.08)')}
                                            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            {requestingCompany ? (
                                                <span style={{ opacity: 0.7 }}>Submitting request…</span>
                                            ) : (
                                                <>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                                    Request &ldquo;{search}&rdquo; — notify coordinator
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Request sent success banner */}
                            {requestSent && (
                                <div style={{
                                    background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                                    borderRadius: 12, padding: '0.9rem 1rem', marginBottom: '1.25rem',
                                    display: 'flex', alignItems: 'flex-start', gap: '0.65rem',
                                }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><polyline points="20 6 9 17 4 12" /></svg>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#10b981' }}>Request sent!</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                            Your coordinator has been notified to add <strong style={{ color: 'var(--text-bright)' }}>{requestedName}</strong>. You can proceed to the dashboard now.
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedCompany && !requestSent && (
                                <div style={{
                                    background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
                                    borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '1.25rem',
                                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                                }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span style={{ fontSize: '0.88rem', color: '#10b981', fontWeight: 600 }}>
                                        {selectedCompany.name}
                                    </span>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    style={{ ...btnPrimary, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', flex: '0 0 auto', width: 'auto', padding: '0.75rem 1.25rem' }}
                                >
                                    ← Back
                                </button>
                                <button type="submit" style={{ ...btnPrimary, flex: 1 }} disabled={saving || (!selectedCompanyId && !requestSent)}>
                                    {saving ? 'Saving…' : 'Go to Dashboard →'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '1.5rem' }}>
                    You can update this later from your Profile page.
                </p>
            </div>

            {/* Click outside to close dropdown */}
            {showDropdown && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setShowDropdown(false)} />
            )}
        </div>
    );
};


// Shared micro-styles
const labelSt: React.CSSProperties = {
    display: 'block', fontSize: '0.78rem', fontWeight: 600,
    color: 'var(--text-muted)', marginBottom: '0.4rem',
    textTransform: 'uppercase', letterSpacing: '0.05em',
};
const inputSt: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '0.7rem 0.9rem',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 10, color: 'var(--text-primary)',
    fontSize: '0.9rem', fontFamily: 'Inter, sans-serif', outline: 'none',
};
const btnPrimary: React.CSSProperties = {
    width: '100%', padding: '0.85rem 1.5rem',
    background: 'linear-gradient(135deg, #10b981, #059669)',
    border: 'none', borderRadius: 12,
    color: '#fff', fontWeight: 700, fontSize: '0.95rem',
    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
    boxShadow: '0 4px 16px rgba(16,185,129,0.35)',
    transition: 'opacity 0.15s',
};

export default OnboardingView;
