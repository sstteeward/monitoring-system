import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
 * The PDF stays one click away as the reference it is meant to be.
 */

const Icon = {
    close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
    search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
    file: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
};

const FILTERS: { value: EvaluationStatus | 'all' | 'pending'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'reviewed', label: 'Reviewed' },
];

const CompanyEvaluationView: React.FC = () => {
    const location = useLocation();
    const [companyId, setCompanyId] = useState<string | null>(null);
    const [rows, setRows] = useState<EvaluationWorklistRow[]>([]);
    const [templates, setTemplates] = useState<CompanyTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [filter, setFilter] = useState<EvaluationStatus | 'all' | 'pending'>('all');
    const [search, setSearch] = useState('');

    const [evaluating, setEvaluating] = useState<EvaluationWorklistRow | null>(null);
    const [viewingPdf, setViewingPdf] = useState(false);
    const [toast, setToast] = useState<{ tone: 'success' | 'warning'; title: string; detail?: string } | null>(null);

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
        const match = rows.find(row => row.student_id === targetId);
        if (match?.evaluation_id) setEvaluating(match);
    }, [location.state, rows]);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), 8000);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const evaluationTemplate = templates.find(row => row.document_type === 'evaluation' && row.template_id);
    const pendingRows = rows.filter(row => isPending(row.status));

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return rows.filter(row => {
            if (filter === 'pending' && !isPending(row.status)) return false;
            if (filter !== 'all' && filter !== 'pending' && row.status !== filter) return false;
            if (!term) return true;
            return [row.student_name, row.student_email, row.course, row.section]
                .some(field => (field || '').toLowerCase().includes(term));
        });
    }, [rows, filter, search]);

    const deadline = evaluationTemplate?.evaluation_deadline
        ? describeDeadline(evaluationTemplate.evaluation_deadline)
        : null;

    return (
        <div className="evx fade-in">
            <header className="evx-head">
                <div>
                    <h2 className="evx-title">Student Evaluations</h2>
                    <p className="evx-sub">
                        Complete each assigned student&apos;s SIL/OJT evaluation here. The official form stays
                        available for reference.
                    </p>
                </div>
                {evaluationTemplate && (
                    <button type="button" className="evx-btn evx-btn-quiet" onClick={() => setViewingPdf(true)}>
                        {Icon.file} View Official Form
                    </button>
                )}
            </header>

            {pendingRows.length > 0 && (
                <div className="evx-pending">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span className="evx-pending-count">{pendingRows.length}</span>
                        <span className="evx-pending-text">
                            student evaluation{pendingRows.length === 1 ? '' : 's'} require{pendingRows.length === 1 ? 's' : ''} your attention.
                        </span>
                    </div>
                    {deadline && (
                        <span className={`evx-deadline evx-deadline-${deadline.tone}`}>{deadline.text}</span>
                    )}
                </div>
            )}

            <div className="evx-toolbar">
                <div className="evx-search" style={{ flex: '1 1 240px', padding: 0, border: 0 }}>
                    <span className="evx-search-icon" aria-hidden="true" style={{ left: '0.65rem' }}>{Icon.search}</span>
                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search student…"
                        aria-label="Search students"
                    />
                </div>
                <div className="evx-filters" role="group" aria-label="Filter by status">
                    {FILTERS.map(option => (
                        <button
                            key={option.value}
                            type="button"
                            className={`evx-filter${filter === option.value ? ' active' : ''}`}
                            aria-pressed={filter === option.value}
                            onClick={() => setFilter(option.value)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="evx-table-wrap">
                {loading ? (
                    <div className="evx-state">Loading your student evaluations…</div>
                ) : error ? (
                    <div className="evx-state">
                        <p>{error}</p>
                        <button type="button" className="evx-btn evx-btn-quiet" onClick={() => void load()}>Try again</button>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="evx-state">No students are currently assigned to your company.</div>
                ) : !evaluationTemplate ? (
                    <div className="evx-state">
                        The SIL Coordinator has not published an evaluation form for your company yet.
                        You will be emailed as soon as they do.
                    </div>
                ) : visible.length === 0 ? (
                    <div className="evx-state">No students match this filter.</div>
                ) : (
                    <table className="evx-table">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Program</th>
                                <th>Evaluation</th>
                                <th>Status</th>
                                <th aria-label="Actions" />
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(row => (
                                <tr key={row.student_id}>
                                    <td>
                                        <span className="evx-doc-name">{row.student_name || 'Unnamed student'}</span>
                                        <span className="evx-doc-file">{row.student_email}</span>
                                    </td>
                                    <td>
                                        {row.course || '—'}
                                        <span className="evx-doc-file">{row.section || 'No section'}</span>
                                    </td>
                                    <td>
                                        {row.evaluation_id ? 'Available' : 'Not available'}
                                        {row.submitted_at && <span className="evx-doc-file">{formatDate(row.submitted_at)}</span>}
                                    </td>
                                    <td>
                                        <span className={`evx-status evx-status-${row.status}`}>
                                            <span className="evx-status-dot" aria-hidden="true" />
                                            {STATUS_LABEL[row.status]}
                                        </span>
                                        {row.total_score !== null && row.total_score !== undefined && (
                                            <span className="evx-doc-file">{Number(row.total_score).toFixed(0)}%</span>
                                        )}
                                    </td>
                                    <td>
                                        <div className="evx-row-actions">
                                            {!row.evaluation_id ? (
                                                <span className="evx-doc-file">—</span>
                                            ) : isPending(row.status) ? (
                                                <button type="button" className="evx-btn evx-btn-primary" onClick={() => setEvaluating(row)}>
                                                    {row.status === 'in_progress' ? 'Continue' : 'Evaluate'}
                                                </button>
                                            ) : (
                                                <button type="button" className="evx-btn evx-btn-quiet" onClick={() => setEvaluating(row)}>View</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {toast && (
                <div className={`evx-toast evx-toast-${toast.tone}`} role="status">
                    <div>
                        <strong>{toast.title}</strong>
                        {toast.detail && <p>{toast.detail}</p>}
                    </div>
                    <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">{Icon.close}</button>
                </div>
            )}

            {evaluating?.evaluation_id && (
                <EvaluationForm
                    row={evaluating}
                    template={evaluationTemplate ?? null}
                    onClose={() => setEvaluating(null)}
                    onSubmitted={(score) => {
                        setEvaluating(null);
                        void load();
                        setToast({
                            tone: 'success',
                            title: `Evaluation submitted for ${evaluating.student_name ?? 'the student'}.`,
                            detail: `Overall score ${score !== null ? `${score.toFixed(0)}%` : '—'}. The student, their adviser and the coordinator have been notified.`,
                        });
                    }}
                    onSaved={() => {
                        void load();
                        setToast({ tone: 'success', title: 'Draft saved.', detail: 'You can come back and finish this evaluation later.' });
                    }}
                />
            )}

            {viewingPdf && evaluationTemplate?.file_path && companyId && (
                <PdfViewer template={evaluationTemplate} onClose={() => setViewingPdf(false)} />
            )}
        </div>
    );
};

// ─── The digital form ────────────────────────────────────────────────────────

const EvaluationForm: React.FC<{
    row: EvaluationWorklistRow;
    template: CompanyTemplate | null;
    onClose: () => void;
    onSubmitted: (score: number | null) => void;
    onSaved: () => void;
}> = ({ row, template, onClose, onSubmitted, onSaved }) => {
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

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
        window.addEventListener('keydown', onKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = '';
        };
    }, [onClose, busy]);

    const rated = ratedCount(scores);
    const score = computeScore(scores);
    const complete = isComplete(scores);

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

    return (
        <div className="evx-overlay" role="presentation" onClick={() => !busy && onClose()}>
            <div
                className="evx-modal tall"
                style={{ maxWidth: 720 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="evx-form-title"
                onClick={e => e.stopPropagation()}
            >
                <header className="evx-modal-head">
                    <div>
                        <h3 id="evx-form-title">{readOnly ? 'Submitted Evaluation' : 'Student Evaluation'}</h3>
                        <p className="evx-modal-sub">
                            {row.student_name} · {[row.course, row.section].filter(Boolean).join(' · ') || 'No program on file'}
                        </p>
                    </div>
                    <button type="button" className="evx-icon-btn" onClick={onClose} disabled={Boolean(busy)} aria-label="Close">{Icon.close}</button>
                </header>

                <div className="evx-modal-body">
                    {loading ? (
                        <div className="evx-state">Loading the evaluation…</div>
                    ) : (
                        <>
                            <div className="evx-form-head">
                                <div>
                                    <div className="evx-form-student">{row.student_name}</div>
                                    <p className="evx-form-sub">
                                        {readOnly
                                            ? `Submitted ${formatDate(row.submitted_at)}${row.evaluator_name ? ` by ${row.evaluator_name}` : ''}`
                                            : 'Rate every criterion, then submit. You can save a draft at any point.'}
                                    </p>
                                </div>
                                {score && (
                                    <div className="evx-score-chip">
                                        <span className="evx-score-value">{score.percentage.toFixed(0)}%</span>
                                        <span className="evx-score-label">Overall · {score.rating.toFixed(2)} / 5</span>
                                    </div>
                                )}
                            </div>

                            {!readOnly && (
                                <div className="evx-progress-line" style={{ marginTop: '0.6rem' }}>
                                    <span className="evx-progress-track">
                                        <span className="evx-progress-fill" style={{ width: `${(rated / EVALUATION_CRITERIA.length) * 100}%` }} />
                                    </span>
                                    <span>{rated} of {EVALUATION_CRITERIA.length} rated</span>
                                </div>
                            )}

                            {EVALUATION_SECTIONS.map(section => (
                                <div key={section.title} className="evx-section">
                                    <h4 className="evx-section-title">{section.title}</h4>
                                    {section.criteria.map(criterion => {
                                        const value = scores[criterion.key] ?? null;
                                        return (
                                            <div
                                                key={criterion.key}
                                                className={`evx-criterion ${value ? 'rated' : 'unrated'}`}
                                            >
                                                <div>
                                                    <div className="evx-criterion-label">{criterion.label}</div>
                                                    <p className="evx-criterion-hint">{criterion.hint}</p>
                                                </div>
                                                {readOnly ? (
                                                    <span className="evx-status evx-status-submitted">{ratingLabel(value)}</span>
                                                ) : (
                                                    <div className="evx-ratings" role="radiogroup" aria-label={criterion.label}>
                                                        {RATING_SCALE.map(option => (
                                                            <button
                                                                key={option.value}
                                                                type="button"
                                                                role="radio"
                                                                aria-checked={value === option.value}
                                                                className={`evx-rating${value === option.value ? ' selected' : ''}`}
                                                                disabled={Boolean(busy)}
                                                                onClick={() => setScores(current => ({
                                                                    ...current,
                                                                    [criterion.key as EvaluationScoreKey]: option.value,
                                                                }))}
                                                            >
                                                                {option.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}

                            <div className="evx-section">
                                <h4 className="evx-section-title">Comments</h4>
                                <textarea
                                    className="evx-textarea"
                                    value={comments}
                                    readOnly={readOnly}
                                    disabled={Boolean(busy)}
                                    placeholder="Overall remarks on this student's performance…"
                                    onChange={e => setComments(e.target.value)}
                                />
                                <div className="evx-form-grid">
                                    <div>
                                        <label className="evx-field-label" htmlFor="evx-strengths">Strengths</label>
                                        <textarea
                                            id="evx-strengths"
                                            className="evx-textarea"
                                            value={strengths}
                                            readOnly={readOnly}
                                            disabled={Boolean(busy)}
                                            onChange={e => setStrengths(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="evx-field-label" htmlFor="evx-weaknesses">Areas to improve</label>
                                        <textarea
                                            id="evx-weaknesses"
                                            className="evx-textarea"
                                            value={weaknesses}
                                            readOnly={readOnly}
                                            disabled={Boolean(busy)}
                                            onChange={e => setWeaknesses(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="evx-field-label" htmlFor="evx-recommendations">Recommendations</label>
                                        <textarea
                                            id="evx-recommendations"
                                            className="evx-textarea"
                                            value={recommendations}
                                            readOnly={readOnly}
                                            disabled={Boolean(busy)}
                                            onChange={e => setRecommendations(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {confirming && (
                                <p className="evx-warning" style={{ marginTop: '1rem', marginBottom: 0 }}>
                                    Submitting is final — the evaluation cannot be edited afterwards, and
                                    {' '}{row.student_name}, their adviser and the coordinator are notified straight away.
                                </p>
                            )}

                            {error && <p className="evx-error">{error}</p>}
                        </>
                    )}
                </div>

                <footer className="evx-modal-foot">
                    {template?.file_path && (
                        <span className="evx-doc-file" style={{ marginRight: 'auto' }}>
                            Official form: {template.file_name}
                        </span>
                    )}
                    {readOnly ? (
                        <button type="button" className="evx-btn evx-btn-primary" onClick={onClose}>Close</button>
                    ) : confirming ? (
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
                </footer>
            </div>
        </div>
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
