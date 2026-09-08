import React, { useEffect, useState } from 'react';
import { adviserService } from '../services/adviserService';
import type { Profile } from '../services/profileService';
import { TableSkeleton } from './Skeletons';
import UserClickableName from './UserClickableName';
import UserProfileModal from './UserProfileModal';
import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import { canonicalSectionName } from '../utils/sections';
import {
    dtrSubmissionService,
    type DtrStatus,
    type DtrSubmissionRow,
} from '../services/dtrSubmissionService';
import { formatDtrHours, formatDtrPeriod } from '../utils/dtrFormat';
import DtrStatusBadge from './DtrStatusBadge';
import AdviserDtrReviewModal from './AdviserDtrReviewModal';
import './CoordinatorDashboard.css';
import './AdviserDashboard.css';
import './DtrSubmission.css';

/**
 * Per-action wording and colour for the student account dialog. The three
 * actions share one dialog, so keeping the copy in one place avoids the chain
 * of nested ternaries the markup used to carry.
 */
const STUDENT_ACTION_COPY = {
    approve: {
        title: 'Approve Student Account',
        subtitle: 'Review the student information below before activating this account.',
        fieldLabel: 'Remarks / Welcome Notes',
        fieldRequired: false,
        placeholder: 'e.g. Welcome! Please ensure you upload your endorsement letter.',
        submitLabel: 'Approve & Activate',
        submittingLabel: 'Approving…',
        icon: '✓',
        accent: '#10b981',
        accentSoft: 'rgba(16, 185, 129, 0.12)',
    },
    reject: {
        title: 'Reject Student Registration',
        subtitle: 'Explain why this registration is being rejected. The student will be notified.',
        fieldLabel: 'Rejection Reason',
        fieldRequired: true,
        placeholder: 'e.g. You are not officially enrolled in section DHT-1A for this term.',
        submitLabel: 'Confirm Rejection',
        submittingLabel: 'Rejecting…',
        icon: '✕',
        accent: '#ef4444',
        accentSoft: 'rgba(239, 68, 68, 0.12)',
    },
    correct: {
        title: 'Request Registration Correction',
        subtitle: 'Tell the student exactly what to fix before resubmitting their registration.',
        fieldLabel: 'Instructions for Student',
        fieldRequired: true,
        placeholder: 'e.g. Please correct your contact number and home address before resubmitting.',
        submitLabel: 'Send Instructions',
        submittingLabel: 'Sending…',
        icon: '↺',
        accent: '#f59e0b',
        accentSoft: 'rgba(245, 158, 11, 0.14)',
    },
} as const;

interface AdviserApprovalsViewProps {
    initialTab?: 'students' | 'journals' | 'documents' | 'dtr';
    onActionComplete?: () => void;
}

const AdviserApprovalsView: React.FC<AdviserApprovalsViewProps> = ({
    initialTab = 'students',
    onActionComplete
}) => {
    const [activeTab, setActiveTab] = useState<'students' | 'journals' | 'documents' | 'dtr'>(initialTab);
    const [pendingStudents, setPendingStudents] = useState<Profile[]>([]);
    const [pendingJournals, setPendingJournals] = useState<any[]>([]);
    const [pendingDocuments, setPendingDocuments] = useState<any[]>([]);
    /*
     * DTR SUBMISSIONS — one item per submitted Daily Time Record.
     *
     * This replaces the old per-timesheet queue. Clocking in and out is
     * automatic attendance recording; the adviser reviews the COMPLETE record
     * once, after the student submits it.
     */
    const [dtrSubmissions, setDtrSubmissions] = useState<DtrSubmissionRow[]>([]);
    const [dtrFilter, setDtrFilter] = useState<DtrStatus | 'all'>('pending');
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [pendingDtrCount, setPendingDtrCount] = useState(0);
    /** Bumped after a review so both the list and the badge refetch. */
    const [dtrReloadKey, setDtrReloadKey] = useState(0);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Remarks / Approval Action Modal for Student Accounts
    const [showStudentActionModal, setShowStudentActionModal] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null);
    const [actionType, setActionType] = useState<'approve' | 'reject' | 'correct'>('approve');
    const [remarks, setRemarks] = useState('');
    const [viewProfileId, setViewProfileId] = useState<string | null>(null);



    useEffect(() => {
        loadApprovals();
    }, []);

    // The DTR list owns its own fetch: it runs on mount and again whenever the
    // status filter changes, without re-fetching the other three queues.
    useEffect(() => {
        dtrSubmissionService.listForAdviser(dtrFilter)
            .then(setDtrSubmissions)
            .catch(err => console.error('Failed to load DTR submissions:', err));
    }, [dtrFilter, dtrReloadKey]);

    /*
     * The tab badge counts what is WAITING, so it is fetched separately from the
     * list. Deriving it from the visible rows would drop it to zero the moment
     * the adviser filtered to "Approved" — the queue would look empty while work
     * was still outstanding.
     */
    useEffect(() => {
        dtrSubmissionService.pendingCount()
            .then(setPendingDtrCount)
            .catch(err => console.error('Failed to count pending DTR submissions:', err));
    }, [dtrReloadKey]);

    const loadApprovals = async () => {
        setLoading(true);
        setError(null);
        try {
            const [stData, jData, dData] = await Promise.all([
                adviserService.getPendingStudentApprovals(),
                adviserService.getPendingJournals(),
                adviserService.getPendingDocuments()
            ]);
            setPendingStudents(stData);
            setPendingJournals(jData);
            setPendingDocuments(dData);
        } catch (err: any) {
            console.error('Failed to load pending approvals:', err);
            setError(err.message || 'Failed to load approvals queue');
        } finally {
            setLoading(false);
        }
    };

    const showSuccess = (msg: string) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(null), 4000);
    };

    const {
        currentPage: stPage,
        setCurrentPage: setStPage,
        totalPages: stTotalPages,
        paginatedItems: paginatedStudents,
        totalItems: stTotalItems,
        itemsPerPage: stItemsPerPage
    } = usePagination(pendingStudents, 8);

    const {
        currentPage: jPage,
        setCurrentPage: setJPage,
        totalPages: jTotalPages,
        paginatedItems: paginatedJournals,
        totalItems: jTotalItems,
        itemsPerPage: jItemsPerPage
    } = usePagination(pendingJournals, 8);

    const {
        currentPage: dPage,
        setCurrentPage: setDPage,
        totalPages: dTotalPages,
        paginatedItems: paginatedDocuments,
        totalItems: dTotalItems,
        itemsPerPage: dItemsPerPage
    } = usePagination(pendingDocuments, 8);

    const {
        currentPage: tPage,
        setCurrentPage: setTPage,
        totalPages: tTotalPages,
        paginatedItems: paginatedSubmissions,
        totalItems: tTotalItems,
        itemsPerPage: tItemsPerPage
    } = usePagination(dtrSubmissions, 8);

    // Escape closes the student action dialog, except while a request is in
    // flight — the approval has already been sent at that point.
    useEffect(() => {
        if (!showStudentActionModal) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && actionLoading === null) {
                setShowStudentActionModal(false);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [showStudentActionModal, actionLoading]);

    // Handlers for Student Account Approval
    const openStudentActionModal = (student: Profile, type: 'approve' | 'reject' | 'correct') => {
        setSelectedStudent(student);
        setActionType(type);
        setRemarks('');
        setError(null); // don't show a previous action's error in the fresh dialog
        setShowStudentActionModal(true);
    };

    const handleConfirmStudentAction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStudent) return;

        if ((actionType === 'reject' || actionType === 'correct') && !remarks.trim()) {
            setError(`Please enter a reason or instructions for ${actionType === 'reject' ? 'rejection' : 'correction'}.`);
            return;
        }

        setActionLoading(selectedStudent.auth_user_id);
        setError(null);
        try {
            const studentId = selectedStudent.auth_user_id;
            const studentName = `${selectedStudent.first_name} ${selectedStudent.last_name}`;

            if (actionType === 'approve') {
                await adviserService.approveStudentAccount(studentId, remarks.trim() || undefined);
                showSuccess(`Approved student account for ${studentName}. Account is now active.`);
            } else if (actionType === 'reject') {
                await adviserService.rejectStudentAccount(studentId, remarks.trim());
                showSuccess(`Rejected student registration for ${studentName}.`);
            } else if (actionType === 'correct') {
                await adviserService.requestStudentCorrection(studentId, remarks.trim());
                showSuccess(`Requested correction for ${studentName}.`);
            }

            setShowStudentActionModal(false);
            await loadApprovals();
            if (onActionComplete) onActionComplete();
        } catch (err: any) {
            console.error('Action failed:', err);
            setError(err.message || 'Failed to process student account action.');
        } finally {
            setActionLoading(null);
        }
    };

    // Handlers for Journals
    const handleJournalAction = async (journalId: string, status: 'approved' | 'rejected') => {
        setActionLoading(journalId);
        try {
            await adviserService.updateJournalStatus(journalId, status);
            showSuccess(`Journal entry ${status}.`);
            await loadApprovals();
            if (onActionComplete) onActionComplete();
        } catch (err: any) {
            alert(`Failed to update journal: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    // Handlers for Documents
    const handleDocumentAction = async (documentId: string, status: 'approved' | 'rejected') => {
        setActionLoading(documentId);
        try {
            await adviserService.updateDocumentStatus(documentId, status);
            showSuccess(`Document ${status}.`);
            await loadApprovals();
            if (onActionComplete) onActionComplete();
        } catch (err: any) {
            alert(`Failed to update document: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    /*
     * There is no per-timesheet handler any more.
     *
     * A DTR is approved or returned as one complete record, from the review
     * screen — the adviser has to be able to inspect the whole thing before
     * deciding, so there are no Approve/Reject buttons on the list rows.
     */
    const handleReviewed = async (action: 'approve' | 'request_revision') => {
        setReviewingId(null);
        showSuccess(action === 'approve'
            ? 'DTR approved. The student has been notified.'
            : 'Revision requested. The student has been notified.');
        setDtrReloadKey(k => k + 1);
        if (onActionComplete) onActionComplete();
    };

    return (
        <div className="fade-in">
            {successMessage && (
                <div style={{
                    padding: '0.85rem 1.25rem',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#10b981',
                    borderRadius: 8,
                    marginBottom: '1rem',
                    fontWeight: 500
                }}>
                    {successMessage}
                </div>
            )}

            {error && (
                <div style={{
                    padding: '0.85rem 1.25rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    borderRadius: 8,
                    marginBottom: '1rem'
                }}>
                    ⚠ {error}
                </div>
            )}

            <div className="admin-table-card">
                {/* Header */}
                <div className="admin-table-header">
                    <div className="admin-table-title" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                        Pending Approvals
                    </div>
                    <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.85rem' }}>
                        Review student account registrations, daily journals, requirements, and complete DTR submissions.
                    </div>
                </div>

                {/* Tab Navigation */}
                <div style={{
                    padding: '0.75rem 1.5rem',
                    borderBottom: '1px solid var(--admin-border)',
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    background: 'var(--bg-elevated)'
                }}>
                    {[
                        { id: 'students', label: 'Student Accounts', count: pendingStudents.length },
                        { id: 'journals', label: 'Daily Journals', count: pendingJournals.length },
                        { id: 'documents', label: 'Documents', count: pendingDocuments.length },
                        { id: 'dtr', label: 'DTR Submissions', count: pendingDtrCount },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            className={`filter-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id as any)}
                            style={{
                                padding: '0.45rem 1rem',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: activeTab === tab.id ? 'var(--primary)' : 'transparent',
                                color: activeTab === tab.id ? '#fff' : 'var(--text-primary)',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <span>{tab.label}</span>
                            {tab.count > 0 && (
                                <span style={{
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: 999,
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    background: activeTab === tab.id ? 'rgba(255,255,255,0.25)' : '#f59e0b',
                                    color: '#ffffff'
                                }}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* ── TAB 1: Student Account Approvals ── */}
                {loading ? (
                    <TableSkeleton rows={5} cols={5} />
                ) : activeTab === 'students' ? (
                    <>
                        {paginatedStudents.length === 0 ? (
                            <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}></div>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No Pending Student Accounts</div>
                                <div style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>All student registrations in your assigned sections have been processed.</div>
                            </div>
                        ) : (
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Section & Course</th>
                                        <th>Contact & Address</th>
                                        <th>Registered Date</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedStudents.map(st => (
                                        <tr key={st.id}>
                                            <td>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    <UserClickableName
                                                        userId={st.auth_user_id}
                                                        userName={`${st.first_name || ''} ${st.last_name || ''}`.trim() || 'Student'}
                                                    />
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{st.email}</div>
                                            </td>
                                            <td>
                                                <span style={{ fontWeight: 600 }}>{st.section || '—'}</span>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{st.course || '—'} · {st.year_level || '—'}</div>
                                            </td>
                                            <td>
                                                <div style={{ fontSize: '0.85rem' }}>{st.contact_number || '—'}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {st.city_municipality || st.address || '—'}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ fontSize: '0.85rem' }}>
                                                    {st.created_at ? new Date(st.created_at).toLocaleDateString() : '—'}
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                    <button
                                                        className="approval-action-btn approval-btn-approve"
                                                        onClick={() => openStudentActionModal(st, 'approve')}
                                                        disabled={actionLoading === st.auth_user_id}
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        className="approval-action-btn approval-btn-correct"
                                                        onClick={() => openStudentActionModal(st, 'correct')}
                                                        disabled={actionLoading === st.auth_user_id}
                                                    >
                                                        Request Changes
                                                    </button>
                                                    <button
                                                        className="approval-action-btn approval-btn-reject"
                                                        onClick={() => openStudentActionModal(st, 'reject')}
                                                        disabled={actionLoading === st.auth_user_id}
                                                    >
                                                        ✕ Reject
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <div style={{ padding: '1rem' }}>
                            <Pagination
                                currentPage={stPage}
                                totalPages={stTotalPages}
                                totalItems={stTotalItems}
                                itemsPerPage={stItemsPerPage}
                                onPageChange={setStPage}
                                itemName="students"
                            />
                        </div>
                    </>
                ) : activeTab === 'journals' ? (
                    /* ── TAB 2: Daily Journals ── */
                    <>
                        {paginatedJournals.length === 0 ? (
                            <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                No pending journal entries to review.
                            </div>
                        ) : (
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Entry Date</th>
                                        <th>Tasks & Key Learnings</th>
                                        <th>Submitted</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedJournals.map(j => (
                                        <tr key={j.id}>
                                            <td>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {j.profiles?.first_name} {j.profiles?.last_name}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    Section {j.profiles?.section || '—'}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{j.entry_date}</div>
                                            </td>
                                            <td style={{ maxWidth: '300px' }}>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {j.tasks || j.learnings || 'No summary'}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    {new Date(j.created_at).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                    <button
                                                        className="approval-action-btn approval-btn-approve"
                                                        onClick={() => handleJournalAction(j.id, 'approved')}
                                                        disabled={actionLoading === j.id}
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        className="approval-action-btn approval-btn-reject"
                                                        onClick={() => handleJournalAction(j.id, 'rejected')}
                                                        disabled={actionLoading === j.id}
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <div style={{ padding: '1rem' }}>
                            <Pagination
                                currentPage={jPage}
                                totalPages={jTotalPages}
                                totalItems={jTotalItems}
                                itemsPerPage={jItemsPerPage}
                                onPageChange={setJPage}
                                itemName="journals"
                            />
                        </div>
                    </>
                ) : activeTab === 'documents' ? (
                    /* ── TAB 3: Student Documents ── */
                    <>
                        {paginatedDocuments.length === 0 ? (
                            <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                No pending documents to review.
                            </div>
                        ) : (
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Document Type</th>
                                        <th>File Name</th>
                                        <th>Uploaded</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedDocuments.map(d => (
                                        <tr key={d.id}>
                                            <td>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {d.profiles?.first_name} {d.profiles?.last_name}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    Section {d.profiles?.section || '—'}
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ fontWeight: 600 }}>{d.doc_type || d.type || 'Requirement'}</span>
                                            </td>
                                            <td>
                                                <a
                                                    href={d.file_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{ color: 'var(--primary)', textDecoration: 'underline', fontSize: '0.85rem' }}
                                                >
                                                    {d.file_name || 'View File'}
                                                </a>
                                            </td>
                                            <td>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    {new Date(d.created_at).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                    <button
                                                        className="approval-action-btn approval-btn-approve"
                                                        onClick={() => handleDocumentAction(d.id, 'approved')}
                                                        disabled={actionLoading === d.id}
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        className="approval-action-btn approval-btn-reject"
                                                        onClick={() => handleDocumentAction(d.id, 'rejected')}
                                                        disabled={actionLoading === d.id}
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <div style={{ padding: '1rem' }}>
                            <Pagination
                                currentPage={dPage}
                                totalPages={dTotalPages}
                                totalItems={dTotalItems}
                                itemsPerPage={dItemsPerPage}
                                onPageChange={setDPage}
                                itemName="documents"
                            />
                        </div>
                    </>
                ) : (
                    /* ── TAB 4: DTR Submissions ──
                       One row per submitted Daily Time Record. Deliberately no
                       Approve/Reject on the row: the adviser opens the complete
                       record first. */
                    <>
                        <div className="dtr-filter-bar">
                            <span className="dtr-filter-label">Show</span>
                            {([
                                { id: 'pending', label: 'Pending Review' },
                                { id: 'revision_requested', label: 'Revision Required' },
                                { id: 'approved', label: 'Approved' },
                                { id: 'all', label: 'All' },
                            ] as const).map(f => (
                                <button
                                    key={f.id}
                                    type="button"
                                    className={`dtr-filter-chip${dtrFilter === f.id ? ' is-active' : ''}`}
                                    onClick={() => { setDtrFilter(f.id); setTPage(1); }}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>

                        {paginatedSubmissions.length === 0 ? (
                            <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                {dtrFilter === 'pending'
                                    ? 'No DTR submissions are waiting for your review. Students submit their complete DTR once they finish their required SIL hours.'
                                    : 'No DTR submissions match this filter.'}
                            </div>
                        ) : (
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Section</th>
                                        <th>SIL Period</th>
                                        <th style={{ textAlign: 'right' }}>Hours</th>
                                        <th>Submitted</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedSubmissions.map(s => (
                                        <tr key={s.id}>
                                            <td>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {s.student_name || '—'}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {s.company_name || 'No company assigned'}
                                                </div>
                                            </td>
                                            <td>{s.section_name || '—'}</td>
                                            <td>{formatDtrPeriod(s.period_start, s.period_end)}</td>
                                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                <div style={{ fontWeight: 600 }}>{formatDtrHours(s.total_minutes)}</div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                    of {s.required_hours}h
                                                </div>
                                            </td>
                                            <td>
                                                <div>{new Date(s.submitted_at).toLocaleDateString()}</div>
                                                {s.attempt > 1 && (
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        Attempt {s.attempt}
                                                    </div>
                                                )}
                                            </td>
                                            <td><DtrStatusBadge status={s.status} /></td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    type="button"
                                                    className="approval-action-btn approval-btn-approve"
                                                    onClick={() => setReviewingId(s.id)}
                                                >
                                                    {s.status === 'pending' ? 'Review DTR' : 'View DTR'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <div style={{ padding: '1rem' }}>
                            <Pagination
                                currentPage={tPage}
                                totalPages={tTotalPages}
                                totalItems={tTotalItems}
                                itemsPerPage={tItemsPerPage}
                                onPageChange={setTPage}
                                itemName="submissions"
                            />
                        </div>
                    </>
                )}
            </div>

            {/* ══ MODAL: STUDENT ACCOUNT APPROVAL ACTION ══ */}
            {showStudentActionModal && selectedStudent && (() => {
                const copy = STUDENT_ACTION_COPY[actionType];
                const isSubmitting = actionLoading !== null;
                const initials = `${selectedStudent.first_name?.[0] || ''}${selectedStudent.last_name?.[0] || ''}`.toUpperCase() || '—';
                // `profiles.section` may still hold the legacy bare letter ("C"), so show
                // the full section name the rest of the system uses ("DIT-1C"). Falls back
                // to the stored value when course/year level are missing.
                const sectionLabel = canonicalSectionName(
                    selectedStudent.section,
                    selectedStudent.course,
                    selectedStudent.year_level,
                );

                return (
                    <div
                        className="modal-overlay"
                        onClick={() => !isSubmitting && setShowStudentActionModal(false)}
                    >
                        <div
                            className="ad-dialog"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="ad-dialog-title"
                            aria-describedby="ad-dialog-subtitle"
                            onClick={e => e.stopPropagation()}
                            style={{ '--ad-accent': copy.accent, '--ad-accent-soft': copy.accentSoft } as React.CSSProperties}
                        >
                            <div className="ad-dialog__header">
                                <div>
                                    <h3 className="ad-dialog__title" id="ad-dialog-title">{copy.title}</h3>
                                    <p className="ad-dialog__subtitle" id="ad-dialog-subtitle">{copy.subtitle}</p>
                                </div>
                                <button
                                    type="button"
                                    className="ad-dialog__close"
                                    aria-label="Close"
                                    onClick={() => setShowStudentActionModal(false)}
                                    disabled={isSubmitting}
                                >
                                    ✕
                                </button>
                            </div>

                            <form onSubmit={handleConfirmStudentAction}>
                                <div className="ad-dialog__body">
                                    <span className="ad-dialog__group-label">Student Information</span>
                                    <div className="ad-student-card">
                                        <div className="ad-student-avatar" aria-hidden="true">{initials}</div>
                                        <div className="ad-student-info">
                                            <div className="ad-student-name">
                                                {selectedStudent.first_name} {selectedStudent.last_name}
                                            </div>
                                            <div className="ad-student-tags">
                                                {sectionLabel && (
                                                    <span className="ad-student-tag">Section {sectionLabel}</span>
                                                )}
                                                {selectedStudent.year_level && (
                                                    <span className="ad-student-tag">{selectedStudent.year_level}</span>
                                                )}
                                                {selectedStudent.course && (
                                                    <span className="ad-student-tag">{selectedStudent.course}</span>
                                                )}
                                            </div>
                                            <div className="ad-student-email">{selectedStudent.email}</div>
                                        </div>
                                    </div>

                                    <div className="ad-dialog__field">
                                        <label className="ad-dialog__label" htmlFor="ad-dialog-remarks">
                                            {copy.fieldLabel}
                                            <span className={`ad-dialog__hint${copy.fieldRequired ? ' ad-dialog__hint--required' : ''}`}>
                                                {copy.fieldRequired ? 'Required' : 'Optional'}
                                            </span>
                                        </label>
                                        <textarea
                                            id="ad-dialog-remarks"
                                            className="ad-dialog__textarea"
                                            value={remarks}
                                            onChange={e => setRemarks(e.target.value)}
                                            placeholder={copy.placeholder}
                                            rows={4}
                                            // Not `required`: native validation would preempt the
                                            // existing check in handleConfirmStudentAction.
                                            aria-required={copy.fieldRequired}
                                            disabled={isSubmitting}
                                        />
                                    </div>

                                    {/* The page-level error banner sits behind this overlay, so the
                                        same message is surfaced here while the dialog is open. */}
                                    {error && (
                                        <div className="ad-dialog__error" role="alert">
                                            <span aria-hidden="true">⚠</span>
                                            <span>{error}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="ad-dialog__footer">
                                    <button
                                        type="button"
                                        className="ad-dialog__btn ad-dialog__btn--secondary"
                                        onClick={() => setShowStudentActionModal(false)}
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="ad-dialog__btn ad-dialog__btn--primary"
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <span className="ad-dialog__spinner" aria-hidden="true" />
                                                {copy.submittingLabel}
                                            </>
                                        ) : (
                                            <>
                                                <span aria-hidden="true">{copy.icon}</span>
                                                {copy.submitLabel}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}

            {/* Profile Modal */}
            {viewProfileId && (
                <UserProfileModal
                    profileId={viewProfileId}
                    onClose={() => setViewProfileId(null)}
                />
            )}

            {/* The complete DTR review — where approve / request revision live. */}
            {reviewingId && (
                <AdviserDtrReviewModal
                    submissionId={reviewingId}
                    onClose={() => setReviewingId(null)}
                    onReviewed={handleReviewed}
                />
            )}
        </div>
    );
};

export default AdviserApprovalsView;
