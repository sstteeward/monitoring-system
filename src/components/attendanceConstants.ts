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
