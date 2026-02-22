-- ==============================================================================
-- SQL to enable Coordinator access to all relevant student data
-- Run this in the Supabase SQL Editor
-- ==============================================================================

-- 1. Helper Function: Check if the current user is a coordinator
CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND account_type = 'coordinator'
  );
$$;

-- 2. Profiles Table: Allow coordinators to view all profiles and update them (e.g. for approvals)
CREATE POLICY "Coordinators can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_coordinator());

CREATE POLICY "Coordinators can update profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_coordinator());

-- 3. Timesheets Table: Allow coordinators to view all timesheets
CREATE POLICY "Coordinators can view all timesheets"
  ON public.timesheets FOR SELECT
  USING (public.is_coordinator());

-- 4. Daily Journals: Allow coordinators to view all journals
CREATE POLICY "Coordinators can view all journals"
  ON public.daily_journals FOR SELECT
  USING (public.is_coordinator());

-- 5. Student Documents: Allow coordinators to view and update (approve/reject) all documents
CREATE POLICY "Coordinators can view all documents"
  ON public.student_documents FOR SELECT
  USING (public.is_coordinator());

CREATE POLICY "Coordinators can update all documents"
  ON public.student_documents FOR UPDATE
  USING (public.is_coordinator());

-- 6. Announcements: Allow coordinators to create and update announcements
CREATE POLICY "Coordinators can insert announcements"
  ON public.announcements FOR INSERT
  WITH CHECK (public.is_coordinator());

CREATE POLICY "Coordinators can update announcements"
  ON public.announcements FOR UPDATE
  USING (public.is_coordinator());

-- 7. Storage Bucket ('documents'): Allow coordinators to read all uploaded requirement files
CREATE POLICY "Coordinators can select all documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents' AND 
    public.is_coordinator()
);

-- Note: Ensure that the 'documents' bucket is created before running the storage policy.
