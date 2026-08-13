import { supabase } from '../lib/supabaseClient';
import type { Profile } from './profileService';

export interface Schedule {
  id: string;
  company_id: string;
  student_id: string;
  shift_type: 'morning' | 'afternoon' | 'night' | 'flexible';
  working_days: string[];
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
  created_at: string;
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

  async getSchedules(companyId: string) {
    const { data, error } = await supabase
      .from('schedules')
      .select('*, profiles:student_id(first_name, last_name)')
      .eq('company_id', companyId);
    if (error) {
      console.error("Error fetching schedules:", error);
      return [];
    }
    return data;
  },

  async saveSchedule(scheduleData: Partial<Schedule>) {
    if (scheduleData.id) {
        const { error } = await supabase
        .from('schedules')
        .update(scheduleData)
        .eq('id', scheduleData.id);
        if (error) throw error;
    } else {
        const { error } = await supabase
        .from('schedules')
        .insert(scheduleData);
        if (error) throw error;
    }
    return true;
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
