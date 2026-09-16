-- ============================================================================
-- Fix user deletion blocked by foreign keys.
--
-- admin_delete_user (and coordinator_delete_student) only cleaned up a handful
-- of tables, but a user is referenced by ~60 foreign keys. Most are ON DELETE
-- CASCADE or SET NULL and clear themselves; a few were ON DELETE NO ACTION /
-- RESTRICT and blocked the delete, e.g.
--   "update or delete on table users violates foreign key constraint
--    company_attendance_recorded_by_fkey on table company_attendance".
--
-- Two kinds of blockers, handled two ways:
--
--  1. "who did this" actor columns — recorded_by / updated_by / uploader_id /
--     reviewed_by / actioned_by / evaluator_id. All nullable, and the right
--     semantics on deleting that person is to keep the record and forget the
--     actor. These FKs are switched to ON DELETE SET NULL, matching the many
--     actor FKs that already behave that way (audit_logs.user_id,
--     approved_by, student_documents.reviewed_by, ...). This makes deletion
--     durable: a future NO ACTION actor FK is the only thing that could
--     reintroduce the problem.
--
--  2. grading ownership — grading_sheets.adviser_id and
--     grading_sheet_items.student_id are NOT NULL and RESTRICT on purpose, to
--     protect official grade records from stray deletes. They stay RESTRICT;
--     the delete functions remove the departing user's own grading rows
--     explicitly, as part of a deliberate account deletion. Deleting a sheet
--     cascades to its items (grading_sheet_id is ON DELETE CASCADE).
--
-- Supersedes admin_delete_user from supabase_admin_privilege_hardening.sql and
-- coordinator_delete_student from supabase_open_function_lockdown.sql. Safe to
-- re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Actor FKs -> ON DELETE SET NULL
-- ---------------------------------------------------------------------------
ALTER TABLE public.company_attendance DROP CONSTRAINT IF EXISTS company_attendance_recorded_by_fkey;
ALTER TABLE public.company_attendance ADD CONSTRAINT company_attendance_recorded_by_fkey
  FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.company_attendance DROP CONSTRAINT IF EXISTS company_attendance_updated_by_fkey;
ALTER TABLE public.company_attendance ADD CONSTRAINT company_attendance_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.company_documents DROP CONSTRAINT IF EXISTS company_documents_uploader_id_fkey;
ALTER TABLE public.company_documents ADD CONSTRAINT company_documents_uploader_id_fkey
  FOREIGN KEY (uploader_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.daily_journals DROP CONSTRAINT IF EXISTS daily_journals_reviewed_by_fkey;
ALTER TABLE public.daily_journals ADD CONSTRAINT daily_journals_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.department_change_requests DROP CONSTRAINT IF EXISTS department_change_requests_actioned_by_fkey;
ALTER TABLE public.department_change_requests ADD CONSTRAINT department_change_requests_actioned_by_fkey
  FOREIGN KEY (actioned_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.evaluations DROP CONSTRAINT IF EXISTS evaluations_evaluator_id_fkey;
ALTER TABLE public.evaluations ADD CONSTRAINT evaluations_evaluator_id_fkey
  FOREIGN KEY (evaluator_id) REFERENCES auth.users(id) ON DELETE SET NULL;


-- ---------------------------------------------------------------------------
-- 2. admin_delete_user — grading cleanup added; guards unchanged
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.profiles%ROWTYPE;
  v_name   text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.admin_privilege_guard'));

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: Only active administrators can perform this action.' USING ERRCODE = '42501';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'SELF_ACTION_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE auth_user_id = target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_target.account_type = 'admin'
     AND v_target.is_active IS TRUE
     AND v_target.registration_status = 'complete'
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.account_type = 'admin' AND p.is_active IS TRUE
         AND p.registration_status = 'complete'
         AND p.auth_user_id <> target_user_id
     )
  THEN
    RAISE EXCEPTION 'LAST_ADMIN' USING ERRCODE = '42501';
  END IF;

  -- Audit first: the row names the actor, so the audit_logs nulling below
  -- leaves it intact.
  v_name := coalesce(nullif(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), ''), v_target.email);
  PERFORM public.write_privileged_audit_log(
    'DELETE', 'User Management',
    format('Deleted account for %s', coalesce(v_name, target_user_id::text)),
    target_user_id, v_name,
    jsonb_build_object('account_type', v_target.account_type, 'email', v_target.email),
    NULL
  );

  -- Grading rows are NOT NULL + RESTRICT, so clear the ones this user owns
  -- before the profile / auth row is removed. Deleting a sheet cascades to its
  -- items; a student's own items are removed directly.
  DELETE FROM public.grading_sheet_items WHERE student_id = v_target.id;
  DELETE FROM public.grading_sheets      WHERE adviser_id = target_user_id;

  -- Owned rows (these FKs are CASCADE/SET NULL, but the explicit deletes keep
  -- the cleanup obvious and order-independent).
  DELETE FROM public.messages           WHERE sender_id = target_user_id OR receiver_id = target_user_id;
  DELETE FROM public.user_notifications WHERE user_id = target_user_id;
  DELETE FROM public.feedback           WHERE user_id = target_user_id;
  DELETE FROM public.student_documents  WHERE user_id = target_user_id;
  DELETE FROM public.daily_journals     WHERE user_id = target_user_id;
  DELETE FROM public.timesheets         WHERE user_id = target_user_id;
  DELETE FROM public.company_requests   WHERE requested_by = target_user_id;

  UPDATE public.audit_logs SET user_id = NULL WHERE user_id = target_user_id;

  -- Profile first, then the auth user. Remaining actor FKs are now SET NULL /
  -- CASCADE, so this no longer blocks.
  DELETE FROM public.profiles WHERE auth_user_id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. coordinator_delete_student — same grading cleanup for the student path
-- ---------------------------------------------------------------------------
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

  -- Student's grade items are NOT NULL + RESTRICT on profiles.id.
  DELETE FROM public.grading_sheet_items WHERE student_id = v_target.id;

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

NOTIFY pgrst, 'reload schema';
