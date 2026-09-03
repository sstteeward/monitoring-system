-- Run this entire file once in Supabase SQL Editor.
--
-- Google Calendar connection persistence + real two-way synchronisation.
--
-- What this fixes
--   1. The connection card had no way to show which Google account is linked,
--      when the calendar last synced, or that a refresh token went stale, so a
--      still-valid connection could not be told apart from a broken one.
--   2. schedules had no unique key on (company_id, google_event_id), so a
--      repeated import could insert duplicates, and the Edge Function's
--      maybeSingle() lookup would then start failing outright.
--   3. Imported Google events were indistinguishable from schedules created in
--      the SIL system, so the push half of the sync echoed Google's own events
--      back to Google on every run.
--
-- OAuth tokens stay in private.google_calendar_connections, which is not
-- exposed through PostgREST. This file only adds non-sensitive sync metadata to
-- the public status table that the dashboard reads.

-- ── 1. Sync metadata on the public status table ──────────────────────────────
ALTER TABLE public.company_google_calendar_status
  ADD COLUMN IF NOT EXISTS google_account_email text,
  ADD COLUMN IF NOT EXISTS calendar_time_zone   text NOT NULL DEFAULT 'Asia/Manila',
  ADD COLUMN IF NOT EXISTS last_synced_at       timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_stats      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sync_state           text  NOT NULL DEFAULT 'connected';

DO $$
BEGIN
  ALTER TABLE public.company_google_calendar_status
    ADD CONSTRAINT company_google_calendar_status_sync_state_check
    CHECK (sync_state IN ('connected', 'needs_reconnect'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The incremental sync cursor is stored beside the tokens, never exposed to the
-- browser: a syncToken is a capability to read the calendar's change feed.
ALTER TABLE private.google_calendar_connections
  ADD COLUMN IF NOT EXISTS sync_token text;

-- ── 2. Stop duplicate schedules from repeated imports ────────────────────────
-- Collapse any duplicates that already exist, keeping the oldest row.
WITH ranked AS (
  SELECT id, row_number() OVER (
           PARTITION BY company_id, google_event_id ORDER BY created_at, id
         ) AS rn
  FROM public.schedules
  WHERE google_event_id IS NOT NULL AND company_id IS NOT NULL
)
DELETE FROM public.schedules s USING ranked r
WHERE s.id = r.id AND r.rn > 1;

-- Deliberately NOT a partial index. Postgres treats NULLs as distinct, so
-- locally authored schedules (google_event_id IS NULL) are unaffected, and a
-- plain index is inferrable by ON CONFLICT (company_id, google_event_id) --
-- which a WHERE-qualified partial index is not.
CREATE UNIQUE INDEX IF NOT EXISTS schedules_company_google_event_idx
  ON public.schedules (company_id, google_event_id);

-- ── 3. Tell locally authored schedules apart from imported Google events ─────
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'local';

DO $$
BEGIN
  ALTER TABLE public.schedules
    ADD CONSTRAINT schedules_source_check CHECK (source IN ('local', 'google'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Rows that already carry a Google event id but predate this column were
-- created by the old importer.
UPDATE public.schedules
SET source = 'google'
WHERE google_event_id IS NOT NULL AND source = 'local'
  AND NOT EXISTS (SELECT 1 FROM public.schedule_students ss WHERE ss.schedule_id = schedules.id);

-- ── 4. Service-role token store accessors ────────────────────────────────────
-- Adds the Google account/timezone/sync-state fields. The sync token is
-- deliberately preserved across token refreshes: refreshing an access token
-- does not invalidate the calendar change cursor.
CREATE OR REPLACE FUNCTION public.service_upsert_google_calendar_connection(
  p_company_id uuid,
  p_calendar_id text,
  p_calendar_name text,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_created_by uuid,
  p_google_account_email text DEFAULT NULL,
  p_calendar_time_zone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_refresh_token text;
BEGIN
  -- Google only returns a refresh token when the user grants consent; a plain
  -- access-token refresh omits it. The stored token has to be carried forward
  -- BEFORE the insert: refresh_token is NOT NULL, and Postgres checks the
  -- proposed row against that constraint before ON CONFLICT can resolve, so
  -- coalescing in the DO UPDATE clause would fail on every refresh.
  SELECT refresh_token INTO v_refresh_token
  FROM private.google_calendar_connections
  WHERE company_id = p_company_id;

  v_refresh_token := COALESCE(p_refresh_token, v_refresh_token);
  IF v_refresh_token IS NULL THEN
    RAISE EXCEPTION 'A Google refresh token is required to store a calendar connection';
  END IF;

  INSERT INTO private.google_calendar_connections (
    company_id, calendar_id, calendar_name, access_token, refresh_token,
    expires_at, created_by, updated_at
  ) VALUES (
    p_company_id, p_calendar_id, p_calendar_name, p_access_token,
    v_refresh_token, p_expires_at, p_created_by, now()
  )
  ON CONFLICT (company_id) DO UPDATE SET
    calendar_id   = EXCLUDED.calendar_id,
    calendar_name = EXCLUDED.calendar_name,
    access_token  = EXCLUDED.access_token,
    refresh_token = EXCLUDED.refresh_token,
    expires_at    = EXCLUDED.expires_at,
    created_by    = EXCLUDED.created_by,
    updated_at    = now();

  INSERT INTO public.company_google_calendar_status (
    company_id, calendar_id, calendar_name, google_account_email,
    calendar_time_zone, connected_at, updated_at, sync_state
  ) VALUES (
    p_company_id, p_calendar_id, p_calendar_name, p_google_account_email,
    COALESCE(p_calendar_time_zone, 'Asia/Manila'), now(), now(), 'connected'
  )
  ON CONFLICT (company_id) DO UPDATE SET
    calendar_id          = EXCLUDED.calendar_id,
    calendar_name        = EXCLUDED.calendar_name,
    google_account_email = COALESCE(EXCLUDED.google_account_email, public.company_google_calendar_status.google_account_email),
    calendar_time_zone   = COALESCE(EXCLUDED.calendar_time_zone, public.company_google_calendar_status.calendar_time_zone),
    sync_state           = 'connected',
    updated_at           = now();
END;
$$;

-- Records the outcome of a sync run: the incremental cursor stays private, the
-- human-readable statistics go to the dashboard table.
CREATE OR REPLACE FUNCTION public.service_record_calendar_sync(
  p_company_id uuid,
  p_sync_token text,
  p_stats jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE private.google_calendar_connections
  SET sync_token = COALESCE(p_sync_token, sync_token), updated_at = now()
  WHERE company_id = p_company_id;

  UPDATE public.company_google_calendar_status
  SET last_synced_at   = now(),
      last_sync_stats  = COALESCE(p_stats, '{}'::jsonb),
      sync_state       = 'connected',
      updated_at       = now()
  WHERE company_id = p_company_id;
END;
$$;

-- A refresh token that Google has revoked cannot be recovered. The connection
-- row is kept (so the UI can explain what happened) but flagged for reconnect.
CREATE OR REPLACE FUNCTION public.service_mark_calendar_needs_reconnect(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.company_google_calendar_status
  SET sync_state = 'needs_reconnect', updated_at = now()
  WHERE company_id = p_company_id;

  UPDATE public.schedules
  SET calendar_sync_status = 'failed'
  WHERE company_id = p_company_id AND calendar_sync_status = 'synced';
END;
$$;

-- Clearing the cursor forces the next run to do a full windowed sync.
CREATE OR REPLACE FUNCTION public.service_clear_calendar_sync_token(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE private.google_calendar_connections
  SET sync_token = NULL, updated_at = now()
  WHERE company_id = p_company_id;
END;
$$;

-- ── 5. What the dashboard reads ──────────────────────────────────────────────
-- Scoped to the caller's own company through profiles; a company can never read
-- another company's connection because the company id is never taken from the
-- request.
CREATE OR REPLACE FUNCTION public.get_company_calendar_integration()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_connection public.company_google_calendar_status%ROWTYPE;
  v_settings   public.company_calendar_settings%ROWTYPE;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE auth_user_id = auth.uid() AND account_type = 'company'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to view calendar integration';
  END IF;

  SELECT * INTO v_connection
  FROM public.company_google_calendar_status
  WHERE company_id = v_company_id;

  SELECT * INTO v_settings
  FROM public.company_calendar_settings
  WHERE company_id = v_company_id;

  RETURN jsonb_build_object(
    'connected',            v_connection.company_id IS NOT NULL,
    'needs_reconnect',      COALESCE(v_connection.sync_state, 'connected') = 'needs_reconnect',
    'calendar_id',          v_connection.calendar_id,
    'calendar_name',        v_connection.calendar_name,
    'google_account_email', v_connection.google_account_email,
    'calendar_time_zone',   COALESCE(v_connection.calendar_time_zone, 'Asia/Manila'),
    'connected_at',         v_connection.connected_at,
    'last_synced_at',       v_connection.last_synced_at,
    'last_sync_stats',      COALESCE(v_connection.last_sync_stats, '{}'::jsonb),
    'automatic_sync',       COALESCE(v_settings.automatic_sync, true),
    'cancel_behavior',      COALESCE(v_settings.cancel_behavior, 'mark_cancelled')
  );
END;
$$;

-- ── 6. Expose the origin of each schedule to the dashboard ───────────────────
-- Same projection as before plus 'source', so Schedule Management can label
-- imported events and avoid offering to push them back to Google.
CREATE OR REPLACE FUNCTION public.get_company_schedules() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'company_id',s.company_id,'student_id',s.student_id,'name',s.name,'shift_type',s.shift_type,'working_days',s.working_days,'start_time',s.start_time,'end_time',s.end_time,'break_start',s.break_start,'break_end',s.break_end,'break_duration_minutes',s.break_duration_minutes,'start_date',s.start_date,'end_date',s.end_date,'location',s.location,'supervisor_name',s.supervisor_name,'notes',s.notes,'recurrence',s.recurrence,'status',s.status,'calendar_sync_status',s.calendar_sync_status,'google_event_id',s.google_event_id,'source',s.source,'created_at',s.created_at,'updated_at',s.updated_at,'assigned_students',COALESCE(a.students,'[]'::jsonb)) ORDER BY s.start_date DESC NULLS LAST,s.created_at DESC),'[]'::jsonb) FROM public.schedules s CROSS JOIN LATERAL (SELECT p.company_id FROM public.profiles p WHERE p.auth_user_id=auth.uid() AND p.account_type='company') actor LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('student_id',p.auth_user_id,'first_name',p.first_name,'last_name',p.last_name,'email',p.email,'course',p.course,'department',p.department) ORDER BY p.first_name,p.last_name) students FROM public.schedule_students ss JOIN public.profiles p ON p.auth_user_id=ss.student_id WHERE ss.schedule_id=s.id) a ON true WHERE s.company_id=actor.company_id;
$$;

-- ── 7. Grants ────────────────────────────────────────────────────────────────
-- The old 7-argument upsert is replaced by the 9-argument version above; drop
-- it so callers cannot bind the stale signature.
DROP FUNCTION IF EXISTS public.service_upsert_google_calendar_connection(uuid,text,text,text,text,timestamptz,uuid);

-- SECURITY: this project has
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS
--     TO anon, authenticated, service_role;
-- so every new function in `public` is granted to anon and authenticated as a
-- DIRECT role grant. "REVOKE ... FROM PUBLIC" does not remove a direct grant,
-- which is why the earlier calendar SQL files left the whole token store
-- reachable from the browser with only the publishable anon key --
-- service_get_google_calendar_connection(company_id) returns the row including
-- access_token and refresh_token, for any company id the caller cares to send.
-- The revokes below must name anon and authenticated explicitly.
REVOKE ALL ON FUNCTION public.service_upsert_google_calendar_connection(uuid,text,text,text,text,timestamptz,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_record_calendar_sync(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_mark_calendar_needs_reconnect(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_clear_calendar_sync_token(uuid) FROM PUBLIC, anon, authenticated;
-- Pre-existing functions from supabase_schedule_calendar_connection_rpc.sql are
-- exposed the same way; close them here too.
REVOKE ALL ON FUNCTION public.service_get_google_calendar_connection(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_delete_google_calendar_connection(uuid) FROM PUBLIC, anon, authenticated;
-- The dashboard RPC stays available to signed-in users (it derives the company
-- from auth.uid() and refuses anyone else) but never to anonymous callers.
REVOKE ALL ON FUNCTION public.get_company_calendar_integration() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.service_upsert_google_calendar_connection(uuid,text,text,text,text,timestamptz,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_record_calendar_sync(uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_mark_calendar_needs_reconnect(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_clear_calendar_sync_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_get_google_calendar_connection(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_delete_google_calendar_connection(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_company_calendar_integration() TO authenticated;
