import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    adviserReportService,
    reportDayKey,
    type DailyReport,
    type DailyReportSummary,
} from '../services/adviserReportService';
import {
    ATTENTION_PREVIEW,
    buildDailyNarrative,
    formatClock,
    formatReportDate,
    isNarrativeStale,
    NARRATIVE_MAX_LENGTH,
    narrativeToText,
    splitNarrativeLabel,
    textToParagraphs,
    type NarrativeSegment,
} from '../utils/adviserReport';
import { TableRowSkeleton } from './Skeletons';
import UserProfileModal from './UserProfileModal';
import './AttendanceView.css';
import './CoordinatorDashboard.css';
import './AdviserDashboard.css';
import './AdviserReport.css';

/**
 * The adviser's consolidated daily report.
 *
 * One adviser -> every assigned section -> every student -> ONE report. The
 * page never asks which section: the scope is resolved in the database from the
 * adviser's own assignments, and this view only renders what came back.
 *
 * The day is told as a short run of labelled paragraphs in the adviser's own
 * voice, not as tabs of tables. The adviser can rewrite that text: their version
 * is stored beside the generated figures, so Regenerate replaces the figures and
 * never their words.
 */

type IconProps = { size?: number; color?: string };
const Svg: React.FC<IconProps & { children: React.ReactNode }> = ({ size = 16, color = 'currentColor', children }) => (
    <svg
        width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" focusable="false"
    >
        {children}
    </svg>
);
const IconRefresh: React.FC<IconProps> = p => (
    <Svg {...p}>
        <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </Svg>
);
const IconMail: React.FC<IconProps> = p => (
    <Svg {...p}><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><polyline points="22,6 12,13 2,6" /></Svg>
);
const IconHistory: React.FC<IconProps> = p => (
    <Svg {...p}><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><polyline points="12 7 12 12 15 14" /></Svg>
);
const IconEdit: React.FC<IconProps> = p => (
    <Svg {...p}><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></Svg>
);
const IconAlert: React.FC<IconProps> = p => (
    <Svg {...p}>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </Svg>
);
const IconCheck: React.FC<IconProps> = p => (
    <Svg {...p}><polyline points="20 6 9 17 4 12" /></Svg>
);

const AdviserReportView: React.FC = () => {
    const today = reportDayKey();

    const [date, setDate] = useState(today);
    const [report, setReport] = useState<DailyReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [showAllAttention, setShowAllAttention] = useState(false);

    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<DailyReportSummary[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const [confirmRegenerate, setConfirmRegenerate] = useState(false);
    const [emailing, setEmailing] = useState(false);
    const [profileId, setProfileId] = useState<string | null>(null);

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const [confirmRevert, setConfirmRevert] = useState(false);

    /* What the editor opened with, so Cancel and the date guard can tell a
       draft the adviser typed into from one they only looked at. Refs, not
       state: nothing renders from them. */
    const seed = useRef('');
    /* The step a dirty draft interrupted — a date change or Regenerate — run
       once the adviser agrees to discard. Null for a plain Cancel. */
    const afterDiscard = useRef<(() => void) | null>(null);
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const editButtonRef = useRef<HTMLButtonElement>(null);
    const returnFocus = useRef(false);

    /*
     * Guards every state update against a response that lands after unmount.
     *
     * It must be set on the way IN, not just cleared on the way out: React
     * StrictMode mounts, unmounts and remounts in development, so a cleanup
     * that only writes `false` leaves the ref false forever after the second
     * mount — and the page then drops the very update that clears `loading`,
     * leaving an empty card.
     */
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    /* Focus follows the editor in, and back to Edit on the way out — but only
       when the adviser closed it themselves; a date change unmounts the button. */
    useEffect(() => {
        if (editing) {
            editorRef.current?.focus();
        } else if (returnFocus.current) {
            returnFocus.current = false;
            editButtonRef.current?.focus();
        }
    }, [editing]);

    const load = useCallback(async (target: string) => {
        setLoading(true);
        setError(null);
        setNotice(null);
        setShowAllAttention(false);
        try {
            const stored = await adviserReportService.get(target);
            if (!mounted.current) return;
            setReport(stored);
        } catch (err) {
            if (!mounted.current) return;
            setError(err instanceof Error ? err.message : 'Unable to load the report.');
            setReport(null);
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => { load(date); }, [load, date]);

    const generate = async () => {
        setGenerating(true);
        setError(null);
        setNotice(null);
        setConfirmRegenerate(false);
        try {
            const fresh = await adviserReportService.generate(date);
            if (!mounted.current) return;
            setReport(fresh);
            setNotice(`Report rebuilt at ${formatClock(fresh.generated_at)}.`);
        } catch (err) {
            if (!mounted.current) return;
            setError(err instanceof Error ? err.message : 'Unable to generate the report. Please try again.');
        } finally {
            if (mounted.current) setGenerating(false);
        }
    };

    const emailReport = async () => {
        if (!report) return;
        setEmailing(true);
        setError(null);
        try {
            const result = await adviserReportService.email(date);
            if (!mounted.current) return;
            setNotice(result.sent
                ? 'The report summary is on its way to your registered email address.'
                : 'This report has already been emailed to you today.');
            if (result.sent) setReport({ ...report, emailed_at: new Date().toISOString() });
        } catch (err) {
            if (!mounted.current) return;
            setError(err instanceof Error ? err.message : 'The report could not be emailed.');
        } finally {
            if (mounted.current) setEmailing(false);
        }
    };

    const openHistory = async () => {
        setShowHistory(true);
        setHistoryLoading(true);
        try {
            const { rows } = await adviserReportService.history(30);
            if (mounted.current) setHistory(rows);
        } catch (err) {
            console.error('Failed to load report history:', err);
            if (mounted.current) setHistory([]);
        } finally {
            if (mounted.current) setHistoryLoading(false);
        }
    };

    /* ── Editing ──────────────────────────────────────────────────────────── */

    const openEditor = (text: string) => {
        seed.current = text;
        setDraft(text);
        setError(null);
        setEditing(true);
    };

    const closeEditor = (restoreFocus = true) => {
        returnFocus.current = restoreFocus;
        seed.current = '';
        setDraft('');
        setEditing(false);
    };

    /** Runs `action` now, or asks first when it would throw away typed text. */
    const guardDraft = (action: () => void) => {
        if (editing && draft !== seed.current) {
            afterDiscard.current = action;
            setConfirmDiscard(true);
            return;
        }
        if (editing) closeEditor(false);
        action();
    };

    const cancelEdit = () => {
        if (draft !== seed.current) {
            afterDiscard.current = null;
            setConfirmDiscard(true);
            return;
        }
        closeEditor();
    };

    const discardDraft = () => {
        const next = afterDiscard.current;
        afterDiscard.current = null;
        setConfirmDiscard(false);
        closeEditor(next === null);
        next?.();
    };

    const keepEditing = () => {
        afterDiscard.current = null;
        setConfirmDiscard(false);
        editorRef.current?.focus();
    };

    /* Null (or blank) clears the adviser's version. The page re-syncs from the
       row the database returns, never from what it sent, so two open tabs
       settle on whichever saved last. */
    const storeNarrative = async (value: string | null) => {
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            const fresh = await adviserReportService.saveNarrative(date, value);
            if (!mounted.current) return;
            setReport(fresh);
            setConfirmRevert(false);
            closeEditor();
            setNotice(fresh.narrative
                ? `Your version was saved at ${formatClock(fresh.narrative_edited_at)}.`
                : 'Your edit was cleared. The generated text is shown again.');
        } catch (err) {
            if (!mounted.current) return;
            // The editor stays open, so nothing the adviser typed is lost.
            setConfirmRevert(false);
            setError(err instanceof Error ? err.message : 'Your changes could not be saved.');
        } finally {
            if (mounted.current) setSaving(false);
        }
    };

    /* Defined before the early returns because both the "no report yet" state
       and the full report offer the history list. */
    const historyModal = !showHistory ? null : (
        <div className="adr-modal-backdrop" role="presentation" onClick={() => setShowHistory(false)}>
            <div
                className="adr-modal adr-modal--wide"
                role="dialog"
                aria-modal="true"
                aria-labelledby="adr-history-title"
                onClick={e => e.stopPropagation()}
            >
                <h3 id="adr-history-title">My Daily Reports</h3>
                <p>Every consolidated report generated for your sections, newest first.</p>

                {historyLoading ? (
                    <table style={{ width: '100%' }}>
                        <tbody><TableRowSkeleton rows={3} cols={2} /></tbody>
                    </table>
                ) : history.length === 0 ? (
                    <div className="adr-empty"><p>No reports yet.</p></div>
                ) : (
                    <ul className="adr-history">
                        {history.map(h => (
                            <li key={h.id} className={h.report_date === date ? 'is-current' : ''}>
                                <div className="adr-history-main">
                                    <div className="adr-history-date">{formatReportDate(h.report_date)}</div>
                                    <div className="adr-history-meta">
                                        {h.sections_count} section{h.sections_count === 1 ? '' : 's'} ·{' '}
                                        {h.students_count} student{h.students_count === 1 ? '' : 's'} ·{' '}
                                        {h.attention_count} issue{h.attention_count === 1 ? '' : 's'}
                                        {h.emailed_at ? ' · emailed' : ''}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="adr-btn"
                                    onClick={() => {
                                        setShowHistory(false);
                                        if (h.report_date !== date) guardDraft(() => setDate(h.report_date));
                                    }}
                                >
                                    View Report
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="adr-modal-actions">
                    <button type="button" className="adr-btn" onClick={() => setShowHistory(false)}>Close</button>
                </div>
            </div>
        </div>
    );

    // ── Page states ────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="fade-in adr-page">
                <div className="ad-att-card adr-brief-card">
                    <div className="adr-skeleton"><span /><span /><span /></div>
                </div>
            </div>
        );
    }

    if (!report) {
        return (
            <div className="fade-in adr-page">
                <div className="adr-toolbar">
                    <div className="adr-toolbar-id">
                        <h1>Daily SIL Monitoring Report</h1>
                        <p className="adr-toolbar-meta">{formatReportDate(date)}</p>
                    </div>
                    <div className="adr-toolbar-actions">
                        <input
                            type="date"
                            className="adr-date"
                            aria-label="Report date"
                            value={date}
                            max={today}
                            onChange={e => e.target.value && setDate(e.target.value)}
                        />
                        <button type="button" className="adr-btn" onClick={openHistory}>
                            <IconHistory size={13} /> My Reports
                        </button>
                    </div>
                </div>

                <div className="ad-att-card">
                    <div className="ad-att-empty">
                        <h3>{date === today ? 'Today\'s report isn\'t ready yet.' : 'No report for this date'}</h3>
                        <p>
                            {date === today
                                ? 'Generate it to check attendance, clock-in and clock-out records, SIL progress, journals and companies across every section assigned to you — in one pass.'
                                : 'Nothing was generated for this date. You can build it now from the data the system holds.'}
                        </p>
                        {error && <p className="adr-inline-error"><IconAlert size={14} /> {error}</p>}
                        <button
                            type="button"
                            className="adr-btn adr-btn--primary"
                            style={{ marginTop: '0.9rem' }}
                            onClick={generate}
                            disabled={generating}
                        >
                            {generating ? 'Generating…' : `Generate ${date === today ? "Today's" : "This Day's"} Report`}
                        </button>
                    </div>
                </div>

                {historyModal}
            </div>
        );
    }

    const payload = report.report;
    /* The adviser's saved text wins whenever there is one; blank never reaches
       here, because the database stores blank as NULL. */
    const edited = report.narrative ? textToParagraphs(report.narrative) : [];
    const hasEdit = edited.length > 0;
    const stale = hasEdit && isNarrativeStale(report.generated_at, report.narrative_edited_at);
    const generated = buildDailyNarrative(payload, {
        attentionLimit: showAllAttention ? undefined : ATTENTION_PREVIEW,
    });
    // Uncapped: the text the adviser edits must carry every name.
    const generatedText = () => narrativeToText(buildDailyNarrative(payload));

    const renderSegments = (segments: NarrativeSegment[]) => segments.map((segment, i) => {
        if (segment.kind === 'text') return <React.Fragment key={i}>{segment.value}</React.Fragment>;
        if (segment.kind === 'student') {
            return (
                <button key={i} type="button" className="adr-brief-link" onClick={() => setProfileId(segment.id)}>
                    {segment.name}
                </button>
            );
        }
        return (
            <button key={i} type="button" className="adr-brief-link" onClick={() => setShowAllAttention(true)}>
                {segment.count} more
            </button>
        );
    });

    return (
        <div className="fade-in adr-page">
            {/* ── Report identity + actions, on one compact toolbar row ── */}
            <div className="adr-toolbar">
                <div className="adr-toolbar-id">
                    <h1>Daily SIL Monitoring Report</h1>
                    <p className="adr-toolbar-meta">
                        <span className="adr-meta-strong">{payload.adviser.name || 'Section Adviser'}</span>
                        <span>{formatReportDate(payload.report_date)}</span>
                        <span>
                            Generated {formatClock(report.generated_at)}
                            {report.generated_by === 'scheduled' ? ' · automatic' : ''}
                        </span>
                        {hasEdit && (
                            <span>
                                <span className="adr-edited-pill">Edited · {formatClock(report.narrative_edited_at)}</span>
                            </span>
                        )}
                    </p>
                </div>

                <div className="adr-toolbar-actions">
                    <input
                        type="date"
                        className="adr-date"
                        aria-label="Report date"
                        value={date}
                        max={today}
                        onChange={e => {
                            const value = e.target.value;
                            if (value) guardDraft(() => setDate(value));
                        }}
                    />
                    <button type="button" className="adr-btn" onClick={openHistory} title="Previous daily reports">
                        <IconHistory size={13} /> <span className="adr-btn-text">My Reports</span>
                    </button>
                    <button
                        ref={editButtonRef}
                        type="button"
                        className="adr-btn"
                        onClick={() => openEditor(report.narrative || generatedText())}
                        disabled={editing || saving}
                        title="Rewrite this report in your own words"
                    >
                        <IconEdit size={13} /> <span className="adr-btn-text">Edit</span>
                    </button>
                    <button
                        type="button"
                        className="adr-btn"
                        onClick={() => guardDraft(() => setConfirmRegenerate(true))}
                        disabled={generating}
                        title="Rebuild from the latest data"
                    >
                        <IconRefresh size={13} /> <span className="adr-btn-text">{generating ? 'Rebuilding…' : 'Regenerate'}</span>
                    </button>
                    <button type="button" className="adr-btn" onClick={emailReport} disabled={emailing} title="Email this report to me">
                        <IconMail size={13} /> <span className="adr-btn-text">{emailing ? 'Sending…' : 'Email'}</span>
                    </button>
                </div>
            </div>

            {/* Status reads as a slim inline pill, never a full-width banner. */}
            {(error || notice || (stale && !editing)) && (
                <div className="adr-statusline">
                    {error && <span className="adr-status is-error" role="alert"><IconAlert size={13} /> {error}</span>}
                    {notice && <span className="adr-status is-ok" role="status"><IconCheck size={13} /> {notice}</span>}
                    {/* Never overwrites: the fresh text only opens in the editor,
                        and nothing is stored until the adviser saves it. */}
                    {stale && !editing && (
                        <span className="adr-status is-warn" role="status">
                            <IconAlert size={13} />
                            <span>The figures were rebuilt at {formatClock(report.generated_at)}, after you wrote this.</span>
                            <button type="button" className="adr-brief-link" onClick={() => openEditor(generatedText())}>
                                Use the newly generated text
                            </button>
                        </span>
                    )}
                </div>
            )}

            {/* ── The day, in labelled paragraphs ── */}
            <div className="ad-att-card">
                {editing ? (
                    <div className="adr-narrative adr-narrative--editing">
                        <label className="adr-narrative-label" htmlFor="adr-narrative-editor">
                            My report for {formatReportDate(payload.report_date)}
                        </label>
                        <textarea
                            id="adr-narrative-editor"
                            ref={editorRef}
                            className="adr-editor"
                            value={draft}
                            maxLength={NARRATIVE_MAX_LENGTH}
                            onChange={e => setDraft(e.target.value)}
                            disabled={saving}
                            aria-describedby="adr-narrative-editor-hint"
                        />
                        <p className="adr-editor-hint" id="adr-narrative-editor-hint">
                            Leave a blank line between paragraphs. Student names in your version are plain text.{' '}
                            {draft.length.toLocaleString()} / {NARRATIVE_MAX_LENGTH.toLocaleString()} characters.
                        </p>
                        <div className="adr-editor-actions">
                            <button
                                type="button"
                                className="adr-btn adr-btn--primary"
                                onClick={() => storeNarrative(draft)}
                                disabled={saving}
                            >
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button type="button" className="adr-btn" onClick={cancelEdit} disabled={saving}>
                                Cancel
                            </button>
                            {hasEdit && (
                                <button type="button" className="adr-btn" onClick={() => setConfirmRevert(true)} disabled={saving}>
                                    Revert to generated
                                </button>
                            )}
                        </div>
                    </div>
                ) : hasEdit ? (
                    <div className="adr-narrative adr-narrative--edited">
                        {edited.map((text, i) => {
                            const { label, body } = splitNarrativeLabel(text);
                            return (
                                <section key={i}>
                                    {label && <h2 className="adr-narrative-label">{label}</h2>}
                                    <p className="adr-brief">{body}</p>
                                </section>
                            );
                        })}
                    </div>
                ) : (
                    <div className="adr-narrative">
                        {generated.map(p => (
                            <section key={p.id}>
                                {p.label && <h2 className="adr-narrative-label">{p.label}</h2>}
                                <p className="adr-brief">{renderSegments(p.segments)}</p>
                            </section>
                        ))}
                    </div>
                )}
            </div>

            {confirmRegenerate && (
                <div className="adr-modal-backdrop" role="presentation" onClick={() => setConfirmRegenerate(false)}>
                    <div
                        className="adr-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="adr-regen-view-title"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 id="adr-regen-view-title">Regenerate this report?</h3>
                        <p>
                            This rebuilds {formatReportDate(date)} using the latest attendance, SIL, journal
                            and company data. The version you are looking at now will be replaced.
                        </p>
                        <div className="adr-modal-actions">
                            <button type="button" className="adr-btn" onClick={() => setConfirmRegenerate(false)}>Cancel</button>
                            <button type="button" className="adr-btn adr-btn--primary" onClick={generate}>Regenerate</button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDiscard && (
                <div className="adr-modal-backdrop" role="presentation" onClick={keepEditing}>
                    <div
                        className="adr-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="adr-discard-title"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 id="adr-discard-title">Discard your changes?</h3>
                        <p>What you typed in the editor has not been saved and will be lost.</p>
                        <div className="adr-modal-actions">
                            <button type="button" className="adr-btn" onClick={keepEditing}>Keep Editing</button>
                            <button type="button" className="adr-btn adr-btn--primary" onClick={discardDraft}>Discard</button>
                        </div>
                    </div>
                </div>
            )}

            {confirmRevert && (
                <div className="adr-modal-backdrop" role="presentation" onClick={() => !saving && setConfirmRevert(false)}>
                    <div
                        className="adr-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="adr-revert-title"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 id="adr-revert-title">Revert to the generated text?</h3>
                        <p>
                            Your version of the {formatReportDate(date)} report will be deleted, and the text
                            built from the figures will be shown again. This cannot be undone.
                        </p>
                        <div className="adr-modal-actions">
                            <button type="button" className="adr-btn" onClick={() => setConfirmRevert(false)} disabled={saving}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="adr-btn adr-btn--primary"
                                onClick={() => storeNarrative(null)}
                                disabled={saving}
                            >
                                {saving ? 'Reverting…' : 'Revert'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {historyModal}

            {profileId && (
                <UserProfileModal profileId={profileId} onClose={() => setProfileId(null)} />
            )}
        </div>
    );
};

export default AdviserReportView;
