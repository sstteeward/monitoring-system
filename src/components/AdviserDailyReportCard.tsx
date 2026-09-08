import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    adviserReportService,
    reportDayKey,
    type DailyReport,
} from '../services/adviserReportService';
import { formatClock, formatMinutes, formatReportDate } from '../utils/adviserReport';
import { downloadDailyReportPdf } from '../utils/adviserReportPdf';
import './AdviserReport.css';

/**
 * The Automated Daily Report card on the Adviser dashboard.
 *
 * One button. The adviser never picks a section: the database resolves every
 * section assigned to them, every student in those sections, and today's data,
 * and returns ONE consolidated report — whether they hold one section or
 * fifteen.
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

const IconReport: React.FC<IconProps> = p => (
    <Svg {...p}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </Svg>
);
const IconCheck: React.FC<IconProps> = p => (
    <Svg {...p}><polyline points="20 6 9 17 4 12" /></Svg>
);
const IconAlert: React.FC<IconProps> = p => (
    <Svg {...p}>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </Svg>
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
const IconArrow: React.FC<IconProps> = p => (
    <Svg {...p}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></Svg>
);

/**
 * The stages the generator works through, shown while it runs.
 *
 * They describe what the database is actually doing — sections, then students,
 * then each source of the day's data — so the wait is legible rather than a
 * bare spinner. The real work is one round trip; these advance on a timer and
 * the last one holds until the response lands.
 */
const STAGES = [
    'Identifying your assigned sections',
    'Collecting students',
    'Reading today\'s attendance',
    'Calculating OJT progress',
    'Checking journal activity',
    'Reviewing companies',
    'Detecting students who need attention',
];

interface Props {
    /** Opens the full report view. */
    onOpenReport: () => void;
}

const AdviserDailyReportCard: React.FC<Props> = ({ onOpenReport }) => {
    const today = reportDayKey();

    const [report, setReport] = useState<DailyReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [stage, setStage] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [confirmRegenerate, setConfirmRegenerate] = useState(false);
    const [exporting, setExporting] = useState(false);

    /*
     * Set on the way in as well as cleared on the way out: StrictMode's
     * mount/unmount/remount would otherwise leave this false for the rest of
     * the session, and every later state update would be discarded.
     */
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const existing = await adviserReportService.get(today);
            if (!mounted.current) return;
            setReport(existing);
        } catch (err) {
            if (!mounted.current) return;
            setError(err instanceof Error ? err.message : 'Unable to load today\'s report.');
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, [today]);

    useEffect(() => { load(); }, [load]);

    // Walk the stage list while the request is in flight, holding on the last.
    useEffect(() => {
        if (!generating) { setStage(0); return; }
        const timer = window.setInterval(() => {
            setStage(s => Math.min(s + 1, STAGES.length - 1));
        }, 450);
        return () => window.clearInterval(timer);
    }, [generating]);

    const generate = async () => {
        setGenerating(true);
        setError(null);
        setConfirmRegenerate(false);
        try {
            const fresh = await adviserReportService.generate(today);
            if (!mounted.current) return;
            setReport(fresh);
        } catch (err) {
            if (!mounted.current) return;
            setError(err instanceof Error ? err.message : 'Unable to generate today\'s report. Please try again.');
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

    const summary = report?.report?.summary;

    const stats = summary ? [
        { label: 'Sections', value: summary.sections, color: '#0d9488' },
        { label: 'Students', value: summary.students, color: '#0f766e' },
        { label: 'Present', value: summary.present, color: '#10b981' },
        { label: 'Absent', value: summary.absent, color: '#ef4444' },
        { label: 'Incomplete', value: summary.incomplete, color: '#fb923c' },
        { label: 'Need Attention', value: summary.attention, color: summary.attention > 0 ? '#f59e0b' : '#10b981' },
    ] : [];

    return (
        <div className="adr-card">
            <div className="adr-card-head">
                <div className="adr-card-title">
                    <span className="adr-card-icon"><IconReport size={17} /></span>
                    <div>
                        <h2>Today&apos;s SIL/OJT Report</h2>
                        <p>{formatReportDate(today)} · every section assigned to you, in one report</p>
                    </div>
                </div>
                {report && !generating && (
                    <span className="adr-ready-pill">
                        <IconCheck size={12} /> Ready · {formatClock(report.generated_at)}
                    </span>
                )}
            </div>

            <div className="adr-card-body">
                {loading ? (
                    <div className="adr-skeleton" aria-label="Loading today's report status">
                        <span /><span /><span />
                    </div>
                ) : generating ? (
                    <div className="adr-progress" role="status" aria-live="polite">
                        <div className="adr-progress-title">Generating your report…</div>
                        <ul className="adr-stages">
                            {STAGES.map((label, index) => (
                                <li
                                    key={label}
                                    className={index < stage ? 'is-done' : index === stage ? 'is-active' : ''}
                                >
                                    <i>{index < stage ? <IconCheck size={11} /> : null}</i>
                                    {label}
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : report ? (
                    <>
                        <div className="adr-stat-row">
                            {stats.map(s => (
                                <div className="adr-stat" key={s.label}>
                                    <div className="adr-stat-value" style={{ color: s.color }}>{s.value}</div>
                                    <div className="adr-stat-label">{s.label}</div>
                                </div>
                            ))}
                            <div className="adr-stat">
                                <div className="adr-stat-value">{formatMinutes(summary?.total_minutes ?? 0)}</div>
                                <div className="adr-stat-label">Hours Today</div>
                            </div>
                            <div className="adr-stat">
                                <div className="adr-stat-value">{summary?.journals_pending ?? 0}</div>
                                <div className="adr-stat-label">Pending Journals</div>
                            </div>
                        </div>

                        {(summary?.attention ?? 0) > 0 && (
                            <button type="button" className="adr-attention-banner" onClick={onOpenReport}>
                                <IconAlert size={15} />
                                <span>
                                    <strong>{summary?.attention}</strong> student{summary?.attention === 1 ? '' : 's'} need
                                    {summary?.attention === 1 ? 's' : ''} your attention today.
                                </span>
                                <IconArrow size={14} />
                            </button>
                        )}
                    </>
                ) : (
                    <div className="adr-empty">
                        <p>Today&apos;s report isn&apos;t ready yet.</p>
                        <span>
                            One click checks attendance, clock-in and clock-out records, OJT progress,
                            journals and companies across every section assigned to you.
                        </span>
                    </div>
                )}

                {error && (
                    <div className="adr-error" role="alert">
                        <IconAlert size={14} /> {error}
                    </div>
                )}
            </div>

            <div className="adr-card-actions">
                {report ? (
                    <>
                        <button type="button" className="adr-btn adr-btn--primary" onClick={onOpenReport}>
                            View Report <IconArrow size={14} />
                        </button>
                        <button
                            type="button"
                            className="adr-btn"
                            onClick={() => setConfirmRegenerate(true)}
                            disabled={generating}
                        >
                            <IconRefresh size={14} /> Regenerate
                        </button>
                        <button
                            type="button"
                            className="adr-btn"
                            onClick={exportPdf}
                            disabled={exporting}
                        >
                            <IconDownload size={14} /> {exporting ? 'Preparing…' : 'Export PDF'}
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        className="adr-btn adr-btn--primary"
                        onClick={generate}
                        disabled={generating || loading}
                    >
                        {generating ? 'Generating…' : 'Generate Today\'s Report'}
                    </button>
                )}
            </div>

            {confirmRegenerate && (
                <div className="adr-modal-backdrop" role="presentation" onClick={() => setConfirmRegenerate(false)}>
                    <div
                        className="adr-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="adr-regen-title"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 id="adr-regen-title">Regenerate today&apos;s report?</h3>
                        <p>
                            This rebuilds the report using the latest attendance, OJT, journal and
                            company data. The version you are looking at now will be replaced.
                        </p>
                        <div className="adr-modal-actions">
                            <button type="button" className="adr-btn" onClick={() => setConfirmRegenerate(false)}>
                                Cancel
                            </button>
                            <button type="button" className="adr-btn adr-btn--primary" onClick={generate}>
                                Regenerate
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdviserDailyReportCard;
