import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    dtrSubmissionService,
    type DtrState,
    type MyDtrStatus,
} from '../services/dtrSubmissionService';
import { DTR_EVENT_LABEL, formatDtrHours, formatDtrPeriod } from '../utils/dtrFormat';
import './DtrSubmission.css';

/**
 * The student's DTR submission panel.
 *
 * The student owns this step: attendance is collected automatically all through
 * their SIL, and once the required hours are complete they review the record and
 * explicitly submit the WHOLE DTR to their assigned adviser. Nothing here
 * touches clock-in/clock-out — that keeps working exactly as before.
 *
 * The adviser is never chosen here; the server resolves them from the student's
 * section.
 */

type IconProps = { size?: number };
const Svg: React.FC<IconProps & { children: React.ReactNode }> = ({ size = 16, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IconCheck: React.FC<IconProps> = p => (<Svg {...p}><polyline points="20 6 9 17 4 12" /></Svg>);
const IconWarn: React.FC<IconProps> = p => (
    <Svg {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Svg>
);
const IconClock: React.FC<IconProps> = p => (<Svg {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Svg>);
const IconSend: React.FC<IconProps> = p => (<Svg {...p}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></Svg>);

const stamp = (v: string | null | undefined) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
};
const dayLabel = (v: string) => {
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
};

/** The banner copy for each state, straight from the workflow. */
const BANNER: Record<DtrState, { tone: string; title: string; body: string }> = {
    in_progress: {
        tone: 'info',
        title: 'SIL In Progress',
        body: 'Your attendance records are still being collected. Complete your required SIL hours before submitting your DTR.',
    },
    ready: {
        tone: 'ready',
        title: 'DTR Ready for Submission',
        body: 'Your required SIL hours have been completed. Review your DTR carefully before submitting it to your adviser.',
    },
    pending_review: {
        tone: 'pending',
        title: 'DTR Submitted',
        body: 'Your complete DTR has been submitted to your adviser and is currently awaiting review.',
    },
    approved: {
        tone: 'ok',
        title: 'DTR Approved',
        body: 'Your adviser has reviewed and approved your complete DTR.',
    },
    revision_required: {
        tone: 'warn',
        title: 'DTR Revision Required',
        body: 'Your adviser requested changes to your DTR. Review the remarks, make the necessary corrections, and resubmit.',
    },
};

const StudentDtrSubmission: React.FC = () => {
    const [status, setStatus] = useState<MyDtrStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await dtrSubmissionService.getMyStatus();
            if (mounted.current) setStatus(data);
        } catch (err) {
            if (mounted.current) setError(err instanceof Error ? err.message : 'Unable to load your DTR status.');
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const submit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await dtrSubmissionService.submit();
            setConfirming(false);
            await load();
        } catch (err) {
            if (!mounted.current) return;
            setError(err instanceof Error ? err.message : 'Your DTR could not be submitted.');
            setConfirming(false);
        } finally {
            if (mounted.current) setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="dtr-panel"><div className="dtr-empty">Checking your DTR status…</div></div>;
    }

    if (!status) {
        return (
            <div className="dtr-panel">
                <div className="dtr-empty">{error || 'Your DTR status is unavailable right now.'}</div>
            </div>
        );
    }

    const banner = BANNER[status.state];
    const s = status.summary;
    const sub = status.submission;
    const blocking = status.issues.filter(i => i.severity === 'blocking');
    const canSubmitNow = status.state === 'ready' || status.state === 'revision_required';
    const locked = status.state === 'pending_review' || status.state === 'approved';

    return (
        <div className="dtr-panel">
            {/* ── Status banner ── */}
            <div className={`dtr-banner is-${banner.tone}`}>
                <span className="dtr-banner-icon">
                    {banner.tone === 'ok' ? <IconCheck size={17} />
                        : banner.tone === 'warn' ? <IconWarn size={17} />
                            : banner.tone === 'pending' ? <IconClock size={17} />
                                : <IconClock size={17} />}
                </span>
                <div>
                    <div className="dtr-banner-title">{banner.title}</div>
                    <p>{banner.body}</p>
                </div>
            </div>

            <div className="dtr-panel-grid">
                {/* ── Summary + primary action ── */}
                <div className="dtr-panel-main">
                    <div className="dtr-facts">
                        <div><span>SIL Period</span><strong>{formatDtrPeriod(s.period_start, s.period_end)}</strong></div>
                        <div><span>Required Hours</span><strong>{s.required_hours}h</strong></div>
                        <div><span>Rendered Hours</span><strong>{formatDtrHours(s.total_minutes)}</strong></div>
                        <div><span>Working Days</span><strong>{s.working_days}</strong></div>
                    </div>

                    <div className="dtr-progress">
                        <div className="dtr-progress-bar">
                            <span style={{ width: `${Math.min(100, s.completion_pct)}%` }} />
                        </div>
                        <div className="dtr-progress-label">
                            {s.completion_pct}% of required hours
                            {s.remaining_minutes > 0 && ` · ${formatDtrHours(s.remaining_minutes)} remaining`}
                        </div>
                    </div>

                    {/* Blocking issues: exactly why the button is unavailable. */}
                    {blocking.length > 0 && (
                        <div className="dtr-issue-box">
                            <div className="dtr-issue-title">
                                <IconWarn size={14} /> DTR cannot be submitted yet
                            </div>
                            <p>Please resolve the following before submitting:</p>
                            <ul>
                                {blocking.map((i, idx) => (
                                    <li key={`${i.code}-${idx}`}>
                                        <strong>{i.date ? dayLabel(i.date) : 'Record'}</strong> — {i.label}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {status.state === 'in_progress' && blocking.length === 0 && !status.hours_met && (
                        <p className="dtr-hint">
                            Complete your required SIL hours before submitting your DTR for adviser review.
                        </p>
                    )}

                    {error && <div className="dtr-error" role="alert"><IconWarn size={14} /> {error}</div>}

                    {/* ── The primary action, per state ── */}
                    {locked ? (
                        <div className={`dtr-locked is-${status.state === 'approved' ? 'ok' : 'pending'}`}>
                            <IconCheck size={15} />
                            <div>
                                <strong>
                                    {status.state === 'approved' ? 'DTR Approved' : 'Submitted to Adviser'}
                                </strong>
                                <span>
                                    {status.state === 'approved'
                                        ? `Approved by ${sub?.reviewer || 'your adviser'} · ${stamp(sub?.reviewed_at)}`
                                        : `Submitted ${stamp(sub?.submitted_at)} · awaiting review`}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="dtr-btn dtr-btn--primary dtr-btn--block"
                            onClick={() => setConfirming(true)}
                            disabled={!canSubmitNow || !status.can_submit}
                            title={!status.can_submit
                                ? 'Complete your required SIL hours and resolve the issues above first.'
                                : undefined}
                        >
                            <IconSend size={15} />
                            {status.state === 'revision_required' ? 'Resubmit to Adviser' : 'Submit to Adviser for Review'}
                        </button>
                    )}
                </div>

                {/* ── Submission details ── */}
                <aside className="dtr-panel-side">
                    <div className="dtr-side-title">DTR Submission</div>

                    <div className="dtr-side-row">
                        <span>Status</span>
                        <strong>{banner.title}</strong>
                    </div>
                    <div className="dtr-side-row">
                        <span>Submitted To</span>
                        <strong>
                            {status.adviser?.name || 'No adviser assigned'}
                            {status.adviser?.adviser_type && (
                                <em>{status.adviser.adviser_type}</em>
                            )}
                        </strong>
                    </div>
                    {sub && (
                        <>
                            <div className="dtr-side-row">
                                <span>Submitted On</span><strong>{stamp(sub.submitted_at)}</strong>
                            </div>
                            {sub.reviewed_at && (
                                <div className="dtr-side-row">
                                    <span>Reviewed</span><strong>{stamp(sub.reviewed_at)}</strong>
                                </div>
                            )}
                        </>
                    )}

                    {/* Adviser remarks — the whole point of a revision request. */}
                    {status.state === 'revision_required' && sub?.adviser_remarks && (
                        <div className="dtr-remark-box">
                            <strong>Adviser Remarks</strong>
                            <p>{sub.adviser_remarks}</p>
                        </div>
                    )}

                    {sub && sub.history.length > 0 && (
                        <div className="dtr-history">
                            <div className="dtr-history-title">Submission History</div>
                            <ul>
                                {sub.history.map((h, i) => (
                                    <li key={`${h.event}-${i}`} className={`is-${h.event}`}>
                                        <div className="dtr-history-main">
                                            <strong>{DTR_EVENT_LABEL[h.event] ?? h.event}</strong>
                                            <span>{stamp(h.created_at)}</span>
                                        </div>
                                        {h.remarks && <p className="dtr-history-remark">{h.remarks}</p>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </aside>
            </div>

            {/* ── Confirmation ── */}
            {confirming && (
                <div className="dtr-modal-backdrop" role="presentation" onClick={() => setConfirming(false)}>
                    <div
                        className="dtr-confirm"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="dtr-submit-title"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 id="dtr-submit-title">Submit DTR for Adviser Review?</h3>
                        <p>You are about to submit your complete Daily Time Record to your assigned adviser.</p>

                        <ul className="dtr-checklist">
                            <li><IconCheck size={13} /> All attendance records are correct</li>
                            <li><IconCheck size={13} /> All clock-in/out records are complete</li>
                            <li><IconCheck size={13} /> Your total SIL hours are accurate</li>
                            <li><IconCheck size={13} /> There are no unresolved attendance issues</li>
                        </ul>

                        <p className="dtr-hint">
                            Once submitted, your DTR will be locked while your adviser reviews it.
                        </p>

                        <div className="dtr-confirm-facts">
                            <div><span>SIL Period</span><strong>{formatDtrPeriod(s.period_start, s.period_end)}</strong></div>
                            <div><span>Total Hours</span><strong>{formatDtrHours(s.total_minutes)} / {s.required_hours}h</strong></div>
                            <div><span>Adviser</span><strong>{status.adviser?.name || '—'}</strong></div>
                        </div>

                        <div className="dtr-confirm-actions">
                            <button type="button" className="dtr-btn" onClick={() => setConfirming(false)} disabled={submitting}>
                                Cancel
                            </button>
                            <button type="button" className="dtr-btn dtr-btn--primary" onClick={submit} disabled={submitting}>
                                {submitting ? 'Submitting…' : 'Submit to Adviser'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentDtrSubmission;
