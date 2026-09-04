import type { AttendanceStatus } from '../services/attendanceService';

export interface StatusConfig {
  emoji: string;
  label: string;
  className: string;
}

export const ATTENDANCE_STATUS_CONFIG: Record<AttendanceStatus | 'not_recorded', StatusConfig> = {
  present: { emoji: '🟢', label: 'Present', className: 'is-present' },
  absent: { emoji: '🔴', label: 'Absent', className: 'is-absent' },
  late: { emoji: '🟡', label: 'Late', className: 'is-late' },
  on_leave: { emoji: '🔵', label: 'On Leave', className: 'is-on-leave' },
  incomplete: { emoji: '🟠', label: 'Incomplete', className: 'is-incomplete' },
  not_recorded: { emoji: '⚪', label: 'Not Recorded', className: 'is-not-recorded' }
};

export const ATTENDANCE_STATUS_ORDER: AttendanceStatus[] = [
  'present',
  'absent',
  'late',
  'on_leave',
  'incomplete'
];

export const ABSENCE_REASONS = [
  'Student was not present at the company premises',
  'Student informed supervisor of absence',
  'Student did not report for scheduled duty',
  'Student was unavailable',
  'Other'
];

export const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatTime = (timeStr: string | null | undefined) => {
  if (!timeStr) return '—';
  const d = new Date(timeStr.length <= 10 ? `${timeStr}T00:00:00` : timeStr);
  if (isNaN(d.getTime())) return timeStr;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/** `2026-09-04` for a Date, in local time rather than UTC. */
export const toDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Moves a `YYYY-MM-DD` string by whole days. */
export const shiftDate = (dateStr: string, days: number) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateString(d);
};

export const formatHours = (hours: number) => `${(Math.round(hours * 100) / 100).toFixed(2)}h`;

/** `8.98` → `8h 59m`, for reading rather than for export. */
export const formatDuration = (hours: number) => {
  if (!hours || hours <= 0) return '0h';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

/** A day of clock records, whichever portal loaded it. */
export interface DerivableAttendanceRow {
  time_in: string | null;
  time_out: string | null;
  status: AttendanceStatus | null;
  worked_hours: number;
  timesheet_count: number;
  open_timesheet_count: number;
}

export interface AttendanceDerivation {
  effective_status: AttendanceStatus | null;
  anomalies: string[];
}

export type Derived<T> = T & AttendanceDerivation;

/** Beyond this many hours in one day, a log is worth a second look. */
const EXCESSIVE_DAILY_HOURS = 16;

/**
 * Resolves the status shown for a student, and flags clock records that need a
 * second look.
 *
 * A recorded status always wins — it is the supervisor's explicit judgement.
 * Only when nothing has been recorded is a status inferred from the day's
 * timesheets, so an unrecorded student reads as "Not Recorded" rather than
 * being silently reported as absent.
 *
 * Every flag below is a stated rule about the clock data, never a guess about
 * the student: a legitimate record cannot be flagged unless it actually trips
 * one of these conditions. Shared by the adviser and admin monitors so both
 * portals flag the same rows for the same reasons.
 */
export function deriveAttendance<T extends DerivableAttendanceRow>(row: T): Derived<T> {
  const anomalies: string[] = [];

  if (row.time_in && !row.time_out) anomalies.push('Clocked in without clocking out');
  if (row.open_timesheet_count > 0) {
    anomalies.push(`${row.open_timesheet_count} open timesheet entr${row.open_timesheet_count === 1 ? 'y' : 'ies'}`);
  }
  if (row.time_in && row.time_out && new Date(row.time_out) < new Date(row.time_in)) {
    anomalies.push('Clock-out is before clock-in');
  }
  if (row.timesheet_count > 1) anomalies.push(`${row.timesheet_count} separate entries on this date`);
  if (row.worked_hours > EXCESSIVE_DAILY_HOURS) {
    anomalies.push(`Excessive rendered time (${formatDuration(row.worked_hours)} in one day)`);
  }
  if (row.time_in && row.time_out && row.worked_hours > 0 && row.worked_hours < 1) {
    anomalies.push('Unusually short rendered time');
  }

  let effective_status: AttendanceStatus | null = row.status;
  if (!effective_status) {
    if (row.open_timesheet_count > 0) effective_status = 'incomplete';
    else if (row.time_in && row.time_out) effective_status = 'present';
  }

  return { ...row, effective_status, anomalies };
}
