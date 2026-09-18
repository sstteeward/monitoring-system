import React, { useMemo, useState } from 'react';
import type { AdminTimesheetRow } from '../services/attendanceService';
import { mapTimesheetOverrideError } from '../services/attendanceService';
import { sessionWorkedMinutes, formatMinutes } from '../utils/attendanceLimit';
import {
    isoToZonedLocal,
    zonedLocalToIso,
    validateSessionDraft,
} from '../utils/timesheetCorrection';

/**
 * Admin clock-record editor: correct an existing session, force a clock-out on
 * an open one, or add a whole session.
 *
 * Reuses AttendanceRecordModal's structure and AttendanceView.css classes. Every
 * datetime-local value is read in the ATTENDANCE time zone, never the browser's,
 * so an admin abroad edits the student's Philippine wall-clock time. The live
 * "Rendered" preview and the inline validation mirror the server; the server
 * stays the authority, and its error is shown inline.
 */

export type TimesheetModalMode = 'edit' | 'clock_out' | 'add';

export interface TimesheetSubmit {
    clockInIso: string;
    clockOutIso: string;
    breakStartIso: string | null;
    breakEndIso: string | null;
    reason: string;
}

interface Props {
    open: boolean;
    mode: TimesheetModalMode;
    studentName: string;
    studentEmail?: string;
    /** Attendance day, YYYY-MM-DD, for the header. */
    date: string;
    timeZone: string;
    /** The record being edited or clocked out (required for those modes). */
    existing?: AdminTimesheetRow | null;
    /** Shown on 'add' when the day is marked absent / on leave. */
    statusWarning?: string | null;
    onClose: () => void;
    onSubmit: (data: TimesheetSubmit) => Promise<void>;
}

const TITLES: Record<TimesheetModalMode, string> = {
    edit: 'Correct Clock Record',
    clock_out: 'Record Clock-Out',
    add: 'Add Clock Record',
};

const AdminTimesheetModal: React.FC<Props> = ({
    open, mode, studentName, studentEmail, date, timeZone, existing, statusWarning, onClose, onSubmit,
}) => {
    const [clockIn, setClockIn] = useState(() =>
        mode === 'add' ? '' : isoToZonedLocal(existing?.clock_in, timeZone));
    const [clockOut, setClockOut] = useState(() =>
        isoToZonedLocal(existing?.clock_out, timeZone));
    const [breakStart, setBreakStart] = useState(() =>
        mode === 'add' ? '' : isoToZonedLocal(existing?.break_start, timeZone));
    const [breakEnd, setBreakEnd] = useState(() =>
        mode === 'add' ? '' : isoToZonedLocal(existing?.break_end, timeZone));
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Captured once, so the render stays pure. The preview only uses `now` for an
    // open-ended session, and this modal always requires a clock-out, so a
    // slightly stale value never affects what is shown.
    const [nowMs] = useState(() => Date.now());

    // 'clock_out' keeps the recorded clock-in fixed; only the clock-out is set.
    const clockInLocked = mode === 'clock_out';

    const iso = useMemo(() => {
        const clockInIso = clockInLocked
            ? (existing?.clock_in ?? '')
            : zonedLocalToIso(clockIn, timeZone);
        const clockOutIso = zonedLocalToIso(clockOut, timeZone);
        // On clock-out, keep the recorded break; a break still open is closed at
        // the clock-out time server-side, so preview it the same way.
        const breakStartIso = clockInLocked
            ? (existing?.break_start ?? null)
            : (breakStart ? zonedLocalToIso(breakStart, timeZone) : null);
        const breakEndIso = clockInLocked
            ? (existing?.break_end ?? (existing?.status === 'break' ? clockOutIso : null))
            : (breakEnd ? zonedLocalToIso(breakEnd, timeZone) : null);
        return { clockInIso, clockOutIso, breakStartIso, breakEndIso };
    }, [clockInLocked, existing, clockIn, clockOut, breakStart, breakEnd, timeZone]);

    const validation = useMemo(() => validateSessionDraft({
        clockIn: iso.clockInIso || null,
        clockOut: iso.clockOutIso || null,
        breakStart: iso.breakStartIso,
        breakEnd: iso.breakEndIso,
    }), [iso]);

    const renderedMinutes = useMemo(() => {
        if (!iso.clockInIso || !iso.clockOutIso) return null;
        return sessionWorkedMinutes({
            clock_in: iso.clockInIso,
            clock_out: iso.clockOutIso,
            break_start: iso.breakStartIso,
            break_end: iso.breakEndIso,
        }, nowMs);
    }, [iso, nowMs]);

    if (!open) return null;

    const reasonMissing = reason.trim().length === 0;
    const canSubmit = validation.ok && !reasonMissing && !submitting;

    const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    const handleSave = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setError(null);
        try {
            await onSubmit({
                clockInIso: iso.clockInIso,
                clockOutIso: iso.clockOutIso,
                breakStartIso: iso.breakStartIso,
                breakEndIso: iso.breakEndIso,
                reason: reason.trim(),
            });
        } catch (err) {
            console.error('Clock-record override failed:', err);
            setError(mapTimesheetOverrideError(err));
            setSubmitting(false);
        }
    };

    return (
        <div className="attendance-modal-overlay" onClick={handleBackdrop}>
            <div className="attendance-modal">
                <div className="attendance-modal-header">
                    <div>
                        <h3>{TITLES[mode]}</h3>
                        <div className="attendance-muted" style={{ marginTop: '0.2rem' }}>
                            {studentName}{studentEmail ? ` · ${studentEmail}` : ''}
                            {' · '}
                            {new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            {' · '}{timeZone}
                        </div>
                    </div>
                    <button className="attendance-modal-close" onClick={onClose} title="Close" type="button">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                <p className="attendance-form-hint" style={{ marginTop: 0, marginBottom: '0.9rem' }}>
                    Administrator override. Times are in {timeZone}.
                </p>

                {statusWarning && (
                    <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '0.6rem 0.85rem', color: '#b45309', fontSize: '0.8rem', marginBottom: '0.9rem' }}>
                        {statusWarning}
                    </div>
                )}

                <div className="attendance-form-group">
                    <label className="attendance-form-label">Clock In</label>
                    <input
                        type="datetime-local"
                        className="attendance-form-control"
                        value={clockInLocked ? isoToZonedLocal(existing?.clock_in, timeZone) : clockIn}
                        disabled={clockInLocked}
                        onChange={e => setClockIn(e.target.value)}
                    />
                    {clockInLocked && (
                        <p className="attendance-form-hint">The recorded clock-in is kept; only the clock-out is set.</p>
                    )}
                </div>

                <div className="attendance-form-group">
                    <label className="attendance-form-label">Clock Out</label>
                    <input
                        type="datetime-local"
                        className="attendance-form-control"
                        value={clockOut}
                        onChange={e => setClockOut(e.target.value)}
                    />
                </div>

                {!clockInLocked && (
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div className="attendance-form-group" style={{ flex: '1 1 160px' }}>
                            <label className="attendance-form-label">Break Start (optional)</label>
                            <input
                                type="datetime-local"
                                className="attendance-form-control"
                                value={breakStart}
                                onChange={e => setBreakStart(e.target.value)}
                            />
                        </div>
                        <div className="attendance-form-group" style={{ flex: '1 1 160px' }}>
                            <label className="attendance-form-label">Break End (optional)</label>
                            <input
                                type="datetime-local"
                                className="attendance-form-control"
                                value={breakEnd}
                                onChange={e => setBreakEnd(e.target.value)}
                            />
                        </div>
                    </div>
                )}

                <div className="attendance-form-group">
                    <label className="attendance-form-label">Rendered</label>
                    <div className="attendance-form-control" style={{ background: 'var(--bg-app, #f8fafc)', pointerEvents: 'none' }}>
                        {renderedMinutes === null ? '—' : formatMinutes(renderedMinutes)}
                    </div>
                </div>

                <div className="attendance-form-group">
                    <label className="attendance-form-label">Reason for override</label>
                    <textarea
                        className="attendance-form-control"
                        rows={3}
                        placeholder="Explain why this correction is necessary. The student is notified."
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                    />
                    {reasonMissing && (
                        <p className="attendance-form-hint">A reason is required for an administrator override.</p>
                    )}
                </div>

                {!validation.ok && !reasonMissing && (
                    <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '0.6rem 0.85rem', color: '#b45309', fontSize: '0.8rem', marginBottom: '1rem' }}>
                        {validation.error}
                    </div>
                )}

                {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.65rem 0.9rem', color: '#f87171', fontSize: '0.82rem', marginBottom: '1rem' }}>
                        {error}
                    </div>
                )}

                <div className="attendance-modal-actions">
                    <button className="attendance-btn attendance-btn-ghost" onClick={onClose} type="button">Cancel</button>
                    <button
                        className="attendance-btn attendance-btn-primary"
                        onClick={handleSave}
                        disabled={!canSubmit}
                        type="button"
                    >
                        {submitting ? 'Saving…' : mode === 'add' ? 'Add Session' : mode === 'clock_out' ? 'Record Clock-Out' : 'Save Correction'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminTimesheetModal;
