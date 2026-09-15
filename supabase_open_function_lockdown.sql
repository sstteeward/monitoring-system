-- ============================================================================
-- Close the remaining open surfaces: the login-lock DoS, anon-callable
-- SECURITY DEFINER RPCs, and server-side enforcement of can_delete_students.
--
-- Follows supabase_admin_privilege_hardening.sql and supabase_admin_rpc_hardening.sql.
-- Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- 1. LOGIN LOCK (increment_failed_login / reset_failed_login)
-- ---------------------------------------------------------------------------
-- Both took an arbitrary email and ran as the browser, so anyone could call
--   rpc('increment_failed_login', {user_email: 'victim'})  -> lock any account
--   rpc('reset_failed_login',     {user_email: 'anyone'})  -> clear any lock
-- The counting also never proved a real attempt happened, so as brute-force
-- protection it was illusory (a real attacker hitting the API directly never
-- calls increment on themselves) while handing anyone an account-lockout DoS.
--
-- The password-verification Auth hook — the only way to count failures on the
-- server, tied to the actual password check — is Teams/Enterprise only, so it
-- is not available on this project. The fix therefore:
--   * revokes both email-keyed functions from anon and authenticated, so the
--     browser can no longer touch either account's lock state;
--   * adds reset_my_failed_login(), which clears ONLY the caller's own counter
--     (auth.uid()), for the post-login reset the app still wants;
--   * leaves brute-force protection to Supabase Auth's built-in per-IP rate
--     limiting on the sign-in endpoint, and manual admin_unlock_user_account.
-- The functions themselves are kept (not dropped) for any server/cron use, now
-- with a pinned search_path.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.increment_failed_login(text) SET search_path = public;
ALTER FUNCTION public.reset_failed_login(text) SET search_path = public;

REVOKE ALL ON FUNCTION public.increment_failed_login(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_failed_login(text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reset_my_failed_login()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET failed_login_attempts = 0, locked_until = NULL
  WHERE auth_user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.reset_my_failed_login() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reset_my_failed_login() TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. ANON-CALLABLE SECURITY DEFINER FUNCTIONS
-- ---------------------------------------------------------------------------
-- These act on behalf of a signed-in user (via auth.uid()) or a company/
-- coordinator role, and none are referenced by an RLS policy, so anon has no
-- legitimate reason to reach them. Revoke anon; authenticated keeps access and
-- each function still checks the caller.
--
-- Deliberately NOT revoked from anon (kept exactly as they are):
--   is_admin, is_admin_or_coordinator, is_coordinator, is_adviser,
--   get_user_company_id, get_user_department_id
--       -> evaluated inside {public} RLS policies; anon queries that hit those
--          policies need EXECUTE, or the whole query errors.
--   is_email_registered, server_now_ms
--       -> called during signup BEFORE the visitor authenticates.
-- ---------------------------------------------------------------------------
-- Revoke from PUBLIC as well as anon: several of these were granted EXECUTE to
-- the PUBLIC pseudo-role, so `REVOKE ... FROM anon` alone leaves anon's
-- inherited access in place. Re-grant authenticated so signed-in users keep it.
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.assert_signup_email_available()',
    'public.get_adviser_assigned_section_names(uuid)',
    'public.increment_device_seen_count(uuid, text)',
    'public.upsert_journal(date, text, text, text[])',
    'public.record_attendance(uuid, date, text, text, text)',
    'public.get_company_attendance(date)',
    'public.get_student_attendance_stats(uuid)',
    'public.get_company_schedules()',
    'public.save_company_schedule(uuid, text, date, date, time without time zone, time without time zone, integer, text, text, text, text, text[], uuid[])',
    'public.delete_company_schedule(uuid)',
    'public.get_company_schedule_audit(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', fn);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.coordinator_assign_adviser_section(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.coordinator_remove_adviser_section(uuid) FROM anon;

-- Trigger / event-trigger functions must never be callable directly. Triggers
-- fire regardless of EXECUTE grants, so revoking every API role changes nothing
-- about the triggers themselves.
REVOKE ALL ON FUNCTION public.handle_auth_user_insert() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_dept_change_approval() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_profile_to_institution() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM public, anon, authenticated;

-- Pin search_path on the ones that still lacked it (advisor 0011). Bodies
-- unchanged. The two coordinator RPCs also get an active-role check via the
-- helper (they previously accepted any coordinator/admin, ignoring is_active).
ALTER FUNCTION public.get_adviser_assigned_section_names(uuid) SET search_path = public;
ALTER FUNCTION public.get_user_company_id() SET search_path = public;
ALTER FUNCTION public.get_user_department_id() SET search_path = public;
ALTER FUNCTION public.is_adviser() SET search_path = public;
ALTER FUNCTION public.increment_device_seen_count(uuid, text) SET search_path = public;
ALTER FUNCTION public.upsert_journal(date, text, text, text[]) SET search_path = public;
ALTER FUNCTION public.handle_auth_user_insert() SET search_path = public, auth;
ALTER FUNCTION public.handle_dept_change_approval() SET search_path = public;
ALTER FUNCTION public.link_profile_to_institution() SET search_path = public;

CREATE OR REPLACE FUNCTION public.coordinator_assign_adviser_section(p_adviser_id uuid, p_section_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_coordinator() THEN
    RAISE EXCEPTION 'Unauthorized: Only active coordinators or admins can assign advisers to sections.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.adviser_sections (adviser_id, section_id, assigned_by, status, assigned_at)
  VALUES (p_adviser_id, p_section_id, auth.uid(), 'active', now())
  ON CONFLICT (section_id)
  DO UPDATE SET
    adviser_id = EXCLUDED.adviser_id,
    assigned_by = EXCLUDED.assigned_by,
    status = 'active',
    assigned_at = now();

  RETURN jsonb_build_object('success', true, 'section_id', p_section_id, 'adviser_id', p_adviser_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.coordinator_remove_adviser_section(p_section_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_coordinator() THEN
    RAISE EXCEPTION 'Unauthorized: Only active coordinators or admins can remove adviser section assignments.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.adviser_sections WHERE section_id = p_section_id;

  RETURN jsonb_build_object('success', true, 'section_id', p_section_id);
END;
$$;

REVOKE ALL ON FUNCTION public.coordinator_assign_adviser_section(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.coordinator_remove_adviser_section(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.coordinator_assign_adviser_section(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordinator_remove_adviser_section(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. can_delete_students enforced in the database
-- ---------------------------------------------------------------------------
-- There is no DELETE policy on public.profiles, so a coordinator's direct
-- `.delete()` already fails RLS silently — coordinatorService.deleteStudent
-- only ever had a client-side permission check in front of a write that RLS
-- refused. This RPC makes the deletion actually work AND enforces the
-- permission on the server: an active coordinator with can_delete_students, or
-- any admin, and only for a student row. Cleanup mirrors admin_delete_user.
-- can_export_reports is intentionally not addressed here: it gates no server
-- action (exports are built in the browser from data RLS already permits), and
-- it is not enforced client-side either. See the report.
CREATE OR REPLACE FUNCTION public.coordinator_delete_student(p_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.profiles%ROWTYPE;
  v_can_delete boolean;
BEGIN
  IF public.is_admin() THEN
    v_can_delete := true;
  ELSIF public.is_coordinator() THEN
    SELECT coalesce((permissions->>'can_delete_students')::boolean, false)
      INTO v_can_delete
    FROM public.profiles WHERE auth_user_id = auth.uid();
  ELSE
    v_can_delete := false;
  END IF;

  IF NOT coalesce(v_can_delete, false) THEN
    RAISE EXCEPTION 'NO_DELETE_PERMISSION: You do not have permission to delete students.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_student_id OR auth_user_id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.account_type <> 'student' THEN
    RAISE EXCEPTION 'TARGET_NOT_STUDENT: Only student accounts can be removed here.' USING ERRCODE = '42501';
  END IF;

  PERFORM public.write_privileged_audit_log(
    'DELETE', 'Students',
    format('Deleted student %s', coalesce(nullif(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), ''), v_target.email, v_target.auth_user_id::text)),
    v_target.auth_user_id,
    coalesce(nullif(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), ''), v_target.email),
    jsonb_build_object('account_type', v_target.account_type, 'email', v_target.email),
    NULL
  );

  DELETE FROM public.messages           WHERE sender_id = v_target.auth_user_id OR receiver_id = v_target.auth_user_id;
  DELETE FROM public.user_notifications WHERE user_id = v_target.auth_user_id;
  DELETE FROM public.feedback           WHERE user_id = v_target.auth_user_id;
  DELETE FROM public.student_documents  WHERE user_id = v_target.auth_user_id;
  DELETE FROM public.daily_journals     WHERE user_id = v_target.auth_user_id;
  DELETE FROM public.timesheets         WHERE user_id = v_target.auth_user_id;
  DELETE FROM public.company_requests   WHERE requested_by = v_target.auth_user_id;
  UPDATE public.audit_logs SET user_id = NULL WHERE user_id = v_target.auth_user_id;
  DELETE FROM public.profiles WHERE auth_user_id = v_target.auth_user_id;
  DELETE FROM auth.users WHERE id = v_target.auth_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.coordinator_delete_student(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.coordinator_delete_student(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
