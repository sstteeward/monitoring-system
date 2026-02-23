import React from 'react';
import './StudentDashboard.css'; // Reuse existing layout classes

const DashboardSkeleton: React.FC = () => {
    return (
        <div className="dashboard-container">
            {/* SIDEBAR SKELETON */}
            <aside className="sidebar" style={{ pointerEvents: 'none' }}>
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <div className="skeleton skeleton-circle" style={{ width: 32, height: 32 }} />
                        <div className="sidebar-logo-text-group">
                            <div className="skeleton skeleton-text" style={{ width: 80 }} />
                            <div className="skeleton skeleton-text" style={{ width: 120, height: 8 }} />
                        </div>
                    </div>
                </div>

                <div className="sidebar-user">
                    <div className="skeleton skeleton-circle" style={{ width: 36, height: 36, marginRight: 12 }} />
                    <div className="sidebar-user-info">
                        <div className="skeleton skeleton-text" style={{ width: 100 }} />
                        <div className="skeleton skeleton-text" style={{ width: 60, height: 8 }} />
                    </div>
                </div>

                <div className="sidebar-scrollable">
                    <div className="sidebar-section-label"><div className="skeleton skeleton-text" style={{ width: 70 }} /></div>
                    <nav className="sidebar-nav">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="sidebar-nav-item">
                                <span className="skeleton skeleton-circle" style={{ width: 18, height: 18, marginRight: 12 }} />
                                <span className="skeleton skeleton-text" style={{ width: 80 }} />
                            </div>
                        ))}
                    </nav>
                </div>
            </aside>

            {/* MAIN SKELETON */}
            <div className="dashboard-main">
                <div className="topbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div className="skeleton skeleton-circle" style={{ width: 24, height: 24 }} />
                        <div>
                            <div className="skeleton skeleton-text" style={{ width: 140, height: 18 }} />
                            <div className="skeleton skeleton-text" style={{ width: 100, height: 8 }} />
                        </div>
                    </div>
                    <div className="topbar-right">
                        <div className="skeleton" style={{ width: 80, height: 24, borderRadius: 20 }} />
                    </div>
                </div>

                <div className="page-content">
                    <div className="greeting-banner" style={{ background: 'var(--bg-elevated)', border: 'none' }}>
                        <div className="greeting-banner-text">
                            <div className="skeleton skeleton-text" style={{ width: 100 }} />
                            <div className="skeleton skeleton-title" style={{ width: 250, height: 32 }} />
                            <div className="skeleton skeleton-text" style={{ width: 300 }} />
                        </div>
                    </div>

                    <div className="stats-row" style={{ marginTop: '2rem' }}>
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="cd-stat-card" style={{ padding: '1.5rem' }}>
                                <div className="skeleton skeleton-circle" style={{ width: 40, height: 40, marginBottom: '1rem' }} />
                                <div className="skeleton skeleton-title" style={{ width: '40%' }} />
                                <div className="skeleton skeleton-text" style={{ width: '80%' }} />
                            </div>
                        ))}
                    </div>

                    <div className="cd-card" style={{ marginTop: '2rem', height: 400 }}>
                        <div className="cd-card-header">
                            <div className="skeleton skeleton-text" style={{ width: 150, height: 20 }} />
                        </div>
                        <div style={{ padding: '1.5rem' }}>
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                                    <div className="skeleton skeleton-circle" style={{ width: 40, height: 40 }} />
                                    <div style={{ flex: 1 }}>
                                        <div className="skeleton skeleton-text" style={{ width: '30%' }} />
                                        <div className="skeleton skeleton-text" style={{ width: '60%', height: 8 }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardSkeleton;
