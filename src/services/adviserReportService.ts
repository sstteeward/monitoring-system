// Automated Daily Report — Adviser only.
//
// Every call here is scoped by the database to auth.uid(): none of the four
// RPCs accepts an adviser id, a section id or a student id, so there is no
// parameter a caller could change to reach another adviser's students. The
// analysis itself runs in `build_adviser_daily_report`, which is deliberately
// NOT executable by the `authenticated` role.
//
// See supabase_adviser_daily_report.sql.

import { supabase } from '../lib/supabaseClient';

/** The issue codes the report can raise, in the order an adviser should act. */
export type IssueCode =
  | 'missing_clock_out'
  | 'missing_clock_in'
  | 'over_limit'
  | 'suspicious'
  | 'absent'
  | 'behind_ojt'
  | 'journal'
  | 'incomplete';

export interface ReportIssue {
  code: IssueCode;
  label: string;
  rank: number;
}

export type AttendanceState = 'present' | 'absent' | 'late' | 'on_leave' | 'incomplete' | null;

export type ProgressStatus =
  | 'completed'
  | 'on_track'
  | 'monitoring'
  | 'behind'
  | 'not_started';

export interface ReportStudent {
  student_id: string;
  profile_id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  section_id: string;
  section: string;
  course_code: string;
  company_id: string | null;
  company: string | null;
  clock_in: string | null;
  clock_out: string | null;
  entries: number;
  open_entries: number;
  /** Minutes rendered on the report date. */
  day_minutes: number;
  status: AttendanceState;
  /** What the supervisor recorded, before any inference. */
  recorded_status: AttendanceState;
  reason: string | null;
  remarks: string | null;
  required_hours: number;
  rendered_minutes: number;
  expected_minutes: number;
  remaining_minutes: number;
  completion_pct: number;
  /** rendered - expected, in minutes. Negative means behind. */
  progress_delta: number;
  progress_status: ProgressStatus;
  started_on: string | null;
  logged_days: number;
  journal_today: number;
  journal_pending: number;
  journal_approved: number;
  journal_rejected: number;
  journal_revision: number;
  last_journal_date: string | null;
  issues: ReportIssue[];
  /** The rank of this student's most urgent issue, or null when there is none. */
  priority: number | null;
}

export interface ReportAttentionRow {
  student_id: string;
  name: string | null;
  section: string;
  section_id: string;
  company: string | null;
  issue: string | null;
  issue_code: IssueCode | null;
  issues: ReportIssue[];
  priority: number;
}

export interface ReportSectionRow {
  section_id: string;
  section: string;
  course_code: string;
  students: number;
  present: number;
  late: number;
  absent: number;
  incomplete: number;
  not_recorded: number;
  avg_minutes: number;
  issues: number;
  journals_pending: number;
}

export interface ReportCompanyRow {
  company_id: string | null;
  company: string;
  students: number;
  present: number;
  absent: number;
  incomplete: number;
  avg_minutes: number;
  issues: number;
}

export interface ReportBehindRow {
  student_id: string;
  name: string | null;
  section: string;
  company: string | null;
  required_hours: number;
  rendered_minutes: number;
  expected_minutes: number;
  delta_minutes: number;
  completion_pct: number;
  status: ProgressStatus;
}

export interface ReportJournalRow {
  student_id: string;
  name: string | null;
  section: string;
  pending: number;
  approved: number;
  rejected: number;
  revision: number;
  submitted_today: number;
  entry_today: boolean;
  last_entry_date: string | null;
}

export interface ReportAlert {
  rank: number;
  code: string;
  severity: 'danger' | 'warning' | 'info';
  count: number;
  message: string;
}

export interface DailyReportPayload {
  version: number;
  report_date: string;
  generated_at: string;
  time_zone: string;
  adviser: {
    id: string;
    name: string | null;
    email: string | null;
    adviser_type: string | null;
    course: string | null;
  };
  settings: {
    daily_limit_minutes: number;
    working_dows: number[];
    expected_through: string;
    default_required_hours: number;
  };
  summary: {
    sections: number;
    students: number;
    present: number;
    late: number;
    absent: number;
    incomplete: number;
    on_leave: number;
    not_recorded: number;
    attendance_rate: number;
    total_minutes: number;
    attention: number;
    journals_pending: number;
    journals_submitted_today: number;
    students_without_company: number;
  };
  sections: ReportSectionRow[];
  students: ReportStudent[];
  attention: ReportAttentionRow[];
  ojt: {
    on_track: number;
    completed: number;
    monitoring: number;
    behind: number;
    not_started: number;
    students_behind: ReportBehindRow[];
  };
  journals: {
    submitted_today: number;
    entries_for_date: number;
    pending: number;
    approved: number;
    rejected: number;
    revision: number;
    students: ReportJournalRow[];
  };
  companies: ReportCompanyRow[];
  alerts: ReportAlert[];
}

/** A stored report: the headline counts plus the full payload. */
export interface DailyReport {
  id: string;
  report_date: string;
  generated_at: string;
  generated_by: 'manual' | 'scheduled';
  emailed_at: string | null;
  sections_count: number;
  students_count: number;
  present_count: number;
  absent_count: number;
  incomplete_count: number;
  attention_count: number;
  pending_journals_count: number;
  total_minutes: number;
  report: DailyReportPayload;
}

/** One row of the history list. Carries no payload. */
export interface DailyReportSummary {
  id: string;
  report_date: string;
  generated_at: string;
  generated_by: 'manual' | 'scheduled';
  emailed_at: string | null;
  sections_count: number;
  students_count: number;
  present_count: number;
  absent_count: number;
  incomplete_count: number;
  attention_count: number;
  pending_journals_count: number;
  total_minutes: number;
  total_count: number;
}

/**
 * Turns a Postgres failure into something an adviser can act on.
 *
 * Section 24 of the specification: never show raw SQL. A message the database
 * raised deliberately (the authorization and future-date guards) is worth
 * showing verbatim; anything that smells like a driver or schema error is not.
 */
export function mapReportError(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null
      ? String((error as { message?: string }).message ?? '')
      : String(error ?? '');
  const text = raw.toLowerCase();

  if (!raw) return 'Unable to generate today\'s report. Please try again.';
  if (text.includes('only advisers')) {
    return 'This report is available to Section Advisers only.';
  }
  if (text.includes('not authenticated')) {
    return 'Your session has expired. Please sign in again.';
  }
  if (text.includes('future date')) {
    return 'A report cannot be generated for a future date.';
  }
  if (text.includes('no report for')) {
    return 'That report has not been generated yet.';
  }
  if (text.includes('no profile found')) {
    return 'Your adviser profile could not be loaded. Please contact the Coordinator.';
  }
  if (
    text.includes('could not find the function')
    || text.includes('pgrst')
    || text.includes('does not exist')
  ) {
    return 'The daily report has not been set up on this system yet. Ask an administrator to run supabase_adviser_daily_report.sql.';
  }
  if (
    text.includes('column') || text.includes('violates') || text.includes('sqlstate')
    || text.includes('permission denied') || text.includes('row-level security')
    || text.includes('42501') || text.includes('relation')
  ) {
    return 'Unable to generate today\'s report. Please try again.';
  }
  // A short, deliberate message from the database reads fine as-is.
  return raw.length < 180 ? raw : 'Unable to generate today\'s report. Please try again.';
}

/**
 * `Date` -> `YYYY-MM-DD` in the attendance timezone rather than the browser's.
 *
 * A device set to another zone must not ask for the wrong day; the same rule
 * the attendance pages already follow (src/utils/attendanceLimit.ts).
 */
export const reportDayKey = (value: Date = new Date(), timeZone = 'Asia/Manila'): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(value);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(value);
  }
};

export const adviserReportService = {
  /**
   * Builds today's (or a past day's) consolidated report and stores it.
   *
   * The adviser passes no sections: the database resolves them from
   * `adviser_sections` for auth.uid(). Calling it again for the same date
   * regenerates in place — that is the "Regenerate" action.
   */
  async generate(date?: string): Promise<DailyReport> {
    const { data, error } = await supabase.rpc('generate_my_daily_report', {
      p_date: date ?? null,
    });

    if (error) {
      console.error('generate_my_daily_report failed:', error);
      throw new Error(mapReportError(error));
    }
    return data as DailyReport;
  },

  /** The stored report for a date, or null when it has not been generated. */
  async get(date?: string): Promise<DailyReport | null> {
    const { data, error } = await supabase.rpc('get_my_daily_report', {
      p_date: date ?? null,
    });

    if (error) {
      console.error('get_my_daily_report failed:', error);
      throw new Error(mapReportError(error));
    }
    return (data as DailyReport | null) ?? null;
  },

  /** Previous reports, newest first. Headline counts only — no payloads. */
  async history(limit = 30, offset = 0): Promise<{ rows: DailyReportSummary[]; total: number }> {
    const { data, error } = await supabase.rpc('get_my_daily_report_history', {
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error('get_my_daily_report_history failed:', error);
      throw new Error(mapReportError(error));
    }

    const rows = (data || []) as DailyReportSummary[];
    return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
  },

  /**
   * Emails the report to the adviser's registered address.
   *
   * This writes one notification row; the existing `notification_email` webhook
   * and Edge Function do the delivery, so there is no second mailer and no
   * duplicate of the notification the 5 PM run already sends.
   */
  async email(date?: string, force = false): Promise<{ sent: boolean; reason?: string }> {
    const { data, error } = await supabase.rpc('send_my_daily_report_email', {
      p_date: date ?? null,
      p_force: force,
    });

    if (error) {
      console.error('send_my_daily_report_email failed:', error);
      throw new Error(mapReportError(error));
    }
    return (data || { sent: false }) as { sent: boolean; reason?: string };
  },
};
