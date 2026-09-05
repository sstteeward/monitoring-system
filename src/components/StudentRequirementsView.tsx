import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    requirementService,
    formatFileSize,
    STATUS_LABEL,
    type RequirementStatus,
    type StudentRequirementRow,
} from '../services/requirementService';
import './Requirements.css';

/**
 * Coordinator / Admin — OJT requirement verification.
 *
 * Lists every student for a requirement, including those who have not submitted
 * (which is what makes it a compliance view rather than an inbox), and opens a
 * review dialog that shows the uploaded document inline. Nobody has to download
 * a file just to look at it.
 */

const FILTERS: { value: RequirementStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'not_submitted', label: 'Not Submitted' },
    { value: 'pending', label: 'For Verification' },
    { value: 'approved', label: 'Approved' },
    { value: 'revision_required', label: 'Revision Required' },
];

const QUICK_REMARKS = [
    'Parent/guardian signature is missing.',
    'Please upload a clearer copy.',
    'The document is not dated.',
    'Please provide the required guardianship documentation.',
    'Document is incomplete.',
    'Please upload the complete page.',
];

/** What the coordinator is confirming before they approve. */
const VERIFY_CHECKLIST = [
    'Student signature is present',
    'Parent/Guardian signature is present',
    'Required fields are completed',
    'Document is dated',
    'Document is readable',
    'Correct waiver form was used',
];

function formatDateTime(value: string | null | undefined) {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

const StudentRequirementsView: React.FC = () => {
    const [rows, setRows] = useState<StudentRequirementRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [filter, setFilter] = useState<RequirementStatus | 'all'>('all');
    const [search, setSearch] = useState('');

    const [selected, setSelected] = useState<StudentRequirementRow | null>(null);
    const [docUrl, setDocUrl] = useState<string | null>(null);
    const [docLoading, setDocLoading] = useState(false);
    const [remarks, setRemarks] = useState('');
    const [reviewing, setReviewing] = useState(false);
    const [reviewError, setReviewError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setRows(await requirementService.getStudentRequirements());
        } catch (err) {
            console.error('Failed to load student requirements:', err);
            setError(err instanceof Error ? err.message : 'We could not load the requirement list.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    // Opening a row fetches a fresh signed link; the bucket is private.
    useEffect(() => {
        if (!selected?.file_path) {
            setDocUrl(null);
            return;
        }
        let cancelled = false;
        setDocLoading(true);
        requirementService.getFileUrl(selected.file_path)
            .then(url => { if (!cancelled) setDocUrl(url); })
            .catch(err => {
                if (cancelled) return;
                console.error('Failed to open the document:', err);
                setReviewError('We could not open this document.');
            })
            .finally(() => { if (!cancelled) setDocLoading(false); });
        return () => { cancelled = true; };
    }, [selected]);

    useEffect(() => {
        if (!selected) return;
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
        window.addEventListener('keydown', onKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = '';
        };
    }, [selected]);

    const counts = useMemo(() => ({
        total: rows.length,
        pending: rows.filter(r => r.status === 'pending').length,
        approved: rows.filter(r => r.status === 'approved').length,
        revision: rows.filter(r => r.status === 'revision_required' || r.status === 'rejected').length,
        missing: rows.filter(r => r.status === 'not_submitted').length,
    }), [rows]);

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        return rows.filter(row => {
            if (filter === 'revision_required') {
                if (row.status !== 'revision_required' && row.status !== 'rejected') return false;
            } else if (filter !== 'all' && row.status !== filter) {
                return false;
            }
            if (!term) return true;
            return [row.student_name, row.student_email, row.section, row.course, row.company_name]
                .some(field => (field || '').toLowerCase().includes(term));
        });
    }, [rows, filter, search]);

    const openReview = (row: StudentRequirementRow) => {
        setSelected(row);
        setRemarks(row.reviewer_remarks ?? '');
        setReviewError(null);
    };

    const review = async (decision: 'approved' | 'revision_required') => {
        if (!selected?.document_id) return;
        if (decision === 'revision_required' && !remarks.trim()) {
            setReviewError('Please say what needs to change so the student can fix it.');
            return;
        }

        setReviewing(true);
        setReviewError(null);
        try {
            await requirementService.reviewRequirement(selected.document_id, decision, remarks.trim() || undefined);
            setSelected(null);
            await load();
        } catch (err) {
            console.error('Failed to record the review:', err);
            setReviewError(err instanceof Error ? err.message : 'We could not save that decision.');
        } finally {
            setReviewing(false);
        }
    };

    return (
        <div className="rqv fade-in">
            <header className="rqv-head-text">
                <h2 className="rqv-title">Student Requirements</h2>
                <p className="rqv-sub">
                    Verify the Parent&apos;s Clearance &amp; Waiver submitted by students. A requirement
                    only counts as complete once it is approved.
                </p>
            </header>

            <div className="rqv-stats">
                <div className="rqv-stat"><div className="rqv-stat-value">{counts.pending}</div><div className="rqv-stat-label">For verification</div></div>
                <div className="rqv-stat"><div className="rqv-stat-value">{counts.approved}</div><div className="rqv-stat-label">Approved</div></div>
                <div className="rqv-stat"><div className="rqv-stat-value">{counts.revision}</div><div className="rqv-stat-label">Revision required</div></div>
                <div className="rqv-stat"><div className="rqv-stat-value">{counts.missing}</div><div className="rqv-stat-label">Not submitted</div></div>
                <div className="rqv-stat"><div className="rqv-stat-value">{counts.total}</div><div className="rqv-stat-label">Students</div></div>
            </div>

            <div className="rqv-toolbar">
                <div className="rqv-search">
                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search student, email, section or company..."
                        aria-label="Search students"
                    />
                </div>
                <div className="rqv-filters" role="group" aria-label="Filter by status">
                    {FILTERS.map(option => (
                        <button
                            key={option.value}
                            type="button"
                            className={`rqv-filter${filter === option.value ? ' active' : ''}`}
                            aria-pressed={filter === option.value}
                            onClick={() => setFilter(option.value)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="rqv-table-wrap">
                {loading ? (
                    <div className="rqv-state">Loading student requirements…</div>
                ) : error ? (
                    <div className="rqv-state">
                        <p>{error}</p>
                        <button type="button" className="req-btn req-btn-primary" onClick={() => void load()}>Try again</button>
                    </div>
                ) : visible.length === 0 ? (
                    <div className="rqv-state">No students match this filter.</div>
                ) : (
                    <table className="rqv-table">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Course / Section</th>
                                <th>Company</th>
                                <th>Status</th>
                                <th>Submitted</th>
                                <th>Reviewed by</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(row => (
                                <tr key={row.student_user_id}>
                                    <td>
                                        <div className="rqv-student">{row.student_name || 'Unnamed student'}</div>
                                        <div className="rqv-student-sub">{row.student_email}</div>
                                    </td>
                                    <td>
                                        {row.course || '—'}
                                        <div className="rqv-student-sub">{row.section || 'No section'}</div>
                                    </td>
                                    <td>{row.company_name || '—'}</td>
                                    <td>
                                        <span className={`req-status req-status-${row.status}`}>
                                            <span className="req-status-dot" aria-hidden="true" />
                                            {STATUS_LABEL[row.status]}
                                        </span>
                                    </td>
                                    <td>{formatDateTime(row.submitted_at)}</td>
                                    <td>
                                        {row.reviewer_name || '—'}
                                        {row.reviewed_at && <div className="rqv-student-sub">{formatDateTime(row.reviewed_at)}</div>}
                                    </td>
                                    <td>
                                        {row.document_id ? (
                                            <button type="button" className="req-btn req-btn-quiet" onClick={() => openReview(row)}>
                                                Review
                                            </button>
                                        ) : (
                                            <span className="rqv-student-sub">Nothing to review</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {selected && (
                <div className="req-viewer-overlay rqv-overlay" onClick={() => setSelected(null)} role="presentation">
                    <div
                        className="rqv-review"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="rqv-review-title"
                        onClick={e => e.stopPropagation()}
                    >
                        <header className="rqv-review-head">
                            <div>
                                <h3 id="rqv-review-title" className="rqv-title" style={{ fontSize: '1.05rem' }}>
                                    Parent&apos;s Clearance &amp; Waiver
                                </h3>
                                <p className="rqv-sub">{selected.student_name}</p>
                            </div>
                            <button type="button" className="req-btn req-btn-ghost" onClick={() => setSelected(null)}>Close</button>
                        </header>

                        <div className="rqv-review-body">
                            <div className="rqv-review-info">
                                <dl className="req-meta" style={{ gridTemplateColumns: '1fr' }}>
                                    <div><dt>Student</dt><dd>{selected.student_name || '—'}</dd></div>
                                    <div><dt>Student email</dt><dd>{selected.student_email || '—'}</dd></div>
                                    <div><dt>Course</dt><dd>{selected.course || '—'}</dd></div>
                                    <div><dt>Section</dt><dd>{selected.section || '—'}</dd></div>
                                    <div><dt>Company</dt><dd>{selected.company_name || '—'}</dd></div>
                                    <div><dt>Document</dt><dd>Parent&apos;s Clearance &amp; Waiver</dd></div>
                                    <div>
                                        <dt>Status</dt>
                                        <dd>
                                            <span className={`req-status req-status-${selected.status}`}>
                                                <span className="req-status-dot" aria-hidden="true" />
                                                {STATUS_LABEL[selected.status]}
                                            </span>
                                        </dd>
                                    </div>
                                    <div><dt>File</dt><dd>{selected.file_name} · {formatFileSize(selected.file_size)}</dd></div>
                                    <div><dt>Submitted</dt><dd>{formatDateTime(selected.submitted_at)}</dd></div>
                                    {selected.reviewed_at && (
                                        <div>
                                            <dt>Last reviewed</dt>
                                            <dd>{selected.reviewer_name || 'Unknown'} · {formatDateTime(selected.reviewed_at)}</dd>
                                        </div>
                                    )}
                                </dl>

                                <div className="rqv-verify">
                                    <span className="rqv-verify-title">Verify before approving</span>
                                    <ul>{VERIFY_CHECKLIST.map(item => <li key={item}>{item}</li>)}</ul>
                                    <p className="req-checklist-note">
                                        If the parent cannot sign, confirm the legitimate guardian&apos;s
                                        letter of guardianship is on file.
                                    </p>
                                </div>

                                <label className="rqv-remarks-label" htmlFor="rqv-remarks">
                                    Remarks <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>(required to request a revision)</span>
                                </label>
                                <textarea
                                    id="rqv-remarks"
                                    className="rqv-remarks-input"
                                    value={remarks}
                                    onChange={e => setRemarks(e.target.value)}
                                    placeholder="Explain what the student needs to correct..."
                                />
                                <div className="rqv-quick">
                                    {QUICK_REMARKS.map(text => (
                                        <button key={text} type="button" onClick={() => setRemarks(text)}>{text}</button>
                                    ))}
                                </div>

                                {reviewError && <div className="req-alert req-alert-error" style={{ marginTop: '0.75rem' }}>{reviewError}</div>}
                            </div>

                            <div className="rqv-review-doc">
                                {docLoading ? (
                                    <div className="rqv-state">Opening document…</div>
                                ) : !docUrl ? (
                                    <div className="rqv-state">This document could not be opened.</div>
                                ) : selected.file_type === 'application/pdf' ? (
                                    <iframe src={docUrl} title={`Waiver submitted by ${selected.student_name}`} />
                                ) : (
                                    <img src={docUrl} alt={`Waiver submitted by ${selected.student_name}`} />
                                )}
                            </div>
                        </div>

                        <div className="rqv-review-foot">
                            {docUrl && (
                                <a className="req-btn req-btn-ghost" href={docUrl} target="_blank" rel="noopener noreferrer">Download</a>
                            )}
                            <button
                                type="button"
                                className="req-btn req-btn-danger"
                                onClick={() => void review('revision_required')}
                                disabled={reviewing}
                            >
                                {reviewing ? 'Saving…' : 'Request Revision'}
                            </button>
                            <button
                                type="button"
                                className="req-btn req-btn-primary"
                                onClick={() => void review('approved')}
                                disabled={reviewing || selected.status === 'approved'}
                            >
                                {selected.status === 'approved' ? 'Already approved' : reviewing ? 'Saving…' : 'Approve'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentRequirementsView;
