import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { profileService } from '../services/profileService';
import {
    evaluationService,
    type CompanyTemplate,
    type EvaluationWorklistRow,
} from '../services/evaluationService';
import {
    DOCUMENT_LABEL,
    EVALUATION_CRITERIA,
    EVALUATION_SECTIONS,
    RATING_SCALE,
    STATUS_LABEL,
    computeScore,
    describeDeadline,
    formatDate,
    isComplete,
    isPending,
    ratedCount,
    ratingLabel,
    type EvaluationScoreKey,
    type EvaluationScores,
    type EvaluationStatus,
} from '../utils/evaluationForms';
import './Evaluations.css';

/**
 * Company — student evaluations.
 *
 * The coordinator's PDF is the official form; this is where it actually gets
 * answered. Nobody downloads it, fills it in by hand and uploads it back — the
 * company rates each student here, and the result reaches the student, their
 * adviser and the coordinator the moment it is submitted.
 *
 * The form is the page, not a dialog on top of it: a roster on the left and the
 * open evaluation on the right. Eleven criteria in a modal is a column of
 * scrolling; the same eleven in the page's full width are two or three columns
 * that fit on one screen.
 *
 * The PDF stays one click away as the reference it is meant to be.
 */

const Icon = {
    close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
    search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
    file: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
    star: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
    users: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>,
};

type Filter = EvaluationStatus | 'all' | 'pending';

const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'To do' },
    { value: 'in_progress', label: 'Started' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'reviewed', label: 'Reviewed' },
];

/** 1 → 5 reads left to right in a segmented control; the rubric lists it 5 → 1. */
const SCALE = [...RATING_SCALE].sort((a, b) => a.value - b.value);

/** Two letters is all the roster has room for. */
function initials(name: string | null): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '—';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function matches(row: EvaluationWorklistRow, filter: Filter): boolean {
    if (filter === 'all') return true;
    if (filter === 'pending') return isPending(row.status);
    return row.status === filter;
}

const CompanyEvaluationView: React.FC = () => {
    const location = useLocation();
    const [companyId, setCompanyId] = useState<string | null>(null);
    const [rows, setRows] = useState<EvaluationWorklistRow[]>([]);
    const [templates, setTemplates] = useState<CompanyTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [filter, setFilter] = useState<Filter>('all');
    const [search, setSearch] = useState('');

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [viewingPdf, setViewingPdf] = useState(false);
    const [toast, setToast] = useState<{ tone: 'success' | 'warning'; title: string; detail?: string } | null>(null);

    // The form is no longer a modal, so switching students is a click away from
    // unsaved answers. The canvas reports whether it holds any.
    const dirty = useRef(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await profileService.getCurrentProfile();
            if (!profile?.company_id) throw new Error('You are not associated with any company.');
            setCompanyId(profile.company_id);

            const [worklist, templateRows] = await Promise.all([
                evaluationService.getWorklist(profile.company_id),
                evaluationService.getCompanyTemplates(profile.company_id),
            ]);
            setRows(worklist);
            setTemplates(templateRows);
        } catch (err) {
            console.error('Failed to load the evaluation worklist:', err);
            setError(err instanceof Error ? err.message : 'We could not load your student evaluations.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    // A notification or the dashboard can send the company straight to one student.
    useEffect(() => {
        const targetId = (location.state as { studentId?: string } | null)?.studentId;
        if (!targetId || rows.length === 0) return;
        if (rows.some(row => row.student_id === targetId)) setSelectedId(targetId);
    }, [location.state, rows]);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), 8000);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const evaluationTemplate = templates.find(row => row.document_type === 'evaluation' && row.template_id) ?? null;

    const counts = useMemo(() => ({
        all: rows.length,
        pending: rows.filter(row => isPending(row.status)).length,
        in_progress: rows.filter(row => row.status === 'in_progress').length,
        submitted: rows.filter(row => row.status === 'submitted').length,
        reviewed: rows.filter(row => row.status === 'reviewed').length,
        not_started: rows.filter(row => row.status === 'not_started').length,
    }), [rows]);

    const done = counts.submitted + counts.reviewed;

    const average = useMemo(() => {
        const scored = rows.filter(row => typeof row.total_score === 'number');
        if (scored.length === 0) return null;
        return scored.reduce((sum, row) => sum + Number(row.total_score), 0) / scored.length;
    }, [rows]);

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return rows.filter(row => {
            if (!matches(row, filter)) return false;
            if (!term) return true;
            return [row.student_name, row.student_email, row.course, row.section]
                .some(field => (field || '').toLowerCase().includes(term));
        });
    }, [rows, filter, search]);

    // An empty right-hand pane on a page that exists to fill in forms is wasted
    // space, so the first outstanding student is opened for them.
    useEffect(() => {
        if (selectedId || visible.length === 0) return;
        const first = visible.find(row => row.evaluation_id && isPending(row.status)) ?? visible[0];
        setSelectedId(first.student_id);
    }, [visible, selectedId]);

    const selected = rows.find(row => row.student_id === selectedId) ?? null;

    const select = (row: EvaluationWorklistRow) => {
        if (row.student_id === selectedId) return;
        if (dirty.current && !window.confirm('This evaluation has unsaved answers. Leave without saving?')) return;
        dirty.current = false;
        setSelectedId(row.student_id);
    };

    const deadline = evaluationTemplate?.evaluation_deadline
        ? describeDeadline(evaluationTemplate.evaluation_deadline)
        : null;

    return (
        <div className="evx fade-in">
            <header className="evx-hero">
                <div className="evx-hero-main">
                    <h2 className="evx-title">
                        <span className="evx-title-icon" aria-hidden="true">{Icon.star}</span>
                        Student Evaluations
                    </h2>
                    <p className="evx-sub">
                        Rate each assigned student against the official SIL/OJT form. Submitting notifies the
                        student, their adviser and the coordinator.
                    </p>
                </div>

                <ul className="evx-rail">
                    <li className="evx-rail-item">
                        <span className="evx-rail-value">{counts.all}</span>
                        <span className="evx-rail-label">Assigned</span>
                    </li>
                    <li className="evx-rail-item">
                        <span className={`evx-rail-value${counts.pending > 0 ? ' warn' : ''}`}>{counts.pending}</span>
                        <span className="evx-rail-label">To evaluate</span>
                    </li>
                    <li className="evx-rail-item">
                        <span className="evx-rail-value accent">{done}</span>
                        <span className="evx-rail-label">Completed</span>
                    </li>
                    <li className="evx-rail-item">
                        <span className="evx-rail-value">{average === null ? '—' : `${average.toFixed(0)}%`}</span>
                        <span className="evx-rail-label">Average</span>
                    </li>
                </ul>

                <div className="evx-hero-actions">
                    {deadline && <span className={`evx-deadline evx-deadline-${deadline.tone}`}>{deadline.text}</span>}
                    {evaluationTemplate && (
                        <button type="button" className="evx-btn evx-btn-quiet" onClick={() => setViewingPdf(true)}>
                            {Icon.file} Official Form
                        </button>
                    )}
                </div>
            </header>

            {loading ? (
                <div className="evx-work">
                    <div className="evx-roster"><div className="evx-state">Loading students…</div></div>
                    <div className="evx-canvas"><div className="evx-state">Loading your student evaluations…</div></div>
                </div>
            ) : error ? (
                <div className="evx-canvas">
                    <div className="evx-state">
                        <p>{error}</p>
                        <button type="button" className="evx-btn evx-btn-quiet" onClick={() => void load()}>Try again</button>
                    </div>
                </div>
            ) : rows.length === 0 ? (
                <div className="evx-canvas">
                    <div className="evx-empty">
                        <span className="evx-empty-icon" aria-hidden="true">{Icon.users}</span>
                        <p className="evx-empty-title">No students assigned</p>
                        <p className="evx-empty-sub">
                            Once the college assigns interns to your company they appear here with an
                            evaluation each.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="evx-work">
                    {/* ── Roster ───────────────────────────────────────────── */}
                    <aside className="evx-roster">
                        <div className="evx-roster-head">
                            <div className="evx-search">
                                <span className="evx-search-icon" aria-hidden="true">{Icon.search}</span>
                                <input
                                    type="search"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search student…"
                                    aria-label="Search students"
                                />
                            </div>
                            <div className="evx-chips" role="group" aria-label="Filter by status">
                                {FILTERS.map(option => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={`evx-chip${filter === option.value ? ' active' : ''}`}
                                        aria-pressed={filter === option.value}
                                        onClick={() => setFilter(option.value)}
                                    >
                                        {option.label}
                                        <span className="evx-chip-count">{counts[option.value]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="evx-roster-list" role="listbox" aria-label="Assigned students">
                            {visible.length === 0 ? (
                                <div className="evx-state">No students match this filter.</div>
                            ) : visible.map(row => (
                                <button
                                    key={row.student_id}
                                    type="button"
                                    role="option"
                                    aria-selected={row.student_id === selectedId}
                                    className={`evx-roster-item${row.student_id === selectedId ? ' active' : ''}`}
                                    onClick={() => select(row)}
                                >
                                    <span className="evx-avatar" aria-hidden="true">{initials(row.student_name)}</span>
                                    <span className="evx-roster-main">
                                        <span className="evx-roster-name">{row.student_name || 'Unnamed student'}</span>
                                        <span className="evx-roster-meta">
                                            {[row.course, row.section].filter(Boolean).join(' · ') || 'No program on file'}
                                        </span>
                                    </span>
                                    <span className="evx-roster-side">
                                        <span
                                            className={`evx-dot evx-dot-${row.status}`}
                                            title={STATUS_LABEL[row.status]}
                                            aria-label={STATUS_LABEL[row.status]}
                                        />
                                        {row.total_score !== null && row.total_score !== undefined && (
                                            <span className="evx-roster-score">{Number(row.total_score).toFixed(0)}%</span>
                                        )}
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div className="evx-roster-foot">
                            {visible.length} of {rows.length} shown · {done}/{rows.length} completed
                        </div>
                    </aside>

                    {/* ── Canvas ───────────────────────────────────────────── */}
                    {!evaluationTemplate ? (
                        <section className="evx-canvas">
                            <div className="evx-empty">
                                <span className="evx-empty-icon" aria-hidden="true">{Icon.file}</span>
                                <p className="evx-empty-title">No evaluation form published yet</p>
                                <p className="evx-empty-sub">
                                    The SIL Coordinator has not published an evaluation form for your company.
                                    You will be emailed as soon as they do.
                                </p>
                            </div>
                        </section>
                    ) : !selected ? (
                        <section className="evx-canvas">
                            <div className="evx-empty">
                                <span className="evx-empty-icon" aria-hidden="true">{Icon.users}</span>
                                <p className="evx-empty-title">Select a student</p>
                                <p className="evx-empty-sub">Pick anyone from the roster to open their evaluation.</p>
                            </div>
                        </section>
                    ) : !selected.evaluation_id ? (
                        <section className="evx-canvas">
                            <div className="evx-empty">
                                <span className="evx-empty-icon" aria-hidden="true">{Icon.file}</span>
                                <p className="evx-empty-title">No evaluation for this student</p>
                                <p className="evx-empty-sub">
                                    {selected.student_name} has no evaluation on file yet. It is created when the
                                    coordinator publishes the form for your company.
                                </p>
                            </div>
                        </section>
                    ) : (
                        <EvaluationCanvas
                            key={selected.evaluation_id}
                            row={selected}
                            template={evaluationTemplate}
                            onDirtyChange={value => { dirty.current = value; }}
                            onSubmitted={(score) => {
                                dirty.current = false;
                                void load();
                                setToast({
                                    tone: 'success',
                                    title: `Evaluation submitted for ${selected.student_name ?? 'the student'}.`,
                                    detail: `Overall score ${score !== null ? `${score.toFixed(0)}%` : '—'}. The student, their adviser and the coordinator have been notified.`,
                                });
                            }}
                            onSaved={() => {
                                dirty.current = false;
                                void load();
                                setToast({ tone: 'success', title: 'Draft saved.', detail: 'You can come back and finish this evaluation later.' });
                            }}
                        />
                    )}
                </div>
            )}

            {toast && (
                <div className={`evx-toast evx-toast-${toast.tone}`} role="status">
                    <div>
                        <strong>{toast.title}</strong>
                        {toast.detail && <p>{toast.detail}</p>}
                    </div>
                    <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">{Icon.close}</button>
                </div>
            )}

            {viewingPdf && evaluationTemplate?.file_path && companyId && (
                <PdfViewer template={evaluationTemplate} onClose={() => setViewingPdf(false)} />
            )}
        </div>
    );
};

// ─── The digital form, inline ────────────────────────────────────────────────

const EvaluationCanvas: React.FC<{
    row: EvaluationWorklistRow;
    template: CompanyTemplate | null;
    onDirtyChange: (dirty: boolean) => void;
    onSubmitted: (score: number | null) => void;
    onSaved: () => void;
}> = ({ row, template, onDirtyChange, onSubmitted, onSaved }) => {
    const [scores, setScores] = useState<EvaluationScores>({});
    const [comments, setComments] = useState('');
    const [strengths, setStrengths] = useState('');
    const [weaknesses, setWeaknesses] = useState('');
    const [recommendations, setRecommendations] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);

    // A submitted evaluation is the company's final answer, so it opens read-only.
    const readOnly = row.status === 'submitted' || row.status === 'reviewed';

    useEffect(() => {
        if (!row.evaluation_id) return;
        let cancelled = false;
        setLoading(true);
        evaluationService.getEvaluation(row.evaluation_id)
            .then(saved => {
                if (cancelled || !saved) return;
                setScores(saved.scores);
                setComments(saved.comments ?? '');
                setStrengths(saved.strengths ?? '');
                setWeaknesses(saved.weaknesses ?? '');
                setRecommendations(saved.recommendations ?? '');
            })
            .catch(err => {
                if (cancelled) return;
                console.error('Failed to load the saved answers:', err);
                setError('We could not load this evaluation.');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [row.evaluation_id]);

    // Anything the evaluator types after the saved answers have loaded is
    // unsaved work, and leaving the student would drop it.
    useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

    const touch = () => { if (!readOnly) onDirtyChange(true); };

    const rated = ratedCount(scores);
    const score = computeScore(scores);
    const complete = isComplete(scores);
    const total = EVALUATION_CRITERIA.length;

    const submittedScore = row.total_score !== null && row.total_score !== undefined
        ? Number(row.total_score)
        : score?.percentage ?? null;

    const answers = () => ({
        scores,
        comments: comments.trim() || null,
        strengths: strengths.trim() || null,
        weaknesses: weaknesses.trim() || null,
        recommendations: recommendations.trim() || null,
    });

    const save = async () => {
        if (!row.evaluation_id) return;
        setBusy('save');
        setError(null);
        try {
            await evaluationService.saveDraft(row.evaluation_id, answers());
            onSaved();
        } catch (err) {
            console.error('Save failed:', err);
            setError(err instanceof Error ? err.message : 'We could not save this draft.');
        } finally {
            setBusy(null);
        }
    };

    const submit = async () => {
        if (!row.evaluation_id) return;
        setBusy('submit');
        setError(null);
        try {
            const result = await evaluationService.submit(row.evaluation_id, answers());
            onSubmitted(result.totalScore);
        } catch (err) {
            console.error('Submit failed:', err);
            setError(err instanceof Error ? err.message : 'We could not submit this evaluation.');
            setBusy(null);
            setConfirming(false);
        }
    };

    const notes: [string, string][] = readOnly
        ? ([
            ['Comments', comments],
            ['Strengths', strengths],
            ['Areas to improve', weaknesses],
            ['Recommendations', recommendations],
        ] as [string, string][]).filter(([, value]) => value.trim().length > 0)
        : [];

    return (
        <section className="evx-canvas">
            <header className="evx-canvas-head">
                <div className="evx-canvas-id">
                    <span className="evx-avatar" aria-hidden="true">{initials(row.student_name)}</span>
                    <div>
                        <div className="evx-canvas-name">{row.student_name || 'Unnamed student'}</div>
                        <span className="evx-canvas-meta">
                            {[row.course, row.section, row.student_email].filter(Boolean).join(' · ') || 'No program on file'}
                        </span>
                    </div>
                </div>

                <div className="evx-canvas-side">
                    {readOnly ? (
                        <div className="evx-scorebox">
                            <div
                                className="evx-ring"
                                style={{ '--evx-pct': submittedScore ?? 0 } as React.CSSProperties}
                                aria-hidden="true"
                            >
                                <span className="evx-ring-value">
                                    {submittedScore === null ? '—' : `${submittedScore.toFixed(0)}%`}
                                </span>
                            </div>
                            <div className="evx-scorebox-main">
                                <span className={`evx-status evx-status-${row.status}`}>
                                    <span className="evx-status-dot" aria-hidden="true" />
                                    {STATUS_LABEL[row.status]}
                                </span>
                                <span className="evx-canvas-meta">
                                    Submitted {formatDate(row.submitted_at)}
                                    {row.evaluator_name ? ` by ${row.evaluator_name}` : ''}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="evx-scorebox">
                            <div
                                className="evx-ring"
                                style={{ '--evx-pct': (rated / total) * 100 } as React.CSSProperties}
                                aria-hidden="true"
                            >
                                <span className="evx-ring-value">{rated}/{total}</span>
                            </div>
                            <div className="evx-scorebox-main">
                                <span className="evx-scorebox-value">
                                    {score ? `${score.percentage.toFixed(0)}%` : '—'}
                                </span>
                                <span className="evx-ring-caption">
                                    {score ? `Overall · ${score.rating.toFixed(2)} / 5` : 'Rate all to score'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            <div className="evx-canvas-body">
                {loading ? (
                    <div className="evx-state">Loading the evaluation…</div>
                ) : (
                    <div className="evx-rubric">
                        {!readOnly && (
                            <div className="evx-legend">
                                <span>Rating scale</span>
                                {SCALE.map(option => (
                                    <span key={option.value}><b>{option.value}</b> {option.label}</span>
                                ))}
                            </div>
                        )}

                        {EVALUATION_SECTIONS.map(section => {
                            const sectionRated = section.criteria.filter(criterion => scores[criterion.key]).length;
                            return (
                                <div key={section.title}>
                                    <div className="evx-section-head">
                                        <h4 className="evx-section-title">{section.title}</h4>
                                        <span className="evx-section-rule" aria-hidden="true" />
                                        <span className="evx-section-count">{sectionRated}/{section.criteria.length}</span>
                                    </div>
                                    <div className="evx-crits">
                                        {section.criteria.map(criterion => {
                                            const value = scores[criterion.key] ?? null;
                                            return (
                                                <div
                                                    key={criterion.key}
                                                    className={`evx-crit${value ? ' rated' : ''}${readOnly ? ' readonly' : ''}`}
                                                >
                                                    <div className="evx-crit-top">
                                                        <div>
                                                            <div className="evx-crit-label">{criterion.label}</div>
                                                            {!readOnly && <p className="evx-crit-hint">{criterion.hint}</p>}
                                                        </div>
                                                        <span className={`evx-crit-answer${value ? '' : ' empty'}`}>
                                                            {value ? `${value} · ${ratingLabel(value)}` : 'Not rated'}
                                                        </span>
                                                    </div>

                                                    {!readOnly && (
                                                        <div className="evx-scale" role="radiogroup" aria-label={criterion.label}>
                                                            {SCALE.map(option => (
                                                                <button
                                                                    key={option.value}
                                                                    type="button"
                                                                    role="radio"
                                                                    aria-checked={value === option.value}
                                                                    aria-label={`${option.value} — ${option.label}`}
                                                                    title={option.label}
                                                                    className={`evx-scale-btn${value === option.value ? ' selected' : ''}`}
                                                                    disabled={Boolean(busy)}
                                                                    onClick={() => {
                                                                        touch();
                                                                        setScores(current => ({
                                                                            ...current,
                                                                            [criterion.key as EvaluationScoreKey]: option.value,
                                                                        }));
                                                                    }}
                                                                >
                                                                    {option.value}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}

                        <div>
                            <div className="evx-section-head">
                                <h4 className="evx-section-title">Written Feedback</h4>
                                <span className="evx-section-rule" aria-hidden="true" />
                            </div>

                            {readOnly ? (
                                notes.length === 0 ? (
                                    <p className="evx-field-hint" style={{ marginTop: 0 }}>
                                        The evaluator left no written feedback.
                                    </p>
                                ) : (
                                    <div className="evx-notes">
                                        {notes.map(([label, value]) => (
                                            <div key={label} className={label === 'Comments' ? 'wide' : undefined}>
                                                <span className="evx-field-label">{label}</span>
                                                <p className="evx-prose">{value}</p>
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : (
                                <div className="evx-notes">
                                    <div className="wide">
                                        <label className="evx-field-label" htmlFor="evx-comments">Overall comments</label>
                                        <textarea
                                            id="evx-comments"
                                            className="evx-textarea"
                                            value={comments}
                                            disabled={Boolean(busy)}
                                            placeholder="Overall remarks on this student's performance…"
                                            onChange={e => { touch(); setComments(e.target.value); }}
                                        />
                                    </div>
                                    <div>
                                        <label className="evx-field-label" htmlFor="evx-strengths">Strengths</label>
                                        <textarea
                                            id="evx-strengths"
                                            className="evx-textarea"
                                            value={strengths}
                                            disabled={Boolean(busy)}
                                            onChange={e => { touch(); setStrengths(e.target.value); }}
                                        />
                                    </div>
                                    <div>
                                        <label className="evx-field-label" htmlFor="evx-weaknesses">Areas to improve</label>
                                        <textarea
                                            id="evx-weaknesses"
                                            className="evx-textarea"
                                            value={weaknesses}
                                            disabled={Boolean(busy)}
                                            onChange={e => { touch(); setWeaknesses(e.target.value); }}
                                        />
                                    </div>
                                    <div>
                                        <label className="evx-field-label" htmlFor="evx-recommendations">Recommendations</label>
                                        <textarea
                                            id="evx-recommendations"
                                            className="evx-textarea"
                                            value={recommendations}
                                            disabled={Boolean(busy)}
                                            onChange={e => { touch(); setRecommendations(e.target.value); }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <footer className="evx-canvas-foot">
                {confirming && (
                    <p className="evx-warning">
                        Submitting is final — the evaluation cannot be edited afterwards, and
                        {' '}{row.student_name}, their adviser and the coordinator are notified straight away.
                    </p>
                )}
                {error && <p className="evx-error">{error}</p>}

                {readOnly ? (
                    <span className="evx-canvas-note">
                        Submitted evaluations are read-only.
                        {template?.file_name ? ` Official form: ${template.file_name}` : ''}
                    </span>
                ) : (
                    <>
                        <span className="evx-canvas-note">
                            {complete
                                ? 'All criteria rated — ready to submit.'
                                : `${total - rated} criteri${total - rated === 1 ? 'on' : 'a'} left to rate.`}
                        </span>
                        {confirming ? (
                            <>
                                <button type="button" className="evx-btn evx-btn-ghost" onClick={() => setConfirming(false)} disabled={Boolean(busy)}>
                                    Go back
                                </button>
                                <button type="button" className="evx-btn evx-btn-primary" onClick={() => void submit()} disabled={Boolean(busy)}>
                                    {busy === 'submit' ? 'Submitting…' : 'Yes, submit evaluation'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button type="button" className="evx-btn evx-btn-ghost" onClick={() => void save()} disabled={Boolean(busy) || loading}>
                                    {busy === 'save' ? 'Saving…' : 'Save Draft'}
                                </button>
                                <button
                                    type="button"
                                    className="evx-btn evx-btn-primary"
                                    onClick={() => setConfirming(true)}
                                    disabled={!complete || Boolean(busy) || loading}
                                    title={complete ? undefined : 'Rate every criterion first'}
                                >
                                    Submit Evaluation
                                </button>
                            </>
                        )}
                    </>
                )}
            </footer>
        </section>
    );
};

// ─── The official PDF, as reference ──────────────────────────────────────────

const PdfViewer: React.FC<{ template: CompanyTemplate; onClose: () => void }> = ({ template, onClose }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!template.file_path) return;
        let cancelled = false;
        void Promise.all([
            evaluationService.getTemplateUrl(template.file_path),
            evaluationService.getTemplateDownloadUrl(template.file_path, template.file_name ?? 'evaluation.pdf'),
        ]).then(([viewLink, saveLink]) => {
            if (cancelled) return;
            setUrl(viewLink);
            setDownloadUrl(saveLink);
        }).catch(err => {
            if (cancelled) return;
            console.error('Failed to open the official form:', err);
            setError('We could not open the official form.');
        });
        return () => { cancelled = true; };
    }, [template]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = '';
        };
    }, [onClose]);

    return (
        <div className="evx-overlay" role="presentation" onClick={onClose}>
            <div
                className="evx-modal tall"
                style={{ maxWidth: 900 }}
                role="dialog"
                aria-modal="true"
                aria-label="Official evaluation form"
                onClick={e => e.stopPropagation()}
            >
                <header className="evx-modal-head">
                    <div>
                        <h3>Official {DOCUMENT_LABEL[template.document_type]} Form</h3>
                        <p className="evx-modal-sub">
                            Reference only — complete the evaluation using the form in the system.
                        </p>
                    </div>
                    <button type="button" className="evx-icon-btn" onClick={onClose} aria-label="Close">{Icon.close}</button>
                </header>

                <div className="evx-viewer">
                    {error ? (
                        <div className="evx-state">{error}</div>
                    ) : !url ? (
                        <div className="evx-state">Opening the official form…</div>
                    ) : (
                        <iframe src={url} title="Official evaluation form" />
                    )}
                </div>

                <footer className="evx-modal-foot">
                    {downloadUrl && (
                        <a className="evx-btn evx-btn-ghost" href={downloadUrl} target="_blank" rel="noopener noreferrer">Download</a>
                    )}
                    <button type="button" className="evx-btn evx-btn-primary" onClick={onClose}>Done</button>
                </footer>
            </div>
        </div>
    );
};

export default CompanyEvaluationView;
