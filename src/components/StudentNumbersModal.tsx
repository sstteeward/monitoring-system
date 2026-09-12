import React, { useMemo, useState } from 'react';
import { gradingService, type GradingSheetItem } from '../services/gradingService';
import { findDuplicateStudentNumber, validateStudentNumber } from '../utils/studentNumber';
import './GradingSheet.css';

interface StudentNumbersModalProps {
    /** The roster, in the order the grading sheet shows it. */
    items: GradingSheetItem[];
    sectionName: string;
    /** Called once after at least one number was saved, so the sheet reloads. */
    onSaved: () => void;
    onClose: () => void;
}

interface Draft {
    text: string;
    error: string | null;
}

/**
 * Fill in the official student numbers for a section.
 *
 * The number is printed beside every name on the Official Grading Sheet, and a
 * blank one leaves "Not set" on an official document. Students supply it during
 * onboarding when they have it to hand; this is where the adviser fills the
 * rest.
 *
 * It edits `profiles.student_number` through `set_student_number` — the grading
 * sheet never stores its own copy, so a number corrected here corrects every
 * sheet that shows that student.
 */
const StudentNumbersModal: React.FC<StudentNumbersModalProps> = ({
    items, sectionName, onSaved, onClose,
}) => {
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedCount, setSavedCount] = useState<number | null>(null);

    /** The value on screen for a row: the unsaved draft, else what is stored. */
    const displayedFor = (item: GradingSheetItem, current: Record<string, Draft>): string => {
        const draft = current[item.student_id];
        return draft === undefined ? (item.student_number ?? '') : draft.text;
    };

    const displayed = (item: GradingSheetItem): string => displayedFor(item, drafts);

    const onInput = (studentId: string, text: string) => {
        const result = validateStudentNumber(text);
        setDrafts(prev => ({
            ...prev,
            [studentId]: { text, error: text.trim() === '' ? null : result.error },
        }));
        setError(null);
        setSavedCount(null);
    };

    /** Rows whose value actually differs from what is stored. */
    const pending = useMemo(() => items.flatMap(item => {
        const draft = drafts[item.student_id];
        if (draft === undefined || draft.error) return [];
        const parsed = validateStudentNumber(draft.text);
        if (!parsed.ok) return [];
        const current = item.student_number ?? null;
        if (parsed.value === current) return [];
        return [{ studentId: item.student_id, value: parsed.value, name: item.student_name }];
    }), [items, drafts]);

    const invalidCount = Object.values(drafts).filter(d => d.error).length;

    /*
     * The database has a unique index on the student number, but an adviser
     * typing the same number onto two rows should hear about it here rather
     * than have the first save succeed and the second fail.
     */
    const duplicateStudentId = useMemo(() => findDuplicateStudentNumber(
        items.map(item => ({
            key: item.student_id,
            studentNumber: displayedFor(item, drafts),
        })),
    ), [items, drafts]);

    const save = async () => {
        if (pending.length === 0 || duplicateStudentId) return;
        setSaving(true);
        setError(null);
        let saved = 0;
        try {
            // One call per student: the numbers are independent, and a failure
            // on one must not discard the ones already accepted.
            for (const entry of pending) {
                await gradingService.setStudentNumber(entry.studentId, entry.value);
                saved += 1;
            }
            setDrafts({});
            setSavedCount(saved);
            onSaved();
        } catch (err) {
            console.error('Failed to save a student number:', err);
            const message = err instanceof Error ? err.message : 'The student number could not be saved.';
            setError(saved > 0 ? `${saved} saved, then: ${message}` : message);
            if (saved > 0) onSaved();
        } finally {
            setSaving(false);
        }
    };

    const missingCount = items.filter(i => !i.student_number).length;

    return (
        <div className="gs-modal-backdrop" role="dialog" aria-modal="true" aria-label="Student numbers">
            <div className="gs-modal gs-modal-wide">
                <div className="gs-modal-head">
                    <div>
                        <div className="gs-modal-title">Student Numbers</div>
                        <div className="gs-modal-sub">
                            {sectionName} · {missingCount === 0
                                ? 'every student has a number'
                                : `${missingCount} of ${items.length} still missing`}
                        </div>
                    </div>
                    <button className="gs-icon-btn" onClick={onClose} aria-label="Close">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                <div className="gs-modal-body gs-modal-body-table">
                    <p className="gs-modal-lead">
                        The student number is printed beside every name on the Official Grading
                        Sheet. It is stored on the student's profile, so a correction here applies
                        to every sheet that shows them.
                    </p>

                    {error && <div className="gs-alert gs-alert-danger gs-alert-inline">{error}</div>}
                    {savedCount !== null && !error && (
                        <div className="gs-alert gs-alert-ok gs-alert-inline">
                            {savedCount} student number{savedCount === 1 ? '' : 's'} saved.
                        </div>
                    )}
                    {duplicateStudentId && (
                        <div className="gs-alert gs-alert-danger gs-alert-inline">
                            Two students have the same number. Each student number must be unique.
                        </div>
                    )}

                    <div className="gs-table-scroll">
                        <table className="admin-table gs-grade-table">
                            <thead>
                                <tr>
                                    <th className="gs-c-index">#</th>
                                    <th>Student Name</th>
                                    <th className="gs-c-sno-edit">Student No.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, index) => {
                                    const draft = drafts[item.student_id];
                                    const isDuplicate = duplicateStudentId === item.student_id;
                                    const dirty = pending.some(p => p.studentId === item.student_id);
                                    return (
                                        <tr key={item.id} className={dirty ? 'gs-row-dirty' : undefined}>
                                            <td className="gs-c-index gs-muted">{index + 1}</td>
                                            <td className="gs-strong">{item.student_name || '—'}</td>
                                            <td className="gs-c-sno-edit">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    className={`gs-sno-input${draft?.error || isDuplicate ? ' has-error' : ''}`}
                                                    value={displayed(item)}
                                                    onChange={e => onInput(item.student_id, e.target.value)}
                                                    placeholder="2023-24610795"
                                                    aria-label={`Student number for ${item.student_name || 'student'}`}
                                                    aria-invalid={Boolean(draft?.error || isDuplicate)}
                                                />
                                                {draft?.error && <div className="gs-field-error">{draft.error}</div>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="gs-modal-foot">
                    <span className="gs-modal-note">
                        Leaving one blank is allowed; the official sheet prints a dash instead.
                    </span>
                    <button className="cd-btn cd-btn-outline" onClick={onClose}>Close</button>
                    <button
                        className="cd-btn cd-btn-primary"
                        onClick={save}
                        disabled={saving || pending.length === 0 || invalidCount > 0 || Boolean(duplicateStudentId)}
                    >
                        {saving ? 'Saving…'
                            : pending.length > 0 ? `Save (${pending.length})`
                                : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StudentNumbersModal;
