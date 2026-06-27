import React, { useState, useEffect } from 'react';
import { adminService, type Department } from '../services/adminService';
import type { Profile } from '../services/profileService';
import { supabase } from '../lib/supabaseClient';
import { TableSkeleton, CardSkeleton } from './Skeletons';
import CustomSelect from './CustomSelect';
import UserClickableName from './UserClickableName';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';

const AdminDepartmentsView: React.FC = () => {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [coordinators, setCoordinators] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);

    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // For assigning a coordinator to a department
    const [assigningUserId, setAssigningUserId] = useState<string | null>(null);

    // Editing department state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [updating, setUpdating] = useState(false);

    const {
        currentPage: deptPage,
        setCurrentPage: setDeptPage,
        totalPages: deptTotalPages,
        paginatedItems: paginatedDeps,
        totalItems: deptTotalItems,
        itemsPerPage: deptItemsPerPage
    } = usePagination(departments, 10);

    const {
        currentPage: coordPage,
        setCurrentPage: setCoordPage,
        totalPages: coordTotalPages,
        paginatedItems: paginatedCoords,
        totalItems: coordTotalItems,
        itemsPerPage: coordItemsPerPage
    } = usePagination(coordinators, 10);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [deps, coords] = await Promise.all([
                adminService.getDepartments(),
                adminService.getAllCoordinators()
            ]);
            setDepartments(deps);
            setCoordinators(coords);
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
            const newDep = await adminService.createDepartment(newName, newDesc);
            setDepartments([...departments, newDep]);
            setIsCreating(false);
            setNewName('');
            setNewDesc('');
        } catch (error: any) {
            alert(error.message || 'Failed to create department');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdate = async (id: string) => {
        if (!editName.trim()) return;
        setUpdating(true);
        try {
            const updated = await adminService.updateDepartment(id, editName, editDesc);
            setDepartments(departments.map(d => d.id === id ? updated : d));
            setEditingId(null);
        } catch (error: any) {
            alert(error.message || 'Failed to update department');
        } finally {
            setUpdating(false);
        }
    };

    const handleAssignCoordinator = async (userId: string, departmentId: string) => {
        setAssigningUserId(userId);
        try {
            const { error } = await supabase.rpc('admin_assign_department', {
                target_user_id: userId,
                new_department_id: departmentId || null,
            });

            if (error) throw error;

            setCoordinators(coordinators.map(c =>
                c.auth_user_id === userId ? { ...c, department_id: departmentId || null } : c
            ));

            await adminService.logAction('assign_department', 'profiles', userId, { department_id: departmentId });
        } catch (err) {
            alert('Failed to assign department');
        } finally {
            setAssigningUserId(null);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete the ${name} department? Coordinators in this department will be unassigned.`)) return;

        try {
            const { error } = await supabase.from('departments').delete().eq('id', id);
            if (error) throw error;

            setDepartments(departments.filter(d => d.id !== id));
            setCoordinators(coordinators.map(c => c.department_id === id ? { ...c, department_id: null } : c));

            await adminService.logAction('delete_department', 'departments', id, { name });
        } catch (err) {
            alert('Failed to delete department. It might be referenced elsewhere.');
        }
    };

    if (loading) return (
        <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            <div className="admin-table-card">
                <div className="admin-table-header">
                    <div className="admin-table-title">Departments</div>
                    <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>Manage academic departments.</div>
                </div>
                <TableSkeleton rows={4} cols={3} />
            </div>
            <div className="admin-table-card">
                <div className="admin-table-header">
                    <div className="admin-table-title">Assign Coordinators</div>
                    <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>Link coordinators to departments.</div>
                </div>
                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <CardSkeleton height={80} />
                    <CardSkeleton height={80} />
                    <CardSkeleton height={80} />
                </div>
            </div>
        </div>
    );

    return (
        <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>

            {/* LEFT COLUMN: Department List */}
            <div>
                <div className="admin-table-card" style={{ marginBottom: '1.5rem' }}>
                    <div className="admin-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div className="admin-table-title">Departments</div>
                            <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>Manage academic departments.</div>
                        </div>
                        <button className="primary" onClick={() => setIsCreating(!isCreating)}>
                            {isCreating ? 'Cancel' : 'Add Department'}
                        </button>
                    </div>

                    {isCreating && (
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--admin-border)', background: 'var(--bg-elevated)' }}>
                            <form onSubmit={handleCreate}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        Department Name *
                                        <input
                                            value={newName} onChange={e => setNewName(e.target.value)}
                                            placeholder="e.g., Information Technology (IT)"
                                            style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-page)', border: '1px solid var(--admin-border)', borderRadius: 8, color: 'var(--text-primary)', marginTop: '0.4rem', outline: 'none' }}
                                            required
                                        />
                                    </label>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        Description (Optional)
                                        <input
                                            value={newDesc} onChange={e => setNewDesc(e.target.value)}
                                            placeholder="Brief description"
                                            style={{ width: '100%', padding: '0.65rem', background: 'var(--bg-page)', border: '1px solid var(--admin-border)', borderRadius: 8, color: 'var(--text-primary)', marginTop: '0.4rem', outline: 'none' }}
                                        />
                                    </label>
                                </div>
                                <button type="submit" className="primary" disabled={submitting}>
                                    {submitting ? 'Creating...' : 'Create Department'}
                                </button>
                            </form>
                        </div>
                    )}

                    {departments.length === 0 && !isCreating ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--admin-text-secondary)' }}>No departments created yet.</div>
                    ) : (
                        <>
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Description</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedDeps.map(dep => (
                                    <tr key={dep.id}>
                                        {editingId === dep.id ? (
                                            <>
                                                <td>
                                                    <input
                                                        value={editName}
                                                        onChange={e => setEditName(e.target.value)}
                                                        style={{ 
                                                            width: '100%', 
                                                            padding: '0.4rem 0.6rem', 
                                                            background: 'var(--bg-page)', 
                                                            border: '1px solid var(--admin-primary)', 
                                                            borderRadius: 6, 
                                                            color: 'var(--text-primary)', 
                                                            outline: 'none',
                                                            fontSize: '0.85rem'
                                                        }}
                                                        required
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        value={editDesc}
                                                        onChange={e => setEditDesc(e.target.value)}
                                                        style={{ 
                                                            width: '100%', 
                                                            padding: '0.4rem 0.6rem', 
                                                            background: 'var(--bg-page)', 
                                                            border: '1px solid var(--admin-border)', 
                                                            borderRadius: 6, 
                                                            color: 'var(--text-primary)', 
                                                            outline: 'none',
                                                            fontSize: '0.85rem'
                                                        }}
                                                    />
                                                </td>
                                                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <button
                                                        className="role-select"
                                                        style={{ color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)', padding: '0.3rem 0.6rem', fontSize: '0.75rem', marginRight: '0.5rem', fontWeight: 600 }}
                                                        onClick={() => handleUpdate(dep.id)}
                                                        disabled={updating}
                                                    >
                                                        {updating ? '...' : 'Save'}
                                                    </button>
                                                    <button
                                                        className="role-select"
                                                        style={{ color: 'var(--text-muted)', borderColor: 'var(--admin-border)', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                                        onClick={() => setEditingId(null)}
                                                        disabled={updating}
                                                    >
                                                        Cancel
                                                    </button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td style={{ fontWeight: 600, color: 'var(--admin-text-primary)' }}>{dep.name}</td>
                                                <td style={{ color: 'var(--admin-text-secondary)', fontSize: '0.85rem' }}>{dep.description || '-'}</td>
                                                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <button
                                                        className="role-select"
                                                        style={{ color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.3)', padding: '0.3rem 0.6rem', fontSize: '0.75rem', marginRight: '0.5rem' }}
                                                        onClick={() => {
                                                            setEditingId(dep.id);
                                                            setEditName(dep.name);
                                                            setEditDesc(dep.description || '');
                                                        }}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        className="role-select"
                                                        style={{ color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.3)', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                                        onClick={() => handleDelete(dep.id, dep.name)}
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div style={{ marginTop: '1rem' }}>
                            {departments.length > 0 && (
                                <Pagination
                                    currentPage={deptPage}
                                    totalPages={deptTotalPages}
                                    totalItems={deptTotalItems}
                                    itemsPerPage={deptItemsPerPage}
                                    onPageChange={setDeptPage}
                                    itemName="departments"
                                />
                            )}
                        </div>
                        </>
                    )}
                </div>
            </div>

            {/* RIGHT COLUMN: Coordinator Assignments */}
            <div>
                <div className="admin-table-card">
                    <div className="admin-table-header">
                        <div className="admin-table-title">Assign Coordinators</div>
                        <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>Link coordinators to departments.</div>
                    </div>

                    <div style={{ padding: '0 1rem' }}>
                        {paginatedCoords.map(coord => (
                            <div key={coord.id} style={{ padding: '1rem 0', borderBottom: '1px solid var(--admin-border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div className="admin-user-avatar" style={{ width: 28, height: 28, fontSize: '0.8rem' }}>
                                        {coord.first_name?.[0]}{coord.last_name?.[0]}
                                    </div>
                                    <div>
                                        <div style={{ color: 'var(--admin-text-primary)', fontSize: '0.9rem', fontWeight: 500 }}><UserClickableName userId={coord.id} userName={`${coord.first_name} ${coord.last_name}`} /></div>
                                        <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.75rem' }}>{coord.email}</div>
                                    </div>
                                </div>

                                <CustomSelect
                                    value={coord.department_id || ''}
                                    onChange={(val) => handleAssignCoordinator(coord.auth_user_id, val)}
                                    disabled={assigningUserId === coord.auth_user_id}
                                    placeholder="-- No Department Assigned --"
                                    options={[
                                        { value: '', label: '-- No Department Assigned --' },
                                        ...departments.map(d => ({ value: d.id, label: d.name }))
                                    ]}
                                    style={{ marginTop: '0.5rem' }}
                                />
                            </div>
                        ))}
                        {coordinators.length > 0 && (
                            <div style={{ padding: '1rem 0' }}>
                                <Pagination
                                    currentPage={coordPage}
                                    totalPages={coordTotalPages}
                                    totalItems={coordTotalItems}
                                    itemsPerPage={coordItemsPerPage}
                                    onPageChange={setCoordPage}
                                    itemName="coordinators"
                                />
                            </div>
                        )}
                        {coordinators.length === 0 && (
                            <div style={{ padding: '2rem 0', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No coordinators found in the system.</div>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
};

export default AdminDepartmentsView;
