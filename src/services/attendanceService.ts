import { supabase } from '../lib/supabaseClient';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'on_leave' | 'incomplete';

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
    const { data, error } = await supabase.rpc('record_attendance', {
      p_student_id: studentAuthId,
      p_attendance_date: date,
      p_status: status,
      p_reason: reason ?? null,
      p_remarks: remarks ?? null
    });

    if (error) throw error;
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
  }
};
