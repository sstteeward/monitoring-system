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
                    <div className="sidebar-logo-icon">⏱</div>
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
                        <span className="nav-icon">🏠</span> Dashboard
                    </div>
                    <div className="sidebar-nav-item">
                        <span className="nav-icon">📋</span> Timesheets
                    </div>
                    <div className="sidebar-nav-item">
                        <span className="nav-icon">📊</span> Reports
                    </div>
                </nav>

                <div className="sidebar-section-label">Account</div>
                <nav className="sidebar-nav">
                    <div className="sidebar-nav-item">
                        <span className="nav-icon">👤</span> Profile
                    </div>
                    <div className="sidebar-nav-item">
                        <span className="nav-icon">⚙️</span> Settings
                    </div>
                </nav>

                {/* Logout */}
                <div className="sidebar-bottom">
                    <button className="logout-btn" onClick={handleLogout}>
                        <span className="nav-icon">🚪</span> Sign out
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
                                        ▶ Clock In
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            className={`btn btn-secondary ${session.status === 'break' ? 'active' : ''}`}
                                            onClick={handleBreak}
                                            disabled={loading}
                                        >
                                            {session.status === 'break' ? '▶ Resume' : '⏸ Break'}
                                        </button>
                                        <button className="btn btn-danger" onClick={handleClockOut} disabled={loading}>
                                            ⏹ Clock Out
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
                            <span className="stat-icon">⏱</span>
                            <span className="stat-label">Hours Today</span>
                            <span className="stat-value">{hoursWorked}</span>
                            <span className="stat-sub">of 8h target</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-icon">📈</span>
                            <span className="stat-label">Progress</span>
                            <span className="stat-value">{progressPct}%</span>
                            <span className="stat-sub">daily goal</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-icon">🕐</span>
                            <span className="stat-label">Clock In</span>
                            <span className="stat-value" style={{ fontSize: '1.2rem', paddingTop: '0.3rem' }}>{clockInTime}</span>
                            <span className="stat-sub">today's start</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-icon">🟢</span>
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
                            <span className="activity-empty-icon">📋</span>
                            <p>Your session history will appear here</p>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default Dashboard;
