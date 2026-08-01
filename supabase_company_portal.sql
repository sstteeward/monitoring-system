-- ==============================================================================
-- Company Portal Schema Updates
-- ==============================================================================

-- 1. Update profiles account_type constraint
-- First, try to drop the known constraint name (might fail if named differently, handle carefully)
DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%account_type%';
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT ' || constraint_name;
    END IF;
END $$;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_type_check CHECK (account_type IN ('student', 'coordinator', 'admin', 'company'));

-- 2. Update companies table
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS supervisor_name TEXT,
  ADD COLUMN IF NOT EXISTS supervisor_contact TEXT,
  ADD COLUMN IF NOT EXISTS business_hours TEXT;

-- 3. Update daily_journals table
ALTER TABLE public.daily_journals
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revision_requested')),
  ADD COLUMN IF NOT EXISTS reviewer_comments TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id);

-- Add company RLS to daily_journals
CREATE POLICY "Company can view their students journals"
  ON public.daily_journals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.profiles my_profile ON my_profile.auth_user_id = auth.uid()
      WHERE p.auth_user_id = daily_journals.user_id
        AND my_profile.account_type = 'company'
        AND p.company_id = my_profile.company_id
    )
  );

CREATE POLICY "Company can update their students journals"
  ON public.daily_journals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.profiles my_profile ON my_profile.auth_user_id = auth.uid()
      WHERE p.auth_user_id = daily_journals.user_id
        AND my_profile.account_type = 'company'
        AND p.company_id = my_profile.company_id
    )
  );


-- 4. Create schedules table
CREATE TABLE IF NOT EXISTS public.schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_type TEXT NOT NULL DEFAULT 'flexible' CHECK (shift_type IN ('morning', 'afternoon', 'night', 'flexible')),
  working_days JSONB DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday"]'::jsonb,
  start_time TIME,
  end_time TIME,
  break_start TIME,
  break_end TIME,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own schedule"
  ON public.schedules FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Company can manage schedules for their students"
  ON public.schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'company'
        AND company_id = schedules.company_id
    )
  );

CREATE TRIGGER on_schedules_updated
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();


-- 5. Create evaluations table
CREATE TABLE IF NOT EXISTS public.evaluations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES auth.users(id),
  
  attendance_score INTEGER CHECK (attendance_score BETWEEN 1 AND 5),
  punctuality_score INTEGER CHECK (punctuality_score BETWEEN 1 AND 5),
  communication_score INTEGER CHECK (communication_score BETWEEN 1 AND 5),
  professionalism_score INTEGER CHECK (professionalism_score BETWEEN 1 AND 5),
  technical_skills_score INTEGER CHECK (technical_skills_score BETWEEN 1 AND 5),
  problem_solving_score INTEGER CHECK (problem_solving_score BETWEEN 1 AND 5),
  teamwork_score INTEGER CHECK (teamwork_score BETWEEN 1 AND 5),
  initiative_score INTEGER CHECK (initiative_score BETWEEN 1 AND 5),
  adaptability_score INTEGER CHECK (adaptability_score BETWEEN 1 AND 5),
  work_quality_score INTEGER CHECK (work_quality_score BETWEEN 1 AND 5),
  responsibility_score INTEGER CHECK (responsibility_score BETWEEN 1 AND 5),
  
  overall_rating NUMERIC(3,2),
  comments TEXT,
  strengths TEXT,
  weaknesses TEXT,
  recommendations TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view their own evaluations"
  ON public.evaluations FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Company can manage evaluations for their students"
  ON public.evaluations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'company'
        AND company_id = evaluations.company_id
    )
  );

CREATE POLICY "Coordinators and Admins can view evaluations"
  ON public.evaluations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type IN ('coordinator', 'admin')
    )
  );

CREATE TRIGGER on_evaluations_updated
  BEFORE UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();


-- 6. Create announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'general' CHECK (type IN ('general', 'meeting', 'reminder', 'holiday', 'schedule_change', 'training'));

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view their company announcements"
  ON public.announcements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND company_id = announcements.company_id
    )
  );

CREATE POLICY "Company can manage their own announcements"
  ON public.announcements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'company'
        AND company_id = announcements.company_id
    )
  );

CREATE TRIGGER on_announcements_updated
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();


-- 7. Create company_documents table
CREATE TABLE IF NOT EXISTS public.company_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  uploader_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view their company documents"
  ON public.company_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND company_id = company_documents.company_id
    )
  );

CREATE POLICY "Company can manage their own documents"
  ON public.company_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'company'
        AND company_id = company_documents.company_id
    )
  );

CREATE TRIGGER on_company_documents_updated
  BEFORE UPDATE ON public.company_documents
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Setup Storage for company_documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('company_documents', 'company_documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Company can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'company_documents' AND 
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_user_id = auth.uid()
          AND account_type = 'company'
          AND company_id::text = (storage.foldername(name))[1]
    )
);

CREATE POLICY "Students and Company can view documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'company_documents' AND 
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_user_id = auth.uid()
          AND company_id::text = (storage.foldername(name))[1]
    )
);

CREATE POLICY "Company can delete documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'company_documents' AND 
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_user_id = auth.uid()
          AND account_type = 'company'
          AND company_id::text = (storage.foldername(name))[1]
    )
);

-- 8. Additional RLS for Company to view profiles and timesheets
CREATE POLICY "Company can view their assigned student profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles my_profile
      WHERE my_profile.auth_user_id = auth.uid()
        AND my_profile.account_type = 'company'
        AND my_profile.company_id = profiles.company_id
    )
  );

CREATE POLICY "Company can view their students timesheets"
  ON public.timesheets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.profiles my_profile ON my_profile.auth_user_id = auth.uid()
      WHERE p.auth_user_id = timesheets.user_id
        AND my_profile.account_type = 'company'
        AND p.company_id = my_profile.company_id
    )
  );

-- Company can update their own company profile
CREATE POLICY "Company can update their own company info"
  ON public.companies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'company'
        AND company_id = companies.id
    )
  );
