import React, { useState, useEffect } from 'react';
import { adminService, type AuditLog } from '../services/adminService';
import { TableSkeleton } from './Skeletons';

const AdminAuditLogView: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterAction, setFilterAction] = useState('');

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const data = await adminService.getAuditLogs();
            setLogs(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const formatAction = (action: string) => {
        return action.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    const filteredLogs = logs.filter(log =>
        filterAction ? log.action === filterAction : true
    );

    const uniqueActions = Array.from(new Set(logs.map(l => l.action)));

    if (loading) return (
        <div className="fade-in">
            <div className="admin-table-card">
                <div className="admin-table-header">
                    <div className="admin-table-title">Audit Trail & Activity Logs</div>
                    <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>Track sensitive system changes and user actions.</div>
                </div>
                <TableSkeleton rows={8} cols={5} />
            </div>
        </div>
    );

    return (
        <div className="fade-in">
            <div className="admin-table-card">
                <div className="admin-table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div className="admin-table-title">Audit Trail & Activity Logs</div>
                        <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>Track sensitive system changes and user actions.</div>
                    </div>

                    <select
                        className="role-select"
                        value={filterAction}
                        onChange={(e) => setFilterAction(e.target.value)}
                        style={{ minWidth: '200px' }}
                    >
                        <option value="">All Actions</option>
                        {uniqueActions.map(action => (
                            <option key={action} value={action}>{formatAction(action)}</option>
                        ))}
                    </select>
                </div>

                {filteredLogs.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>No audit logs found.</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="admin-table" style={{ width: '100%', minWidth: '800px' }}>
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>User</th>
                                    <th>Action</th>
                                    <th>Target Table / ID</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLogs.map(log => (
                                    <tr key={log.id}>
                                        <td style={{ color: 'var(--admin-text-secondary)', fontSize: '0.85rem' }}>{new Date(log.created_at).toLocaleString()}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div className="admin-user-avatar" style={{ width: 24, height: 24, fontSize: '0.7rem' }}>
                                                    {log.profiles?.first_name?.[0]}{log.profiles?.last_name?.[0]}
                                                </div>
                                                <span>{log.profiles ? `${log.profiles.first_name} ${log.profiles.last_name}` : 'Unknown User'}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{
                                                display: 'inline-block', padding: '0.2rem 0.6rem',
                                                background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b',
                                                borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(245,158,11,0.2)'
                                            }}>
                                                {formatAction(log.action).toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--admin-text-primary)' }}>
                                            {log.table_name} <br />
                                            <span style={{ color: 'var(--admin-text-secondary)' }}>{log.record_id || '-'}</span>
                                        </td>
                                        <td style={{ maxWidth: '250px' }}>
                                            <pre style={{
                                                margin: 0, padding: '0.5rem', background: 'var(--admin-bg)',
                                                borderRadius: '6px', fontSize: '0.75rem', color: '#a3e635',
                                                overflowX: 'auto', maxHeight: '60px'
                                            }}>
                                                {log.details ? JSON.stringify(log.details, null, 2) : '{}'}
                                            </pre>
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

export default AdminAuditLogView;
