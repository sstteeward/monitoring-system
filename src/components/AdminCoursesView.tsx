import React, { useState, useEffect } from 'react';
import { adminService, type Course } from '../services/adminService';
import { TableSkeleton } from './Skeletons';

const AdminCoursesView: React.FC = () => {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await adminService.getCourses();
            setCourses(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;
        setSubmitting(true);
        try {
            const course = await adminService.createCourse(newName.trim(), newDesc.trim() || undefined);
            setCourses([...courses, course].sort((a, b) => a.name.localeCompare(b.name)));
            setIsCreating(false);
            setNewName('');
            setNewDesc('');
        } catch (error: any) {
            alert(error.message || 'Failed to create course');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Delete the "${name}" course?`)) return;
        try {
            await adminService.deleteCourse(id, name);
            setCourses(courses.filter(c => c.id !== id));
        } catch {
            alert('Failed to delete course.');
        }
    };

    if (loading) return (
        <div className="admin-table-card">
            <div className="admin-table-header">
                <div className="admin-table-title">Courses</div>
            </div>
            <TableSkeleton rows={4} cols={3} />
        </div>
    );

    return (
        <div className="fade-in">
            <div className="admin-table-card">
                <div className="admin-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div className="admin-table-title">Courses</div>
                        <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>Manage available courses for student onboarding.</div>
                    </div>
                    <button className="primary" onClick={() => setIsCreating(!isCreating)}>
                        {isCreating ? 'Cancel' : 'Add Course'}
                    </button>
                </div>

                {isCreating && (
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--admin-border)', background: 'var(--bg-elevated)' }}>
                        <form onSubmit={handleCreate}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Course Name *
                                    <input
                                        value={newName} onChange={e => setNewName(e.target.value)}
                                        placeholder="e.g., Bachelor of Science in Information Technology"
                                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-page)', border: '1px solid var(--admin-border)', borderRadius: 8, color: 'var(--text-primary)', marginTop: '0.4rem', outline: 'none', boxSizing: 'border-box' }}
                                        required
                                    />
                                </label>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Short Name / Abbreviation (Optional)
                                    <input
                                        value={newDesc} onChange={e => setNewDesc(e.target.value)}
                                        placeholder="e.g., BSIT"
                                        style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-page)', border: '1px solid var(--admin-border)', borderRadius: 8, color: 'var(--text-primary)', marginTop: '0.4rem', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                </label>
                            </div>
                            <button type="submit" className="primary" disabled={submitting}>
                                {submitting ? 'Creating...' : 'Create Course'}
                            </button>
                        </form>
                    </div>
                )}

                {courses.length === 0 && !isCreating ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--admin-text-secondary)' }}>No courses created yet.</div>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Course Name</th>
                                <th>Abbreviation</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {courses.map(c => (
                                <tr key={c.id}>
                                    <td style={{ fontWeight: 600, color: 'var(--admin-text-primary)' }}>{c.name}</td>
                                    <td style={{ color: 'var(--admin-text-secondary)', fontSize: '0.85rem' }}>{c.description || '-'}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button
                                            className="role-select"
                                            style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                            onClick={() => handleDelete(c.id, c.name)}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default AdminCoursesView;
