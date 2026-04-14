import React, { useEffect, useState } from 'react';
import { coordinatorService } from '../services/coordinatorService';
import { TableSkeleton } from './Skeletons';
import type { Profile } from '../services/profileService';
import './CoordinatorDashboard.css';
import { adminService } from '../services/adminService';
import UserProfileModal from './UserProfileModal';
import UserClickableName from './UserClickableName';

interface StudentsViewProps {
    initialFilter?: 'all' | 'assigned' | 'completed' | 'in-progress' | 'at-risk';
    isAdmin?: boolean;
}

const StudentsView: React.FC<StudentsViewProps> = ({ initialFilter = 'all', isAdmin = false }) => {
    const [students, setStudents] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTab, setFilterTab] = useState(initialFilter);
    const [error, setError] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);
    const [departmentName, setDepartmentName] = useState<string | null>(null);

    useEffect(() => { loadStudents(); }, []);

    const loadStudents = async () => {
        setLoading(true);
        setError(null);
        try {
            // If not admin, get the coordinator's department to filter students
            let deptId: string | undefined = undefined;
            if (!isAdmin) {
                const dept = await coordinatorService.getMyDepartment();
                if (dept) {
                    deptId = dept.id;
                    setDepartmentName(dept.name);
                }
            }

            const data = await coordinatorService.getAllStudents(deptId);
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

        if (!matchesSearch) return false;

        switch (filterTab) {
            case 'assigned':
                return !!student.company_id;
            case 'completed':
                return !student.company_id;
            case 'in-progress':
                return !!student.company_id;
            case 'at-risk':
                return (student.absences ?? 0) >= 3;
            default:
                return true;
        }
    });

    const avatarColor = (name: string) => {
        const colors = ['#10b981', '#3b82f6', '#0d9488', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899'];
        return colors[(name.charCodeAt(0) ?? 0) % colors.length];
    };

    const confirmDeleteStudent = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await adminService.deleteUserAccount(deleteTarget.id);
            setStudents(prev => prev.filter(s => s.auth_user_id !== deleteTarget.id));
            await adminService.logAction('delete_student_account', 'profiles', deleteTarget.id);
            setDeleteTarget(null);
        } catch (e: any) {
            const detail = e?.message || e?.details || JSON.stringify(e);
            alert(`Failed to delete student.\n\nError: ${detail}\n\nMake sure you have run the fix_admin_functions.sql script in your Supabase SQL Editor.`);
            console.error('Delete user error:', e);
        } finally {
            setDeleting(false);
        }
    };

    // Removal of old simple loading state return
    if (error) return (
        <div className="view-container">
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '1.5rem 2rem', color: '#f87171' }}>
                <strong>Supabase Error:</strong> {error}
                <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>This is usually an RLS policy issue. Run the coordinator RLS SQL in Supabase and refresh.</p>
            </div>
        </div>
    );

    return (
        <div className="view-container fade-in">
            <div className="view-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 className="view-title">Enrolled Students</h2>
                    <p className="view-subtitle">
                        {students.length} student{students.length !== 1 ? 's' : ''} 
                        {departmentName ? ` in ${departmentName}` : ' in the SIL program'}
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
                            placeholder="Search students…"
                            className="form-input"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ paddingLeft: '2.25rem', width: '100%' }}
                        />
                    </div>
                </div>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                {(['all', 'assigned', 'in-progress', 'completed', 'at-risk'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setFilterTab(tab)}
                        style={{
                            padding: '0.4rem 1rem',
                            borderRadius: '20px',
                            fontSize: '0.85rem',
                            fontWeight: filterTab === tab ? 600 : 500,
                            whiteSpace: 'nowrap',
                            background: filterTab === tab ? 'var(--primary)' : 'var(--bg-elevated)',
                            color: filterTab === tab ? '#fff' : 'var(--text-secondary)',
                            border: `1px solid ${filterTab === tab ? 'var(--primary)' : 'var(--border)'}`,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
                    </button>
                ))}
            </div>

            <div className="table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Email</th>
                            <th>Company</th>
                            <th>Department</th>
                            <th>OJT Hours</th>
                            <th>Absences</th>
                            <th>Enrolled</th>
                            {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <TableSkeleton rows={8} cols={6} />
                        ) : filteredStudents.length > 0 ? (
                            filteredStudents.map(student => {
                                const color = avatarColor(student.first_name ?? 'A');
                                return (
                                    <tr
                                        key={student.id}
                                        onClick={() => setViewProfileId(student.id)}
                                        style={{ cursor: 'pointer' }}
                                        className="hoverable-row"
                                    >
                                        <td>
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
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{student.email}</td>
                                        <td>
                                            {student.company?.name ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(16,185,129,0.1)', color: 'var(--primary)', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600 }}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                                                    {student.company.name}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontStyle: 'italic' }}>Unassigned</span>
                                            )}
                                        </td>
                                        <td>
                                            {(student.department_info?.name || student.department) ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600 }}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                                                    {student.department_info?.name || student.department}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontStyle: 'italic' }}>Unassigned</span>
                                            )}
                                        </td>
                                        <td>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                                                {student.required_ojt_hours}h
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{
                                                fontWeight: student.absences > 3 ? 700 : 400,
                                                color: student.absences > 3 ? '#ef4444' : student.absences > 0 ? '#f59e0b' : 'var(--text-muted)',
                                                background: student.absences > 3 ? 'rgba(239,68,68,0.1)' : 'transparent',
                                                padding: student.absences > 3 ? '0.2rem 0.6rem' : '0',
                                                borderRadius: '6px',
                                                fontSize: '0.85rem',
                                            }}>
                                                {student.absences ?? 0}
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                            {new Date(student.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>
                                        {isAdmin && (
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#ef4444',
                                                        cursor: 'pointer',
                                                        padding: '0.2rem 0.5rem',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 500
                                                    }}
                                                    onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: student.auth_user_id, name: `${student.first_name} ${student.last_name}` }); }}
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={isAdmin ? 8 : 7} style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                                    <div style={{ color: 'var(--text-muted)' }}>
                                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 0.75rem', display: 'block', opacity: 0.6 }}>
                                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="var(--primary)" />
                                            <circle cx="9" cy="7" r="4" stroke="var(--primary)" />
                                        </svg>
                                        <p style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                                            {searchTerm ? `No students matching "${searchTerm}"` : 'No students enrolled yet'}
                                        </p>
                                        {searchTerm && <p style={{ fontSize: '0.8rem' }}>Try a different name or email.</p>}
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'var(--bg-card, #0f172a)', border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 20, padding: '2rem', width: '90%', maxWidth: 420,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                        animation: 'fadeIn 0.2s ease',
                    }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                        </div>
                        <h3 style={{ textAlign: 'center', color: 'var(--text-bright, #f8fafc)', margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 600 }}>Delete Account?</h3>
                        <p style={{ textAlign: 'center', color: 'var(--text-muted, #94a3b8)', fontSize: '0.9rem', margin: '0 0 1.75rem', lineHeight: 1.5 }}>
                            Are you sure you want to permanently delete <strong style={{ color: 'var(--text-bright, #f8fafc)' }}>{deleteTarget.name}</strong>? All their data including timesheets, journals, and documents will be removed. This cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: '1px solid var(--border, #1e293b)', background: 'rgba(30, 41, 59, 0.5)', color: '#94a3b8', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit', transition: 'background 0.15s' }}
                                onMouseOver={e => e.currentTarget.style.background = 'rgba(30, 41, 59, 0.8)'}
                                onMouseOut={e => e.currentTarget.style.background = 'rgba(30, 41, 59, 0.5)'}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteStudent}
                                disabled={deleting}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(239,68,68,0.35)', transition: 'opacity 0.15s', opacity: deleting ? 0.7 : 1 }}
                                onMouseOver={e => { if (!deleting) e.currentTarget.style.opacity = '0.9'; }}
                                onMouseOut={e => { if (!deleting) e.currentTarget.style.opacity = '1'; }}
                            >
                                {deleting ? 'Deleting...' : 'Yes, Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <UserProfileModal
                profileId={viewProfileId}
                onClose={() => setViewProfileId(null)}
            />
        </div>
    );
};

export default StudentsView;
