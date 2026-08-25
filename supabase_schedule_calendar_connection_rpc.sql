-- The private schema is deliberately not exposed through PostgREST. These
-- service-role-only functions give the Edge Function a narrow, audited route
-- to the OAuth token store without exposing tokens to any browser role.
CREATE OR REPLACE FUNCTION public.service_get_google_calendar_connection(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_jsonb(c)
  FROM private.google_calendar_connections c
  WHERE c.company_id = p_company_id;
$$;

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
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO private.google_calendar_connections(
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
$$;

CREATE OR REPLACE FUNCTION public.service_delete_google_calendar_connection(p_company_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM private.google_calendar_connections WHERE company_id = p_company_id;
$$;

REVOKE ALL ON FUNCTION public.service_get_google_calendar_connection(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_upsert_google_calendar_connection(uuid,text,text,text,text,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_delete_google_calendar_connection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_get_google_calendar_connection(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_upsert_google_calendar_connection(uuid,text,text,text,text,timestamptz,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_delete_google_calendar_connection(uuid) TO service_role;
