import React, { useEffect, useState } from 'react';
import { adminService } from '../services/adminService';

// Inline SVG Icons (matching codebase pattern — no external icon library)
const SvgIcon = {
    refresh: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>,
    shield: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>,
    shieldLarge: <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>,
    alertTriangle: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
    mapPin: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>,
    monitor: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>,
    activity: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>,
    refreshLarge: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>,
};

interface SecurityAlertsViewProps {
    departmentId?: string; // If provided, limits alerts to this department (for Coordinators)
}

const SecurityAlertsView: React.FC<SecurityAlertsViewProps> = ({ departmentId }) => {
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAlerts = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await adminService.getSecurityAlerts(departmentId);
            setAlerts(data);
        } catch (err: any) {
            console.error(err);
            setError('Failed to load security alerts. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
    }, [departmentId]);

    const getFlagIcon = (reason: string) => {
        const lowerReason = (reason || '').toLowerCase();
        if (lowerReason.includes('emulator')) return <span style={{ color: '#ef4444' }}>{SvgIcon.monitor}</span>;
        if (lowerReason.includes('teleportation') || lowerReason.includes('speed')) return <span style={{ color: '#f59e0b' }}>{SvgIcon.activity}</span>;
        if (lowerReason.includes('location') || lowerReason.includes('geofence') || lowerReason.includes('distance')) return <span style={{ color: '#ef4444' }}>{SvgIcon.mapPin}</span>;
        return <span style={{ color: '#f59e0b' }}>{SvgIcon.shield}</span>;
    };

    return (
        <div className="cd-animate-fade-in fade-in-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 600, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                        Security Alerts
                    </h2>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                        Anti-Cheat system flags and unauthorized access attempts.
                    </p>
                </div>
                <button
                    onClick={fetchAlerts}
                    disabled={loading}
                    className="cd-btn cd-btn-secondary"
                    style={{
                        padding: '8px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <span className={loading ? 'cd-animate-spin' : ''} style={{ display: 'flex' }}>{SvgIcon.refresh}</span>
                    Refresh
                </button>
            </div>

            {error && (
                <div className="cd-error-msg" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {SvgIcon.alertTriangle}
                    {error}
                </div>
            )}

            <div className="cd-card">
                {loading && alerts.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <div className="cd-animate-spin" style={{ display: 'inline-flex', marginBottom: '12px' }}>{SvgIcon.refreshLarge}</div>
                        <p>Loading security logs...</p>
                    </div>
                ) : alerts.length === 0 ? (
                    <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'inline-flex', opacity: 0.2, marginBottom: '16px' }}>{SvgIcon.shieldLarge}</div>
                        <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-primary)' }}>No Security Alerts</h3>
                        <p style={{ margin: 0 }}>The anti-cheat system hasn't flagged any suspicious activity.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="cd-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: '16px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 500 }}>Timestamp</th>
                                    <th style={{ textAlign: 'left', padding: '16px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 500 }}>Student</th>
                                    <th style={{ textAlign: 'left', padding: '16px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 500 }}>Event</th>
                                    <th style={{ textAlign: 'left', padding: '16px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 500 }}>Reason / Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {alerts.map(log => {
                                    const date = new Date(log.created_at);
                                    const reason = log.details?.reason || 'Suspicious Activity Detected';
                                    const event = log.details?.event || 'Anti-Cheat Flag';
                                    
                                    return (
                                        <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s ease' }} className="cd-table-row-hover">
                                            <td style={{ padding: '16px', color: 'var(--text-primary)', verticalAlign: 'top' }}>
                                                <div style={{ fontWeight: 500 }}>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                                            </td>
                                            <td style={{ padding: '16px', color: 'var(--text-primary)', verticalAlign: 'top' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div className="admin-user-avatar" style={{ width: 32, height: 32, flexShrink: 0 }}>
                                                        {log.profiles?.first_name?.[0]}{log.profiles?.last_name?.[0]}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 500 }}>{log.profiles?.first_name} {log.profiles?.last_name}</div>
                                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{log.profiles?.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px', verticalAlign: 'top' }}>
                                                <span 
                                                    style={{ 
                                                        display: 'inline-flex', 
                                                        alignItems: 'center', 
                                                        gap: '6px',
                                                        padding: '4px 10px', 
                                                        borderRadius: '20px', 
                                                        fontSize: '0.8rem', 
                                                        fontWeight: 500,
                                                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                                        color: '#ef4444'
                                                    }}
                                                >
                                                    {getFlagIcon(reason)}
                                                    {event}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem', verticalAlign: 'top', maxWidth: '300px' }}>
                                                <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>{reason}</div>
                                                
                                                {/* Additional Details specifically for anomalies */}
                                                {log.details?.speed && (
                                                    <div style={{ display: 'inline-block', background: 'var(--bg-panel)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', marginTop: '4px' }}>
                                                        Speed: {Math.round(log.details.speed)} m/s
                                                    </div>
                                                )}
                                                {log.details?.distFromLastOut && (
                                                    <div style={{ display: 'inline-block', background: 'var(--bg-panel)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', marginTop: '4px', marginLeft: '8px' }}>
                                                        Dist: {Math.round(log.details.distFromLastOut)} m
                                                    </div>
                                                )}
                                                {log.details?.distance && (
                                                    <div style={{ display: 'inline-block', background: 'var(--bg-panel)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', marginTop: '4px' }}>
                                                        Off-Site Dist: {Math.round(log.details.distance)} m
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SecurityAlertsView;
