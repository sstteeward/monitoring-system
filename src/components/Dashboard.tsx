import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { timeTrackingService, type Timesheet } from '../services/timeTracking';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    const [user, setUser] = useState<any>(null);
    const [session, setSession] = useState<Timesheet | null>(null);
    const [loading, setLoading] = useState(true);
    const [elapsed, setElapsed] = useState<string>('00:00:00');
    const [elapsedSecs, setElapsedSecs] = useState(0);
    const timerRef = useRef<number | null>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user));
        loadSession();
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    const loadSession = async () => {
        try {
            const current = await timeTrackingService.getCurrentSession();
            setSession(current);
        } catch (err) {
            console.error('Error loading session:', err);
        } finally {
            setLoading(false);
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
        try { setLoading(true); setSession(await timeTrackingService.clockIn()); }
        catch (e) { alert('Error clocking in: ' + (e as Error).message); }
        finally { setLoading(false); }
    };

    const handleClockOut = async () => {
        if (!session) return;
        try { setLoading(true); await timeTrackingService.clockOut(session.id); setSession(null); }
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
        } catch (e) { alert('Error: ' + (e as Error).message); }
        finally { setLoading(false); }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.reload();
    };

    const MAX_SECS = 8 * 3600;
    const progress = Math.min(elapsedSecs / MAX_SECS, 1);
    const progressPct = Math.round(progress * 100);
    const hoursWorked = (elapsedSecs / 3600).toFixed(1);
    const statusKey = session?.status ?? 'inactive';

    const clockInTime = session?.clock_in
        ? new Date(session.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '—';

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Avatar initials from email
    const initials = user?.email ? user.email[0].toUpperCase() : '?';

    if (loading && !user) return <div className="dashboard-loading">Loading…</div>;

    return (
        <div className="dashboard-container">
            {/* ══ SIDEBAR ══ */}
            <aside className="sidebar">
                {/* Logo */}
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    </div>
                    <div>
                        <div className="sidebar-logo-text">SIL Monitor</div>
                        <div className="sidebar-logo-sub">Asian College Dumaguete</div>
                    </div>
                </div>

                {/* User */}
                <div className="sidebar-user">
                    <div className="sidebar-avatar">{initials}</div>
                    <div className="sidebar-user-info">
                        <div className="sidebar-user-name">{user?.email?.split('@')[0] ?? 'User'}</div>
                        <div className="sidebar-user-role" style={{ textTransform: 'capitalize' }}>
                            Student
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <div className="sidebar-section-label">Workspace</div>
                <nav className="sidebar-nav">
                    <div className="sidebar-nav-item active">
                        <span className="nav-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg></span> Dashboard
                    </div>
                    <div className="sidebar-nav-item">
                        <span className="nav-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></span> Timesheets
                    </div>
                    <div className="sidebar-nav-item">
                        <span className="nav-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg></span> Reports
                    </div>
                </nav>

                <div className="sidebar-section-label">Account</div>
                <nav className="sidebar-nav">
                    <div className="sidebar-nav-item">
                        <span className="nav-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg></span> Profile
                    </div>
                    <div className="sidebar-nav-item">
                        <span className="nav-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg></span> Settings
                    </div>
                </nav>

                {/* Logout */}
                <div className="sidebar-bottom">
                    <button className="logout-btn" onClick={handleLogout}>
                        <span className="nav-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg></span> Sign out
                    </button>
                </div>
            </aside>

            {/* ══ MAIN ══ */}
            <div className="dashboard-main">
                {/* Topbar */}
                <div className="topbar">
                    <div>
                        <div className="topbar-title">Time Tracking</div>
                        <div className="topbar-date">{dateStr}</div>
                    </div>
                    <div className="topbar-right">
                        <span className={`status-pill ${statusKey}`}>
                            <span className="status-dot" />
                            {statusKey === 'working' ? 'Working' : statusKey === 'break' ? 'On Break' : 'Inactive'}
                        </span>
                    </div>
                </div>

                {/* Page content */}
                <div className="page-content">

                    {/* ── Hero Timer ── */}
                    <div className="timer-hero">
                        {/* Big timer */}
                        <div className="timer-main-card">
                            <div className="timer-label">Elapsed Time</div>
                            <div className={`timer-clock ${elapsed === 'On Break' ? 'on-break' : ''}`}>
                                {elapsed}
                            </div>
                            <div className="timer-controls">
                                {!session ? (
                                    <button className="btn btn-primary" onClick={handleClockIn} disabled={loading}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                                        Clock In
                                    </button>
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
                                            Clock Out
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
                                    <span className="info-item-value">{hoursWorked}h</span>
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
                            <span className="stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></span>
                            <span className="stat-label">Hours Today</span>
                            <span className="stat-value">{hoursWorked}</span>
                            <span className="stat-sub">of 8h target</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg></span>
                            <span className="stat-label">Progress</span>
                            <span className="stat-value">{progressPct}%</span>
                            <span className="stat-sub">daily goal</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></span>
                            <span className="stat-label">Clock In</span>
                            <span className="stat-value" style={{ fontSize: '1.2rem', paddingTop: '0.3rem' }}>{clockInTime}</span>
                            <span className="stat-sub">today's start</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg></span>
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
                            <span className="activity-title">Recent Activity</span>
                        </div>
                        <div className="activity-empty">
                            <span className="activity-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2a2d3e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg></span>
                            <p>Your session history will appear here</p>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default Dashboard;
