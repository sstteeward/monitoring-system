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
 */

const StudentEvaluationPanel: React.FC<{
    studentId: string;
    /** The student's own portal says "my"; an adviser reading it does not. */
    voice?: 'self' | 'staff';
}> = ({ studentId, voice = 'self' }) => {
    const [evaluation, setEvaluation] = useState<StudentEvaluation | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);

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

    if (loading) {
        return (
            <div className="evx-readonly">
                <div className="evx-readonly-head"><h3 className="evx-readonly-title">Company Evaluation</h3></div>
                <div className="evx-table-wrap"><div className="evx-state">Loading your evaluation…</div></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="evx-readonly">
                <div className="evx-readonly-head"><h3 className="evx-readonly-title">Company Evaluation</h3></div>
                <div className="evx-table-wrap">
                    <div className="evx-state">
                        <p>{error}</p>
                        <button type="button" className="evx-btn evx-btn-quiet" onClick={() => void load()}>Try again</button>
                    </div>
                </div>
            </div>
        );
    }

    const status = evaluation?.status ?? 'not_started';
    const isDone = status === 'submitted' || status === 'reviewed';
    const noCompany = !evaluation?.company_id;
    const notPublished = Boolean(evaluation?.company_id) && !evaluation?.evaluation_id;
    const deadline = evaluation?.evaluation_deadline ? describeDeadline(evaluation.evaluation_deadline) : null;

    return (
        <div className="evx-readonly">
            <div className="evx-readonly-head">
                <h3 className="evx-readonly-title">{voice === 'self' ? 'My Evaluation' : 'Company Evaluation'}</h3>
                <span className={`evx-status evx-status-${isDone ? status : notPublished || noCompany ? 'not_uploaded' : status}`}>
                    <span className="evx-status-dot" aria-hidden="true" />
                    {noCompany ? 'No company' : notPublished ? 'Not Yet Available' : STATUS_LABEL[status]}
                </span>
            </div>
            <p className="evx-readonly-sub">
                Completed by {evaluation?.company_name ? <strong>{evaluation.company_name}</strong> : 'the host company'} inside the
                SIL/OJT Monitoring System.
            </p>

            <div className="evx-table-wrap" style={{ padding: '0.9rem 1rem' }}>
                {noCompany ? (
                    <p className="evx-form-sub" style={{ margin: 0 }}>
                        {voice === 'self'
                            ? 'You are not assigned to a company yet, so there is no evaluation to complete.'
                            : 'This student is not assigned to a company yet.'}
                    </p>
                ) : notPublished ? (
                    <p className="evx-form-sub" style={{ margin: 0 }}>
                        The SIL Coordinator has not published an evaluation form for {evaluation?.company_name} yet.
                    </p>
                ) : !isDone ? (
                    <>
                        <p className="evx-form-sub" style={{ margin: 0 }}>
                            {status === 'in_progress'
                                ? `${evaluation?.company_name} has started the evaluation and has not submitted it yet.`
                                : `${evaluation?.company_name} has been notified and will complete the evaluation in the system.`}
                        </p>
                        {deadline && deadline.tone !== 'none' && (
                            <span className={`evx-deadline evx-deadline-${deadline.tone}`} style={{ marginTop: '0.6rem' }}>
                                {deadline.text}
                            </span>
                        )}
                    </>
                ) : (
                    <>
                        <div className="evx-form-head" style={{ border: 0, padding: 0, background: 'transparent' }}>
                            <div>
                                <div className="evx-form-student">
                                    {evaluation?.total_score !== null && evaluation?.total_score !== undefined
                                        ? `${Number(evaluation.total_score).toFixed(0)} / 100`
                                        : 'Submitted'}
                                </div>
                                <p className="evx-form-sub">
                                    Submitted {formatDate(evaluation?.submitted_at)}
                                    {evaluation?.evaluator_name ? ` by ${evaluation.evaluator_name}` : ''}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="evx-btn evx-btn-quiet"
                                aria-expanded={expanded}
                                onClick={() => setExpanded(value => !value)}
                            >
                                {expanded ? 'Hide details' : 'View Evaluation'}
                            </button>
                        </div>

                        {expanded && (
                            <div style={{ marginTop: '0.9rem' }}>
                                {EVALUATION_SECTIONS.map(section => (
                                    <div key={section.title} className="evx-section">
                                        <h4 className="evx-section-title">{section.title}</h4>
                                        {section.criteria.map(criterion => (
                                            <div key={criterion.key} className="evx-criterion rated">
                                                <div className="evx-criterion-label">{criterion.label}</div>
                                                <span className="evx-status evx-status-submitted">
                                                    {ratingLabel(evaluation?.scores?.[criterion.key as EvaluationScoreKey] ?? null)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ))}

                                {[
                                    ['Comments', evaluation?.comments],
                                    ['Strengths', evaluation?.strengths],
                                    ['Areas to improve', evaluation?.weaknesses],
                                    ['Recommendations', evaluation?.recommendations],
                                ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
                                    <div key={label as string} className="evx-section">
                                        <h4 className="evx-section-title">{label}</h4>
                                        <p className="evx-form-sub" style={{ fontSize: '0.83rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                                            {value}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default StudentEvaluationPanel;
