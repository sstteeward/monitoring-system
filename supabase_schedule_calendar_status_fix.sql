-- Run this entire file once in Supabase SQL Editor.
-- OAuth tokens remain in private.google_calendar_connections. This public table
-- stores only non-sensitive connection metadata for the company dashboard.

CREATE TABLE IF NOT EXISTS public.company_google_calendar_status (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  calendar_id text NOT NULL DEFAULT 'primary',
  calendar_name text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_google_calendar_status ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_google_calendar_status TO service_role;

-- No browser policy is created: the dashboard gets this through the authorized
-- get_company_calendar_integration() RPC below.

CREATE OR REPLACE FUNCTION public.service_upsert_google_calendar_connection(
  p_company_id uuid,
  p_calendar_id text,
  p_calendar_name text,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_created_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO private.google_calendar_connections (
    company_id, calendar_id, calendar_name, access_token, refresh_token,
    expires_at, created_by, updated_at
  ) VALUES (
    p_company_id, p_calendar_id, p_calendar_name, p_access_token,
    p_refresh_token, p_expires_at, p_created_by, now()
  )
  ON CONFLICT (company_id) DO UPDATE SET
    calendar_id = EXCLUDED.calendar_id,
    calendar_name = EXCLUDED.calendar_name,
    access_token = EXCLUDED.access_token,
    refresh_token = EXCLUDED.refresh_token,
    expires_at = EXCLUDED.expires_at,
    created_by = EXCLUDED.created_by,
    updated_at = now();

  INSERT INTO public.company_google_calendar_status (
    company_id, calendar_id, calendar_name, connected_at, updated_at
  ) VALUES (
    p_company_id, p_calendar_id, p_calendar_name, now(), now()
  )
  ON CONFLICT (company_id) DO UPDATE SET
    calendar_id = EXCLUDED.calendar_id,
    calendar_name = EXCLUDED.calendar_name,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.service_delete_google_calendar_connection(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM private.google_calendar_connections WHERE company_id = p_company_id;
  DELETE FROM public.company_google_calendar_status WHERE company_id = p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_company_calendar_integration()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_connection public.company_google_calendar_status%ROWTYPE;
  v_settings public.company_calendar_settings%ROWTYPE;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE auth_user_id = auth.uid() AND account_type = 'company';

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
    'connected', v_connection.company_id IS NOT NULL,
    'calendar_id', v_connection.calendar_id,
    'calendar_name', v_connection.calendar_name,
    'automatic_sync', COALESCE(v_settings.automatic_sync, true),
    'cancel_behavior', COALESCE(v_settings.cancel_behavior, 'mark_cancelled'),
    'last_synced_at', v_connection.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.service_upsert_google_calendar_connection(uuid,text,text,text,text,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_delete_google_calendar_connection(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_company_calendar_integration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_upsert_google_calendar_connection(uuid,text,text,text,text,timestamptz,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_delete_google_calendar_connection(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_company_calendar_integration() TO authenticated;
