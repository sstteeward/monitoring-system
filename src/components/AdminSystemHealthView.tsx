import React, { useState, useEffect } from 'react';
import { adminService } from '../services/adminService';
import { CardGridSkeleton } from './Skeletons';

const AdminSystemHealthView: React.FC = () => {
    const [health, setHealth] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchHealth();
        const intId = setInterval(fetchHealth, 30000); // refresh every 30s
        return () => clearInterval(intId);
    }, []);

    const fetchHealth = async () => {
        try {
            const data = await adminService.getSystemHealth();
            setHealth(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (loading && !health) {
        return (
            <div className="fade-in">
                <div className="admin-table-card">
                    <div className="admin-table-header" style={{ borderBottom: '1px solid var(--admin-border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                        <div>
                            <div className="admin-table-title">System Health Monitoring</div>
                            <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>Real-time metrics on database performance and active system usage.</div>
                        </div>
                    </div>
                    <div style={{ padding: '0 1.5rem 1.5rem' }}>
                        <CardGridSkeleton cards={3} height={180} />
                    </div>
                </div>
            </div>
        );
    }

    const isHealthy = health?.status === 'healthy';

    return (
        <div className="fade-in">
            <div className="admin-table-card">
                <div className="admin-table-header" style={{ borderBottom: '1px solid var(--admin-border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div className="admin-table-title">System Health Monitoring</div>
                            <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Real-time metrics on database performance and active system usage.</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: isHealthy ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', padding: '0.5rem 1rem', borderRadius: 20 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: isHealthy ? '#10b981' : '#f59e0b', boxShadow: `0 0 8px ${isHealthy ? '#10b981' : '#f59e0b'}` }} />
                            <span style={{ color: isHealthy ? '#10b981' : '#f59e0b', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>
                                {isHealthy ? 'System Operational' : 'Degraded Performance'}
                            </span>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', padding: '0 1.5rem 1.5rem' }}>

                    {/* Latency Card */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: 12, border: '1px solid var(--admin-border)' }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                            API Latency
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f8fafc' }}>
                            {health?.latencyMs} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 500 }}>ms</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: health?.latencyMs < 300 ? '#10b981' : '#f59e0b', marginTop: '0.5rem' }}>
                            {health?.latencyMs < 300 ? 'Excellent response time' : 'Slightly delayed'}
                        </div>
                    </div>

                    {/* Active Users */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: 12, border: '1px solid var(--admin-border)' }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                            Active Users (Today)
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f8fafc' }}>
                            {health?.activeUsersToday}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                            Unique logins & clock-ins today
                        </div>
                    </div>

                    {/* Data Volume */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: 12, border: '1px solid var(--admin-border)' }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
                            Database Volume
                        </div>
                        <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f8fafc' }}>
                            {health?.dbRows.toLocaleString()} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 500 }}>rows</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                            Across primary telemetry tables
                        </div>
                    </div>
                </div>

                <div style={{ padding: '0 1.5rem 1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Last updated: {health ? new Date(health.lastChecked).toLocaleTimeString() : '...'} (Auto-refreshes every 30s)
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminSystemHealthView;
