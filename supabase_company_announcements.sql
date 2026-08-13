-- ==============================================================================
-- Company Announcements → Targeted Student Notifications
-- Run this once in the Supabase SQL Editor. Required order (each file as its own
-- query): supabase_coordinator_rls.sql → supabase_company_portal.sql →
-- supabase_announcement_notifications.sql → this file.
--
-- What it does:
--   1. Extends `announcements` with creator/category/status/attachment columns.
--   2. Server-side creator enforcement (company_id always comes from the
--      authenticated company profile, never from the client).
--   3. Rewrites the notification trigger so COMPANY announcements are only
--      delivered to students currently assigned to that company (never a
--      global broadcast). School/coordinator announcements still notify all
--      students.
--   4. Tightens RLS so companies can only manage their own announcements and
--      students can only read announcements for their own company (or school-
--      wide coordinator announcements).
--   5. Adds secured RPC functions used by the company portal and the student
--      announcement viewer (access is re-verified server-side).
-- ==============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend announcements table
-- ----------------------------------------------------------------------------
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_role TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT;

ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_created_by_role_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_created_by_role_check
  CHECK (created_by_role IN ('company', 'coordinator', 'admin', 'student'));

ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_category_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_category_check
  CHECK (category IN ('company', 'coordinator'));

ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_status_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_status_check
  CHECK (status IN ('published', 'draft', 'archived'));

CREATE INDEX IF NOT EXISTS announcements_company_id_idx ON public.announcements (company_id);
CREATE INDEX IF NOT EXISTS announcements_created_by_role_idx ON public.announcements (created_by_role);
CREATE INDEX IF NOT EXISTS announcements_category_idx ON public.announcements (category);

-- Backfill legacy rows so the new category/creator rules apply to them too.
UPDATE public.announcements
  SET category = 'company', created_by_role = 'company'
  WHERE company_id IS NOT NULL AND category IS NULL;

UPDATE public.announcements
  SET category = 'coordinator', created_by_role = 'coordinator'
  WHERE company_id IS NULL AND category IS NULL;

-- ----------------------------------------------------------------------------
-- 2. Creator metadata trigger (BEFORE INSERT)
--    The company_id is always resolved from the authenticated user's profile,
--    never trusted from the client payload. category/created_by_role are
--    derived from the authenticated role.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_announcement_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role text;
  v_company_id uuid;
  v_company_name text;
BEGIN
  SELECT account_type, company_id INTO v_role, v_company_id
  FROM public.profiles
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Authenticated user has no profile';
  END IF;

  NEW.created_by := auth.uid();
  NEW.created_by_role := v_role;
  NEW.status := COALESCE(NEW.status, 'published');

  IF v_role = 'company' THEN
    NEW.company_id := v_company_id;
    NEW.category := 'company';
    v_company_name := (SELECT name FROM public.companies WHERE id = NEW.company_id);
    NEW.author := COALESCE(v_company_name, NEW.author, 'Company');
  ELSIF v_role = 'coordinator' THEN
    NEW.company_id := NULL;
    NEW.category := 'coordinator';
    NEW.author := COALESCE(NULLIF(trim(NEW.author), ''), 'SIL Coordinator');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_announcement_metadata() FROM PUBLIC;

DROP TRIGGER IF EXISTS set_announcement_metadata_before_insert ON public.announcements;
CREATE TRIGGER set_announcement_metadata_before_insert
  BEFORE INSERT ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_announcement_metadata();

-- ----------------------------------------------------------------------------
-- 3. Targeted notification trigger (rewrite of create_announcement_notifications)
--    Company announcement  → only students currently assigned to that company.
--    Coordinator/school announcement → all students.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_announcement_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_company_name text;
BEGIN
  IF NEW.company_id IS NOT NULL AND NEW.created_by_role = 'company' THEN
    v_company_name := (SELECT name FROM public.companies WHERE id = NEW.company_id);

    INSERT INTO public.user_notifications (user_id, title, message, type, is_read, source_type, source_id)
    SELECT
      p.auth_user_id,
      '📢 New Company Announcement',
      NEW.title || E'\n\n' || COALESCE(v_company_name, 'Your company') || ' posted a new announcement.',
      'info',
      false,
      'announcement',
      NEW.id
    FROM public.profiles AS p
    WHERE p.auth_user_id IS NOT NULL
      AND p.account_type = 'student'
      AND p.company_id = NEW.company_id;
  ELSE
    INSERT INTO public.user_notifications (user_id, title, message, type, is_read, source_type, source_id)
    SELECT
      p.auth_user_id,
      NEW.title,
      NEW.content,
      'info',
      false,
      'announcement',
      NEW.id
    FROM public.profiles AS p
    WHERE p.auth_user_id IS NOT NULL
      AND p.account_type = 'student';
  END IF;

  RETURN NEW;
END;
$$;

-- The function is only used by the database trigger; clients cannot call it.
REVOKE ALL ON FUNCTION public.create_announcement_notifications() FROM PUBLIC;

DROP TRIGGER IF EXISTS create_announcement_notifications_after_insert ON public.announcements;
CREATE TRIGGER create_announcement_notifications_after_insert
  AFTER INSERT ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.create_announcement_notifications();

-- ----------------------------------------------------------------------------
-- 4. RLS policies on announcements
-- ----------------------------------------------------------------------------
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Remove old/loose policies (they are replaced below).
DROP POLICY IF EXISTS "Anyone can view announcements" ON public.announcements;
DROP POLICY IF EXISTS "Students can view their company announcements" ON public.announcements;
DROP POLICY IF EXISTS "Company can manage their own announcements" ON public.announcements;
DROP POLICY IF EXISTS "Coordinators can insert announcements" ON public.announcements;
DROP POLICY IF EXISTS "Coordinators can update announcements" ON public.announcements;
DROP POLICY IF EXISTS "Coordinators can delete announcements" ON public.announcements;
DROP POLICY IF EXISTS "Students can view their announcements" ON public.announcements;
DROP POLICY IF EXISTS "Company can view their announcements" ON public.announcements;
DROP POLICY IF EXISTS "Coordinators and Admins can view announcements" ON public.announcements;
DROP POLICY IF EXISTS "Company can insert own announcements" ON public.announcements;
DROP POLICY IF EXISTS "Company can update own announcements" ON public.announcements;
DROP POLICY IF EXISTS "Company can delete own announcements" ON public.announcements;

-- SELECT ----------------------------------------------------------------

-- Students: only their company's announcements + school-wide coordinator ones.
CREATE POLICY "Students can view their announcements"
  ON public.announcements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'student'
        AND (
          public.announcements.company_id = profiles.company_id
          OR (
            public.announcements.company_id IS NULL
            AND public.announcements.category = 'coordinator'
          )
        )
    )
  );

-- Companies: only their own announcements + coordinator announcements.
CREATE POLICY "Company can view their announcements"
  ON public.announcements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'company'
        AND company_id = public.announcements.company_id
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_user_id = auth.uid()
          AND account_type = 'company'
      )
      AND public.announcements.company_id IS NULL
      AND public.announcements.created_by_role = 'coordinator'
    )
  );

-- Coordinators and admins can read every announcement (existing school flow).
CREATE POLICY "Coordinators and Admins can view announcements"
  ON public.announcements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type IN ('coordinator', 'admin')
    )
  );

-- INSERT ----------------------------------------------------------------

-- Companies: company_id is forced to their own by the BEFORE trigger, and the
-- WITH CHECK re-validates it so a company can never target another company.
CREATE POLICY "Company can insert own announcements"
  ON public.announcements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'company'
        AND company_id = public.announcements.company_id
    )
  );

-- Coordinators: school-wide announcements only (company_id must be NULL).
CREATE POLICY "Coordinators can insert announcements"
  ON public.announcements FOR INSERT
  WITH CHECK (
    public.is_coordinator()
    AND public.announcements.company_id IS NULL
  );

-- UPDATE ----------------------------------------------------------------

-- Companies can only update their own company announcements, and cannot
-- reassign the announcement to another company or change the creator role.
CREATE POLICY "Company can update own announcements"
  ON public.announcements FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'company'
        AND company_id = public.announcements.company_id
        AND public.announcements.created_by_role = 'company'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'company'
        AND company_id = public.announcements.company_id
    )
    AND public.announcements.created_by_role = 'company'
    AND public.announcements.category = 'company'
  );

-- Coordinators can update their own coordinator announcements only.
CREATE POLICY "Coordinators can update announcements"
  ON public.announcements FOR UPDATE
  USING (
    public.is_coordinator()
    AND public.announcements.company_id IS NULL
    AND public.announcements.created_by_role = 'coordinator'
  )
  WITH CHECK (
    public.is_coordinator()
    AND public.announcements.company_id IS NULL
    AND public.announcements.created_by_role = 'coordinator'
    AND public.announcements.category = 'coordinator'
  );

-- DELETE ----------------------------------------------------------------

CREATE POLICY "Company can delete own announcements"
  ON public.announcements FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'company'
        AND company_id = public.announcements.company_id
        AND public.announcements.created_by_role = 'company'
    )
  );

CREATE POLICY "Coordinators can delete announcements"
  ON public.announcements FOR DELETE
  USING (
    public.is_coordinator()
    AND public.announcements.company_id IS NULL
    AND public.announcements.created_by_role = 'coordinator'
  );

-- ----------------------------------------------------------------------------
-- 5. Secured RPC functions
-- ----------------------------------------------------------------------------

-- Company portal: list the company's own + coordinator announcements together
-- with creator/company names and the number of currently assigned interns.
-- Access is restricted server-side to the authenticated company.
CREATE OR REPLACE FUNCTION public.get_company_announcements(p_company_id uuid)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  created_by uuid,
  created_by_role text,
  category text,
  status text,
  title text,
  content text,
  author text,
  attachment_url text,
  attachment_name text,
  created_at timestamptz,
  updated_at timestamptz,
  company_name text,
  creator_name text,
  student_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.auth_user_id = auth.uid()
      AND profiles.account_type = 'company'
      AND profiles.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Not authorized for this company';
  END IF;

  RETURN QUERY
  SELECT
    a.id, a.company_id, a.created_by, a.created_by_role, a.category, a.status,
    a.title, a.content, a.author, a.attachment_url, a.attachment_name,
    a.created_at, a.updated_at,
    c.name AS company_name,
    COALESCE(NULLIF(trim(p.first_name || ' ' || COALESCE(p.last_name, '')), ''), a.author, 'Unknown') AS creator_name,
    (SELECT count(*) FROM public.profiles sp
      WHERE sp.account_type = 'student' AND sp.company_id = a.company_id) AS student_count
  FROM public.announcements a
  LEFT JOIN public.companies c ON c.id = a.company_id
  LEFT JOIN public.profiles p ON p.auth_user_id = a.created_by
  WHERE a.company_id = p_company_id
     OR (a.company_id IS NULL AND a.created_by_role = 'coordinator')
  ORDER BY a.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_company_announcements(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_announcements(uuid) TO authenticated;

-- Student portal: open a single announcement. Access is re-verified here —
-- the student must currently be assigned to the announcement's company
-- (or the announcement must be a school-wide coordinator announcement).
CREATE OR REPLACE FUNCTION public.get_student_announcement(p_announcement_id uuid)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  created_by uuid,
  created_by_role text,
  category text,
  status text,
  title text,
  content text,
  author text,
  attachment_url text,
  attachment_name text,
  created_at timestamptz,
  updated_at timestamptz,
  company_name text,
  creator_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_student_company uuid;
  v_row public.announcements%ROWTYPE;
BEGIN
  SELECT profiles.company_id INTO v_student_company
  FROM public.profiles
  WHERE profiles.auth_user_id = auth.uid()
    AND profiles.account_type = 'student'
  LIMIT 1;

  IF v_student_company IS NULL THEN
    RAISE EXCEPTION 'Not authorized to view this announcement';
  END IF;

  SELECT * INTO v_row FROM public.announcements WHERE announcements.id = p_announcement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Announcement not found';
  END IF;

  -- Only announcements for the student's own company, or school-wide
  -- coordinator announcements, are reachable.
  IF v_row.company_id IS NOT NULL AND v_row.company_id <> v_student_company THEN
    RAISE EXCEPTION 'Not authorized to view this announcement';
  END IF;

  RETURN QUERY
  SELECT
    a.id, a.company_id, a.created_by, a.created_by_role, a.category, a.status,
    a.title, a.content, a.author, a.attachment_url, a.attachment_name,
    a.created_at, a.updated_at,
    c.name AS company_name,
    COALESCE(NULLIF(trim(p.first_name || ' ' || COALESCE(p.last_name, '')), ''), a.author, 'Unknown') AS creator_name
  FROM public.announcements a
  LEFT JOIN public.companies c ON c.id = a.company_id
  LEFT JOIN public.profiles p ON p.auth_user_id = a.created_by
  WHERE a.id = p_announcement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_announcement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_announcement(uuid) TO authenticated;
