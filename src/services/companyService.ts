import { supabase } from '../lib/supabaseClient';
import type { Profile } from './profileService';
import { createAuditLog } from './auditService';

export interface Schedule {
  id: string;
  company_id: string;
  student_id: string | null;
  name: string;
  shift_type: 'morning' | 'afternoon' | 'night' | 'flexible';
  working_days: string[];
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
  break_duration_minutes: number;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  supervisor_name: string | null;
  notes: string | null;
  recurrence: 'none' | 'daily' | 'weekly' | 'custom_weekdays';
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  calendar_sync_status: 'not_connected' | 'pending' | 'synced' | 'failed';
  google_event_id: string | null;
  assigned_students: ScheduleStudent[];
  created_at: string;
  updated_at: string;
}

export interface ScheduleStudent {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  course: string | null;
  department: string | null;
}

export interface ScheduleInput {
  id?: string;
  name: string;
  start_date: string;
  end_date?: string | null;
  start_time: string;
  end_time: string;
  break_duration_minutes: number;
  location?: string | null;
  supervisor_name?: string | null;
  notes?: string | null;
  recurrence: 'none' | 'daily' | 'weekly' | 'custom_weekdays';
  working_days: string[];
  student_ids: string[];
}

export interface ScheduleAuditEntry {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
}

export interface CalendarIntegration {
  connected: boolean;
  calendar_id: string | null;
  calendar_name: string | null;
  automatic_sync: boolean;
  cancel_behavior: 'mark_cancelled' | 'remove';
  last_synced_at: string | null;
}

export interface Evaluation {
  id: string;
  student_id: string;
  company_id: string;
  evaluator_id: string;
  attendance_score: number;
  punctuality_score: number;
  communication_score: number;
  professionalism_score: number;
  technical_skills_score: number;
  problem_solving_score: number;
  teamwork_score: number;
  initiative_score: number;
  adaptability_score: number;
  work_quality_score: number;
  responsibility_score: number;
  overall_rating: number;
  comments: string;
  strengths: string;
  weaknesses: string;
  recommendations: string;
  created_at: string;
}

export interface Announcement {
  id: string;
  company_id: string | null;
  created_by: string | null;
  created_by_role: 'company' | 'coordinator' | 'admin' | 'student' | null;
  category: 'company' | 'coordinator' | null;
  status: string;
  title: string;
  content: string;
  author: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
  updated_at: string;
  company_name?: string | null;
  creator_name?: string | null;
  student_count?: number;
}

export interface AnnouncementInput {
  company_id: string;
  title: string;
  content: string;
  category: 'company';
  attachment_url?: string | null;
  attachment_name?: string | null;
}

export interface CompanyDocument {
  id: string;
  company_id: string;
  uploader_id: string;
  title: string;
  file_name: string;
  file_path: string;
  file_type: string;
  created_at: string;
}

export const companyService = {
  async getAssignedStudents(companyId: string): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, company:companies(name)')
      .eq('company_id', companyId)
      .eq('account_type', 'student');

    if (error) {
      console.error("Error fetching assigned students:", error);
      return [];
    }
    return data as Profile[];
  },

  async getStudentAttendance(studentIds: string[], startDate?: string, endDate?: string) {
    let query = supabase
      .from('timesheets')
      .select('*')
      .in('user_id', studentIds);

    if (startDate) {
      query = query.gte('clock_in', startDate);
    }
    if (endDate) {
      query = query.lte('clock_in', endDate);
    }

    const { data, error } = await query.order('clock_in', { ascending: false });

    if (error) {
      console.error("Error fetching attendance:", error);
      return [];
    }
    return data;
  },

  async getPendingJournals(studentIds: string[], startDate?: string, endDate?: string) {
    let query = supabase
      .from('daily_journals')
      .select('*, profiles:user_id(first_name, last_name, avatar_url)')
      .in('user_id', studentIds)
      .eq('status', 'pending');

    if (startDate) {
      query = query.gte('entry_date', startDate);
    }
    if (endDate) {
      query = query.lte('entry_date', endDate);
    }

    const { data, error } = await query.order('entry_date', { ascending: false });

    if (error) {
      console.error("Error fetching journals:", error);
      return [];
    }
    return data;
  },
  
  async getAllJournals(studentIds: string[], startDate?: string, endDate?: string) {
    let query = supabase
      .from('daily_journals')
      .select('*, profiles:user_id(first_name, last_name, avatar_url)')
      .in('user_id', studentIds);

    if (startDate) {
      query = query.gte('entry_date', startDate);
    }
    if (endDate) {
      query = query.lte('entry_date', endDate);
    }

    const { data, error } = await query.order('entry_date', { ascending: false });

    if (error) {
      console.error("Error fetching all journals:", error);
      return [];
    }
    return data;
  },

  async updateJournalStatus(journalId: string, status: 'approved' | 'rejected' | 'revision_requested', comments: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No user logged in");

    const { error } = await supabase
      .from('daily_journals')
      .update({
        status,
        reviewer_comments: comments,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id
      })
      .eq('id', journalId);

    if (error) throw error;
    return true;
  },

  async submitEvaluation(evaluationData: Omit<Evaluation, 'id' | 'created_at' | 'updated_at'>) {
    const { error } = await supabase
      .from('evaluations')
      .insert(evaluationData);
    if (error) throw error;

    try {
      await createAuditLog({
        action: 'SUBMIT',
        module: 'Evaluations',
        description: `Submitted performance evaluation for student ${evaluationData.student_id}`,
        targetType: 'student',
        targetId: evaluationData.student_id,
        newValues: { overall_rating: evaluationData.overall_rating },
      });
    } catch {}

    return true;
  },
  
  async getStudentEvaluations(studentId: string) {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error("Error fetching evaluations:", error);
      return [];
    }
    return data;
  },

  async getCompanyEvaluations(companyId: string) {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error("Error fetching company evaluations:", error);
      return [];
    }
    return data;
  },

  async getAnnouncements(companyId: string) {
    const { data, error } = await supabase
      .rpc('get_company_announcements', { p_company_id: companyId });

    if (error) {
      console.error("Error fetching announcements:", error);
      throw error;
    }
    return (data || []) as Announcement[];
  },

  async createAnnouncement(announcementData: AnnouncementInput) {
    const { error } = await supabase
      .from('announcements')
      .insert({
        company_id: announcementData.company_id,
        title: announcementData.title,
        content: announcementData.content,
        category: announcementData.category,
        attachment_url: announcementData.attachment_url || null,
        attachment_name: announcementData.attachment_name || null
      });
    if (error) throw error;

    try {
      await createAuditLog({
        action: 'CREATE',
        module: 'Announcements',
        description: `Created announcement: ${announcementData.title}`,
        targetType: 'announcement',
        targetName: announcementData.title,
      });
    } catch {}

    return true;
  },

  async updateAnnouncement(id: string, updates: {
    title?: string;
    content?: string;
    attachment_url?: string | null;
    attachment_name?: string | null;
  }) {
    const { error } = await supabase
      .from('announcements')
      .update({
        title: updates.title,
        content: updates.content,
        attachment_url: updates.attachment_url ?? null,
        attachment_name: updates.attachment_name ?? null
      })
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  async deleteAnnouncement(id: string) {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);
    if (error) throw error;

    try {
      await createAuditLog({
        action: 'DELETE',
        module: 'Announcements',
        description: `Deleted announcement: ${id}`,
        targetType: 'announcement',
        targetId: id,
      });
    } catch {}

    return true;
  },

  async getAnnouncementAttachmentUrl(filePath: string) {
    const { data, error } = await supabase.storage
      .from('company_documents')
      .createSignedUrl(filePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  },

  async uploadAnnouncementAttachment(companyId: string, file: File) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${companyId}/announcements/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('company_documents')
      .upload(filePath, file, { upsert: false });
    if (uploadError) throw uploadError;

    return {
      file_path: filePath,
      file_name: file.name
    };
  },

  async deleteAnnouncementAttachment(filePath: string) {
    await supabase.storage.from('company_documents').remove([filePath]);
    return true;
  },

  async getSchedules(_companyId: string): Promise<Schedule[]> {
    const { data, error } = await supabase.rpc('get_company_schedules');
    if (error) throw error;
    return (data || []) as Schedule[];
  },

  async saveSchedule(scheduleData: ScheduleInput): Promise<Schedule> {
    const { data, error } = await supabase.rpc('save_company_schedule', {
      p_schedule_id: scheduleData.id || null,
      p_name: scheduleData.name,
      p_start_date: scheduleData.start_date,
      p_end_date: scheduleData.end_date || null,
      p_start_time: scheduleData.start_time,
      p_end_time: scheduleData.end_time,
      p_break_duration_minutes: scheduleData.break_duration_minutes,
      p_location: scheduleData.location || null,
      p_supervisor_name: scheduleData.supervisor_name || null,
      p_notes: scheduleData.notes || null,
      p_recurrence: scheduleData.recurrence,
      p_working_days: scheduleData.working_days,
      p_student_ids: scheduleData.student_ids,
    });
    if (error) throw error;
    return data as Schedule;
  },

  async deleteSchedule(scheduleId: string) {
    const { error } = await supabase.rpc('delete_company_schedule', { p_schedule_id: scheduleId });
    if (error) throw error;
  },

  async getScheduleHistory(scheduleId: string): Promise<ScheduleAuditEntry[]> {
    const { data, error } = await supabase.rpc('get_company_schedule_audit', { p_schedule_id: scheduleId });
    if (error) throw error;
    return (data || []) as ScheduleAuditEntry[];
  },

  async getCalendarIntegration(): Promise<CalendarIntegration> {
    const { data, error } = await supabase.rpc('get_company_calendar_integration');
    if (error) throw error;
    return data as CalendarIntegration;
  },

  async invokeCalendar(action: 'connect' | 'import' | 'sync' | 'disconnect', scheduleId?: string, popup = false) {
    if (import.meta.env.DEV) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Your session has expired. Please sign in again.');

      const response = await fetch('/supabase-functions/google-calendar', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action, scheduleId, popup }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Calendar request failed.');
      return payload as { authorizationUrl?: string; message?: string };
    }

    const { data, error } = await supabase.functions.invoke('google-calendar', {
      body: { action, scheduleId, popup },
    });
    if (error) throw error;
    return data as { authorizationUrl?: string; message?: string };
  },

  async getDocuments(companyId: string) {
    const { data, error } = await supabase
      .from('company_documents')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error("Error fetching documents:", error);
      return [];
    }
    return data;
  },

  async uploadDocument(companyId: string, file: File, title: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No user logged in");

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${companyId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('company_documents')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { error: dbError } = await supabase
      .from('company_documents')
      .insert({
        company_id: companyId,
        uploader_id: user.id,
        title,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type
      });

    if (dbError) throw dbError;
    return true;
  },
  
  async getDocumentUrl(filePath: string) {
      const { data } = supabase.storage.from('company_documents').getPublicUrl(filePath);
      return data.publicUrl;
  },

  async deleteDocument(id: string, filePath: string) {
    await supabase.storage.from('company_documents').remove([filePath]);
    const { error } = await supabase
      .from('company_documents')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  async getCompanyInfo(companyId: string) {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();
    
    if (error) {
      console.error("Error fetching company info:", error);
      throw error;
    }
    return data;
  },

  async updateCompanyInfo(companyId: string, updates: any) {
    const { error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', companyId);
      
    if (error) throw error;
    return true;
  }
};
