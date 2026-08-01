import React, { useEffect, useState } from 'react';
import { companyService } from '../services/companyService';
import { TableRowSkeleton } from './Skeletons';
import type { Profile } from '../services/profileService';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import UserProfileModal from './UserProfileModal';
import UserClickableName from './UserClickableName';
import { profileService } from '../services/profileService';

const CompanyStudentsView: React.FC = () => {
    const [students, setStudents] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);

    useEffect(() => { loadStudents(); }, []);

    const loadStudents = async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await profileService.getCurrentProfile();
            if (!profile?.company_id) {
                throw new Error("You are not associated with any company.");
            }
            const data = await companyService.getAssignedStudents(profile.company_id);
            setStudents(data);
        } catch (err: any) {
            console.error('Failed to load students:', err);
            setError(err?.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const filteredStudents = students.filter(student => {
        const matchesSearch = `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            student.email?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
    });

    const {
        currentPage,
        setCurrentPage,
        totalPages,
        paginatedItems: paginatedStudents,
        totalItems,
        itemsPerPage
    } = usePagination(filteredStudents, 10);

    const avatarColor = (name: string) => {
        const colors = ['#10b981', '#3b82f6', '#0d9488', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899'];
        return colors[(name.charCodeAt(0) ?? 0) % colors.length];
    };

    if (error) return (
        <div className="view-container fade-in">
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '1.5rem 2rem', color: '#f87171' }}>
                <strong>Error:</strong> {error}
            </div>
        </div>
    );

    return (
        <div className="view-container fade-in">
            <div className="view-header" style={{ flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                    <h2 className="view-title" style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Assigned Interns</h2>
                    <p className="view-subtitle" style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
                        {students.length} intern{students.length !== 1 ? 's' : ''} assigned to your company
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
                    <div style={{ position: 'relative', width: 'min(320px, 100%)' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                            <circle cx="11" cy="11" r="8" stroke="var(--text-muted)" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="var(--text-muted)" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search interns…"
                            className="form-input"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ paddingLeft: '2.25rem', width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 0.75rem 0.5rem 2.25rem', color: 'var(--text-primary)' }}
                        />
                    </div>
                </div>
            </div>

            <div className="table-container glass-card" style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>Student</th>
                            <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>Email</th>
                            <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>Department</th>
                            <th style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>Required Hours</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <TableRowSkeleton rows={5} cols={4} />
                        ) : paginatedStudents.length > 0 ? (
                            paginatedStudents.map(student => {
                                const color = avatarColor(student.first_name ?? 'A');
                                return (
                                    <tr
                                        key={student.id}
                                        onClick={() => setViewProfileId(student.id)}
                                        style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}
                                        className="hoverable-row"
                                    >
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ width: 34, height: 34, borderRadius: '50%', background: `linear-gradient(135deg, ${color}, ${color}bb)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                                    {student.first_name?.[0]?.toUpperCase() ?? '?'}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-bright)', fontSize: '0.88rem' }}>
                                                     <UserClickableName userId={student.id} userName={`${student.first_name} ${student.last_name}`} />
                                                 </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{student.email}</td>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            {(student.department_info?.name || student.department) ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600 }}>
                                                    {student.department_info?.name || student.department}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontStyle: 'italic' }}>Unassigned</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                                                {student.required_ojt_hours}h
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={4} style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                                    <div style={{ color: 'var(--text-muted)' }}>
                                        <p style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                                            {searchTerm ? `No interns matching "${searchTerm}"` : 'No interns assigned yet'}
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {!loading && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    itemName="interns"
                />
            )}

            <UserProfileModal
                profileId={viewProfileId}
                onClose={() => setViewProfileId(null)}
            />
        </div>
    );
};

export default CompanyStudentsView;
