-- ==============================================================================
-- Adviser Announcements  —  targeting, read tracking and role-aware access
-- Run this once in the Supabase SQL Editor, AFTER
-- supabase_company_announcements.sql.
--
-- Why this file exists
--   The Adviser Portal showed "No school announcements at this time" even though
--   `public.announcements` held published coordinator announcements. The table
--   had SELECT policies for students, companies and coordinators/admins only —
--   there was no policy for `account_type = 'adviser'`, so RLS filtered every
--   row away and the client saw an empty (not failed) result. The notification
--   fan-out trigger had the same gap: it only ever inserted rows for students.
--
-- What it does
--   1. Extends `announcements` with target_audience / priority / published_at.
--   2. Adds `announcement_reads` for per-user read tracking, kept in sync with
--      the existing `user_notifications` bell.
--   3. Rewrites the creator-metadata triggers so audience, priority and
--      publication date are enforced server-side, and adds an UPDATE trigger so
--      publish/unpublish keeps its metadata immutable.
--   4. Rewrites the notification fan-out to follow the target audience for every
--      role (advisers included), on publish as well as on insert, without ever
--      creating a duplicate notification.
--   5. Rewrites the RLS policies: advisers can read the announcements addressed
--      to them, and every non-managing role is now also gated on status,
--      publication date and target audience.
--   6. Adds the secured RPCs the portals use (list / open / mark read), each of
--      which re-verifies access server-side.
-- ==============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend announcements
-- ----------------------------------------------------------------------------
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS target_audience TEXT[] NOT NULL DEFAULT ARRAY['all']::text[],
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Rows created before this migration were school-wide and already live.
UPDATE public.announcements
  SET published_at = created_at
  WHERE published_at IS NULL;

-- No column default: a draft has no publication date, and
-- set_announcement_metadata() stamps one the moment it is published (or keeps
-- the future date the author scheduled).
ALTER TABLE public.announcements
  ALTER COLUMN published_at DROP DEFAULT;

ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_target_audience_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_target_audience_check
  CHECK (
    target_audience <@ ARRAY['all', 'student', 'adviser', 'coordinator', 'company', 'admin']::text[]
    AND COALESCE(array_length(target_audience, 1), 0) > 0
  );

ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_priority_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_priority_check
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

-- `type` is the optional editorial category shown on the cards. Legacy rows all
-- carry the 'general' default, so constraining it here is safe.
ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_type_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_type_check
  CHECK (type IS NULL OR type IN ('general', 'academic', 'event', 'deadline', 'reminder', 'policy', 'emergency'));

CREATE INDEX IF NOT EXISTS announcements_target_audience_idx
  ON public.announcements USING GIN (target_audience);
CREATE INDEX IF NOT EXISTS announcements_status_published_idx
  ON public.announcements (status, published_at DESC);

-- ----------------------------------------------------------------------------
-- 2. Per-user read tracking
--    `user_notifications` records a *delivery* (and drives the bell); this table
--    records that the announcement itself was opened. mark_announcement_read()
--    below writes both, so the two can never disagree.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS announcement_reads_user_idx
  ON public.announcement_reads (user_id);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own announcement reads" ON public.announcement_reads;
CREATE POLICY "Users can view their own announcement reads"
  ON public.announcement_reads FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own announcement reads" ON public.announcement_reads;
CREATE POLICY "Users can insert their own announcement reads"
  ON public.announcement_reads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own announcement reads" ON public.announcement_reads;
CREATE POLICY "Users can delete their own announcement reads"
  ON public.announcement_reads FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. Creator metadata — INSERT and UPDATE
--    Everything that decides *who can see this* (company_id, category, audience,
--    creator) is derived from the authenticated profile, never from the client.
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
  v_author text;
BEGIN
  SELECT account_type, company_id,
         NULLIF(trim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '')
    INTO v_role, v_company_id, v_author
  FROM public.profiles
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Authenticated user has no profile';
  END IF;

  NEW.created_by := auth.uid();
  NEW.created_by_role := v_role;
  NEW.status := COALESCE(NEW.status, 'published');
  NEW.priority := COALESCE(NEW.priority, 'normal');
  NEW.type := COALESCE(NEW.type, 'general');
  NEW.target_audience := COALESCE(NULLIF(NEW.target_audience, ARRAY[]::text[]), ARRAY['all']::text[]);

  IF v_role = 'company' THEN
    NEW.company_id := v_company_id;
    NEW.category := 'company';
    -- A company only ever addresses its own interns.
    NEW.target_audience := ARRAY['student']::text[];
    v_company_name := (SELECT name FROM public.companies WHERE id = NEW.company_id);
    NEW.author := COALESCE(v_company_name, NEW.author, 'Company');
  ELSIF v_role IN ('coordinator', 'admin') THEN
    NEW.company_id := NULL;
    NEW.category := 'coordinator';
    NEW.author := COALESCE(
      NULLIF(trim(NEW.author), ''),
      v_author,
      CASE WHEN v_role = 'admin' THEN 'School Administrator' ELSE 'SIL Coordinator' END
    );
  ELSE
    RAISE EXCEPTION 'Role % is not allowed to create announcements', v_role;
  END IF;

  -- A published announcement always carries the moment it went live; a draft
  -- carries the scheduled date the author chose, or nothing.
  IF NEW.status = 'published' THEN
    NEW.published_at := COALESCE(NEW.published_at, now());
  END IF;

  RETURN NEW;
END;
$$;

-- Supabase's default privileges also grant EXECUTE to `anon`/`authenticated`,
-- which REVOKE ... FROM PUBLIC does not undo. Trigger functions are only ever
-- invoked by their triggers.
REVOKE ALL ON FUNCTION public.set_announcement_metadata() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_announcement_metadata_before_insert ON public.announcements;
CREATE TRIGGER set_announcement_metadata_before_insert
  BEFORE INSERT ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_announcement_metadata();

-- An update may change the wording, the audience, the priority or the status.
-- It may never change who owns the announcement or which company it belongs to,
-- which is what the SELECT policies are built on.
CREATE OR REPLACE FUNCTION public.set_announcement_update_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  NEW.created_by_role := OLD.created_by_role;
  NEW.category := OLD.category;
  NEW.company_id := OLD.company_id;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  NEW.priority := COALESCE(NEW.priority, 'normal');
  NEW.target_audience := COALESCE(NULLIF(NEW.target_audience, ARRAY[]::text[]), OLD.target_audience);

  IF OLD.created_by_role = 'company' THEN
    NEW.target_audience := ARRAY['student']::text[];
  END IF;

  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_announcement_update_metadata() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_announcement_metadata_before_update ON public.announcements;
CREATE TRIGGER set_announcement_metadata_before_update
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_announcement_update_metadata();

-- ----------------------------------------------------------------------------
-- 4. Notification fan-out
--    Company announcement  → the students currently assigned to that company.
--    School announcement   → every account whose role is in target_audience.
--    Runs on INSERT and on the draft → published transition, and never inserts
--    a second notification for an announcement a user already has.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_announcement_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_company_name text;
  v_audience text[];
  v_type text;
BEGIN
  -- Drafts, archived rows and future-dated publications notify nobody (yet).
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;
  IF NEW.published_at IS NOT NULL AND NEW.published_at > now() THEN
    RETURN NEW;
  END IF;
  -- On UPDATE, only an actual transition into "published" fans out.
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    RETURN NEW;
  END IF;

  v_audience := COALESCE(NEW.target_audience, ARRAY['all']::text[]);
  v_type := CASE NEW.priority
              WHEN 'urgent' THEN 'danger'
              WHEN 'high' THEN 'warning'
              ELSE 'info'
            END;

  IF NEW.company_id IS NOT NULL AND NEW.created_by_role = 'company' THEN
    v_company_name := (SELECT name FROM public.companies WHERE id = NEW.company_id);

    INSERT INTO public.user_notifications (user_id, title, message, type, is_read, source_type, source_id)
    SELECT
      p.auth_user_id,
      '📢 New Company Announcement',
      NEW.title || E'\n\n' || COALESCE(v_company_name, 'Your company') || ' posted a new announcement.',
      v_type,
      false,
      'announcement',
      NEW.id
    FROM public.profiles AS p
    WHERE p.auth_user_id IS NOT NULL
      AND p.account_type = 'student'
      AND p.company_id = NEW.company_id
      AND NOT EXISTS (
        SELECT 1 FROM public.user_notifications un
        WHERE un.source_type = 'announcement'
          AND un.source_id = NEW.id
          AND un.user_id = p.auth_user_id
      );
  ELSE
    INSERT INTO public.user_notifications (user_id, title, message, type, is_read, source_type, source_id)
    SELECT
      p.auth_user_id,
      NEW.title,
      NEW.content,
      v_type,
      false,
      'announcement',
      NEW.id
    FROM public.profiles AS p
    WHERE p.auth_user_id IS NOT NULL
      AND p.auth_user_id IS DISTINCT FROM NEW.created_by
      AND v_audience && ARRAY['all', p.account_type]::text[]
      AND NOT EXISTS (
        SELECT 1 FROM public.user_notifications un
        WHERE un.source_type = 'announcement'
          AND un.source_id = NEW.id
          AND un.user_id = p.auth_user_id
      );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_announcement_notifications() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS create_announcement_notifications_after_insert ON public.announcements;
CREATE TRIGGER create_announcement_notifications_after_insert
  AFTER INSERT ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.create_announcement_notifications();

DROP TRIGGER IF EXISTS create_announcement_notifications_after_update ON public.announcements;
CREATE TRIGGER create_announcement_notifications_after_update
  AFTER UPDATE OF status, published_at ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.create_announcement_notifications();

-- ----------------------------------------------------------------------------
-- 5. RLS
--    Each consuming role gets its own independent policy so a change to one can
--    never silently widen or break another.
-- ----------------------------------------------------------------------------
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- SELECT ----------------------------------------------------------------

-- Advisers: school-wide announcements addressed to them (or to everyone), that
-- are published and whose publication date has arrived. Company announcements
-- are never reachable — they belong to that company's interns.
DROP POLICY IF EXISTS "Advisers can view targeted announcements" ON public.announcements;
CREATE POLICY "Advisers can view targeted announcements"
  ON public.announcements FOR SELECT
  USING (
    public.is_adviser()
    AND public.announcements.company_id IS NULL
    AND public.announcements.status = 'published'
    AND (public.announcements.published_at IS NULL OR public.announcements.published_at <= now())
    AND public.announcements.target_audience && ARRAY['all', 'adviser']::text[]
  );

-- Students: their company's announcements, plus school-wide announcements
-- addressed to students.
DROP POLICY IF EXISTS "Students can view their announcements" ON public.announcements;
CREATE POLICY "Students can view their announcements"
  ON public.announcements FOR SELECT
  USING (
    public.announcements.status = 'published'
    AND (public.announcements.published_at IS NULL OR public.announcements.published_at <= now())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'student'
        AND (
          public.announcements.company_id = profiles.company_id
          OR (
            public.announcements.company_id IS NULL
            AND public.announcements.category = 'coordinator'
            AND public.announcements.target_audience && ARRAY['all', 'student']::text[]
          )
        )
    )
  );

-- Companies: their own announcements, plus school-wide announcements addressed
-- to companies.
DROP POLICY IF EXISTS "Company can view their announcements" ON public.announcements;
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
      AND public.announcements.created_by_role IN ('coordinator', 'admin')
      AND public.announcements.status = 'published'
      AND (public.announcements.published_at IS NULL OR public.announcements.published_at <= now())
      AND public.announcements.target_audience && ARRAY['all', 'company']::text[]
    )
  );

-- Coordinators and admins manage announcements, so they read everything —
-- including drafts and archived rows.
DROP POLICY IF EXISTS "Coordinators and Admins can view announcements" ON public.announcements;
CREATE POLICY "Coordinators and Admins can view announcements"
  ON public.announcements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type IN ('coordinator', 'admin')
    )
  );

-- INSERT / UPDATE / DELETE for admins (coordinator and company policies are
-- installed by supabase_company_announcements.sql and stay as they are).
DROP POLICY IF EXISTS "Admins can insert announcements" ON public.announcements;
CREATE POLICY "Admins can insert announcements"
  ON public.announcements FOR INSERT
  WITH CHECK (
    public.is_admin()
    AND public.announcements.company_id IS NULL
  );

DROP POLICY IF EXISTS "Admins can update announcements" ON public.announcements;
CREATE POLICY "Admins can update announcements"
  ON public.announcements FOR UPDATE
  USING (
    public.is_admin()
    AND public.announcements.company_id IS NULL
    AND public.announcements.created_by_role IN ('coordinator', 'admin')
  )
  WITH CHECK (
    public.is_admin()
    AND public.announcements.company_id IS NULL
    AND public.announcements.category = 'coordinator'
  );

DROP POLICY IF EXISTS "Admins can delete announcements" ON public.announcements;
CREATE POLICY "Admins can delete announcements"
  ON public.announcements FOR DELETE
  USING (
    public.is_admin()
    AND public.announcements.company_id IS NULL
    AND public.announcements.created_by_role IN ('coordinator', 'admin')
  );

-- ----------------------------------------------------------------------------
-- 6. Secured RPCs
-- ----------------------------------------------------------------------------

-- Single source of truth for "may the caller read this announcement". Mirrors
-- the SELECT policies above and is what the RPCs below authorize against, so a
-- client cannot reach another role's announcement by passing its id.
CREATE OR REPLACE FUNCTION public.announcement_visible_to_current_user(p_announcement_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role text;
  v_company uuid;
  v_row public.announcements%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT account_type, company_id INTO v_role, v_company
  FROM public.profiles
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_row FROM public.announcements WHERE id = p_announcement_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Managing roles see everything, drafts included.
  IF v_role IN ('coordinator', 'admin') THEN
    RETURN true;
  END IF;

  IF v_row.status <> 'published' THEN
    RETURN false;
  END IF;
  IF v_row.published_at IS NOT NULL AND v_row.published_at > now() THEN
    RETURN false;
  END IF;

  -- Company announcements never leave the company they belong to.
  IF v_row.company_id IS NOT NULL THEN
    RETURN v_role IN ('student', 'company')
       AND v_company IS NOT NULL
       AND v_row.company_id = v_company;
  END IF;

  RETURN COALESCE(v_row.target_audience, ARRAY['all']::text[]) && ARRAY['all', v_role]::text[];
END;
$$;

REVOKE ALL ON FUNCTION public.announcement_visible_to_current_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.announcement_visible_to_current_user(uuid) TO authenticated;

-- List every announcement the caller is authorized to see, newest first, with
-- the publisher's name and the caller's own read state attached.
DROP FUNCTION IF EXISTS public.get_my_announcements();
CREATE OR REPLACE FUNCTION public.get_my_announcements()
RETURNS TABLE (
  id uuid,
  company_id uuid,
  created_by uuid,
  created_by_role text,
  category text,
  type text,
  status text,
  priority text,
  target_audience text[],
  title text,
  content text,
  author text,
  attachment_url text,
  attachment_name text,
  created_at timestamptz,
  updated_at timestamptz,
  published_at timestamptz,
  company_name text,
  creator_name text,
  is_read boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role text;
  v_company uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT account_type, profiles.company_id INTO v_role, v_company
  FROM public.profiles
  WHERE auth_user_id = v_uid
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Authenticated user has no profile';
  END IF;

  RETURN QUERY
  SELECT
    a.id, a.company_id, a.created_by, a.created_by_role, a.category, a.type,
    a.status, a.priority, a.target_audience,
    a.title, a.content, a.author, a.attachment_url, a.attachment_name,
    a.created_at, a.updated_at, a.published_at,
    c.name AS company_name,
    COALESCE(
      NULLIF(trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
      a.author,
      'School Administration'
    ) AS creator_name,
    (r.id IS NOT NULL) AS is_read
  FROM public.announcements a
  LEFT JOIN public.companies c ON c.id = a.company_id
  LEFT JOIN public.profiles p ON p.auth_user_id = a.created_by
  LEFT JOIN public.announcement_reads r
         ON r.announcement_id = a.id AND r.user_id = v_uid
  WHERE
    CASE
      WHEN v_role IN ('coordinator', 'admin') THEN true
      WHEN a.status <> 'published' THEN false
      WHEN a.published_at IS NOT NULL AND a.published_at > now() THEN false
      WHEN a.company_id IS NOT NULL THEN
        v_role IN ('student', 'company') AND v_company IS NOT NULL AND a.company_id = v_company
      ELSE
        COALESCE(a.target_audience, ARRAY['all']::text[]) && ARRAY['all', v_role]::text[]
    END
  ORDER BY COALESCE(a.published_at, a.created_at) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_announcements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_announcements() TO authenticated;

-- Open one announcement. Used by the notification deep-link, so access is
-- re-verified here rather than trusted from the caller.
DROP FUNCTION IF EXISTS public.get_announcement_for_me(uuid);
CREATE OR REPLACE FUNCTION public.get_announcement_for_me(p_announcement_id uuid)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  created_by uuid,
  created_by_role text,
  category text,
  type text,
  status text,
  priority text,
  target_audience text[],
  title text,
  content text,
  author text,
  attachment_url text,
  attachment_name text,
  created_at timestamptz,
  updated_at timestamptz,
  published_at timestamptz,
  company_name text,
  creator_name text,
  is_read boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public.announcement_visible_to_current_user(p_announcement_id) THEN
    RAISE EXCEPTION 'Not authorized to view this announcement';
  END IF;

  RETURN QUERY
  SELECT
    a.id, a.company_id, a.created_by, a.created_by_role, a.category, a.type,
    a.status, a.priority, a.target_audience,
    a.title, a.content, a.author, a.attachment_url, a.attachment_name,
    a.created_at, a.updated_at, a.published_at,
    c.name AS company_name,
    COALESCE(
      NULLIF(trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
      a.author,
      'School Administration'
    ) AS creator_name,
    (r.id IS NOT NULL) AS is_read
  FROM public.announcements a
  LEFT JOIN public.companies c ON c.id = a.company_id
  LEFT JOIN public.profiles p ON p.auth_user_id = a.created_by
  LEFT JOIN public.announcement_reads r
         ON r.announcement_id = a.id AND r.user_id = v_uid
  WHERE a.id = p_announcement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_announcement_for_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_announcement_for_me(uuid) TO authenticated;

-- Mark an announcement read. Writes the read row AND clears the matching bell
-- notification, so the two views of "read" can never drift apart.
CREATE OR REPLACE FUNCTION public.mark_announcement_read(p_announcement_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.announcement_visible_to_current_user(p_announcement_id) THEN
    RAISE EXCEPTION 'Not authorized to view this announcement';
  END IF;

  INSERT INTO public.announcement_reads (announcement_id, user_id)
  VALUES (p_announcement_id, v_uid)
  ON CONFLICT (announcement_id, user_id) DO NOTHING;

  UPDATE public.user_notifications
     SET is_read = true
   WHERE user_id = v_uid
     AND source_type = 'announcement'
     AND source_id = p_announcement_id
     AND is_read = false;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_announcement_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_announcement_read(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Realtime — newly published announcements reach open dashboards without a
--    page refresh. RLS still applies to what each subscriber receives.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Bring the two older SECURITY DEFINER readers in line with targeting
--    Both predate target_audience, so they returned school-wide announcements
--    regardless of who they were addressed to. They now apply the same
--    audience / status / publication-date rules as the RLS policies above.
-- ----------------------------------------------------------------------------
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
     OR (
       a.company_id IS NULL
       AND a.created_by_role IN ('coordinator', 'admin')
       AND a.status = 'published'
       AND (a.published_at IS NULL OR a.published_at <= now())
       AND COALESCE(a.target_audience, ARRAY['all']::text[]) && ARRAY['all', 'company']::text[]
     )
  ORDER BY a.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_company_announcements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_announcements(uuid) TO authenticated;

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
BEGIN
  -- One shared visibility rule for every role, so a student cannot reach an
  -- announcement addressed to advisers by passing its id.
  IF NOT public.announcement_visible_to_current_user(p_announcement_id) THEN
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

REVOKE ALL ON FUNCTION public.get_student_announcement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_announcement(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. "Mark all as read" for the shared announcements header
--    Reuses get_my_announcements() as the single source of truth for what the
--    caller may see, so it can never mark an announcement the user is not
--    authorized to read.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_all_announcements_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_marked integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  WITH visible AS (
    SELECT a.id FROM public.get_my_announcements() a WHERE NOT a.is_read
  ), inserted AS (
    INSERT INTO public.announcement_reads (announcement_id, user_id)
    SELECT visible.id, v_uid FROM visible
    ON CONFLICT (announcement_id, user_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_marked FROM inserted;

  UPDATE public.user_notifications un
     SET is_read = true
   WHERE un.user_id = v_uid
     AND un.source_type = 'announcement'
     AND un.is_read = false
     AND EXISTS (
       SELECT 1 FROM public.announcement_reads r
       WHERE r.user_id = v_uid AND r.announcement_id = un.source_id
     );

  RETURN v_marked;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_announcements_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_announcements_read() TO authenticated;
