import React, { useEffect, useState } from 'react';
import { coordinatorService } from '../services/coordinatorService';
import { TableSkeleton } from './Skeletons';
import type { Profile } from '../services/profileService';
import './CoordinatorDashboard.css';
import { adminService } from '../services/adminService';

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

    useEffect(() => { loadStudents(); }, []);

    const loadStudents = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await coordinatorService.getAllStudents();
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
                return student.grade === 'completed'; // Assuming this maps to completion, or maybe there's a different way
            case 'in-progress':
                return !!student.company_id && student.grade !== 'completed';
            case 'at-risk':
                return (student.absences ?? 0) >= 3;
            default:
                return true;
        }
    });

    const avatarColor = (name: string) => {
        const colors = ['#7c3aed', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
        return colors[(name.charCodeAt(0) ?? 0) % colors.length];
    };

    const handleDeleteStudent = async (studentId: string, name: string) => {
        if (!confirm(`CRITICAL WARNING: Are you sure you want to completely delete the account for ${name}? This will remove all their data and cannot be undone.`)) {
            return;
        }

        try {
            await adminService.deleteUserAccount(studentId);
            setStudents(prev => prev.filter(s => s.auth_user_id !== studentId));
            await adminService.logAction('delete_student_account', 'profiles', studentId);
            alert(`Student ${name} deleted successfully.`);
        } catch (e) {
            alert('Failed to delete student. Have you run the RPC script in your Supabase SQL editor?');
            console.error(e);
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
                    <p className="view-subtitle">{students.length} student{students.length !== 1 ? 's' : ''} in the SIL program</p>
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
                            <th>OJT Hours</th>
                            <th>Absences</th>
                            <th>Enrolled</th>
                            {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <TableSkeleton rows={8} cols={5} />
                        ) : filteredStudents.length > 0 ? (
                            filteredStudents.map(student => {
                                const color = avatarColor(student.first_name ?? 'A');
                                return (
                                    <tr key={student.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ width: 34, height: 34, borderRadius: '50%', background: `linear-gradient(135deg, ${color}, ${color}bb)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                                    {student.first_name?.[0]?.toUpperCase() ?? '?'}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-bright)', fontSize: '0.88rem' }}>{student.first_name} {student.last_name}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{student.email}</td>
                                        <td>
                                            {student.company?.name ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(124,58,237,0.1)', color: '#7c3aed', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600 }}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                                                    {student.company.name}
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
                                                    onClick={() => handleDeleteStudent(student.auth_user_id, `${student.first_name} ${student.last_name}`)}
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
                                <td colSpan={isAdmin ? 7 : 6} style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
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
        </div>
    );
};

export default StudentsView;
