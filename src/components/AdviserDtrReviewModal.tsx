import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    dtrSubmissionService,
    type DtrStatus,
    type DtrSubmissionDetail,
} from '../services/dtrSubmissionService';
import { adviserService } from '../services/adviserService';
import { DTR_EVENT_LABEL, formatDtrHours, formatDtrPeriod } from '../utils/dtrFormat';
import DtrStatusBadge from './DtrStatusBadge';
import './DtrSubmission.css';

/**
 * The complete DTR review screen.
 *
 * The adviser reviews ONE submitted Daily Time Record — student details, the
 * summary, every attendance day it contains — and then approves it or sends it
 * back with remarks. There is no per-day approval here by design.
 *
 * What is shown is the SNAPSHOT the student submitted, not a fresh computation,
 * so the adviser always decides on the record as it was sent.
 */

type IconProps = { size?: number };
const Svg: React.FC<IconProps & { children: React.ReactNode }> = ({ size = 16, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IconClose: React.FC<IconProps> = p => (<Svg {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>);
const IconCheck: React.FC<IconProps> = p => (<Svg {...p}><polyline points="20 6 9 17 4 12" /></Svg>);
const IconWarn: React.FC<IconProps> = p => (
    <Svg {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Svg>
);

const clock = (v: string | null) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
const dayLabel = (v: string) => {
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const stamp = (v: string | null) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
};

interface Props {
    submissionId: string;
    onClose: () => void;
    onReviewed: (action: 'approve' | 'request_revision') => void;
}

const AdviserDtrReviewModal: React.FC<Props> = ({ submissionId, onClose, onReviewed }) => {
    const [detail, setDetail] = useState<DtrSubmissionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<'approve' | 'request_revision' | null>(null);
    const [remarks, setRemarks] = useState('');
    const [saving, setSaving] = useState(false);

    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await dtrSubmissionService.get(submissionId);
            if (mounted.current) setDetail(data);
        } catch (err) {
            if (mounted.current) setError(err instanceof Error ? err.message : 'Unable to load this DTR.');
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, [submissionId]);

    useEffect(() => { load(); }, [load]);

    // Escape closes the review, but never out from under a confirmation.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (confirm) setConfirm(null); else onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [confirm, onClose]);

    const submitReview = async () => {
        if (!confirm) return;
        if (confirm === 'request_revision' && !remarks.trim()) return;
        setSaving(true);
        setError(null);
        try {
            await adviserService.reviewDtrSubmission(submissionId, confirm, remarks.trim() || undefined);
            onReviewed(confirm);
        } catch (err) {
            if (!mounted.current) return;
            setError(err instanceof Error ? err.message : 'The review could not be saved.');
            setConfirm(null);
        } finally {
            if (mounted.current) setSaving(false);
        }
    };

    const snap = detail?.snapshot ?? null;
    const summary = snap?.summary ?? null;
    const days = snap?.days ?? [];
    const blocking = (snap?.issues ?? []).filter(i => i.severity === 'blocking');
    const advisory = (snap?.issues ?? []).filter(i => i.severity === 'advisory');
    const isPending = detail?.status === 'pending';

    return (
        <div className="dtr-modal-backdrop" role="presentation" onClick={onClose}>
            <div
                className="dtr-review"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dtr-review-title"
                onClick={e => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className="dtr-review-head">
                    <div>
                        <h2 id="dtr-review-title">Daily Time Record — Review</h2>
                        <p>
                            {detail?.student_name || 'Student'}
                            {detail?.section_name ? ` · ${detail.section_name}` : ''}
                            {detail ? ` · submitted ${stamp(detail.submitted_at)}` : ''}
                            {detail && detail.attempt > 1 ? ` · attempt ${detail.attempt}` : ''}
                        </p>
                    </div>
                    <div className="dtr-review-head-right">
                        {detail && <DtrStatusBadge status={detail.status as DtrStatus} />}
                        <button type="button" className="dtr-icon-btn" onClick={onClose} aria-label="Close review">
                            <IconClose size={17} />
                        </button>
                    </div>
                </div>

                <div className="dtr-review-body">
                    {loading ? (
                        <div className="dtr-empty">Loading the submitted record…</div>
                    ) : error && !detail ? (
                        <div className="dtr-empty">{error}</div>
                    ) : detail && snap && summary ? (
                        <>
                            {/* ── Student information ── */}
                            <div className="dtr-facts">
                                <div><span>Student</span><strong>{detail.student_name || '—'}</strong></div>
                                <div><span>Section</span><strong>{detail.section_name || '—'}</strong></div>
                                <div><span>Company</span><strong>{detail.company_name || 'Not assigned'}</strong></div>
                                <div><span>SIL Period</span><strong>{formatDtrPeriod(detail.period_start, detail.period_end)}</strong></div>
                                <div><span>Required Hours</span><strong>{detail.required_hours}h</strong></div>
                                <div><span>Total Rendered</span><strong>{formatDtrHours(detail.total_minutes)}</strong></div>
                            </div>

                            {/* ── Summary ── */}
                            <div className="dtr-kpis">
                                {[
                                    { label: 'Working Days', value: summary.working_days, sub: `${summary.recorded_days} recorded` },
                                    { label: 'Total Hours', value: formatDtrHours(summary.total_minutes), sub: `of ${summary.required_hours}h` },
                                    { label: 'Remaining', value: formatDtrHours(summary.remaining_minutes), sub: `${summary.completion_pct}% complete` },
                                    { label: 'Late Days', value: summary.late_days, sub: 'Recorded late' },
                                    { label: 'Incomplete', value: summary.incomplete_days, sub: 'Missing a clock entry' },
                                    { label: 'Overtime', value: formatDtrHours(summary.overtime_minutes), sub: 'Beyond the daily limit' },
                                ].map(k => (
                                    <div className="dtr-kpi" key={k.label}>
                                        <div className="dtr-kpi-label">{k.label}</div>
                                        <div className="dtr-kpi-value">{k.value}</div>
                                        <div className="dtr-kpi-sub">{k.sub}</div>
                                    </div>
                                ))}
                            </div>

                            {/* ── Checks: what to look at before deciding ── */}
                            <div className="dtr-checks">
                                <span className={`dtr-check ${summary.total_minutes >= summary.required_minutes ? 'is-ok' : 'is-warn'}`}>
                                    {summary.total_minutes >= summary.required_minutes ? <IconCheck size={13} /> : <IconWarn size={13} />}
                                    {summary.total_minutes >= summary.required_minutes
                                        ? 'Required hours completed'
                                        : `${formatDtrHours(summary.remaining_minutes)} short of the requirement`}
                                </span>
                                <span className={`dtr-check ${blocking.length === 0 ? 'is-ok' : 'is-bad'}`}>
                                    {blocking.length === 0 ? <IconCheck size={13} /> : <IconWarn size={13} />}
                                    {blocking.length === 0
                                        ? 'All time logs complete'
                                        : `${blocking.length} time log issue${blocking.length === 1 ? '' : 's'}`}
                                </span>
                                {summary.late_days > 0 && (
                                    <span className="dtr-check is-warn"><IconWarn size={13} />
                                        {summary.late_days} late arrival{summary.late_days === 1 ? '' : 's'}</span>
                                )}
                                {advisory.length > 0 && (
                                    <span className="dtr-check is-warn"><IconWarn size={13} />
                                        {advisory.length} log{advisory.length === 1 ? '' : 's'} worth a second look</span>
                                )}
                            </div>

                            {/* ── The complete attendance history ── */}
                            <div className="dtr-table-wrap">
                                <table className="dtr-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th><th>Day</th>
                                            <th className="dtr-num">Time In</th>
                                            <th className="dtr-num">Time Out</th>
                                            <th className="dtr-num">Break</th>
                                            <th className="dtr-num">Daily Hours</th>
                                            <th>Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {days.length === 0 ? (
                                            <tr><td colSpan={7} className="dtr-empty-cell">This DTR contains no attendance records.</td></tr>
                                        ) : days.map(d => (
                                            <tr key={d.date} className={d.blocking ? 'is-flagged' : ''}>
                                                <td><strong>{dayLabel(d.date)}</strong></td>
                                                <td>{d.weekday}</td>
                                                <td className="dtr-num">{clock(d.time_in)}</td>
                                                <td className="dtr-num">
                                                    {d.open_sessions > 0
                                                        ? <span className="dtr-flag is-bad">Missing</span>
                                                        : clock(d.time_out)}
                                                </td>
                                                <td className="dtr-num">{d.break_minutes > 0 ? formatDtrHours(d.break_minutes) : '—'}</td>
                                                <td className="dtr-num">{formatDtrHours(d.minutes)}</td>
                                                <td>
                                                    {d.issues.length === 0
                                                        ? <span className="dtr-muted">—</span>
                                                        : d.issues.map(i => (
                                                            <span key={i.code} className={`dtr-flag ${i.severity === 'blocking' ? 'is-bad' : 'is-warn'}`}>
                                                                {i.label}
                                                            </span>
                                                        ))}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* ── Submission history ── */}
                            {detail.history.length > 0 && (
                                <div className="dtr-history">
                                    <div className="dtr-history-title">Submission History</div>
                                    <ul>
                                        {detail.history.map((h, i) => (
                                            <li key={`${h.event}-${i}`} className={`is-${h.event}`}>
                                                <div className="dtr-history-main">
                                                    <strong>{DTR_EVENT_LABEL[h.event] ?? h.event}</strong>
                                                    <span>{stamp(h.created_at)}{h.actor ? ` · ${h.actor}` : ''}</span>
                                                </div>
                                                {h.remarks && <p className="dtr-history-remark">{h.remarks}</p>}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {detail.status !== 'pending' && detail.adviser_remarks && (
                                <div className="dtr-remark-box">
                                    <strong>Your remarks</strong>
                                    <p>{detail.adviser_remarks}</p>
                                </div>
                            )}

                            {error && <div className="dtr-error" role="alert"><IconWarn size={14} /> {error}</div>}
                        </>
                    ) : null}
                </div>

                {/* ── Actions ── */}
                <div className="dtr-review-foot">
                    <button type="button" className="dtr-btn" onClick={onClose}>Close</button>
                    {isPending && (
                        <>
                            <button
                                type="button"
                                className="dtr-btn dtr-btn--warn"
                                onClick={() => { setRemarks(''); setConfirm('request_revision'); }}
                            >
                                Request Revision
                            </button>
                            <button
                                type="button"
                                className="dtr-btn dtr-btn--primary"
                                onClick={() => setConfirm('approve')}
                            >
                                Approve DTR
                            </button>
                        </>
                    )}
                </div>

                {/* ── Confirmation ── */}
                {confirm && detail && (
                    <div className="dtr-modal-backdrop is-inner" role="presentation" onClick={() => setConfirm(null)}>
                        <div className="dtr-confirm" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                            {confirm === 'approve' ? (
                                <>
                                    <h3>Approve DTR?</h3>
                                    <p>You are approving this student&apos;s complete Daily Time Record for the SIL period.</p>
                                    <div className="dtr-confirm-facts">
                                        <div><span>Student</span><strong>{detail.student_name || '—'}</strong></div>
                                        <div><span>Total Hours</span><strong>{formatDtrHours(detail.total_minutes)}</strong></div>
                                        <div><span>SIL Period</span><strong>{formatDtrPeriod(detail.period_start, detail.period_end)}</strong></div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h3>Request DTR Revision</h3>
                                    <p>The student will be notified and allowed to correct and resubmit the DTR.</p>
                                    <label className="dtr-label" htmlFor="dtr-remarks">Reason for revision</label>
                                    <textarea
                                        id="dtr-remarks"
                                        className="dtr-textarea"
                                        rows={4}
                                        value={remarks}
                                        autoFocus
                                        placeholder="e.g. Please correct the missing clock-out record on September 5."
                                        onChange={e => setRemarks(e.target.value)}
                                    />
                                    {!remarks.trim() && (
                                        <p className="dtr-hint">A remark is required so the student knows what to fix.</p>
                                    )}
                                </>
                            )}
                            <div className="dtr-confirm-actions">
                                <button type="button" className="dtr-btn" onClick={() => setConfirm(null)} disabled={saving}>
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className={`dtr-btn ${confirm === 'approve' ? 'dtr-btn--primary' : 'dtr-btn--warn'}`}
                                    onClick={submitReview}
                                    disabled={saving || (confirm === 'request_revision' && !remarks.trim())}
                                >
                                    {saving ? 'Saving…' : confirm === 'approve' ? 'Approve DTR' : 'Request Revision'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdviserDtrReviewModal;
