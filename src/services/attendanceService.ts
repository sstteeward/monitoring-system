import { supabase } from '../lib/supabaseClient';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'on_leave' | 'incomplete';

type RpcErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

function extractErrorText(err: unknown): string {
  if (!err) return '';
  if (err instanceof Error) return err.message || '';
  if (typeof err === 'object') {
    const e = err as RpcErrorLike;
    return [e.message, e.details, e.hint].filter(Boolean).join(' ');
  }
  return String(err);
}

/** Maps PostgREST / Postgres errors to safe, actionable UI copy. */
export function mapAttendanceSaveError(err: unknown): string {
  const raw = extractErrorText(err);
  const combined = raw.toLowerCase();

  if (combined.includes('already exists') || combined.includes('duplicate') || combined.includes('unique')) {
    return 'Attendance record already exists for this student and date.';
  }
  if (combined.includes('not assigned') || combined.includes('student not found') || combined.includes('no longer assigned')) {
    return 'Unable to save because the student is no longer assigned to this company.';
  }
  if (combined.includes('not authorized') || combined.includes('row-level security') || combined.includes('permission denied') || combined.includes('42501')) {
    return 'You are not authorized to record attendance for this student.';
  }
  if (combined.includes('required attendance') || combined.includes('invalid attendance status') || combined.includes('null value') || combined.includes('22p02')) {
    return 'Required attendance information is missing.';
  }
  if (combined.includes('future date')) {
    return 'Cannot record attendance for a future date.';
  }
  if (
    combined.includes('column') ||
    combined.includes('violates') ||
    combined.includes('datatype') ||
    combined.includes('uuid') ||
    combined.includes('pgrst') ||
    combined.includes('function') ||
    combined.includes('sqlstate')
  ) {
    return 'Database error while saving attendance.';
  }
  if (raw && raw.length < 180 && !combined.includes('postgres')) {
    return raw;
  }
  return 'Failed to save attendance. Please try again.';
}

/**
 * Errors from the admin clock-record overrides.
 *
 * These must NOT go through mapAttendanceSaveError: its keyword matching would
 * rewrite a deliberate override message (e.g. "not authorized", "future") into
 * attendance-status copy. Like mapDtrError, this passes a short, deliberate
 * server message through unchanged and only masks something that smells of a
 * driver or schema fault.
 */
export function mapTimesheetOverrideError(err: unknown): string {
  const raw = extractErrorText(err);
  const text = raw.toLowerCase();

  if (!raw) return 'Something went wrong. Please try again.';
  if (text.includes('not authenticated')) return 'Your session has expired. Please sign in again.';
  if (
    text.includes('could not find the function')
    || text.includes('pgrst')
    || text.includes('does not exist')
  ) {
    return 'The clock-record override workflow has not been set up on this system yet. Ask an administrator to run supabase_admin_force_control.sql.';
  }
  if (
    text.includes('column') || text.includes('violates') || text.includes('sqlstate')
    || text.includes('permission denied') || text.includes('row-level security')
    || text.includes('42501') || text.includes('relation') || text.includes('datatype')
  ) {
    return 'Something went wrong. Please try again.';
  }
  return raw.length < 250 ? raw : 'Something went wrong. Please try again.';
}

/** One clock record for the admin's per-day Clock Records panel. */
export interface AdminTimesheetRow {
  id: string;
  clock_in: string;
  clock_out: string | null;
  break_start: string | null;
  break_end: string | null;
  status: 'working' | 'break' | 'completed';
  approval_status: 'pending' | 'approved' | 'rejected' | null;
  worked_minutes: number;
  daily_limit_status: 'NORMAL' | 'LIMIT_REACHED' | 'OVER_LIMIT';
  over_limit_minutes: number;
  entry_source: 'clock' | 'admin';
  corrected_at: string | null;
  corrected_by_name: string | null;
  correction_reason: string | null;
}

export interface CompanyAttendanceRow {
  student_auth_id: string;
  student_profile_id: string;
  first_name: string;
  last_name: string;
  email: string;
  program: string | null;
  department: string | null;
  schedule_start: string | null;
  schedule_end: string | null;
  time_in: string | null;
  time_out: string | null;
  attendance_id: string | null;
  status: AttendanceStatus | null;
  reason: string | null;
  remarks: string | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
  recorded_at: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export interface AllAttendanceRow extends CompanyAttendanceRow {
  company_id: string;
  company_name: string;
}

/**
 * One student in an adviser's assigned section, for a single date.
 *
 * Roster-based: a student with no attendance record for the date is still
 * returned, with `attendance_id` and `status` null.
 */
export interface AdviserAttendanceRow extends AllAttendanceRow {
  section_name: string | null;
  year_level: string | null;
  /** Hours clocked on the selected date, breaks excluded. */
  worked_hours: number;
  /** Lifetime rendered hours, for SIL progress. */
  total_rendered_hours: number;
  required_hours: number;
  /** Timesheet entries on the selected date. */
  timesheet_count: number;
  /** Entries clocked in but never clocked out. */
  open_timesheet_count: number;
}

/**
 * One student on one date, for the system-wide admin monitor.
 *
 * Roster-based like the adviser view, but scoped to every student in the system
 * rather than one adviser's sections, and it labels the section from the
 * student's own fields when no `sections` row matches — otherwise students in
 * unseeded sections would silently vanish from the admin's totals.
 */
export interface AdminAttendanceRow extends AdviserAttendanceRow {
  /** Null when the student's section has no row in `sections`. */
  section_id: string | null;
}

/** Lifetime attendance totals for one student. */
export interface AdminStudentSummary {
  present_count: number;
  late_count: number;
  absent_count: number;
  on_leave_count: number;
  incomplete_count: number;
  /** Days that carry a recorded status. */
  recorded_days: number;
  /** Distinct days with at least one clock entry. */
  logged_days: number;
  total_rendered_hours: number;
  required_hours: number;
  first_record_date: string | null;
  last_record_date: string | null;
}

/** One day in a student's attendance history. */
export interface AdminStudentHistoryRow {
  record_date: string;
  attendance_id: string | null;
  status: AttendanceStatus | null;
  reason: string | null;
  remarks: string | null;
  time_in: string | null;
  time_out: string | null;
  worked_hours: number;
  timesheet_count: number;
  open_timesheet_count: number;
  company_name: string | null;
  /** Total rows available, for server-side pagination. */
  total_count: number;
}

export interface AttendanceAuditEntry {
  id: string;
  action: 'created' | 'updated';
  old_status: string | null;
  new_status: string;
  reason: string | null;
  remarks: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
}

export interface AttendanceResult {
  id: string;
  student_id: string;
  company_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  reason: string | null;
  remarks: string | null;
  recorded_by: string | null;
  recorded_at: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export interface StudentAttendanceStats {
  absence_count: number;
}

export const attendanceService = {
  /**
   * Company supervisor / coordinator / admin records (or updates) a student's
   * attendance for a specific date. The company is derived server-side from the
   * authenticated session — the client never sends a company_id.
   */
  async recordAttendance(
    studentAuthId: string,
    date: string,
    status: AttendanceStatus,
    reason?: string | null,
    remarks?: string | null
  ): Promise<AttendanceResult> {
    if (!studentAuthId) {
      throw new Error('Required attendance information is missing.');
    }
    if (!date) {
      throw new Error('Required attendance information is missing.');
    }

    const { data, error } = await supabase.rpc('record_attendance', {
      p_student_id: studentAuthId,
      p_attendance_date: date,
      p_status: status,
      p_reason: reason ?? null,
      p_remarks: remarks ?? null
    });

    if (error) {
      console.error('record_attendance failed:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        studentAuthId,
        date,
        status
      });
      // Keep PostgREST's diagnostic text on the thrown error. The modal maps
      // it to safe UI copy, while this preserves the real response for logs
      // and makes future database failures diagnosable.
      const rpcError = new Error(extractErrorText(error) || 'Failed to save attendance.');
      (rpcError as Error & { code?: string }).code = error.code;
      throw rpcError;
    }
    return data as AttendanceResult;
  },

  /** Attendance list for the supervisor's own company on a given date. */
  async getCompanyAttendance(date: string): Promise<CompanyAttendanceRow[]> {
    const { data, error } = await supabase.rpc('get_company_attendance', {
      p_attendance_date: date
    });

    if (error) {
      console.error('Error fetching company attendance:', error);
      throw error;
    }
    return (data || []) as CompanyAttendanceRow[];
  },

  /** Cross-company attendance monitoring for coordinators and admins. */
  async getAllAttendance(date: string): Promise<AllAttendanceRow[]> {
    const { data, error } = await supabase.rpc('get_all_attendance', {
      p_attendance_date: date
    });

    if (error) {
      console.error('Error fetching all attendance:', error);
      throw error;
    }
    return (data || []) as AllAttendanceRow[];
  },

  /**
   * Attendance for every student in the calling adviser's assigned sections on
   * one date.
   *
   * `getAllAttendance` is restricted to coordinators and admins, so calling it
   * as an adviser fails with "Not authorized" — that was the cause of the
   * Adviser → Attendance page's error banner. This RPC derives its scope from
   * the adviser's own `adviser_sections` rows, so passing a section the adviser
   * does not hold is rejected server-side rather than filtered in the browser.
   */
  async getAdviserAttendance(date: string, sectionId?: string | null): Promise<AdviserAttendanceRow[]> {
    const { data, error } = await supabase.rpc('get_adviser_attendance', {
      p_attendance_date: date,
      p_section_id: sectionId ?? null
    });

    if (error) {
      console.error('Error fetching adviser attendance:', error);
      throw new Error(error.message || 'Failed to load attendance.');
    }

    // Postgres numerics arrive as strings over PostgREST.
    return (data || []).map((row: Record<string, unknown>) => ({
      ...row,
      worked_hours: Number(row.worked_hours ?? 0),
      total_rendered_hours: Number(row.total_rendered_hours ?? 0),
      required_hours: Number(row.required_hours ?? 0),
      timesheet_count: Number(row.timesheet_count ?? 0),
      open_timesheet_count: Number(row.open_timesheet_count ?? 0),
    })) as AdviserAttendanceRow[];
  },

  /**
   * System-wide attendance for one date, for the admin monitor.
   *
   * Reads the same two sources every other portal writes to —
   * `company_attendance` for the recorded status and `timesheets` for the clock
   * entries. It is not a second attendance store.
   *
   * `getAllAttendance` cannot serve this page: its FROM is company_attendance,
   * so students with no record for the date never appear, and showing exactly
   * those gaps is the point of an admin monitor.
   *
   * Authorization is enforced inside the RPC (admin only), so a non-admin who
   * calls it directly gets an exception rather than data.
   */
  async getAdminAttendance(date: string): Promise<AdminAttendanceRow[]> {
    const { data, error } = await supabase.rpc('get_admin_attendance', {
      p_attendance_date: date
    });

    if (error) {
      console.error('Error fetching admin attendance:', error);
      throw new Error(error.message || 'Failed to load attendance.');
    }

    // Postgres numerics arrive as strings over PostgREST.
    return (data || []).map((row: Record<string, unknown>) => ({
      ...row,
      worked_hours: Number(row.worked_hours ?? 0),
      total_rendered_hours: Number(row.total_rendered_hours ?? 0),
      required_hours: Number(row.required_hours ?? 0),
      timesheet_count: Number(row.timesheet_count ?? 0),
      open_timesheet_count: Number(row.open_timesheet_count ?? 0),
    })) as AdminAttendanceRow[];
  },

  /** Lifetime attendance totals for one student (admin only). */
  async getAdminStudentSummary(studentAuthId: string): Promise<AdminStudentSummary> {
    const { data, error } = await supabase.rpc('get_admin_student_attendance_summary', {
      p_student_id: studentAuthId
    });

    if (error) {
      console.error('Error fetching student attendance summary:', error);
      throw new Error(error.message || 'Failed to load the attendance summary.');
    }

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    return {
      present_count: Number(row?.present_count ?? 0),
      late_count: Number(row?.late_count ?? 0),
      absent_count: Number(row?.absent_count ?? 0),
      on_leave_count: Number(row?.on_leave_count ?? 0),
      incomplete_count: Number(row?.incomplete_count ?? 0),
      recorded_days: Number(row?.recorded_days ?? 0),
      logged_days: Number(row?.logged_days ?? 0),
      total_rendered_hours: Number(row?.total_rendered_hours ?? 0),
      required_hours: Number(row?.required_hours ?? 0),
      first_record_date: (row?.first_record_date as string) ?? null,
      last_record_date: (row?.last_record_date as string) ?? null,
    };
  },

  /**
   * One page of a student's attendance history, newest first. Paged in the
   * database rather than the browser, so a student with years of records does
   * not ship thousands of rows to the client.
   */
  async getAdminStudentHistory(
    studentAuthId: string,
    limit = 10,
    offset = 0
  ): Promise<AdminStudentHistoryRow[]> {
    const { data, error } = await supabase.rpc('get_admin_student_attendance_history', {
      p_student_id: studentAuthId,
      p_limit: limit,
      p_offset: offset
    });

    if (error) {
      console.error('Error fetching student attendance history:', error);
      throw new Error(error.message || 'Failed to load the attendance history.');
    }

    return (data || []).map((row: Record<string, unknown>) => ({
      ...row,
      worked_hours: Number(row.worked_hours ?? 0),
      timesheet_count: Number(row.timesheet_count ?? 0),
      open_timesheet_count: Number(row.open_timesheet_count ?? 0),
      total_count: Number(row.total_count ?? 0),
    })) as AdminStudentHistoryRow[];
  },

  /** Change history for a single attendance record. */
  async getAttendanceAudit(attendanceId: string): Promise<AttendanceAuditEntry[]> {
    const { data, error } = await supabase.rpc('get_attendance_audit', {
      p_attendance_id: attendanceId
    });

    if (error) {
      console.error('Error fetching attendance audit:', error);
      throw error;
    }
    return (data || []) as AttendanceAuditEntry[];
  },

  // ── Admin clock-record overrides (force control) ───────────────────────────
  // Every method is gated in the database by public.is_admin(); the server row
  // is the audit record, so there is no client-side createAuditLog here. Errors
  // are surfaced through mapTimesheetOverrideError, never mapAttendanceSaveError.

  /** Every clock record for a student on one attendance day (admin only). */
  async getAdminStudentTimesheets(studentAuthId: string, date: string): Promise<AdminTimesheetRow[]> {
    const { data, error } = await supabase.rpc('get_admin_student_timesheets', {
      p_student_id: studentAuthId,
      p_date: date,
    });
    if (error) {
      console.error('get_admin_student_timesheets failed:', error);
      throw new Error(mapTimesheetOverrideError(error));
    }
    return (data || []).map((row: Record<string, unknown>) => ({
      ...row,
      worked_minutes: Number(row.worked_minutes ?? 0),
      over_limit_minutes: Number(row.over_limit_minutes ?? 0),
    })) as AdminTimesheetRow[];
  },

  /** Correct the four times on an existing clock record. */
  async adminCorrectTimesheet(
    timesheetId: string,
    clockIn: string,
    clockOut: string,
    breakStart: string | null,
    breakEnd: string | null,
    reason: string,
  ): Promise<void> {
    const { error } = await supabase.rpc('admin_correct_timesheet', {
      p_timesheet_id: timesheetId,
      p_clock_in: clockIn,
      p_clock_out: clockOut,
      p_break_start: breakStart,
      p_break_end: breakEnd,
      p_reason: reason,
    });
    if (error) {
      console.error('admin_correct_timesheet failed:', error);
      throw new Error(mapTimesheetOverrideError(error));
    }
  },

  /** Record a clock-out on an open session. */
  async adminForceClockOut(timesheetId: string, clockOut: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('admin_force_clock_out', {
      p_timesheet_id: timesheetId,
      p_clock_out: clockOut,
      p_reason: reason,
    });
    if (error) {
      console.error('admin_force_clock_out failed:', error);
      throw new Error(mapTimesheetOverrideError(error));
    }
  },

  /** Add a whole clock record for a deployed student. */
  async adminAddTimesheet(
    studentAuthId: string,
    clockIn: string,
    clockOut: string,
    breakStart: string | null,
    breakEnd: string | null,
    reason: string,
  ): Promise<void> {
    const { error } = await supabase.rpc('admin_add_timesheet', {
      p_student_id: studentAuthId,
      p_clock_in: clockIn,
      p_clock_out: clockOut,
      p_break_start: breakStart,
      p_break_end: breakEnd,
      p_reason: reason,
    });
    if (error) {
      console.error('admin_add_timesheet failed:', error);
      throw new Error(mapTimesheetOverrideError(error));
    }
  },

  /** Void (reject) or restore (approve) a clock record. */
  async adminSetTimesheetVoided(timesheetId: string, doVoid: boolean, reason: string): Promise<void> {
    const { error } = await supabase.rpc('admin_set_timesheet_voided', {
      p_timesheet_id: timesheetId,
      p_void: doVoid,
      p_reason: reason,
    });
    if (error) {
      console.error('admin_set_timesheet_voided failed:', error);
      throw new Error(mapTimesheetOverrideError(error));
    }
  },

  /**
   * Live attendance statistics for one student. Authorization and the company
   * scope are enforced by the RPC, so callers cannot count another company's
   * records by changing a client-side filter.
   */
  async getStudentAttendanceStats(studentAuthId: string): Promise<StudentAttendanceStats> {
    const { data, error } = await supabase.rpc('get_student_attendance_stats', {
      p_student_id: studentAuthId
    });

    if (error) {
      console.error('Error fetching student attendance statistics:', error);
      throw error;
    }
    return (Array.isArray(data) ? data[0] : data) as StudentAttendanceStats;
  }
};
