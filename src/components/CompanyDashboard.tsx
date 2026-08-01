import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { profileService, type Profile } from '../services/profileService';
import { useTheme } from '../contexts/ThemeContext';
import './CompanyDashboard.css';

import CompanyStudentsView from './CompanyStudentsView';

import CompanyAttendanceView from './CompanyAttendanceView';

import CompanyJournalView from './CompanyJournalView';

import CompanyEvaluationView from './CompanyEvaluationView';

import CompanyAnnouncementsView from './CompanyAnnouncementsView';

import CompanyScheduleView from './CompanyScheduleView';

import CompanyDocumentsView from './CompanyDocumentsView';

import CompanyProfileView from './CompanyProfileView';

import CompanySecurityLogsView from './CompanySecurityLogsView';


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
    logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
};

type View = 'overview' | 'students' | 'attendance' | 'journals' | 'evaluations' | 'announcements' | 'schedule' | 'documents' | 'profile' | 'security';

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
                    <div className="company-stat-icon-wrap" style={{ background: 'var(--bg-elevated)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)' }}>{Icon.users}</div>
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

    useTheme();

    useEffect(() => {
        const path = location.pathname.replace('/company/', '').replace('/company', '');
        const validSlugs: View[] = ['overview', 'students', 'attendance', 'journals', 'evaluations', 'announcements', 'schedule', 'documents', 'profile', 'security'];

        if (validSlugs.includes(path as View)) {
            setCurrentView(path as View);
        } else if (location.pathname === '/company' || location.pathname === '/company/') {
            setCurrentView('overview');
        }
    }, [location]);

    const navigateTo = (view: View) => {
        navigate(view === 'overview' ? '/company' : `/company/${view}`);
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
        navigate('/login', { replace: true });
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

    const initials = profile?.first_name ? `${profile.first_name[0]}${profile.last_name?.[0] || ''}`.toUpperCase() : 'CO';

    return (
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
                    <div className={`company-nav-item ${currentView === 'profile' ? 'active' : ''}`} onClick={() => navigateTo('profile')}>
                        <span className="nav-icon">{Icon.building}</span> <span className="nav-text">Company Profile</span>
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
                            </div>
                        </div>
                    </div>
                    <div className="company-topbar-right">
                        <div style={{ position: 'relative' }}>
                            <button className="company-topbar-user-btn" onClick={() => setShowAccountMenu(!showAccountMenu)}>
                                <div className="company-topbar-user-info">
                                    <div className="company-topbar-user-name">{profile?.first_name} {profile?.last_name}</div>
                                    <div className="company-topbar-user-role">SUPERVISOR</div>
                                </div>
                                <div className="company-topbar-avatar">
                                    {initials}
                                </div>
                            </button>

                            {showAccountMenu && (
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowAccountMenu(false)} />
                                    <div className="account-dropdown" style={{position: 'absolute', right: 0, top: '100%', marginTop: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '0.5rem', minWidth: '200px', zIndex: 999, boxShadow: '0 4px 20px rgba(0,0,0,0.2)'}}>
                                        <div className="account-dropdown-item" onClick={() => { setShowAccountMenu(false); setShowLogoutConfirm(true); }} style={{display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', cursor: 'pointer', color: 'var(--text-red)'}}>
                                            {Icon.logout}
                                            <span>Log out</span>
                                        </div>
                                    </div>
                                </>
                            )}
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
                    </Routes>
                </div>
                
                {showLogoutConfirm && (
                    <div className="modal-overlay">
                        <div className="modal-content glass-card" style={{ maxWidth: 400 }}>
                            <h3>Log Out</h3>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Are you sure you want to log out of the Company Portal?</p>
                            <div className="modal-actions">
                                <button className="btn-secondary" onClick={() => setShowLogoutConfirm(false)}>Cancel</button>
                                <button className="btn-danger" onClick={handleLogout}>Log Out</button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default CompanyDashboard;
