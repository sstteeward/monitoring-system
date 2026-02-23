import React, { useEffect, useState } from 'react';
import { timeTrackingService, type Timesheet } from '../services/timeTracking';
import { TableSkeleton, CardGridSkeleton } from './Skeletons';
import './TimesheetView.css';

const TimesheetView: React.FC = () => {
    const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadTimesheets();
    }, []);

    const loadTimesheets = async () => {
        try {
            setLoading(true);
            const data = await timeTrackingService.getTimesheets();
            setTimesheets(data);
        } catch (error) {
            console.error('Failed to load timesheets:', error);
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



    interface DailyLog {
        date: string;
        morningIn: string | null;
        morningOut: string | null;
        afternoonIn: string | null;
        afternoonOut: string | null;
        totalSeconds: number;
        status: string;
    }

    const groupSessionsByDay = (): DailyLog[] => {
        // Sort sessions by date and time (descending by date, ascending by time within a date)
        const sorted = [...timesheets].sort((a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime());
        const days: { [key: string]: DailyLog } = {};

        sorted.forEach(ts => {
            const dateStr = formatDate(ts.clock_in);
            if (!days[dateStr]) {
                days[dateStr] = {
                    date: dateStr,
                    morningIn: null,
                    morningOut: null,
                    afternoonIn: null,
                    afternoonOut: null,
                    totalSeconds: 0,
                    status: 'completed'
                };
            }

            const dailySessions = sorted
                .filter(s => formatDate(s.clock_in) === dateStr);

            const sessionIndex = dailySessions.findIndex(s => s.id === ts.id);

            if (sessionIndex === 0) {
                days[dateStr].morningIn = ts.clock_in;
                days[dateStr].morningOut = ts.clock_out;
            } else if (sessionIndex === 1) {
                days[dateStr].afternoonIn = ts.clock_in;
                days[dateStr].afternoonOut = ts.clock_out;
            }

            if (ts.clock_out) {
                days[dateStr].totalSeconds += Math.floor((new Date(ts.clock_out).getTime() - new Date(ts.clock_in).getTime()) / 1000);
            }
            if (ts.status === 'working' || ts.status === 'break') {
                days[dateStr].status = ts.status;
            }
        });

        // Convert back to array and sort by date descending
        return Object.values(days).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    };

    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    };

    const dailyLogs = groupSessionsByDay();

    // Summary Stats
    const totalSecondsAll = timesheets.reduce((acc, ts) => {
        if (!ts.clock_out) return acc;
        return acc + Math.floor((new Date(ts.clock_out).getTime() - new Date(ts.clock_in).getTime()) / 1000);
    }, 0);

    const activeDays = new Set(timesheets.map(ts => new Date(ts.clock_in).toLocaleDateString())).size;
    const avgHoursPerDay = activeDays > 0 ? (totalSecondsAll / 3600 / activeDays).toFixed(1) : '0';
    const totalHours = (totalSecondsAll / 3600).toFixed(1);

    return (
        <div className="timesheet-view">
            <div className="timesheet-header">
                <div className="header-text">
                    <h2>Timesheet History</h2>
                    <p className="header-subtitle">Daily log of your work sessions</p>
                </div>
                <button className="refresh-btn" onClick={loadTimesheets} disabled={loading}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                    Refresh
                </button>
            </div>

            {loading ? (
                <div style={{ padding: '0 2rem' }}>
                    <CardGridSkeleton cards={4} height={100} />
                </div>
            ) : timesheets.length > 0 && (
                <div className="timesheet-stats-row">
                    <div className="ts-stat-card">
                        <span className="ts-stat-label">Total Time</span>
                        <span className="ts-stat-value">{totalHours}h</span>
                        <span className="ts-stat-sub">Lifetime worked</span>
                    </div>
                    <div className="ts-stat-card">
                        <span className="ts-stat-label">Active Days</span>
                        <span className="ts-stat-value">{activeDays}</span>
                        <span className="ts-stat-sub">Logging sessions</span>
                    </div>
                    <div className="ts-stat-card">
                        <span className="ts-stat-label">Avg/Day</span>
                        <span className="ts-stat-value">{avgHoursPerDay}h</span>
                        <span className="ts-stat-sub">Daily average</span>
                    </div>
                    <div className="ts-stat-card">
                        <span className="ts-stat-label">Sessions</span>
                        <span className="ts-stat-value">{timesheets.length}</span>
                        <span className="ts-stat-sub">Total records</span>
                    </div>
                </div>
            )}

            <div className="timesheet-card">
                {loading ? (
                    <TableSkeleton rows={8} cols={7} />
                ) : dailyLogs.length === 0 ? (
                    <div className="timesheet-empty">
                        <span className="timesheet-empty-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        </span>
                        <p>No records yet. Time to clock in!</p>
                    </div>
                ) : (
                    <div className="timesheet-table-container">
                        <table className="timesheet-table">
                            <thead>
                                <tr>
                                    <th rowSpan={2}>Date</th>
                                    <th colSpan={2} className="shift-header">Morning Shift</th>
                                    <th colSpan={2} className="shift-header">Afternoon Shift</th>
                                    <th rowSpan={2}>Daily Total</th>
                                    <th rowSpan={2}>Status</th>
                                </tr>
                                <tr className="sub-header">
                                    <th>In</th>
                                    <th>Out</th>
                                    <th>In</th>
                                    <th>Out</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dailyLogs.map((log) => (
                                    <tr key={log.date}>
                                        <td className="date-cell">{log.date}</td>
                                        <td className="time-cell">{formatTime(log.morningIn)}</td>
                                        <td className="time-cell">{formatTime(log.morningOut)}</td>
                                        <td className="time-cell">{formatTime(log.afternoonIn)}</td>
                                        <td className="time-cell">{formatTime(log.afternoonOut)}</td>
                                        <td className="duration-cell">{formatDuration(log.totalSeconds)}</td>
                                        <td className="status-cell">
                                            <span className={`status-pill ${log.status}`}>
                                                <span className="status-dot" />
                                                {log.status === 'working' ? 'Working' : log.status === 'break' ? 'On Break' : 'Completed'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TimesheetView;
