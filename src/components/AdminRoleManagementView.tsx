import React, { useState, useEffect } from 'react';
import { adminService } from '../services/adminService';
import type { Profile } from '../services/profileService';
import { TableSkeleton } from './Skeletons';
import UserClickableName from './UserClickableName';


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

    // Promotion Search
    const [promoSearchQuery, setPromoSearchQuery] = useState('');
    const [promoResults, setPromoResults] = useState<Profile[]>([]);
    const [isSearchingPromo, setIsSearchingPromo] = useState(false);
    const [showPromoSearch, setShowPromoSearch] = useState(false);

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
        const currentStatus = selectedUser.is_active ?? false;
        const newStatus = !currentStatus;
        if (!confirm(`Are you sure you want to ${newStatus ? 'activate' : 'deactivate'} this account?`)) return;

        setSaving(true);
        try {
            await adminService.setUserActiveStatus(selectedUser.auth_user_id, newStatus);
            await adminService.logAction(newStatus ? 'activate_account' : 'deactivate_account', 'profiles', selectedUser.auth_user_id);

            const updatedUser = { ...selectedUser, is_active: newStatus };
            setSelectedUser(updatedUser);
            setCoordinators(coordinators.map(c => c.id === updatedUser.id ? updatedUser : c));
            alert(`Account ${newStatus ? 'activated' : 'deactivated'} successfully.`);
        } catch (e: any) {
            console.error('Status update error:', e);
            const msg = e?.message || (typeof e === 'string' ? e : 'Unknown error');
            alert(`Failed to update status: ${msg}`);
        } finally {
            setSaving(false);
        }
    };

    const handlePromoteUser = async (user: Profile) => {
        if (!confirm(`Are you sure you want to promote ${user.first_name} ${user.last_name} to Coordinator?`)) return;

        setSaving(true);
        try {
            // First update role to coordinator
            await adminService.updateUserRole(user.auth_user_id, 'coordinator');
            // Then activate them automatically
            await adminService.setUserActiveStatus(user.auth_user_id, true);
            
            await adminService.logAction('promote_to_coordinator', 'profiles', user.auth_user_id);
            
            // Re-fetch list
            await loadCoordinators();
            setShowPromoSearch(false);
            setPromoSearchQuery('');
            setPromoResults([]);
            alert('User promoted to Coordinator successfully.');
        } catch (e: any) {
            console.error('Promotion error:', e);
            alert('Failed to promote user: ' + (e?.message || 'Check logs'));
        } finally {
            setSaving(false);
        }
    };

    const handlePromoSearch = async (val: string) => {
        setPromoSearchQuery(val);
        if (val.length < 2) {
            setPromoResults([]);
            return;
        }
        setIsSearchingPromo(true);
        try {
            const results = await adminService.searchProfiles(val);
            // Filter out existing coordinators
            setPromoResults(results.filter(p => p.account_type !== 'coordinator'));
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearchingPromo(false);
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
            <div style={{ minWidth: 0 }}>
                <div className="admin-table-card">
                    <div className="admin-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <div className="admin-table-title">Role & Permission Management</div>
                            <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>Manage coordinator accounts and granular access.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <button
                                className="primary"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    padding: '0.5rem 0.75rem', fontSize: '0.85rem'
                                }}
                                onClick={() => setShowPromoSearch(!showPromoSearch)}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
                                {showPromoSearch ? 'Close' : 'Promote User'}
                            </button>
                            <input
                                type="text"
                                placeholder="Find coordinator..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ padding: '0.5rem 0.75rem', background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', borderRadius: 8, color: 'var(--admin-text-primary)', outline: 'none', minWidth: '220px', fontSize: '0.85rem' }}
                            />
                        </div>
                    </div>

                    {showPromoSearch && (
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--admin-border)', background: 'rgba(59, 130, 246, 0.03)' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--admin-text-secondary)', marginBottom: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Promote User to Coordinator</div>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    placeholder="Search by name or email..."
                                    value={promoSearchQuery}
                                    onChange={(e) => handlePromoSearch(e.target.value)}
                                    autoFocus
                                    style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', borderRadius: 10, color: 'var(--admin-text-primary)', outline: 'none', fontSize: '0.9rem' }}
                                />
                                {isSearchingPromo && (
                                    <div style={{ position: 'absolute', right: '12px', top: '10px' }}>
                                        <div className="admin-spinner-small" />
                                    </div>
                                )}
                            </div>

                            {promoResults.length > 0 && (
                                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', padding: '0.25rem' }}>
                                    {promoResults.map(p => (
                                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--admin-text-primary)' }}>{p.first_name} {p.last_name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-secondary)' }}>{p.email} • {p.account_type}</div>
                                            </div>
                                            <button
                                                className="primary"
                                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                                onClick={() => handlePromoteUser(p)}
                                                disabled={saving}
                                            >
                                                Make Coordinator
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {promoSearchQuery.length >= 2 && !isSearchingPromo && promoResults.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--admin-text-secondary)', fontSize: '0.85rem' }}>No results found.</div>
                            )}
                        </div>
                    )}

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
                                <tr key={c.id} style={{ background: selectedUser?.id === c.id ? 'var(--nav-active-bg)' : 'transparent' }}>
                                    <td style={{ fontWeight: 600, color: 'var(--admin-text-primary)' }}>
                                        <UserClickableName userId={c.id} userName={`${c.first_name} ${c.last_name}`} />
                                    </td>
                                    <td style={{ color: 'var(--admin-text-secondary)' }}>{c.email}</td>
                                    <td>
                                        <span className="admin-badge" style={{
                                            background: c.is_active === true ? 'rgba(16, 185, 129, 0.12)' : c.is_active === false ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                            color: c.is_active === true ? '#23c55e' : c.is_active === false ? '#f59e0b' : '#ef4444'
                                        }}>
                                            {c.is_active === true ? 'ACTIVE' : c.is_active === false ? 'PENDING' : 'INACTIVE'}
                                        </span>
                                    </td>
                                    <td>
                                        {c.locked_until && new Date(c.locked_until) > new Date() ? (
                                            <span style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 4 }}>
                                                LOCKED
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--primary)', fontSize: '0.75rem' }}>Normal</span>
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
                        <div className="admin-table-title" style={{ fontSize: '1.1rem', color: 'var(--admin-text-primary)', marginBottom: 0 }}>
                            {selectedUser.first_name} {selectedUser.last_name}
                        </div>
                        <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                            {selectedUser.email}
                        </div>
                    </div>

                    <div style={{ marginBottom: '2rem' }}>
                        <h4 style={{ fontSize: '0.9rem', color: 'var(--admin-text-primary)', marginBottom: '1rem' }}>Account Status</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <button
                                className="role-select"
                                style={{
                                    background: selectedUser.is_active !== false ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                    color: selectedUser.is_active !== false ? 'var(--danger)' : 'var(--primary)',
                                    borderColor: 'transparent'
                                }}
                                onClick={handleToggleStatus}
                                disabled={saving}
                            >
                                {selectedUser.is_active !== false ? 'Deactivate Account' : 'Approve & Activate'}
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
                                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', cursor: 'pointer', background: 'var(--bg-elevated)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                                    <div style={{
                                        width: '36px', height: '20px', background: isGranted ? 'var(--primary)' : 'var(--border-strong)',
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
