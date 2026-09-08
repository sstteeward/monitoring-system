// Presentation rules for the adviser's Automated Daily Report.
//
// The report itself is built in the database (supabase_adviser_daily_report.sql);
// nothing here recomputes a figure. This module only decides how a figure is
// labelled, coloured and filtered, and it is kept free of React and Supabase
// imports so the Node test runner can exercise it directly.

import type {
  AttendanceState,
  IssueCode,
  ProgressStatus,
  ReportStudent,
} from '../services/adviserReportService';

/** `485` -> `8h 5m`. Mirrors formatMinutes in attendanceLimit.ts. */
export const formatMinutes = (minutes: number): string => {
  const safe = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
};

/** `485` -> `8.1`, for a column that has to line up. */
export const minutesToHours = (minutes: number): number =>
  Math.round(((minutes || 0) / 60) * 10) / 10;

/** A signed difference, so "on track" and "behind" read differently at a glance. */
export const formatDelta = (minutes: number): string => {
  const rounded = Math.round(minutes || 0);
  if (rounded === 0) return '0h';
  return `${rounded > 0 ? '+' : '−'}${formatMinutes(Math.abs(rounded))}`;
};

/** `2026-09-08` -> `September 8, 2026`. Parsed as a local date, never as UTC. */
export const formatReportDate = (date: string | null | undefined): string => {
  if (!date) return '—';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

/** A timestamp as a wall-clock time, for "Generated: 5:02 PM". */
export const formatClock = (timestamp: string | null | undefined): string => {
  if (!timestamp) return '—';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export const STATUS_LABELS: Record<Exclude<AttendanceState, null> | 'not_recorded', string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  on_leave: 'On Leave',
  incomplete: 'Incomplete',
  not_recorded: 'Not Recorded',
};

/** The badge class names already defined for the attendance tables. */
export const STATUS_CLASS: Record<Exclude<AttendanceState, null> | 'not_recorded', string> = {
  present: 'is-present',
  late: 'is-late',
  absent: 'is-absent',
  on_leave: 'is-on-leave',
  incomplete: 'is-incomplete',
  not_recorded: 'is-not-recorded',
};

export const PROGRESS_LABELS: Record<ProgressStatus, string> = {
  completed: 'Completed',
  on_track: 'On Track',
  monitoring: 'Needs Monitoring',
  behind: 'Behind',
  not_started: 'Not Started',
};

export const PROGRESS_COLORS: Record<ProgressStatus, string> = {
  completed: '#0d9488',
  on_track: '#10b981',
  monitoring: '#f59e0b',
  behind: '#ef4444',
  not_started: '#94a3b8',
};

/** How urgent an issue looks. Ranks 1-3 are the ones that need action today. */
export const issueTone = (rank: number): 'danger' | 'warning' | 'info' =>
  rank <= 2 ? 'danger' : rank <= 5 ? 'warning' : 'info';

/**
 * The attendance filters, which run across ALL of the adviser's sections —
 * the report is never scoped to one section.
 */
export type AttendanceFilter =
  | 'all'
  | 'present'
  | 'absent'
  | 'incomplete'
  | 'missing_clock_out'
  | 'missing_clock_in'
  | 'over_limit'
  | 'not_recorded';

export const ATTENDANCE_FILTER_LABELS: Record<AttendanceFilter, string> = {
  all: 'All',
  present: 'Present',
  absent: 'Absent',
  incomplete: 'Incomplete',
  missing_clock_out: 'Missing Clock-out',
  missing_clock_in: 'Missing Clock-in',
  over_limit: 'Exceeded Daily Limit',
  not_recorded: 'Not Recorded',
};

/** True when a student's row belongs in the chosen attendance filter. */
export const matchesAttendanceFilter = (
  filter: AttendanceFilter,
  student: Pick<ReportStudent, 'status' | 'issues'>,
): boolean => {
  const has = (code: IssueCode) => student.issues.some(i => i.code === code);
  switch (filter) {
    case 'present':           return student.status === 'present' || student.status === 'late';
    case 'absent':            return student.status === 'absent';
    case 'incomplete':        return student.status === 'incomplete';
    case 'missing_clock_out': return has('missing_clock_out');
    case 'missing_clock_in':  return has('missing_clock_in');
    case 'over_limit':        return has('over_limit');
    case 'not_recorded':      return student.status === null;
    default:                  return true;
  }
};

/** An alert's code maps onto the tab and filter that shows the students behind it. */
export const ALERT_TARGET: Record<string, { tab: string; filter?: AttendanceFilter }> = {
  missing_clock_out: { tab: 'attendance', filter: 'missing_clock_out' },
  missing_clock_in:  { tab: 'attendance', filter: 'missing_clock_in' },
  over_limit:        { tab: 'attendance', filter: 'over_limit' },
  suspicious:        { tab: 'attendance', filter: 'all' },
  absent:            { tab: 'attendance', filter: 'absent' },
  behind_ojt:        { tab: 'ojt' },
  journals_pending:  { tab: 'journals' },
  journals_revision: { tab: 'journals' },
  no_company:        { tab: 'companies' },
};

/** Matches a search term against the student fields shown in the report. */
export const matchesSearch = (
  student: Pick<ReportStudent, 'name' | 'email' | 'section' | 'company'>,
  search: string,
): boolean => {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return (student.name || '').toLowerCase().includes(term)
    || (student.email || '').toLowerCase().includes(term)
    || (student.section || '').toLowerCase().includes(term)
    || (student.company || '').toLowerCase().includes(term);
};
