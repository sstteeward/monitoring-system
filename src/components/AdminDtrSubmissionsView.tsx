import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    dtrSubmissionService,
    type AdminDtrFilter,
    type AdminDtrSubmissionRow,
} from '../services/dtrSubmissionService';
import { formatDtrHours, formatDtrPeriod } from '../utils/dtrFormat';
import DtrStatusBadge from './DtrStatusBadge';
import AdviserDtrReviewModal from './AdviserDtrReviewModal';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import { TableSkeleton } from './Skeletons';
import './DtrSubmission.css';

/**
 * Administrator DTR force-control list.
 *
 * The admin sees every submission across all advisers, ordered so the ones that
 * need attention — a pending DTR whose reviewer is missing, deactivated, or no
 * longer the student's section adviser — surface first. Opening a row launches
 * the shared review modal in admin mode, where the audited overrides live.
 *
 * This is a read-and-launch screen: it never writes. Every mutation goes through
 * the admin RPCs behind AdviserDtrReviewModal.
 */

const FILTERS: { id: AdminDtrFilter; label: string }[] = [
    { id: 'needs_attention', label: 'Needs Attention' },
    { id: 'pending', label: 'Pending' },
    { id: 'revision_requested', label: 'Revision Required' },
    { id: 'approved', label: 'Approved' },
    { id: 'all', label: 'All' },
];

const stampDate = (v: string | null) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

const AdminDtrSubmissionsView: React.FC = () => {
    const [rows, setRows] = useState<AdminDtrSubmissionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<AdminDtrFilter>('needs_attention');
    const [search, setSearch] = useState('');
    const [naCount, setNaCount] = useState(0);
    const [reviewingId, setReviewingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [data, na] = await Promise.all([
                dtrSubmissionService.listForAdmin(filter),
                dtrSubmissionService.needsAttentionCount(),
            ]);
            setRows(data);
            setNaCount(na);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to load DTR submissions.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(r =>
            (r.student_name || '').toLowerCase().includes(q)
            || (r.student_email || '').toLowerCase().includes(q));
    }, [rows, search]);

    const { paginatedItems, currentPage, setCurrentPage, totalPages, totalItems, itemsPerPage } =
        usePagination(filtered, 12);

    const handleReviewed = () => {
        setReviewingId(null);
        load();
    };

    return (
        <div className="dtr-admin-view">
            <div className="dtr-filter-bar">
                <span className="dtr-filter-label">Show</span>
                {FILTERS.map(f => (
                    <button
                        key={f.id}
                        type="button"
                        className={`dtr-filter-chip${filter === f.id ? ' is-active' : ''}`}
                        onClick={() => { setFilter(f.id); setCurrentPage(1); }}
                    >
                        {f.label}
                        {f.id === 'needs_attention' && naCount > 0 && (
                            <span className="dtr-chip-count">{naCount}</span>
                        )}
                    </button>
                ))}
                <input
                    type="search"
                    className="dtr-search"
                    placeholder="Search student name or email…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                    aria-label="Search DTR submissions"
                />
            </div>

            {error && <div className="dtr-error" role="alert">{error}</div>}

            {loading ? (
                <TableSkeleton rows={6} />
            ) : paginatedItems.length === 0 ? (
                <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {filter === 'needs_attention'
                        ? 'No submissions need an administrator right now. Orphaned or misassigned pending DTRs will appear here.'
                        : 'No DTR submissions match this filter.'}
                </div>
            ) : (
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Section</th>
                            <th>Company</th>
                            <th>SIL Period</th>
                            <th style={{ textAlign: 'right' }}>Hours</th>
                            <th>Reviewer</th>
                            <th>Status</th>
                            <th>Submitted</th>
                            <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedItems.map(s => (
                            <tr key={s.id} className={s.needs_attention ? 'dtr-row-flagged' : ''}>
                                <td>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.student_name || '—'}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.student_email || ''}</div>
                                </td>
                                <td>{s.section_name || '—'}</td>
                                <td>{s.company_name || 'No company'}</td>
                                <td>{formatDtrPeriod(s.period_start, s.period_end)}</td>
                                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                    <div style={{ fontWeight: 600 }}>{formatDtrHours(s.total_minutes)}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>of {s.required_hours}h</div>
                                </td>
                                <td>
                                    {s.needs_attention
                                        ? <span className="dtr-flag is-bad">No active reviewer</span>
                                        : (s.adviser_name || <span className="dtr-muted">—</span>)}
                                </td>
                                <td><DtrStatusBadge status={s.status} /></td>
                                <td>{stampDate(s.submitted_at)}</td>
                                <td style={{ textAlign: 'right' }}>
                                    <button
                                        type="button"
                                        className="approval-action-btn approval-btn-approve"
                                        onClick={() => setReviewingId(s.id)}
                                    >
                                        View
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <div style={{ padding: '1rem' }}>
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    itemName="submissions"
                />
            </div>

            {reviewingId && (
                <AdviserDtrReviewModal
                    submissionId={reviewingId}
                    mode="admin"
                    onClose={() => setReviewingId(null)}
                    onReviewed={handleReviewed}
                />
            )}
        </div>
    );
};

export default AdminDtrSubmissionsView;
