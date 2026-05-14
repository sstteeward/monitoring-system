import React, { useEffect, useState } from 'react';
import { coordinatorService } from '../services/coordinatorService';
import type { Profile } from '../services/profileService';
import { TableSkeleton } from './Skeletons';
import UserProfileModal from './UserProfileModal';
import UserClickableName from './UserClickableName';
import CustomSelect from './CustomSelect';
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
    const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
    const [selectedYear, setSelectedYear] = useState<string | null>(null);
    const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);

    // Section Renaming State
    const [departmentId, setDepartmentId] = useState<string | null>(null);
    const [isEditingSection, setIsEditingSection] = useState(false);
    const [newSectionName, setNewSectionName] = useState('');
    const [savingSection, setSavingSection] = useState(false);

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
                    setDepartmentId(dept.id);
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

    const handleRenameSection = async () => {
        if (!selectedGroupKey || !selectedGroup) return;
        const newName = newSectionName.trim();
        if (!newName) {
            alert('Section name cannot be empty.');
            return;
        }
        
        setSavingSection(true);
        try {
            await coordinatorService.bulkUpdateSectionName(
                selectedGroup.section, 
                newName, 
                departmentId || undefined,
                selectedGroup.course,
                selectedGroup.year
            );
            
            // Reload students so they fall into the new section properly
            await loadStudents();
            
            // Update selectedGroupKey to reflect the new section name so they stay in the view
            setSelectedGroupKey(`${selectedGroup.course}|${selectedGroup.year}|${newName}`);
            setIsEditingSection(false);
        } catch (err: any) {
            alert('Failed to rename section: ' + err.message);
        } finally {
            setSavingSection(false);
        }
    };

    const avatarColor = (name: string) => {
        const colors = ['#10b981', '#3b82f6', '#0d9488', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899'];
        return colors[(name.charCodeAt(0) ?? 0) % colors.length];
    };

    // Group students by course, year and section
    const groups = students.reduce((acc, student) => {
        const course = student.course?.trim() || 'Unassigned Course';
        const year = student.year_level?.trim() || 'Unassigned Year';
        const section = student.section?.trim() || 'Unassigned Section';
        const key = `${course}|${year}|${section}`;
        
        if (!acc[key]) {
            acc[key] = { course, year, section, students: [] };
        }
        acc[key].students.push(student);
        return acc;
    }, {} as Record<string, { course: string, year: string, section: string, students: Profile[] }>);

    // Group the keys by course then year
    const keysByCourseAndYear = Object.values(groups).reduce((acc, group) => {
        if (!acc[group.course]) acc[group.course] = {};
        if (!acc[group.course][group.year]) acc[group.course][group.year] = [];
        acc[group.course][group.year].push(group);
        return acc;
    }, {} as Record<string, Record<string, { course: string, year: string, section: string, students: Profile[] }[]>>);

    const sortedCourses = Object.keys(keysByCourseAndYear).sort((a, b) => {
        if (a === 'Unassigned Course') return 1;
        if (b === 'Unassigned Course') return -1;
        return a.localeCompare(b);
    });

    let selectedGroup = selectedGroupKey ? groups[selectedGroupKey] : null;
    if (selectedGroupKey && !selectedGroup) {
        const [c, y, s] = selectedGroupKey.split('|');
        selectedGroup = { course: c, year: y, section: s, students: [] };
    }

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
            ) : !selectedCourse ? (
                // LEVEL 1: COURSES
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', paddingBottom: '2rem' }}>
                    {sortedCourses.map(course => {
                        let totalStudents = 0;
                        Object.values(keysByCourseAndYear[course]).forEach(yearGroups => {
                            yearGroups.forEach(g => { totalStudents += g.students.length; });
                        });
                        
                        return (
                            <div 
                                key={course} 
                                className="glass-card hoverable-card"
                                onClick={() => setSelectedCourse(course)}
                                style={{ 
                                    padding: '2rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '1rem',
                                    border: '1px solid var(--border)', transition: 'all 0.2s ease'
                                }}
                                onMouseOver={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                                onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{
                                        width: 56, height: 56, borderRadius: 16,
                                        background: 'rgba(16, 185, 129, 0.1)', color: 'var(--primary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                                            <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                                        </svg>
                                    </div>
                                    <div>
                                        <h2 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-bright)', fontSize: '1.4rem' }}>
                                            {course === 'Unassigned Course' ? 'Other / Unassigned' : course}
                                        </h2>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                            {totalStudents} student{totalStudents !== 1 ? 's' : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : !selectedYear ? (
                // LEVEL 2: YEARS
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
                    <button 
                        onClick={() => setSelectedCourse(null)}
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
                        Back to Courses
                    </button>
                    
                    <h2 style={{ margin: '0 0 1rem 0', color: 'var(--primary)', fontSize: '1.5rem' }}>
                        {selectedCourse === 'Unassigned Course' ? 'Other / Unassigned' : selectedCourse}
                    </h2>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                        {
                            (function() {
                                const existingYears = Object.keys(keysByCourseAndYear[selectedCourse] || {});
                                const fixedYears = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
                                const allYears = Array.from(new Set([...fixedYears, ...existingYears])).sort((a, b) => {
                                    if (a === 'Unassigned Year') return 1;
                                    if (b === 'Unassigned Year') return -1;
                                    return a.localeCompare(b, undefined, { numeric: true });
                                });

                                return allYears.map(year => {
                                    let totalStudents = 0;
                                    const yearGroups = keysByCourseAndYear[selectedCourse]?.[year] || [];
                                    yearGroups.forEach(g => { totalStudents += g.students.length; });
                                    
                                    return (
                                        <div 
                                            key={year} 
                                    className="glass-card hoverable-card"
                                    onClick={() => setSelectedYear(year)}
                                    style={{ 
                                        padding: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem',
                                        border: '1px solid var(--border)', transition: 'all 0.2s ease'
                                    }}
                                    onMouseOver={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                                    onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
                                >
                                    <div style={{
                                        width: 48, height: 48, borderRadius: 12,
                                        background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                            <line x1="16" y1="2" x2="16" y2="6"></line>
                                            <line x1="8" y1="2" x2="8" y2="6"></line>
                                            <line x1="3" y1="10" x2="21" y2="10"></line>
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-bright)', fontSize: '1.2rem' }}>
                                            {year === 'Unassigned Year' ? 'Other / Unassigned' : year}
                                        </h3>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            {yearGroups.length} Section{yearGroups.length !== 1 ? 's' : ''} • {totalStudents} Student{totalStudents !== 1 ? 's' : ''}
                                        </div>
                                    </div>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </div>
                            );
                        });
                        })()
                    }
                    </div>
                </div>
            ) : !selectedGroup ? (
                // LEVEL 3: SECTIONS
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
                    <button 
                        onClick={() => setSelectedYear(null)}
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
                        Back to Years
                    </button>

                    <div>
                        <h2 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)', fontSize: '1.5rem' }}>
                            {selectedCourse === 'Unassigned Course' ? 'Other / Unassigned' : selectedCourse}
                        </h2>
                        <h3 style={{ margin: 0, color: 'var(--text-bright)', fontSize: '1.2rem' }}>
                            {selectedYear === 'Unassigned Year' ? 'Other / Unassigned Year' : selectedYear}
                        </h3>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
                        {
                            (function() {
                                const yearGroups = keysByCourseAndYear[selectedCourse]?.[selectedYear] || [];
                                const existingSections = yearGroups.map(g => g.section);
                                const fixedSections = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
                                const allSections = Array.from(new Set([...fixedSections, ...existingSections])).sort((a, b) => {
                                    if (a === 'Unassigned Section') return 1;
                                    if (b === 'Unassigned Section') return -1;
                                    return a.localeCompare(b, undefined, { numeric: true });
                                });

                                return allSections.map(secName => {
                                    const group = yearGroups.find(g => g.section === secName);
                                    const numStudents = group ? group.students.length : 0;
                                    const groupKey = `${selectedCourse}|${selectedYear}|${secName}`;
                                    
                                    return (
                                        <div 
                                            key={groupKey} 
                                            className="glass-card hoverable-card" 
                                            onClick={() => setSelectedGroupKey(groupKey)}
                                            style={{ 
                                                padding: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem',
                                                transition: 'all 0.2s ease', border: '1px solid var(--border)'
                                            }}
                                            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                                            onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
                                        >
                                            <div style={{
                                                width: 48, height: 48, borderRadius: 12,
                                                background: 'rgba(16, 185, 129, 0.1)', color: 'var(--primary)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                                                </svg>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: 'var(--text-bright)', fontWeight: 700 }}>
                                                    {secName === 'Unassigned Section' ? 'Unassigned Section' : `Section ${secName}`}
                                                </h3>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    {numStudents} student{numStudents !== 1 ? 's' : ''}
                                                </div>
                                            </div>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                                                <polyline points="9 18 15 12 9 6" />
                                            </svg>
                                        </div>
                                    );
                                });
                            })()
                        }
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '2rem' }}>
                    <button 
                        onClick={() => setSelectedGroupKey(null)}
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
                            
                            {isEditingSection ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-bright)', fontWeight: 700 }}>
                                        {selectedGroup.course !== 'Unassigned Course' ? `${selectedGroup.course} - ` : ''}
                                        {selectedGroup.year !== 'Unassigned Year' ? `${selectedGroup.year} - ` : ''}
                                    </h3>
                                    <div style={{ width: '150px' }}>
                                        <CustomSelect
                                            value={newSectionName}
                                            onChange={setNewSectionName}
                                            placeholder="Select Section"
                                            style={{ padding: '0.4rem 0.6rem', fontSize: '0.9rem' }}
                                            options={[
                                                { value: 'A', label: 'A' },
                                                { value: 'B', label: 'B' },
                                                { value: 'C', label: 'C' },
                                                { value: 'D', label: 'D' },
                                                { value: 'E', label: 'E' },
                                                { value: 'F', label: 'F' },
                                                { value: 'G', label: 'G' },
                                                { value: 'H', label: 'H' },
                                                { value: 'I', label: 'I' },
                                                { value: 'J', label: 'J' },
                                            ]}
                                        />
                                    </div>
                                    <button 
                                        onClick={handleRenameSection}
                                        disabled={savingSection}
                                        style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.3rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, opacity: savingSection ? 0.7 : 1 }}
                                    >
                                        {savingSection ? 'Saving...' : 'Save'}
                                    </button>
                                    <button 
                                        onClick={() => setIsEditingSection(false)}
                                        disabled={savingSection}
                                        style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-bright)', fontWeight: 700 }}>
                                        {selectedGroup.course !== 'Unassigned Course' ? `${selectedGroup.course} - ` : ''}
                                        {selectedGroup.year !== 'Unassigned Year' ? `${selectedGroup.year} - ` : ''}
                                        {selectedGroup.section === 'Unassigned Section' ? 'Unassigned Section' : `Section ${selectedGroup.section}`}
                                    </h3>
                                    
                                    <button 
                                        onClick={() => {
                                            setNewSectionName(selectedGroup.section === 'Unassigned Section' ? '' : selectedGroup.section);
                                            setIsEditingSection(true);
                                        }}
                                        title="Rename Section"
                                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '6px', transition: 'all 0.2s' }}
                                        onMouseOver={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'; }}
                                        onMouseOut={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 20h9"></path>
                                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                        </svg>
                                    </button>
                                </div>
                            )}

                            <span style={{ marginLeft: 'auto', background: 'var(--bg-elevated)', padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                {selectedGroup.students.length} Students
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
                                {selectedGroup.students.map(student => {
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
