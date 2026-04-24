import React, { useEffect, useState } from 'react';
import { timeTrackingService, type Timesheet } from '../services/timeTracking';
import { TableSkeleton, CardGridSkeleton } from './Skeletons';
import { DTRCard } from './DTRCard';
import { profileService } from '../services/profileService';
import { supabase } from '../lib/supabaseClient';
import './TimesheetView.css';

const TimesheetView: React.FC = () => {
    const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
    const [loading, setLoading] = useState(true);
    const [showDTR, setShowDTR] = useState(false);
    const [requiredHours, setRequiredHours] = useState<number>(0);
    const [userId, setUserId] = useState<string | undefined>(undefined);

    useEffect(() => {
        loadTimesheets();
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) setUserId(user.id);
        });
    }, []);

    const loadTimesheets = async () => {
        try {
            setLoading(true);
            const [data, profile] = await Promise.all([
                timeTrackingService.getTimesheets(),
                profileService.getCurrentProfile()
            ]);
            setTimesheets(data);
            if (profile?.required_ojt_hours) {
                setRequiredHours(profile.required_ojt_hours);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatTime = (timeStr: string | null) => {
        if (!timeStr) return '—';
        return new Date(timeStr).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };



    const formatDateDetailed = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const getSessionDuration = (ts: Timesheet) => {
        if (!ts.clock_out) return 0;
        let diff = Math.floor((new Date(ts.clock_out).getTime() - new Date(ts.clock_in).getTime()) / 1000);
        
        // Subtract break duration if it exists
        if (ts.break_start && ts.break_end) {
            const breakTime = Math.floor((new Date(ts.break_end).getTime() - new Date(ts.break_start).getTime()) / 1000);
            diff = Math.max(0, diff - breakTime);
        }
        return diff;
    };

    const formatDuration = (seconds: number) => {
        if (seconds === 0) return '—';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h === 0) return `${m}m`;
        return `${h}h ${m}m`;
    };

    // Summary Stats
    const totalSecondsAll = timesheets.reduce((acc, ts) => acc + getSessionDuration(ts), 0);

    const activeDays = new Set(timesheets.map(ts => new Date(ts.clock_in).toLocaleDateString())).size;
    const avgHoursPerDay = activeDays > 0 ? (totalSecondsAll / 3600 / activeDays).toFixed(1) : '0';
    const totalHours = (totalSecondsAll / 3600).toFixed(1);

    return (
        <div className="timesheet-view">
            <div className="timesheet-header">
                <div className="header-text">
                    <h2>Timesheet History</h2>
                    <p className="header-subtitle">Chronological log of all work sessions</p>
                </div>
                <div style={{display: 'flex', gap: '10px'}}>
                    <button className="refresh-btn" onClick={() => setShowDTR(true)} style={{backgroundColor: 'var(--primary-color)', color: 'white', border: 'none'}}>
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        DTR
                    </button>
                    <button className="refresh-btn" onClick={loadTimesheets} disabled={loading}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                        Refresh
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ padding: '0 2rem' }}>
                    <CardGridSkeleton cards={4} height={100} />
                </div>
            ) : timesheets.length > 0 && (
                <div className="timesheet-stats-row">
                    <div className="ts-stat-card glass-card">
                        <span className="ts-stat-label">Total Time</span>
                        <span className="ts-stat-value">{totalHours}h</span>
                        <span className="ts-stat-sub">Lifetime worked</span>
                    </div>
                    <div className="ts-stat-card glass-card">
                        <span className="ts-stat-label">Active Days</span>
                        <span className="ts-stat-value">{activeDays}</span>
                        <span className="ts-stat-sub">Logging sessions</span>
                    </div>
                    <div className="ts-stat-card glass-card">
                        <span className="ts-stat-label">Avg/Day</span>
                        <span className="ts-stat-value">{avgHoursPerDay}h</span>
                        <span className="ts-stat-sub">Daily average</span>
                    </div>
                    <div className="ts-stat-card glass-card">
                        <span className="ts-stat-label">Sessions</span>
                        <span className="ts-stat-value">{timesheets.length}</span>
                        <span className="ts-stat-sub">Total records</span>
                    </div>
                </div>
            )}

            <div className="timesheet-card glass-card">
                {loading ? (
                    <TableSkeleton rows={8} cols={5} />
                ) : timesheets.length === 0 ? (
                    <div className="timesheet-empty">
                        <span className="timesheet-empty-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        </span>
                        <p>No records yet. Time to clock in!</p>
                    </div>
                ) : (
                    <div className="timesheet-table-container">
                        <table className="timesheet-table flat-list">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Clock In</th>
                                    <th>Clock Out</th>
                                    <th>Duration</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {timesheets.map((ts, idx) => {
                                    const currentDate = formatDate(ts.clock_in);
                                    const prevDate = idx > 0 ? formatDate(timesheets[idx - 1].clock_in) : null;
                                    const showDate = currentDate !== prevDate;

                                    return (
                                        <tr key={ts.id} className={showDate ? 'new-day-row' : ''}>
                                            <td className="date-cell">
                                                {showDate && (
                                                    <div className="date-group-header">
                                                        <span className="date-main">{currentDate}</span>
                                                        <span className="date-detail">{formatDateDetailed(ts.clock_in)}</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="time-cell">{formatTime(ts.clock_in)}</td>
                                            <td className="time-cell">{formatTime(ts.clock_out)}</td>
                                            <td className="duration-cell">{formatDuration(getSessionDuration(ts))}</td>
                                            <td className="status-cell">
                                                <span className={`status-pill ${ts.status}`}>
                                                    <span className="status-dot" />
                                                    {ts.status === 'working' ? 'Active' : ts.status === 'break' ? 'On Break' : 'Completed'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showDTR && (
                <div className="modal-overlay" onClick={() => setShowDTR(false)} style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                    backgroundColor: 'rgba(0,0,0,0.4)', 
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    zIndex: 9999,
                    display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '0',
                    overflow: 'auto',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    <div style={{position: 'relative', minWidth: '100%', width: 'fit-content'}} onClick={e => e.stopPropagation()}>
                        <button className="glass-card" onClick={() => setShowDTR(false)} style={{
                            position: 'fixed', top: '16px', right: '16px', zIndex: 10000,
                            width: '40px', height: '40px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', 
                            borderRadius: '12px', cursor: 'pointer', fontSize: '24px', color: 'var(--text-primary)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            transition: 'all 0.3s ease'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--primary)';
                            e.currentTarget.style.color = 'var(--primary)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-strong)';
                            e.currentTarget.style.color = 'var(--text-primary)';
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                        >&times;</button>
                        <DTRCard requiredHours={requiredHours} userId={userId} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default TimesheetView;
