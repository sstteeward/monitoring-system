import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { profileService, type Profile } from '../services/profileService';
import { adviserService } from '../services/adviserService';
import AdviserOverviewView from './AdviserOverviewView';
import AdviserSectionsView from './AdviserSectionsView';
import AdviserStudentsView from './AdviserStudentsView';
import AdviserApprovalsView from './AdviserApprovalsView';
import AdviserAttendanceView from './AdviserAttendanceView';
import AnnouncementsView from './AnnouncementsView';
import CoordinatorProfileView from './CoordinatorProfileView';
import CoordinatorSettingsView from './CoordinatorSettingsView';
import AdviserOnboardingView from './AdviserOnboardingView';
import ChatWidget from './ChatWidget';
import FeedbackModal from './FeedbackModal';
import { useTheme } from '../contexts/ThemeContext';
import './CoordinatorDashboard.css';
import './AdviserDashboard.css';

// Icons
const Icon = {
    grid: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
    layers: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
    users: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
    fileCheck: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="m9 15 2 2 4-4" /></svg>,
    clock: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    megaphone: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>,
    user: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
    settings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
    logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>,
    menu: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>,
    close: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
};

type View = 'overview' | 'sections' | 'students' | 'approvals' | 'attendance' | 'announcement' | 'profile' | 'settings';

interface NavItem { id: View; label: string; icon: React.ReactNode; badge?: number; }

const AdviserDashboard: React.FC = () => {
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [sidebarMode, setSidebarMode] = useState<'expanded' | 'collapsed' | 'hover'>('hover');
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const [settingsExpanded, setSettingsExpanded] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    // Filter routing params
    const [initialSectionFilter, setInitialSectionFilter] = useState<string>('all');
    const [initialApprovalsTab, setInitialApprovalsTab] = useState<'students' | 'journals' | 'documents' | 'timesheets'>('students');

    const [stats, setStats] = useState<any>(null);
    const [totalPendingCount, setTotalPendingCount] = useState(0);

    useTheme();
    const routerNavigate = useNavigate();
    const location = useLocation();

    // Determine current view from pathname (e.g. /adviser/students)
    const lastPart = location.pathname.split('/').pop();
    const currentView: View = (lastPart === 'adviser' || lastPart === '' ? 'overview' : lastPart as View) || 'overview';

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user));
        loadAdviserData();
    }, []);

    useEffect(() => {
        const titles: Record<string, string> = {
            overview: 'Adviser Overview',
            sections: 'My Sections',
            students: 'Student Monitoring',
            approvals: 'Pending Approvals',
            attendance: 'Attendance Monitoring',
            announcement: 'Announcements',
            profile: 'My Profile',
            settings: 'Settings',
        };
        document.title = `${titles[currentView] ?? 'Adviser Portal'} | SIL Monitoring`;
    }, [currentView]);

    const loadAdviserData = async () => {
        setLoading(true);
        try {
            const [currentProfile, dashboardStats] = await Promise.all([
                profileService.getCurrentProfile(),
                adviserService.getDashboardStats()
            ]);
            setProfile(currentProfile);
            setStats(dashboardStats);
            setTotalPendingCount(dashboardStats.totalPendingCount || 0);
        } catch (err) {
            console.error('Error loading adviser data:', err);
        } finally {
            setLoading(false);
        }
    };

    const refreshStats = async () => {
        try {
            const dashboardStats = await adviserService.getDashboardStats();
            setStats(dashboardStats);
            setTotalPendingCount(dashboardStats.totalPendingCount || 0);
        } catch (err) {
            console.error('Error refreshing stats:', err);
        }
    };

    const navigateTo = (view: View, param?: any) => {
        const query = view === 'settings' && param ? `?tab=${param}` : '';
        routerNavigate((view === 'overview' ? '/adviser' : `/adviser/${view}`) + query);

        if (view === 'students' && param) {
            setInitialSectionFilter(param);
        } else if (view === 'students') {
            setInitialSectionFilter('all');
        }

        if (view === 'approvals' && param) {
            setInitialApprovalsTab(param);
        } else if (view === 'approvals') {
            setInitialApprovalsTab('students');
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

    const displayName = profile?.first_name && profile?.last_name && !profile.first_name.includes('@')
        ? `${profile.first_name} ${profile.last_name}`
        : profile?.first_name && !profile.first_name.includes('@')
            ? profile.first_name
            : user?.email
                ? user.email.split('@')[0]
                : 'Section Adviser';

    const adviserType = profile?.adviser_type || (profile?.course === 'DHT' ? 'HT Adviser' : 'IT Adviser');
    const course = profile?.course || (adviserType === 'HT Adviser' ? 'DHT' : 'DIT');

    const navSections: { label: string; items: NavItem[] }[] = [
        {
            label: 'Management',
            items: [
                { id: 'overview', label: 'Overview', icon: Icon.grid },
                { id: 'sections', label: 'My Sections', icon: Icon.layers, badge: stats?.mySectionsCount },
                { id: 'students', label: 'My Students', icon: Icon.users },
                { id: 'approvals', label: 'Pending Approvals', icon: Icon.fileCheck, badge: totalPendingCount > 0 ? totalPendingCount : undefined },
                { id: 'attendance', label: 'Attendance', icon: Icon.clock },
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
        overview: 'Adviser Overview',
        sections: 'My Assigned Sections',
        students: 'Student Monitoring',
        approvals: 'Pending Approvals',
        attendance: 'Attendance Monitoring',
        announcement: 'Announcements',
        profile: 'My Profile',
        settings: 'Settings',
    };

    const isAdviserOnboarded = (p: Profile | null): boolean => {
        if (!p) return false;
        return Boolean(p.adviser_type && p.contact_number && p.birthday && (p.region_code || p.address));
    };

    if (loading && !user) {
        return (
            <div className="dashboard-container" style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
                <div className="sidebar-logo-icon ad-logo-icon fade-in" style={{ width: 64, height: 64, borderRadius: '16px' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
                </div>
            </div>
        );
    }

    if (profile && !isAdviserOnboarded(profile)) {
        return (
            <AdviserOnboardingView
                profile={profile}
                onComplete={async () => {
                    await loadAdviserData();
                }}
            />
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
                        <div className="sidebar-logo-icon ad-logo-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
                        </div>
                        <div className="sidebar-logo-text-group">
                            <div className="sidebar-logo-text">SIL Adviser</div>
                            <div className="sidebar-logo-sub">Asian College Dumaguete</div>
                        </div>
                    </div>
                    <button className="mobile-close-btn" onClick={() => setIsMobileMenuOpen(false)}>{Icon.close}</button>
                </div>

                {/* Nav items */}
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
                                            {item.badge !== undefined && item.badge > 0 && (
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

                <div className="sidebar-bottom" />
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
                            <div style={{ position: 'relative' }}>
                                <button className="topbar-user-btn" onClick={() => setShowAccountMenu(!showAccountMenu)}>
                                    <div className="topbar-user-info">
                                        <div className="topbar-user-name">{displayName}</div>
                                        <div className="topbar-user-role ad-role-badge" style={{ padding: 0 }}>
                                            {adviserType}
                                        </div>
                                    </div>
                                    <div className="topbar-avatar ad-topbar-avatar" style={{
                                        background: profile?.avatar_url ? `url(${profile.avatar_url}) center/cover no-repeat` : undefined,
                                        color: profile?.avatar_url ? 'transparent' : undefined
                                    }}>
                                        {profile?.avatar_url ? '' : initials}
                                    </div>
                                    <svg className={`topbar-dropdown-caret${showAccountMenu ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                                </button>

                                {showAccountMenu && (
                                    <>
                                        <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowAccountMenu(false)} />
                                        <div className="account-dropdown">
                                            <div className="account-dropdown-header">
                                                <div className="account-dropdown-avatar" style={{
                                                    background: profile?.avatar_url ? `url(${profile.avatar_url}) center/cover no-repeat` : undefined,
                                                    color: profile?.avatar_url ? 'transparent' : undefined
                                                }}>
                                                    {profile?.avatar_url ? '' : initials}
                                                </div>
                                                <div>
                                                    <div className="account-dropdown-name">{displayName}</div>
                                                    <div className="account-dropdown-email">{user?.email}</div>
                                                </div>
                                            </div>

                                            <button className="account-dropdown-link" onClick={() => { setShowAccountMenu(false); navigateTo('profile'); }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7" r="4" /><path d="M5.5 21a8.38 8.38 0 0 1 13 0" /></svg>
                                                See your profile
                                            </button>

                                            <div className="account-dropdown-divider" />

                                            <div className="account-dropdown-item" onClick={() => setSettingsExpanded(!settingsExpanded)}>
                                                <div className="account-dropdown-icon">{Icon.settings}</div>
                                                <span>Settings & privacy</span>
                                                <svg className={`account-dropdown-chevron${settingsExpanded ? ' expanded' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                                            </div>

                                            {settingsExpanded && (
                                                <div className="account-dropdown-submenu">
                                                    <div className="account-dropdown-subitem" onClick={() => { setShowAccountMenu(false); setSettingsExpanded(false); navigateTo('settings'); }}>
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                                                        <span>Settings</span>
                                                    </div>
                                                    <div className="account-dropdown-subitem" onClick={() => { setShowAccountMenu(false); setSettingsExpanded(false); navigateTo('settings', 'appearance'); }}>
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                                                        <span>Appearance</span>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="account-dropdown-item" onClick={() => { setShowAccountMenu(false); setIsFeedbackModalOpen(true); }}>
                                                <div className="account-dropdown-icon">
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                                </div>
                                                <span>Give feedback</span>
                                                <svg className="account-dropdown-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                                            </div>

                                            <div className="account-dropdown-divider" />

                                            <div className="account-dropdown-item" onClick={() => { setShowAccountMenu(false); setShowLogoutConfirm(true); }}>
                                                <div className="account-dropdown-icon">{Icon.logout}</div>
                                                <span>Log out</span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Page content */}
                <div className="page-content">
                    {currentView === 'overview' && (
                        <AdviserOverviewView
                            greeting={greeting}
                            displayName={displayName}
                            adviserType={adviserType}
                            course={course}
                            stats={stats}
                            navigateTo={navigateTo}
                        />
                    )}
                    {currentView === 'sections' && (
                        <AdviserSectionsView
                            onSelectSection={(secName) => navigateTo('students', secName)}
                        />
                    )}
                    {currentView === 'students' && (
                        <AdviserStudentsView
                            initialSection={initialSectionFilter}
                        />
                    )}
                    {currentView === 'approvals' && (
                        <AdviserApprovalsView
                            initialTab={initialApprovalsTab}
                            onActionComplete={refreshStats}
                        />
                    )}
                    {currentView === 'attendance' && (
                        <AdviserAttendanceView />
                    )}
                    {currentView === 'announcement' && (
                        <AnnouncementsView isCoordinator={false} />
                    )}
                    {currentView === 'profile' && (
                        <CoordinatorProfileView
                            initialProfile={profile}
                            onProfileUpdated={setProfile}
                        />
                    )}
                    {currentView === 'settings' && (
                        <CoordinatorSettingsView
                            sidebarMode={sidebarMode}
                            setSidebarMode={setSidebarMode}
                        />
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

            {/* Logout Confirmation Modal */}
            {showLogoutConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div className="glass-card" style={{
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 20, padding: '2rem', width: '90%', maxWidth: 420,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
                    }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                        </div>
                        <h3 style={{ textAlign: 'center', color: 'var(--text-primary)', margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 600 }}>Sign Out?</h3>
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 1.75rem' }}>
                            Are you sure you want to sign out of your adviser account?
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={() => setShowLogoutConfirm(false)}
                                className="cd-btn cd-btn-outline"
                                style={{ flex: 1 }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    await supabase.auth.signOut();
                                    window.location.href = '/';
                                }}
                                className="cd-btn cd-btn-primary"
                                style={{ flex: 1, background: '#ef4444', borderColor: '#ef4444' }}
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdviserDashboard;
