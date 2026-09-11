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
 *
 * Same shell as the company's page — roster left, the open result right — so
 * reading an evaluation costs a click rather than a dialog.
 */

const Icon = {
    search: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
    award: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" /></svg>,
    users: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>,
    refresh: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>,
};

type Filter = EvaluationStatus | 'all' | 'pending';

const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Awaiting' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'reviewed', label: 'Reviewed' },
];

function initials(name: string | null): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '—';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const AdviserEvaluationsView: React.FC = () => {
    const [rows, setRows] = useState<AdviserEvaluationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>('all');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
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

    const counts = useMemo(() => ({
        all: rows.length,
        pending: rows.filter(row => isPending(row.status)).length,
        submitted: rows.filter(row => row.status === 'submitted').length,
        reviewed: rows.filter(row => row.status === 'reviewed').length,
        not_started: rows.filter(row => row.status === 'not_started').length,
        in_progress: rows.filter(row => row.status === 'in_progress').length,
    }), [rows]);

    const evaluated = counts.submitted + counts.reviewed;

    const average = useMemo(() => {
        const scored = rows.filter(row => typeof row.total_score === 'number');
        if (scored.length === 0) return null;
        return scored.reduce((sum, row) => sum + Number(row.total_score), 0) / scored.length;
    }, [rows]);

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

    // Open something useful rather than an empty pane: the first result that is
    // actually readable, otherwise whoever is at the top.
    useEffect(() => {
        if (selectedId || visible.length === 0) return;
        const first = visible.find(row => !isPending(row.status)) ?? visible[0];
        setSelectedId(first.student_id);
    }, [visible, selectedId]);

    const selected = rows.find(row => row.student_id === selectedId) ?? null;

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
            <header className="evx-hero">
                <div className="evx-hero-main">
                    <h2 className="evx-title">
                        <span className="evx-title-icon" aria-hidden="true">{Icon.award}</span>
                        Student Evaluations
                    </h2>
                    <p className="evx-sub">
                        Company evaluations for the students in your sections. Companies complete these; you
                        read the results and mark them reviewed.
                    </p>
                </div>

                <ul className="evx-rail">
                    <li className="evx-rail-item">
                        <span className="evx-rail-value">{counts.all}</span>
                        <span className="evx-rail-label">Students</span>
                    </li>
                    <li className="evx-rail-item">
                        <span className="evx-rail-value accent">{evaluated}</span>
                        <span className="evx-rail-label">Evaluated</span>
                    </li>
                    <li className="evx-rail-item">
                        <span className={`evx-rail-value${counts.pending > 0 ? ' warn' : ''}`}>{counts.pending}</span>
                        <span className="evx-rail-label">Awaiting</span>
                    </li>
                    <li className="evx-rail-item">
                        <span className="evx-rail-value">{average === null ? '—' : `${average.toFixed(0)}%`}</span>
                        <span className="evx-rail-label">Average</span>
                    </li>
                </ul>

                <div className="evx-hero-actions">
                    <button type="button" className="evx-btn evx-btn-quiet" onClick={() => void load()} disabled={loading}>
                        {Icon.refresh} {loading ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>
            </header>

            {error && <p className="evx-error" style={{ marginTop: 0 }}>{error}</p>}

            {loading ? (
                <div className="evx-work">
                    <div className="evx-roster"><div className="evx-state">Loading students…</div></div>
                    <div className="evx-canvas"><div className="evx-state">Loading evaluations…</div></div>
                </div>
            ) : rows.length === 0 ? (
                <div className="evx-canvas">
                    <div className="evx-empty">
                        <span className="evx-empty-icon" aria-hidden="true">{Icon.users}</span>
                        <p className="evx-empty-title">No students in your sections</p>
                        <p className="evx-empty-sub">
                            Students appear here once they are assigned to a section you advise.
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
                                    placeholder="Student, section or company…"
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

                        <div className="evx-roster-list" role="listbox" aria-label="Students">
                            {visible.length === 0 ? (
                                <div className="evx-state">No students match this filter.</div>
                            ) : visible.map(row => (
                                <button
                                    key={row.student_id}
                                    type="button"
                                    role="option"
                                    aria-selected={row.student_id === selectedId}
                                    className={`evx-roster-item${row.student_id === selectedId ? ' active' : ''}`}
                                    onClick={() => setSelectedId(row.student_id)}
                                >
                                    <span className="evx-avatar" aria-hidden="true">{initials(row.student_name)}</span>
                                    <span className="evx-roster-main">
                                        <span className="evx-roster-name">{row.student_name || 'Unnamed student'}</span>
                                        <span className="evx-roster-meta">
                                            {[row.section, row.company_name].filter(Boolean).join(' · ') || 'No section'}
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
                            {visible.length} of {rows.length} shown · {evaluated}/{rows.length} evaluated
                        </div>
                    </aside>

                    {/* ── Result ───────────────────────────────────────────── */}
                    {!selected ? (
                        <section className="evx-canvas">
                            <div className="evx-empty">
                                <span className="evx-empty-icon" aria-hidden="true">{Icon.users}</span>
                                <p className="evx-empty-title">Select a student</p>
                                <p className="evx-empty-sub">Pick anyone from the roster to read their evaluation.</p>
                            </div>
                        </section>
                    ) : (
                        <section className="evx-canvas">
                            <header className="evx-canvas-head">
                                <div className="evx-canvas-id">
                                    <span className="evx-avatar" aria-hidden="true">{initials(selected.student_name)}</span>
                                    <div>
                                        <div className="evx-canvas-name">{selected.student_name || 'Unnamed student'}</div>
                                        <span className="evx-canvas-meta">
                                            {[selected.section, selected.company_name || 'No company'].filter(Boolean).join(' · ')}
                                            {selected.submitted_at ? ` · submitted ${formatDate(selected.submitted_at)}` : ''}
                                        </span>
                                    </div>
                                </div>

                                {selected.status === 'submitted' && (
                                    <button
                                        type="button"
                                        className="evx-btn evx-btn-primary"
                                        disabled={marking === selected.evaluation_id}
                                        onClick={() => void markReviewed(selected)}
                                    >
                                        {marking === selected.evaluation_id ? 'Saving…' : 'Mark reviewed'}
                                    </button>
                                )}
                            </header>

                            <div className="evx-canvas-body">
                                <StudentEvaluationPanel
                                    key={selected.student_id}
                                    studentId={selected.student_id}
                                    voice="staff"
                                    variant="embedded"
                                />
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
};

export default AdviserEvaluationsView;
