import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { profileService, type Profile } from '../services/profileService';
import { useTheme } from '../contexts/ThemeContext';
import './CompanyDashboard.css';

import CompanyStudentsView from './CompanyStudentsView';

import CompanyAttendanceView from './CompanyAttendanceView';

import CompanyJournalView from './CompanyJournalView';

import CompanyEvaluationView from './CompanyEvaluationView';

import { NotificationsProvider } from '../contexts/NotificationsContext';
import NotificationBell from './NotificationBell';
import NotificationToaster from './NotificationToaster';
import CompanyAnnouncementsView from './CompanyAnnouncementsView';

import CompanyScheduleView from './CompanyScheduleView';

import CompanyDocumentsView from './CompanyDocumentsView';

import CompanyProfileView from './CompanyProfileView';

import CompanySecurityLogsView from './CompanySecurityLogsView';
import CompanyOnboardingView from './CompanyOnboardingView';
import CompanySettingsView from './CompanySettingsView';


// --- Icons ---
const Icon = {
    grid: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
    users: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
    clock: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    book: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>,
    star: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>,
    speaker: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>,
    calendar: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>,
    folder: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>,
    building: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>,
    shield: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>,
    settings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
    logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
};

type View = 'overview' | 'students' | 'attendance' | 'journals' | 'evaluations' | 'announcements' | 'schedule' | 'documents' | 'profile' | 'security' | 'settings';

const CompanyOverview = ({ profile }: { profile: Profile | null }) => {
    return (
        <div className="fade-in">
            <div className="company-welcome-banner">
                <div className="company-welcome-bg" />
                <div className="company-welcome-content">
                    <div>
                        <p className="company-welcome-greeting">Welcome back,</p>
                        <h2 className="company-welcome-name">{profile?.first_name} {profile?.last_name}</h2>
                        <p className="company-welcome-sub">Company Supervisor • {profile?.company?.name || 'Company Portal'}</p>
                    </div>
                </div>
            </div>
            
            <div className="company-stats-grid">
                <div className="company-stat-card glass-card">
                    <div className="company-stat-icon-wrap" style={{ background: 'var(--bg-elevated)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>{Icon.users}</div>
                    <div>
                        <div className="company-stat-value">0</div>
                        <div className="company-stat-label">Assigned Interns</div>
                    </div>
                </div>
                <div className="company-stat-card glass-card">
                    <div className="company-stat-icon-wrap" style={{ background: 'var(--bg-elevated)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>{Icon.clock}</div>
                    <div>
                        <div className="company-stat-value">0</div>
                        <div className="company-stat-label">Present Today</div>
                    </div>
                </div>
                <div className="company-stat-card glass-card">
                    <div className="company-stat-icon-wrap" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{Icon.book}</div>
                    <div>
                        <div className="company-stat-value">0</div>
                        <div className="company-stat-label">Pending Journals</div>
                    </div>
                </div>
                <div className="company-stat-card glass-card">
                    <div className="company-stat-icon-wrap" style={{ background: 'var(--bg-elevated)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.2)' }}>{Icon.star}</div>
                    <div>
                        <div className="company-stat-value">0</div>
                        <div className="company-stat-label">Pending Evaluations</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CompanyDashboard: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState<View>('overview');
    const [sidebarMode, setSidebarMode] = useState<'expanded' | 'collapsed' | 'hover'>('hover');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [settingsExpanded, setSettingsExpanded] = useState(false);
    useTheme();

    useEffect(() => {
        const path = location.pathname.replace('/company/', '').replace('/company', '');
        const validSlugs: View[] = ['overview', 'students', 'attendance', 'journals', 'evaluations', 'announcements', 'schedule', 'documents', 'profile', 'security', 'settings'];

        if (validSlugs.includes(path as View)) {
            setCurrentView(path as View);
        } else if (location.pathname === '/company' || location.pathname === '/company/') {
            setCurrentView('overview');
        }
    }, [location]);

    const navigateTo = (view: View, param?: string) => {
        const query = view === 'settings' && param ? `?tab=${param}` : '';
        navigate((view === 'overview' ? '/company' : `/company/${view}`) + query);
        setIsMobileMenuOpen(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const currentProfile = await profileService.getCurrentProfile();
            setProfile(currentProfile);
        } catch (err) {
            console.error('Error loading company data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/', { replace: true });
    };

    if (loading) {
        return (
            <div className="company-dashboard-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
                <div className="company-logo-icon" style={{ width: 64, height: 64 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                </div>
            </div>
        );
    }

    if (profile && profile.account_type === 'company' && !profile.company_id) {
        return <CompanyOnboardingView profile={profile} />;
    }

    const initials = profile?.first_name ? `${profile.first_name[0]}${profile.last_name?.[0] || ''}`.toUpperCase() : 'CO';

    return (
        <NotificationsProvider role="company">
        <div className={`company-dashboard-container ${isMobileMenuOpen ? 'mobile-menu-open' : ''}`}>
            <div className="company-mobile-overlay" onClick={() => setIsMobileMenuOpen(false)} />

            <aside className={`company-sidebar sidebar-mode-${sidebarMode} ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
                <div className="company-sidebar-header">
                    <div className="company-logo-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                    </div>
                    <div className="company-logo-text-group">
                        <div className="company-logo-text">Company Portal</div>
                        <div className="company-logo-sub">{profile?.company?.name || 'Partner'}</div>
                    </div>
                </div>

                <nav className="company-nav">
                    <div className={`company-nav-item ${currentView === 'overview' ? 'active' : ''}`} onClick={() => navigateTo('overview')}>
                        <span className="nav-icon">{Icon.grid}</span> <span className="nav-text">Dashboard</span>
                    </div>
                    <div className={`company-nav-item ${currentView === 'students' ? 'active' : ''}`} onClick={() => navigateTo('students')}>
                        <span className="nav-icon">{Icon.users}</span> <span className="nav-text">Assigned Interns</span>
                    </div>
                    <div className={`company-nav-item ${currentView === 'attendance' ? 'active' : ''}`} onClick={() => navigateTo('attendance')}>
                        <span className="nav-icon">{Icon.clock}</span> <span className="nav-text">Attendance</span>
                    </div>
                    <div className={`company-nav-item ${currentView === 'journals' ? 'active' : ''}`} onClick={() => navigateTo('journals')}>
                        <span className="nav-icon">{Icon.book}</span> <span className="nav-text">Journals</span>
                    </div>
                    <div className={`company-nav-item ${currentView === 'evaluations' ? 'active' : ''}`} onClick={() => navigateTo('evaluations')}>
                        <span className="nav-icon">{Icon.star}</span> <span className="nav-text">Evaluations</span>
                    </div>
                    <div className={`company-nav-item ${currentView === 'announcements' ? 'active' : ''}`} onClick={() => navigateTo('announcements')}>
                        <span className="nav-icon">{Icon.speaker}</span> <span className="nav-text">Announcements</span>
                    </div>
                    <div className={`company-nav-item ${currentView === 'schedule' ? 'active' : ''}`} onClick={() => navigateTo('schedule')}>
                        <span className="nav-icon">{Icon.calendar}</span> <span className="nav-text">Schedules</span>
                    </div>
                    <div className={`company-nav-item ${currentView === 'documents' ? 'active' : ''}`} onClick={() => navigateTo('documents')}>
                        <span className="nav-icon">{Icon.folder}</span> <span className="nav-text">Documents</span>
                    </div>
                    <div className={`company-nav-item ${currentView === 'security' ? 'active' : ''}`} onClick={() => navigateTo('security')}>
                        <span className="nav-icon">{Icon.shield}</span> <span className="nav-text">Security Logs</span>
                    </div>
                </nav>
            </aside>

            <main className="company-main">
                <header className="company-topbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button className="company-mobile-toggle" onClick={() => setIsMobileMenuOpen(true)}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                        </button>
                        <div>
                            <div className="company-topbar-title">
                                {currentView === 'overview' && 'Company Dashboard'}
                                {currentView === 'students' && 'Assigned Interns'}
                                {currentView === 'attendance' && 'Attendance Monitoring'}
                                {currentView === 'journals' && 'Journal Management'}
                                {currentView === 'evaluations' && 'Student Evaluations'}
                                {currentView === 'announcements' && 'Announcements'}
                                {currentView === 'schedule' && 'Schedule Management'}
                                {currentView === 'documents' && 'Documents'}
                                {currentView === 'profile' && 'Company Profile'}
                                {currentView === 'security' && 'Security Logs'}
                                {currentView === 'settings' && 'Settings'}
                            </div>
                        </div>
                    </div>
                    <div className="company-topbar-right" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <NotificationBell />

                            <div className="topbar-divider" style={{ width: 1, height: 24, background: 'var(--border)' }} />
                            
                            <div style={{ position: 'relative' }}>
                                <button className="company-topbar-user-btn" onClick={() => setShowAccountMenu(!showAccountMenu)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'right' }}>
                                    <div className="company-topbar-user-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                        <div className="company-topbar-user-name" style={{ fontWeight: 600, color: 'var(--text-bright)', fontSize: '0.95rem' }}>{profile?.first_name} {profile?.last_name}</div>
                                        <div className="company-topbar-user-role" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>SUPERVISOR</div>
                                    </div>
                                    <div className="company-topbar-avatar" style={{ 
                                        width: 40, height: 40, borderRadius: '12px', 
                                        background: profile?.avatar_url ? `url(${profile.avatar_url}) center/cover no-repeat` : 'linear-gradient(135deg, #10b981, #059669)',
                                        color: profile?.avatar_url ? 'transparent' : '#fff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 700, fontSize: '1rem',
                                        boxShadow: '0 4px 12px rgba(16,185,129,0.25)'
                                    }}>
                                        {profile?.avatar_url ? '' : initials}
                                    </div>
                                    <svg className={`topbar-dropdown-caret${showAccountMenu ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', transition: 'transform 0.2s', transform: showAccountMenu ? 'rotate(180deg)' : 'none', marginLeft: '2px' }}><polyline points="6 9 12 15 18 9" /></svg>
                                </button>

                            {showAccountMenu && (
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowAccountMenu(false)} />
                                    <div className="account-dropdown" style={{ right: 0, top: '100%', marginTop: '0.5rem', position: 'absolute' }}>
                                        <div className="account-dropdown-header">
                                            <div className="account-dropdown-avatar" style={{
                                                background: profile?.avatar_url ? `url(${profile.avatar_url}) center/cover no-repeat` : undefined,
                                                color: profile?.avatar_url ? 'transparent' : undefined
                                            }}>
                                                {profile?.avatar_url ? '' : initials}
                                            </div>
                                            <div>
                                                <div className="account-dropdown-name">{profile?.first_name} {profile?.last_name}</div>
                                                <div className="account-dropdown-email">{profile?.email || 'Company account'}</div>
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
                                                <div className="account-dropdown-subitem" onClick={() => { setShowAccountMenu(false); setSettingsExpanded(false); navigateTo('settings', 'notifications'); }}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                                                    <span>Notifications</span>
                                                </div>
                                                <div className="account-dropdown-subitem" onClick={() => { setShowAccountMenu(false); setSettingsExpanded(false); navigateTo('settings', 'security'); }}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                                                    <span>Security</span>
                                                </div>
                                            </div>
                                        )}

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
            </header>

                <div className="company-page-content">
                    <Routes>
                        <Route path="/" element={<CompanyOverview profile={profile} />} />
                        <Route path="/students" element={<CompanyStudentsView />} />
                        <Route path="/attendance" element={<CompanyAttendanceView />} />
                        <Route path="/journals" element={<CompanyJournalView />} />
                        <Route path="/evaluations" element={<CompanyEvaluationView />} />
                        <Route path="/announcements" element={<CompanyAnnouncementsView />} />
                        <Route path="/schedule" element={<CompanyScheduleView />} />
                        <Route path="/documents" element={<CompanyDocumentsView />} />
                        <Route path="/profile" element={<CompanyProfileView />} />
                        <Route path="/security" element={<CompanySecurityLogsView />} />
                        <Route path="/settings" element={<CompanySettingsView sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} />} />
                    </Routes>
                </div>
                
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
                            animation: 'fadeIn 0.2s ease',
                        }}>
                            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                    <polyline points="16 17 21 12 16 7" />
                                    <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                            </div>
                            <h3 style={{ textAlign: 'center', color: 'var(--text-primary)', margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 600 }}>Log Out?</h3>
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 1.75rem' }}>
                                Are you sure you want to log out of the Company Portal? You will need to log in again to access the dashboard.
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    onClick={() => setShowLogoutConfirm(false)}
                                    style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleLogout}
                                    style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(239,68,68,0.35)' }}
                                >
                                    Log Out
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <NotificationToaster />
        </div>
        </NotificationsProvider>
    );
};

export default CompanyDashboard;
