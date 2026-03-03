import React, { useState, useEffect } from 'react';
import { adminService } from '../services/adminService';
import type { Profile } from '../services/profileService';
import { TableSkeleton } from './Skeletons';

const defaultPermissions = {
    can_approve_journals: true,
    can_edit_grades: true,
    can_export_reports: true,
    can_delete_students: false
};

const AdminRoleManagementView: React.FC = () => {
    const [coordinators, setCoordinators] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadCoordinators();
    }, []);

    const loadCoordinators = async () => {
        setLoading(true);
        try {
            const data = await adminService.getAllCoordinators();
            setCoordinators(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectUser = (user: Profile) => {
        setSelectedUser({ ...user });
    };

    const handleUpdatePermissions = async () => {
        if (!selectedUser) return;
        setSaving(true);
        try {
            await adminService.updateUserPermissions(selectedUser.auth_user_id, selectedUser.permissions || defaultPermissions);
            await adminService.logAction('update_permissions', 'profiles', selectedUser.auth_user_id, { permissions: selectedUser.permissions });
            // Update local state
            setCoordinators(coordinators.map(c => c.id === selectedUser.id ? selectedUser : c));
            alert('Permissions updated successfully.');
        } catch (error) {
            alert('Failed to update permissions.');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleStatus = async () => {
        if (!selectedUser) return;
        const newStatus = !(selectedUser.is_active ?? true);
        if (!confirm(`Are you sure you want to ${newStatus ? 'activate' : 'deactivate'} this account?`)) return;

        setSaving(true);
        try {
            await adminService.setUserActiveStatus(selectedUser.auth_user_id, newStatus);
            await adminService.logAction(newStatus ? 'activate_account' : 'deactivate_account', 'profiles', selectedUser.auth_user_id);

            const updatedUser = { ...selectedUser, is_active: newStatus };
            setSelectedUser(updatedUser);
            setCoordinators(coordinators.map(c => c.id === updatedUser.id ? updatedUser : c));
        } catch (e) {
            alert('Failed to update status.');
        } finally {
            setSaving(false);
        }
    };

    const handleUnlockAccount = async () => {
        if (!selectedUser) return;
        setSaving(true);
        try {
            await adminService.unlockUserAccount(selectedUser.auth_user_id);
            await adminService.logAction('unlock_account', 'profiles', selectedUser.auth_user_id);

            const updatedUser = { ...selectedUser, failed_login_attempts: 0, locked_until: null };
            setSelectedUser(updatedUser);
            setCoordinators(coordinators.map(c => c.id === updatedUser.id ? updatedUser : c));
            alert('Account unlocked.');
        } catch (e) {
            alert('Failed to unlock account.');
        } finally {
            setSaving(false);
        }
    };

    const handlePermissionChange = (key: string, value: boolean) => {
        if (!selectedUser) return;
        const currentPerms = selectedUser.permissions || defaultPermissions;
        setSelectedUser({ ...selectedUser, permissions: { ...currentPerms, [key]: value } });
    };

    const filteredCoordinators = coordinators.filter(c =>
        c.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return (
        <div className="fade-in">
            <div className="admin-table-card">
                <div className="admin-table-header">
                    <div className="admin-table-title">Role & Permission Management</div>
                    <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>Manage coordinator accounts and granular access.</div>
                </div>
                <TableSkeleton rows={6} cols={5} />
            </div>
        </div>
    );

    return (
        <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 350px' : '1fr', gap: '1.5rem', alignItems: 'start' }}>

            {/* LEFT COLUMN: Coordinator List */}
            <div>
                <div className="admin-table-card">
                    <div className="admin-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div className="admin-table-title">Role & Permission Management</div>
                            <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>Manage coordinator accounts and granular access.</div>
                        </div>
                        <input
                            type="text"
                            placeholder="Find coordinator..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ padding: '0.5rem', background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', borderRadius: 8, color: 'var(--admin-text-primary)', outline: 'none', minWidth: '200px' }}
                        />
                    </div>

                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Lock State</th>
                                <th style={{ textAlign: 'right' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCoordinators.map(c => (
                                <tr key={c.id} style={{ background: selectedUser?.id === c.id ? 'rgba(16, 185, 129, 0.05)' : 'transparent' }}>
                                    <td style={{ fontWeight: 600, color: 'var(--admin-text-primary)' }}>{c.first_name} {c.last_name}</td>
                                    <td style={{ color: 'var(--admin-text-secondary)' }}>{c.email}</td>
                                    <td>
                                        <span className={`admin-badge ${c.is_active !== false ? 'badge-active' : 'badge-student'}`}>
                                            {c.is_active !== false ? 'ACTIVE' : 'DEACTIVATED'}
                                        </span>
                                    </td>
                                    <td>
                                        {c.locked_until && new Date(c.locked_until) > new Date() ? (
                                            <span style={{ color: '#f43f5e', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', background: 'rgba(244, 63, 94, 0.1)', borderRadius: 4 }}>
                                                LOCKED
                                            </span>
                                        ) : (
                                            <span style={{ color: '#10b981', fontSize: '0.75rem' }}>Normal</span>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button className="primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={() => handleSelectUser(c)}>
                                            Manage
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* RIGHT COLUMN: Permission Editor */}
            {selectedUser && (
                <div className="admin-table-card" style={{ position: 'sticky', top: '1.5rem', padding: '1.5rem' }}>
                    <div className="admin-table-header" style={{ padding: '0 0 1rem 0', borderBottom: '1px solid var(--admin-border)', marginBottom: '1.5rem', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                        <div className="admin-table-title" style={{ fontSize: '1.1rem', color: 'var(--admin-text-primary)', marginBottom: 0 }}>{selectedUser.first_name} {selectedUser.last_name}</div>
                        <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.8rem', wordBreak: 'break-all' }}>{selectedUser.email}</div>
                    </div>

                    <div style={{ marginBottom: '2rem' }}>
                        <h4 style={{ fontSize: '0.9rem', color: 'var(--admin-text-primary)', marginBottom: '1rem' }}>Account Status</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <button
                                className="role-select"
                                style={{
                                    background: selectedUser.is_active !== false ? 'rgba(248, 113, 113, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                    color: selectedUser.is_active !== false ? '#f87171' : '#10b981',
                                    borderColor: 'transparent'
                                }}
                                onClick={handleToggleStatus}
                                disabled={saving}
                            >
                                {selectedUser.is_active !== false ? 'Deactivate Account' : 'Activate Account'}
                            </button>
                            <button
                                className="role-select"
                                onClick={handleUnlockAccount}
                                disabled={saving || (!selectedUser.locked_until && (selectedUser.failed_login_attempts || 0) === 0)}
                            >
                                Unlock Account
                            </button>
                        </div>
                    </div>

                    <div>
                        <h4 style={{ fontSize: '0.9rem', color: 'var(--admin-text-primary)', marginBottom: '1rem' }}>Granular Permissions</h4>

                        {(['can_approve_journals', 'can_edit_grades', 'can_export_reports', 'can_delete_students'] as const).map(key => {
                            const perms = selectedUser.permissions || defaultPermissions;
                            const isGranted = !!perms[key];
                            const label = key.replace(/_/g, ' ').replace('can ', 'Can ');

                            return (
                                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', cursor: 'pointer', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                                    <div style={{
                                        width: '36px', height: '20px', background: isGranted ? '#10b981' : 'rgba(255,255,255,0.1)',
                                        borderRadius: '10px', position: 'relative', transition: 'all 0.2s'
                                    }}>
                                        <div style={{
                                            width: '16px', height: '16px', background: 'white', borderRadius: '50%',
                                            position: 'absolute', top: '2px', left: isGranted ? '18px' : '2px', transition: 'all 0.2s'
                                        }} />
                                    </div>
                                    <input type="checkbox" checked={isGranted} onChange={e => handlePermissionChange(key, e.target.checked)} style={{ display: 'none' }} />
                                    <span style={{ fontSize: '0.85rem', color: 'var(--admin-text-secondary)', textTransform: 'capitalize' }}>{label}</span>
                                </label>
                            );
                        })}

                        <button className="primary" style={{ width: '100%', marginTop: '1rem' }} onClick={handleUpdatePermissions} disabled={saving}>
                            {saving ? 'Saving...' : 'Save Permissions'}
                        </button>
                    </div>

                </div>
            )}

        </div>
    );
};

export default AdminRoleManagementView;
