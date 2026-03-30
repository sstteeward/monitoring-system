import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { profileService, type Profile } from '../services/profileService';
import { adminService } from '../services/adminService';
import { useTheme } from '../contexts/ThemeContext';
import CompaniesView from './CompaniesView';
import AdminSettingsView from './AdminSettingsView';
import AdminProfileView from './AdminProfileView';
import AdminFeedbackView from './AdminFeedbackView';
import AdminAuditLogView from './AdminAuditLogView';
import AdminDepartmentsView from './AdminDepartmentsView';
import AdminCoursesView from './AdminCoursesView';
import AdminRoleManagementView from './AdminRoleManagementView';
import AdminBackupRestoreView from './AdminBackupRestoreView';
import AdminSystemHealthView from './AdminSystemHealthView';
import ApprovalsView from './ApprovalsView';
import StudentsView from './StudentsView';
import UserProfileModal from './UserProfileModal';
import UserClickableName from './UserClickableName';
import CustomSelect from './CustomSelect';
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

type View = 'overview' | 'users' | 'roles' | 'companies' | 'profile' | 'settings' | 'feedback' | 'audit' | 'departments' | 'courses' | 'backup' | 'health' | 'approvals' | 'students';

const AdminDashboard: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState<View>('overview');
    const [stats, setStats] = useState({ studentCount: 0, coordinatorCount: 0, companyCount: 0, departmentCount: 0, totalLogs: 0, pendingApprovalsCount: 0 });
    const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
    const [sidebarMode, setSidebarMode] = useState<'expanded' | 'collapsed' | 'hover'>('hover');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isSidebarMenuOpen, setIsSidebarMenuOpen] = useState(false);
    const [newFeedbackCount, setNewFeedbackCount] = useState(0);
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [deletingUser, setDeletingUser] = useState(false);
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);

    useTheme();

    useEffect(() => {
        const path = location.pathname.replace('/admin/', '').replace('/admin', '');
        const validSlugs: View[] = ['overview', 'users', 'roles', 'companies', 'profile', 'settings', 'feedback', 'audit', 'departments', 'courses', 'backup', 'health', 'approvals', 'students'];

        if (validSlugs.includes(path as View)) {
            setCurrentView(path as View);
        } else if (location.pathname === '/admin' || location.pathname === '/admin/') {
            setCurrentView('overview');
        }
    }, [location]);

    const navigateTo = (view: View) => {
        navigate(view === 'overview' ? '/admin' : `/admin/${view}`);
        setIsMobileMenuOpen(false);
    };

    useEffect(() => {
        loadAdminData();
        const interval = setInterval(loadAdminData, 30000); // Check every 30s
        return () => clearInterval(interval);
    }, []);

    const loadAdminData = async () => {
        try {
            const [currentProfile, systemStats, profiles, feedbackCount] = await Promise.all([
                profileService.getCurrentProfile(),
                adminService.getSystemStats(),
                adminService.getAllProfiles(),
                adminService.getNewFeedbackCount(),
            ]);
            setProfile(currentProfile);
            setStats(systemStats as any);
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
            setAllProfiles(allProfiles.map(p =>
                p.auth_user_id === userId ? { ...p, account_type: newRole } : p
            ));
            const newStats = await adminService.getSystemStats();
            setStats(newStats as any);
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
        <>
            <div className={`admin-dashboard-container ${isMobileMenuOpen ? 'mobile-menu-open' : ''}`}>
                <div className="admin-mobile-overlay" onClick={() => setIsMobileMenuOpen(false)} />

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

                    <nav className="admin-nav">
                        <div className={`admin-nav-item ${currentView === 'overview' ? 'active' : ''}`} onClick={() => navigateTo('overview')}>
                            <span className="nav-icon">{Icon.grid}</span> <span className="nav-text">Overview</span>
                        </div>
                        <div className={`admin-nav-item ${currentView === 'users' ? 'active' : ''}`} onClick={() => navigateTo('users')}>
                            <span className="nav-icon">{Icon.users}</span> <span className="nav-text">User Management</span>
                        </div>
                        <div className={`admin-nav-item ${currentView === 'roles' ? 'active' : ''}`} onClick={() => navigateTo('roles')}>
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></span>
                            <span className="nav-text">Role Permissions</span>
                        </div>
                        <div className={`admin-nav-item ${currentView === 'companies' ? 'active' : ''}`} onClick={() => navigateTo('companies')}>
                            <span className="nav-icon">{Icon.building}</span> <span className="nav-text">Companies</span>
                        </div>
                        <div className={`admin-nav-item ${currentView === 'approvals' ? 'active' : ''}`} onClick={() => navigateTo('approvals')}>
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><polyline points="16 13 8 13"></polyline><polyline points="16 17 8 17"></polyline><polyline points="10 9 9 9 8 9"></polyline></svg></span>
                            <span className="nav-text">Approvals</span>
                            {stats.pendingApprovalsCount > 0 && (
                                <span className="nav-badge" style={{ background: '#ef4444' }}>{stats.pendingApprovalsCount}</span>
                            )}
                        </div>
                        <div className={`admin-nav-item ${currentView === 'students' ? 'active' : ''}`} onClick={() => navigateTo('students')}>
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></span>
                            <span className="nav-text">All Students</span>
                        </div>
                        <div className={`admin-nav-item ${currentView === 'departments' ? 'active' : ''}`} onClick={() => navigateTo('departments')}>
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M8 18h1"></path><path d="M8 14h1"></path><path d="M8 10h1"></path></svg></span>
                            <span className="nav-text">Departments</span>
                        </div>
                        <div className={`admin-nav-item ${currentView === 'courses' ? 'active' : ''}`} onClick={() => navigateTo('courses')}>
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg></span>
                            <span className="nav-text">Courses</span>
                        </div>
                        <div className={`admin-nav-item ${currentView === 'feedback' ? 'active' : ''}`} onClick={() => navigateTo('feedback')}>
                            <span className="nav-icon">{Icon.feedback}</span>
                            <span className="nav-text">User Feedback</span>
                            {newFeedbackCount > 0 && (
                                <span className="nav-badge">{newFeedbackCount}</span>
                            )}
                        </div>
                        <div className={`admin-nav-item ${currentView === 'audit' ? 'active' : ''}`} onClick={() => navigateTo('audit')}>
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></span>
                            <span className="nav-text">Audit Logs</span>
                        </div>
                        <div className={`admin-nav-item ${currentView === 'backup' ? 'active' : ''}`} onClick={() => navigateTo('backup')}>
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></span>
                            <span className="nav-text">Backup & Restore</span>
                        </div>
                        <div className={`admin-nav-item ${currentView === 'health' ? 'active' : ''}`} onClick={() => navigateTo('health')}>
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
                        <div className={`admin-nav-item ${currentView === 'settings' ? 'active' : ''}`} onClick={() => navigateTo('settings')}>
                            <span className="nav-icon">{Icon.settings}</span> <span className="nav-text">Admin Settings</span>
                        </div>
                    </div>
                </aside>

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
                                    {currentView === 'approvals' && 'Approvals'}
                                    {currentView === 'students' && 'All Students'}
                                    {currentView === 'departments' && 'Departments'}
                                    {currentView === 'courses' && 'Courses'}
                                    {currentView === 'audit' && 'Audit Logs'}
                                    {currentView === 'backup' && 'Backup & Restore'}
                                    {currentView === 'health' && 'System Health'}
                                    {currentView === 'roles' && 'Role Permissions'}
                                    {currentView === 'profile' && 'Admin Profile'}
                                    {currentView === 'settings' && 'System Settings'}
                                </div>
                            </div>
                        </div>
                        <div className="admin-topbar-right">
                            <div className="admin-topbar-actions">
                                <button className="admin-topbar-icon-btn" onClick={() => navigateTo('approvals')} title="Notifications">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                                    {stats.pendingApprovalsCount > 0 && <span className="topbar-notification-dot" style={{ background: '#ef4444' }} />}
                                </button>
                                <button className="admin-topbar-icon-btn" onClick={() => navigateTo('settings')} title="Settings">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                                </button>
                                <div className="admin-topbar-divider" />
                                <button className="admin-topbar-user-btn" onClick={() => navigateTo('profile')}>
                                    <div className="admin-topbar-user-info">
                                        <div className="admin-topbar-user-name">{profile?.first_name} {profile?.last_name}</div>
                                        <div className="admin-topbar-user-role">SUPER ADMIN</div>
                                    </div>
                                    <div className="admin-topbar-avatar" style={{
                                        background: profile?.avatar_url ? `url(${profile.avatar_url}) center/cover no-repeat` : undefined,
                                        color: profile?.avatar_url ? 'transparent' : undefined
                                    }}>
                                        {profile?.avatar_url ? '' : initials}
                                    </div>
                                </button>
                            </div>
                        </div>
                    </header>

                    <div className="admin-page-content">
                        {currentView === 'overview' && (
                            <div className="fade-in">
                                <div className="admin-welcome-banner">
                                    <div className="admin-welcome-bg" />
                                    <div className="admin-welcome-content">
                                        <div>
                                            <p className="admin-welcome-greeting">{greeting},</p>
                                            <h2 className="admin-welcome-name">{profile?.first_name} {profile?.last_name} </h2>
                                            <p className="admin-welcome-sub">Super Admin • System Status: Active</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="admin-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                                    <div className="admin-stat-card" onClick={() => navigateTo('students')} style={{ cursor: 'pointer' }}>
                                        <div className="admin-stat-icon-wrap" style={{ background: 'var(--bg-elevated)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>{Icon.users}</div>
                                        <div>
                                            <div className="admin-stat-value">{stats.studentCount}</div>
                                            <div className="admin-stat-label">Total Students</div>
                                        </div>
                                    </div>
                                    <div className="admin-stat-card" onClick={() => navigateTo('approvals')} style={{ cursor: 'pointer' }}>
                                        <div className="admin-stat-icon-wrap" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><polyline points="16 13 8 13"></polyline><polyline points="16 17 8 17"></polyline><polyline points="10 9 9 9 8 9"></polyline></svg>
                                        </div>
                                        <div>
                                            <div className="admin-stat-value">{stats.pendingApprovalsCount}</div>
                                            <div className="admin-stat-label">Pending Approvals</div>
                                        </div>
                                    </div>
                                    <div className="admin-stat-card">
                                        <div className="admin-stat-icon-wrap" style={{ background: 'var(--bg-elevated)', color: '#0d9488', border: '1px solid rgba(13, 148, 136, 0.2)' }}>{Icon.users}</div>
                                        <div>
                                            <div className="admin-stat-value">{stats.coordinatorCount}</div>
                                            <div className="admin-stat-label">Coordinators</div>
                                        </div>
                                    </div>
                                    <div className="admin-stat-card">
                                        <div className="admin-stat-icon-wrap" style={{ background: 'var(--bg-elevated)', color: 'var(--primary)', border: '1px solid var(--nav-active-bg)' }}>{Icon.building}</div>
                                        <div>
                                            <div className="admin-stat-value">{stats.companyCount}</div>
                                            <div className="admin-stat-label">Partner Companies</div>
                                        </div>
                                    </div>
                                    <div className="admin-stat-card">
                                        <div className="admin-stat-icon-wrap" style={{ background: 'var(--bg-elevated)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M8 18h1"></path><path d="M8 14h1"></path><path d="M8 10h1"></path></svg>
                                        </div>
                                        <div>
                                            <div className="admin-stat-value">{stats.departmentCount}</div>
                                            <div className="admin-stat-label">Departments</div>
                                        </div>
                                    </div>
                                </div>


                                <div className="admin-table-card">
                                    <div className="admin-table-header">
                                        <div className="admin-table-title">Recent User Registrations</div>
                                        <button className="role-select" onClick={() => navigateTo('users')}>View All</button>
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
                                                <tr key={p.id} onClick={() => setViewProfileId(p.id)} className="clickable-row">
                                                    <td>
                                                        <div className="admin-user-cell">
                                                            <div className="admin-user-avatar">
                                                                {p.first_name?.[0]}{p.last_name?.[0]}
                                                            </div>
                                                            <div><UserClickableName userId={p.id} userName={`${p.first_name} ${p.last_name}`} /></div>
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
                                                <th style={{ textAlign: 'right' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allProfiles.map(p => (
                                                <tr key={p.id} onClick={() => setViewProfileId(p.id)} className="clickable-row">
                                                    <td><UserClickableName userId={p.id} userName={`${p.first_name} ${p.last_name}`} /></td>
                                                    <td>{p.email}</td>
                                                    <td>
                                                        <span className={`admin-badge badge-${p.account_type}`}>
                                                            {p.account_type}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <CustomSelect
                                                            value={p.account_type}
                                                            disabled={updatingUserId === p.auth_user_id}
                                                            onChange={(val) => handleRoleUpdate(p.auth_user_id, val as 'student' | 'coordinator' | 'admin')}
                                                            options={[
                                                                { value: 'student', label: 'Student' },
                                                                { value: 'coordinator', label: 'Coordinator' },
                                                                { value: 'admin', label: 'Admin' },
                                                            ]}
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                color: '#ef4444',
                                                                cursor: 'pointer',
                                                                padding: '0.4rem 0.6rem',
                                                                fontSize: '0.85rem',
                                                                fontWeight: 600
                                                            }}
                                                            onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: p.auth_user_id, name: `${p.first_name} ${p.last_name}` }); }}
                                                            disabled={updatingUserId === p.auth_user_id}
                                                        >
                                                            {updatingUserId === p.auth_user_id ? '...' : 'Delete'}
                                                        </button>
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
                                <AdminFeedbackView onFeedbackAction={loadAdminData} />
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

                        {currentView === 'courses' && (
                            <div className="fade-in">
                                <AdminCoursesView />
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
                                <StudentsView isAdmin={true} />
                            </div>
                        )}
                    </div>
                </main>
            </div>

            <UserProfileModal
                profileId={viewProfileId}
                onClose={() => setViewProfileId(null)}
            />
            {/* Delete Confirmation Modal */}
            {
                deleteTarget && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div style={{
                            background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.3)',
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
                            <h3 style={{ textAlign: 'center', color: 'var(--text-primary)', margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 600 }}>Delete Account?</h3>
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 1.75rem', lineHeight: 1.5 }}>
                                Are you sure you want to permanently delete <strong style={{ color: 'var(--text-bright)' }}>{deleteTarget.name}</strong>? All their data including timesheets, journals, and documents will be removed. This cannot be undone.
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    onClick={() => setDeleteTarget(null)}
                                    disabled={deletingUser}
                                    style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit', transition: 'background 0.15s' }}
                                    onMouseOver={e => e.currentTarget.style.background = 'var(--bg-card)'}
                                    onMouseOut={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        if (!deleteTarget) return;
                                        setDeletingUser(true);
                                        try {
                                            await adminService.deleteUserAccount(deleteTarget.id);
                                            await adminService.logAction('delete_account', 'profiles', deleteTarget.id);
                                            setAllProfiles(prev => prev.filter(user => user.auth_user_id !== deleteTarget.id));
                                            setDeleteTarget(null);
                                        } catch (e: any) {
                                            const detail = e?.message || e?.details || JSON.stringify(e);
                                            alert(`Failed to delete account.\n\nError: ${detail}\n\nMake sure you have run the fix_admin_functions.sql script in your Supabase SQL Editor.`);
                                            console.error('Delete user error:', e);
                                        } finally {
                                            setDeletingUser(false);
                                        }
                                    }}
                                    disabled={deletingUser}
                                    style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', cursor: deletingUser ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(239,68,68,0.35)', transition: 'opacity 0.15s', opacity: deletingUser ? 0.7 : 1 }}
                                    onMouseOver={e => { if (!deletingUser) e.currentTarget.style.opacity = '0.9'; }}
                                    onMouseOut={e => { if (!deletingUser) e.currentTarget.style.opacity = '1'; }}
                                >
                                    {deletingUser ? 'Deleting...' : 'Yes, Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </>
    );
};

export default AdminDashboard;
