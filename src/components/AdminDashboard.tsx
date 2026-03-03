import React, { useEffect, useState } from 'react';
import { profileService, type Profile } from '../services/profileService';
import { adminService } from '../services/adminService';
import { useTheme } from '../contexts/ThemeContext';
import CompaniesView from './CompaniesView';
import AdminSettingsView from './AdminSettingsView';
import AdminProfileView from './AdminProfileView';
import AdminFeedbackView from './AdminFeedbackView';
import AdminAuditLogView from './AdminAuditLogView';
import AdminDepartmentsView from './AdminDepartmentsView';
import AdminRoleManagementView from './AdminRoleManagementView';
import AdminBackupRestoreView from './AdminBackupRestoreView';
import AdminSystemHealthView from './AdminSystemHealthView';
import ApprovalsView from './ApprovalsView';
import StudentsView from './StudentsView';
import './AdminDashboard.css';

// --- Icons (Same SVGs as coordinator, but with admin colors) ---
const Icon = {
    grid: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
    users: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
    building: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>,
    settings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>,
    logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
    feedback: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2-2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
};

type View = 'overview' | 'users' | 'roles' | 'companies' | 'profile' | 'settings' | 'feedback' | 'audit' | 'departments' | 'backup' | 'health' | 'approvals' | 'students';

const AdminDashboard: React.FC = () => {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState<View>('overview');
    const [stats, setStats] = useState({ studentCount: 0, coordinatorCount: 0, companyCount: 0, departmentCount: 0, totalLogs: 0 });
    const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
    const [sidebarMode, setSidebarMode] = useState<'expanded' | 'collapsed' | 'hover'>('hover');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isSidebarMenuOpen, setIsSidebarMenuOpen] = useState(false);
    const [newFeedbackCount, setNewFeedbackCount] = useState(0);

    useTheme();

    useEffect(() => {
        loadAdminData();
        const interval = setInterval(loadNewFeedbackCount, 30000); // Check every 30s
        return () => clearInterval(interval);
    }, []);

    const loadNewFeedbackCount = async () => {
        try {
            const count = await adminService.getNewFeedbackCount();
            setNewFeedbackCount(count);
        } catch (err) {
            console.error('Error loading feedback count:', err);
        }
    };

    const loadAdminData = async () => {
        setLoading(true);
        try {
            const [currentProfile, systemStats, profiles, feedbackCount] = await Promise.all([
                profileService.getCurrentProfile(),
                adminService.getSystemStats(),
                adminService.getAllProfiles(),
                adminService.getNewFeedbackCount(),
            ]);
            setProfile(currentProfile);
            setStats(systemStats);
            setAllProfiles(profiles);
            setNewFeedbackCount(feedbackCount);
        } catch (err) {
            console.error('Error loading admin data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRoleUpdate = async (userId: string, newRole: 'student' | 'coordinator' | 'admin') => {
        setUpdatingUserId(userId);
        try {
            await adminService.updateUserRole(userId, newRole);
            // Update local state
            setAllProfiles(allProfiles.map(p =>
                p.auth_user_id === userId ? { ...p, account_type: newRole } : p
            ));
            // Update stats
            const newStats = await adminService.getSystemStats();
            setStats(newStats);
        } catch {
            alert('Failed to update user role');
        } finally {
            setUpdatingUserId(null);
        }
    };

    if (loading) {
        return (
            <div className="admin-dashboard-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
                <div className="admin-logo-icon" style={{ width: 64, height: 64 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                </div>
            </div>
        );
    }

    const initials = profile?.first_name ? `${profile.first_name[0]}${profile.last_name?.[0] || ''}`.toUpperCase() : 'AD';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    return (
        <div className={`admin-dashboard-container ${isMobileMenuOpen ? 'mobile-menu-open' : ''}`}>
            {/* Mobile overlay */}
            <div className="admin-mobile-overlay" onClick={() => setIsMobileMenuOpen(false)} />

            {/* --- SIDEBAR --- */}
            <aside className={`admin-sidebar sidebar-mode-${sidebarMode} ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
                <div className="admin-sidebar-header">
                    <div className="admin-logo-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                    </div>
                    <div className="admin-logo-text-group">
                        <div className="admin-logo-text">SIL Admin</div>
                        <div className="admin-logo-sub">Asian College Dumaguete</div>
                    </div>
                </div>

                <div className="admin-sidebar-user" onClick={() => { setCurrentView('profile'); setIsMobileMenuOpen(false); }}>
                    <div className="admin-user-avatar">
                        {initials}
                    </div>
                    <div className="admin-sidebar-user-info">
                        <div className="admin-user-name">{profile?.first_name} {profile?.last_name}</div>
                        <div className="admin-user-role-badge">Super Admin</div>
                    </div>
                </div>

                <nav className="admin-nav">
                    <div className={`admin-nav-item ${currentView === 'overview' ? 'active' : ''}`} onClick={() => { setCurrentView('overview'); setIsMobileMenuOpen(false); }}>
                        <span className="nav-icon">{Icon.grid}</span> <span className="nav-text">Overview</span>
                    </div>
                    <div className={`admin-nav-item ${currentView === 'users' ? 'active' : ''}`} onClick={() => { setCurrentView('users'); setIsMobileMenuOpen(false); }}>
                        <span className="nav-icon">{Icon.users}</span> <span className="nav-text">User Management</span>
                    </div>
                    <div className={`admin-nav-item ${currentView === 'roles' ? 'active' : ''}`} onClick={() => { setCurrentView('roles'); setIsMobileMenuOpen(false); }}>
                        <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></span>
                        <span className="nav-text">Role Permissions</span>
                    </div>
                    <div className={`admin-nav-item ${currentView === 'companies' ? 'active' : ''}`} onClick={() => { setCurrentView('companies'); setIsMobileMenuOpen(false); }}>
                        <span className="nav-icon">{Icon.building}</span> <span className="nav-text">Companies</span>
                    </div>
                    <div className={`admin-nav-item ${currentView === 'approvals' ? 'active' : ''}`} onClick={() => { setCurrentView('approvals'); setIsMobileMenuOpen(false); }}>
                        <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><polyline points="16 13 8 13"></polyline><polyline points="16 17 8 17"></polyline><polyline points="10 9 9 9 8 9"></polyline></svg></span>
                        <span className="nav-text">Journals (Approvals)</span>
                    </div>
                    <div className={`admin-nav-item ${currentView === 'students' ? 'active' : ''}`} onClick={() => { setCurrentView('students'); setIsMobileMenuOpen(false); }}>
                        <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></span>
                        <span className="nav-text">All Students</span>
                    </div>
                    <div className={`admin-nav-item ${currentView === 'departments' ? 'active' : ''}`} onClick={() => { setCurrentView('departments'); setIsMobileMenuOpen(false); }}>
                        <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M8 18h1"></path><path d="M8 14h1"></path><path d="M8 10h1"></path></svg></span>
                        <span className="nav-text">Departments</span>
                    </div>
                    <div className={`admin-nav-item ${currentView === 'feedback' ? 'active' : ''}`} onClick={() => { setCurrentView('feedback'); setIsMobileMenuOpen(false); }}>
                        <span className="nav-icon">{Icon.feedback}</span>
                        <span className="nav-text">User Feedback</span>
                        {newFeedbackCount > 0 && (
                            <span className="nav-badge">{newFeedbackCount}</span>
                        )}
                    </div>
                    <div className={`admin-nav-item ${currentView === 'audit' ? 'active' : ''}`} onClick={() => { setCurrentView('audit'); setIsMobileMenuOpen(false); }}>
                        <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></span>
                        <span className="nav-text">Audit Logs</span>
                    </div>
                    <div className={`admin-nav-item ${currentView === 'backup' ? 'active' : ''}`} onClick={() => { setCurrentView('backup'); setIsMobileMenuOpen(false); }}>
                        <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></span>
                        <span className="nav-text">Backup & Restore</span>
                    </div>
                    <div className={`admin-nav-item ${currentView === 'health' ? 'active' : ''}`} onClick={() => { setCurrentView('health'); setIsMobileMenuOpen(false); }}>
                        <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg></span>
                        <span className="nav-text">System Health</span>
                    </div>
                </nav>

                <div className="admin-sidebar-bottom">
                    <div style={{ position: 'relative' }}>
                        {isSidebarMenuOpen && (
                            <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setIsSidebarMenuOpen(false)} />
                                <div className="admin-sidebar-control-menu">
                                    <div className="admin-sidebar-control-header">Sidebar control</div>
                                    <div className="admin-sidebar-control-options">
                                        {(['expanded', 'collapsed', 'hover'] as const).map(mode => (
                                            <div key={mode} className="admin-sidebar-control-option" onClick={() => { setSidebarMode(mode); setIsSidebarMenuOpen(false); }}>
                                                <div className="admin-sidebar-control-radio">
                                                    {sidebarMode === mode && <div className="admin-sidebar-control-radio-inner" />}
                                                </div>
                                                <span style={{ textTransform: 'capitalize' }}>{mode === 'hover' ? 'Expand on hover' : mode}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                        <div className={`admin-nav-item ${isSidebarMenuOpen ? 'active' : ''}`} onClick={() => setIsSidebarMenuOpen(!isSidebarMenuOpen)}>
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg></span>
                            <span className="nav-text">Layout</span>
                        </div>
                    </div>
                    <div className={`admin-nav-item ${currentView === 'settings' ? 'active' : ''}`} onClick={() => { setCurrentView('settings'); setIsMobileMenuOpen(false); }}>
                        <span className="nav-icon">{Icon.settings}</span> <span className="nav-text">Admin Settings</span>
                    </div>
                </div>
            </aside>

            {/* --- MAIN --- */}
            <main className="admin-main">
                <header className="admin-topbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button className="admin-mobile-toggle" onClick={() => setIsMobileMenuOpen(true)}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                        </button>
                        <div>
                            <div className="admin-topbar-title">
                                {currentView === 'overview' && 'Admin Overview'}
                                {currentView === 'users' && 'User Management'}
                                {currentView === 'companies' && 'Company Management'}
                                {currentView === 'feedback' && 'User Feedback'}
                                {currentView === 'profile' && 'Admin Profile'}
                                {currentView === 'settings' && 'System Settings'}
                            </div>
                        </div>
                    </div>
                </header>

                <div className="admin-page-content">
                    {currentView === 'overview' && (
                        <div className="fade-in">
                            {/* Welcome Banner */}
                            <div className="admin-welcome-banner">
                                <div className="admin-welcome-bg" />
                                <div className="admin-welcome-content">
                                    <div>
                                        <p className="admin-welcome-greeting">{greeting},</p>
                                        <h2 className="admin-welcome-name">{profile?.first_name} {profile?.last_name} 👋</h2>
                                        <p className="admin-welcome-sub">Super Admin • System Status: Active</p>
                                    </div>
                                </div>
                            </div>
                            <div className="admin-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                                <div className="admin-stat-card">
                                    <div className="admin-stat-icon-wrap" style={{ background: 'var(--admin-bg)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>{Icon.users}</div>
                                    <div>
                                        <div className="admin-stat-value">{stats.studentCount}</div>
                                        <div className="admin-stat-label">Total Students</div>
                                    </div>
                                </div>
                                <div className="admin-stat-card">
                                    <div className="admin-stat-icon-wrap" style={{ background: 'var(--admin-bg)', color: '#0d9488', border: '1px solid rgba(13, 148, 136, 0.2)' }}>{Icon.users}</div>
                                    <div>
                                        <div className="admin-stat-value">{stats.coordinatorCount}</div>
                                        <div className="admin-stat-label">Coordinators</div>
                                    </div>
                                </div>
                                <div className="admin-stat-card">
                                    <div className="admin-stat-icon-wrap" style={{ background: 'var(--admin-bg)', color: 'var(--primary)', border: '1px solid var(--nav-active-bg)' }}>{Icon.building}</div>
                                    <div>
                                        <div className="admin-stat-value">{stats.companyCount}</div>
                                        <div className="admin-stat-label">Partner Companies</div>
                                    </div>
                                </div>
                                <div className="admin-stat-card">
                                    <div className="admin-stat-icon-wrap" style={{ background: 'var(--admin-bg)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M8 18h1"></path><path d="M8 14h1"></path><path d="M8 10h1"></path></svg>
                                    </div>
                                    <div>
                                        <div className="admin-stat-value">{stats.departmentCount}</div>
                                        <div className="admin-stat-label">Departments</div>
                                    </div>
                                </div>
                                <div className="admin-stat-card">
                                    <div className="admin-stat-icon-wrap" style={{ background: 'var(--admin-bg)', color: '#ec4899', border: '1px solid rgba(236, 72, 153, 0.2)' }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                                    </div>
                                    <div>
                                        <div className="admin-stat-value">{stats.totalLogs}</div>
                                        <div className="admin-stat-label">Audit Logs</div>
                                    </div>
                                </div>
                            </div>


                            <div className="admin-table-card">
                                <div className="admin-table-header">
                                    <div className="admin-table-title">Recent User Registrations</div>
                                    <button className="role-select" onClick={() => setCurrentView('users')}>View All</button>
                                </div>
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>User</th>
                                            <th>Email</th>
                                            <th>Role</th>
                                            <th>Joined</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allProfiles.slice(0, 5).map(p => (
                                            <tr key={p.id}>
                                                <td>
                                                    <div className="admin-user-cell">
                                                        <div className="admin-user-avatar">
                                                            {p.first_name?.[0]}{p.last_name?.[0]}
                                                        </div>
                                                        <div>{p.first_name} {p.last_name}</div>
                                                    </div>
                                                </td>
                                                <td>{p.email}</td>
                                                <td>
                                                    <span className={`admin-badge badge-${p.account_type}`}>
                                                        {p.account_type.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={{ color: 'var(--admin-text-secondary)' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {currentView === 'users' && (
                        <div className="fade-in">
                            <div className="admin-table-card">
                                <div className="admin-table-header">
                                    <div className="admin-table-title">All Users</div>
                                    <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>Total: {allProfiles.length} users</div>
                                </div>
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Email</th>
                                            <th>Account Type</th>
                                            <th>Manage Role</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allProfiles.map(p => (
                                            <tr key={p.id}>
                                                <td>{p.first_name} {p.last_name}</td>
                                                <td>{p.email}</td>
                                                <td>
                                                    <span className={`admin-badge badge-${p.account_type}`}>
                                                        {p.account_type}
                                                    </span>
                                                </td>
                                                <td>
                                                    <select
                                                        className="role-select"
                                                        value={p.account_type}
                                                        disabled={updatingUserId === p.auth_user_id}
                                                        style={{ background: 'var(--admin-bg)', color: 'var(--admin-text-primary)' }}
                                                        onChange={(e) => handleRoleUpdate(p.auth_user_id, e.target.value as 'student' | 'coordinator' | 'admin')}
                                                    >
                                                        <option value="student">Student</option>
                                                        <option value="coordinator">Coordinator</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {currentView === 'companies' && (
                        <div className="fade-in">
                            <CompaniesView />
                        </div>
                    )}

                    {currentView === 'settings' && (
                        <AdminSettingsView profile={profile} />
                    )}

                    {currentView === 'profile' && (
                        <div className="fade-in">
                            <AdminProfileView
                                initialProfile={profile}
                                onProfileUpdated={setProfile}
                            />
                        </div>
                    )}

                    {currentView === 'feedback' && (
                        <div className="fade-in">
                            <AdminFeedbackView onFeedbackAction={loadNewFeedbackCount} />
                        </div>
                    )}

                    {currentView === 'audit' && (
                        <div className="fade-in">
                            <AdminAuditLogView />
                        </div>
                    )}

                    {currentView === 'departments' && (
                        <div className="fade-in">
                            <AdminDepartmentsView />
                        </div>
                    )}

                    {currentView === 'roles' && (
                        <div className="fade-in">
                            <AdminRoleManagementView />
                        </div>
                    )}

                    {currentView === 'backup' && (
                        <div className="fade-in">
                            <AdminBackupRestoreView />
                        </div>
                    )}

                    {currentView === 'health' && (
                        <div className="fade-in">
                            <AdminSystemHealthView />
                        </div>
                    )}

                    {currentView === 'approvals' && (
                        <div className="fade-in">
                            <ApprovalsView />
                        </div>
                    )}

                    {currentView === 'students' && (
                        <div className="fade-in">
                            <StudentsView />
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default AdminDashboard;
