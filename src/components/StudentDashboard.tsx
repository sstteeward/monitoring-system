import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { timeTrackingService, type Timesheet } from '../services/timeTracking';
import { profileService, type Profile } from '../services/profileService';
import TimesheetView from './TimesheetView';
import PerformanceView from './PerformanceView';
import ProfileView from './ProfileView';
import SettingsView from './SettingsView';
import JournalView from './JournalView';
import AnnouncementsView from './AnnouncementsView';
import DocumentsView from './DocumentsView';
import OnboardingView from './OnboardingView';
import './StudentDashboard.css';

const StudentDashboard: React.FC = () => {
    const [user, setUser] = useState<any>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [session, setSession] = useState<Timesheet | null>(null);
    const [loading, setLoading] = useState(true);
    const [elapsed, setElapsed] = useState<string>('00:00:00');
    const [elapsedSecs, setElapsedSecs] = useState(0);
    const [collapsed, setCollapsed] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [currentView, setCurrentView] = useState<'dashboard' | 'timesheets' | 'journal' | 'performance' | 'profile' | 'settings' | 'documents' | 'school'>('dashboard');
    const [todaySessions, setTodaySessions] = useState<Timesheet[]>([]);
    const [hasNewAnnouncements, setHasNewAnnouncements] = useState(false);
    const [needsOnboarding, setNeedsOnboarding] = useState(false);
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user));
        loadSession();
        loadProfile();
        checkAnnouncements();
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    const checkAnnouncements = async () => {
        try {
            const { data } = await supabase
                .from('announcements')
                .select('created_at')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            if (!data) return;
            const lastSeen = localStorage.getItem('announcements-last-seen');
            if (!lastSeen || new Date(data.created_at) > new Date(lastSeen)) {
                setHasNewAnnouncements(true);
            }
        } catch {
            // No announcements yet — ignore
        }
    };

    const markAnnouncementsSeen = () => {
        localStorage.setItem('announcements-last-seen', new Date().toISOString());
        setHasNewAnnouncements(false);
    };

    const loadProfile = async () => {
        try {
            const data = await profileService.getCurrentProfile();
            setProfile(data);
            // Show onboarding if company hasn't been set yet
            if (!data?.company_id) {
                setNeedsOnboarding(true);
            }
        } catch (err) {
            console.error('Error loading profile:', err);
        }
    };

    const loadSession = async () => {
        try {
            const current = await timeTrackingService.getCurrentSession();
            setSession(current);
            await loadTodaySessions();
        } catch (err) {
            console.error('Error loading session:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadTodaySessions = async () => {
        try {
            const all = await timeTrackingService.getTimesheets();
            const today = new Date().toLocaleDateString('en-US');
            const filtered = all.filter(ts => new Date(ts.clock_in).toLocaleDateString('en-US') === today);
            setTodaySessions(filtered);
        } catch (err) {
            console.error('Error loading today sessions:', err);
        }
    };

    useEffect(() => {
        if (session?.status === 'working') {
            startTicker();
        } else if (session?.status === 'break') {
            stopTicker();
            setElapsed('On Break');
            setElapsedSecs(0);
        } else {
            stopTicker();
            setElapsed('00:00:00');
            setElapsedSecs(0);
        }
    }, [session]);

    const startTicker = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        updateTimer();
        timerRef.current = window.setInterval(updateTimer, 1000);
    };

    const stopTicker = () => {
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const updateTimer = () => {
        if (!session?.clock_in) return;
        const diff = Math.max(0, Date.now() - new Date(session.clock_in).getTime());
        const total = Math.floor(diff / 1000);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        setElapsedSecs(total);
        setElapsed(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };

    const handleClockIn = async () => {
        try {
            setLoading(true);
            const newSession = await timeTrackingService.clockIn();
            setSession(newSession);
            await loadTodaySessions();
        }
        catch (e) { alert('Error clocking in: ' + (e as Error).message); }
        finally { setLoading(false); }
    };

    const handleClockOut = async () => {
        if (!session) return;
        try {
            setLoading(true);
            await timeTrackingService.clockOut(session.id);
            setSession(null);
            await loadTodaySessions();
        }
        catch (e) { alert('Error clocking out: ' + (e as Error).message); }
        finally { setLoading(false); }
    };

    const handleBreak = async () => {
        if (!session) return;
        try {
            setLoading(true);
            const updated = session.status === 'working'
                ? await timeTrackingService.startBreak(session.id)
                : await timeTrackingService.endBreak(session.id);
            setSession(updated);
            await loadTodaySessions();
        } catch (e) { alert('Error: ' + (e as Error).message); }
        finally { setLoading(false); }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.reload();
    };

    const toggleSidebar = () => setCollapsed(!collapsed);
    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
    const closeMobileMenu = () => setIsMobileMenuOpen(false);

    const MAX_SECS = 8 * 3600;

    // Calculate total seconds worked today from completed sessions
    const completedSessions = todaySessions.filter(ts => ts.status === 'completed');
    const completedSecsToday = completedSessions.reduce((acc, ts) => {
        if (ts.clock_out) {
            const start = new Date(ts.clock_in).getTime();
            const end = new Date(ts.clock_out).getTime();
            return acc + Math.floor((end - start) / 1000);
        }
        return acc;
    }, 0);

    // Dynamic Button Label for Clock Out
    let clockOutLabel = "Clock Out";

    if (session) {
        if (completedSessions.length === 0) clockOutLabel = "Time Out (Morning)";
        else if (completedSessions.length === 1) clockOutLabel = "Time Out (Afternoon)";
        else clockOutLabel = "Clock Out";
    }

    const totalSecsWorkedToday = completedSecsToday + (session?.status === 'working' ? elapsedSecs : 0);
    const progress = Math.min(totalSecsWorkedToday / MAX_SECS, 1);
    const progressPct = Math.round(progress * 100);
    const hoursWorkedStr = (totalSecsWorkedToday / 3600).toFixed(1);
    const statusKey = session?.status ?? 'inactive';

    const clockInTime = session?.clock_in
        ? new Date(session.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : todaySessions.length > 0
            ? new Date(todaySessions[todaySessions.length - 1].clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '—';

    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Helper to format email slug to a name (fallback)
    const formatSlug = (slug: string) => {
        return slug
            .split(/[._-]/)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    };

    // Avatar initials from profile name or email
    const initials = profile?.first_name
        ? profile.first_name[0].toUpperCase()
        : user?.email ? user.email[0].toUpperCase() : '?';

    const displayName = profile?.first_name && profile?.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : user?.email
            ? formatSlug(user.email.split('@')[0])
            : 'User';

    if (loading && !user) return <div className="dashboard-loading">Loading…</div>;

    // Show onboarding for students who haven't set their company yet
    if (needsOnboarding && profile) {
        return (
            <OnboardingView
                profile={profile}
                onComplete={async () => {
                    await loadProfile();
                    setNeedsOnboarding(false);
                }}
            />
        );
    }

    return (
        <div className={`dashboard-container ${collapsed ? 'sidebar-collapsed' : ''} ${isMobileMenuOpen ? 'mobile-menu-open' : ''}`}>
            {/* Mobile Overlay */}
            <div className="mobile-overlay" onClick={closeMobileMenu} />

            {/* ══ SIDEBAR ══ */}
            <aside className={`sidebar${isMobileMenuOpen ? ' mobile-open' : ''}`}>
                {/* Logo & Toggle */}
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <div className="sidebar-logo-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        </div>
                        <div className="sidebar-logo-text-group">
                            <div className="sidebar-logo-text">SIL Monitor</div>
                            <div className="sidebar-logo-sub">Asian College Dumaguete</div>
                        </div>
                    </div>
                    <button className="sidebar-toggle-btn d-none-mobile" onClick={toggleSidebar} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
                        {collapsed ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" /></svg>
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" /></svg>
                        )}
                    </button>
                    {/* Mobile Close Button */}
                    <button className="mobile-close-btn" onClick={closeMobileMenu}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                {/* User */}
                <div className="sidebar-user" title={user?.email} onClick={() => { setCurrentView('profile'); closeMobileMenu(); }}>
                    <div className="sidebar-avatar">{initials}</div>
                    <div className="sidebar-user-info">
                        <div className="sidebar-user-name">{displayName}</div>
                        <div className="sidebar-user-role" style={{ textTransform: 'capitalize' }}>
                            {profile?.account_type ?? 'Student'}
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <div className="sidebar-scrollable">
                    <div className="sidebar-section-label">Workspace</div>
                    <nav className="sidebar-nav">
                        <div
                            className={`sidebar-nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
                            title="Dashboard"
                            onClick={() => { setCurrentView('dashboard'); closeMobileMenu(); }}
                        >
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg></span>
                            <span className="nav-text">Dashboard</span>
                        </div>
                        <div
                            className={`sidebar-nav-item ${currentView === 'timesheets' ? 'active' : ''}`}
                            title="Timesheets"
                            onClick={() => { setCurrentView('timesheets'); closeMobileMenu(); }}
                        >
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></span>
                            <span className="nav-text">Timesheets</span>
                        </div>
                        <div
                            className={`sidebar-nav-item ${currentView === 'journal' ? 'active' : ''}`}
                            title="Daily Journal"
                            onClick={() => { setCurrentView('journal'); closeMobileMenu(); }}
                        >
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg></span>
                            <span className="nav-text">Daily Journal</span>
                        </div>
                        <div
                            className={`sidebar-nav-item ${currentView === 'performance' ? 'active' : ''}`}
                            title="Performance"
                            onClick={() => { setCurrentView('performance'); closeMobileMenu(); }}
                        >
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg></span>
                            <span className="nav-text">Performance</span>
                        </div>
                    </nav>

                    <div className="sidebar-section-label">Notifications</div>
                    <nav className="sidebar-nav">
                        <div
                            className={`sidebar-nav-item ${currentView === 'documents' ? 'active' : ''}`}
                            title="Documents"
                            onClick={() => { setCurrentView('documents'); closeMobileMenu(); }}
                        >
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg></span>
                            <span className="nav-text">Documents</span>
                        </div>
                        <div
                            className={`sidebar-nav-item ${currentView === 'school' ? 'active' : ''}`}
                            title="School Announcements"
                            onClick={() => { setCurrentView('school'); markAnnouncementsSeen(); closeMobileMenu(); }}
                            style={{ position: 'relative' }}
                        >
                            <span className="nav-icon" style={{ position: 'relative' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                                {hasNewAnnouncements && (
                                    <span style={{
                                        position: 'absolute', top: -3, right: -3,
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: '#10b981',
                                        boxShadow: '0 0 0 2px var(--bg-sidebar)',
                                        display: 'block',
                                    }} />
                                )}
                            </span>
                            <span className="nav-text">Announcements</span>
                            {hasNewAnnouncements && (
                                <span style={{
                                    marginLeft: 'auto',
                                    background: '#10b981',
                                    color: '#fff',
                                    borderRadius: 20,
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    padding: '1px 7px',
                                    letterSpacing: '0.02em',
                                }}>NEW</span>
                            )}
                        </div>
                    </nav>

                    <div className="sidebar-section-label">Account</div>
                    <nav className="sidebar-nav">
                        <div
                            className={`sidebar-nav-item ${currentView === 'profile' ? 'active' : ''}`}
                            title="Profile"
                            onClick={() => { setCurrentView('profile'); closeMobileMenu(); }}
                        >
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg></span>
                            <span className="nav-text">Profile</span>
                        </div>
                        <div
                            className={`sidebar-nav-item ${currentView === 'settings' ? 'active' : ''}`}
                            title="Settings"
                            onClick={() => { setCurrentView('settings'); closeMobileMenu(); }}
                        >
                            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg></span>
                            <span className="nav-text">Settings</span>
                        </div>
                    </nav>
                </div>

                {/* Logout */}
                <div className="sidebar-bottom">
                    <button className="logout-btn" onClick={handleLogout} title="Sign Out">
                        <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg></span>
                        <span className="nav-text">Sign out</span>
                    </button>
                </div>
            </aside>

            {/* ══ MAIN ══ */}
            <div className="dashboard-main">
                {/* Topbar */}
                <div className="topbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button className="mobile-menu-toggle" onClick={toggleMobileMenu}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                        </button>
                        <div>
                            <div className="topbar-title">
                                {currentView === 'dashboard' && 'Time Tracking'}
                                {currentView === 'timesheets' && 'Timesheets'}
                                {currentView === 'journal' && 'Daily Journal'}
                                {currentView === 'performance' && 'Performance'}
                                {currentView === 'documents' && 'Documents'}
                                {currentView === 'school' && 'School Announcements'}
                                {currentView === 'profile' && 'Profile'}
                                {currentView === 'settings' && 'Settings'}
                            </div>
                            <div className="topbar-date">{dateStr}</div>
                        </div>
                    </div>
                    <div className="topbar-right">
                        <span className={`status-pill ${statusKey}`}>
                            <span className="status-dot" />
                            <span className="d-none-mobile">
                                {statusKey === 'working' ? 'Working' : statusKey === 'break' ? 'On Break' : 'Inactive'}
                            </span>
                        </span>
                    </div>
                </div>

                {/* Page content */}
                <div className="page-content">
                    {currentView === 'dashboard' ? (
                        <>
                            {/* ── Greeting Banner ── */}
                            <div className="greeting-banner">
                                <div className="greeting-banner-text">
                                    <div className="greeting-banner-sub">{greeting},</div>
                                    <div className="greeting-banner-name">{displayName}</div>
                                    <div className="greeting-banner-date">Here's your SIL program snapshot for today.</div>
                                </div>
                                <div className="greeting-banner-actions">
                                    <button className="greeting-banner-btn" onClick={() => setCurrentView('timesheets')}>
                                        View Timesheets
                                    </button>
                                    <button className="greeting-banner-btn" onClick={() => { setCurrentView('school'); markAnnouncementsSeen(); }}>
                                        Announcements
                                    </button>
                                </div>
                            </div>

                            <div className="timer-hero">
                                {/* Big timer */}
                                <div className="timer-main-card">
                                    <div className="timer-label">Elapsed Time</div>
                                    <div className={`timer-clock ${elapsed === 'On Break' ? 'on-break' : ''}`}>
                                        {elapsed}
                                    </div>
                                    <div className="timer-controls">
                                        {!session ? (
                                            <>
                                                <button
                                                    className={`btn btn-shift ${completedSessions.length === 0 ? 'suggested' : ''}`}
                                                    onClick={handleClockIn}
                                                    disabled={loading}
                                                    title="Clock in for morning shift"
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                                    Time In (Morning)
                                                </button>
                                                <button
                                                    className={`btn btn-shift ${completedSessions.length === 1 ? 'suggested' : ''}`}
                                                    onClick={handleClockIn}
                                                    disabled={loading}
                                                    title="Clock in for afternoon shift"
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                                    Time In (Afternoon)
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    className={`btn btn-secondary ${session.status === 'break' ? 'active' : ''}`}
                                                    onClick={handleBreak}
                                                    disabled={loading}
                                                >
                                                    {session.status === 'break'
                                                        ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg> Resume</>
                                                        : <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg> Break</>}
                                                </button>
                                                <button className="btn btn-danger" onClick={handleClockOut} disabled={loading}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
                                                    {clockOutLabel}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Side info */}
                                <div className="timer-side-card">
                                    <div className="side-card-title">Session Info</div>
                                    <div className="info-row">
                                        <div className="info-item">
                                            <span className="info-item-label">Clock In</span>
                                            <span className="info-item-value">{clockInTime}</span>
                                        </div>
                                        <div className="info-item">
                                            <span className="info-item-label">Hours Worked</span>
                                            <span className="info-item-value">{hoursWorkedStr}h</span>
                                        </div>
                                        <div className="info-item">
                                            <span className="info-item-label">Status</span>
                                            <span className={`status-pill ${statusKey}`} style={{ fontSize: '0.72rem' }}>
                                                <span className="status-dot" />
                                                {statusKey === 'working' ? 'Working' : statusKey === 'break' ? 'On Break' : 'Inactive'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Progress */}
                                    <div className="progress-wrap">
                                        <div className="progress-header">
                                            <span className="progress-title">Daily Goal (8h)</span>
                                            <span className="progress-pct">{progressPct}%</span>
                                        </div>
                                        <div className="progress-bar-bg">
                                            <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── Stats ── */}
                            <div className="stats-row">
                                <div className="stat-card">
                                    <span className="stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></span>
                                    <span className="stat-label">Hours Today</span>
                                    <span className="stat-value">{hoursWorkedStr}</span>
                                    <span className="stat-sub">of 8h target</span>
                                </div>
                                <div className="stat-card">
                                    <span className="stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg></span>
                                    <span className="stat-label">Progress</span>
                                    <span className="stat-value">{progressPct}%</span>
                                    <span className="stat-sub">daily goal</span>
                                </div>
                                <div className="stat-card">
                                    <span className="stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></span>
                                    <span className="stat-label">Clock In</span>
                                    <span className="stat-value" style={{ fontSize: '1.2rem', paddingTop: '0.3rem' }}>{clockInTime}</span>
                                    <span className="stat-sub">today's start</span>
                                </div>
                                <div className="stat-card">
                                    <span className="stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg></span>
                                    <span className="stat-label">Status</span>
                                    <span className="stat-value" style={{ fontSize: '1rem', paddingTop: '0.4rem' }}>
                                        {statusKey === 'working' ? 'Active' : statusKey === 'break' ? 'On Break' : 'Idle'}
                                    </span>
                                    <span className="stat-sub">current state</span>
                                </div>
                            </div>

                            {/* ── Activity ── */}
                            <div className="activity-card">
                                <div className="activity-header">
                                    <span className="activity-title">Today's Activity</span>
                                </div>
                                <div className="activity-list">
                                    {todaySessions.length === 0 && !session ? (
                                        <div className="activity-empty">
                                            <span className="activity-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2a2d3e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></span>
                                            <p>Your session history will appear here</p>
                                        </div>
                                    ) : (
                                        <div className="activity-items">
                                            {session && (
                                                <div className="activity-item active">
                                                    <div className="activity-item-info">
                                                        <span className="activity-item-time">{new Date(session.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – Now</span>
                                                        <span className="activity-item-status">Active Session</span>
                                                    </div>
                                                    <div className="activity-item-duration">{elapsed}</div>
                                                </div>
                                            )}
                                            {[...todaySessions].reverse().map((ts) => {
                                                if (ts.id === session?.id) return null;
                                                const start = new Date(ts.clock_in);
                                                const end = ts.clock_out ? new Date(ts.clock_out) : null;
                                                const diff = end ? Math.floor((end.getTime() - start.getTime()) / 1000) : 0;
                                                const h = Math.floor(diff / 3600);
                                                const m = Math.floor((diff % 3600) / 60);

                                                return (
                                                    <div key={ts.id} className="activity-item">
                                                        <div className="activity-item-info">
                                                            <span className="activity-item-time">
                                                                {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {end ? end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                                            </span>
                                                            <span className="activity-item-status">Completed</span>
                                                        </div>
                                                        <div className="activity-item-duration">{h}h {m}m</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : currentView === 'timesheets' ? (
                        <TimesheetView />
                    ) : currentView === 'journal' ? (
                        <JournalView />
                    ) : currentView === 'performance' ? (
                        <PerformanceView />
                    ) : currentView === 'documents' ? (
                        <DocumentsView />
                    ) : currentView === 'school' ? (
                        <AnnouncementsView viewType="school" />
                    ) : currentView === 'profile' ? (
                        <ProfileView />
                    ) : currentView === 'settings' ? (
                        <SettingsView />
                    ) : (
                        <div className="view-placeholder">
                            <div style={{ textAlign: 'center', color: '#64748b', padding: '4rem 0' }}>
                                <h3>View Not Found</h3>
                                <p style={{ marginTop: '0.5rem' }}>This page does not exist or has been moved.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StudentDashboard;
