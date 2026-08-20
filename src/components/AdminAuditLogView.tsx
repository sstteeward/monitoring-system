import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    getAuditLogsPaginated,
    getAuditLogUsers,
    getAuditLogStats,
    exportAuditLogs,
    downloadFile,
    markAuditLogsAsSeen,
    AUDIT_ACTIONS,
    AUDIT_MODULES,
    type AuditLogEntry,
    type AuditLogFilters,
    type AuditLogUser,
    type AuditLogStats,
} from '../services/auditService';
import { getActionColor } from './AuditLogDetailModal';
import AuditLogDetailModal from './AuditLogDetailModal';
import { TableSkeleton } from './Skeletons';
import { supabase } from '../lib/supabaseClient';

// ---------------------------------------------------------------------------
// Page size options
// ---------------------------------------------------------------------------
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const AdminAuditLogView: React.FC = () => {
    // Data
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<AuditLogStats | null>(null);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Filters
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [filterAction, setFilterAction] = useState('');
    const [filterModule, setFilterModule] = useState('');
    const [filterUser, setFilterUser] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');

    // Users for filter dropdown
    const [auditUsers, setAuditUsers] = useState<AuditLogUser[]>([]);

    // Detail modal
    const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

    // Search debounce
    const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

    // Exporting state
    const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);

    // Realtime live subscription state
    const [realtimeActive, setRealtimeActive] = useState(true);
    const [newEventsNotice, setNewEventsNotice] = useState(0);
    const realtimeChannelRef = useRef<any>(null);

    // ------------------------------------------------------------------
    // Build filters object
    // ------------------------------------------------------------------
    const buildFilters = useCallback((): AuditLogFilters => {
        const f: AuditLogFilters = {};
        if (search) f.search = search;
        if (filterAction) f.action = filterAction;
        if (filterModule) f.module = filterModule;
        if (filterUser) f.userId = filterUser;
        if (filterStatus) f.status = filterStatus;
        if (filterDateFrom) f.dateFrom = filterDateFrom;
        if (filterDateTo) f.dateTo = filterDateTo;
        return f;
    }, [search, filterAction, filterModule, filterUser, filterStatus, filterDateFrom, filterDateTo]);

    // ------------------------------------------------------------------
    // Fetch logs
    // ------------------------------------------------------------------
    const fetchLogs = useCallback(async (showSkeleton = false) => {
        if (showSkeleton) setLoading(true);
        try {
            const filters = buildFilters();
            const [{ logs: data, totalCount: count }, statsData] = await Promise.all([
                getAuditLogsPaginated(filters, currentPage, pageSize),
                getAuditLogStats(),
            ]);
            setLogs(data);
            setTotalCount(count);
            setStats(statsData);
            setNewEventsNotice(0);
            markAuditLogsAsSeen().catch(() => {});
        } catch (e) {
            console.error('[AuditLogView] Error loading logs:', e);
        } finally {
            setLoading(false);
        }
    }, [buildFilters, currentPage, pageSize]);

    useEffect(() => {
        fetchLogs(true);
    }, [fetchLogs]);

    // Load users for dropdown (once)
    useEffect(() => {
        getAuditLogUsers().then(setAuditUsers).catch(console.error);
    }, []);

    // ------------------------------------------------------------------
    // Realtime Supabase Subscription for audit_logs
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!realtimeActive) {
            if (realtimeChannelRef.current) {
                supabase.removeChannel(realtimeChannelRef.current);
                realtimeChannelRef.current = null;
            }
            return;
        }

        const channel = supabase
            .channel('realtime_audit_logs')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'audit_logs' },
                () => {
                    setNewEventsNotice(prev => prev + 1);
                    // Automatically re-fetch if currently on page 1 and no search filter
                    if (currentPage === 1 && !search && !filterAction && !filterModule && !filterUser) {
                        fetchLogs(false);
                    }
                }
            )
            .subscribe();

        realtimeChannelRef.current = channel;

        return () => {
            if (realtimeChannelRef.current) {
                supabase.removeChannel(realtimeChannelRef.current);
                realtimeChannelRef.current = null;
            }
        };
    }, [realtimeActive, currentPage, search, filterAction, filterModule, filterUser, fetchLogs]);

    // ------------------------------------------------------------------
    // Search debounce handler
    // ------------------------------------------------------------------
    const handleSearchInput = (value: string) => {
        setSearchInput(value);
        if (searchTimeout) clearTimeout(searchTimeout);
        const t = setTimeout(() => {
            setSearch(value);
            setCurrentPage(1);
        }, 400);
        setSearchTimeout(t);
    };

    // ------------------------------------------------------------------
    // Filter change handlers (reset to page 1)
    // ------------------------------------------------------------------
    const handleFilterChange = (setter: (v: string) => void) => (value: string) => {
        setter(value);
        setCurrentPage(1);
    };

    // ------------------------------------------------------------------
    // Clear all filters
    // ------------------------------------------------------------------
    const clearFilters = () => {
        setSearch('');
        setSearchInput('');
        setFilterAction('');
        setFilterModule('');
        setFilterUser('');
        setFilterStatus('');
        setFilterDateFrom('');
        setFilterDateTo('');
        setCurrentPage(1);
    };

    const hasActiveFilters = !!(search || filterAction || filterModule || filterUser || filterStatus || filterDateFrom || filterDateTo);

    // ------------------------------------------------------------------
    // Export Handlers
    // ------------------------------------------------------------------
    const handleExport = async (format: 'csv' | 'json') => {
        try {
            setExporting(format);
            const content = await exportAuditLogs(buildFilters(), format);
            const timestamp = new Date().toISOString().slice(0, 10);
            const filename = `audit_logs_${timestamp}.${format}`;
            const mimeType = format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json;charset=utf-8;';
            downloadFile(content, filename, mimeType);
        } catch (err: any) {
            console.error('[AuditLogView] Export failed:', err);
            alert(`Failed to export audit logs: ${err?.message || err}`);
        } finally {
            setExporting(null);
        }
    };

    // ------------------------------------------------------------------
    // Pagination
    // ------------------------------------------------------------------
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const startItem = totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0;
    const endItem = Math.min(currentPage * pageSize, totalCount);

    const handlePageSizeChange = (newSize: number) => {
        setPageSize(newSize);
        setCurrentPage(1);
    };

    // ------------------------------------------------------------------
    // Render page number buttons
    // ------------------------------------------------------------------
    const renderPageButtons = () => {
        const pages: (number | '...')[] = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (currentPage > 3) pages.push('...');
            for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
                pages.push(i);
            }
            if (currentPage < totalPages - 2) pages.push('...');
            pages.push(totalPages);
        }
        return pages.map((p, i) =>
            p === '...' ? (
                <span key={`ellipsis-${i}`} style={{ padding: '0.4rem 0.3rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>…</span>
            ) : (
                <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    style={{
                        padding: '0.4rem 0.7rem', borderRadius: 8,
                        border: p === currentPage ? 'none' : '1px solid var(--border)',
                        background: p === currentPage ? 'var(--primary)' : 'var(--bg-elevated)',
                        color: p === currentPage ? '#fff' : 'var(--text-bright)',
                        cursor: 'pointer', fontSize: '0.85rem',
                        fontWeight: p === currentPage ? 600 : 400,
                        transition: 'all 0.15s ease',
                    }}
                >{p}</button>
            )
        );
    };

    // ------------------------------------------------------------------
    // Shared styles
    // ------------------------------------------------------------------
    const selectStyle: React.CSSProperties = {
        padding: '0.5rem 0.75rem', borderRadius: '8px',
        border: '1px solid var(--border)', background: 'var(--bg-elevated)',
        color: 'var(--text-primary)', fontSize: '0.82rem',
        outline: 'none', cursor: 'pointer', minWidth: '135px',
    };

    const inputStyle: React.CSSProperties = {
        padding: '0.5rem 0.75rem', borderRadius: '8px',
        border: '1px solid var(--border)', background: 'var(--bg-elevated)',
        color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none',
    };

    // ------------------------------------------------------------------
    // Loading skeleton
    // ------------------------------------------------------------------
    if (loading && logs.length === 0) {
        return (
            <div className="fade-in">
                <div className="admin-table-card">
                    <div className="admin-table-header">
                        <div className="admin-table-title">Audit Trail &amp; Activity Logs</div>
                        <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>
                            Track sensitive system changes and user actions.
                        </div>
                    </div>
                    <TableSkeleton rows={8} cols={7} />
                </div>
            </div>
        );
    }

    const successRate = stats && stats.totalLogs > 0
        ? ((stats.totalSuccess / stats.totalLogs) * 100).toFixed(1)
        : '100';

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Metric Summary Cards */}
            {stats && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '1rem',
                }}>
                    {/* Total Events */}
                    <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: '16px',
                        padding: '1.1rem 1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Total Activities
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                                {stats.totalLogs.toLocaleString()}
                            </div>
                        </div>
                        <div style={{
                            width: 44, height: 44, borderRadius: '12px',
                            background: 'rgba(59,130,246,0.1)', color: '#3b82f6',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        </div>
                    </div>

                    {/* Past 24h Activity */}
                    <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: '16px',
                        padding: '1.1rem 1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Last 24 Hours
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--primary)', marginTop: '0.2rem' }}>
                                {stats.recent24h.toLocaleString()}
                            </div>
                        </div>
                        <div style={{
                            width: 44, height: 44, borderRadius: '12px',
                            background: 'rgba(16,185,129,0.1)', color: 'var(--primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </div>
                    </div>

                    {/* Success Rate */}
                    <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: '16px',
                        padding: '1.1rem 1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Success Rate
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#16a34a', marginTop: '0.2rem' }}>
                                {successRate}%
                            </div>
                        </div>
                        <div style={{
                            width: 44, height: 44, borderRadius: '12px',
                            background: 'rgba(34,197,94,0.1)', color: '#16a34a',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        </div>
                    </div>

                    {/* Failed Attempts */}
                    <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: '16px',
                        padding: '1.1rem 1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Security / Failed
                            </div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: stats.totalFailed > 0 ? '#dc2626' : 'var(--text-muted)', marginTop: '0.2rem' }}>
                                {stats.totalFailed.toLocaleString()}
                            </div>
                        </div>
                        <div style={{
                            width: 44, height: 44, borderRadius: '12px',
                            background: stats.totalFailed > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(107,114,128,0.1)',
                            color: stats.totalFailed > 0 ? '#dc2626' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Table Card */}
            <div className="admin-table-card">
                {/* Header */}
                <div className="admin-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <div className="admin-table-title">Audit Trail &amp; Activity Logs</div>
                            {newEventsNotice > 0 && (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                    fontSize: '0.72rem', fontWeight: 700, color: '#10b981',
                                    background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)',
                                    padding: '0.15rem 0.55rem', borderRadius: '20px',
                                }}>
                                    • {newEventsNotice} New
                                </span>
                            )}
                            {realtimeActive && (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                    fontSize: '0.72rem', fontWeight: 600, color: '#16a34a',
                                    background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
                                    padding: '0.15rem 0.5rem', borderRadius: '20px',
                                }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                                    Live
                                </span>
                            )}
                        </div>
                        <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>
                            Comprehensive, tamper-resistant trail of sensitive actions, access, and changes.
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Live Toggle */}
                        <button
                            onClick={() => setRealtimeActive(prev => !prev)}
                            title={realtimeActive ? 'Live updates active (click to pause)' : 'Live updates paused (click to resume)'}
                            style={{
                                padding: '0.5rem 0.75rem', borderRadius: '8px',
                                border: '1px solid var(--border)',
                                background: realtimeActive ? 'rgba(34,197,94,0.08)' : 'var(--bg-elevated)',
                                color: realtimeActive ? '#16a34a' : 'var(--text-muted)',
                                fontSize: '0.82rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.35rem',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                            {realtimeActive ? 'Live Stream' : 'Paused'}
                        </button>

                        {/* Export CSV */}
                        <button
                            onClick={() => handleExport('csv')}
                            disabled={exporting !== null}
                            style={{
                                padding: '0.5rem 0.85rem', borderRadius: '8px',
                                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                                color: 'var(--text-primary)', fontSize: '0.82rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.35rem',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            {exporting === 'csv' ? 'Exporting...' : 'Export CSV'}
                        </button>

                        {/* Export JSON */}
                        <button
                            onClick={() => handleExport('json')}
                            disabled={exporting !== null}
                            style={{
                                padding: '0.5rem 0.85rem', borderRadius: '8px',
                                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                                color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.35rem',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                            {exporting === 'json' ? 'Exporting...' : 'JSON'}
                        </button>

                        {/* Clear Filters */}
                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                style={{
                                    padding: '0.5rem 0.85rem', borderRadius: '8px',
                                    border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                                    color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                Clear
                            </button>
                        )}

                        {/* Refresh */}
                        <button
                            onClick={() => fetchLogs(true)}
                            style={{
                                padding: '0.5rem 0.85rem', borderRadius: '8px',
                                border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                                color: 'var(--text-primary)', fontSize: '0.82rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.3rem',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                            Refresh
                        </button>
                    </div>
                </div>

                {/* New events notice banner if any */}
                {newEventsNotice > 0 && (
                    <div style={{
                        background: 'rgba(59,130,246,0.1)', borderBottom: '1px solid rgba(59,130,246,0.2)',
                        padding: '0.5rem 1.25rem', display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', fontSize: '0.8rem', color: '#2563eb',
                    }}>
                        <span>🔔 {newEventsNotice} new audit {newEventsNotice === 1 ? 'event has' : 'events have'} occurred.</span>
                        <button
                            onClick={() => { fetchLogs(false); }}
                            style={{
                                background: 'transparent', border: 'none', color: '#2563eb',
                                fontWeight: 600, cursor: 'pointer', textDecoration: 'underline',
                                fontSize: '0.8rem',
                            }}
                        >
                            Update view
                        </button>
                    </div>
                )}

                {/* Filters Row */}
                <div style={{
                    padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)',
                    display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center',
                }}>
                    {/* Search */}
                    <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '160px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"
                            style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}>
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input
                            type="text"
                            placeholder="Search user, action, target..."
                            value={searchInput}
                            onChange={(e) => handleSearchInput(e.target.value)}
                            style={{ ...inputStyle, paddingLeft: '2.2rem', width: '100%', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* Action filter */}
                    <select
                        value={filterAction}
                        onChange={(e) => handleFilterChange(setFilterAction)(e.target.value)}
                        style={selectStyle}
                    >
                        <option value="">All Actions</option>
                        {AUDIT_ACTIONS.map(a => (
                            <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                    </select>

                    {/* Module filter */}
                    <select
                        value={filterModule}
                        onChange={(e) => handleFilterChange(setFilterModule)(e.target.value)}
                        style={selectStyle}
                    >
                        <option value="">All Modules</option>
                        {AUDIT_MODULES.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>

                    {/* User filter */}
                    <select
                        value={filterUser}
                        onChange={(e) => handleFilterChange(setFilterUser)(e.target.value)}
                        style={selectStyle}
                    >
                        <option value="">All Users</option>
                        {auditUsers.map(u => (
                            <option key={u.user_id} value={u.user_id}>{u.user_name} ({u.user_role})</option>
                        ))}
                    </select>

                    {/* Status filter */}
                    <select
                        value={filterStatus}
                        onChange={(e) => handleFilterChange(setFilterStatus)(e.target.value)}
                        style={{ ...selectStyle, minWidth: '110px' }}
                    >
                        <option value="">All Status</option>
                        <option value="success">Success</option>
                        <option value="failed">Failed</option>
                    </select>

                    {/* Date from */}
                    <input
                        type="date"
                        value={filterDateFrom}
                        onChange={(e) => handleFilterChange(setFilterDateFrom)(e.target.value)}
                        style={{ ...inputStyle, minWidth: '125px' }}
                        title="From date"
                    />

                    {/* Date to */}
                    <input
                        type="date"
                        value={filterDateTo}
                        onChange={(e) => handleFilterChange(setFilterDateTo)(e.target.value)}
                        style={{ ...inputStyle, minWidth: '125px' }}
                        title="To date"
                    />
                </div>

                {/* Table or Empty State */}
                {!loading && logs.length === 0 ? (
                    /* Empty state */
                    <div style={{
                        padding: '4rem 2rem', textAlign: 'center', display: 'flex',
                        flexDirection: 'column', alignItems: 'center', gap: '1rem',
                    }}>
                        <div style={{
                            width: 72, height: 72, borderRadius: '20px',
                            background: 'var(--bg-elevated)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            border: '1px solid var(--border)',
                        }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                                <polyline points="10 9 9 9 8 9"/>
                            </svg>
                        </div>
                        <div>
                            <h3 style={{
                                margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 600,
                                color: 'var(--text-primary)',
                            }}>
                                {hasActiveFilters ? 'No matching audit logs' : 'No audit activity yet'}
                            </h3>
                            <p style={{
                                margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)',
                                maxWidth: '440px', lineHeight: 1.6,
                            }}>
                                {hasActiveFilters
                                    ? 'No audit logs match your current filter criteria. Try clearing or expanding your filters.'
                                    : 'Recorded system events and user actions will automatically appear here in real time.'
                                }
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Table */}
                        <div style={{ overflowX: 'auto', position: 'relative' }}>
                            {loading && (
                                <div style={{
                                    position: 'absolute', inset: 0, background: 'rgba(var(--bg-page), 0.5)',
                                    zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    backdropFilter: 'blur(2px)',
                                }}>
                                    <div style={{
                                        padding: '0.5rem 1rem', borderRadius: '8px',
                                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                        fontSize: '0.82rem', color: 'var(--text-muted)',
                                    }}>Loading logs...</div>
                                </div>
                            )}
                            <table className="admin-table" style={{ width: '100%', minWidth: '1000px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '160px' }}>Date &amp; Time</th>
                                        <th style={{ width: '160px' }}>User</th>
                                        <th style={{ width: '120px' }}>Action</th>
                                        <th style={{ width: '120px' }}>Module</th>
                                        <th>Description</th>
                                        <th style={{ width: '140px' }}>Target</th>
                                        <th style={{ width: '80px' }}>Status</th>
                                        <th style={{ width: '70px' }}>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(log => {
                                        const actionColor = getActionColor(log.action);
                                        return (
                                            <tr key={log.id}>
                                                {/* Date & Time */}
                                                <td style={{ color: 'var(--admin-text-secondary)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                                    {new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    <br />
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        {new Date(log.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </span>
                                                </td>

                                                {/* User */}
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <div style={{
                                                            width: 28, height: 28, borderRadius: '8px',
                                                            background: 'var(--primary)', color: '#fff',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
                                                        }}>
                                                            {(log.user_name || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {log.user_name || 'System / Guest'}
                                                            </div>
                                                            {log.user_role && (
                                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                                                    {log.user_role}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Action */}
                                                <td>
                                                    <span style={{
                                                        display: 'inline-block', padding: '0.2rem 0.55rem',
                                                        background: actionColor.bg, color: actionColor.text,
                                                        borderRadius: '5px', fontSize: '0.7rem', fontWeight: 700,
                                                        border: `1px solid ${actionColor.border}`,
                                                        letterSpacing: '0.03em',
                                                    }}>
                                                        {log.action}
                                                    </span>
                                                </td>

                                                {/* Module */}
                                                <td style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                                                    {log.module || '—'}
                                                </td>

                                                {/* Description */}
                                                <td style={{
                                                    fontSize: '0.82rem', color: 'var(--admin-text-secondary)',
                                                    maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {log.description || '—'}
                                                </td>

                                                {/* Target */}
                                                <td style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                                                    {log.target_name || log.target_id || '—'}
                                                </td>

                                                {/* Status */}
                                                <td>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                        padding: '0.15rem 0.5rem', borderRadius: '5px',
                                                        fontSize: '0.7rem', fontWeight: 600,
                                                        background: log.status === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                                        color: log.status === 'success' ? '#16a34a' : '#dc2626',
                                                        border: `1px solid ${log.status === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                                    }}>
                                                        <span style={{ fontSize: '0.5rem' }}>●</span>
                                                        {log.status === 'success' ? 'Success' : 'Failed'}
                                                    </span>
                                                </td>

                                                {/* Details */}
                                                <td>
                                                    <button
                                                        onClick={() => setSelectedLog(log)}
                                                        style={{
                                                            padding: '0.3rem 0.6rem', borderRadius: '6px',
                                                            border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                                                            color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 600,
                                                            cursor: 'pointer', transition: 'all 0.15s ease',
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.background = 'var(--primary)';
                                                            e.currentTarget.style.color = '#fff';
                                                            e.currentTarget.style.borderColor = 'var(--primary)';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = 'var(--bg-elevated)';
                                                            e.currentTarget.style.color = 'var(--primary)';
                                                            e.currentTarget.style.borderColor = 'var(--border)';
                                                        }}
                                                    >
                                                        View
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalCount > 0 && (
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '1rem 1.25rem', borderTop: '1px solid var(--border)',
                                flexWrap: 'wrap', gap: '0.75rem',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                        Showing {startItem}–{endItem} of {totalCount} audit logs
                                    </span>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                                        style={{
                                            padding: '0.3rem 0.5rem', borderRadius: '6px',
                                            border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                                            color: 'var(--text-primary)', fontSize: '0.8rem', cursor: 'pointer',
                                        }}
                                    >
                                        {PAGE_SIZE_OPTIONS.map(s => (
                                            <option key={s} value={s}>{s} per page</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                    <button
                                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                        disabled={currentPage === 1}
                                        style={{
                                            padding: '0.4rem 0.7rem', borderRadius: 8,
                                            border: '1px solid var(--border)',
                                            background: currentPage === 1 ? 'var(--bg-secondary)' : 'var(--bg-elevated)',
                                            color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-bright)',
                                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                            fontSize: '0.85rem', transition: 'all 0.15s ease',
                                        }}
                                    >Previous</button>
                                    {renderPageButtons()}
                                    <button
                                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                        disabled={currentPage === totalPages}
                                        style={{
                                            padding: '0.4rem 0.7rem', borderRadius: 8,
                                            border: '1px solid var(--border)',
                                            background: currentPage === totalPages ? 'var(--bg-secondary)' : 'var(--bg-elevated)',
                                            color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-bright)',
                                            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                                            fontSize: '0.85rem', transition: 'all 0.15s ease',
                                        }}
                                    >Next</button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Detail Modal */}
            {selectedLog && (
                <AuditLogDetailModal
                    log={selectedLog}
                    onClose={() => setSelectedLog(null)}
                />
            )}
        </div>
    );
};

export default AdminAuditLogView;
