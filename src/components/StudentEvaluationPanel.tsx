import React, { useCallback, useEffect, useState } from 'react';
import { evaluationService, type StudentEvaluation } from '../services/evaluationService';
import {
    EVALUATION_SECTIONS,
    STATUS_LABEL,
    describeDeadline,
    formatDate,
    ratingLabel,
    type EvaluationScoreKey,
} from '../utils/evaluationForms';
import './Evaluations.css';

/**
 * One student's company evaluation, read-only.
 *
 * The student and their adviser see the same thing, and neither can change what
 * the company answered. Before the company submits, that means the status and
 * nothing else — the server withholds a half-filled draft rather than this
 * component choosing to hide it.
 *
 * Two shapes, one body: a self-contained card in the student's own portal, and
 * a chrome-less block when the adviser's workspace has already named the
 * student in its own header.
 */

const Icon = {
    award: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" /></svg>,
    clock: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
};

interface Props {
    studentId: string;
    /** The student's own portal says "my"; an adviser reading it does not. */
    voice?: 'self' | 'staff';
    /** `embedded` drops the card chrome for a parent that already has a header. */
    variant?: 'card' | 'embedded';
}

const StudentEvaluationPanel: React.FC<Props> = ({ studentId, voice = 'self', variant = 'card' }) => {
    const [evaluation, setEvaluation] = useState<StudentEvaluation | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(variant === 'embedded');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setEvaluation(await evaluationService.getStudentEvaluation(studentId));
        } catch (err) {
            console.error('Failed to load the evaluation:', err);
            setError('We could not load this evaluation.');
        } finally {
            setLoading(false);
        }
    }, [studentId]);

    useEffect(() => { void load(); }, [load]);

    const embedded = variant === 'embedded';

    const shell = (head: React.ReactNode, body: React.ReactNode) => {
        if (embedded) return <div className="evx-embedded">{body}</div>;
        return (
            <div className="evx-result">
                {head}
                <div className="evx-result-body">{body}</div>
            </div>
        );
    };

    const title = voice === 'self' ? 'My Evaluation' : 'Company Evaluation';

    if (loading) {
        return shell(
            <div className="evx-result-head">
                <h3 className="evx-result-title">
                    <span className="evx-title-icon" aria-hidden="true">{Icon.award}</span>
                    {title}
                </h3>
            </div>,
            <div className="evx-skeleton" />,
        );
    }

    if (error) {
        return shell(
            <div className="evx-result-head">
                <h3 className="evx-result-title">
                    <span className="evx-title-icon" aria-hidden="true">{Icon.award}</span>
                    {title}
                </h3>
            </div>,
            <div className="evx-state">
                <p>{error}</p>
                <button type="button" className="evx-btn evx-btn-quiet" onClick={() => void load()}>Try again</button>
            </div>,
        );
    }

    const status = evaluation?.status ?? 'not_started';
    const isDone = status === 'submitted' || status === 'reviewed';
    const noCompany = !evaluation?.company_id;
    const notPublished = Boolean(evaluation?.company_id) && !evaluation?.evaluation_id;
    const deadline = evaluation?.evaluation_deadline ? describeDeadline(evaluation.evaluation_deadline) : null;
    const score = evaluation?.total_score !== null && evaluation?.total_score !== undefined
        ? Number(evaluation.total_score)
        : null;

    const statusPill = (
        <span className={`evx-status evx-status-${isDone ? status : notPublished || noCompany ? 'not_uploaded' : status}`}>
            <span className="evx-status-dot" aria-hidden="true" />
            {noCompany ? 'No company' : notPublished ? 'Not yet available' : STATUS_LABEL[status]}
        </span>
    );

    const head = (
        <div className="evx-result-head">
            <div>
                <h3 className="evx-result-title">
                    <span className="evx-title-icon" aria-hidden="true">{Icon.award}</span>
                    {title}
                </h3>
                <p className="evx-result-sub">
                    Completed by {evaluation?.company_name || 'the host company'} inside the SIL/OJT Monitoring System.
                </p>
            </div>
            <div className="evx-canvas-side">
                {statusPill}
                {isDone && (
                    <div
                        className="evx-ring"
                        style={{ '--evx-pct': score ?? 0 } as React.CSSProperties}
                        aria-hidden="true"
                    >
                        <span className="evx-ring-value">{score === null ? '—' : `${score.toFixed(0)}%`}</span>
                    </div>
                )}
            </div>
        </div>
    );

    // ── Nothing to read yet ──────────────────────────────────────────────
    if (!isDone) {
        const message = noCompany
            ? (voice === 'self'
                ? 'You are not assigned to a company yet, so there is no evaluation to complete.'
                : 'This student is not assigned to a company yet.')
            : notPublished
                ? `The SIL Coordinator has not published an evaluation form for ${evaluation?.company_name} yet.`
                : status === 'in_progress'
                    ? `${evaluation?.company_name} has started the evaluation and has not submitted it yet.`
                    : `${evaluation?.company_name} has been notified and will complete the evaluation in the system.`;

        return shell(head, (
            <div className="evx-waiting">
                <span className="evx-empty-icon" aria-hidden="true">{Icon.clock}</span>
                <div>
                    <p className="evx-waiting-text">{message}</p>
                    <div className="evx-waiting-side">
                        {embedded && statusPill}
                        {deadline && deadline.tone !== 'none' && (
                            <span className={`evx-deadline evx-deadline-${deadline.tone}`}>{deadline.text}</span>
                        )}
                    </div>
                </div>
            </div>
        ));
    }

    // ── The submitted result ─────────────────────────────────────────────
    const notes: [string, string][] = ([
        ['Comments', evaluation?.comments],
        ['Strengths', evaluation?.strengths],
        ['Areas to improve', evaluation?.weaknesses],
        ['Recommendations', evaluation?.recommendations],
    ] as [string, string | null | undefined][])
        .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()));

    const body = (
        <>
            <div className="evx-summary">
                <div className="evx-scorebox">
                    {embedded && (
                        <div
                            className="evx-ring"
                            style={{ '--evx-pct': score ?? 0 } as React.CSSProperties}
                            aria-hidden="true"
                        >
                            <span className="evx-ring-value">{score === null ? '—' : `${score.toFixed(0)}%`}</span>
                        </div>
                    )}
                    <div className="evx-scorebox-main">
                        <span className="evx-scorebox-value">
                            {score === null ? 'Submitted' : `${score.toFixed(0)} / 100`}
                            {evaluation?.overall_rating !== null && evaluation?.overall_rating !== undefined && (
                                <span className="evx-ring-caption"> · {Number(evaluation.overall_rating).toFixed(2)} / 5</span>
                            )}
                        </span>
                        <span className="evx-canvas-meta">
                            Submitted {formatDate(evaluation?.submitted_at)}
                            {evaluation?.evaluator_name ? ` by ${evaluation.evaluator_name}` : ''}
                        </span>
                    </div>
                </div>

                {!embedded && (
                    <button
                        type="button"
                        className="evx-btn evx-btn-quiet"
                        aria-expanded={expanded}
                        onClick={() => setExpanded(value => !value)}
                    >
                        {expanded ? 'Hide breakdown' : 'View breakdown'}
                    </button>
                )}
            </div>

            {expanded && (
                <div className="evx-result-details">
                    {EVALUATION_SECTIONS.map(section => (
                        <div key={section.title}>
                            <div className="evx-section-head">
                                <h4 className="evx-section-title">{section.title}</h4>
                                <span className="evx-section-rule" aria-hidden="true" />
                            </div>
                            <div className="evx-crits">
                                {section.criteria.map(criterion => {
                                    const value = evaluation?.scores?.[criterion.key as EvaluationScoreKey] ?? null;
                                    return (
                                        <div key={criterion.key} className="evx-crit readonly rated">
                                            <div className="evx-crit-top">
                                                <div className="evx-crit-label">{criterion.label}</div>
                                                <span className={`evx-crit-answer${value ? '' : ' empty'}`}>
                                                    {value ? `${value} · ${ratingLabel(value)}` : '—'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {notes.length > 0 && (
                        <div>
                            <div className="evx-section-head">
                                <h4 className="evx-section-title">Written Feedback</h4>
                                <span className="evx-section-rule" aria-hidden="true" />
                            </div>
                            <div className="evx-notes">
                                {notes.map(([label, value]) => (
                                    <div key={label} className={label === 'Comments' ? 'wide' : undefined}>
                                        <span className="evx-field-label">{label}</span>
                                        <p className="evx-prose">{value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    );

    return shell(head, body);
};

export default StudentEvaluationPanel;
