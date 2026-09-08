import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    adviserReportService,
    reportDayKey,
    type DailyReport,
    type DailyReportSummary,
} from '../services/adviserReportService';
import {
    ALERT_TARGET,
    ATTENDANCE_FILTER_LABELS,
    formatClock,
    formatDelta,
    formatMinutes,
    formatReportDate,
    issueTone,
    matchesAttendanceFilter,
    matchesSearch,
    PROGRESS_COLORS,
    PROGRESS_LABELS,
    STATUS_CLASS,
    STATUS_LABELS,
    type AttendanceFilter,
} from '../utils/adviserReport';
import { downloadDailyReportPdf } from '../utils/adviserReportPdf';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
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
 */

type Tab = 'overview' | 'attendance' | 'ojt' | 'journals' | 'companies' | 'alerts';

const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'ojt', label: 'OJT Progress' },
    { id: 'journals', label: 'Journals' },
    { id: 'companies', label: 'Companies' },
    { id: 'alerts', label: 'Alerts' },
];

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
const IconDownload: React.FC<IconProps> = p => (
    <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Svg>
);
const IconMail: React.FC<IconProps> = p => (
    <Svg {...p}><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><polyline points="22,6 12,13 2,6" /></Svg>
);
const IconHistory: React.FC<IconProps> = p => (
    <Svg {...p}><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><polyline points="12 7 12 12 15 14" /></Svg>
);
const IconAlert: React.FC<IconProps> = p => (
    <Svg {...p}>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </Svg>
);
const IconEye: React.FC<IconProps> = p => (
    <Svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Svg>
);
const IconCheck: React.FC<IconProps> = p => (
    <Svg {...p}><polyline points="20 6 9 17 4 12" /></Svg>
);

const clockLabel = (value: string | null) => {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
        ? '—'
        : parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

interface Props {
    /**
     * Opens the existing Pending Approvals queue on a given tab.
     *
     * The report surfaces journal activity but never reviews it: approving,
     * rejecting and requesting revisions stay in the one approval workflow the
     * portal already has.
     */
    onOpenApprovals?: (tab: 'students' | 'journals' | 'documents' | 'dtr') => void;
}

const AdviserReportView: React.FC<Props> = ({ onOpenApprovals }) => {
    const today = reportDayKey();

    const [date, setDate] = useState(today);
    const [report, setReport] = useState<DailyReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [tab, setTab] = useState<Tab>('overview');
    const [search, setSearch] = useState('');
    const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('all');

    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<DailyReportSummary[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const [confirmRegenerate, setConfirmRegenerate] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [emailing, setEmailing] = useState(false);
    const [profileId, setProfileId] = useState<string | null>(null);

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

    const load = useCallback(async (target: string) => {
        setLoading(true);
        setError(null);
        setNotice(null);
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

    const exportPdf = async () => {
        if (!report) return;
        setExporting(true);
        try {
            await downloadDailyReportPdf(report);
        } catch (err) {
            console.error('Daily report PDF export failed:', err);
            if (mounted.current) setError('The report could not be exported. Please try again.');
        } finally {
            if (mounted.current) setExporting(false);
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

    const payload = report?.report ?? null;

    // ── Attendance tab: filters run across ALL assigned sections ────────────
    const attendanceRows = useMemo(() => {
        if (!payload) return [];
        return payload.students.filter(s =>
            matchesAttendanceFilter(attendanceFilter, s) && matchesSearch(s, search));
    }, [payload, attendanceFilter, search]);

    const {
        currentPage, setCurrentPage, totalPages, paginatedItems, totalItems, itemsPerPage,
    } = usePagination(attendanceRows, 15);

    useEffect(() => { setCurrentPage(1); }, [attendanceFilter, search, date, setCurrentPage]);

    const goToAlert = (code: string) => {
        const target = ALERT_TARGET[code];
        if (!target) return;
        setTab(target.tab as Tab);
        if (target.filter) setAttendanceFilter(target.filter);
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
                                    onClick={() => { setDate(h.report_date); setShowHistory(false); setTab('overview'); }}
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
        // TableRowSkeleton emits <tr>/<td>, which the browser drops unless it is
        // inside a table — hence the wrapper, without which this card is blank.
        return (
            <div className="fade-in ad-att-card">
                <div className="ad-att-scroll">
                    <table className="ad-att-table">
                        <tbody><TableRowSkeleton rows={6} cols={6} /></tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (!report) {
        return (
            <div className="fade-in adr-page">
                <div className="adr-toolbar">
                    <div className="adr-toolbar-id">
                        <h1>Daily SIL/OJT Monitoring Report</h1>
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
                                ? 'Generate it to check attendance, clock-in and clock-out records, OJT progress, journals and companies across every section assigned to you — in one pass.'
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

    const summary = payload!.summary;

    /* The nine headline figures. `tone` drives the value colour and the card's
       left accent, so a figure that needs action reads differently from one
       that is merely informational (specification section 15). */
    const summaryCards: { label: string; value: string | number; sub: string; tone: string }[] = [
        { label: 'Sections', value: summary.sections, sub: 'Assigned to you', tone: 'neutral' },
        { label: 'Students', value: summary.students, sub: 'Across all sections', tone: 'neutral' },
        { label: 'Present', value: summary.present, sub: `${summary.attendance_rate}% attendance`, tone: 'good' },
        { label: 'Absent', value: summary.absent, sub: 'Recorded absent', tone: summary.absent > 0 ? 'bad' : 'muted' },
        { label: 'Incomplete', value: summary.incomplete, sub: 'Logs not closed', tone: summary.incomplete > 0 ? 'warn' : 'muted' },
        { label: 'Not Recorded', value: summary.not_recorded, sub: 'No status yet', tone: 'muted' },
        { label: 'Total Hours', value: formatMinutes(summary.total_minutes), sub: 'Rendered today', tone: 'info' },
        { label: 'Needs Attention', value: summary.attention, sub: 'Requires review', tone: summary.attention > 0 ? 'bad' : 'good' },
        { label: 'Pending Journals', value: summary.journals_pending, sub: 'Awaiting approval', tone: summary.journals_pending > 0 ? 'warn' : 'muted' },
    ];

    return (
        <div className="fade-in adr-page">
            {/* ── Report identity + actions, on one compact toolbar row ── */}
            <div className="adr-toolbar">
                <div className="adr-toolbar-id">
                    <h1>Daily SIL/OJT Monitoring Report</h1>
                    <p className="adr-toolbar-meta">
                        <span className="adr-meta-strong">{payload!.adviser.name || 'Section Adviser'}</span>
                        <span>{formatReportDate(payload!.report_date)}</span>
                        <span>{report.sections_count} Section{report.sections_count === 1 ? '' : 's'}</span>
                        <span>{report.students_count} Student{report.students_count === 1 ? '' : 's'}</span>
                        <span>
                            Generated {formatClock(report.generated_at)}
                            {report.generated_by === 'scheduled' ? ' · automatic' : ''}
                        </span>
                    </p>
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
                    <button type="button" className="adr-btn" onClick={openHistory} title="Previous daily reports">
                        <IconHistory size={13} /> <span className="adr-btn-text">My Reports</span>
                    </button>
                    <button
                        type="button"
                        className="adr-btn"
                        onClick={() => setConfirmRegenerate(true)}
                        disabled={generating}
                        title="Rebuild from the latest data"
                    >
                        <IconRefresh size={13} /> <span className="adr-btn-text">{generating ? 'Rebuilding…' : 'Regenerate'}</span>
                    </button>
                    <button type="button" className="adr-btn" onClick={emailReport} disabled={emailing} title="Email this report to me">
                        <IconMail size={13} /> <span className="adr-btn-text">{emailing ? 'Sending…' : 'Email'}</span>
                    </button>
                    <button type="button" className="adr-btn adr-btn--primary" onClick={exportPdf} disabled={exporting}>
                        <IconDownload size={13} /> {exporting ? 'Preparing…' : 'Export PDF'}
                    </button>
                </div>
            </div>

            {/* Status reads as a slim inline pill, never a full-width banner. */}
            {(error || notice) && (
                <div className="adr-statusline">
                    {error && <span className="adr-status is-error" role="alert"><IconAlert size={13} /> {error}</span>}
                    {notice && <span className="adr-status is-ok" role="status"><IconCheck size={13} /> {notice}</span>}
                </div>
            )}

            {/* ── Tabs (section 19). Sticky, so switching sections never means
                   scrolling back to the top of a long report. ── */}
            <div className="adr-tabs" role="tablist">
                {TABS.map(t => {
                    const badge = t.id === 'alerts' ? payload!.alerts.length
                        : t.id === 'ojt' ? payload!.ojt.behind
                            : t.id === 'journals' ? payload!.journals.pending
                                : 0;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={tab === t.id}
                            className={`adr-tab ${tab === t.id ? 'is-active' : ''}`}
                            onClick={() => setTab(t.id)}
                        >
                            {t.label}
                            {badge > 0 && <span className="adr-tab-badge">{badge}</span>}
                        </button>
                    );
                })}
            </div>

            {/* ══ OVERVIEW ══ */}
            {tab === 'overview' && (
                <>
                    <div className="adr-kpis">
                        {summaryCards.map(c => (
                            <div className={`adr-kpi is-${c.tone}`} key={c.label}>
                                <div className="adr-kpi-label">{c.label}</div>
                                <div className="adr-kpi-value">{c.value}</div>
                                <div className="adr-kpi-sub">{c.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* Students requiring attention — the most important part (section 10) */}
                    <div className={`ad-att-card${payload!.attention.length > 0 ? ' adr-card--priority' : ''}`}>
                        <div className="ad-att-card-head">
                            <div className="adr-head-title">
                                <IconAlert size={14} />
                                <h2>Students Requiring Attention</h2>
                                {payload!.attention.length > 0 && (
                                    <span className="adr-count-pill">{payload!.attention.length}</span>
                                )}
                                <p>
                                    {payload!.attention.length === 0
                                        ? 'Nothing needs your attention today.'
                                        : 'Most urgent first.'}
                                </p>
                            </div>
                        </div>

                        {payload!.attention.length === 0 ? (
                            <div className="ad-att-empty">
                                <h3>All clear</h3>
                                <p>No missing clock-outs, absences, limit breaches or progress gaps were detected across your sections.</p>
                            </div>
                        ) : (
                            <div className="ad-att-scroll">
                                <table className="ad-att-table">
                                    <thead>
                                        <tr>
                                            <th>Student</th><th>Section</th><th>Company</th>
                                            <th>Issue</th><th>Also flagged</th>
                                            <th style={{ textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payload!.attention.map(a => (
                                            <tr key={a.student_id}>
                                                <td><div className="ad-att-name">{a.name || '—'}</div></td>
                                                <td>{a.section}</td>
                                                <td>{a.company || <span className="adr-muted">Not yet deployed</span>}</td>
                                                <td>
                                                    <span className={`adr-issue is-${issueTone(a.priority)}`}>{a.issue}</span>
                                                </td>
                                                <td>
                                                    {a.issues.length > 1
                                                        ? a.issues.slice(1).map(i => (
                                                            <span key={i.code} className={`adr-issue is-${issueTone(i.rank)}`}>{i.label}</span>
                                                        ))
                                                        : <span className="adr-muted">—</span>}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        type="button"
                                                        className="ad-att-view"
                                                        onClick={() => setProfileId(a.student_id)}
                                                    >
                                                        <IconEye size={13} /> View Student
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Section overview (section 11) */}
                    <div className="ad-att-card">
                        <div className="ad-att-card-head">
                            <div className="adr-head-title">
                                <h2>Section Overview</h2>
                                <p>Per assigned section. The report itself stays adviser-wide.</p>
                            </div>
                        </div>
                        <div className="ad-att-scroll">
                            <table className="ad-att-table adr-table--single">
                                <thead>
                                    <tr>
                                        <th>Section</th>
                                        <th className="adr-numcol">Students</th>
                                        <th className="adr-numcol">Present</th>
                                        <th className="adr-numcol">Absent</th>
                                        <th className="adr-numcol">Incomplete</th>
                                        <th className="adr-numcol">Not Recorded</th>
                                        <th className="adr-numcol">Avg Hours</th>
                                        <th className="adr-numcol">Issues</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payload!.sections.map(s => (
                                        <tr key={s.section_id}>
                                            <td>
                                                <span className="adr-section-name">{s.section}</span>
                                                <span className="adr-section-code">{s.course_code}</span>
                                            </td>
                                            <td className="adr-numcol ad-att-num">{s.students}</td>
                                            <td className="adr-numcol ad-att-num">{s.present}</td>
                                            <td className="adr-numcol ad-att-num">{s.absent}</td>
                                            <td className="adr-numcol ad-att-num">{s.incomplete}</td>
                                            <td className="adr-numcol ad-att-num">{s.not_recorded}</td>
                                            <td className="adr-numcol ad-att-num">{formatMinutes(s.avg_minutes)}</td>
                                            <td className="adr-numcol ad-att-num">
                                                {s.issues > 0
                                                    ? <span className="adr-issue is-warning">{s.issues}</span>
                                                    : <span className="adr-muted">0</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Overall OJT status (section 14) */}
                    <div className="ad-att-card">
                        <div className="adr-ojt-strip">
                            <div className="adr-ojt-heading">Overall OJT Status</div>
                            {(['on_track', 'completed', 'monitoring', 'behind', 'not_started'] as const).map(key => (
                                <button
                                    type="button"
                                    className="adr-ojt-item"
                                    key={key}
                                    onClick={() => setTab('ojt')}
                                    title={`Open OJT Progress — ${PROGRESS_LABELS[key]}`}
                                >
                                    <span className="adr-ojt-dot" style={{ background: PROGRESS_COLORS[key] }} />
                                    <span className="adr-ojt-label">{PROGRESS_LABELS[key]}</span>
                                    <strong className="adr-ojt-value" style={{ color: PROGRESS_COLORS[key] }}>
                                        {payload!.ojt[key]}
                                    </strong>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* ══ ATTENDANCE ══ */}
            {tab === 'attendance' && (
                <div className="ad-att-card">
                    <div className="ad-att-card-head">
                        <div>
                            <h2>Attendance — {formatReportDate(payload!.report_date)}</h2>
                            <p>
                                Present {summary.present} · Absent {summary.absent} · Incomplete {summary.incomplete} ·
                                Attendance rate {summary.attendance_rate}%. Filters run across all your sections.
                            </p>
                        </div>
                        <div className="ad-att-tools">
                            <input
                                type="text"
                                className="ad-att-input ad-att-search"
                                placeholder="Search name, section or company"
                                aria-label="Search students"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            <select
                                className="ad-att-input"
                                aria-label="Filter attendance"
                                value={attendanceFilter}
                                onChange={e => setAttendanceFilter(e.target.value as AttendanceFilter)}
                            >
                                {(Object.keys(ATTENDANCE_FILTER_LABELS) as AttendanceFilter[]).map(f => (
                                    <option key={f} value={f}>{ATTENDANCE_FILTER_LABELS[f]}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {attendanceRows.length === 0 ? (
                        <div className="ad-att-empty">
                            <h3>No matching records</h3>
                            <p>No student in your sections matches the current search and filter.</p>
                        </div>
                    ) : (
                        <>
                            <div className="ad-att-scroll">
                                <table className="ad-att-table">
                                    <thead>
                                        <tr>
                                            <th>Student</th><th>Section</th><th>Company</th>
                                            <th className="adr-numcol">Clock In</th>
                                            <th className="adr-numcol">Clock Out</th>
                                            <th className="adr-numcol">Hours</th>
                                            <th>Status</th>
                                            <th style={{ textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedItems.map(s => (
                                            <tr key={s.student_id}>
                                                <td>
                                                    <div className="ad-att-name">{s.name || '—'}</div>
                                                    <div className="ad-att-mail">{s.email}</div>
                                                    {s.issues.length > 0 && (
                                                        <div className="adr-issue-row">
                                                            {s.issues.map(i => (
                                                                <span key={i.code} className={`adr-issue is-${issueTone(i.rank)}`}>{i.label}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>{s.section}</td>
                                                <td>{s.company || <span className="adr-muted">—</span>}</td>
                                                <td className="adr-numcol ad-att-num">{clockLabel(s.clock_in)}</td>
                                                <td className="adr-numcol ad-att-num">
                                                    {s.open_entries > 0
                                                        ? <span className="adr-issue is-danger">Missing</span>
                                                        : clockLabel(s.clock_out)}
                                                </td>
                                                <td className="adr-numcol ad-att-num">
                                                    {formatMinutes(s.day_minutes)}
                                                    {s.day_minutes > payload!.settings.daily_limit_minutes && (
                                                        <div className="adr-over">
                                                            +{formatMinutes(s.day_minutes - payload!.settings.daily_limit_minutes)} over
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={`ad-att-badge ${STATUS_CLASS[s.status ?? 'not_recorded']}`}>
                                                        <i /> {STATUS_LABELS[s.status ?? 'not_recorded']}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button type="button" className="ad-att-view" onClick={() => setProfileId(s.student_id)}>
                                                        <IconEye size={13} /> View
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ padding: '0.6rem 0.95rem' }}>
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    totalItems={totalItems}
                                    itemsPerPage={itemsPerPage}
                                    onPageChange={setCurrentPage}
                                    itemName="students"
                                />
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ══ OJT PROGRESS ══ */}
            {tab === 'ojt' && (
                <>
                    <div className="ad-att-card">
                        <div className="adr-ojt-strip">
                            <div className="adr-ojt-heading">OJT Progress</div>
                            {(['on_track', 'completed', 'monitoring', 'behind', 'not_started'] as const).map(key => (
                                <div className="adr-ojt-item" key={key}>
                                    <span className="adr-ojt-dot" style={{ background: PROGRESS_COLORS[key] }} />
                                    <span className="adr-ojt-label">{PROGRESS_LABELS[key]}</span>
                                    <strong className="adr-ojt-value" style={{ color: PROGRESS_COLORS[key] }}>
                                        {payload!.ojt[key]}
                                    </strong>
                                </div>
                            ))}
                        </div>
                        <p className="adr-card-note">
                            Expected hours are {payload!.settings.daily_limit_minutes / 60} per OJT working day from a
                            student&apos;s first logged day through {formatReportDate(payload!.settings.expected_through)},
                            capped at their required hours. A day still in progress is never counted, so nobody is
                            marked behind for today.
                        </p>
                    </div>

                    <div className="ad-att-card">
                        <div className="ad-att-card-head"><div><h2>Students Behind Expected Progress</h2>
                            <p>More than one full day&apos;s hours short of where they should be.</p></div></div>

                        {payload!.ojt.students_behind.length === 0 ? (
                            <div className="ad-att-empty">
                                <h3>Nobody is behind</h3>
                                <p>Every student with logged hours is at or ahead of their expected progress.</p>
                            </div>
                        ) : (
                            <div className="ad-att-scroll">
                                <table className="ad-att-table">
                                    <thead>
                                        <tr>
                                            <th>Student</th><th>Section</th><th>Company</th>
                                            <th className="adr-numcol">Required</th>
                                            <th className="adr-numcol">Rendered</th>
                                            <th className="adr-numcol">Expected</th>
                                            <th className="adr-numcol">Difference</th>
                                            <th className="adr-numcol">Complete</th>
                                            <th style={{ textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payload!.ojt.students_behind.map(b => (
                                            <tr key={b.student_id}>
                                                <td><div className="ad-att-name">{b.name || '—'}</div></td>
                                                <td>{b.section}</td>
                                                <td>{b.company || <span className="adr-muted">—</span>}</td>
                                                <td className="adr-numcol ad-att-num">{b.required_hours}h</td>
                                                <td className="adr-numcol ad-att-num">{formatMinutes(b.rendered_minutes)}</td>
                                                <td className="adr-numcol ad-att-num">{formatMinutes(b.expected_minutes)}</td>
                                                <td className="adr-numcol ad-att-num">
                                                    <span className="adr-issue is-danger">{formatDelta(b.delta_minutes)}</span>
                                                </td>
                                                <td className="adr-numcol ad-att-num">{b.completion_pct}%</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button type="button" className="ad-att-view" onClick={() => setProfileId(b.student_id)}>
                                                        <IconEye size={13} /> View
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ══ JOURNALS ══ */}
            {tab === 'journals' && (
                <>
                    <div className="adr-kpis adr-kpis--six">
                        {[
                            { label: 'Submitted Today', value: payload!.journals.submitted_today, sub: 'Entries created today', tone: 'neutral' },
                            { label: 'For This Date', value: payload!.journals.entries_for_date, sub: 'Covering the report date', tone: 'neutral' },
                            { label: 'Pending Approval', value: payload!.journals.pending, sub: 'Across all sections', tone: payload!.journals.pending > 0 ? 'warn' : 'muted' },
                            { label: 'Approved', value: payload!.journals.approved, sub: 'All time', tone: 'good' },
                            { label: 'Rejected', value: payload!.journals.rejected, sub: 'All time', tone: payload!.journals.rejected > 0 ? 'bad' : 'muted' },
                            { label: 'Revision Required', value: payload!.journals.revision, sub: 'Awaiting the student', tone: payload!.journals.revision > 0 ? 'warn' : 'muted' },
                        ].map(c => (
                            <div className={`adr-kpi is-${c.tone}`} key={c.label}>
                                <div className="adr-kpi-label">{c.label}</div>
                                <div className="adr-kpi-value">{c.value}</div>
                                <div className="adr-kpi-sub">{c.sub}</div>
                            </div>
                        ))}
                    </div>

                    <div className="ad-att-card">
                        <div className="ad-att-card-head">
                            <div><h2>Journal Activity</h2>
                                <p>Approve or return entries in Pending Approvals — this report does not review them.</p></div>
                            {onOpenApprovals && payload!.journals.pending > 0 && (
                                <button type="button" className="adr-btn" onClick={() => onOpenApprovals('journals')}>
                                    Review {payload!.journals.pending} pending journal{payload!.journals.pending === 1 ? '' : 's'} →
                                </button>
                            )}
                        </div>

                        {payload!.journals.students.length === 0 ? (
                            <div className="ad-att-empty">
                                <h3>No journal activity</h3>
                                <p>Nothing was submitted today and nothing is waiting for your review.</p>
                            </div>
                        ) : (
                            <div className="ad-att-scroll">
                                <table className="ad-att-table">
                                    <thead>
                                        <tr>
                                            <th>Student</th><th>Section</th>
                                            <th className="adr-numcol">Pending</th>
                                            <th className="adr-numcol">Revision</th>
                                            <th className="adr-numcol">Rejected</th>
                                            <th className="adr-numcol">Submitted Today</th>
                                            <th>Last Entry</th>
                                            <th style={{ textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payload!.journals.students.map(j => (
                                            <tr key={j.student_id}>
                                                <td><div className="ad-att-name">{j.name || '—'}</div></td>
                                                <td>{j.section}</td>
                                                <td className="adr-numcol ad-att-num">
                                                    {j.pending > 0 ? <span className="adr-issue is-info">{j.pending}</span> : 0}
                                                </td>
                                                <td className="adr-numcol ad-att-num">
                                                    {j.revision > 0 ? <span className="adr-issue is-warning">{j.revision}</span> : 0}
                                                </td>
                                                <td className="adr-numcol ad-att-num">
                                                    {j.rejected > 0 ? <span className="adr-issue is-danger">{j.rejected}</span> : 0}
                                                </td>
                                                <td className="adr-numcol ad-att-num">{j.submitted_today}</td>
                                                <td>{j.last_entry_date ? formatReportDate(j.last_entry_date) : <span className="adr-muted">—</span>}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {j.pending > 0 && onOpenApprovals ? (
                                                        <button type="button" className="ad-att-view" onClick={() => onOpenApprovals('journals')}>
                                                            <IconEye size={13} /> Review
                                                        </button>
                                                    ) : (
                                                        <button type="button" className="ad-att-view" onClick={() => setProfileId(j.student_id)}>
                                                            <IconEye size={13} /> View
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ══ COMPANIES ══ */}
            {tab === 'companies' && (
                <div className="ad-att-card">
                    <div className="ad-att-card-head"><div><h2>Company Monitoring</h2>
                        <p>Where your students are placed, so a problem concentrated at one company is visible.</p></div></div>

                    {payload!.companies.length === 0 ? (
                        <div className="ad-att-empty">
                            <h3>No companies</h3>
                            <p>None of your students has a company assigned yet.</p>
                        </div>
                    ) : (
                        <div className="ad-att-scroll">
                            <table className="ad-att-table">
                                <thead>
                                    <tr>
                                        <th>Company</th>
                                        <th className="adr-numcol">Students</th>
                                        <th className="adr-numcol">Present</th>
                                        <th className="adr-numcol">Absent</th>
                                        <th className="adr-numcol">Incomplete</th>
                                        <th className="adr-numcol">Avg Hours</th>
                                        <th className="adr-numcol">Issues</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payload!.companies.map(c => (
                                        <tr key={c.company_id ?? 'none'}>
                                            <td><div className="ad-att-name">{c.company}</div></td>
                                            <td className="adr-numcol ad-att-num">{c.students}</td>
                                            <td className="adr-numcol ad-att-num">{c.present}</td>
                                            <td className="adr-numcol ad-att-num">{c.absent}</td>
                                            <td className="adr-numcol ad-att-num">{c.incomplete}</td>
                                            <td className="adr-numcol ad-att-num">{formatMinutes(c.avg_minutes)}</td>
                                            <td className="adr-numcol ad-att-num">
                                                {c.issues > 0
                                                    ? <span className="adr-issue is-warning">{c.issues}</span>
                                                    : <span className="adr-muted">0</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ══ ALERTS ══ */}
            {tab === 'alerts' && (
                <div className="ad-att-card">
                    <div className="ad-att-card-head"><div><h2>⚠️ Alerts &amp; Exceptions</h2>
                        <p>Everything the system detected today. Select one to see the students behind it.</p></div></div>

                    {payload!.alerts.length === 0 ? (
                        <div className="ad-att-empty">
                            <h3>No exceptions</h3>
                            <p>Nothing was flagged across your sections today.</p>
                        </div>
                    ) : (
                        <ul className="adr-alert-list">
                            {payload!.alerts.map(a => (
                                <li key={a.code}>
                                    <button
                                        type="button"
                                        className={`adr-alert is-${a.severity}`}
                                        onClick={() => goToAlert(a.code)}
                                        disabled={!ALERT_TARGET[a.code]}
                                    >
                                        <span className="adr-alert-count">{a.count}</span>
                                        <span className="adr-alert-message">{a.message}</span>
                                        {ALERT_TARGET[a.code] && <span className="adr-alert-go">Show →</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

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
                            This rebuilds {formatReportDate(date)} using the latest attendance, OJT, journal
                            and company data. The version you are looking at now will be replaced.
                        </p>
                        <div className="adr-modal-actions">
                            <button type="button" className="adr-btn" onClick={() => setConfirmRegenerate(false)}>Cancel</button>
                            <button type="button" className="adr-btn adr-btn--primary" onClick={generate}>Regenerate</button>
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
