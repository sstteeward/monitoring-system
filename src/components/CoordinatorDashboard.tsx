import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { profileService, type Profile } from '../services/profileService';
import { coordinatorService } from '../services/coordinatorService';
import StudentsView from './StudentsView';
import ApprovalsView from './ApprovalsView';
import AnnouncementsView from './AnnouncementsView';
import CompaniesView from './CompaniesView';
import CoordinatorProfileView from './CoordinatorProfileView';
import CoordinatorDepartmentView from './CoordinatorDepartmentView';
import CoordinatorSettingsView from './CoordinatorSettingsView';
import ChatWidget from './ChatWidget';
import FeedbackModal from './FeedbackModal';
import UserProfileModal from './UserProfileModal';
import UserClickableName from './UserClickableName';
import { useTheme } from '../contexts/ThemeContext';
import './CoordinatorDashboard.css';

// ─── Icon helpers ────────────────────────────────────────────────────────────
const Icon = {
    grid: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
    building: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>,
    users: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
    file: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
    megaphone: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
    user: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
    settings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
    logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
    menu: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>,
    chevronLeft: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" /></svg>,
    chevronRight: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" /></svg>,
    close: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
    check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
    clock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
};

type View = 'overview' | 'companies' | 'students' | 'approvals' | 'announcement' | 'departments' | 'profile' | 'settings';

interface NavItem { id: View; label: string; icon: React.ReactNode; badge?: number; }

const CoordinatorDashboard: React.FC = () => {
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [studentFilter, setStudentFilter] = useState<'all' | 'assigned' | 'completed' | 'in-progress' | 'at-risk'>('all');
    const [approvalsTab, setApprovalsTab] = useState<'documents' | 'journals' | 'dtr'>('documents');
    const [sidebarMode, setSidebarMode] = useState<'expanded' | 'collapsed' | 'hover'>('hover');
    const [isSidebarMenuOpen, setIsSidebarMenuOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

    useTheme();
    const routerNavigate = useNavigate();
    const location = useLocation();

    // Determine current view from pathname
    const lastPart = location.pathname.split('/').pop();
    const currentView: View = (lastPart === 'coordinator' ? 'overview' : lastPart as View) || 'overview';

    const [totalPendingCount, setTotalPendingCount] = useState(0);
    const [companyCount, setCompanyCount] = useState(0);
    const [pendingCompanyRequestsCount, setPendingCompanyRequestsCount] = useState(0);
    const [overviewStats, setOverviewStats] = useState<any>(null);
    const [coordinatorDepartment, setCoordinatorDepartment] = useState<any>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user));
        loadCoordinatorData();
    }, []);

    useEffect(() => {
        const titles: Record<string, string> = {
            overview: 'Overview',
            companies: 'OJT Companies',
            departments: 'My Department',
            students: 'Students',
            approvals: 'Approvals',
            announcement: 'Announcements',
            profile: 'My Profile',
            settings: 'Settings',
        };
        document.title = `${titles[currentView] ?? 'Dashboard'} | SIL Monitoring`;
    }, [currentView]);

    const loadCoordinatorData = async () => {
        setLoading(true);
        try {
            const [currentProfile, companies, companyRequests, dept] = await Promise.all([
                profileService.getCurrentProfile(),
                coordinatorService.getAllCompanies(),
                coordinatorService.getPendingCompanyRequests(),
                coordinatorService.getMyDepartment(),
            ]);

            // Fetch stats using departmentId if available
            const stats = await coordinatorService.getOverviewStats(dept?.id);
            setOverviewStats(stats);
            setTotalPendingCount(stats.totalPendingCount || 0);

            setProfile(currentProfile);
            setCompanyCount(companies.length);
            setPendingCompanyRequestsCount(companyRequests.length);
            setCoordinatorDepartment(dept);
        } catch (err) {
            console.error('Error loading coordinator data:', err);
        } finally {
            setLoading(false);
        }
    };

    const navigateTo = (view: View, param?: any) => {
        routerNavigate(view === 'overview' ? '/coordinator' : `/coordinator/${view}`);

        if (view === 'students' && param) {
            setStudentFilter(param);
        } else if (view === 'students') {
            setStudentFilter('all');
        }

        if (view === 'approvals' && param) {
            setApprovalsTab(param);
        } else if (view === 'approvals') {
            setApprovalsTab('documents');
        }

        setIsMobileMenuOpen(false);
    };

    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const initials = profile?.first_name
        ? `${profile.first_name[0]}${profile.last_name?.[0] ?? ''}`.toUpperCase()
        : user?.email?.[0]?.toUpperCase() ?? '?';

    const formatSlug = (slug: string) => {
        return slug.split(/[._-]/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    };

    const displayName = profile?.first_name && profile?.last_name && !profile.first_name.includes('@')
        ? `${profile.first_name} ${profile.last_name}`
        : profile?.first_name && !profile.first_name.includes('@')
            ? profile.first_name
            : user?.email
                ? formatSlug(user.email.split('@')[0])
                : 'Coordinator';

    const navSections: { label: string; items: NavItem[] }[] = [
        {
            label: 'Management',
            items: [
                { id: 'overview', label: 'Overview', icon: Icon.grid },
                { id: 'companies', label: 'Companies', icon: Icon.building, badge: pendingCompanyRequestsCount > 0 ? pendingCompanyRequestsCount : undefined },
                { id: 'departments', label: 'Department', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" /><line x1="12" y1="22" x2="12" y2="15.5" /><polyline points="22 8.5 12 15.5 2 8.5" /></svg> },
                { id: 'students', label: 'Students', icon: Icon.users },
                { id: 'approvals', label: 'Approvals', icon: Icon.file, badge: totalPendingCount > 0 ? totalPendingCount : undefined },
            ],
        },
        {
            label: 'Communication',
            items: [
                { id: 'announcement', label: 'Announcements', icon: Icon.megaphone },
            ],
        },
    ];

    const viewTitles: Record<View, string> = {
        overview: 'Coordinator Overview',
        companies: 'OJT Companies',
        departments: 'My Department',
        students: 'Student Management',
        approvals: 'Pending Approvals',
        announcement: 'Announcements',
        profile: 'My Profile',
        settings: 'Settings',
    };

    if (loading && !user) {
        return (
            <div className="dashboard-container" style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
                <div className="sidebar-logo-icon cd-logo-icon fade-in" style={{ width: 64, height: 64, borderRadius: '16px' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                </div>
            </div>
        );
    }

    return (
        <div className={`dashboard-container ${isMobileMenuOpen ? 'mobile-menu-open' : ''}`}>
            {/* Mobile overlay */}
            <div className="mobile-overlay" onClick={() => setIsMobileMenuOpen(false)} />

            {/* ══ SIDEBAR ══ */}
            <aside className={`sidebar sidebar-mode-${sidebarMode} ${isMobileMenuOpen ? ' mobile-open' : ''}`}>
                {/* Header */}
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <div className="sidebar-logo-icon cd-logo-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                        </div>
                        <div className="sidebar-logo-text-group">
                            <div className="sidebar-logo-text">SIL Coordinator</div>
                            <div className="sidebar-logo-sub">Asian College Dumaguete</div>
                        </div>
                    </div>
                    <button className="mobile-close-btn" onClick={() => setIsMobileMenuOpen(false)}>{Icon.close}</button>
                </div>

                {/* Nav */}
                <div className="sidebar-scrollable">
                    {navSections.map(section => (
                        <React.Fragment key={section.label}>
                            <div className="sidebar-section-label">{section.label}</div>
                            <nav className="sidebar-nav">
                                {section.items.map(item => (
                                    <div
                                        key={item.id}
                                        className={`sidebar-nav-item ${currentView === item.id ? 'active' : ''}`}
                                        onClick={() => navigateTo(item.id)}
                                    >
                                        <span className="nav-icon" style={{ position: 'relative' }}>
                                            {item.icon}
                                            {item.badge && (
                                                <span className="notification-badge">{item.badge}</span>
                                            )}
                                        </span>
                                        <span className="nav-text">{item.label}</span>
                                    </div>
                                ))}
                            </nav>
                        </React.Fragment>
                    ))}
                </div>

                {/* Sidebar Control & Settings */}
                <div className="sidebar-bottom">
                    <div style={{ position: 'relative' }}>
                        {isSidebarMenuOpen && (
                            <>
                                <div
                                    style={{ position: 'fixed', inset: 0, zIndex: 100 }}
                                    onClick={() => setIsSidebarMenuOpen(false)}
                                />
                                <div className="sidebar-control-menu">
                                    <div className="sidebar-control-header">Sidebar control</div>
                                    <div className="sidebar-control-options">
                                        {(['expanded', 'collapsed', 'hover'] as const).map(mode => (
                                            <div
                                                key={mode}
                                                className="sidebar-control-option"
                                                onClick={() => { setSidebarMode(mode); setIsSidebarMenuOpen(false); }}
                                            >
                                                <div className="sidebar-control-radio">
                                                    {sidebarMode === mode && <div className="sidebar-control-radio-inner" />}
                                                </div>
                                                <span style={{ textTransform: 'capitalize' }}>
                                                    {mode === 'hover' ? 'Expand on hover' : mode}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                        <div
                            className={`sidebar-nav-item ${isSidebarMenuOpen ? 'active' : ''}`}
                            onClick={() => setIsSidebarMenuOpen(!isSidebarMenuOpen)}
                            title="Sidebar control"
                            style={{ marginBottom: '0.25rem' }}
                        >
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg></span>
                            <span className="nav-text">Layout</span>
                        </div>
                    </div>

                    <div
                        className={`sidebar-nav-item ${currentView === 'settings' ? 'active' : ''}`}
                        title="Settings"
                        onClick={() => { navigateTo('settings'); }}
                    >
                        <span className="nav-icon">{Icon.settings}</span>
                        <span className="nav-text">Settings</span>
                    </div>

                    <div
                        className="sidebar-nav-item"
                        title="Submit Feedback"
                        onClick={() => { setIsFeedbackModalOpen(true); setIsMobileMenuOpen(false); }}
                    >
                        <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></span>
                        <span className="nav-text">Submit Feedback</span>
                    </div>
                </div>
            </aside>

            {/* ══ MAIN ══ */}
            <div className={`dashboard-main sidebar-${sidebarMode}`}>
                {/* Topbar */}
                <div className="topbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button className="mobile-menu-toggle" onClick={() => setIsMobileMenuOpen(true)}>{Icon.menu}</button>
                        <div>
                            <div className="topbar-title">{viewTitles[currentView]}</div>
                            <div className="topbar-date">{dateStr}</div>
                        </div>
                    </div>
                    <div className="topbar-right">
                        <div className="topbar-actions">
                            <div className="topbar-divider" />
                            <button className="topbar-user-btn" onClick={() => navigateTo('profile')}>
                                <div className="topbar-user-info">
                                    <div className="topbar-user-name">{displayName}</div>
                                    <div className="topbar-user-role cd-role-badge" style={{ padding: 0 }}>Coordinator</div>
                                </div>
                                <div className="topbar-avatar cd-topbar-avatar" style={{
                                    background: profile?.avatar_url ? `url(${profile.avatar_url}) center/cover no-repeat` : undefined,
                                    color: profile?.avatar_url ? 'transparent' : undefined
                                }}>
                                    {profile?.avatar_url ? '' : initials}
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Page content */}
                <div className="page-content">
                    {currentView === 'overview' && (
                        <OverviewView
                            greeting={greeting}
                            displayName={displayName}
                            totalPendingCount={totalPendingCount}
                            companyCount={companyCount}
                            stats={overviewStats}
                            navigateTo={navigateTo}
                            departmentName={coordinatorDepartment?.name}
                        />
                    )}
                    {currentView === 'companies' && <CompaniesView />}
                    {currentView === 'departments' && <CoordinatorDepartmentView />}
                    {currentView === 'students' && <StudentsView initialFilter={studentFilter} />}
                    {currentView === 'approvals' && <ApprovalsView initialTab={approvalsTab} key={approvalsTab} />}
                    {currentView === 'announcement' && <AnnouncementsView isCoordinator={true} />}
                    {currentView === 'profile' && (
                        <CoordinatorProfileView
                            initialProfile={profile}
                            onProfileUpdated={setProfile}
                        />
                    )}
                    {currentView === 'settings' && (
                        <CoordinatorSettingsView />
                    )}
                </div>
            </div>

            {user && profile && (
                <ChatWidget currentUser={user} currentProfile={profile} />
            )}

            {user && (
                <FeedbackModal
                    isOpen={isFeedbackModalOpen}
                    onClose={() => setIsFeedbackModalOpen(false)}
                    userId={user.id}
                />
            )}
        </div>
    );
};

// ─── Overview View ────────────────────────────────────────────────────────────
interface OverviewProps {
    greeting: string;
    displayName: string;
    totalPendingCount: number;
    companyCount: number;
    stats: any;
    navigateTo: (v: View, filter?: string) => void;
    departmentName?: string;
}

const OverviewView: React.FC<OverviewProps> = ({ greeting, displayName, totalPendingCount, companyCount, stats, navigateTo, departmentName }) => {
    const [viewProfileId, setViewProfileId] = React.useState<string | null>(null);
    const quickStats = stats ? [
        {
            label: 'Total Assigned',
            value: stats.totalAssigned,
            sub: 'Active in companies',
            color: '#3b82f6',
            glow: 'rgba(59,130,246,0.15)',
            icon: Icon.users,
            action: () => navigateTo('students', 'assigned'),
        },
        {
            label: 'Completed',
            value: stats.completed,
            sub: 'Reached target hours',
            color: '#10b981',
            glow: 'rgba(16,185,129,0.15)',
            icon: Icon.check,
            action: () => navigateTo('students', 'completed'),
        },
        {
            label: 'In Progress',
            value: stats.inProgress,
            sub: 'Currently rendering hours',
            color: 'var(--primary)',
            glow: 'rgba(16,185,129,0.15)',
            icon: Icon.clock,
            action: () => navigateTo('students', 'in-progress'),
        },
        {
            label: 'At-Risk Students',
            value: stats.atRisk,
            sub: '3+ absences',
            color: '#ef4444',
            glow: 'rgba(239,68,68,0.15)',
            icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
            action: () => navigateTo('students', 'at-risk'),
        },
        {
            label: 'Reports Approval',
            value: stats.pendingApprovals,
            sub: stats.pendingApprovals === 0 ? 'All caught up' : 'Pending review',
            color: stats.pendingApprovals > 0 ? '#f59e0b' : '#10b981',
            glow: stats.pendingApprovals > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
            icon: Icon.file,
            action: () => navigateTo('approvals', 'journals'),
        },
        {
            label: 'Time Log Approvals',
            value: stats.pendingTimeLogs,
            sub: 'Pending review',
            color: stats.pendingTimeLogs > 0 ? '#f59e0b' : '#10b981',
            glow: stats.pendingTimeLogs > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
            icon: Icon.clock,
            action: () => navigateTo('approvals', 'dtr'),
        },
        {
            label: 'Dept Changes',
            value: stats.pendingDeptRequests,
            sub: 'Pending transfers',
            color: (stats.pendingDeptRequests || 0) > 0 ? '#f59e0b' : '#10b981',
            glow: (stats.pendingDeptRequests || 0) > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.828L3 3" /><path d="M15 13.846L21 21" /><path d="M10.584 10.584L13.5 13.5" /><path d="M12 22L12 22" /></svg>,
            action: () => navigateTo('approvals', 'dept_changes'),
        },
    ] : [];

    return (
        <div className="fade-in cd-overview-layout">
            <div className="cd-overview-main-col">
                {/* Welcome Banner */}
                <div className="cd-welcome-banner">
                    <div className="cd-welcome-bg" />
                    <div className="cd-welcome-content">
                        <div>
                            <p className="cd-welcome-greeting">{greeting},</p>
                            <h2 className="cd-welcome-name">
                                {displayName}
                                {departmentName && <span style={{ fontSize: '0.9rem', fontWeight: 500, opacity: 0.8, marginLeft: '0.75rem', verticalAlign: 'middle', background: 'rgba(255,255,255,0.15)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>{departmentName}</span>}
                            </h2>
                            <p className="cd-welcome-sub">Here's your SIL program snapshot for today.</p>
                        </div>
                        <div className="cd-welcome-actions">
                            <button className="btn btn-primary cd-btn-light" onClick={() => navigateTo('students')}>View Students</button>
                            <button className="btn btn-secondary cd-btn-ghost" onClick={() => navigateTo('announcement')}>Post Announcement</button>
                        </div>
                    </div>
                </div>

                {/* Stats Row */}
                <div className="cd-stats-grid">
                    {quickStats.map(stat => (
                        <div
                            key={stat.label}
                            className="cd-stat-card glass-card"
                            onClick={stat.action}
                            style={{ '--glow': stat.glow } as React.CSSProperties}
                        >
                            <div className="cd-stat-icon-wrap" style={{ background: stat.glow }}>
                                {stat.icon}
                            </div>
                            <div className="cd-stat-body">
                                <div className="cd-stat-value" style={{ color: stat.color }}>{stat.value}</div>
                                <div className="cd-stat-label">{stat.label}</div>
                                <div className="cd-stat-sub">{stat.sub}</div>
                            </div>
                            <div className="cd-stat-arrow">›</div>
                        </div>
                    ))}
                </div>

                {/* Progress Chart */}
                <div className="cd-card glass-card cd-progress-chart cd-overview-dynamic-card">
                    <div className="cd-card-header">
                        <span className="cd-card-title">Student Progress</span>
                    </div>
                    <div className="cd-card-body cd-scroll-body cd-dynamic-body" style={{ paddingTop: '1rem' }}>
                        {stats?.progressData && stats.progressData.length > 0 ? stats.progressData.map((p: any) => (
                            <div key={p.id} className="cd-progress-item" style={{ padding: '0 1.5rem', paddingBottom: '1.5rem', cursor: 'pointer', borderRadius: 8, transition: 'background 0.15s' }}
                                onClick={() => setViewProfileId(p.id)}
                                onMouseOver={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                                        {p.avatar ? (
                                            <img src={p.avatar} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                        ) : (
                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.85rem', flexShrink: 0 }}>
                                                {p.name.charAt(0)}
                                            </div>
                                        )}
                                        <UserClickableName userId={p.id} userName={p.name} style={{ fontWeight: 500, fontSize: '0.95rem', color: 'var(--text-bright)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} />
                                    </div>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', flexShrink: 0 }}>{p.hours} / {p.target} hrs</span>
                                </div>
                                <div style={{ background: 'var(--bg-secondary)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div
                                        style={{ height: '100%', width: `${Math.min(100, (p.hours / Math.max(1, p.target)) * 100)}%`, backgroundColor: p.hours >= p.target ? '#10b981' : '#3b82f6', borderRadius: '4px', transition: 'width 0.5s ease-out' }}
                                    />
                                </div>
                            </div>
                        )) : (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No assigned students found.</div>
                        )}
                    </div>
                </div>
            </div>

            <div className="cd-overview-side-col">
                {/* Weekly Activity Summary */}
                <div className="cd-card glass-card">
                    <div className="cd-card-body" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(16,185,129,0.15)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>This Week</div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-bright)', lineHeight: 1.2 }}>{stats?.thisWeekActivityCount || 0}</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>activities logged</div>
                        </div>
                    </div>
                </div>

                {/* Recent Submissions */}
                <div className="cd-card glass-card cd-overview-dynamic-card" style={{ marginTop: '1rem' }}>
                    <div className="cd-card-header">
                        <span className="cd-card-title">Recent Submissions</span>
                        <button className="cd-card-action" onClick={() => navigateTo('approvals')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem' }}>View All</button>
                    </div>
                    <div className="cd-card-body cd-scroll-body cd-dynamic-body" style={{ padding: 0 }}>
                        {stats?.recentActivity && stats.recentActivity.length > 0 ? stats.recentActivity.map((act: any) => (
                            <div key={act.id} style={{ display: 'flex', gap: '1rem', padding: '1rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s' }} onClick={() => navigateTo('approvals')} className="hover-row">
                                {act.student_avatar ? (
                                    <img src={act.student_avatar} alt="" style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                                ) : (
                                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--bg-secondary)', color: 'var(--text-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, flexShrink: 0 }}>
                                        {act.student_name.charAt(0)}
                                    </div>
                                )}
                                <div style={{ overflow: 'hidden' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-bright)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{act.student_name}</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: '0.2rem', marginBottom: '0.4rem' }}>{act.tasks}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(act.created_at).toLocaleDateString()}</div>
                                </div>
                            </div>
                        )) : (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No recent activity.</div>
                        )}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="cd-card glass-card" style={{ marginTop: '1rem' }}>
                    <div className="cd-card-header">
                        <span className="cd-card-title">Quick Actions</span>
                    </div>
                    <div className="cd-quick-actions-grid" style={{ borderTop: '1px solid var(--border)' }}>
                        {[
                            {
                                label: 'Review Documents',
                                sub: `${totalPendingCount} awaiting review`,
                                view: 'approvals' as View,
                                color: '#f59e0b',
                                bg: 'rgba(245,158,11,0.12)',
                                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
                            },
                            {
                                label: 'Manage Companies',
                                sub: `${companyCount} partner companies`,
                                view: 'companies' as View,
                                color: 'var(--primary)',
                                bg: 'rgba(16,185,129,0.12)',
                                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>,
                            },
                            {
                                label: 'Post Announcement',
                                sub: 'Notify all students',
                                view: 'announcement' as View,
                                color: '#10b981',
                                bg: 'rgba(16,185,129,0.12)',
                                icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
                            },
                        ].map(action => (
                            <button
                                key={action.label}
                                onClick={() => navigateTo(action.view)}
                                className="cd-quick-action-btn"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    padding: '1.25rem 1.5rem',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontFamily: 'Inter, sans-serif',
                                    textAlign: 'left',
                                    transition: 'background 0.15s',
                                }}
                            >
                                <div style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 10,
                                    background: action.bg,
                                    color: action.color,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    {action.icon}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-bright)', marginBottom: '0.2rem' }}>{action.label}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{action.sub}</div>
                                </div>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}><polyline points="9 18 15 12 9 6" /></svg>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <UserProfileModal
                profileId={viewProfileId}
                onClose={() => setViewProfileId(null)}
            />
        </div>
    );
};

export default CoordinatorDashboard;
