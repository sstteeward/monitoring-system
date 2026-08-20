import React from 'react';
import { createPortal } from 'react-dom';
import type { AuditLogEntry } from '../services/auditService';

interface AuditLogDetailModalProps {
    log: AuditLogEntry;
    onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseUserAgent(ua: string | null): { browser: string; os: string } {
    if (!ua) return { browser: 'Unknown', os: 'Unknown' };

    let browser = 'Unknown';
    if (ua.includes('Edg/')) browser = 'Microsoft Edge';
    else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Google Chrome';
    else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
    else if (ua.includes('Opera/') || ua.includes('OPR/')) browser = 'Opera';

    let os = 'Unknown';
    if (ua.includes('Windows NT 10')) os = 'Windows 10/11';
    else if (ua.includes('Windows NT')) os = 'Windows';
    else if (ua.includes('Mac OS X')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    return { browser, os };
}

function getActionColor(action: string): { bg: string; text: string; border: string } {
    const a = action.toUpperCase();
    if (a === 'CREATE') return { bg: 'rgba(34,197,94,0.1)', text: '#16a34a', border: 'rgba(34,197,94,0.2)' };
    if (a === 'UPDATE') return { bg: 'rgba(59,130,246,0.1)', text: '#2563eb', border: 'rgba(59,130,246,0.2)' };
    if (a === 'DELETE') return { bg: 'rgba(239,68,68,0.1)', text: '#dc2626', border: 'rgba(239,68,68,0.2)' };
    if (a === 'LOGIN') return { bg: 'rgba(20,184,166,0.1)', text: '#0d9488', border: 'rgba(20,184,166,0.2)' };
    if (a === 'LOGOUT') return { bg: 'rgba(107,114,128,0.1)', text: '#6b7280', border: 'rgba(107,114,128,0.2)' };
    if (a === 'LOGIN_FAILED') return { bg: 'rgba(239,68,68,0.1)', text: '#dc2626', border: 'rgba(239,68,68,0.2)' };
    if (a === 'APPROVE') return { bg: 'rgba(34,197,94,0.1)', text: '#16a34a', border: 'rgba(34,197,94,0.2)' };
    if (a === 'REJECT') return { bg: 'rgba(249,115,22,0.1)', text: '#ea580c', border: 'rgba(249,115,22,0.2)' };
    if (a === 'ASSIGN' || a === 'UNASSIGN') return { bg: 'rgba(139,92,246,0.1)', text: '#7c3aed', border: 'rgba(139,92,246,0.2)' };
    if (a.includes('PASSWORD') || a.includes('ROLE') || a.includes('PERMISSION')) return { bg: 'rgba(245,158,11,0.1)', text: '#d97706', border: 'rgba(245,158,11,0.2)' };
    if (a === 'BACKUP' || a === 'RESTORE') return { bg: 'rgba(99,102,241,0.1)', text: '#6366f1', border: 'rgba(99,102,241,0.2)' };
    return { bg: 'rgba(107,114,128,0.1)', text: '#6b7280', border: 'rgba(107,114,128,0.2)' };
}

function formatFieldName(key: string): string {
    return key
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AuditLogDetailModal: React.FC<AuditLogDetailModalProps> = ({ log, onClose }) => {
    const actionColor = getActionColor(log.action);
    const { browser, os } = parseUserAgent(log.user_agent);

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    // Compute changed fields
    const changedFields: { key: string; old: any; new_: any }[] = [];
    if (log.old_values || log.new_values) {
        const allKeys = new Set([
            ...Object.keys(log.old_values || {}),
            ...Object.keys(log.new_values || {}),
        ]);
        allKeys.forEach(key => {
            const oldVal = log.old_values?.[key];
            const newVal = log.new_values?.[key];
            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                changedFields.push({ key, old: oldVal, new_: newVal });
            }
        });
    }

    const sectionHeader = (title: string, icon: React.ReactNode) => (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            marginBottom: '0.75rem', paddingBottom: '0.5rem',
            borderBottom: '1px solid var(--border)',
        }}>
            <span style={{ color: 'var(--primary)', display: 'flex' }}>{icon}</span>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{title}</span>
        </div>
    );

    const infoRow = (label: string, value: React.ReactNode) => (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '0.4rem 0', gap: '1rem',
        }}>
            <span style={{
                fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, marginTop: '0.1rem',
            }}>{label}</span>
            <span style={{
                fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500,
                textAlign: 'right', overflowWrap: 'anywhere', wordBreak: 'break-word', minWidth: 0, flex: 1,
            }}>{value ?? '—'}</span>
        </div>
    );

    const formatValue = (val: any): string => {
        if (val === null || val === undefined) return '—';
        if (typeof val === 'boolean') return val ? 'Yes' : 'No';
        if (typeof val === 'object') return JSON.stringify(val, null, 2);
        return String(val);
    };

    const modal = (
        <div
            onClick={handleBackdropClick}
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                width: '100%', height: '100%', zIndex: 2000,
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '2rem', animation: 'fadeIn 0.2s ease',
            }}
        >
            <div
                className="custom-scrollbar"
                style={{
                    borderRadius: '20px', width: 'min(680px, 95vw)',
                    maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden',
                    background: 'var(--bg-card)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                    border: '1px solid var(--border)',
                    animation: 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                    position: 'relative',
                }}
            >
                {/* Close button */}
                <button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    title="Close"
                    style={{
                        position: 'absolute', top: '1rem', right: '1rem',
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        borderRadius: '12px', width: 36, height: 36,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: 'var(--text-muted)',
                        transition: 'all 0.2s', zIndex: 10,
                    }}
                >
                    <span style={{ fontSize: '1.2rem', fontWeight: 300 }}>✕</span>
                </button>

                {/* Header */}
                <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <span style={{
                            display: 'inline-block', padding: '0.25rem 0.75rem',
                            background: actionColor.bg, color: actionColor.text,
                            borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                            border: `1px solid ${actionColor.border}`, letterSpacing: '0.05em',
                        }}>
                            {log.action}
                        </span>
                        <span style={{
                            display: 'inline-block', padding: '0.2rem 0.6rem',
                            background: log.status === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            color: log.status === 'success' ? '#16a34a' : '#dc2626',
                            borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600,
                            border: `1px solid ${log.status === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                        }}>
                            {log.status === 'success' ? '● Success' : '● Failed'}
                        </span>
                    </div>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Audit Log Details
                    </h2>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(log.created_at).toLocaleString('en-US', {
                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })}
                    </p>
                </div>

                <div style={{ padding: '1.25rem 1.5rem' }}>
                    {/* Basic Information */}
                    {sectionHeader('Basic Information',
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    )}
                    <div style={{ marginBottom: '1.5rem' }}>
                        {infoRow('Performed By', log.user_name || '—')}
                        {infoRow('User Role', log.user_role ? log.user_role.charAt(0).toUpperCase() + log.user_role.slice(1) : '—')}
                        {infoRow('Module', log.module || '—')}
                        {infoRow('Target', log.target_name || log.target_id || '—')}
                        {log.target_type && infoRow('Target Type', log.target_type)}
                    </div>

                    {/* Description */}
                    {log.description && (
                        <>
                            {sectionHeader('Description',
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                            )}
                            <div style={{
                                marginBottom: '1.5rem', padding: '0.75rem 1rem',
                                background: 'var(--bg-elevated)', borderRadius: '10px',
                                border: '1px solid var(--border)',
                                fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.6,
                            }}>
                                {log.description}
                            </div>
                        </>
                    )}

                    {/* Changes */}
                    {changedFields.length > 0 && (
                        <>
                            {sectionHeader('Changes',
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            )}
                            <div style={{
                                marginBottom: '1.5rem', borderRadius: '10px',
                                border: '1px solid var(--border)', overflow: 'hidden',
                            }}>
                                {changedFields.map((field, i) => (
                                    <div
                                        key={field.key}
                                        style={{
                                            padding: '0.6rem 1rem',
                                            borderBottom: i < changedFields.length - 1 ? '1px solid var(--border)' : 'none',
                                            background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)',
                                        }}
                                    >
                                        <div style={{
                                            fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
                                            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem',
                                        }}>
                                            {formatFieldName(field.key)}
                                        </div>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            fontSize: '0.85rem', flexWrap: 'wrap',
                                        }}>
                                            <span style={{
                                                color: '#dc2626', background: 'rgba(239,68,68,0.08)',
                                                padding: '0.15rem 0.5rem', borderRadius: '4px',
                                                textDecoration: field.old !== undefined && field.old !== null ? 'line-through' : 'none',
                                                fontFamily: 'monospace', fontSize: '0.8rem',
                                            }}>
                                                {formatValue(field.old)}
                                            </span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>→</span>
                                            <span style={{
                                                color: '#16a34a', background: 'rgba(34,197,94,0.08)',
                                                padding: '0.15rem 0.5rem', borderRadius: '4px',
                                                fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem',
                                            }}>
                                                {formatValue(field.new_)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Technical Information */}
                    {sectionHeader('Technical Information',
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    )}
                    <div>
                        {infoRow('IP Address', log.ip_address || 'Not captured')}
                        {infoRow('Browser', browser)}
                        {infoRow('Operating System', os)}
                        {log.user_agent && (
                            <div style={{ marginTop: '0.5rem' }}>
                                <div style={{
                                    fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)',
                                    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem',
                                }}>User Agent</div>
                                <div style={{
                                    fontSize: '0.72rem', color: 'var(--text-dim)',
                                    fontFamily: 'monospace', background: 'var(--bg-elevated)',
                                    padding: '0.5rem 0.75rem', borderRadius: '8px',
                                    border: '1px solid var(--border)', wordBreak: 'break-all',
                                    lineHeight: 1.5,
                                }}>
                                    {log.user_agent}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
};

export { getActionColor };
export default AuditLogDetailModal;
