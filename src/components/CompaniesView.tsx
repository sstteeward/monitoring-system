import React, { useEffect, useState, useCallback } from 'react';
import { coordinatorService, type Company } from '../services/coordinatorService';
import type { Profile } from '../services/profileService';
import './CoordinatorDashboard.css';

type CompanyViewMode = 'list' | 'detail';

const CompaniesView: React.FC = () => {
    const [mode, setMode] = useState<CompanyViewMode>('list');
    const [companies, setCompanies] = useState<Company[]>([]);
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [companyStudents, setCompanyStudents] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);

    // New company form state
    const [newCompany, setNewCompany] = useState({
        name: '',
        address: '',
        contact_person: '',
        contact_email: '',
        industry: '',
    });
    const [formSubmitting, setFormSubmitting] = useState(false);

    useEffect(() => {
        loadCompanies();
    }, []);

    const loadCompanies = async () => {
        setLoading(true);
        try {
            const data = await coordinatorService.getAllCompanies();
            setCompanies(data);
        } catch (err) {
            console.error('Failed to load companies:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCompanyClick = async (company: Company) => {
        setSelectedCompany(company);
        setMode('detail');
        setDetailLoading(true);
        try {
            const students = await coordinatorService.getStudentsByCompany(company.id);
            setCompanyStudents(students);
        } catch (err) {
            console.error('Failed to load company students:', err);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleBack = () => {
        setMode('list');
        setSelectedCompany(null);
        setCompanyStudents([]);
    };

    const handleAddCompany = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCompany.name.trim()) return;
        setFormSubmitting(true);
        try {
            const created = await coordinatorService.createCompany({
                name: newCompany.name,
                address: newCompany.address || null,
                contact_person: newCompany.contact_person || null,
                contact_email: newCompany.contact_email || null,
                industry: newCompany.industry || null,
            });
            setCompanies(prev => [...prev, { ...created, intern_count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
            setNewCompany({ name: '', address: '', contact_person: '', contact_email: '', industry: '' });
            setShowAddForm(false);
        } catch (err) {
            console.error('Failed to create company:', err);
            alert('Error: Could not add company.');
        } finally {
            setFormSubmitting(false);
        }
    };

    const inputStyle: React.CSSProperties = {
        background: 'var(--layer-1)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '0.6rem 0.9rem',
        color: 'var(--text-bright)',
        fontSize: '0.9rem',
        width: '100%',
        outline: 'none',
    };

    // ── Detail View (company → students) ───────────────────────────────
    if (mode === 'detail' && selectedCompany) {
        return (
            <div className="view-container fade-in">
                {/* Back header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
                    <button
                        onClick={handleBack}
                        style={{ background: 'var(--layer-2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 0.9rem', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        Back to Companies
                    </button>
                    <div>
                        <h2 className="view-title" style={{ margin: 0 }}>{selectedCompany.name}</h2>
                        {selectedCompany.industry && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedCompany.industry}</span>
                        )}
                    </div>
                </div>

                {/* Company meta */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    {selectedCompany.address && (
                        <div style={{ background: 'var(--layer-2)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>📍 Address</div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-bright)' }}>{selectedCompany.address}</div>
                        </div>
                    )}
                    {selectedCompany.contact_person && (
                        <div style={{ background: 'var(--layer-2)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>👤 Contact</div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-bright)' }}>{selectedCompany.contact_person}</div>
                            {selectedCompany.contact_email && (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedCompany.contact_email}</div>
                            )}
                        </div>
                    )}
                    <div style={{ background: 'var(--layer-2)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>🎓 Total Interns</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981' }}>{companyStudents.length}</div>
                    </div>
                </div>

                {/* Students table */}
                <div style={{ background: 'var(--layer-2)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-bright)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                        Interns at {selectedCompany.name}
                    </div>
                    {detailLoading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading students…</div>
                    ) : companyStudents.length > 0 ? (
                        <table className="data-table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Required OJT Hours</th>
                                    <th>Absences</th>
                                    <th>Since</th>
                                </tr>
                            </thead>
                            <tbody>
                                {companyStudents.map(student => (
                                    <tr key={student.id}>
                                        <td style={{ fontWeight: 500, color: 'var(--text-bright)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                                    {student.first_name?.[0]?.toUpperCase() ?? '?'}
                                                </div>
                                                {student.first_name} {student.last_name}
                                            </div>
                                        </td>
                                        <td>{student.email}</td>
                                        <td>{student.required_ojt_hours}h</td>
                                        <td>
                                            <span style={{ color: student.absences > 3 ? '#ef4444' : 'inherit', fontWeight: student.absences > 3 ? 700 : 'normal' }}>
                                                {student.absences}
                                            </span>
                                        </td>
                                        <td>{new Date(student.created_at).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 1rem', display: 'block', opacity: 0.3 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                            <p>No students assigned to this company yet.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── List View (all companies) ──────────────────────────────────────
    return (
        <div className="view-container fade-in">
            <div className="view-header">
                <div>
                    <h2 className="view-title">OJT Companies</h2>
                    <p className="view-subtitle">Manage partner companies and view assigned interns</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowAddForm(v => !v)}>
                    {showAddForm ? 'Cancel' : '+ Add Company'}
                </button>
            </div>

            {/* Add Company Form */}
            {showAddForm && (
                <div style={{ background: 'var(--layer-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
                    <h3 style={{ marginBottom: '1.25rem', color: 'var(--text-bright)', fontSize: '1rem', fontWeight: 600 }}>New Company Details</h3>
                    <form onSubmit={handleAddCompany}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Company Name *</label>
                                <input style={inputStyle} value={newCompany.name} onChange={e => setNewCompany(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Tech Solutions Inc." required />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Industry</label>
                                <input style={inputStyle} value={newCompany.industry} onChange={e => setNewCompany(p => ({ ...p, industry: e.target.value }))} placeholder="e.g. Information Technology" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Address</label>
                                <input style={inputStyle} value={newCompany.address} onChange={e => setNewCompany(p => ({ ...p, address: e.target.value }))} placeholder="e.g. Dumaguete City" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Contact Person</label>
                                <input style={inputStyle} value={newCompany.contact_person} onChange={e => setNewCompany(p => ({ ...p, contact_person: e.target.value }))} placeholder="e.g. Juan dela Cruz" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Contact Email</label>
                                <input type="email" style={inputStyle} value={newCompany.contact_email} onChange={e => setNewCompany(p => ({ ...p, contact_email: e.target.value }))} placeholder="contact@company.com" />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="submit" className="btn btn-primary" disabled={formSubmitting}>
                                {formSubmitting ? 'Saving…' : 'Save Company'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading companies…</div>
            ) : companies.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
                    {companies.map(company => (
                        <div
                            key={company.id}
                            onClick={() => handleCompanyClick(company)}
                            style={{ background: 'var(--layer-2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '1.5rem', cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative', overflow: 'hidden' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)'; (e.currentTarget as HTMLElement).style.borderColor = '#7c3aed'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                        >
                            {/* Decoration */}
                            <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, borderRadius: '0 14px 0 80px', background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(79,70,229,0.05))' }} />

                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                                <div style={{ width: 42, height: 42, borderRadius: '10px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h3 style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-bright)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{company.name}</h3>
                                    {company.industry && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>{company.industry}</p>}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                {company.address && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                        {company.address}
                                    </span>
                                )}
                                {company.contact_person && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                        {company.contact_person}
                                    </span>
                                )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: company.intern_count ? '#10b981' : 'var(--text-muted)' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                    {company.intern_count ?? 0} Intern{(company.intern_count ?? 0) !== 1 ? 's' : ''}
                                </span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    View Students
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 1rem', display: 'block', opacity: 0.3 }}><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                    <p style={{ fontWeight: 500, color: 'var(--text-bright)', marginBottom: '0.5rem' }}>No Companies Yet</p>
                    <p style={{ fontSize: '0.9rem' }}>Click "Add Company" to register your first OJT partner.</p>
                </div>
            )}
        </div>
    );
};

export default CompaniesView;
