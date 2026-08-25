import React, { useEffect, useState } from 'react';
import type { CompanyAttendanceRow, AttendanceAuditEntry, AttendanceStatus } from '../services/attendanceService';
import { attendanceService } from '../services/attendanceService';
import { ATTENDANCE_STATUS_CONFIG, formatDate, formatTime } from './attendanceConstants';

interface AttendanceDetailModalProps {
  open: boolean;
  row: CompanyAttendanceRow | null;
  date: string;
  companyName?: string | null;
  canRecord: boolean;
  onClose: () => void;
  onRecord: () => void;
}

const AttendanceDetailModal: React.FC<AttendanceDetailModalProps> = ({
  open,
  row,
  date,
  companyName,
  canRecord,
  onClose,
  onRecord
}) => {
  const [audit, setAudit] = useState<AttendanceAuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);

  useEffect(() => {
    if (!open || !row?.attendance_id) return;
    attendanceService
      .getAttendanceAudit(row.attendance_id)
      .then(setAudit)
      .catch(err => console.error('Failed to load audit:', err))
      .finally(() => setLoadingAudit(false));
  }, [open, row?.attendance_id]);

  if (!open || !row) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const statusKey = (row.status ?? 'not_recorded') as AttendanceStatus | 'not_recorded';
  const cfg = ATTENDANCE_STATUS_CONFIG[statusKey];

  const field = (label: string, value: React.ReactNode) => (
    <div className="attendance-detail-field">
      <span>{label}</span>
      <span>{value ?? '—'}</span>
    </div>
  );

  return (
    <div className="attendance-modal-overlay" onClick={handleBackdropClick}>
      <div className="attendance-modal attendance-modal-wide attendance-details-modal">
        <div className="attendance-modal-header">
          <div>
            <h3>Attendance Details</h3>
            <div className="attendance-muted" style={{ marginTop: '0.2rem' }}>
              {formatDate(date)}
            </div>
          </div>
          <button className="attendance-modal-close" onClick={onClose} title="Close" type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="attendance-detail-student">
          <div
            className="attendance-avatar"
            style={{ background: `linear-gradient(135deg, #3b82f6, #6366f1)` }}
          >
            {(row.first_name?.[0] ?? '?').toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-bright)', fontSize: '1rem' }}>
              {row.first_name} {row.last_name}
            </div>
            <div className="attendance-muted">{row.email || '—'}</div>
            <div style={{ marginTop: '0.35rem' }}>
              <span className={`attendance-badge ${cfg.className}`}>
                <span>{cfg.emoji}</span> {cfg.label}
              </span>
            </div>
          </div>
        </div>

        <div className="attendance-detail-grid">
          {companyName && field('Company', companyName)}
          {field('Program', row.program)}
          {field('Department', row.department)}
          {field('Schedule', row.schedule_start || row.schedule_end
            ? `${formatTime(row.schedule_start)} – ${formatTime(row.schedule_end)}`
            : '—')}
          {field('Time In (DTR)', formatTime(row.time_in))}
          {field('Time Out (DTR)', formatTime(row.time_out))}
        </div>

        <div className="attendance-detail-section-title">
          <span style={{ width: 20, height: 2, background: 'var(--primary)', opacity: 0.3 }} />
          Attendance Record
        </div>

        {row.attendance_id ? (
          <div className="attendance-detail-grid">
            {field('Status', `${cfg.emoji} ${cfg.label}`)}
            {field('Reason', row.reason)}
            {field('Remarks', row.remarks)}
            {field('Recorded By', row.recorded_by_name || '—')}
            {field('Recorded At', row.recorded_at ? new Date(row.recorded_at).toLocaleString() : '—')}
            {field('Last Updated', row.updated_at ? new Date(row.updated_at).toLocaleString() : '—')}
          </div>
        ) : (
          <p className="attendance-muted" style={{ margin: '0.5rem 0 0', fontSize: '0.86rem' }}>
            No attendance record has been recorded for this student on this date.
          </p>
        )}

        {row.attendance_id && (
          <>
            <div className="attendance-detail-section-title">
              <span style={{ width: 20, height: 2, background: 'var(--primary)', opacity: 0.3 }} />
              Audit History
            </div>
            {loadingAudit ? (
              <p className="attendance-muted">Loading…</p>
            ) : audit.length === 0 ? (
              <p className="attendance-muted">No history available.</p>
            ) : (
              <div className="attendance-audit-list">
                {audit.map(a => (
                  <div key={a.id} className="attendance-audit-item">
                    <span className={`attendance-audit-dot ${a.action === 'created' ? 'is-created' : 'is-updated'}`} />
                    <div>
                      <div className="aa-title">
                        {a.action === 'created' ? 'Record created' : 'Status updated'}
                        {a.old_status && (
                          <span className="attendance-muted" style={{ fontWeight: 500 }}>
                            {' '}from <strong>{ATTENDANCE_STATUS_CONFIG[a.old_status as AttendanceStatus]?.label ?? a.old_status}</strong> to <strong>{ATTENDANCE_STATUS_CONFIG[a.new_status as AttendanceStatus]?.label ?? a.new_status}</strong>
                          </span>
                        )}
                      </div>
                      {(a.reason || a.remarks) && (
                        <div className="attendance-muted" style={{ marginTop: '0.15rem' }}>
                          {a.reason}{a.reason && a.remarks ? ' · ' : ''}{a.remarks}
                        </div>
                      )}
                      <div className="aa-meta">
                        {a.changed_by_name || 'Unknown'} · {a.changed_at ? new Date(a.changed_at).toLocaleString() : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="attendance-modal-actions">
          <button className="attendance-btn" onClick={onClose} type="button">Close</button>
          {canRecord && (
            <button
              className={`attendance-btn ${row.status === 'absent' ? 'attendance-btn-danger' : 'attendance-btn-primary'}`}
              onClick={onRecord}
              type="button"
            >
              {row.attendance_id ? 'Edit Record' : 'Record Attendance'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceDetailModal;
