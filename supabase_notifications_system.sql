-- ==============================================================================
-- Notifications — centralized, real-time, role-aware
-- Run this once in the Supabase SQL Editor, after
-- supabase_notifications_schema.sql and supabase_adviser_announcements.sql.
--
-- Why this file exists
--   `public.user_notifications` had SELECT and UPDATE policies for the owner and
--   no INSERT policy at all. Every notification the application tried to create
--   from the client — adviser approvals, coordinator decisions, department
--   transfers, anti-cheat alerts — was rejected by RLS with 42501, and each call
--   site swallowed the error in a try/catch. The only rows that ever reached the
--   table came from the announcement trigger, which runs SECURITY DEFINER.
--
--   The fix is not to open the table for inserts: a blanket INSERT policy would
--   let any authenticated user write a notification into anyone's inbox. Writes
--   go through the SECURITY DEFINER routines below, which decide who a caller is
--   allowed to notify.
--
-- What it does
--   1. Extends `user_notifications` with the routing, read and email-delivery
--      columns the notification centre needs.
--   2. Adds `notification_preferences` (per user, RLS-protected).
--   3. Adds the metadata trigger: recipient role, read_at stamping, and keeping
--      the legacy source_* columns in sync with related_*.
--   4. Adds notify_users() / notify_roles() — the only supported way to create a
--      notification — plus the read/delete helpers the UI calls.
--   5. Teaches the announcement fan-out to emit typed, linkable notifications.
--   6. Adds notification_email_enabled(), which the notification-email Edge
--      Function consults before sending.
-- ==============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend user_notifications
--    `type` stays the visual severity (info/warning/success/danger) the existing
--    UI already renders. `notification_type` is the new routing category.
-- ----------------------------------------------------------------------------
ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS recipient_role TEXT,
  ADD COLUMN IF NOT EXISTS notification_type TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS related_type TEXT,
  ADD COLUMN IF NOT EXISTS related_id UUID,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_error TEXT,
  ADD COLUMN IF NOT EXISTS email_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE public.user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_notification_type_check;
ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_notification_type_check
  CHECK (notification_type IN (
    'announcement', 'journal_approved', 'journal_rejected', 'journal_revision',
    'attendance', 'assignment', 'company', 'system', 'reminder', 'general'
  ));

-- Backfill the rows that existed before this migration.
UPDATE public.user_notifications
   SET related_type = COALESCE(related_type, source_type),
       related_id   = COALESCE(related_id, source_id),
       notification_type = CASE
         WHEN source_type = 'announcement' THEN 'announcement'
         ELSE notification_type
       END,
       read_at = CASE WHEN is_read AND read_at IS NULL THEN created_at ELSE read_at END
 WHERE related_type IS NULL OR related_id IS NULL OR (is_read AND read_at IS NULL);

UPDATE public.user_notifications un
   SET recipient_role = p.account_type
  FROM public.profiles p
 WHERE p.auth_user_id = un.user_id
   AND un.recipient_role IS NULL;

-- Indexes for the queries the notification centre actually runs.
CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx
  ON public.user_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_notifications_user_unread_idx
  ON public.user_notifications (user_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS user_notifications_type_idx
  ON public.user_notifications (notification_type);
CREATE INDEX IF NOT EXISTS user_notifications_pending_email_idx
  ON public.user_notifications (created_at) WHERE email_sent = false;

-- ----------------------------------------------------------------------------
-- 2. Per-user preferences
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  email_announcements BOOLEAN NOT NULL DEFAULT true,
  email_journal BOOLEAN NOT NULL DEFAULT true,
  email_attendance BOOLEAN NOT NULL DEFAULT true,
  email_assignments BOOLEAN NOT NULL DEFAULT true,
  email_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_preferences TO authenticated;

DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can view own notification preferences"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can insert own notification preferences"
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can update own notification preferences"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.touch_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.user_id := OLD.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_notification_preferences_before_update ON public.notification_preferences;
CREATE TRIGGER touch_notification_preferences_before_update
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_notification_preferences();

-- ----------------------------------------------------------------------------
-- 3. Notification metadata
--    On insert: stamp the recipient's role and keep related_* and the legacy
--    source_* columns mirrored, so older readers and the new ones agree.
--    On update: stamp read_at exactly when is_read flips, which is what lets the
--    existing `.update({ is_read: true })` client code keep working unchanged.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_notification_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.related_type := COALESCE(NEW.related_type, NEW.source_type);
    NEW.related_id := COALESCE(NEW.related_id, NEW.source_id);
    NEW.source_type := COALESCE(NEW.source_type, NEW.related_type);
    NEW.source_id := COALESCE(NEW.source_id, NEW.related_id);
    NEW.notification_type := COALESCE(NEW.notification_type, 'general');

    IF NEW.recipient_role IS NULL THEN
      SELECT account_type INTO NEW.recipient_role
      FROM public.profiles WHERE auth_user_id = NEW.user_id LIMIT 1;
    END IF;

    IF NEW.is_read AND NEW.read_at IS NULL THEN
      NEW.read_at := now();
    END IF;

    RETURN NEW;
  END IF;

  -- A notification's owner and content are immutable; only its read state moves.
  NEW.user_id := OLD.user_id;
  NEW.created_at := OLD.created_at;

  IF NEW.is_read AND NOT OLD.is_read THEN
    NEW.read_at := now();
  ELSIF NOT NEW.is_read AND OLD.is_read THEN
    NEW.read_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_notification_metadata() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS set_notification_metadata_before_insert ON public.user_notifications;
CREATE TRIGGER set_notification_metadata_before_insert
  BEFORE INSERT ON public.user_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_notification_metadata();

DROP TRIGGER IF EXISTS set_notification_metadata_before_update ON public.user_notifications;
CREATE TRIGGER set_notification_metadata_before_update
  BEFORE UPDATE ON public.user_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_notification_metadata();

-- ----------------------------------------------------------------------------
-- 4. RLS — read, update and delete your own; never insert directly
-- ----------------------------------------------------------------------------
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.user_notifications;
CREATE POLICY "Users can view own notifications"
  ON public.user_notifications FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.user_notifications;
CREATE POLICY "Users can update own notifications"
  ON public.user_notifications FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.user_notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.user_notifications FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Deliberately no INSERT policy: notify_users() / notify_roles() are the only
-- supported writers, and they decide who may notify whom.

-- ----------------------------------------------------------------------------
-- 5. Notification creation
-- ----------------------------------------------------------------------------

-- May the caller put a notification in this recipient's inbox?
--   admin / coordinator / adviser  → anyone (they act on other people's records)
--   student / company              → only staff, and themselves
-- This blocks the realistic abuse — one student writing into another student's
-- inbox — without stopping a student's own actions from notifying their adviser.
CREATE OR REPLACE FUNCTION public.can_notify_user(p_actor_role text, p_recipient uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_recipient_role text;
BEGIN
  IF p_actor_role IN ('admin', 'coordinator', 'adviser') THEN
    RETURN true;
  END IF;

  IF p_recipient = auth.uid() THEN
    RETURN true;
  END IF;

  SELECT account_type INTO v_recipient_role
  FROM public.profiles WHERE auth_user_id = p_recipient LIMIT 1;

  RETURN v_recipient_role IN ('admin', 'coordinator', 'adviser');
END;
$$;

REVOKE ALL ON FUNCTION public.can_notify_user(text, uuid) FROM PUBLIC, anon, authenticated;

-- The single entry point for creating notifications.
CREATE OR REPLACE FUNCTION public.notify_users(
  p_user_ids uuid[],
  p_title text,
  p_message text,
  p_type text DEFAULT 'info',
  p_notification_type text DEFAULT 'general',
  p_related_type text DEFAULT NULL,
  p_related_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor_role text;
  v_created integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT account_type INTO v_actor_role
  FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Authenticated user has no profile';
  END IF;

  IF COALESCE(array_length(p_user_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  -- A single call is a reaction to one event, never a mailing list.
  IF array_length(p_user_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Too many recipients in one call';
  END IF;

  IF COALESCE(NULLIF(trim(p_title), ''), '') = '' THEN
    RAISE EXCEPTION 'A notification needs a title';
  END IF;

  WITH recipients AS (
    SELECT DISTINCT p.auth_user_id
    FROM public.profiles p
    WHERE p.auth_user_id = ANY (p_user_ids)
      AND p.auth_user_id IS NOT NULL
      AND public.can_notify_user(v_actor_role, p.auth_user_id)
  ), inserted AS (
    INSERT INTO public.user_notifications (
      user_id, title, message, type, is_read,
      notification_type, related_type, related_id, created_by
    )
    SELECT
      recipients.auth_user_id,
      left(p_title, 200),
      p_message,
      COALESCE(NULLIF(p_type, ''), 'info'),
      false,
      COALESCE(NULLIF(p_notification_type, ''), 'general'),
      p_related_type,
      p_related_id,
      auth.uid()
    FROM recipients
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_created FROM inserted;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_users(uuid[], text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_users(uuid[], text, text, text, text, text, uuid) TO authenticated;

-- Notify everyone holding one of the given roles. Staff only — this is how an
-- event reaches "all coordinators" or "all admins" without the caller having to
-- enumerate them (and without the client ever seeing the list).
CREATE OR REPLACE FUNCTION public.notify_roles(
  p_roles text[],
  p_title text,
  p_message text,
  p_type text DEFAULT 'info',
  p_notification_type text DEFAULT 'general',
  p_related_type text DEFAULT NULL,
  p_related_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor_role text;
  v_created integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT account_type INTO v_actor_role
  FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Authenticated user has no profile';
  END IF;

  -- Anyone may escalate to staff; only staff may broadcast to everyone else.
  IF NOT (p_roles <@ ARRAY['admin', 'coordinator', 'adviser']::text[])
     AND v_actor_role NOT IN ('admin', 'coordinator', 'adviser') THEN
    RAISE EXCEPTION 'Not authorized to notify these roles';
  END IF;

  WITH recipients AS (
    SELECT DISTINCT p.auth_user_id
    FROM public.profiles p
    WHERE p.account_type = ANY (p_roles)
      AND p.auth_user_id IS NOT NULL
      AND p.auth_user_id <> auth.uid()
      AND (p_department_id IS NULL OR p.department_id = p_department_id)
  ), inserted AS (
    INSERT INTO public.user_notifications (
      user_id, title, message, type, is_read,
      notification_type, related_type, related_id, created_by
    )
    SELECT
      recipients.auth_user_id,
      left(p_title, 200),
      p_message,
      COALESCE(NULLIF(p_type, ''), 'info'),
      false,
      COALESCE(NULLIF(p_notification_type, ''), 'general'),
      p_related_type,
      p_related_id,
      auth.uid()
    FROM recipients
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_created FROM inserted;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_roles(text[], text, text, text, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_roles(text[], text, text, text, text, text, uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Read-state helpers
--    Single-row reads/unreads go through the RLS UPDATE policy from the client;
--    these cover the bulk operations and the badge count.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
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

  WITH updated AS (
    UPDATE public.user_notifications
       SET is_read = true, read_at = now()
     WHERE user_id = v_uid AND is_read = false
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_marked FROM updated;

  RETURN v_marked;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_notification_counts()
RETURNS TABLE (total bigint, unread bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT count(*), count(*) FILTER (WHERE NOT is_read)
  FROM public.user_notifications
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_notification_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_notification_counts() TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Email gating
--    Consulted by the notification-email Edge Function before it sends. A user
--    with no preferences row gets the defaults (everything on).
--    `system` is treated as critical: it ignores the category toggles, but still
--    respects the master email switch.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_email_enabled(p_user_id uuid, p_notification_type text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_prefs public.notification_preferences%ROWTYPE;
BEGIN
  SELECT * INTO v_prefs FROM public.notification_preferences WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF NOT v_prefs.email_enabled THEN
    RETURN false;
  END IF;

  RETURN CASE p_notification_type
    WHEN 'announcement' THEN v_prefs.email_announcements
    WHEN 'journal_approved' THEN v_prefs.email_journal
    WHEN 'journal_rejected' THEN v_prefs.email_journal
    WHEN 'journal_revision' THEN v_prefs.email_journal
    WHEN 'attendance' THEN v_prefs.email_attendance
    WHEN 'assignment' THEN v_prefs.email_assignments
    WHEN 'company' THEN v_prefs.email_assignments
    WHEN 'system' THEN true
    ELSE v_prefs.email_system
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_email_enabled(uuid, text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. Announcement fan-out — typed and linkable
--    Same targeting rules as before; the notifications it writes now carry the
--    category and the announcement id, so the notification centre can route a
--    click to the right announcement.
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
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;
  IF NEW.published_at IS NOT NULL AND NEW.published_at > now() THEN
    RETURN NEW;
  END IF;
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

    INSERT INTO public.user_notifications (
      user_id, title, message, type, is_read,
      notification_type, related_type, related_id, created_by
    )
    SELECT
      p.auth_user_id,
      '📢 New Company Announcement',
      NEW.title || E'\n\n' || COALESCE(v_company_name, 'Your company') || ' posted a new announcement.',
      v_type,
      false,
      'announcement',
      'announcement',
      NEW.id,
      NEW.created_by
    FROM public.profiles AS p
    WHERE p.auth_user_id IS NOT NULL
      AND p.account_type = 'student'
      AND p.company_id = NEW.company_id
      AND NOT EXISTS (
        SELECT 1 FROM public.user_notifications un
        WHERE un.related_type = 'announcement'
          AND un.related_id = NEW.id
          AND un.user_id = p.auth_user_id
      );
  ELSE
    INSERT INTO public.user_notifications (
      user_id, title, message, type, is_read,
      notification_type, related_type, related_id, created_by
    )
    SELECT
      p.auth_user_id,
      NEW.title,
      NEW.content,
      v_type,
      false,
      'announcement',
      'announcement',
      NEW.id,
      NEW.created_by
    FROM public.profiles AS p
    WHERE p.auth_user_id IS NOT NULL
      AND p.auth_user_id IS DISTINCT FROM NEW.created_by
      AND v_audience && ARRAY['all', p.account_type]::text[]
      AND NOT EXISTS (
        SELECT 1 FROM public.user_notifications un
        WHERE un.related_type = 'announcement'
          AND un.related_id = NEW.id
          AND un.user_id = p.auth_user_id
      );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_announcement_notifications() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. Realtime
--    Subscribers filter on user_id and RLS restricts what they may read, so a
--    client only ever receives its own rows.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. Remove the stray webhook on user_notifications
--     A leftover trigger posted every new notification to the unrelated
--     `corbado-auth` Edge Function, which answered 400 every time, and carried a
--     service_role JWT inline in its own definition. With notifications actually
--     being created it would fire constantly. The trigger goes; the function
--     itself is left deployed and untouched.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS "public.user_notifications" ON public.user_notifications;
