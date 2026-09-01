-- ============================================================
-- ADVISER ROLE & ADVISER PORTAL - DATABASE SCHEMA & MIGRATION
-- ============================================================

-- 1. Update account_type check constraint on profiles
DO $$
BEGIN
  -- Drop existing check constraint if present
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_type_check;
  
  -- Add updated check constraint supporting 'adviser'
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_type_check 
    CHECK (account_type IN ('student', 'coordinator', 'admin', 'company', 'adviser'));
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Constraint update skipped or modified: %', SQLERRM;
END $$;

-- 2. Add Adviser and Approval Fields to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS adviser_type text CHECK (adviser_type IN ('HT Adviser', 'IT Adviser') OR adviser_type IS NULL),
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'correction_requested')),
  ADD COLUMN IF NOT EXISTS adviser_remarks text,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- 3. Create Sections Table if not exists
CREATE TABLE IF NOT EXISTS public.sections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  course_code text NOT NULL CHECK (course_code IN ('DHT', 'DIT')),
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read sections
DROP POLICY IF EXISTS "Anyone authenticated can view sections" ON public.sections;
CREATE POLICY "Anyone authenticated can view sections"
  ON public.sections FOR SELECT
  TO authenticated
  USING (true);

-- Admins and Coordinators can manage sections
DROP POLICY IF EXISTS "Coordinators and Admins can manage sections" ON public.sections;
CREATE POLICY "Coordinators and Admins can manage sections"
  ON public.sections FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type IN ('coordinator', 'admin')
    )
  );

-- 4. Create Adviser Sections Junction Table
CREATE TABLE IF NOT EXISTS public.adviser_sections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  adviser_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  section_id uuid REFERENCES public.sections(id) ON DELETE CASCADE NOT NULL,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  CONSTRAINT unique_active_section_assignment UNIQUE (section_id)
);

ALTER TABLE public.adviser_sections ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can view adviser_sections
DROP POLICY IF EXISTS "Anyone authenticated can view adviser_sections" ON public.adviser_sections;
CREATE POLICY "Anyone authenticated can view adviser_sections"
  ON public.adviser_sections FOR SELECT
  TO authenticated
  USING (true);

-- Only Coordinators and Admins can insert/update/delete adviser_sections
DROP POLICY IF EXISTS "Coordinators and Admins can manage adviser_sections" ON public.adviser_sections;
CREATE POLICY "Coordinators and Admins can manage adviser_sections"
  ON public.adviser_sections FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type IN ('coordinator', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type IN ('coordinator', 'admin')
    )
  );

-- 5. Seed default sections for DHT and DIT if they don't exist
INSERT INTO public.sections (name, course_code) VALUES
  ('DHT-1A', 'DHT'),
  ('DHT-1B', 'DHT'),
  ('DHT-1C', 'DHT'),
  ('DHT-2A', 'DHT'),
  ('DHT-2B', 'DHT'),
  ('DIT-1A', 'DIT'),
  ('DIT-1B', 'DIT'),
  ('DIT-1C', 'DIT'),
  ('DIT-2A', 'DIT'),
  ('DIT-2B', 'DIT')
ON CONFLICT (name) DO NOTHING;

-- 6. Trigger: Database Validation for Course-Based Adviser Assignment
--    DHT section -> HT Adviser only
--    DIT section -> IT Adviser only
CREATE OR REPLACE FUNCTION public.validate_adviser_course_assignment()
RETURNS trigger AS $$
DECLARE
  v_adviser_role text;
  v_adviser_type text;
  v_adviser_course text;
  v_adviser_active boolean;
  v_section_course text;
BEGIN
  -- Get adviser profile details
  SELECT account_type, adviser_type, course, is_active
  INTO v_adviser_role, v_adviser_type, v_adviser_course, v_adviser_active
  FROM public.profiles
  WHERE auth_user_id = NEW.adviser_id;

  IF v_adviser_role IS NULL OR v_adviser_role != 'adviser' THEN
    RAISE EXCEPTION 'Target user is not an adviser (role is %)', COALESCE(v_adviser_role, 'unknown');
  END IF;

  IF v_adviser_active IS FALSE THEN
    RAISE EXCEPTION 'Cannot assign an inactive adviser';
  END IF;

  -- Get section course_code
  SELECT course_code INTO v_section_course
  FROM public.sections
  WHERE id = NEW.section_id;

  IF v_section_course IS NULL THEN
    RAISE EXCEPTION 'Section not found';
  END IF;

  -- Course compatibility check
  IF v_section_course = 'DHT' THEN
    IF v_adviser_type != 'HT Adviser' AND v_adviser_course != 'DHT' THEN
      RAISE EXCEPTION 'Invalid Assignment: DHT sections can only be assigned to HT Advisers.';
    END IF;
  ELSIF v_section_course = 'DIT' THEN
    IF v_adviser_type != 'IT Adviser' AND v_adviser_course != 'DIT' THEN
      RAISE EXCEPTION 'Invalid Assignment: DIT sections can only be assigned to IT Advisers.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_adviser_course_assignment ON public.adviser_sections;
CREATE TRIGGER trg_validate_adviser_course_assignment
  BEFORE INSERT OR UPDATE ON public.adviser_sections
  FOR EACH ROW
  EXECUTE PROCEDURE public.validate_adviser_course_assignment();

-- 7. Helper Security Functions for Adviser RLS
CREATE OR REPLACE FUNCTION public.is_adviser()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND account_type = 'adviser'
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.get_adviser_assigned_section_names(p_adviser_uid uuid DEFAULT auth.uid())
RETURNS TABLE (section_name text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT s.name
  FROM public.adviser_sections as_rel
  JOIN public.sections s ON as_rel.section_id = s.id
  WHERE as_rel.adviser_id = p_adviser_uid
    AND as_rel.status = 'active';
$$;

-- 8. Adviser RLS Policies for Profiles, Timesheets, Journals, Documents
-- Profiles: Advisers can view students in their assigned sections
DROP POLICY IF EXISTS "Advisers can view assigned section students" ON public.profiles;
CREATE POLICY "Advisers can view assigned section students"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.is_adviser() 
    AND (
      auth_user_id = auth.uid()
      OR (
        account_type = 'student' 
        AND section IN (SELECT section_name FROM public.get_adviser_assigned_section_names())
      )
    )
  );

-- Profiles: Advisers can update (approve / reject / remarks) students in their assigned sections
DROP POLICY IF EXISTS "Advisers can update assigned section students" ON public.profiles;
CREATE POLICY "Advisers can update assigned section students"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    public.is_adviser() 
    AND (
      auth_user_id = auth.uid()
      OR (
        account_type = 'student' 
        AND section IN (SELECT section_name FROM public.get_adviser_assigned_section_names())
      )
    )
  );

-- Timesheets: Advisers can view timesheets of their assigned students
DROP POLICY IF EXISTS "Advisers can view assigned students timesheets" ON public.timesheets;
CREATE POLICY "Advisers can view assigned students timesheets"
  ON public.timesheets FOR SELECT
  TO authenticated
  USING (
    public.is_adviser()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = timesheets.user_id
        AND p.section IN (SELECT section_name FROM public.get_adviser_assigned_section_names())
    )
  );

-- Timesheets: Advisers can update (approve/reject) timesheets of their assigned students
DROP POLICY IF EXISTS "Advisers can update assigned students timesheets" ON public.timesheets;
CREATE POLICY "Advisers can update assigned students timesheets"
  ON public.timesheets FOR UPDATE
  TO authenticated
  USING (
    public.is_adviser()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = timesheets.user_id
        AND p.section IN (SELECT section_name FROM public.get_adviser_assigned_section_names())
    )
  );

-- Daily Journals: Advisers can view journals of their assigned students
DROP POLICY IF EXISTS "Advisers can view assigned students journals" ON public.daily_journals;
CREATE POLICY "Advisers can view assigned students journals"
  ON public.daily_journals FOR SELECT
  TO authenticated
  USING (
    public.is_adviser()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = daily_journals.user_id
        AND p.section IN (SELECT section_name FROM public.get_adviser_assigned_section_names())
    )
  );

-- Daily Journals: Advisers can update (approve/reject) journals of their assigned students
DROP POLICY IF EXISTS "Advisers can update assigned students journals" ON public.daily_journals;
CREATE POLICY "Advisers can update assigned students journals"
  ON public.daily_journals FOR UPDATE
  TO authenticated
  USING (
    public.is_adviser()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = daily_journals.user_id
        AND p.section IN (SELECT section_name FROM public.get_adviser_assigned_section_names())
    )
  );

-- Student Documents: Advisers can view documents of their assigned students
DROP POLICY IF EXISTS "Advisers can view assigned students documents" ON public.student_documents;
CREATE POLICY "Advisers can view assigned students documents"
  ON public.student_documents FOR SELECT
  TO authenticated
  USING (
    public.is_adviser()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = student_documents.user_id
        AND p.section IN (SELECT section_name FROM public.get_adviser_assigned_section_names())
    )
  );

-- Student Documents: Advisers can update documents of their assigned students
DROP POLICY IF EXISTS "Advisers can update assigned students documents" ON public.student_documents;
CREATE POLICY "Advisers can update assigned students documents"
  ON public.student_documents FOR UPDATE
  TO authenticated
  USING (
    public.is_adviser()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = student_documents.user_id
        AND p.section IN (SELECT section_name FROM public.get_adviser_assigned_section_names())
    )
  );

-- 9. RPC Functions for Atomic Operations

-- Assign or Reassign an Adviser to a Section (Coordinator/Admin only)
CREATE OR REPLACE FUNCTION public.coordinator_assign_adviser_section(
  p_adviser_id uuid,
  p_section_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_role text;
  v_res jsonb;
BEGIN
  -- Caller verification
  SELECT account_type INTO v_caller_role
  FROM public.profiles
  WHERE auth_user_id = auth.uid();

  IF v_caller_role NOT IN ('coordinator', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only coordinators or admins can assign advisers to sections.';
  END IF;

  -- Upsert active assignment (due to unique constraint on section_id)
  INSERT INTO public.adviser_sections (adviser_id, section_id, assigned_by, status, assigned_at)
  VALUES (p_adviser_id, p_section_id, auth.uid(), 'active', now())
  ON CONFLICT (section_id)
  DO UPDATE SET
    adviser_id = EXCLUDED.adviser_id,
    assigned_by = EXCLUDED.assigned_by,
    status = 'active',
    assigned_at = now();

  SELECT jsonb_build_object('success', true, 'section_id', p_section_id, 'adviser_id', p_adviser_id) INTO v_res;
  RETURN v_res;
END;
$$;

-- Remove Adviser from Section
CREATE OR REPLACE FUNCTION public.coordinator_remove_adviser_section(
  p_section_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT account_type INTO v_caller_role
  FROM public.profiles
  WHERE auth_user_id = auth.uid();

  IF v_caller_role NOT IN ('coordinator', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only coordinators or admins can remove adviser section assignments.';
  END IF;

  DELETE FROM public.adviser_sections WHERE section_id = p_section_id;

  RETURN jsonb_build_object('success', true, 'section_id', p_section_id);
END;
$$;

-- Adviser approves a student account
CREATE OR REPLACE FUNCTION public.adviser_approve_student(
  p_student_id uuid,
  p_remarks text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_student_section text;
  v_caller_is_valid boolean;
  v_caller_role text;
BEGIN
  -- Check caller
  SELECT account_type INTO v_caller_role
  FROM public.profiles
  WHERE auth_user_id = auth.uid();

  -- Admins and coordinators can always approve
  IF v_caller_role IN ('admin', 'coordinator') THEN
    v_caller_is_valid := true;
  ELSIF v_caller_role = 'adviser' THEN
    -- Check if student belongs to caller's assigned sections
    SELECT section INTO v_student_section
    FROM public.profiles
    WHERE id = p_student_id OR auth_user_id = p_student_id;

    SELECT EXISTS (
      SELECT 1 FROM public.adviser_sections as_rel
      JOIN public.sections s ON as_rel.section_id = s.id
      WHERE as_rel.adviser_id = auth.uid()
        AND as_rel.status = 'active'
        AND s.name = v_student_section
    ) INTO v_caller_is_valid;
  ELSE
    v_caller_is_valid := false;
  END IF;

  IF NOT v_caller_is_valid THEN
    RAISE EXCEPTION 'Unauthorized: You are not assigned as the adviser for this student''s section.';
  END IF;

  -- Update student profile
  UPDATE public.profiles
  SET
    is_active = true,
    approval_status = 'approved',
    adviser_remarks = p_remarks,
    approved_by = auth.uid(),
    approved_at = now()
  WHERE id = p_student_id OR auth_user_id = p_student_id;

  RETURN jsonb_build_object('success', true, 'student_id', p_student_id);
END;
$$;

-- Adviser rejects or requests correction for a student account
CREATE OR REPLACE FUNCTION public.adviser_reject_student(
  p_student_id uuid,
  p_status text, -- 'rejected' or 'correction_requested'
  p_remarks text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_student_section text;
  v_caller_is_valid boolean;
  v_caller_role text;
BEGIN
  IF p_status NOT IN ('rejected', 'correction_requested') THEN
    RAISE EXCEPTION 'Invalid status. Must be rejected or correction_requested.';
  END IF;

  SELECT account_type INTO v_caller_role
  FROM public.profiles
  WHERE auth_user_id = auth.uid();

  IF v_caller_role IN ('admin', 'coordinator') THEN
    v_caller_is_valid := true;
  ELSIF v_caller_role = 'adviser' THEN
    SELECT section INTO v_student_section
    FROM public.profiles
    WHERE id = p_student_id OR auth_user_id = p_student_id;

    SELECT EXISTS (
      SELECT 1 FROM public.adviser_sections as_rel
      JOIN public.sections s ON as_rel.section_id = s.id
      WHERE as_rel.adviser_id = auth.uid()
        AND as_rel.status = 'active'
        AND s.name = v_student_section
    ) INTO v_caller_is_valid;
  ELSE
    v_caller_is_valid := false;
  END IF;

  IF NOT v_caller_is_valid THEN
    RAISE EXCEPTION 'Unauthorized: You are not assigned as the adviser for this student''s section.';
  END IF;

  UPDATE public.profiles
  SET
    is_active = false,
    approval_status = p_status,
    adviser_remarks = p_remarks,
    approved_by = auth.uid(),
    approved_at = now()
  WHERE id = p_student_id OR auth_user_id = p_student_id;

  RETURN jsonb_build_object('success', true, 'student_id', p_student_id, 'status', p_status);
END;
$$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
