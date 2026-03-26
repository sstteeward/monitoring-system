import React, { useEffect, useState } from 'react';
import { coordinatorService } from '../services/coordinatorService';
import type { Profile } from '../services/profileService';
import UserClickableName from './UserClickableName';
import './CoordinatorDashboard.css';

interface Department {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
}

const CoordinatorDepartmentView: React.FC = () => {
    const [department, setDepartment] = useState<Department | null>(null);
    const [students, setStudents] = useState<Profile[]>([]);
    const [unassignedStudents, setUnassignedStudents] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [assigning, setAssigning] = useState(false);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [removingId, setRemovingId] = useState<string | null>(null);

    useEffect(() => {
        loadDepartmentData();
    }, []);

    const loadDepartmentData = async () => {
        setLoading(true);
        try {
            const dept = await coordinatorService.getMyDepartment();
            setDepartment(dept);

            if (dept) {
                const [deptStudents, unassigned] = await Promise.all([
                    coordinatorService.getStudentsByDepartment(dept.id),
                    coordinatorService.getUnassignedStudents(),
                ]);
                setStudents(deptStudents);
                setUnassignedStudents(unassigned);
            }
        } catch (err) {
            console.error('Error loading department data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAssignStudent = async () => {
        if (!selectedStudentId || !department) return;
        setAssigning(true);
        try {
            const student = unassignedStudents.find(s => s.id === selectedStudentId);
            await coordinatorService.assignStudentToDepartment(selectedStudentId, department.id);

            if (student) {
                setStudents(prev => [...prev, student].sort((a, b) =>
                    (a.last_name || '').localeCompare(b.last_name || '')
                ));
                setUnassignedStudents(prev => prev.filter(s => s.id !== selectedStudentId));
            }
            setSelectedStudentId('');
        } catch (err) {
            console.error('Error assigning student:', err);
            alert('Failed to assign student to department.');
        } finally {
            setAssigning(false);
        }
    };

    const handleRemoveStudent = async (student: Profile) => {
        if (!confirm(`Remove ${student.first_name} ${student.last_name} from this department?`)) return;
        setRemovingId(student.id);
        try {
            await coordinatorService.assignStudentToDepartment(student.id, null);
            setStudents(prev => prev.filter(s => s.id !== student.id));
            setUnassignedStudents(prev => [...prev, student].sort((a, b) =>
                (a.last_name || '').localeCompare(b.last_name || '')
            ));
        } catch (err) {
            console.error('Error removing student:', err);
            alert('Failed to remove student from department.');
        } finally {
            setRemovingId(null);
        }
    };

    const avatarColor = (name: string) => {
        const colors = ['#10b981', '#3b82f6', '#0d9488', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899'];
        return colors[(name.charCodeAt(0) ?? 0) % colors.length];
    };

    if (loading) {
        return (
            <div className="view-container fade-in">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} className="skeleton-box" style={{ height: 80, borderRadius: 16, background: 'var(--bg-elevated)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    ))}
                </div>
            </div>
        );
    }

    if (!department) {
        return (
            <div className="view-container fade-in">
                <div style={{
                    textAlign: 'center',
                    padding: '4rem 2rem',
                    background: 'var(--bg-elevated)',
                    borderRadius: 20,
                    border: '1px solid var(--border)',
                }}>
                    <div style={{
                        width: 72, height: 72, borderRadius: '50%',
                        background: 'rgba(16,185,129,0.12)', color: 'var(--primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1.5rem',
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </svg>
                    </div>
                    <h3 style={{ color: 'var(--text-bright)', fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                        No Department Assigned
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
                        You have not been assigned to a department yet. Please contact your administrator to get assigned to a department.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="view-container fade-in">
            {/* Department Header */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(13,148,136,0.1))',
                border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: 20,
                padding: '2rem 2.5rem',
                marginBottom: '2rem',
                position: 'relative',
                overflow: 'hidden',
            }}>
                <div style={{
                    position: 'absolute', top: -30, right: -30,
                    width: 120, height: 120, borderRadius: '50%',
                    background: 'rgba(16,185,129,0.08)',
                }} />
                <div style={{
                    position: 'absolute', bottom: -20, right: 60,
                    width: 80, height: 80, borderRadius: '50%',
                    background: 'rgba(59,130,246,0.06)',
                }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative' }}>
                    <div style={{
                        width: 52, height: 52, borderRadius: 14,
                        background: 'rgba(16,185,129,0.2)', color: 'var(--primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </svg>
                    </div>
                    <div>
                        <h2 style={{ color: 'var(--text-bright)', fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>
                            {department.name}
                        </h2>
                        {department.description && (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0.3rem 0 0' }}>
                                {department.description}
                            </p>
                        )}
                    </div>
                    <div style={{
                        marginLeft: 'auto',
                        background: 'rgba(16,185,129,0.15)',
                        color: '#34d399',
                        padding: '0.4rem 1rem',
                        borderRadius: 10,
                        fontSize: '0.85rem',
                        fontWeight: 600,
                    }}>
                        {students.length} student{students.length !== 1 ? 's' : ''}
                    </div>
                </div>
            </div>

            {/* Assign Student */}
            <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: '1.25rem 1.5rem',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
            }}>
                <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'rgba(16,185,129,0.12)', color: '#10b981',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </div>
                <select
                    className="form-input"
                    value={selectedStudentId}
                    onChange={e => setSelectedStudentId(e.target.value)}
                    style={{ flex: 1, minWidth: 200, padding: '0.6rem 0.75rem' }}
                >
                    <option value="" style={{ color: '#000' }}>— Select a student to assign —</option>
                    {unassignedStudents.map(s => (
                        <option key={s.id} value={s.id} style={{ color: '#000' }}>
                            {s.first_name} {s.last_name} {s.email ? `(${s.email})` : ''}
                        </option>
                    ))}
                </select>
                <button
                    onClick={handleAssignStudent}
                    disabled={!selectedStudentId || assigning}
                    style={{
                        padding: '0.6rem 1.25rem',
                        borderRadius: 10,
                        border: 'none',
                        background: selectedStudentId ? 'linear-gradient(135deg, var(--primary), var(--secondary))' : 'var(--bg-secondary)',
                        color: selectedStudentId ? '#fff' : 'var(--text-muted)',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: selectedStudentId ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s',
                        fontFamily: 'inherit',
                        opacity: assigning ? 0.7 : 1,
                    }}
                >
                    {assigning ? 'Assigning...' : 'Assign to Department'}
                </button>
            </div>

            {/* Student List */}
            <div className="table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Email</th>
                            <th>Company</th>
                            <th>OJT Hours</th>
                            <th>Absences</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.length > 0 ? students.map(student => {
                            const color = avatarColor(student.first_name ?? 'A');
                            return (
                                <tr key={student.id}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{
                                                width: 34, height: 34, borderRadius: '50%',
                                                background: student.avatar_url
                                                    ? `url(${student.avatar_url}) center/cover no-repeat`
                                                    : `linear-gradient(135deg, ${color}, ${color}bb)`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.78rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                                            }}>
                                                {!student.avatar_url && (student.first_name?.[0]?.toUpperCase() ?? '?')}
                                            </div>
                                            <UserClickableName 
                                                userId={student.id} 
                                                userName={`${student.first_name} ${student.last_name}`} 
                                            />
                                        </div>
                                    </td>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{student.email}</td>
                                    <td>
                                        {student.company?.name ? (
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                                background: 'rgba(16,185,129,0.1)', color: 'var(--primary)',
                                                padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600,
                                            }}>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                                                </svg>
                                                {student.company.name}
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontStyle: 'italic' }}>Unassigned</span>
                                        )}
                                    </td>
                                    <td>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                            fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,0.1)',
                                            padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem',
                                        }}>
                                            {student.required_ojt_hours}h
                                        </span>
                                    </td>
                                    <td>
                                        <span style={{
                                            fontWeight: (student.absences ?? 0) > 3 ? 700 : 400,
                                            color: (student.absences ?? 0) > 3 ? '#ef4444' : (student.absences ?? 0) > 0 ? '#f59e0b' : 'var(--text-muted)',
                                            background: (student.absences ?? 0) > 3 ? 'rgba(239,68,68,0.1)' : 'transparent',
                                            padding: (student.absences ?? 0) > 3 ? '0.2rem 0.6rem' : '0',
                                            borderRadius: '6px', fontSize: '0.85rem',
                                        }}>
                                            {student.absences ?? 0}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button
                                            onClick={() => handleRemoveStudent(student)}
                                            disabled={removingId === student.id}
                                            style={{
                                                background: 'none', border: '1px solid rgba(239,68,68,0.3)',
                                                color: '#f87171', cursor: removingId === student.id ? 'not-allowed' : 'pointer',
                                                padding: '0.3rem 0.7rem', borderRadius: 8, fontSize: '0.78rem',
                                                fontWeight: 600, fontFamily: 'inherit',
                                                opacity: removingId === student.id ? 0.6 : 1,
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {removingId === student.id ? 'Removing...' : 'Remove'}
                                        </button>
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                                    <div style={{ color: 'var(--text-muted)' }}>
                                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 0.75rem', display: 'block', opacity: 0.6 }}>
                                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                            <circle cx="9" cy="7" r="4" />
                                        </svg>
                                        <p style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                                            No students assigned to this department yet
                                        </p>
                                        <p style={{ fontSize: '0.8rem' }}>
                                            Use the dropdown above to assign students.
                                        </p>
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

export default CoordinatorDepartmentView;
