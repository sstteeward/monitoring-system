import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { profileService } from '../services/profileService';
import { companyService } from '../services/companyService';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';

interface AuditLog {
    id: string;
    user_id: string;
    action: string;
    table_name: string;
    record_id: string | null;
    details: any;
    created_at: string;
    profiles?: {
        first_name: string;
        last_name: string;
        email: string;
        account_type: string;
    };
}

const CompanySecurityLogsView: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterAction, setFilterAction] = useState<string>('all');

    const filteredLogs = filterAction === 'all' 
        ? logs 
        : logs.filter(log => log.action.toLowerCase().includes(filterAction.toLowerCase()));

    const {
        currentPage,
        setCurrentPage,
        totalPages,
        paginatedItems: paginatedLogs,
        totalItems,
        itemsPerPage
    } = usePagination(filteredLogs, 20);

    useEffect(() => { loadLogs(); }, []);

    const loadLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await profileService.getCurrentProfile();
            if (!profile?.company_id) {
                throw new Error("You are not associated with any company.");
            }

            // Get all users associated with this company
            const assignedStudents = await companyService.getAssignedStudents(profile.company_id);
            const relatedUserIds = [profile.id, ...assignedStudents.map(s => s.id)];

            // Fetch audit logs for all related users
            const { data, error: fetchError } = await supabase
                .from('audit_logs')
                .select(`
                    *,
                    profiles (
                        first_name,
                        last_name,
                        email,
                        account_type
                    )
                `)
                .in('user_id', relatedUserIds)
                .order('created_at', { ascending: false })
                .limit(200);

            if (fetchError) throw fetchError;
            setLogs(data as AuditLog[]);
        } catch (err: any) {
            console.error('Failed to load security logs:', err);
            setError(err?.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const getActionColor = (action: string) => {
        const lowerAction = action.toLowerCase();
        if (lowerAction.includes('login') || lowerAction.includes('sign_in')) {
            return { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981', icon: '🔑' };
        }
        if (lowerAction.includes('logout') || lowerAction.includes('sign_out')) {
            return { bg: 'rgba(107, 114, 128, 0.1)', text: '#6b7280', icon: '🚪' };
        }
        if (lowerAction.includes('create') || lowerAction.includes('insert')) {
            return { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6', icon: '➕' };
        }
        if (lowerAction.includes('update') || lowerAction.includes('edit')) {
            return { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b', icon: '✏️' };
        }
        if (lowerAction.includes('delete') || lowerAction.includes('remove')) {
            return { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444', icon: '🗑️' };
        }
        if (lowerAction.includes('approve')) {
            return { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981', icon: '✅' };
        }
        if (lowerAction.includes('reject')) {
            return { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444', icon: '❌' };
        }
        return { bg: 'var(--bg-elevated)', text: 'var(--text-secondary)', icon: '📋' };
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    const getRelativeTime = (dateStr: string) => {
        const now = new Date();
        const past = new Date(dateStr);
        const diffMs = now.getTime() - past.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays}d ago`;
        return formatDate(dateStr);
    };

    // Derive unique action types from logs for filter
    const actionTypes = ['all', ...Array.from(new Set(logs.map(l => l.action)))];

    if (error) return (
        <div className="view-container fade-in">
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '1.5rem 2rem', color: '#f87171' }}>
                <strong>Error:</strong> {error}
            </div>
        </div>
    );

    return (
        <div className="view-container fade-in">
            <div className="view-header" style={{ flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                    <h2 className="view-title" style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Security & Activity Logs</h2>
                    <p className="view-subtitle" style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
                        Monitor login activity, data changes, and actions by your company users and interns
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
                    <select 
                        className="form-input"
                        style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                        value={filterAction}
                        onChange={e => { setFilterAction(e.target.value); setCurrentPage(1); }}
                    >
                        {actionTypes.map(type => (
                            <option key={type} value={type}>
                                {type === 'all' ? 'All Actions' : type.replace(/_/g, ' ')}
                            </option>
                        ))}
                    </select>
                    <button 
                        className="btn-secondary"
                        onClick={loadLogs}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '8px' }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                        Refresh
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}>Loading security logs...</div>
                </div>
            ) : filteredLogs.length === 0 ? (
                <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '1rem', opacity: 0.5 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <p>{filterAction === 'all' ? 'No activity logs found.' : `No "${filterAction}" logs found.`}</p>
                </div>
            ) : (
                <div className="glass-card" style={{ overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                                    <th style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', width: '50px' }}></th>
                                    <th style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)' }}>Action</th>
                                    <th style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)' }}>User</th>
                                    <th style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)' }}>Target</th>
                                    <th style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)' }}>Details</th>
                                    <th style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedLogs.map((log) => {
                                    const colors = getActionColor(log.action);
                                    return (
                                        <tr key={log.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }} className="hoverable-row">
                                            <td style={{ padding: '0.75rem 1.25rem', textAlign: 'center' }}>
                                                <span style={{ fontSize: '1.1rem' }}>{colors.icon}</span>
                                            </td>
                                            <td style={{ padding: '0.75rem 1.25rem' }}>
                                                <span style={{ 
                                                    padding: '0.2rem 0.6rem', 
                                                    borderRadius: '6px', 
                                                    fontSize: '0.75rem', 
                                                    fontWeight: 700,
                                                    background: colors.bg,
                                                    color: colors.text,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.03em',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {log.action.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.75rem 1.25rem' }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                                    {log.profiles ? `${log.profiles.first_name} ${log.profiles.last_name}` : 'Unknown'}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {log.profiles?.email || ''}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.75rem 1.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                {log.table_name ? (
                                                    <span style={{ background: 'var(--bg-elevated)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                                        {log.table_name}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td style={{ padding: '0.75rem 1.25rem', color: 'var(--text-muted)', fontSize: '0.8rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {log.details ? (typeof log.details === 'string' ? log.details : JSON.stringify(log.details).substring(0, 80)) : '—'}
                                            </td>
                                            <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{getRelativeTime(log.created_at)}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatDate(log.created_at)}</div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!loading && filteredLogs.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setCurrentPage}
                        itemName="logs"
                    />
                </div>
            )}
        </div>
    );
};

export default CompanySecurityLogsView;
