/**
 * Audit Service — Central audit logging for the SIL Monitoring System.
 *
 * Provides a reusable `createAuditLog()` function that automatically captures
 * user identity, IP address, browser info, and scrubs sensitive data before
 * writing to the `audit_logs` table.
 *
 * Usage:
 *   import { createAuditLog } from '../services/auditService';
 *
 *   await createAuditLog({
 *       action: 'CREATE',
 *       module: 'Students',
 *       description: 'Created student account for John Doe',
 *       targetType: 'student',
 *       targetId: '123',
 *       targetName: 'John Doe',
 *   });
 */

import { supabase } from '../lib/supabaseClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditAction =
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'LOGIN'
    | 'LOGOUT'
    | 'LOGIN_FAILED'
    | 'APPROVE'
    | 'REJECT'
    | 'SUBMIT'
    | 'ASSIGN'
    | 'UNASSIGN'
    | 'PASSWORD_CHANGE'
    | 'PASSWORD_RESET'
    | 'ROLE_CHANGE'
    | 'PERMISSION_CHANGE'
    | 'STATUS_CHANGE'
    | 'UPLOAD'
    | 'DOWNLOAD'
    | 'BACKUP'
    | 'RESTORE';

export type AuditModule =
    | 'User Management'
    | 'Role Permissions'
    | 'Students'
    | 'Companies'
    | 'Attendance'
    | 'Timesheets'
    | 'Journals'
    | 'Evaluations'
    | 'Documents'
    | 'Approvals'
    | 'Announcements'
    | 'Departments'
    | 'Courses'
    | 'Backup & Restore'
    | 'System Settings'
    | 'Security'
    | 'Authentication';

export interface AuditLogEntry {
    id: string;
    user_id: string | null;
    user_name: string | null;
    user_role: string | null;
    action: string;
    module: string | null;
    description: string | null;
    target_type: string | null;
    target_id: string | null;
    target_name: string | null;
    old_values: Record<string, any> | null;
    new_values: Record<string, any> | null;
    ip_address: string | null;
    user_agent: string | null;
    status: string;
    created_at: string;
    total_count?: number;
}

export interface AuditLogFilters {
    search?: string;
    action?: string;
    module?: string;
    userId?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
}

export interface AuditLogUser {
    user_id: string;
    user_name: string;
    user_role: string;
}

export interface AuditLogStats {
    totalLogs: number;
    totalSuccess: number;
    totalFailed: number;
    recent24h: number;
}

// ---------------------------------------------------------------------------
// Sensitive field scrubbing
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
    'password', 'new_password', 'old_password', 'confirm_password',
    'token', 'access_token', 'refresh_token', 'session_token',
    'secret', 'api_key', 'apikey', 'api_secret',
    'authorization', 'cookie', 'set-cookie',
]);

function scrubSensitiveData(obj: Record<string, any> | null | undefined): Record<string, any> | null {
    if (!obj) return null;

    const scrubbed: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.has(key.toLowerCase())) {
            scrubbed[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            scrubbed[key] = scrubSensitiveData(value);
        } else {
            scrubbed[key] = value;
        }
    }
    return scrubbed;
}

// ---------------------------------------------------------------------------
// IP address caching (one fetch per session)
// ---------------------------------------------------------------------------

let cachedIp: string | null = null;

async function getClientIp(): Promise<string | null> {
    if (cachedIp) return cachedIp;
    try {
        const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        cachedIp = data.ip || null;
        return cachedIp;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// User info caching (per session)
// ---------------------------------------------------------------------------

interface CachedUserInfo {
    userId: string;
    userName: string;
    userRole: string;
}

let cachedUserInfo: CachedUserInfo | null = null;

async function getCurrentUserInfo(): Promise<CachedUserInfo | null> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return null;

        const userId = session.user.id;

        // Return cache if same user
        if (cachedUserInfo && cachedUserInfo.userId === userId) {
            return cachedUserInfo;
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name, account_type')
            .eq('auth_user_id', userId)
            .single();

        if (profile) {
            cachedUserInfo = {
                userId,
                userName: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown',
                userRole: profile.account_type || 'unknown',
            };
        } else {
            cachedUserInfo = {
                userId,
                userName: session.user.email || 'Unknown',
                userRole: 'unknown',
            };
        }

        return cachedUserInfo;
    } catch {
        return null;
    }
}

/** Clear the cached user info (call on logout) */
export function clearAuditUserCache(): void {
    cachedUserInfo = null;
    cachedIp = null;
}

// ---------------------------------------------------------------------------
// Core: createAuditLog
// ---------------------------------------------------------------------------

export async function createAuditLog(params: {
    action: AuditAction;
    module: AuditModule;
    description: string;
    targetType?: string;
    targetId?: string;
    targetName?: string;
    oldValues?: Record<string, any> | null;
    newValues?: Record<string, any> | null;
    status?: 'success' | 'failed';
    /** Override user info (for login/failed login when session may not exist yet) */
    overrideUser?: { userId: string; userName: string; userRole: string };
}): Promise<void> {
    try {
        const userInfo = params.overrideUser || await getCurrentUserInfo();

        // Fire IP fetch in parallel (non-blocking)
        const ipPromise = getClientIp();

        const ip = await ipPromise;

        const row = {
            user_id: userInfo?.userId || null,
            user_name: userInfo?.userName || null,
            user_role: userInfo?.userRole || null,
            action: params.action,
            module: params.module,
            description: params.description,
            target_type: params.targetType || null,
            target_id: params.targetId || null,
            target_name: params.targetName || null,
            old_values: scrubSensitiveData(params.oldValues),
            new_values: scrubSensitiveData(params.newValues),
            ip_address: ip,
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            status: params.status || 'success',
        };

        const { error } = await supabase.from('audit_logs').insert([row]);

        if (error) {
            console.error('[AuditService] Failed to insert audit log:', error);
        }
    } catch (e) {
        // Audit logging must NEVER break the primary action
        console.error('[AuditService] Error creating audit log:', e);
    }
}

// ---------------------------------------------------------------------------
// Fallback direct query helper
// ---------------------------------------------------------------------------

async function getAuditLogsDirect(
    filters: AuditLogFilters,
    page: number,
    pageSize: number
): Promise<{ logs: AuditLogEntry[]; totalCount: number }> {
    try {
        let query = supabase
            .from('audit_logs')
            .select('*', { count: 'exact' });

        if (filters.action) query = query.eq('action', filters.action);
        if (filters.module) query = query.eq('module', filters.module);
        if (filters.userId) query = query.eq('user_id', filters.userId);
        if (filters.status) query = query.eq('status', filters.status);
        if (filters.dateFrom) query = query.gte('created_at', new Date(filters.dateFrom).toISOString());
        if (filters.dateTo) query = query.lte('created_at', new Date(filters.dateTo + 'T23:59:59').toISOString());

        if (filters.search) {
            const term = `%${filters.search}%`;
            query = query.or(`user_name.ilike.${term},description.ilike.${term},target_name.ilike.${term},target_id.ilike.${term}`);
        }

        const offset = (page - 1) * pageSize;
        const { data, count, error } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + pageSize - 1);

        if (error) throw error;

        return {
            logs: (data || []) as AuditLogEntry[],
            totalCount: count || 0,
        };
    } catch (err) {
        console.error('[AuditService] Direct query fallback failed:', err);
        return { logs: [], totalCount: 0 };
    }
}

// ---------------------------------------------------------------------------
// Query: getAuditLogsPaginated
// ---------------------------------------------------------------------------

export async function getAuditLogsPaginated(
    filters: AuditLogFilters = {},
    page: number = 1,
    pageSize: number = 25
): Promise<{ logs: AuditLogEntry[]; totalCount: number }> {
    const offset = (page - 1) * pageSize;

    const { data, error } = await supabase.rpc('get_audit_logs_paginated', {
        p_search: filters.search || null,
        p_action: filters.action || null,
        p_module: filters.module || null,
        p_user_id: filters.userId || null,
        p_status: filters.status || null,
        p_date_from: filters.dateFrom ? new Date(filters.dateFrom).toISOString() : null,
        p_date_to: filters.dateTo ? new Date(filters.dateTo + 'T23:59:59').toISOString() : null,
        p_limit: pageSize,
        p_offset: offset,
    });

    if (error) {
        // Fall back gracefully to direct table querying
        return await getAuditLogsDirect(filters, page, pageSize);
    }

    const logs = (data || []) as AuditLogEntry[];
    const totalCount = logs.length > 0 ? Number(logs[0].total_count) || 0 : 0;

    return { logs, totalCount };
}

// ---------------------------------------------------------------------------
// Query: getAuditLogById
// ---------------------------------------------------------------------------

export async function getAuditLogById(id: string): Promise<AuditLogEntry | null> {
    const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('[AuditService] Error fetching audit log by id:', error);
        return null;
    }

    return data as AuditLogEntry;
}

// ---------------------------------------------------------------------------
// Query: getAuditLogUsers (for filter dropdown)
// ---------------------------------------------------------------------------

export async function getAuditLogUsers(): Promise<AuditLogUser[]> {
    const { data, error } = await supabase.rpc('get_audit_log_users');

    if (error) {
        // Fallback: direct select
        try {
            const { data: directData } = await supabase
                .from('audit_logs')
                .select('user_id, user_name, user_role')
                .not('user_id', 'is', null)
                .not('user_name', 'is', null)
                .order('created_at', { ascending: false })
                .limit(200);

            if (!directData) return [];
            const map = new Map<string, AuditLogUser>();
            for (const r of directData) {
                if (r.user_id && !map.has(r.user_id)) {
                    map.set(r.user_id, {
                        user_id: r.user_id,
                        user_name: r.user_name || 'Unknown',
                        user_role: r.user_role || 'user',
                    });
                }
            }
            return Array.from(map.values());
        } catch {
            return [];
        }
    }

    return (data || []) as AuditLogUser[];
}

// ---------------------------------------------------------------------------
// Query: getAuditLogStats
// ---------------------------------------------------------------------------

export async function getAuditLogStats(): Promise<AuditLogStats> {
    try {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

        const [totalRes, failedRes, recentRes] = await Promise.all([
            supabase.from('audit_logs').select('id', { count: 'exact', head: true }),
            supabase.from('audit_logs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
            supabase.from('audit_logs').select('id', { count: 'exact', head: true }).gte('created_at', yesterday),
        ]);

        const totalLogs = totalRes.count || 0;
        const totalFailed = failedRes.count || 0;
        const recent24h = recentRes.count || 0;
        const totalSuccess = Math.max(0, totalLogs - totalFailed);

        return {
            totalLogs,
            totalSuccess,
            totalFailed,
            recent24h,
        };
    } catch (e) {
        console.error('[AuditService] Error getting audit stats:', e);
        return {
            totalLogs: 0,
            totalSuccess: 0,
            totalFailed: 0,
            recent24h: 0,
        };
    }
}

// ---------------------------------------------------------------------------
// Export Helpers
// ---------------------------------------------------------------------------

export async function exportAuditLogs(
    filters: AuditLogFilters = {},
    format: 'csv' | 'json' = 'csv'
): Promise<string> {
    // Fetch up to 10,000 matching rows
    let query = supabase.from('audit_logs').select('*');

    if (filters.action) query = query.eq('action', filters.action);
    if (filters.module) query = query.eq('module', filters.module);
    if (filters.userId) query = query.eq('user_id', filters.userId);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.dateFrom) query = query.gte('created_at', new Date(filters.dateFrom).toISOString());
    if (filters.dateTo) query = query.lte('created_at', new Date(filters.dateTo + 'T23:59:59').toISOString());

    if (filters.search) {
        const term = `%${filters.search}%`;
        query = query.or(`user_name.ilike.${term},description.ilike.${term},target_name.ilike.${term},target_id.ilike.${term}`);
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(10000);

    if (error) {
        throw new Error(`Failed to export audit logs: ${error.message}`);
    }

    const rows = (data || []) as AuditLogEntry[];

    if (format === 'json') {
        return JSON.stringify(rows, null, 2);
    }

    // CSV format
    const headers = [
        'Timestamp',
        'User Name',
        'User Role',
        'Action',
        'Module',
        'Description',
        'Target Name',
        'Target ID',
        'Status',
        'IP Address',
        'User Agent',
    ];

    const escapeCsv = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    };

    const csvRows = [
        headers.join(','),
        ...rows.map(r => [
            escapeCsv(r.created_at),
            escapeCsv(r.user_name),
            escapeCsv(r.user_role),
            escapeCsv(r.action),
            escapeCsv(r.module),
            escapeCsv(r.description),
            escapeCsv(r.target_name),
            escapeCsv(r.target_id),
            escapeCsv(r.status),
            escapeCsv(r.ip_address),
            escapeCsv(r.user_agent),
        ].join(',')),
    ];

    return csvRows.join('\r\n');
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Constants for UI
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS: { value: AuditAction; label: string }[] = [
    { value: 'CREATE', label: 'Create' },
    { value: 'UPDATE', label: 'Update' },
    { value: 'DELETE', label: 'Delete' },
    { value: 'LOGIN', label: 'Login' },
    { value: 'LOGOUT', label: 'Logout' },
    { value: 'LOGIN_FAILED', label: 'Failed Login' },
    { value: 'APPROVE', label: 'Approve' },
    { value: 'REJECT', label: 'Reject' },
    { value: 'SUBMIT', label: 'Submit' },
    { value: 'ASSIGN', label: 'Assign' },
    { value: 'UNASSIGN', label: 'Unassign' },
    { value: 'PASSWORD_CHANGE', label: 'Password Change' },
    { value: 'PASSWORD_RESET', label: 'Password Reset' },
    { value: 'ROLE_CHANGE', label: 'Role Change' },
    { value: 'PERMISSION_CHANGE', label: 'Permission Change' },
    { value: 'STATUS_CHANGE', label: 'Status Change' },
    { value: 'UPLOAD', label: 'Upload' },
    { value: 'DOWNLOAD', label: 'Download' },
    { value: 'BACKUP', label: 'Backup' },
    { value: 'RESTORE', label: 'Restore' },
];

export const AUDIT_MODULES: { value: AuditModule; label: string }[] = [
    { value: 'Authentication', label: 'Authentication' },
    { value: 'User Management', label: 'User Management' },
    { value: 'Role Permissions', label: 'Role Permissions' },
    { value: 'Students', label: 'Students' },
    { value: 'Companies', label: 'Companies' },
    { value: 'Attendance', label: 'Attendance' },
    { value: 'Timesheets', label: 'Timesheets' },
    { value: 'Journals', label: 'Journals' },
    { value: 'Evaluations', label: 'Evaluations' },
    { value: 'Documents', label: 'Documents' },
    { value: 'Approvals', label: 'Approvals' },
    { value: 'Announcements', label: 'Announcements' },
    { value: 'Departments', label: 'Departments' },
    { value: 'Courses', label: 'Courses' },
    { value: 'Backup & Restore', label: 'Backup & Restore' },
    { value: 'System Settings', label: 'System Settings' },
    { value: 'Security', label: 'Security' },
];
