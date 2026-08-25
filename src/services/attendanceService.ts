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
