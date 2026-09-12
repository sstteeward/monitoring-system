import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adviserService, type Section } from '../services/adviserService';
import {
    gradingService,
    type GradeEdit,
    type GradingSheet,
    type GradingSheetSummary,
    type SchoolYear,
} from '../services/gradingService';
import {
    STATUS_DESCRIPTIONS,
    STATUS_LABELS,
    STATUS_ORDER,
    canEditGrades,
    formatGrade,
    formatTerm,
    gradingProgress,
    remarksFor,
    validateFinalGrade,
    type GradingSheetStatus,
} from '../utils/grading';
import GradingSheetPreviewModal from './GradingSheetPreviewModal';
import GradeHistoryModal from './GradeHistoryModal';
import StudentNumbersModal from './StudentNumbersModal';
import { TableSkeleton } from './Skeletons';
import CustomSelect from './CustomSelect';
import './CoordinatorDashboard.css';
import './AdviserDashboard.css';
import './GradingSheet.css';

/** A grade the adviser has typed but not yet saved. */
interface DraftGrade {
    text: string;
    error: string | null;
}

type Mode = 'list' | 'sheet';

/** A transient save/submit result, shown in the corner rather than in the layout. */
interface Toast {
    id: number;
    tone: 'ok' | 'error';
    text: string;
}

const TOAST_DURATION_MS = 6000;

const statusTone = (status: GradingSheetStatus): string =>
    status === 'finalized' ? 'is-final'
        : status === 'verified' ? 'is-verified'
            : status === 'for_review' ? 'is-review'
                : 'is-draft';

/** "01", "12" — a fixed-width row number keeps the left edge of the sheet straight. */
const rowNumber = (index: number): string => String(index + 1).padStart(2, '0');

/**
 * The adviser's Official Grading Sheet module.
 *
 * Two screens in one view: the list of the adviser's sheets (one per section
 * per term), and the sheet itself. The editor is a compact table, not a replica
 * of the paper form — the paper form lives behind "Preview Official Sheet".
 *
 * Students are never typed in. They arrive from the adviser's assigned section
 * through `open_grading_sheet`, which re-syncs the roster server-side on every
 * open, and their names and student numbers are read from their profiles.
 */
const AdviserGradingView: React.FC = () => {
    const [mode, setMode] = useState<Mode>('list');

    // ── List state ─────────────────────────────────────────────────────────
    const [sections, setSections] = useState<Section[]>([]);
    const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
    const [termId, setTermId] = useState<string>('');
    const [sheets, setSheets] = useState<GradingSheetSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const [opening, setOpening] = useState<string | null>(null);

    // ── Sheet state ────────────────────────────────────────────────────────
    const [sheet, setSheet] = useState<GradingSheet | null>(null);
    const [sheetLoading, setSheetLoading] = useState(false);
    const [sheetError, setSheetError] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, DraftGrade>>({});
    const [saving, setSaving] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [search, setSearch] = useState('');

    const [showPreview, setShowPreview] = useState(false);
    const [historyFor, setHistoryFor] = useState<{ itemId: string | null; subject: string } | null>(null);
    const [confirmSubmit, setConfirmSubmit] = useState(false);
    const [showStudentNumbers, setShowStudentNumbers] = useState(false);

    /** Guards against a slow response for a sheet the adviser has navigated away from. */
    const pendingSheetId = useRef<string | null>(null);

    // ── Toasts ─────────────────────────────────────────────────────────────

    const toastSeq = useRef(0);
    const toastTimers = useRef<number[]>([]);

    const dismissToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    /**
     * Report the outcome of a save or a submission.
     *
     * In the corner rather than above the table: a banner inserted into the
     * layout pushes every row down at the moment the adviser is reading them,
     * and the row they were looking at moves out from under the cursor.
     */
    const pushToast = useCallback((tone: Toast['tone'], text: string) => {
        const id = ++toastSeq.current;
        setToasts(prev => [...prev.slice(-2), { id, tone, text }]);
        const timer = window.setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
        toastTimers.current.push(timer);
    }, [dismissToast]);

    useEffect(() => () => {
        toastTimers.current.forEach(window.clearTimeout);
    }, []);

    // ── Loading ────────────────────────────────────────────────────────────

    const loadList = useCallback(async () => {
        setLoading(true);
        setListError(null);
        try {
            const [mySections, years, mySheets] = await Promise.all([
                adviserService.getMySections(),
                gradingService.getSchoolYears(),
                gradingService.getMySheets(),
            ]);
            setSections(mySections);
            setSchoolYears(years);
            setSheets(mySheets);
            setTermId(current => current || years.find(y => y.is_active)?.id || years[0]?.id || '');
        } catch (err) {
            console.error('Failed to load grading sheets:', err);
            setListError(err instanceof Error ? err.message : 'Your grading sheets could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadList(); }, [loadList]);

    const loadSheet = useCallback(async (sheetId: string) => {
        pendingSheetId.current = sheetId;
        setMode('sheet');
        setSheetLoading(true);
        setSheetError(null);
        setDrafts({});
        setSearch('');
        try {
            const data = await gradingService.getSheet(sheetId);
            if (pendingSheetId.current !== sheetId) return;
            setSheet(data);
        } catch (err) {
            if (pendingSheetId.current !== sheetId) return;
            console.error('Failed to load the grading sheet:', err);
            setSheetError(err instanceof Error ? err.message : 'The grading sheet could not be loaded.');
        } finally {
            if (pendingSheetId.current === sheetId) setSheetLoading(false);
        }
    }, []);

    /** Open (creating on first use) the sheet for one section in the chosen term. */
    const openSection = async (section: Section) => {
        if (!termId) return;
        setOpening(section.id);
        setListError(null);
        try {
            const sheetId = await gradingService.openSheet(section.id, termId);
            await loadSheet(sheetId);
        } catch (err) {
            console.error('Failed to open the grading sheet:', err);
            setListError(err instanceof Error ? err.message : 'The grading sheet could not be opened.');
        } finally {
            setOpening(null);
        }
    };

    const backToList = () => {
        pendingSheetId.current = null;
        setMode('list');
        setSheet(null);
        setDrafts({});
        loadList();
    };

    // ── Editing ────────────────────────────────────────────────────────────

    const editable = sheet ? canEditGrades(sheet.status) : false;

    const scale = useMemo(
        () => sheet
            ? { min_grade: sheet.min_grade, max_grade: sheet.max_grade, passing_grade: sheet.passing_grade }
            : { min_grade: 0, max_grade: 100, passing_grade: 75 },
        [sheet],
    );

    /**
     * Typing only updates local state. Nothing reaches the database until
     * "Save Changes" — a grade is an academic record, not a search box.
     */
    const onGradeInput = (itemId: string, text: string) => {
        const result = validateFinalGrade(text, scale);
        setDrafts(prev => ({ ...prev, [itemId]: { text, error: text.trim() === '' ? null : result.error } }));
    };

    /** The value on screen for a row: the unsaved draft if there is one, else the stored grade. */
    const displayedGrade = (itemId: string, stored: number | null): string => {
        const draft = drafts[itemId];
        if (draft !== undefined) return draft.text;
        return stored === null ? '' : formatGrade(stored);
    };

    /** The remark shown live, recomputed from whatever is currently in the field. */
    const displayedRemarks = (itemId: string, stored: number | null): string | null => {
        const draft = drafts[itemId];
        if (draft === undefined) return remarksFor(stored, scale.passing_grade);
        const parsed = validateFinalGrade(draft.text, scale);
        if (!parsed.ok) return null;
        return remarksFor(parsed.value, scale.passing_grade);
    };

    const pendingEdits: GradeEdit[] = useMemo(() => {
        if (!sheet) return [];
        return sheet.items.flatMap(item => {
            const draft = drafts[item.id];
            if (draft === undefined || draft.error) return [];
            const parsed = validateFinalGrade(draft.text, scale);
            if (!parsed.ok) return [];
            if (parsed.value === item.final_grade) return [];
            return [{ item_id: item.id, final_grade: parsed.value }];
        });
    }, [sheet, drafts, scale]);

    const invalidCount = Object.values(drafts).filter(d => d.error).length;

    const saveChanges = async () => {
        if (!sheet || pendingEdits.length === 0) return;
        setSaving(true);
        try {
            const changed = await gradingService.saveGrades(sheet.id, pendingEdits);
            const fresh = await gradingService.getSheet(sheet.id);
            setSheet(fresh);
            setDrafts({});
            pushToast('ok', `${changed} grade${changed === 1 ? '' : 's'} saved.`);
        } catch (err) {
            console.error('Failed to save grades:', err);
            pushToast('error', err instanceof Error ? err.message : 'The grades could not be saved.');
        } finally {
            setSaving(false);
        }
    };

    const submitSheet = async () => {
        if (!sheet) return;
        setConfirmSubmit(false);
        setSaving(true);
        try {
            await gradingService.submit(sheet.id);
            const fresh = await gradingService.getSheet(sheet.id);
            setSheet(fresh);
            pushToast('ok', 'Submitted. The Coordinator has been notified and the grades are now locked.');
        } catch (err) {
            console.error('Failed to submit the grading sheet:', err);
            pushToast('error', err instanceof Error ? err.message : 'The grading sheet could not be submitted.');
        } finally {
            setSaving(false);
        }
    };

    // ── Derived ────────────────────────────────────────────────────────────

    const gradedCount = sheet ? sheet.items.filter(i => i.final_grade !== null).length : 0;
    const progress = sheet ? gradingProgress(gradedCount, sheet.items.length) : null;

    // A blank student number prints as "Not set" on the official document, so
    // the adviser is told before it reaches the coordinator rather than after.
    const missingNumbers = sheet ? sheet.items.filter(i => !i.student_number).length : 0;

    /**
     * The row number each student holds on the sheet, kept stable while a search
     * filters the table — the adviser's "#12" is the twelfth student on the
     * official document, not the twelfth row currently on screen.
     */
    const rowNumbers = useMemo(() => {
        const map = new Map<string, string>();
        sheet?.items.forEach((item, index) => map.set(item.id, rowNumber(index)));
        return map;
    }, [sheet]);

    const visibleItems = useMemo(() => {
        if (!sheet) return [];
        const term = search.trim().toLowerCase();
        if (!term) return sheet.items;
        return sheet.items.filter(i =>
            (i.student_name || '').toLowerCase().includes(term)
            || (i.student_number || '').toLowerCase().includes(term));
    }, [sheet, search]);

    const termOptions = schoolYears.map(y => ({
        value: y.id,
        label: `${y.school_year} · ${y.semester.charAt(0)}${y.semester.slice(1).toLowerCase()} Semester${y.is_active ? ' (current)' : ''}`,
    }));

    /** The sheet already stored for a section in the selected term, if any. */
    const sheetForSection = (sectionId: string): GradingSheetSummary | undefined =>
        sheets.find(s => s.section_id === sectionId && s.school_year_id === termId);

    const toastStack = toasts.length === 0 ? null : (
        <div className="gs-toasts" role="status" aria-live="polite">
            {toasts.map(toast => (
                <div key={toast.id} className={`gs-toast is-${toast.tone}`}>
                    <span>{toast.text}</span>
                    <button
                        type="button"
                        className="gs-toast-close"
                        onClick={() => dismissToast(toast.id)}
                        aria-label="Dismiss"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>
            ))}
        </div>
    );

    // ═══ LIST ══════════════════════════════════════════════════════════════

    if (mode === 'list') {
        if (loading) {
            return (
                <div className="gs-scope">
                    <div className="admin-table-card">
                        <div className="admin-table-header"><div className="admin-table-title">My Grading Sheets</div></div>
                        <TableSkeleton rows={4} cols={5} />
                    </div>
                </div>
            );
        }

        if (listError) {
            return (
                <div className="gs-scope">
                    <div className="admin-table-card gs-center-card">
                        <h3>Could not load your grading sheets</h3>
                        <p>{listError}</p>
                        <button className="cd-btn cd-btn-primary gs-btn-sm" onClick={loadList}>Try Again</button>
                    </div>
                </div>
            );
        }

        if (sections.length === 0) {
            return (
                <div className="gs-scope">
                    <div className="admin-table-card gs-center-card">
                        <h3>No Sections Assigned</h3>
                        <p>
                            A grading sheet is created for a section you handle. You currently have no
                            sections assigned — please contact the SIL/OJT Coordinator.
                        </p>
                    </div>
                </div>
            );
        }

        const term = schoolYears.find(y => y.id === termId);

        return (
            <div className="fade-in gs-scope">
                <div className="gs-view-head">
                    <div>
                        <div className="gs-view-title">My Grading Sheets</div>
                        <div className="gs-view-sub">
                            One Official Grading Sheet per section, per term. Select a term, then open a section.
                        </div>
                    </div>
                    <div className="gs-term-picker">
                        <span className="gs-term-label">School Year &amp; Semester</span>
                        <CustomSelect
                            options={termOptions}
                            value={termId}
                            onChange={setTermId}
                            placeholder="Select a term"
                        />
                    </div>
                </div>

                <div className="admin-table-card gs-table-card">
                    <div className="gs-table-scroll">
                        <table className="admin-table gs-list-table">
                            <thead>
                                <tr>
                                    <th>Section</th>
                                    <th className="gs-c-term">Term</th>
                                    <th className="gs-c-count gs-num">Students</th>
                                    <th className="gs-c-count gs-num">Graded</th>
                                    <th className="gs-c-status">Status</th>
                                    <th className="gs-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sections.map(section => {
                                    const existing = sheetForSection(section.id);
                                    const status = existing?.status;
                                    const total = existing?.student_count ?? section.student_count ?? 0;
                                    return (
                                        <tr key={section.id}>
                                            <td>
                                                {/* Section code first at full weight; the programme
                                                    is context and stays muted underneath it. */}
                                                <div className="gs-cell-stack">
                                                    <span className="gs-cell-title">{section.name}</span>
                                                    <span className="gs-cell-sub">
                                                        {section.course_code === 'DHT'
                                                            ? 'Diploma in Hospitality Technology'
                                                            : 'Diploma in Information Technology'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="gs-c-term">
                                                {term ? formatTerm(term.school_year, term.semester) : '—'}
                                            </td>
                                            <td className="gs-c-count gs-num">
                                                <span className="gs-count">{total}</span>
                                            </td>
                                            <td className="gs-c-count gs-num">
                                                {existing ? (
                                                    <>
                                                        <span className="gs-count">{existing.graded_count}</span>
                                                        <span className="gs-count-total">/{existing.student_count}</span>
                                                    </>
                                                ) : (
                                                    <span className="gs-count-total">—</span>
                                                )}
                                            </td>
                                            <td className="gs-c-status">
                                                {status ? (
                                                    <span className={`gs-status ${statusTone(status)}`}>
                                                        {STATUS_LABELS[status]}
                                                    </span>
                                                ) : (
                                                    <span className="gs-status is-none">Not Started</span>
                                                )}
                                            </td>
                                            <td className="gs-right">
                                                {/* Only the actions the current status allows. */}
                                                <button
                                                    className={`cd-btn gs-btn-sm ${status === undefined || status === 'draft' ? 'cd-btn-primary' : 'cd-btn-outline'}`}
                                                    onClick={() => openSection(section)}
                                                    disabled={opening === section.id || !termId}
                                                >
                                                    {opening === section.id
                                                        ? 'Opening…'
                                                        : status === undefined ? 'Create Sheet'
                                                            : status === 'draft' ? 'Edit Grades'
                                                                : 'Open'}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {sheets.filter(s => s.return_reason && s.status === 'draft').map(s => (
                    <div key={s.id} className="gs-alert gs-alert-warning gs-alert-spaced">
                        <strong>{s.section_name} was returned for correction.</strong> {s.return_reason}
                    </div>
                ))}

                {toastStack}
            </div>
        );
    }

    // ═══ SHEET ═════════════════════════════════════════════════════════════

    if (sheetLoading) {
        return (
            <div className="gs-scope">
                <div className="admin-table-card">
                    <div className="admin-table-header"><div className="admin-table-title">Loading grading sheet…</div></div>
                    <TableSkeleton rows={6} cols={5} />
                </div>
            </div>
        );
    }

    if (sheetError || !sheet) {
        return (
            <div className="gs-scope">
                <div className="admin-table-card gs-center-card">
                    <h3>Grading Sheet Unavailable</h3>
                    <p>{sheetError || 'The grading sheet could not be loaded.'}</p>
                    <button className="cd-btn cd-btn-outline gs-btn-sm" onClick={backToList}>Back to My Grading Sheets</button>
                </div>
            </div>
        );
    }

    const stageIndex = STATUS_ORDER.indexOf(sheet.status);

    return (
        <div className="fade-in gs-scope">
            {/* ── Header ── */}
            <div className="gs-sheet-head">
                <div>
                    <button className="gs-back" onClick={backToList}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        My Grading Sheets
                    </button>
                    <div className="gs-sheet-title">
                        <b>{sheet.section.name}</b>
                        <span>· Official Grading Sheet</span>
                    </div>
                    <div className="gs-view-sub">
                        {sheet.subject_code} — {sheet.course_description} ·{' '}
                        {formatTerm(sheet.school_year.school_year, sheet.school_year.semester)}
                    </div>
                </div>

                <div className="gs-head-actions">
                    <button className="cd-btn cd-btn-outline gs-btn-sm" onClick={() => setShowPreview(true)}>
                        Preview Official Sheet
                    </button>
                    <button
                        className="cd-btn cd-btn-outline gs-btn-sm"
                        onClick={() => setShowStudentNumbers(true)}
                    >
                        Student Numbers
                    </button>
                    <button
                        className="cd-btn cd-btn-outline gs-btn-sm"
                        onClick={() => setHistoryFor({ itemId: null, subject: `${sheet.section.name} · all changes` })}
                    >
                        View History
                    </button>
                    {editable && (
                        <button
                            className="cd-btn cd-btn-primary gs-btn-sm"
                            onClick={() => setConfirmSubmit(true)}
                            disabled={saving || !progress?.complete || pendingEdits.length > 0}
                            title={
                                pendingEdits.length > 0 ? 'Save your changes first.'
                                    : !progress?.complete ? 'Every student needs a final grade first.'
                                        : undefined
                            }
                        >
                            Submit for Verification
                        </button>
                    )}
                </div>
            </div>

            {/* ── Status stepper ── */}
            <div className="gs-rail">
                {STATUS_ORDER.map((status, index) => (
                    <div
                        key={status}
                        className={`gs-rail-step${index < stageIndex ? ' is-done' : ''}${index === stageIndex ? ' is-current' : ''}`}
                        aria-current={index === stageIndex ? 'step' : undefined}
                    >
                        <span className="gs-rail-dot" aria-hidden="true">{index + 1}</span>
                        <span className="gs-rail-label">{STATUS_LABELS[status]}</span>
                    </div>
                ))}
                <div className="gs-rail-note">{STATUS_DESCRIPTIONS[sheet.status]}</div>
            </div>

            {/*
              * The grading summary as one line of facts rather than five stat
              * cards: every figure here is a single number the adviser glances
              * at, and none of them earns a card of its own.
              */}
            <div className="gs-summary">
                <span className="gs-summary-item">
                    <span className="gs-summary-value">{sheet.items.length}</span> Students
                </span>
                <span className="gs-summary-item">
                    <span className="gs-summary-value">{gradedCount}</span> Graded
                </span>
                <span className={`gs-summary-item${progress && !progress.complete ? ' is-pending' : ''}`}>
                    <span className="gs-summary-value">{progress?.remaining ?? 0}</span> Remaining
                </span>
                <span className="gs-summary-scale">
                    <span className="gs-summary-item">
                        Passing Mark <span className="gs-summary-value">{formatGrade(sheet.passing_grade)}</span>
                    </span>
                    <span className="gs-summary-item">
                        Range{' '}
                        <span className="gs-summary-value">
                            {formatGrade(sheet.min_grade)}–{formatGrade(sheet.max_grade)}
                        </span>
                    </span>
                </span>
            </div>

            {sheet.return_reason && sheet.status === 'draft' && (
                <div className="gs-alert gs-alert-warning">
                    <strong>Returned for correction.</strong> {sheet.return_reason}
                </div>
            )}

            {sheet.status === 'finalized' && (
                <div className="gs-alert gs-alert-locked">
                    This grading sheet has been finalized and can no longer be edited. A correction
                    now requires a Grade Correction Request through the Coordinator.
                </div>
            )}

            {missingNumbers > 0 && (
                <div className="gs-alert gs-alert-warning gs-alert-action">
                    <span>
                        <strong>{missingNumbers} student{missingNumbers === 1 ? '' : 's'} ha{missingNumbers === 1 ? 's' : 've'} no student number.</strong>{' '}
                        The official sheet leaves a dash in that column until it is filled in.
                    </span>
                    <button className="cd-btn cd-btn-outline gs-btn-sm" onClick={() => setShowStudentNumbers(true)}>
                        Fill In Now
                    </button>
                </div>
            )}

            {/* ── Editor ── */}
            <div className="admin-table-card gs-table-card">
                {/*
                  * Search and Save sit in the table's own header bar, flush with
                  * its gutters, so the controls share the left and right edges of
                  * the data they act on.
                  */}
                <div className="gs-editor-bar">
                    <div className="gs-editor-stats">
                        <span><strong>{sheet.items.length}</strong> students</span>
                        <span className="gs-progress" aria-hidden="true">
                            <span className="gs-progress-fill" style={{ width: `${progress?.percent ?? 0}%` }} />
                        </span>
                        <span><strong>{gradedCount}</strong> graded ({progress?.percent ?? 0}%)</span>
                        {progress && !progress.complete && (
                            <span className="gs-pending">{progress.remaining} remaining</span>
                        )}
                    </div>
                    <div className="gs-editor-tools">
                        {/* Unsaved work is stated, not only implied by an enabled button. */}
                        {pendingEdits.length > 0 && (
                            <span className="gs-unsaved">
                                {pendingEdits.length} unsaved
                            </span>
                        )}
                        <input
                            type="search"
                            className="gs-search"
                            placeholder="Search student…"
                            aria-label="Search students on this grading sheet"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {editable && (
                            <button
                                className="cd-btn cd-btn-primary gs-btn-sm"
                                onClick={saveChanges}
                                disabled={saving || pendingEdits.length === 0 || invalidCount > 0}
                            >
                                {saving ? 'Saving…' : 'Save Changes'}
                            </button>
                        )}
                    </div>
                </div>

                {invalidCount > 0 && (
                    <div className="gs-alert gs-alert-danger gs-alert-inline">
                        {invalidCount} grade{invalidCount === 1 ? ' is' : 's are'} invalid. Fix them before saving.
                    </div>
                )}

                <div className="gs-table-scroll">
                    <table className="admin-table gs-grade-table">
                        <thead>
                            <tr>
                                <th className="gs-c-index">#</th>
                                <th className="gs-c-sno">Student No.</th>
                                <th>Student Name</th>
                                <th className="gs-c-grade">Final Grade</th>
                                <th className="gs-c-remark">Remarks</th>
                                <th className="gs-c-history gs-right">History</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleItems.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="gs-empty-row">
                                        {sheet.items.length === 0
                                            ? 'No students are enrolled in this section yet.'
                                            : `No student matches “${search.trim()}”.`}
                                    </td>
                                </tr>
                            ) : visibleItems.map(item => {
                                const draft = drafts[item.id];
                                const remarks = displayedRemarks(item.id, item.final_grade);
                                const dirty = pendingEdits.some(e => e.item_id === item.id);
                                return (
                                    <tr key={item.id} className={dirty ? 'gs-row-dirty' : undefined}>
                                        <td className="gs-c-index gs-muted">
                                            {rowNumbers.get(item.id)}
                                        </td>
                                        <td className="gs-c-sno">
                                            {item.student_number || <span className="gs-muted">Not set</span>}
                                        </td>
                                        <td className="gs-c-name">{item.student_name || '—'}</td>
                                        <td className="gs-c-grade">
                                            {editable ? (
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    className={`gs-grade-input${draft?.error ? ' has-error' : ''}`}
                                                    value={displayedGrade(item.id, item.final_grade)}
                                                    onChange={e => onGradeInput(item.id, e.target.value)}
                                                    aria-label={`Final grade for ${item.student_name || 'student'}`}
                                                    aria-invalid={Boolean(draft?.error)}
                                                    placeholder="—"
                                                />
                                            ) : (
                                                <span className="gs-grade-static">
                                                    {formatGrade(item.final_grade) || '—'}
                                                </span>
                                            )}
                                            {draft?.error && <div className="gs-field-error">{draft.error}</div>}
                                        </td>
                                        <td className="gs-c-remark">
                                            {/* Derived from the grade, never typed. */}
                                            {remarks ? (
                                                <span className={`gs-remark ${remarks === 'PASSED' ? 'is-pass' : 'is-fail'}`}>
                                                    {remarks}
                                                </span>
                                            ) : (
                                                <span className="gs-muted">—</span>
                                            )}
                                        </td>
                                        <td className="gs-c-history gs-right">
                                            <button
                                                className="gs-link-btn"
                                                onClick={() => setHistoryFor({
                                                    itemId: item.id,
                                                    subject: item.student_name || 'Student',
                                                })}
                                            >
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {toastStack}

            {/* ── Modals ── */}
            {showPreview && (
                <GradingSheetPreviewModal sheet={sheet} onClose={() => setShowPreview(false)} />
            )}

            {historyFor && (
                <GradeHistoryModal
                    sheetId={sheet.id}
                    itemId={historyFor.itemId}
                    subject={historyFor.subject}
                    onClose={() => setHistoryFor(null)}
                />
            )}

            {showStudentNumbers && (
                <StudentNumbersModal
                    items={sheet.items}
                    sectionName={sheet.section.name}
                    // The numbers live on the profile, so the sheet has to be
                    // re-read to show them — it holds no copy of its own.
                    onSaved={() => loadSheet(sheet.id)}
                    onClose={() => setShowStudentNumbers(false)}
                />
            )}

            {confirmSubmit && (
                <div className="gs-modal-backdrop" role="dialog" aria-modal="true">
                    <div className="gs-modal">
                        <div className="gs-modal-head">
                            <div className="gs-modal-title">Submit Official Grading Sheet?</div>
                        </div>
                        <div className="gs-modal-body">
                            <dl className="gs-confirm-list">
                                <div><dt>Section</dt><dd>{sheet.section.name}</dd></div>
                                <div><dt>School Year</dt><dd>{sheet.school_year.school_year}</dd></div>
                                <div>
                                    <dt>Semester</dt>
                                    <dd>{sheet.school_year.semester.charAt(0)}{sheet.school_year.semester.slice(1).toLowerCase()}</dd>
                                </div>
                                <div><dt>Students</dt><dd>{sheet.items.length}</dd></div>
                            </dl>
                            <p className="gs-modal-warning">
                                After submission, grades cannot be edited unless the Coordinator
                                returns the sheet for correction.
                            </p>
                        </div>
                        <div className="gs-modal-foot">
                            <button className="cd-btn cd-btn-outline" onClick={() => setConfirmSubmit(false)}>Cancel</button>
                            <button className="cd-btn cd-btn-primary" onClick={submitSheet} disabled={saving}>
                                {saving ? 'Submitting…' : 'Submit for Verification'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdviserGradingView;
