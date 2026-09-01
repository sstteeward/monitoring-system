import React from 'react';
import type { Section } from '../services/adviserService';
import './CoordinatorDashboard.css';
import './AdviserDashboard.css';

interface AdviserOverviewViewProps {
    greeting: string;
    displayName: string;
    adviserType: string;
    course: string;
    stats: any;
    navigateTo: (view: any, param?: any) => void;
}

const AdviserOverviewView: React.FC<AdviserOverviewViewProps> = ({
    greeting,
    displayName,
    adviserType,
    course,
    stats,
    navigateTo
}) => {
    const isDHT = course === 'DHT' || adviserType === 'HT Adviser';

    const kpiStats = [
        {
            label: 'My Sections',
            value: stats?.mySectionsCount || 0,
            sub: 'Assigned by Coordinator',
            color: '#0d9488',
            glow: 'rgba(13, 148, 136, 0.15)',
            icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 17 12 22 22 17" />
                    <polyline points="2 12 12 17 22 12" />
                </svg>
            ),
            action: () => navigateTo('sections'),
        },
        {
            label: 'My Students',
            value: stats?.myStudentsCount || 0,
            sub: 'Across assigned sections',
            color: '#10b981',
            glow: 'rgba(16, 185, 129, 0.15)',
            icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
            ),
            action: () => navigateTo('students'),
        },
        {
            label: 'Pending Approvals',
            value: stats?.pendingApprovalsCount || 0,
            sub: (stats?.pendingApprovalsCount || 0) === 0 ? 'All caught up' : 'Awaiting review',
            color: (stats?.pendingApprovalsCount || 0) > 0 ? '#f59e0b' : '#10b981',
            glow: (stats?.pendingApprovalsCount || 0) > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={(stats?.pendingApprovalsCount || 0) > 0 ? '#f59e0b' : '#10b981'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="m9 15 2 2 4-4" />
                </svg>
            ),
            action: () => navigateTo('approvals', 'students'),
        },
        {
            label: 'On SIL / OJT',
            value: stats?.studentsOnOjtCount || 0,
            sub: `${stats?.studentsNotDeployedCount || 0} not yet deployed`,
            color: '#059669',
            glow: 'rgba(5, 150, 105, 0.15)',
            icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
            ),
            action: () => navigateTo('students', 'assigned'),
        },
        {
            label: 'Students at Risk',
            value: stats?.studentsAtRiskCount || 0,
            sub: (stats?.studentsAtRiskCount || 0) === 0 ? 'No absences flagged' : 'Requires attention',
            color: (stats?.studentsAtRiskCount || 0) > 0 ? '#ef4444' : '#10b981',
            glow: (stats?.studentsAtRiskCount || 0) > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={(stats?.studentsAtRiskCount || 0) > 0 ? '#ef4444' : '#10b981'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
            ),
            action: () => navigateTo('students', 'at-risk'),
        },
    ];

    return (
        <div className="fade-in">
            {/* ══ Welcome Banner ══ */}
            <div className="cd-welcome-banner ad-welcome-banner">
                <div className="ad-welcome-bg" />
                <div className="ad-welcome-content">
                    <div>
                        <p className="ad-welcome-greeting">{greeting},</p>
                        <h2 className="ad-welcome-name">
                            {displayName}
                            <span className="ad-welcome-badge">
                                {adviserType || (isDHT ? 'HT Adviser' : 'IT Adviser')} ({course || (isDHT ? 'DHT' : 'DIT')})
                            </span>
                        </h2>
                        <p className="ad-welcome-sub">Welcome to your Section Adviser Portal.</p>
                    </div>

                    <div className="ad-welcome-actions">
                        <button
                            className="btn cd-btn-light"
                            onClick={() => navigateTo('approvals')}
                        >
                            Pending Approvals ({stats?.totalPendingCount || 0})
                        </button>
                        <button
                            className="btn cd-btn-ghost"
                            onClick={() => navigateTo('students')}
                        >
                            View My Students
                        </button>
                    </div>
                </div>
            </div>

            {/* ══ 5-Card Statistics Row (Full Width) ══ */}
            <div className="ad-stats-grid">
                {kpiStats.map(stat => (
                    <div
                        key={stat.label}
                        className="ad-stat-card glass-card"
                        onClick={stat.action}
                        style={{ '--glow': stat.glow } as React.CSSProperties}
                    >
                        <div className="ad-stat-icon-wrap" style={{ background: stat.glow }}>
                            {stat.icon}
                        </div>
                        <div className="ad-stat-body">
                            <div className="ad-stat-label">{stat.label}</div>
                            <div className="ad-stat-value" style={{ color: stat.color }}>{stat.value}</div>
                            <div className="ad-stat-sub">{stat.sub}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ══ 2-Column Main Content Grid ══ */}
            <div className="ad-overview-grid">
                {/* ── Left Column (60%): My Assigned Sections ── */}
                <div className="admin-table-card" style={{ margin: 0 }}>
                    <div className="admin-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div className="admin-table-title">My Assigned Sections</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.15rem' }}>
                                Sections assigned to you by the Coordinator
                            </div>
                        </div>
                        <button
                            className="role-select"
                            style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                            onClick={() => navigateTo('sections')}
                        >
                            View All →
                        </button>
                    </div>

                    <div style={{ padding: '1.25rem' }}>
                        {(!stats?.sections || stats.sections.length === 0) ? (
                            <div className="ad-empty-state">
                                <div className="ad-empty-icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                        <polyline points="2 17 12 22 22 17" />
                                        <polyline points="2 12 12 17 22 12" />
                                    </svg>
                                </div>
                                <div className="ad-empty-title">No sections assigned yet</div>
                                <div className="ad-empty-desc">
                                    Your assigned sections will appear here once the Coordinator assigns them to you.
                                </div>
                            </div>
                        ) : (
                            <div className="ad-sections-grid">
                                {stats.sections.map((sec: Section) => (
                                    <div
                                        key={sec.id}
                                        className="section-card"
                                        onClick={() => navigateTo('students', sec.name)}
                                    >
                                        <div className="section-card-header">
                                            <div>
                                                <div className="section-card-title">{sec.name}</div>
                                                <div className="section-card-meta">
                                                    {sec.course_code === 'DHT' ? 'Hospitality Technology' : 'Information Technology'}
                                                </div>
                                            </div>
                                            <span className={`adviser-course-pill ${sec.course_code === 'DHT' ? 'adviser-course-dht' : 'adviser-course-dit'}`}>
                                                {sec.course_code}
                                            </span>
                                        </div>

                                        <div>
                                            <div className="section-card-count">{sec.student_count || 0}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Supervised Students</div>
                                        </div>

                                        <div className="section-card-footer">
                                            <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
                                                Manage Students →
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right Column (40%): Approval Queue, Risk Status, and Recent Submissions ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Approval Queue */}
                    <div className="admin-table-card" style={{ margin: 0 }}>
                        <div className="admin-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div className="admin-table-title">Approval Queue</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.15rem' }}>
                                    Tasks requiring your review
                                </div>
                            </div>
                            <button
                                className="role-select"
                                style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                                onClick={() => navigateTo('approvals')}
                            >
                                Open Queue →
                            </button>
                        </div>

                        <div style={{ padding: '1.25rem' }}>
                            <div className="ad-queue-list">
                                <div
                                    className="ad-queue-item"
                                    onClick={() => navigateTo('approvals', 'students')}
                                >
                                    <div className="ad-queue-info">
                                        <div className="ad-queue-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                                <circle cx="8.5" cy="7" r="4" />
                                                <polyline points="17 11 19 13 23 9" />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="ad-queue-title">Student Account Approvals</div>
                                            <div className="ad-queue-sub">Pending registration verification</div>
                                        </div>
                                    </div>
                                    <span
                                        className="ad-queue-badge"
                                        style={{
                                            background: (stats?.pendingApprovalsCount || 0) > 0 ? '#f59e0b' : 'var(--bg-elevated)',
                                            color: (stats?.pendingApprovalsCount || 0) > 0 ? '#ffffff' : 'var(--text-muted)'
                                        }}
                                    >
                                        {stats?.pendingApprovalsCount || 0}
                                    </span>
                                </div>

                                <div
                                    className="ad-queue-item"
                                    onClick={() => navigateTo('approvals', 'journals')}
                                >
                                    <div className="ad-queue-info">
                                        <div className="ad-queue-icon-wrap" style={{ background: 'rgba(13, 148, 136, 0.12)', color: '#0d9488' }}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                <polyline points="14 2 14 8 20 8" />
                                                <line x1="16" y1="13" x2="8" y2="13" />
                                                <line x1="16" y1="17" x2="8" y2="17" />
                                                <polyline points="10 9 9 9 8 9" />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="ad-queue-title">Daily Journal Entries</div>
                                            <div className="ad-queue-sub">Pending review & feedback</div>
                                        </div>
                                    </div>
                                    <span
                                        className="ad-queue-badge"
                                        style={{
                                            background: (stats?.pendingJournalsCount || 0) > 0 ? '#0d9488' : 'var(--bg-elevated)',
                                            color: (stats?.pendingJournalsCount || 0) > 0 ? '#ffffff' : 'var(--text-muted)'
                                        }}
                                    >
                                        {stats?.pendingJournalsCount || 0}
                                    </span>
                                </div>

                                <div
                                    className="ad-queue-item"
                                    onClick={() => navigateTo('approvals', 'documents')}
                                >
                                    <div className="ad-queue-info">
                                        <div className="ad-queue-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="ad-queue-title">Student Documents</div>
                                            <div className="ad-queue-sub">Requirements & endorsements</div>
                                        </div>
                                    </div>
                                    <span
                                        className="ad-queue-badge"
                                        style={{
                                            background: (stats?.pendingDocsCount || 0) > 0 ? '#10b981' : 'var(--bg-elevated)',
                                            color: (stats?.pendingDocsCount || 0) > 0 ? '#ffffff' : 'var(--text-muted)'
                                        }}
                                    >
                                        {stats?.pendingDocsCount || 0}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Students at Risk Card */}
                    <div className="admin-table-card" style={{ margin: 0 }}>
                        <div className="admin-table-header">
                            <div className="admin-table-title">Students at Risk Status</div>
                        </div>
                        <div style={{ padding: '1rem 1.25rem' }}>
                            {(stats?.studentsAtRiskCount || 0) === 0 ? (
                                <div className="ad-risk-healthy">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                        <polyline points="22 4 12 14.01 9 11.01" />
                                    </svg>
                                    <div>✓ No students currently flagged for risk or excessive absences.</div>
                                </div>
                            ) : (
                                <div className="ad-risk-alert">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                            <line x1="12" y1="9" x2="12" y2="13" />
                                            <line x1="12" y1="17" x2="12.01" y2="17" />
                                        </svg>
                                        <span>⚠️ {stats.studentsAtRiskCount} student(s) require immediate attention</span>
                                    </div>
                                    <button
                                        className="role-select"
                                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
                                        onClick={() => navigateTo('students', 'at-risk')}
                                    >
                                        Review →
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdviserOverviewView;
