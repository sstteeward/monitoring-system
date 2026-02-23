import React, { useEffect, useState } from 'react';
import { timeTrackingService, type Timesheet } from '../services/timeTracking';
import { profileService, type Profile } from '../services/profileService';
import { CardGridSkeleton, TableSkeleton } from './Skeletons';
import './PerformanceView.css';

interface DailyRecord {
    date: string;
    sessions: Timesheet[];
    totalSeconds: number;
    firstIn: string | null;
    lastOut: string | null;
}

const PerformanceView: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
    const [profile, setProfile] = useState<Profile | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [data, userProfile] = await Promise.all([
                timeTrackingService.getTimesheets(),
                profileService.getCurrentProfile()
            ]);
            setTimesheets(data);
            setProfile(userProfile);
        } catch (error) {
            console.error('Failed to load performance data:', error);
        } finally {
            setLoading(false);
        }
    };

    // External Data / Target state from Profile
    const SIL_REQUIRED_HOURS = profile?.required_ojt_hours ?? 500;
    const CURRENT_GRADE = profile?.grade ?? "—";
    const ABSENCES = profile?.absences ?? 0;

    // Calculate dynamic stats
    const calculateTotalSecondsWorked = () => {
        return timesheets.reduce((acc, ts) => {
            if (!ts.clock_out) return acc; // ignore active session from total for now or calculate up to Date.now()
            const start = new Date(ts.clock_in).getTime();
            const end = new Date(ts.clock_out).getTime();
            const diff = Math.floor((end - start) / 1000);
            return acc + diff;
        }, 0);
    };

    const totalSecs = calculateTotalSecondsWorked();
    const completedHours = (totalSecs / 3600).toFixed(1);
    const completedDays = (totalSecs / (8 * 3600)).toFixed(1); // Assuming 8-hour workday

    const remainingHours = Math.max(0, SIL_REQUIRED_HOURS - parseFloat(completedHours)).toFixed(1);
    const remainingDays = (parseFloat(remainingHours) / 8).toFixed(1);

    const progressPct = Math.min((parseFloat(completedHours) / SIL_REQUIRED_HOURS) * 100, 100).toFixed(1);

    // Group logs by date for the DTR
    const groupedDtr = timesheets.reduce((acc: Record<string, DailyRecord>, ts) => {
        const dateStr = new Date(ts.clock_in).toLocaleDateString('en-US');
        if (!acc[dateStr]) {
            acc[dateStr] = {
                date: dateStr,
                sessions: [],
                totalSeconds: 0,
                firstIn: ts.clock_in,
                lastOut: ts.clock_out
            };
        }

        acc[dateStr].sessions.push(ts);

        // Update total time for the day
        if (ts.clock_out) {
            const start = new Date(ts.clock_in).getTime();
            const end = new Date(ts.clock_out).getTime();
            acc[dateStr].totalSeconds += Math.floor((end - start) / 1000);
        }

        // Update bounds
        if (new Date(ts.clock_in).getTime() < new Date(acc[dateStr].firstIn!).getTime()) {
            acc[dateStr].firstIn = ts.clock_in;
        }
        if (ts.clock_out) {
            if (!acc[dateStr].lastOut || new Date(ts.clock_out).getTime() > new Date(acc[dateStr].lastOut!).getTime()) {
                acc[dateStr].lastOut = ts.clock_out;
            }
        }

        return acc;
    }, {});

    // Sort descending by date
    const dtrList = Object.values(groupedDtr).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const formatTime = (isoString: string | null) => {
        if (!isoString) return '—';
        return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDuration = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        return `${h}h ${m}m`;
    };

    return (
        <div className="performance-view">
            <div className="performance-header">
                <h2>SIL Performance Report</h2>
                <button className="btn btn-secondary" onClick={loadData} disabled={loading}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                    Refresh
                </button>
            </div>

            {/* KPI Cards */}
            {loading ? (
                <div style={{ marginBottom: '2rem' }}>
                    <CardGridSkeleton cards={4} height={120} />
                </div>
            ) : (
                <div className="performance-kpi-grid">
                    <div className="kpi-card kpi-primary">
                        <div className="kpi-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        </div>
                        <div className="kpi-content">
                            <div className="kpi-label">Time Completed</div>
                            <div className="kpi-value">{completedHours} / {SIL_REQUIRED_HOURS} <span className="kpi-unit">hrs</span></div>
                            <div className="kpi-subtext">~{completedDays} working days</div>

                            <div className="kpi-progress-bar-bg">
                                <div className="kpi-progress-bar-fill" style={{ width: `${progressPct}%` }}></div>
                            </div>
                        </div>
                    </div>

                    <div className="kpi-card kpi-warning">
                        <div className="kpi-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        </div>
                        <div className="kpi-content">
                            <div className="kpi-label">Remaining Required</div>
                            <div className="kpi-value">{remainingHours} <span className="kpi-unit">hrs</span></div>
                            <div className="kpi-subtext">~{remainingDays} working days left</div>
                        </div>
                    </div>

                    <div className="kpi-card kpi-success">
                        <div className="kpi-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                        </div>
                        <div className="kpi-content">
                            <div className="kpi-label">Current Grade</div>
                            <div className="kpi-value">{CURRENT_GRADE}</div>
                            <div className="kpi-subtext">Academic standing</div>
                        </div>
                    </div>

                    <div className="kpi-card kpi-danger">
                        <div className="kpi-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                        </div>
                        <div className="kpi-content">
                            <div className="kpi-label">Total Absences</div>
                            <div className="kpi-value">{ABSENCES}</div>
                            <div className="kpi-subtext">Recorded absent days</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Daily Time Record Section */}
            <div className="performance-section">
                <div className="section-header">
                    <h3>Daily Time Record (DTR)</h3>
                    <p className="section-subtitle">Aggregated log of your daily attendance and completed work hours.</p>
                </div>

                <div className="performance-card">
                    {loading ? (
                        <TableSkeleton rows={5} cols={5} />
                    ) : dtrList.length === 0 ? (
                        <div className="performance-empty">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2a2d3e" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                            <p>No attendance records logged yet.</p>
                        </div>
                    ) : (
                        <div className="dtr-table-wrap">
                            <table className="dtr-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Earliest Log In</th>
                                        <th>Latest Log Out</th>
                                        <th>Total Computed Hours</th>
                                        <th>Recorded Sessions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dtrList.map((day) => (
                                        <tr key={day.date}>
                                            <td className="fw-500">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                                            <td>{formatTime(day.firstIn)}</td>
                                            <td>{formatTime(day.lastOut)}</td>
                                            <td className="highlight-cell">{formatDuration(day.totalSeconds)}</td>
                                            <td>{day.sessions.length}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default PerformanceView;
