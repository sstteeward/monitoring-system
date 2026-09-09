import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { evaluationService, type AdviserEvaluationRow } from '../services/evaluationService';
import StudentEvaluationPanel from './StudentEvaluationPanel';
import {
    STATUS_LABEL,
    formatDate,
    isPending,
    type EvaluationStatus,
} from '../utils/evaluationForms';
import './Evaluations.css';

/**
 * Adviser — company evaluation results for their own sections.
 *
 * The adviser does not upload the form and does not fill it in; they read what
 * the company submitted and use it for monitoring and grading. Marking a result
 * reviewed is the only write here, and it changes nothing the company answered.
 */

const Icon = {
    search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
    close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
};

const FILTERS: { value: EvaluationStatus | 'all' | 'pending'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'reviewed', label: 'Reviewed' },
];

const AdviserEvaluationsView: React.FC = () => {
    const [rows, setRows] = useState<AdviserEvaluationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<EvaluationStatus | 'all' | 'pending'>('all');
    const [search, setSearch] = useState('');
    const [opened, setOpened] = useState<AdviserEvaluationRow | null>(null);
    const [marking, setMarking] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setRows(await evaluationService.getAdviserEvaluations());
        } catch (err) {
            console.error('Failed to load evaluations:', err);
            setError(err instanceof Error ? err.message : 'We could not load your students’ evaluations.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        if (!opened) return;
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpened(null); };
        window.addEventListener('keydown', onKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = '';
        };
    }, [opened]);

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return rows.filter(row => {
            if (filter === 'pending' && !isPending(row.status)) return false;
            if (filter !== 'all' && filter !== 'pending' && row.status !== filter) return false;
            if (!term) return true;
            return [row.student_name, row.section, row.company_name]
                .some(field => (field || '').toLowerCase().includes(term));
        });
    }, [rows, filter, search]);

    const submitted = rows.filter(row => row.status === 'submitted' || row.status === 'reviewed').length;

    const markReviewed = async (row: AdviserEvaluationRow) => {
        if (!row.evaluation_id) return;
        setMarking(row.evaluation_id);
        try {
            await evaluationService.markReviewed(row.evaluation_id);
            await load();
        } catch (err) {
            console.error('Failed to mark the evaluation reviewed:', err);
            setError(err instanceof Error ? err.message : 'We could not mark that evaluation reviewed.');
        } finally {
            setMarking(null);
        }
    };

    return (
        <div className="evx fade-in">
            <header className="evx-head">
                <div>
                    <h2 className="evx-title">Student Evaluations</h2>
                    <p className="evx-sub">
                        Company evaluations for the students in your sections. Companies complete these; you
                        review the results.
                    </p>
                </div>
            </header>

            <div className="evx-stats">
                <div className="evx-stat"><div className="evx-stat-value">{rows.length}</div><div className="evx-stat-label">Students</div></div>
                <div className="evx-stat"><div className="evx-stat-value">{submitted}</div><div className="evx-stat-label">Evaluated</div></div>
                <div className="evx-stat"><div className="evx-stat-value">{rows.length - submitted}</div><div className="evx-stat-label">Awaiting company</div></div>
            </div>

            <div className="evx-toolbar">
                <div className="evx-search" style={{ flex: '1 1 240px', padding: 0, border: 0 }}>
                    <span className="evx-search-icon" aria-hidden="true" style={{ left: '0.65rem' }}>{Icon.search}</span>
                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search student, section or company…"
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
                    <div className="evx-state">Loading evaluations…</div>
                ) : error ? (
                    <div className="evx-state">
                        <p>{error}</p>
                        <button type="button" className="evx-btn evx-btn-quiet" onClick={() => void load()}>Try again</button>
                    </div>
                ) : visible.length === 0 ? (
                    <div className="evx-state">
                        {rows.length === 0 ? 'No students are assigned to your sections yet.' : 'No students match this filter.'}
                    </div>
                ) : (
                    <table className="evx-table">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Company</th>
                                <th>Status</th>
                                <th>Score</th>
                                <th aria-label="Actions" />
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(row => (
                                <tr key={row.student_id}>
                                    <td>
                                        <span className="evx-doc-name">{row.student_name || 'Unnamed student'}</span>
                                        <span className="evx-doc-file">{row.section || 'No section'}</span>
                                    </td>
                                    <td>
                                        {row.company_name || 'Not assigned'}
                                        {row.evaluator_name && <span className="evx-doc-file">by {row.evaluator_name}</span>}
                                    </td>
                                    <td>
                                        <span className={`evx-status evx-status-${row.status}`}>
                                            <span className="evx-status-dot" aria-hidden="true" />
                                            {STATUS_LABEL[row.status]}
                                        </span>
                                        {row.submitted_at && <span className="evx-doc-file">{formatDate(row.submitted_at)}</span>}
                                    </td>
                                    <td>
                                        {row.total_score !== null && row.total_score !== undefined
                                            ? <strong>{Number(row.total_score).toFixed(0)}%</strong>
                                            : <span className="evx-doc-file">—</span>}
                                    </td>
                                    <td>
                                        <div className="evx-row-actions">
                                            {row.status === 'submitted' && (
                                                <button
                                                    type="button"
                                                    className="evx-btn evx-btn-quiet"
                                                    disabled={marking === row.evaluation_id}
                                                    onClick={() => void markReviewed(row)}
                                                >
                                                    {marking === row.evaluation_id ? 'Saving…' : 'Mark reviewed'}
                                                </button>
                                            )}
                                            {(row.status === 'submitted' || row.status === 'reviewed') ? (
                                                <button type="button" className="evx-btn evx-btn-primary" onClick={() => setOpened(row)}>
                                                    View Full Evaluation
                                                </button>
                                            ) : (
                                                <span className="evx-doc-file">Awaiting the company</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {opened && (
                <div className="evx-overlay" role="presentation" onClick={() => setOpened(null)}>
                    <div
                        className="evx-modal"
                        style={{ maxWidth: 680 }}
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Evaluation for ${opened.student_name ?? 'student'}`}
                        onClick={e => e.stopPropagation()}
                    >
                        <header className="evx-modal-head">
                            <div>
                                <h3>{opened.student_name}</h3>
                                <p className="evx-modal-sub">{[opened.section, opened.company_name].filter(Boolean).join(' · ')}</p>
                            </div>
                            <button type="button" className="evx-icon-btn" onClick={() => setOpened(null)} aria-label="Close">{Icon.close}</button>
                        </header>
                        <div className="evx-modal-body">
                            <StudentEvaluationPanel studentId={opened.student_id} voice="staff" />
                        </div>
                        <footer className="evx-modal-foot">
                            <button type="button" className="evx-btn evx-btn-primary" onClick={() => setOpened(null)}>Close</button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdviserEvaluationsView;
