import React, { useEffect, useState } from 'react';
import { coordinatorService, type Company, type CompanyRequest } from '../services/coordinatorService';
import { CardGridSkeleton, TableSkeleton } from './Skeletons';
import type { Profile } from '../services/profileService';
import UserClickableName from './UserClickableName';
import './CoordinatorDashboard.css';

type CompanyViewMode = 'list' | 'detail';

const CompaniesView: React.FC = () => {
    const [mode, setMode] = useState<CompanyViewMode>('list');
    const [companies, setCompanies] = useState<Company[]>([]);
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [companyStudents, setCompanyStudents] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [pendingRequests, setPendingRequests] = useState<CompanyRequest[]>([]);
    const [requestActionId, setRequestActionId] = useState<string | null>(null);
    const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // Edit company form state
    const [isEditingCompany, setIsEditingCompany] = useState(false);
    const [updateSubmitting, setUpdateSubmitting] = useState(false);
    const [editCompanyForm, setEditCompanyForm] = useState({
        name: '',
        address: '',
        contact_person: '',
        contact_email: '',
        industry: '',
        department_id: '',
        latitude: '',
        longitude: '',
        geofence_radius: '100',
    });

    // New company form state
    const [newCompany, setNewCompany] = useState({
        name: '',
        address: '',
        contact_person: '',
        contact_email: '',
        industry: '',
        department_id: '',
        latitude: '',
        longitude: '',
        geofence_radius: '100', // Default 100 meters
    });
    const [formSubmitting, setFormSubmitting] = useState(false);

    useEffect(() => {
        Promise.all([
            loadCompanies(),
            loadPendingRequests(),
            loadDepartments()
        ]);
    }, []);

    const loadDepartments = async () => {
        try {
            const data = await coordinatorService.getAllDepartments();
            setDepartments(data);
        } catch (err) {
            console.error('Failed to load departments:', err);
        }
    };

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

    const loadPendingRequests = async () => {
        try {
            const data = await coordinatorService.getPendingCompanyRequests();
            setPendingRequests(data);
        } catch (err) {
            console.error('Failed to load company requests:', err);
        }
    };

    const handleApproveRequest = async (req: CompanyRequest) => {
        setRequestActionId(req.id);
        try {
            const newCompany = await coordinatorService.approveCompanyRequest(req.name);
            setCompanies(prev => [...prev, { ...newCompany, intern_count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
            // Remove ALL pending requests with the same name (case-insensitive)
            setPendingRequests(prev => prev.filter(r => r.name.toLowerCase() !== req.name.toLowerCase()));
        } catch (err) {
            console.error('Failed to approve company request:', err);
        } finally {
            setRequestActionId(null);
        }
    };

    const handleRejectRequest = async (req: CompanyRequest) => {
        setRequestActionId(req.id);
        try {
            await coordinatorService.rejectCompanyRequest(req.id);
            setPendingRequests(prev => prev.filter(r => r.id !== req.id));
        } catch (err) {
            console.error('Failed to reject company request:', err);
        } finally {
            setRequestActionId(null);
        }
    };

    const handleDeleteCompany = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!selectedCompany) return;
        setDeletingCompanyId(selectedCompany.id);
        setShowDeleteModal(false);
        try {
            await coordinatorService.deleteCompany(selectedCompany.id);
            setCompanies(prev => prev.filter(c => c.id !== selectedCompany.id));
            handleBack();
        } catch (err) {
            console.error('Failed to delete company:', err);
        } finally {
            setDeletingCompanyId(null);
        }
    };

    const handleCompanyClick = async (company: Company) => {
        setSelectedCompany(company);
        setMode('detail');
        setIsEditingCompany(false);
        setEditCompanyForm({
            name: company.name || '',
            address: company.address || '',
            contact_person: company.contact_person || '',
            contact_email: company.contact_email || '',
            industry: company.industry || '',
            department_id: company.department_id || '',
            latitude: company.latitude?.toString() || '',
            longitude: company.longitude?.toString() || '',
            geofence_radius: company.geofence_radius?.toString() || '100',
        });
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
            await coordinatorService.createCompany({
                name: newCompany.name,
                address: newCompany.address || null,
                contact_person: newCompany.contact_person || null,
                contact_email: newCompany.contact_email || null,
                industry: newCompany.industry || null,
                department_id: newCompany.department_id || null,
                latitude: newCompany.latitude ? parseFloat(newCompany.latitude) : null,
                longitude: newCompany.longitude ? parseFloat(newCompany.longitude) : null,
                geofence_radius: newCompany.geofence_radius ? parseInt(newCompany.geofence_radius) : null,
            });
            // Reload companies to getjoined data (department name, handled status)
            await loadCompanies();
            setNewCompany({ name: '', address: '', contact_person: '', contact_email: '', industry: '', department_id: '', latitude: '', longitude: '', geofence_radius: '100' });
            setShowAddForm(false);
        } catch (err) {
            console.error('Failed to create company:', err);
            alert('Error: Could not add company.');
        } finally {
            setFormSubmitting(false);
        }
    };

    const handleUpdateCompany = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCompany || !editCompanyForm.name.trim()) return;
        setUpdateSubmitting(true);
        try {
            const updated = await coordinatorService.updateCompany(selectedCompany.id, {
                name: editCompanyForm.name,
                address: editCompanyForm.address || null,
                contact_person: editCompanyForm.contact_person || null,
                contact_email: editCompanyForm.contact_email || null,
                industry: editCompanyForm.industry || null,
                department_id: editCompanyForm.department_id || null,
                latitude: editCompanyForm.latitude ? parseFloat(editCompanyForm.latitude) : null,
                longitude: editCompanyForm.longitude ? parseFloat(editCompanyForm.longitude) : null,
                geofence_radius: editCompanyForm.geofence_radius ? parseInt(editCompanyForm.geofence_radius) : null,
            });
            const updatedDeptName = departments.find(d => d.id === updated.department_id)?.name || 'Uncategorized';
            setSelectedCompany({ ...selectedCompany, ...updated, department_name: updatedDeptName });
            setCompanies(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated, department_name: updatedDeptName } : c));
            setIsEditingCompany(false);
        } catch (err) {
            console.error('Failed to update company:', err);
            alert('Error: Could not update company.');
        } finally {
            setUpdateSubmitting(false);
        }
    };

    const handleToggleHandling = async (e: React.MouseEvent, company: Company) => {
        e.stopPropagation();
        const newStatus = !company.is_handled;
        try {
            // Optimistic update
            setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, is_handled: newStatus } : c));
            await coordinatorService.toggleCompanyHandling(company.id, newStatus);
        } catch (err) {
            console.error('Failed to toggle company handling:', err);
            // Revert
            setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, is_handled: !newStatus } : c));
        }
    };

    const inputStyle: React.CSSProperties = {
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '0.6rem 0.9rem',
        color: 'var(--text-primary)',
        fontSize: '0.9rem',
        width: '100%',
        outline: 'none',
    };

    // ── Detail View (company → students) ───────────────────────────────
    if (mode === 'detail' && selectedCompany) {
        return (
            <div className="view-container fade-in">

                {/* Custom delete confirmation modal */}
                {showDeleteModal && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div className="glass-card" style={{
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: 20, padding: '2rem', width: '90%', maxWidth: 420,
                            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                            animation: 'fadeIn 0.2s ease',
                        }}>
                            {/* Icon */}
                            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                    <path d="M10 11v6" /><path d="M14 11v6" />
                                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                </svg>
                            </div>
                            <h3 style={{ textAlign: 'center', color: 'var(--text-primary)', margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>Remove Company?</h3>
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 0.5rem' }}>
                                You are about to permanently remove
                            </p>
                            <p style={{ textAlign: 'center', fontWeight: 700, color: '#ef4444', fontSize: '1rem', margin: '0 0 1.5rem', background: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: '0.5rem 1rem' }}>
                                &ldquo;{selectedCompany.name}&rdquo;
                            </p>
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 1.75rem' }}>
                                This action cannot be undone. Students assigned to this company will be unlinked.
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    onClick={() => setShowDeleteModal(false)}
                                    style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: '1px solid var(--admin-border)', background: 'var(--admin-bg)', color: 'var(--admin-text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', fontFamily: 'Inter, sans-serif', transition: 'background 0.15s' }}
                                    onMouseOver={e => e.currentTarget.style.background = 'var(--admin-card-bg)'}
                                    onMouseOut={e => e.currentTarget.style.background = 'var(--admin-bg)'}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    disabled={!!deletingCompanyId}
                                    style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', fontFamily: 'Inter, sans-serif', boxShadow: '0 4px 16px rgba(239,68,68,0.35)', transition: 'opacity 0.15s' }}
                                    onMouseOver={e => e.currentTarget.style.opacity = '0.85'}
                                    onMouseOut={e => e.currentTarget.style.opacity = '1'}
                                >
                                    {deletingCompanyId ? 'Removing…' : 'Yes, Remove It'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Back header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <button
                            onClick={handleBack}
                            style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', borderRadius: '8px', padding: '0.5rem 0.9rem', color: 'var(--admin-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
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
                    {/* Actions button group in detail view */}
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                            onClick={() => setIsEditingCompany(!isEditingCompany)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: 10, border: '1px solid var(--admin-border)', background: 'var(--admin-bg)', color: 'var(--admin-text-primary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'Inter, sans-serif', transition: 'background 0.15s' }}
                            onMouseOver={e => e.currentTarget.style.background = 'var(--admin-card-bg)'}
                            onMouseOut={e => e.currentTarget.style.background = 'var(--admin-bg)'}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            {isEditingCompany ? 'Cancel Edit' : 'Edit Company'}
                        </button>
                        <button
                            onClick={handleDeleteCompany}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: 10, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'Inter, sans-serif', transition: 'background 0.15s, border-color 0.15s' }}
                            onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; e.currentTarget.style.borderColor = '#ef4444'; }}
                            onMouseOut={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'; }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6" /><path d="M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                            Remove Company
                        </button>
                    </div>
                </div>

                {/* Company meta or edit form */}
                {isEditingCompany ? (
                    <div className="glass-card" style={{ borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
                        <h3 style={{ marginBottom: '1.25rem', color: 'var(--admin-text-primary)', fontSize: '1rem', fontWeight: 600 }}>Edit Company Profile</h3>
                        <form onSubmit={handleUpdateCompany}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Company Name *</label>
                                    <input style={inputStyle} value={editCompanyForm.name} onChange={e => setEditCompanyForm(p => ({ ...p, name: e.target.value }))} required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Industry</label>
                                    <input style={inputStyle} value={editCompanyForm.industry} onChange={e => setEditCompanyForm(p => ({ ...p, industry: e.target.value }))} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Address</label>
                                    <input style={inputStyle} value={editCompanyForm.address} onChange={e => setEditCompanyForm(p => ({ ...p, address: e.target.value }))} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Contact Person</label>
                                    <input style={inputStyle} value={editCompanyForm.contact_person} onChange={e => setEditCompanyForm(p => ({ ...p, contact_person: e.target.value }))} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Contact Email</label>
                                    <input type="email" style={inputStyle} value={editCompanyForm.contact_email} onChange={e => setEditCompanyForm(p => ({ ...p, contact_email: e.target.value }))} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Department Category</label>
                                    <select 
                                        style={inputStyle} 
                                        value={editCompanyForm.department_id} 
                                        onChange={e => setEditCompanyForm(p => ({ ...p, department_id: e.target.value }))}
                                    >
                                        <option value="">Uncategorized</option>
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            
                            <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem', color: 'var(--admin-text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>Geofencing (Optional)</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Latitude</label>
                                    <input type="number" step="any" style={inputStyle} value={editCompanyForm.latitude} onChange={e => setEditCompanyForm(p => ({ ...p, latitude: e.target.value }))} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Longitude</label>
                                    <input type="number" step="any" style={inputStyle} value={editCompanyForm.longitude} onChange={e => setEditCompanyForm(p => ({ ...p, longitude: e.target.value }))} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Geofence Radius (meters)</label>
                                    <input type="number" style={inputStyle} value={editCompanyForm.geofence_radius} onChange={e => setEditCompanyForm(p => ({ ...p, geofence_radius: e.target.value }))} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button type="button" onClick={() => setIsEditingCompany(false)} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--admin-border)', color: 'var(--admin-text-primary)', cursor: 'pointer', borderRadius: 8}}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={updateSubmitting}>
                                    {updateSubmitting ? 'Saving…' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                        {selectedCompany.address && (
                            <div style={{ background: 'var(--admin-bg)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--admin-border)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-secondary)', marginBottom: '0.3rem' }}>📍 Address</div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--admin-text-primary)' }}>{selectedCompany.address}</div>
                            </div>
                        )}
                        {selectedCompany.contact_person && (
                            <div style={{ background: 'var(--admin-bg)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--admin-border)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-secondary)', marginBottom: '0.3rem' }}>👤 Contact</div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--admin-text-primary)' }}>{selectedCompany.contact_person}</div>
                                {selectedCompany.contact_email && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--admin-text-secondary)' }}>{selectedCompany.contact_email}</div>
                                )}
                            </div>
                        )}
                        {(selectedCompany.latitude || selectedCompany.longitude) && (
                            <div style={{ background: 'var(--admin-bg)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--admin-border)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-secondary)', marginBottom: '0.3rem' }}>🌍 Coordinates</div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--admin-text-primary)' }}>{selectedCompany.latitude}, {selectedCompany.longitude}</div>
                            </div>
                        )}
                        <div style={{ background: 'var(--admin-bg)', borderRadius: '10px', padding: '1rem', border: '1px solid var(--admin-border)' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-secondary)', marginBottom: '0.3rem' }}>🎓 Total Interns</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981' }}>{companyStudents.length}</div>
                        </div>
                    </div>
                )}

                {/* Students table */}
                <div className="glass-card" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--admin-border)', fontWeight: 600, color: 'var(--admin-text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                        Interns at {selectedCompany.name}
                    </div>
                    {detailLoading ? (
                        <div style={{ padding: '0 1rem' }}>
                            <TableSkeleton rows={3} cols={5} />
                        </div>
                    ) : companyStudents.length > 0 ? (
                        <div className="table-container">
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
                                            <td style={{ fontWeight: 500, color: 'var(--admin-text-primary)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                                        {student.first_name?.[0]?.toUpperCase() ?? '?'}
                                                    </div>
                                                    <UserClickableName 
                                                        userId={student.id} 
                                                        userName={`${student.first_name} ${student.last_name}`} 
                                                    />
                                                </div>
                                            </td>
                                            <td>{student.email}</td>
                                            <td>{student.required_ojt_hours}h</td>
                                            <td>
                                                <span style={{ color: (student.absences ?? 0) > 3 ? '#ef4444' : 'inherit', fontWeight: (student.absences ?? 0) > 3 ? 700 : 'normal' }}>
                                                    {student.absences ?? 0}
                                                </span>
                                            </td>
                                            <td>{new Date(student.created_at).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
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
                <div className="glass-card" style={{ borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
                    <h3 style={{ marginBottom: '1.25rem', color: 'var(--admin-text-primary)', fontSize: '1rem', fontWeight: 600 }}>New Company Details</h3>
                    <form onSubmit={handleAddCompany}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Company Name *</label>
                                <input style={inputStyle} value={newCompany.name} onChange={e => setNewCompany(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Tech Solutions Inc." required />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Industry</label>
                                <input style={inputStyle} value={newCompany.industry} onChange={e => setNewCompany(p => ({ ...p, industry: e.target.value }))} placeholder="e.g. Information Technology" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Address</label>
                                <input style={inputStyle} value={newCompany.address} onChange={e => setNewCompany(p => ({ ...p, address: e.target.value }))} placeholder="e.g. Dumaguete City" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Contact Person</label>
                                <input style={inputStyle} value={newCompany.contact_person} onChange={e => setNewCompany(p => ({ ...p, contact_person: e.target.value }))} placeholder="e.g. Juan dela Cruz" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Contact Email</label>
                                <input type="email" style={inputStyle} value={newCompany.contact_email} onChange={e => setNewCompany(p => ({ ...p, contact_email: e.target.value }))} placeholder="contact@company.com" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Department Category</label>
                                <select 
                                    style={inputStyle} 
                                    value={newCompany.department_id} 
                                    onChange={e => setNewCompany(p => ({ ...p, department_id: e.target.value }))}
                                >
                                    <option value="">Uncategorized</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        
                        <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem', color: 'var(--admin-text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>Geofencing (Optional)</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Latitude</label>
                                <input type="number" step="any" style={inputStyle} value={newCompany.latitude} onChange={e => setNewCompany(p => ({ ...p, latitude: e.target.value }))} placeholder="e.g. 9.3068" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Longitude</label>
                                <input type="number" step="any" style={inputStyle} value={newCompany.longitude} onChange={e => setNewCompany(p => ({ ...p, longitude: e.target.value }))} placeholder="e.g. 123.3054" />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.35rem' }}>Geofence Radius (meters)</label>
                                <input type="number" style={inputStyle} value={newCompany.geofence_radius} onChange={e => setNewCompany(p => ({ ...p, geofence_radius: e.target.value }))} placeholder="e.g. 100" />
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

            {/* ── Pending Company Requests ── */}
            {!loading && pendingRequests.length > 0 && (
                <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f59e0b' }}>Pending Company Requests ({pendingRequests.length})</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {pendingRequests.map(req => (
                            <div key={req.id} className="glass-card" style={{
                                borderRadius: 10, padding: '0.85rem 1rem',
                                display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                            }}>
                                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--admin-text-primary)' }}>{req.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-secondary)', marginTop: '0.15rem' }}>
                                        Requested by <strong>{req.student_name ?? 'a student'}</strong> &bull; {new Date(req.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                    <button
                                        disabled={requestActionId === req.id}
                                        onClick={() => handleApproveRequest(req)}
                                        className="btn btn-approve"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                        {requestActionId === req.id ? 'Processing…' : 'Approve'}
                                    </button>
                                    <button
                                        disabled={requestActionId === req.id}
                                        onClick={() => handleRejectRequest(req)}
                                        className="btn btn-reject"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                        Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {loading ? (
                <CardGridSkeleton cards={6} height={180} />
            ) : companies.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                    {/* Group companies by department */}
                    {Array.from(new Set(companies.map(c => c.department_name || 'Uncategorized'))).sort((a, b) => {
                        if (a === 'Uncategorized') return 1;
                        if (b === 'Uncategorized') return -1;
                        return a.localeCompare(b);
                    }).map(dept => (
                        <div key={dept}>
                            <h3 style={{ 
                                color: 'var(--text-primary)', 
                                fontSize: '1.2rem', 
                                marginBottom: '1.25rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.75rem',
                                borderBottom: '1px solid var(--border)',
                                paddingBottom: '0.75rem'
                            }}>
                                <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--primary)' }} />
                                {dept}
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                                {companies.filter(c => (c.department_name || 'Uncategorized') === dept).map(company => (
                                    <div
                                        key={company.id}
                                        onClick={() => handleCompanyClick(company)}
                                        className={`glass-card ${company.is_handled ? 'handled' : ''}`}
                                        style={{ 
                                            background: company.is_handled ? 'rgba(16,185,129,0.05)' : undefined,
                                            border: `1px solid ${company.is_handled ? 'var(--primary)' : 'var(--admin-border)'}`, 
                                            borderRadius: '14px', 
                                            padding: '1.5rem', 
                                            cursor: 'pointer', 
                                            transition: 'all 0.2s ease', 
                                            position: 'relative', 
                                            overflow: 'hidden',
                                            boxShadow: company.is_handled ? '0 8px 32px rgba(16,185,129,0.1)' : 'none'
                                        }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = company.is_handled ? '0 8px 32px rgba(16,185,129,0.1)' : ''; (e.currentTarget as HTMLElement).style.borderColor = company.is_handled ? 'var(--primary)' : 'var(--admin-border)'; }}
                                    >
                                        <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, borderRadius: '0 14px 0 80px', background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(13,148,136,0.05))' }} />

                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                                            <div style={{ width: 42, height: 42, borderRadius: '10px', background: 'linear-gradient(135deg, var(--primary), var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <h3 style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--admin-text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{company.name}</h3>
                                                {company.industry && <p style={{ fontSize: '0.8rem', color: 'var(--admin-text-secondary)', margin: '0.2rem 0 0' }}>{company.industry}</p>}
                                            </div>
                                            <button 
                                                onClick={(e) => handleToggleHandling(e, company)}
                                                title={company.is_handled ? "Stop handling this company" : "Start handling this company"}
                                                style={{
                                                    zIndex: 10,
                                                    padding: '0.4rem 0.8rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid',
                                                    borderColor: company.is_handled ? 'var(--primary)' : 'var(--admin-border)',
                                                    background: company.is_handled ? 'rgba(16,185,129,0.1)' : 'var(--admin-bg)',
                                                    color: company.is_handled ? 'var(--primary)' : 'var(--admin-text-secondary)',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                {company.is_handled ? 'Handling' : 'Handle'}
                                            </button>
                                        </div>

                                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '1rem' }}>
                                            {company.address && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                                    {company.address}
                                                </span>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: company.intern_count ? '#10b981' : 'var(--text-muted)' }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                                {company.intern_count ?? 0} Intern{(company.intern_count ?? 0) !== 1 ? 's' : ''}
                                            </span>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--admin-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                View Students
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 1rem', display: 'block', opacity: 0.3 }}><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                    <p style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No Companies Yet</p>
                    <p style={{ fontSize: '0.9rem' }}>Click "Add Company" to register your first OJT partner.</p>
                </div>
            )}
        </div>
    );
};

export default CompaniesView;
