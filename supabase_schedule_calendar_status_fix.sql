-- Run once in Supabase SQL Editor. It makes the browser-facing status RPC
-- explicitly derive the connection from the same private table used by OAuth.
CREATE OR REPLACE FUNCTION public.get_company_calendar_integration()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_connection private.google_calendar_connections%ROWTYPE;
  v_settings public.company_calendar_settings%ROWTYPE;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE auth_user_id = auth.uid() AND account_type = 'company';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to view calendar integration';
  END IF;

  SELECT * INTO v_connection
  FROM private.google_calendar_connections
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

REVOKE ALL ON FUNCTION public.get_company_calendar_integration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_calendar_integration() TO authenticated;
