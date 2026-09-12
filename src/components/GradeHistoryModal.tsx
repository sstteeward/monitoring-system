import React, { useEffect, useState } from 'react';
import { gradingService, type GradeHistoryEntry } from '../services/gradingService';
import { AUDIT_ACTION_LABELS, formatGrade } from '../utils/grading';
import './GradingSheet.css';

interface GradeHistoryModalProps {
    sheetId: string;
    /** Set to narrow the history to one student's row. */
    itemId?: string | null;
    /** Heading shown above the timeline — the student's name, or the section. */
    subject: string;
    onClose: () => void;
}

const formatMoment = (value: string): string => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
    });
};

/**
 * "View Grade History".
 *
 * Reads `grade_audit_logs`, which is append-only in the database — there is no
 * edit or delete control here because there is no way to edit or delete one.
 */
const GradeHistoryModal: React.FC<GradeHistoryModalProps> = ({ sheetId, itemId, subject, onClose }) => {
    const [entries, setEntries] = useState<GradeHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        // The modal mounts already in its loading state, so the fetch below is
        // the effect's only job — no synchronous setState to start it off.
        const load = async () => {
            try {
                const data = await gradingService.getHistory(sheetId, itemId);
                if (!cancelled) setEntries(data);
            } catch (err) {
                if (cancelled) return;
                console.error('Failed to load the grade history:', err);
                setError(err instanceof Error ? err.message : 'The grade history could not be loaded.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [sheetId, itemId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="gs-modal-backdrop" role="dialog" aria-modal="true" aria-label="Grade history">
            <div className="gs-modal gs-modal-wide">
                <div className="gs-modal-head">
                    <div>
                        <div className="gs-modal-title">Grade History</div>
                        <div className="gs-modal-sub">{subject}</div>
                    </div>
                    <button className="gs-icon-btn" onClick={onClose} aria-label="Close">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                <div className="gs-modal-body">
                    {loading ? (
                        <div className="gs-empty">Loading the history…</div>
                    ) : error ? (
                        <div className="gs-alert gs-alert-danger">{error}</div>
                    ) : entries.length === 0 ? (
                        <div className="gs-empty">Nothing has been recorded yet.</div>
                    ) : (
                        <ol className="gs-timeline">
                            {entries.map(entry => {
                                const isGrade = entry.action === 'grade_entered' || entry.action === 'grade_changed';
                                return (
                                    <li key={entry.id} className="gs-timeline-item">
                                        <div className={`gs-timeline-dot gs-dot-${entry.action.replace('_', '-')}`} />
                                        <div className="gs-timeline-body">
                                            <div className="gs-timeline-head">
                                                <span className="gs-timeline-action">
                                                    {AUDIT_ACTION_LABELS[entry.action] || entry.action}
                                                </span>
                                                <span className="gs-timeline-time">{formatMoment(entry.created_at)}</span>
                                            </div>

                                            {/* Only show the student when the timeline spans the
                                                whole sheet; on one student's own history it would
                                                repeat on every row. */}
                                            {!itemId && entry.student_name && (
                                                <div className="gs-timeline-student">{entry.student_name}</div>
                                            )}

                                            {isGrade && (
                                                <div className="gs-grade-change">
                                                    <span className="gs-grade-old">
                                                        {entry.old_grade === null ? 'blank' : formatGrade(entry.old_grade)}
                                                    </span>
                                                    <span className="gs-grade-arrow">→</span>
                                                    <span className="gs-grade-new">
                                                        {entry.new_grade === null ? 'blank' : formatGrade(entry.new_grade)}
                                                    </span>
                                                </div>
                                            )}

                                            {!isGrade && entry.old_status && entry.new_status && (
                                                <div className="gs-grade-change">
                                                    <span className="gs-grade-old">{entry.old_status.replace('_', ' ')}</span>
                                                    <span className="gs-grade-arrow">→</span>
                                                    <span className="gs-grade-new">{entry.new_status.replace('_', ' ')}</span>
                                                </div>
                                            )}

                                            <div className="gs-timeline-meta">
                                                {entry.user_name?.trim() || 'Unknown user'}
                                                {entry.user_role ? ` · ${entry.user_role}` : ''}
                                            </div>

                                            {entry.reason && (
                                                <div className="gs-timeline-reason">
                                                    <span>Reason:</span> {entry.reason}
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </div>

                <div className="gs-modal-foot">
                    <span className="gs-modal-note">
                        Grade history is permanent. Records cannot be edited or deleted by anyone.
                    </span>
                    <button className="cd-btn cd-btn-outline" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
};

export default GradeHistoryModal;
