import React, { useEffect, useState } from 'react';
import { timeTrackingService, type Timesheet } from '../services/timeTracking';
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

    const calculateDuration = (clockIn: string, clockOut: string | null) => {
        if (!clockOut) return 'In Progress';
        const start = new Date(clockIn).getTime();
        const end = new Date(clockOut).getTime();
        const diffInSeconds = Math.floor((end - start) / 1000);

        const h = Math.floor(diffInSeconds / 3600);
        const m = Math.floor((diffInSeconds % 3600) / 60);
        return `${h}h ${m}m`;
    };

    return (
        <div className="timesheet-view">
            <div className="timesheet-header">
                <h2>Timesheet History</h2>
                <button className="btn btn-secondary" onClick={loadTimesheets} disabled={loading}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                    Refresh
                </button>
            </div>

            <div className="timesheet-card">
                {loading ? (
                    <div className="timesheet-loading">Loading timesheets...</div>
                ) : timesheets.length === 0 ? (
                    <div className="timesheet-empty">
                        <span className="timesheet-empty-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2a2d3e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        </span>
                        <p>No timesheet records found.</p>
                    </div>
                ) : (
                    <div className="timesheet-table-container">
                        <table className="timesheet-table">
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
                                {timesheets.map((ts) => (
                                    <tr key={ts.id}>
                                        <td>{formatDate(ts.clock_in)}</td>
                                        <td>{formatTime(ts.clock_in)}</td>
                                        <td>{formatTime(ts.clock_out)}</td>
                                        <td>{calculateDuration(ts.clock_in, ts.clock_out)}</td>
                                        <td>
                                            <span className={`status-pill ${ts.status}`} style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}>
                                                <span className="status-dot" />
                                                {ts.status === 'working' ? 'Working' : ts.status === 'break' ? 'On Break' : 'Completed'}
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
