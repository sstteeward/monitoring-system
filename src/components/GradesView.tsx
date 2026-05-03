import React, { useEffect, useState } from 'react';
import { coordinatorService } from '../services/coordinatorService';
import type { Profile } from '../services/profileService';
import { TableSkeleton } from './Skeletons';
import UserProfileModal from './UserProfileModal';
import UserClickableName from './UserClickableName';
import './CoordinatorDashboard.css'; // Reusing coordinator styles

interface GradesViewProps {
    isAdmin?: boolean;
}

const GradesView: React.FC<GradesViewProps> = ({ isAdmin = false }) => {
    const [students, setStudents] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);
    const [departmentName, setDepartmentName] = useState<string | null>(null);
    
    // State to hold unsaved grades before they are submitted
    const [editedGrades, setEditedGrades] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [selectedSection, setSelectedSection] = useState<string | null>(null);

    useEffect(() => {
        loadStudents();
    }, []);

    const loadStudents = async () => {
        setLoading(true);
        setError(null);
        try {
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
            
            // Initialize edited grades
            const initialGrades: Record<string, string> = {};
            data.forEach(s => {
                initialGrades[s.auth_user_id] = s.grade || '';
            });
            setEditedGrades(initialGrades);
            
        } catch (err: any) {
            console.error('Failed to load students:', err);
            setError(err?.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const handleGradeChange = (studentId: string, value: string) => {
        setEditedGrades(prev => ({ ...prev, [studentId]: value }));
    };

    const saveGrade = async (studentId: string) => {
        const grade = editedGrades[studentId];
        setSavingId(studentId);
        try {
            await coordinatorService.updateStudentGrade(studentId, grade);
            // Update the local students array to reflect the saved grade
            setStudents(prev => prev.map(s => s.auth_user_id === studentId ? { ...s, grade } : s));
        } catch (err: any) {
            alert('Failed to save grade: ' + err.message);
        } finally {
            setSavingId(null);
        }
    };

    const avatarColor = (name: string) => {
        const colors = ['#10b981', '#3b82f6', '#0d9488', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899'];
        return colors[(name.charCodeAt(0) ?? 0) % colors.length];
    };

    // Group students by section
    const studentsBySection = students.reduce((acc, student) => {
        const section = student.section?.trim() || 'No Section Assigned';
        if (!acc[section]) acc[section] = [];
        acc[section].push(student);
        return acc;
    }, {} as Record<string, Profile[]>);

    // Sort sections alphabetically
    const sortedSections = Object.keys(studentsBySection).sort((a, b) => {
        if (a === 'No Section Assigned') return 1;
        if (b === 'No Section Assigned') return -1;
        return a.localeCompare(b);
    });

    if (error) return (
        <div className="view-container">
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '1.5rem 2rem', color: '#f87171' }}>
                <strong>Error:</strong> {error}
            </div>
        </div>
    );

    return (
        <div className="view-container fade-in">
            <div className="view-header">
                <div>
                    <h2 className="view-title">Student Grades by Section</h2>
                    <p className="view-subtitle">
                        {students.length} student{students.length !== 1 ? 's' : ''} 
                        {departmentName ? ` in ${departmentName}` : ' in the SIL program'}
                    </p>
                </div>
            </div>

            {loading ? (
                <div style={{ marginTop: '2rem' }}>
                    <TableSkeleton rows={5} cols={4} />
                    <div style={{ height: '2rem' }} />
                    <TableSkeleton rows={5} cols={4} />
                </div>
            ) : students.length === 0 ? (
                <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No students found.
                </div>
            ) : selectedSection === null ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem', paddingBottom: '2rem' }}>
                    {sortedSections.map(section => (
                        <div 
                            key={section} 
                            className="glass-card hoverable-card" 
                            onClick={() => setSelectedSection(section)}
                            style={{ 
                                padding: '1.5rem', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                transition: 'all 0.2s ease',
                                border: '1px solid var(--border)'
                            }}
                            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                            onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
                        >
                            <div style={{
                                width: 48, height: 48, borderRadius: 12,
                                background: 'rgba(16, 185, 129, 0.1)',
                                color: 'var(--primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                                </svg>
                            </div>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: 'var(--text-bright)', fontWeight: 700 }}>
                                    Section {section}
                                </h3>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    {studentsBySection[section].length} student{studentsBySection[section].length !== 1 ? 's' : ''}
                                </div>
                            </div>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
                    <button 
                        onClick={() => setSelectedSection(null)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            background: 'transparent', border: 'none', color: 'var(--text-muted)',
                            cursor: 'pointer', padding: 0, fontWeight: 600, fontSize: '0.9rem', width: 'max-content'
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12"></line>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                        Back to Sections
                    </button>

                    <div className="glass-card table-container" style={{ overflow: 'hidden' }}>
                        <div style={{ 
                            padding: '1.25rem 1.5rem', 
                            borderBottom: '1px solid var(--border)', 
                            background: 'rgba(16, 185, 129, 0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem'
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                            </svg>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-bright)', fontWeight: 700 }}>
                                Section {selectedSection}
                            </h3>
                            <span style={{ background: 'var(--bg-elevated)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                {studentsBySection[selectedSection].length} Students
                            </span>
                        </div>
                        
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Course / Program</th>
                                    <th>Company</th>
                                    <th>Final Grade</th>
                                    <th style={{ width: '100px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {studentsBySection[selectedSection].map(student => {
                                    const color = avatarColor(student.first_name ?? 'A');
                                    const currentGrade = student.grade || '';
                                    const editedGrade = editedGrades[student.auth_user_id] ?? currentGrade;
                                    const isChanged = editedGrade !== currentGrade;
                                    
                                    return (
                                        <tr key={student.id} className="hoverable-row">
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${color}, ${color}bb)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                                        {student.first_name?.[0]?.toUpperCase() ?? '?'}
                                                    </div>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-bright)', fontSize: '0.88rem' }}>
                                                        <UserClickableName userId={student.id} userName={`${student.first_name} ${student.last_name}`} />
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                {student.course || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>Not specified</span>}
                                            </td>
                                            <td>
                                                {student.company?.name ? (
                                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{student.company.name}</span>
                                                ) : (
                                                    <span style={{ fontSize: '0.85rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>Unassigned</span>
                                                )}
                                            </td>
                                            <td>
                                                <input 
                                                    type="text" 
                                                    value={editedGrade}
                                                    onChange={(e) => handleGradeChange(student.auth_user_id, e.target.value)}
                                                    placeholder="Enter grade..."
                                                    className="form-input"
                                                    style={{ 
                                                        padding: '0.5rem 0.75rem', 
                                                        width: '120px', 
                                                        background: isChanged ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-elevated)',
                                                        border: isChanged ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid var(--border)'
                                                    }}
                                                />
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => saveGrade(student.auth_user_id)}
                                                    disabled={!isChanged || savingId === student.auth_user_id}
                                                    style={{
                                                        padding: '0.4rem 0.8rem',
                                                        borderRadius: '8px',
                                                        background: isChanged ? 'var(--primary)' : 'var(--bg-elevated)',
                                                        color: isChanged ? '#fff' : 'var(--text-muted)',
                                                        border: 'none',
                                                        cursor: isChanged ? 'pointer' : 'not-allowed',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 600,
                                                        transition: 'all 0.2s',
                                                        opacity: savingId === student.auth_user_id ? 0.7 : 1
                                                    }}
                                                >
                                                    {savingId === student.auth_user_id ? 'Saving...' : isChanged ? 'Save' : 'Saved'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
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

export default GradesView;
