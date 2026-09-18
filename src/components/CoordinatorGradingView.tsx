import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    gradingService,
    type GradingSheet,
    type GradingSheetSummary,
} from '../services/gradingService';
import {
    STATUS_LABELS,
    canFinalize,
    canReopen,
    canReturn,
    canVerify,
    formatGrade,
    formatTerm,
    type GradingSheetStatus,
} from '../utils/grading';
import GradingSheetPreviewModal from './GradingSheetPreviewModal';
import GradeHistoryModal from './GradeHistoryModal';
import { TableSkeleton } from './Skeletons';
import './CoordinatorDashboard.css';
import './GradingSheet.css';

type Filter = 'draft' | 'for_review' | 'verified' | 'finalized' | 'all';

const COORDINATOR_FILTERS: Array<{ id: Filter; label: string }> = [
    { id: 'for_review', label: 'For Review' },
    { id: 'verified', label: 'Verified' },
    { id: 'finalized', label: 'Finalized' },
    { id: 'all', label: 'All' },
];

// Admins see the whole catalogue, drafts included.
const ADMIN_FILTERS: Array<{ id: Filter; label: string }> = [
    { id: 'draft', label: 'Draft' },
    { id: 'for_review', label: 'For Review' },
    { id: 'verified', label: 'Verified' },
    { id: 'finalized', label: 'Finalized' },
    { id: 'all', label: 'All' },
];

const statusTone = (status: GradingSheetStatus): string =>
    status === 'finalized' ? 'is-final'
        : status === 'verified' ? 'is-verified'
            : status === 'for_review' ? 'is-review'
                : 'is-draft';

/**
 * The Coordinator's grading-sheet verification queue — and, in `mode="admin"`,
 * the administrator's view of every sheet.
 *
 * For a coordinator a sheet appears only once the adviser has submitted it — a
 * draft is the adviser's working copy and `get_coordinator_grading_sheets`
 * never returns one. The coordinator reviews the roster, then verifies, returns
 * for correction with a reason, or finalizes a verified sheet.
 *
 * In admin mode the list is loaded from `get_admin_grading_sheets` (drafts
 * included), flags sheets whose adviser is unavailable or that have been
 * reopened, and adds the audited Reopen override on a finalized sheet. Verify,
 * return and finalize stay available because the RPCs already admit admins.
 */
interface Props {
    mode?: 'coordinator' | 'admin';
}

const CoordinatorGradingView: React.FC<Props> = ({ mode = 'coordinator' }) => {
    const isAdmin = mode === 'admin';
    const filters = isAdmin ? ADMIN_FILTERS : COORDINATOR_FILTERS;

    const [filter, setFilter] = useState<Filter>(isAdmin ? 'all' : 'for_review');
    const [rows, setRows] = useState<GradingSheetSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

    const [openSheet, setOpenSheet] = useState<GradingSheet | null>(null);
    const [loadingSheet, setLoadingSheet] = useState<string | null>(null);
    const [preview, setPreview] = useState<GradingSheet | null>(null);
    const [historyFor, setHistoryFor] = useState<{ sheetId: string; subject: string } | null>(null);
    const [returning, setReturning] = useState<GradingSheetSummary | null>(null);
    const [returnReason, setReturnReason] = useState('');
    const [reopening, setReopening] = useState<GradingSheetSummary | null>(null);
    const [reopenReason, setReopenReason] = useState('');
    const [acting, setActing] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const status = filter === 'all' ? 'all' : filter;
            setRows(isAdmin
                ? await gradingService.getAdminSheets(status)
                : await gradingService.getCoordinatorSheets(status));
        } catch (err) {
            console.error('Failed to load grading sheets:', err);
            setError(err instanceof Error ? err.message : 'Grading sheets could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [filter, isAdmin]);

    useEffect(() => { load(); }, [load]);

    const fetchSheet = async (row: GradingSheetSummary, then: (sheet: GradingSheet) => void) => {
        setLoadingSheet(row.id);
        setBanner(null);
        try {
            then(await gradingService.getSheet(row.id));
        } catch (err) {
            console.error('Failed to load the grading sheet:', err);
            setBanner({ tone: 'error', text: err instanceof Error ? err.message : 'The grading sheet could not be opened.' });
        } finally {
            setLoadingSheet(null);
        }
    };

    const act = async (row: GradingSheetSummary, action: 'verify' | 'finalize') => {
        setActing(true);
        setBanner(null);
        try {
            if (action === 'verify') await gradingService.verify(row.id);
            else await gradingService.finalize(row.id);

            setBanner({
                tone: 'ok',
                text: action === 'verify'
                    ? `${row.section_name} verified. The adviser has been notified.`
                    : `${row.section_name} finalized. The sheet is now a closed academic record.`,
            });
            setOpenSheet(null);
            await load();
        } catch (err) {
            console.error(`Failed to ${action} the grading sheet:`, err);
            setBanner({ tone: 'error', text: err instanceof Error ? err.message : `The grading sheet could not be ${action === 'verify' ? 'verified' : 'finalized'}.` });
            // The refusal usually means the row moved — the adviser withdrew it,
            // or another coordinator got there first. Re-read rather than leave
            // a row on screen that no longer exists in that state.
            await load();
        } finally {
            setActing(false);
        }
    };

    const submitReturn = async () => {
        if (!returning || !returnReason.trim()) return;
        setActing(true);
        setBanner(null);
        try {
            await gradingService.returnForCorrection(returning.id, returnReason.trim());
            setBanner({
                tone: 'ok',
                text: `${returning.section_name} returned to the adviser for correction.`,
            });
            setReturning(null);
            setReturnReason('');
            setOpenSheet(null);
            await load();
        } catch (err) {
            console.error('Failed to return the grading sheet:', err);
            setBanner({ tone: 'error', text: err instanceof Error ? err.message : 'The grading sheet could not be returned.' });
        } finally {
            setActing(false);
        }
    };

    const submitReopen = async () => {
        if (!reopening || !reopenReason.trim()) return;
        setActing(true);
        setBanner(null);
        try {
            await gradingService.reopen(reopening.id, reopenReason.trim());
            setBanner({
                tone: 'ok',
                text: `${reopening.section_name} reopened. The adviser and coordinators have been notified.`,
            });
            setReopening(null);
            setReopenReason('');
            setOpenSheet(null);
            await load();
        } catch (err) {
            console.error('Failed to reopen the grading sheet:', err);
            setBanner({ tone: 'error', text: err instanceof Error ? err.message : 'The grading sheet could not be reopened.' });
            await load();
        } finally {
            setActing(false);
        }
    };

    const adviserUnavailable = (row: GradingSheetSummary): boolean =>
        row.adviser_active === false || row.adviser_holds_section === false;

    const counts = useMemo(() => ({
        review: rows.filter(r => r.status === 'for_review').length,
    }), [rows]);

    return (
        // `gs-scope` carries the grading module's design tokens (see
        // GradingSheet.css). Every `gs-` class below, and the review modal, sits
        // inside it, so the Coordinator's copy of this module stays typographically
        // identical to the Adviser's.
        <div className="fade-in gs-scope">
            <div className="gs-view-head">
                <div>
                    <div className="gs-view-title">Official Grading Sheets</div>
                    <div className="gs-view-sub">
                        {isAdmin
                            ? 'Every grading sheet across all departments, drafts included. Verify, return or finalize as needed, or reopen a finalized sheet for correction.'
                            : 'Review and verify the grading sheets your advisers submit. A sheet stays editable for the adviser only while it is a draft.'}
                    </div>
                </div>
                <div className="gs-filter-row">
                    {filters.map(f => (
                        <button
                            key={f.id}
                            className={`gs-filter${filter === f.id ? ' is-active' : ''}`}
                            onClick={() => setFilter(f.id)}
                        >
                            {f.label}
                            {f.id === 'for_review' && counts.review > 0 && filter === 'for_review' && (
                                <span className="gs-filter-count">{counts.review}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {banner && (
                <div className={`gs-alert ${banner.tone === 'ok' ? 'gs-alert-ok' : 'gs-alert-danger'}`}>
                    {banner.text}
                </div>
            )}

            {loading ? (
                <div className="admin-table-card"><TableSkeleton rows={4} cols={6} /></div>
            ) : error ? (
                <div className="admin-table-card gs-center-card">
                    <h3>Could not load grading sheets</h3>
                    <p>{error}</p>
                    <button className="cd-btn cd-btn-primary" onClick={load}>Try Again</button>
                </div>
            ) : rows.length === 0 ? (
                <div className="admin-table-card gs-center-card">
                    <h3>Nothing to review</h3>
                    <p>
                        {filter === 'for_review'
                            ? 'No adviser has submitted a grading sheet for verification.'
                            : 'There are no grading sheets with this status.'}
                    </p>
                </div>
            ) : (
                <div className="admin-table-card gs-table-card">
                    <div className="gs-table-scroll">
                        <table className="admin-table gs-list-table">
                            <thead>
                                <tr>
                                    <th>Section</th>
                                    <th>Adviser</th>
                                    <th>Term</th>
                                    <th className="gs-num">Students</th>
                                    <th>Status</th>
                                    <th className="gs-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(row => (
                                    <tr key={row.id}>
                                        <td>
                                            <div className="gs-strong">{row.section_name}</div>
                                            <div className="gs-muted">{row.course_code}</div>
                                        </td>
                                        <td>
                                            <div>{row.adviser_name?.trim() || <span className="gs-muted">Unassigned</span>}</div>
                                            {isAdmin && adviserUnavailable(row) && (
                                                <span className="gs-flag-pill is-warn">Adviser unavailable</span>
                                            )}
                                            {isAdmin && row.reopened_at && (
                                                <span className="gs-flag-pill is-reopened">Reopened</span>
                                            )}
                                        </td>
                                        <td>{formatTerm(row.school_year, row.semester)}</td>
                                        <td className="gs-num">{row.graded_count} / {row.student_count}</td>
                                        <td>
                                            <span className={`gs-status ${statusTone(row.status)}`}>
                                                {STATUS_LABELS[row.status]}
                                            </span>
                                        </td>
                                        <td className="gs-right">
                                            <div className="gs-row-actions">
                                                <button
                                                    className="cd-btn cd-btn-outline gs-btn-sm"
                                                    onClick={() => fetchSheet(row, setOpenSheet)}
                                                    disabled={loadingSheet === row.id}
                                                >
                                                    {loadingSheet === row.id ? 'Opening…' : 'Review'}
                                                </button>
                                                <button
                                                    className="cd-btn cd-btn-outline gs-btn-sm"
                                                    onClick={() => fetchSheet(row, setPreview)}
                                                    disabled={loadingSheet === row.id}
                                                >
                                                    Preview
                                                </button>
                                                {isAdmin && canReopen(row.status) && (
                                                    <button
                                                        className="cd-btn cd-btn-outline gs-btn-sm gs-btn-danger"
                                                        onClick={() => { setReopening(row); setReopenReason(''); }}
                                                        disabled={acting}
                                                    >
                                                        Reopen
                                                    </button>
                                                )}
                                                <button
                                                    className="gs-link-btn"
                                                    onClick={() => setHistoryFor({ sheetId: row.id, subject: `${row.section_name} · all changes` })}
                                                >
                                                    History
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Review panel: the roster exactly as submitted ── */}
            {openSheet && (
                <div className="gs-modal-backdrop" role="dialog" aria-modal="true" aria-label="Review grading sheet">
                    <div className="gs-modal gs-modal-wide">
                        <div className="gs-modal-head">
                            <div>
                                <div className="gs-modal-title">{openSheet.section.name} · Grading Sheet</div>
                                <div className="gs-modal-sub">
                                    {openSheet.adviser.name || 'Unassigned adviser'} ·{' '}
                                    {formatTerm(openSheet.school_year.school_year, openSheet.school_year.semester)} ·
                                    Passing mark {formatGrade(openSheet.passing_grade)}
                                </div>
                            </div>
                            <button className="gs-icon-btn" onClick={() => setOpenSheet(null)} aria-label="Close">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>

                        <div className="gs-modal-body gs-modal-body-table">
                            <table className="admin-table gs-grade-table">
                                <thead>
                                    <tr>
                                        <th className="gs-c-index">#</th>
                                        <th className="gs-c-sno">Student No.</th>
                                        <th>Student Name</th>
                                        <th className="gs-c-grade">Final Grade</th>
                                        <th className="gs-c-remark">Remarks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {openSheet.items.map((item, index) => (
                                        <tr key={item.id}>
                                            <td className="gs-c-index gs-muted">{index + 1}</td>
                                            <td className="gs-c-sno">{item.student_number || <span className="gs-muted">Not set</span>}</td>
                                            <td className="gs-strong">{item.student_name || '—'}</td>
                                            <td className="gs-c-grade">
                                                <span className="gs-grade-static">{formatGrade(item.final_grade) || '—'}</span>
                                            </td>
                                            <td className="gs-c-remark">
                                                {item.remarks ? (
                                                    <span className={`gs-remark ${item.remarks === 'PASSED' ? 'is-pass' : 'is-fail'}`}>
                                                        {item.remarks}
                                                    </span>
                                                ) : <span className="gs-muted">—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="gs-modal-foot gs-modal-foot-split">
                            <button className="cd-btn cd-btn-outline" onClick={() => setPreview(openSheet)}>
                                Preview Official Sheet
                            </button>
                            <div className="gs-row-actions">
                                {canReturn(openSheet.status) && (
                                    <button
                                        className="cd-btn cd-btn-outline gs-btn-danger"
                                        onClick={() => {
                                            const row = rows.find(r => r.id === openSheet.id);
                                            if (row) setReturning(row);
                                        }}
                                        disabled={acting}
                                    >
                                        Return for Correction
                                    </button>
                                )}
                                {canVerify(openSheet.status) && (
                                    <button
                                        className="cd-btn cd-btn-primary"
                                        onClick={() => {
                                            const row = rows.find(r => r.id === openSheet.id);
                                            if (row) act(row, 'verify');
                                        }}
                                        disabled={acting}
                                    >
                                        {acting ? 'Working…' : 'Verify Grading Sheet'}
                                    </button>
                                )}
                                {canFinalize(openSheet.status) && (
                                    <button
                                        className="cd-btn cd-btn-primary"
                                        onClick={() => {
                                            const row = rows.find(r => r.id === openSheet.id);
                                            if (row) act(row, 'finalize');
                                        }}
                                        disabled={acting}
                                    >
                                        {acting ? 'Working…' : 'Finalize'}
                                    </button>
                                )}
                                {isAdmin && canReopen(openSheet.status) && (
                                    <button
                                        className="cd-btn cd-btn-outline gs-btn-danger"
                                        onClick={() => {
                                            const row = rows.find(r => r.id === openSheet.id);
                                            if (row) { setReopening(row); setReopenReason(''); }
                                        }}
                                        disabled={acting}
                                    >
                                        Reopen for Correction
                                    </button>
                                )}
                                <button className="cd-btn cd-btn-outline" onClick={() => setOpenSheet(null)}>Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Return for correction ── */}
            {returning && (
                <div className="gs-modal-backdrop" role="dialog" aria-modal="true">
                    <div className="gs-modal">
                        <div className="gs-modal-head">
                            <div>
                                <div className="gs-modal-title">Return for Correction</div>
                                <div className="gs-modal-sub">{returning.section_name}</div>
                            </div>
                        </div>
                        <div className="gs-modal-body">
                            <label className="gs-field-label" htmlFor="gs-return-reason">
                                Reason — this is sent to the adviser
                            </label>
                            <textarea
                                id="gs-return-reason"
                                className="gs-textarea"
                                rows={4}
                                value={returnReason}
                                onChange={e => setReturnReason(e.target.value)}
                                placeholder="e.g. Please review the grades of students #8 and #14."
                            />
                            <p className="gs-modal-warning">
                                The grading sheet becomes editable again and the adviser is notified.
                            </p>
                        </div>
                        <div className="gs-modal-foot">
                            <button
                                className="cd-btn cd-btn-outline"
                                onClick={() => { setReturning(null); setReturnReason(''); }}
                            >
                                Cancel
                            </button>
                            <button
                                className="cd-btn cd-btn-primary"
                                onClick={submitReturn}
                                disabled={acting || returnReason.trim().length === 0}
                            >
                                {acting ? 'Returning…' : 'Return to Adviser'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Reopen a finalized sheet (administrator override) ── */}
            {reopening && (
                <div className="gs-modal-backdrop" role="dialog" aria-modal="true">
                    <div className="gs-modal">
                        <div className="gs-modal-head">
                            <div>
                                <div className="gs-modal-title">Reopen Grading Sheet</div>
                                <div className="gs-modal-sub">{reopening.section_name}</div>
                            </div>
                        </div>
                        <div className="gs-modal-body">
                            <p className="gs-modal-warning" style={{ marginTop: 0 }}>
                                <strong>Administrator override.</strong> This returns a finalized, closed
                                academic record to draft so its adviser can correct and resubmit it. The
                                adviser and the department coordinators are notified.
                            </p>
                            <label className="gs-field-label" htmlFor="gs-reopen-reason">
                                Reason for override — this is sent to the adviser
                            </label>
                            <textarea
                                id="gs-reopen-reason"
                                className="gs-textarea"
                                rows={4}
                                value={reopenReason}
                                onChange={e => setReopenReason(e.target.value)}
                                placeholder="e.g. The registrar flagged an incorrect final grade for student #12."
                            />
                        </div>
                        <div className="gs-modal-foot">
                            <button
                                className="cd-btn cd-btn-outline"
                                onClick={() => { setReopening(null); setReopenReason(''); }}
                                disabled={acting}
                            >
                                Cancel
                            </button>
                            <button
                                className="cd-btn cd-btn-primary gs-btn-danger"
                                onClick={submitReopen}
                                disabled={acting || reopenReason.trim().length === 0}
                            >
                                {acting ? 'Reopening…' : 'Reopen for Correction'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {preview && (
                <GradingSheetPreviewModal sheet={preview} onClose={() => setPreview(null)} />
            )}

            {historyFor && (
                <GradeHistoryModal
                    sheetId={historyFor.sheetId}
                    subject={historyFor.subject}
                    onClose={() => setHistoryFor(null)}
                />
            )}
        </div>
    );
};

export default CoordinatorGradingView;
