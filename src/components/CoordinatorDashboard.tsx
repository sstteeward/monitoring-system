import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { profileService, type Profile } from '../services/profileService';
import { coordinatorService } from '../services/coordinatorService';
import StudentsView from './StudentsView';
import ApprovalsView from './ApprovalsView';
import AnnouncementsView from './AnnouncementsView';
import CompaniesView from './CompaniesView';
import CoordinatorProfileView from './CoordinatorProfileView';
import CoordinatorSettingsView from './CoordinatorSettingsView';
import DashboardSkeleton from './DashboardSkeleton';
import ChatWidget from './ChatWidget';
import FeedbackModal from './FeedbackModal';
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

type View = 'overview' | 'companies' | 'students' | 'approvals' | 'announcements' | 'profile' | 'settings';

interface NavItem { id: View; label: string; icon: React.ReactNode; badge?: number; }

const CoordinatorDashboard: React.FC = () => {
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [currentView, setCurrentView] = useState<View>('overview');
    const [sidebarMode, setSidebarMode] = useState<'expanded' | 'collapsed' | 'hover'>('hover');
    const [isSidebarMenuOpen, setIsSidebarMenuOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

    useTheme();

    const [studentCount, setStudentCount] = useState(0);
    const [pendingDocsCount, setPendingDocsCount] = useState(0);
    const [companyCount, setCompanyCount] = useState(0);
    const [pendingCompanyRequestsCount, setPendingCompanyRequestsCount] = useState(0);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user));
        loadCoordinatorData();
    }, []);

    useEffect(() => {
        const titles: Record<string, string> = {
            overview: 'Overview',
            companies: 'OJT Companies',
            students: 'Students',
            approvals: 'Approvals',
            announcements: 'Announcements',
            profile: 'My Profile',
            settings: 'Settings',
        };
        document.title = `${titles[currentView] ?? 'Dashboard'} | SIL Monitor`;
    }, [currentView]);

    const loadCoordinatorData = async () => {
        setLoading(true);
        try {
            const [currentProfile, students, pendingDocs, companies, companyRequests] = await Promise.all([
                profileService.getCurrentProfile(),
                coordinatorService.getAllStudents(),
                coordinatorService.getPendingDocuments(),
                coordinatorService.getAllCompanies(),
                coordinatorService.getPendingCompanyRequests(),
            ]);
            setProfile(currentProfile);
            setStudentCount(students.length);
            setPendingDocsCount(pendingDocs.length);
            setCompanyCount(companies.length);
            setPendingCompanyRequestsCount(companyRequests.length);
        } catch (err) {
            console.error('Error loading coordinator data:', err);
        } finally {
            setLoading(false);
        }
    };

    const navigate = (view: View) => {
        setCurrentView(view);
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
                { id: 'students', label: 'Students', icon: Icon.users },
                { id: 'approvals', label: 'Approvals', icon: Icon.file, badge: pendingDocsCount > 0 ? pendingDocsCount : undefined },
            ],
        },
        {
            label: 'Communication',
            items: [
                { id: 'announcements', label: 'Announcements', icon: Icon.megaphone },
            ],
        },
    ];

    const viewTitles: Record<View, string> = {
        overview: 'Coordinator Overview',
        companies: 'OJT Companies',
        students: 'Student Management',
        approvals: 'Pending Approvals',
        announcements: 'Announcements',
        profile: 'My Profile',
        settings: 'Settings',
    };

    if (loading && !user) return <DashboardSkeleton />;

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

                {/* User block */}
                <div className="sidebar-user" onClick={() => navigate('profile')}>
                    <div className="sidebar-avatar cd-avatar" style={{
                        background: profile?.avatar_url ? `url(${profile.avatar_url}) center/cover no-repeat` : undefined,
                        color: profile?.avatar_url ? 'transparent' : undefined
                    }}>
                        {profile?.avatar_url ? '' : initials}
                    </div>
                    <div className="sidebar-user-info">
                        <div className="sidebar-user-name">{displayName}</div>
                        <div className="sidebar-user-role cd-role-badge">Coordinator</div>
                    </div>
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
                                        onClick={() => navigate(item.id)}
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
                        onClick={() => { navigate('settings'); }}
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
            <div className="dashboard-main">
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
                        {pendingDocsCount > 0 && (
                            <button
                                className="cd-alert-btn"
                                onClick={() => navigate('approvals')}
                                title={`${pendingDocsCount} documents pending review`}
                            >
                                <span className="cd-alert-dot" />
                                {pendingDocsCount} pending
                            </button>
                        )}
                        <div className="cd-topbar-avatar" onClick={() => navigate('profile')} title="Profile" style={{
                            background: profile?.avatar_url ? `url(${profile.avatar_url}) center/cover no-repeat` : undefined,
                            color: profile?.avatar_url ? 'transparent' : undefined
                        }}>
                            {profile?.avatar_url ? '' : initials}
                        </div>
                    </div>
                </div>

                {/* Page content */}
                <div className="page-content">
                    {currentView === 'overview' && (
                        <OverviewView
                            greeting={greeting}
                            displayName={displayName}
                            studentCount={studentCount}
                            pendingDocsCount={pendingDocsCount}
                            companyCount={companyCount}
                            navigate={navigate}
                        />
                    )}
                    {currentView === 'companies' && <CompaniesView />}
                    {currentView === 'students' && <StudentsView />}
                    {currentView === 'approvals' && <ApprovalsView />}
                    {currentView === 'announcements' && <AnnouncementsView isCoordinator={true} />}
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
    studentCount: number;
    pendingDocsCount: number;
    companyCount: number;
    navigate: (v: View) => void;
}

const OverviewView: React.FC<OverviewProps> = ({ greeting, displayName, studentCount, pendingDocsCount, companyCount, navigate }) => {
    const stats = [
        {
            label: 'Total Students',
            value: studentCount,
            sub: 'Enrolled in SIL program',
            color: '#10b981',
            glow: 'rgba(16,185,129,0.15)',
            icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
            action: () => navigate('students'),
        },
        {
            label: 'Partner Companies',
            value: companyCount,
            sub: 'Active OJT partners',
            color: '#7c3aed',
            glow: 'rgba(124,58,237,0.15)',
            icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>,
            action: () => navigate('companies'),
        },
        {
            label: 'Pending Approvals',
            value: pendingDocsCount,
            sub: pendingDocsCount === 0 ? 'All documents reviewed' : 'Documents need review',
            color: pendingDocsCount > 0 ? '#f59e0b' : '#10b981',
            glow: pendingDocsCount > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
            icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={pendingDocsCount > 0 ? '#f59e0b' : '#10b981'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
            action: () => navigate('approvals'),
        },
    ];

    return (
        <div className="fade-in">
            {/* Welcome Banner */}
            <div className="cd-welcome-banner">
                <div className="cd-welcome-bg" />
                <div className="cd-welcome-content">
                    <div>
                        <p className="cd-welcome-greeting">{greeting},</p>
                        <h2 className="cd-welcome-name">{displayName} 👋</h2>
                        <p className="cd-welcome-sub">Here's your SIL program snapshot for today.</p>
                    </div>
                    <div className="cd-welcome-actions">
                        <button className="btn btn-primary cd-btn-light" onClick={() => navigate('students')}>View Students</button>
                        <button className="btn btn-secondary cd-btn-ghost" onClick={() => navigate('announcements')}>Post Announcement</button>
                    </div>
                </div>
            </div>

            {/* Stats Row */}
            <div className="cd-stats-grid">
                {stats.map(stat => (
                    <div
                        key={stat.label}
                        className="cd-stat-card"
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

            {/* Quick Actions */}
            <div className="cd-card" style={{ marginTop: '0.5rem' }}>
                <div className="cd-card-header">
                    <span className="cd-card-title">Quick Actions</span>
                </div>
                <div className="cd-quick-actions-grid" style={{ borderTop: '1px solid var(--border)' }}>
                    {[
                        {
                            label: 'Review Documents',
                            sub: `${pendingDocsCount} awaiting review`,
                            view: 'approvals' as View,
                            color: '#f59e0b',
                            bg: 'rgba(245,158,11,0.12)',
                            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
                        },
                        {
                            label: 'Manage Companies',
                            sub: `${companyCount} partner companies`,
                            view: 'companies' as View,
                            color: '#7c3aed',
                            bg: 'rgba(124,58,237,0.12)',
                            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>,
                        },
                        {
                            label: 'Post Announcement',
                            sub: 'Notify all students',
                            view: 'announcements' as View,
                            color: '#10b981',
                            bg: 'rgba(16,185,129,0.12)',
                            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
                        },
                        {
                            label: 'Browse Students',
                            sub: `${studentCount} enrolled`,
                            view: 'students' as View,
                            color: '#3b82f6',
                            bg: 'rgba(59,130,246,0.12)',
                            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
                        },
                    ].map(action => (
                        <button
                            key={action.label}
                            onClick={() => navigate(action.view)}
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
    );
};

export default CoordinatorDashboard;
