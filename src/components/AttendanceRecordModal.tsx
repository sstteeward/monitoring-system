import React, { useState } from 'react';
import type { AttendanceStatus } from '../services/attendanceService';
import {
  ATTENDANCE_STATUS_CONFIG,
  ATTENDANCE_STATUS_ORDER,
  ABSENCE_REASONS
} from './attendanceConstants';

interface AttendanceRecordModalProps {
  open: boolean;
  studentName: string;
  studentEmail?: string;
  date: string;
  existingStatus?: AttendanceStatus | null;
  existingReason?: string | null;
  existingRemarks?: string | null;
  defaultStatus?: AttendanceStatus;
  isEditing: boolean;
  onClose: () => void;
  onSubmit: (status: AttendanceStatus, reason: string | null, remarks: string | null) => Promise<void>;
}

const AttendanceRecordModal: React.FC<AttendanceRecordModalProps> = ({
  open,
  studentName,
  studentEmail,
  date,
  existingStatus,
  existingReason,
  existingRemarks,
  defaultStatus,
  isEditing,
  onClose,
  onSubmit
}) => {
  const [status, setStatus] = useState<AttendanceStatus>(defaultStatus ?? 'absent');
  const [reason, setReason] = useState(existingReason ?? '');
  const [customReason, setCustomReason] = useState(existingReason ?? '');
  const [remarks, setRemarks] = useState(existingRemarks ?? '');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const isOther = reason === 'Other';
  const finalReason = isOther ? (customReason.trim() || 'Other') : reason || null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSave = async () => {
    if (submitting) return;
    if (!isEditing && status === 'absent' && !finalReason) {
      setError('Please provide a reason for marking the student absent.');
      return;
    }
    if (isEditing && existingStatus && status !== existingStatus && !confirming) {
      setConfirming(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(status, finalReason, remarks.trim() || null);
    } catch (err) {
      console.error('Failed to save attendance:', err);
      const message = err instanceof Error ? err.message : 'Failed to save attendance. Please try again.';
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="attendance-modal-overlay" onClick={handleBackdropClick}>
      <div className="attendance-modal">
        <div className="attendance-modal-header">
          <div>
            <h3>{isEditing ? 'Edit Attendance Record' : 'Record Attendance'}</h3>
            <div className="attendance-muted" style={{ marginTop: '0.2rem' }}>
              {studentName}
              {studentEmail ? ` · ${studentEmail}` : ''}
              {' · '}
              {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <button className="attendance-modal-close" onClick={onClose} title="Close" type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="attendance-form-group">
          <label className="attendance-form-label">Attendance Status</label>
          <div className="attendance-status-picker">
            {ATTENDANCE_STATUS_ORDER.map(s => {
              const cfg = ATTENDANCE_STATUS_CONFIG[s];
              return (
                <button
                  key={s}
                  type="button"
                  className={`attendance-status-option ${status === s ? 'is-selected' : ''}`}
                  onClick={() => { setStatus(s); setConfirming(false); }}
                >
                  <span className="aso-emoji">{cfg.emoji}</span>
                  <span className="aso-label">{cfg.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {status === 'absent' && (
          <div className="attendance-form-group">
            <label className="attendance-form-label">Reason for Absence</label>
            <select
              className="attendance-form-control"
              value={reason}
              onChange={e => { setReason(e.target.value); setConfirming(false); }}
            >
              <option value="">Select a reason…</option>
              {ABSENCE_REASONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {isOther && (
              <input
                className="attendance-form-control"
                style={{ marginTop: '0.5rem' }}
                placeholder="Please specify the reason…"
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
              />
            )}
          </div>
        )}

        <div className="attendance-form-group">
          <label className="attendance-form-label">Remarks</label>
          <textarea
            className="attendance-form-control"
            rows={3}
            placeholder="Optional notes (visible to coordinators and administrators)…"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
          />
          <p className="attendance-form-hint">Remarks can be seen by coordinators and administrators.</p>
        </div>

        {confirming && (
          <div className="attendance-confirm-panel">
            <strong>Confirm change:</strong> You are changing this record from{' '}
            <strong>{existingStatus ? ATTENDANCE_STATUS_CONFIG[existingStatus].label : 'Not Recorded'}</strong>{' '}
            to <strong>{ATTENDANCE_STATUS_CONFIG[status].label}</strong>. The previous status will be kept in the audit
            history. Click <strong>Save Changes</strong> again to confirm.
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
            className={`attendance-btn ${status === 'absent' ? 'attendance-btn-danger' : 'attendance-btn-primary'}`}
            onClick={handleSave}
            disabled={submitting}
            type="button"
          >
            {submitting ? 'Saving…' : isEditing ? (confirming ? 'Save Changes' : 'Save Changes') : 'Save Record'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AttendanceRecordModal;
