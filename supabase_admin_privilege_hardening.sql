-- ============================================================================
-- Account privilege hardening: only the server decides who holds authority.
--
-- Admin authority in this system is "a public.profiles row with
-- account_type = 'admin'". Before this file, several paths let people who are
-- not administrators create that state, or rewrite other account-state columns
-- they should never control. This file closes them before any new admin power
-- (force sign-out, suspension, forced reset) is added, because more admin power
-- only raises the payoff for abusing them.
--
-- Supersedes the definitions in supabase_global_email_uniqueness.sql,
-- supabase_coordinator_rls.sql, supabase_company_attendance.sql (helpers),
-- supabase_adviser_schema.sql / supabase_adviser_sections_fix.sql (approval
-- RPCs, adviser UPDATE policy), supabase_admin_roles_rpc.sql,
-- fix_admin_functions.sql and supabase_delete_user_rpc.sql. Those files stay as
-- history; do not re-run them after this one.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS OPEN
-- ---------------------------------------------------------------------------
--   G1  complete_signup_registration accepted 'admin', active immediately.
--   G2  handle_new_user copied signup metadata straight into account_type, so
--       any OTP signup could arrive as an admin row.
--   G3  "Users can update own profile" had no column restriction: anyone could
--       set their own is_active, approval_status, permissions, lock state,
--       registration_status, or (as a company user) company_id.
--   G4  Coordinators could update every row (including admins), advisers could
--       rewrite their students' roles, and the approval RPCs never checked that
--       the target was a student.
--   G5  is_admin / is_coordinator / is_admin_or_coordinator ignored is_active,
--       so a deactivated or unapproved coordinator kept full database access.
--   G6  The admin RPCs had free-text roles, no self or last-admin guard, no
--       search_path, no explicit grants, and the browser wrote (or skipped) the
--       audit row. Any signed-in user could insert audit rows naming someone
--       else as the actor.
--
-- ---------------------------------------------------------------------------
-- HOW THE PRIVILEGED-COLUMN TRIGGER TELLS "BROWSER" FROM "SERVER"
-- ---------------------------------------------------------------------------
-- A write made directly through PostgREST runs with current_user =
-- 'authenticated' (or 'anon'). The same write inside a SECURITY DEFINER
-- function runs as the function owner, and the service role runs as
-- 'service_role'. A SECURITY INVOKER trigger therefore sees exactly who is
-- writing. Verified against this project on 2026-09-15 in a rolled-back probe:
-- direct update -> [authenticated], same update via a DEFINER function ->
-- [postgres]. Every live function that writes profiles is SECURITY DEFINER
-- (including increment_failed_login / reset_failed_login), so none are blocked.
--
-- ---------------------------------------------------------------------------
-- WHO CAN MAKE AN ADMIN NOW
-- ---------------------------------------------------------------------------
-- Only an existing, active administrator (admin_update_user_role, which refuses
-- self-changes and targets that have not finished registering), or the SQL
-- editor. No signup path, metadata value, or direct API call can produce one.
--
-- ---------------------------------------------------------------------------
-- WHY BROWSER INSERTS ARE COERCED RATHER THAN REFUSED
-- ---------------------------------------------------------------------------
-- BEFORE INSERT fires before ON CONFLICT is resolved. Raising there would break
-- the upsert fallbacks in AdviserOnboardingView, CoordinatorOnboardingView and
-- coordinatorService.createAdviserAccount even when they only re-send unchanged
-- values. Coercing is safe because handle_new_user always creates the profile
-- row when the auth user is created, so in practice every client insert ends as
-- a conflict UPDATE, where the UPDATE branch of the same trigger applies the
-- full "no privileged change" rule to whatever the upsert tries to set.
--
-- ---------------------------------------------------------------------------
-- TRIGGER ORDER ON public.profiles (BEFORE triggers fire in name order)
-- ---------------------------------------------------------------------------
--   on_profiles_updated                     sets updated_at only
--   profiles_email_rules                    email / email_domain only
--   profiles_privileged_columns             (this file) privileged columns only
--   profiles_student_age_requirement_check  reads account_type, writes nothing
-- None of them writes a column another one checks, so the order does not change
-- any outcome. The age check runs last and sees the coerced account_type.
--
-- Safe to re-run. Does not modify or delete any account.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Role helpers require an active, finished account (G5)
--    is_adviser() is deliberately unchanged: coordinator-created advisers never
--    call complete_signup_registration, so registration_status would lock them
--    out. It already requires is_active = true.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_user_id = auth.uid()
          AND account_type = 'admin'
          AND is_active IS TRUE
          AND registration_status = 'complete'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_user_id = auth.uid()
          AND account_type = 'coordinator'
          AND is_active IS TRUE
          AND registration_status = 'complete'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_coordinator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_user_id = auth.uid()
          AND account_type IN ('admin', 'coordinator')
          AND is_active IS TRUE
          AND registration_status = 'complete'
    );
$$;


-- ---------------------------------------------------------------------------
-- 2. No self-provisioned admins (G1, G2)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_signup_registration(
  p_account_type text,
  p_first_name   text,
  p_middle_name  text,
  p_last_name    text
)
RETURNS TABLE (account_type text, registration_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_is_active boolean;
  v_already_complete boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- 'admin' is not a portal anyone can register into. Administrators are made
  -- by an existing administrator or the SQL editor.
  IF p_account_type IS NULL OR p_account_type NOT IN
     ('student', 'coordinator', 'company', 'adviser') THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT_TYPE';
  END IF;

  SELECT public.normalize_email(u.email) INTO v_email
  FROM auth.users u WHERE u.id = v_uid;

  -- Lock this profile row, then decide. Two concurrent submissions serialize
  -- here, so only the first can complete the registration.
  SELECT (pr.registration_status = 'complete')
    INTO v_already_complete
  FROM public.profiles pr
  WHERE pr.auth_user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  IF v_already_complete THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_REGISTERED' USING ERRCODE = '23505';
  END IF;

  -- Coordinators wait for an administrator before their account goes live.
  v_is_active := (p_account_type <> 'coordinator');

  RETURN QUERY
  UPDATE public.profiles p SET
    email                     = coalesce(v_email, p.email),
    first_name                = nullif(btrim(coalesce(p_first_name, '')), ''),
    middle_name               = nullif(btrim(coalesce(p_middle_name, '')), ''),
    last_name                 = nullif(btrim(coalesce(p_last_name, '')), ''),
    account_type              = p_account_type,
    is_active                 = v_is_active,
    registration_status       = 'complete',
    registration_completed_at = now()
  WHERE p.auth_user_id = v_uid
  RETURNING p.account_type, p.registration_status;
END;
$$;

-- Two AFTER INSERT triggers run on auth.users (`auth_user_created` inserts the
-- bare row, `on_auth_user_created` fills in the signup metadata), so this one
-- has to upsert rather than plain-insert. It never touches registration_status
-- or is_active, so a new row keeps the pending default.
-- Signup metadata is caller-controlled: only a non-admin portal name is
-- accepted; anything else lands as 'student'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_email text := public.normalize_email(new.email);
  v_meta_type text := new.raw_user_meta_data->>'account_type';
  v_account_type text := CASE
    WHEN v_meta_type IS NULL THEN NULL
    WHEN v_meta_type IN ('student', 'adviser', 'coordinator', 'company') THEN v_meta_type
    ELSE 'student'
  END;
BEGIN
  INSERT INTO public.profiles (
    auth_user_id, email, email_domain, first_name, middle_name, last_name,
    suffix, account_type, required_ojt_hours, grade, absences
  )
  VALUES (
    new.id,
    v_email,
    split_part(coalesce(v_email, ''), '@', 2),
    (new.raw_user_meta_data->>'first_name'),
    (new.raw_user_meta_data->>'middle_name'),
    (new.raw_user_meta_data->>'last_name'),
    (new.raw_user_meta_data->>'suffix'),
    coalesce(v_account_type, 'student'),
    500, null, 0
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    email        = excluded.email,
    email_domain = excluded.email_domain,
    first_name   = coalesce(excluded.first_name, public.profiles.first_name),
    middle_name  = coalesce(excluded.middle_name, public.profiles.middle_name),
    last_name    = coalesce(excluded.last_name, public.profiles.last_name),
    suffix       = coalesce(excluded.suffix, public.profiles.suffix),
    account_type = coalesce(v_account_type, public.profiles.account_type);

  RETURN new;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. Privileged profile columns are server-only (G3, G4)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- Trusted paths (SECURITY DEFINER functions, service role, SQL editor) are
  -- unrestricted. Only direct API writes are checked.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Never create elevated state; see the header for why this coerces.
    IF NEW.account_type IS NULL
       OR NEW.account_type NOT IN ('student', 'adviser', 'coordinator', 'company') THEN
      NEW.account_type := 'student';
    END IF;
    IF NEW.account_type = 'coordinator' THEN
      NEW.is_active := false;
    END IF;
    IF NEW.account_type = 'company' THEN
      NEW.company_id := NULL;
    END IF;
    NEW.approval_status           := NULL;
    NEW.approved_by               := NULL;
    NEW.approved_at               := NULL;
    NEW.adviser_remarks           := NULL;
    NEW.locked_until              := NULL;
    NEW.failed_login_attempts     := 0;
    -- Keep in lockstep with the profiles.permissions column default.
    NEW.permissions               := '{"can_edit_grades": false, "can_export_reports": false, "can_delete_students": false, "can_approve_journals": true}'::jsonb;
    NEW.registration_status       := 'pending_verification';
    NEW.registration_completed_at := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: re-sending an unchanged value is fine (onboarding re-sends
  -- account_type); changing any privileged column is not.
  IF NEW.account_type              IS DISTINCT FROM OLD.account_type
     OR NEW.is_active              IS DISTINCT FROM OLD.is_active
     OR NEW.approval_status        IS DISTINCT FROM OLD.approval_status
     OR NEW.approved_by            IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at            IS DISTINCT FROM OLD.approved_at
     OR NEW.adviser_remarks        IS DISTINCT FROM OLD.adviser_remarks
     OR NEW.permissions            IS DISTINCT FROM OLD.permissions
     OR NEW.failed_login_attempts  IS DISTINCT FROM OLD.failed_login_attempts
     OR NEW.locked_until           IS DISTINCT FROM OLD.locked_until
     OR NEW.registration_status    IS DISTINCT FROM OLD.registration_status
     OR NEW.registration_completed_at IS DISTINCT FROM OLD.registration_completed_at
     OR NEW.auth_user_id           IS DISTINCT FROM OLD.auth_user_id
     -- A company account's company_id scopes what it can read. A student's own
     -- company_id stays self-service (attachApprovedCompanyIfNeeded, onboarding).
     OR ((OLD.account_type = 'company' OR NEW.account_type = 'company')
         AND NEW.company_id IS DISTINCT FROM OLD.company_id)
  THEN
    RAISE EXCEPTION 'PRIVILEGED_FIELD_CHANGE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_privileged_columns ON public.profiles;
CREATE TRIGGER profiles_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- Rules (a) and (b) are unchanged. The old rule (c) — "a finished account
-- cannot rewrite its own account_type unless it is an admin" — is removed: the
-- trigger above refuses every direct account_type change, for every caller and
-- every registration state, and each server path that changes a role already
-- refuses to act on the caller's own row.
CREATE OR REPLACE FUNCTION public.enforce_profile_email_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  -- (a) Always store the canonical form.
  NEW.email := public.normalize_email(NEW.email);
  IF NEW.email IS NOT NULL THEN
    NEW.email_domain := split_part(NEW.email, '@', 2);
  END IF;

  -- (b) One email, one account — across every portal.
  IF NEW.email IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.email IS DISTINCT FROM public.normalize_email(OLD.email))
     AND EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE public.normalize_email(p.email) = NEW.email
         AND p.auth_user_id <> NEW.auth_user_id
     )
  THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_REGISTERED' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_email_rules ON public.profiles;
CREATE TRIGGER profiles_email_rules
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_email_rules();

-- Own row. Same USING; WITH CHECK now explicit (it previously fell back to the
-- identical USING). Semantics: equal.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- Coordinators: their own row, students and advisers only. Semantics: stricter
-- (was every row, including admins, coordinators and companies).
DROP POLICY IF EXISTS "Coordinators can update profiles" ON public.profiles;
CREATE POLICY "Coordinators can update profiles"
  ON public.profiles
  FOR UPDATE
  USING (
    public.is_coordinator()
    AND (auth_user_id = auth.uid() OR account_type IN ('student', 'adviser'))
  )
  WITH CHECK (
    public.is_coordinator()
    AND (auth_user_id = auth.uid() OR account_type IN ('student', 'adviser'))
  );

-- Advisers: canonical-section logic kept exactly from
-- supabase_adviser_sections_fix.sql; WITH CHECK now equals USING, so an updated
-- row must still be a student in the adviser's sections. Semantics: equal.
DROP POLICY IF EXISTS "Advisers can update assigned section students" ON public.profiles;
CREATE POLICY "Advisers can update assigned section students"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (
        public.is_adviser()
        AND (
            auth_user_id = auth.uid()
            OR (
                account_type = 'student'
                AND public.canonical_section_name(section, course, year_level) IN (
                    SELECT upper(btrim(section_name))
                    FROM public.get_adviser_assigned_section_names()
                )
            )
        )
    )
    WITH CHECK (
        public.is_adviser()
        AND (
            auth_user_id = auth.uid()
            OR (
                account_type = 'student'
                AND public.canonical_section_name(section, course, year_level) IN (
                    SELECT upper(btrim(section_name))
                    FROM public.get_adviser_assigned_section_names()
                )
            )
        )
    );


-- ---------------------------------------------------------------------------
-- 4. Audit rows name the real actor (G6)
-- ---------------------------------------------------------------------------
-- Browser inserts: whatever user_id / user_name / user_role the client sent is
-- replaced with the signed-in caller. Inserts from DEFINER functions run as the
-- owner and are left alone (they set the actor themselves, from auth.uid()).
CREATE OR REPLACE FUNCTION public.stamp_audit_log_actor()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_role text;
BEGIN
  IF current_user <> 'authenticated' OR v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email),
         p.account_type
    INTO v_name, v_role
  FROM public.profiles p
  WHERE p.auth_user_id = v_uid;

  NEW.user_id   := v_uid;
  NEW.user_name := coalesce(v_name, 'Unknown');
  NEW.user_role := coalesce(v_role, 'unknown');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_stamp_actor ON public.audit_logs;
CREATE TRIGGER audit_logs_stamp_actor
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_audit_log_actor();

-- Server-side audit writer for the RPCs below. Mirrors adminService.logAction's
-- row shape. SECURITY INVOKER and not executable by any API role: it only works
-- when called from inside a trusted function.
CREATE OR REPLACE FUNCTION public.write_privileged_audit_log(
  p_action      text,
  p_module      text,
  p_description text,
  p_target_id   uuid,
  p_target_name text,
  p_old_values  jsonb,
  p_new_values  jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_role text;
BEGIN
  SELECT coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email),
         p.account_type
    INTO v_name, v_role
  FROM public.profiles p
  WHERE p.auth_user_id = v_uid;

  INSERT INTO public.audit_logs (
    user_id, user_name, user_role, action, module, description,
    table_name, record_id, target_type, target_id, target_name,
    old_values, new_values, status
  )
  VALUES (
    v_uid, coalesce(v_name, 'Unknown'), coalesce(v_role, 'unknown'),
    p_action, p_module, p_description,
    'profiles', p_target_id::text, 'profiles', p_target_id::text, p_target_name,
    p_old_values, p_new_values, 'success'
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 5. Adviser approval RPCs (G4)
--    Same signatures and return shape. Callers must hold an ACTIVE role, the
--    target must be a student, and an adviser's reach uses the same canonical
--    section match as the adviser RLS policy. (The old plain `s.name = section`
--    match refused 13 of the 16 live adviser/student pairs the policy allows.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adviser_approve_student(p_student_id uuid, p_remarks text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_is_valid boolean;
BEGIN
  -- Admins and coordinators can always approve
  v_caller_is_valid := public.is_admin() OR public.is_coordinator();

  IF NOT v_caller_is_valid AND public.is_adviser() THEN
    -- Check if student belongs to caller's assigned sections
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = p_student_id OR p.auth_user_id = p_student_id)
        AND p.account_type = 'student'
        AND public.canonical_section_name(p.section, p.course, p.year_level) IN (
          SELECT upper(btrim(s.section_name))
          FROM public.get_adviser_assigned_section_names() s
        )
    ) INTO v_caller_is_valid;
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
  WHERE (id = p_student_id OR auth_user_id = p_student_id)
    AND account_type = 'student';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('success', true, 'student_id', p_student_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.adviser_reject_student(p_student_id uuid, p_status text, p_remarks text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_is_valid boolean;
BEGIN
  IF p_status NOT IN ('rejected', 'correction_requested') THEN
    RAISE EXCEPTION 'Invalid status. Must be rejected or correction_requested.';
  END IF;

  v_caller_is_valid := public.is_admin() OR public.is_coordinator();

  IF NOT v_caller_is_valid AND public.is_adviser() THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = p_student_id OR p.auth_user_id = p_student_id)
        AND p.account_type = 'student'
        AND public.canonical_section_name(p.section, p.course, p.year_level) IN (
          SELECT upper(btrim(s.section_name))
          FROM public.get_adviser_assigned_section_names() s
        )
    ) INTO v_caller_is_valid;
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
  WHERE (id = p_student_id OR auth_user_id = p_student_id)
    AND account_type = 'student';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('success', true, 'student_id', p_student_id, 'status', p_status);
END;
$$;


-- ---------------------------------------------------------------------------
-- 6. Coordinator RPCs that replace direct privileged writes (G4)
-- ---------------------------------------------------------------------------
-- Replaces the direct profile write in coordinatorService.approveCompanyAccountRequest.
-- Only a company-account application can turn its applicant into a company
-- account, and never an administrator or coordinator.
CREATE OR REPLACE FUNCTION public.coordinator_approve_company_account(p_request_id uuid, p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.company_requests%ROWTYPE;
  v_target  public.profiles%ROWTYPE;
  v_name    text;
BEGIN
  IF NOT (public.is_coordinator() OR public.is_admin()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: Only active coordinators or administrators can approve company accounts.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request FROM public.company_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.request_type IS DISTINCT FROM 'company_account' THEN
    RAISE EXCEPTION 'INVALID_REQUEST_TYPE' USING ERRCODE = '22023';
  END IF;
  IF v_request.requested_by IS NULL THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = p_company_id) THEN
    RAISE EXCEPTION 'COMPANY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_target FROM public.profiles
  WHERE auth_user_id = v_request.requested_by
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.account_type IN ('admin', 'coordinator') THEN
    RAISE EXCEPTION 'TARGET_ROLE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET company_id = p_company_id, account_type = 'company', is_active = true
  WHERE auth_user_id = v_request.requested_by;

  v_name := coalesce(nullif(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), ''), v_target.email);
  PERFORM public.write_privileged_audit_log(
    'APPROVE', 'User Management',
    format('Approved company account for %s', coalesce(v_name, v_request.requested_by::text)),
    v_request.requested_by, v_name,
    jsonb_build_object('account_type', v_target.account_type, 'is_active', v_target.is_active, 'company_id', v_target.company_id),
    jsonb_build_object('account_type', 'company', 'is_active', true, 'company_id', p_company_id, 'request_id', p_request_id)
  );
END;
$$;

-- Replaces the direct is_active write in coordinatorService.setAdviserStatus.
CREATE OR REPLACE FUNCTION public.coordinator_set_adviser_status(p_adviser_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.profiles%ROWTYPE;
  v_name   text;
BEGIN
  IF NOT (public.is_coordinator() OR public.is_admin()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: Only active coordinators or administrators can change adviser status.' USING ERRCODE = '42501';
  END IF;
  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE auth_user_id = p_adviser_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.account_type IS DISTINCT FROM 'adviser' THEN
    RAISE EXCEPTION 'TARGET_ROLE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles SET is_active = p_is_active WHERE auth_user_id = p_adviser_id;

  v_name := coalesce(nullif(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), ''), v_target.email);
  PERFORM public.write_privileged_audit_log(
    'STATUS_CHANGE', 'User Management',
    format('%s adviser account: %s', CASE WHEN p_is_active THEN 'Activated' ELSE 'Deactivated' END, coalesce(v_name, p_adviser_id::text)),
    p_adviser_id, v_name,
    jsonb_build_object('is_active', v_target.is_active),
    jsonb_build_object('is_active', p_is_active)
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 7. Admin RPCs (G6)
--    Names and parameter lists unchanged. The role-, status- and delete-changing
--    ones take one transaction-scoped advisory lock first, so two administrators
--    acting on each other at the same moment cannot both pass the last-admin
--    check. is_admin() is evaluated after the lock, on a fresh snapshot.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_user_role(target_user_id uuid, new_role text)
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
  IF new_role IS NULL OR new_role NOT IN ('student', 'adviser', 'coordinator', 'company', 'admin') THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT_TYPE' USING ERRCODE = '22023';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'SELF_ACTION_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE auth_user_id = target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF new_role = 'admin' AND v_target.registration_status IS DISTINCT FROM 'complete' THEN
    RAISE EXCEPTION 'TARGET_REGISTRATION_INCOMPLETE' USING ERRCODE = '42501';
  END IF;

  IF new_role <> 'admin'
     AND v_target.account_type = 'admin'
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

  -- A company link only means something on a company account.
  UPDATE public.profiles
  SET account_type = new_role,
      company_id   = CASE WHEN new_role = 'company' THEN company_id ELSE NULL END
  WHERE auth_user_id = target_user_id;

  v_name := coalesce(nullif(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), ''), v_target.email);
  PERFORM public.write_privileged_audit_log(
    'ROLE_CHANGE', 'Role Permissions',
    format('Changed role for %s from %s to %s', coalesce(v_name, target_user_id::text), coalesce(v_target.account_type, 'none'), new_role),
    target_user_id, v_name,
    jsonb_build_object('account_type', v_target.account_type, 'company_id', v_target.company_id),
    jsonb_build_object('account_type', new_role, 'company_id', CASE WHEN new_role = 'company' THEN v_target.company_id ELSE NULL END)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_status(target_user_id uuid, new_status boolean)
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
  IF new_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = '22023';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'SELF_ACTION_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE auth_user_id = target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF new_status IS NOT TRUE
     AND v_target.account_type = 'admin'
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

  UPDATE public.profiles SET is_active = new_status WHERE auth_user_id = target_user_id;

  v_name := coalesce(nullif(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), ''), v_target.email);
  PERFORM public.write_privileged_audit_log(
    'STATUS_CHANGE', 'User Management',
    format('%s account for %s', CASE WHEN new_status THEN 'Activated' ELSE 'Deactivated' END, coalesce(v_name, target_user_id::text)),
    target_user_id, v_name,
    jsonb_build_object('is_active', v_target.is_active),
    jsonb_build_object('is_active', new_status)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_permissions(target_user_id uuid, new_permissions jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.profiles%ROWTYPE;
  v_name   text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: Only active administrators can perform this action.' USING ERRCODE = '42501';
  END IF;

  IF new_permissions IS NULL
     OR jsonb_typeof(new_permissions) <> 'object'
     OR EXISTS (
       SELECT 1 FROM jsonb_each(new_permissions) e
       WHERE e.key NOT IN ('can_approve_journals', 'can_export_reports', 'can_delete_students', 'can_edit_grades')
          OR jsonb_typeof(e.value) <> 'boolean'
     )
  THEN
    RAISE EXCEPTION 'INVALID_PERMISSIONS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE auth_user_id = target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles SET permissions = new_permissions WHERE auth_user_id = target_user_id;

  v_name := coalesce(nullif(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), ''), v_target.email);
  PERFORM public.write_privileged_audit_log(
    'PERMISSION_CHANGE', 'Role Permissions',
    format('Updated permissions for %s', coalesce(v_name, target_user_id::text)),
    target_user_id, v_name,
    jsonb_build_object('permissions', v_target.permissions),
    jsonb_build_object('permissions', new_permissions)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unlock_user_account(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.profiles%ROWTYPE;
  v_name   text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: Only active administrators can perform this action.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE auth_user_id = target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles SET failed_login_attempts = 0, locked_until = NULL WHERE auth_user_id = target_user_id;

  v_name := coalesce(nullif(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), ''), v_target.email);
  PERFORM public.write_privileged_audit_log(
    'STATUS_CHANGE', 'User Management',
    format('Unlocked account for %s', coalesce(v_name, target_user_id::text)),
    target_user_id, v_name,
    jsonb_build_object('failed_login_attempts', v_target.failed_login_attempts, 'locked_until', v_target.locked_until),
    jsonb_build_object('failed_login_attempts', 0, 'locked_until', NULL)
  );
END;
$$;

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

  -- 1. Check if the calling user is an active admin
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

  -- 2. Audit first: the row names the actor, so step 4 below leaves it intact.
  v_name := coalesce(nullif(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), ''), v_target.email);
  PERFORM public.write_privileged_audit_log(
    'DELETE', 'User Management',
    format('Deleted account for %s', coalesce(v_name, target_user_id::text)),
    target_user_id, v_name,
    jsonb_build_object('account_type', v_target.account_type, 'email', v_target.email),
    NULL
  );

  -- 3. Explicitly delete from ALL related tables
  DELETE FROM public.messages       WHERE sender_id = target_user_id OR receiver_id = target_user_id;
  DELETE FROM public.user_notifications WHERE user_id = target_user_id;
  DELETE FROM public.feedback       WHERE user_id = target_user_id;
  DELETE FROM public.student_documents WHERE user_id = target_user_id;
  DELETE FROM public.daily_journals WHERE user_id = target_user_id;
  DELETE FROM public.timesheets     WHERE user_id = target_user_id;
  DELETE FROM public.company_requests WHERE requested_by = target_user_id;

  -- 4. Nullify audit logs (keep the log, remove the user reference)
  UPDATE public.audit_logs SET user_id = NULL WHERE user_id = target_user_id;

  -- 5. Delete from profiles
  DELETE FROM public.profiles WHERE auth_user_id = target_user_id;

  -- 6. Finally, delete the auth user
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- Replaces adminService.setUserCompany's direct write. There is no admin UPDATE
-- policy on profiles, so that write silently matched zero rows before.
CREATE OR REPLACE FUNCTION public.admin_set_user_company(target_user_id uuid, p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.profiles%ROWTYPE;
  v_name   text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED: Only active administrators can perform this action.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE auth_user_id = target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF p_company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = p_company_id) THEN
    RAISE EXCEPTION 'COMPANY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles SET company_id = p_company_id WHERE auth_user_id = target_user_id;

  v_name := coalesce(nullif(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), ''), v_target.email);
  PERFORM public.write_privileged_audit_log(
    'UPDATE', 'User Management',
    format('Set company for %s', coalesce(v_name, target_user_id::text)),
    target_user_id, v_name,
    jsonb_build_object('company_id', v_target.company_id),
    jsonb_build_object('company_id', p_company_id)
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 8. Security alerts: the no-argument overload had no authorization at all and
--    was executable by anon. Both overloads now require an active admin or
--    coordinator. Return shapes and bodies are otherwise unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_security_alerts()
RETURNS TABLE(id uuid, user_id uuid, action text, table_name text, record_id uuid, details jsonb, ip_address text, device_fingerprint text, created_at timestamp with time zone, latitude double precision, longitude double precision, accuracy double precision, distance_from_geofence double precision, location_address text, map_url text, profile_first_name text, profile_last_name text, profile_email text, profile_account_type text, profile_department_id uuid, profile_company_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin_or_coordinator() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT
        al.id,
        al.user_id,
        al.action,
        al.table_name,
        al.record_id,
        al.details,
        al.ip_address,
        al.device_fingerprint,
        al.created_at,
        al.latitude,
        al.longitude,
        al.accuracy,
        al.distance_from_geofence,
        al.location_address,
        al.map_url,
        p.first_name AS profile_first_name,
        p.last_name AS profile_last_name,
        p.email AS profile_email,
        p.account_type AS profile_account_type,
        p.department_id AS profile_department_id,
        p.company_id AS profile_company_id
    FROM
        public.audit_logs al
    LEFT JOIN
        public.profiles p ON al.user_id = p.auth_user_id
    WHERE
        al.action = 'anti_cheat_flag'
    ORDER BY
        al.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_security_alerts(p_department_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, user_id uuid, action text, table_name text, record_id uuid, details jsonb, ip_address text, created_at timestamp with time zone, latitude numeric, longitude numeric, accuracy double precision, distance_from_geofence double precision, location_address text, map_url text, profile_first_name text, profile_last_name text, profile_email text, profile_account_type text, profile_department_id uuid, profile_company_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Basic authorization: must be an active admin or coordinator
    IF NOT public.is_admin_or_coordinator() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT
        a.id,
        a.user_id,
        a.action,
        a.table_name,
        a.record_id,
        a.details,
        a.ip_address,
        a.created_at,
        a.latitude,
        a.longitude,
        a.accuracy,
        a.distance_from_geofence,
        a.location_address,
        a.map_url,
        p.first_name AS profile_first_name,
        p.last_name AS profile_last_name,
        p.email AS profile_email,
        p.account_type AS profile_account_type,
        p.department_id AS profile_department_id,
        p.company_id AS profile_company_id
    FROM public.audit_logs a
    LEFT JOIN public.profiles p ON a.user_id = p.auth_user_id
    WHERE a.action IN ('anti_cheat_flag', 'successful_clock_in', 'successful_clock_out')
    ORDER BY a.created_at DESC
    LIMIT 200;
END;
$$;


-- ---------------------------------------------------------------------------
-- 9. Policies that repeated the role check inline now use the helpers (G5)
--    Each keeps its name, command, roles and every other condition; only the
--    inline `account_type = ...` lookup becomes a helper call. Because the
--    helpers now also require an active, finished account, every one of these
--    is equal-or-stricter.
--
--    Deliberately NOT touched (not a plain helper swap):
--      dtr_records "Coordinators can read all DTR" compares profiles.id to
--        auth.uid(); a helper would WIDEN it. Reported, left as is.
--      announcements "Company can view their announcements" /
--        "Students can view their announcements" only mention 'admin' /
--        'coordinator' as data values, not as a caller role check.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Coordinators and Admins can manage adviser_sections" ON public.adviser_sections;
CREATE POLICY "Coordinators and Admins can manage adviser_sections" ON public.adviser_sections
  FOR ALL TO authenticated
  USING (public.is_admin_or_coordinator())
  WITH CHECK (public.is_admin_or_coordinator());

DROP POLICY IF EXISTS "Coordinators and Admins can view announcements" ON public.announcements;
CREATE POLICY "Coordinators and Admins can view announcements" ON public.announcements
  FOR SELECT
  USING (public.is_admin_or_coordinator());

-- Advisers keep read access; is_adviser() also requires an active account.
DROP POLICY IF EXISTS "Staff read limit alerts" ON public.attendance_limit_alerts;
CREATE POLICY "Staff read limit alerts" ON public.attendance_limit_alerts
  FOR SELECT TO authenticated
  USING (public.is_admin_or_coordinator() OR public.is_adviser());

DROP POLICY IF EXISTS "Admins can read audit logs" ON public.audit_logs;
CREATE POLICY "Admins can read audit logs" ON public.audit_logs
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Coordinators can read anti-cheat audit logs" ON public.audit_logs;
CREATE POLICY "Coordinators can read anti-cheat audit logs" ON public.audit_logs
  FOR SELECT
  USING (action = 'anti_cheat_flag' AND public.is_coordinator());

DROP POLICY IF EXISTS "Coordinators can read anti-cheat logs" ON public.audit_logs;
CREATE POLICY "Coordinators can read anti-cheat logs" ON public.audit_logs
  FOR SELECT
  USING (public.is_coordinator() AND action = 'anti_cheat_flag');

DROP POLICY IF EXISTS "Coordinators and Admins can delete companies" ON public.companies;
CREATE POLICY "Coordinators and Admins can delete companies" ON public.companies
  FOR DELETE
  USING (public.is_admin_or_coordinator());

DROP POLICY IF EXISTS "Coordinators and Admins can insert companies" ON public.companies;
CREATE POLICY "Coordinators and Admins can insert companies" ON public.companies
  FOR INSERT
  WITH CHECK (public.is_admin_or_coordinator());

DROP POLICY IF EXISTS "Coordinators and Admins can update companies" ON public.companies;
CREATE POLICY "Coordinators and Admins can update companies" ON public.companies
  FOR UPDATE
  USING (public.is_admin_or_coordinator());

DROP POLICY IF EXISTS "Coordinators and Admins can update company requests" ON public.company_requests;
CREATE POLICY "Coordinators and Admins can update company requests" ON public.company_requests
  FOR UPDATE
  USING (public.is_coordinator() OR public.is_admin());

DROP POLICY IF EXISTS "Admins can view all handled companies" ON public.coordinator_handled_companies;
CREATE POLICY "Admins can view all handled companies" ON public.coordinator_handled_companies
  FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage courses" ON public.courses;
CREATE POLICY "Admins can manage courses" ON public.courses
  FOR ALL
  USING (public.is_admin());

DROP POLICY IF EXISTS "Coordinators and Admins can update journals" ON public.daily_journals;
CREATE POLICY "Coordinators and Admins can update journals" ON public.daily_journals
  FOR UPDATE
  USING (public.is_admin_or_coordinator());

DROP POLICY IF EXISTS "Admins can manage requests" ON public.department_change_requests;
CREATE POLICY "Admins can manage requests" ON public.department_change_requests
  FOR ALL
  USING (public.is_admin());

DROP POLICY IF EXISTS "Coordinators and Admins can update department change requests" ON public.department_change_requests;
CREATE POLICY "Coordinators and Admins can update department change requests" ON public.department_change_requests
  FOR UPDATE
  USING (public.is_admin_or_coordinator());

-- The department match still reads the caller's own row; only the role check moved.
DROP POLICY IF EXISTS "Coordinators can manage requests for their dept" ON public.department_change_requests;
CREATE POLICY "Coordinators can manage requests for their dept" ON public.department_change_requests
  FOR ALL
  USING (
    public.is_coordinator()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.auth_user_id = auth.uid()
        AND profiles.department_id = department_change_requests.current_department_id
    )
  );

DROP POLICY IF EXISTS "Admins can delete departments" ON public.departments;
CREATE POLICY "Admins can delete departments" ON public.departments
  FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert departments" ON public.departments;
CREATE POLICY "Admins can insert departments" ON public.departments
  FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update departments" ON public.departments;
CREATE POLICY "Admins can update departments" ON public.departments
  FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins and coordinators can view all device fingerprints" ON public.device_fingerprints;
CREATE POLICY "Admins and coordinators can view all device fingerprints" ON public.device_fingerprints
  FOR SELECT TO authenticated
  USING (public.is_admin_or_coordinator());

DROP POLICY IF EXISTS "Coordinators and Admins can view all DTR records" ON public.dtr_records;
CREATE POLICY "Coordinators and Admins can view all DTR records" ON public.dtr_records
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin_or_coordinator());

DROP POLICY IF EXISTS "Coordinators and Admins can view all DTR signatures" ON public.dtr_signatures;
CREATE POLICY "Coordinators and Admins can view all DTR signatures" ON public.dtr_signatures
  FOR SELECT
  USING (public.is_admin_or_coordinator());

DROP POLICY IF EXISTS "Coordinators can delete signatures" ON public.dtr_signatures;
CREATE POLICY "Coordinators can delete signatures" ON public.dtr_signatures
  FOR DELETE
  USING (public.is_coordinator());

DROP POLICY IF EXISTS "Coordinators can insert signatures" ON public.dtr_signatures;
CREATE POLICY "Coordinators can insert signatures" ON public.dtr_signatures
  FOR INSERT
  WITH CHECK (public.is_coordinator() AND auth.uid() = signed_by);

DROP POLICY IF EXISTS "Staff read DTR submissions" ON public.dtr_submissions;
CREATE POLICY "Staff read DTR submissions" ON public.dtr_submissions
  FOR SELECT TO authenticated
  USING (public.is_admin_or_coordinator());

DROP POLICY IF EXISTS "Coordinators and Admins can view evaluations" ON public.evaluations;
CREATE POLICY "Coordinators and Admins can view evaluations" ON public.evaluations
  FOR SELECT
  USING (public.is_admin_or_coordinator());

DROP POLICY IF EXISTS "Admins can freely access feedback" ON public.feedback;
CREATE POLICY "Admins can freely access feedback" ON public.feedback
  FOR ALL
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins and coordinators can read split review" ON public.onboarding_split_review;
CREATE POLICY "Admins and coordinators can read split review" ON public.onboarding_split_review
  FOR SELECT TO authenticated
  USING (public.is_admin_or_coordinator());

DROP POLICY IF EXISTS "Coordinators and Admins can manage sections" ON public.sections;
CREATE POLICY "Coordinators and Admins can manage sections" ON public.sections
  FOR ALL TO authenticated
  USING (public.is_admin_or_coordinator());

DROP POLICY IF EXISTS "Admins can manage system settings" ON public.system_settings;
CREATE POLICY "Admins can manage system settings" ON public.system_settings
  FOR ALL
  USING (public.is_admin());

DROP POLICY IF EXISTS "Coordinators and Admins can update timesheets" ON public.timesheets;
CREATE POLICY "Coordinators and Admins can update timesheets" ON public.timesheets
  FOR UPDATE
  USING (public.is_admin_or_coordinator());


-- ---------------------------------------------------------------------------
-- 10. Only the intentional entry points are reachable from the client.
--     Trigger functions are authorized at CREATE TRIGGER time rather than per
--     row, so revoking them does not affect the triggers above.
--     The role helpers are evaluated inside RLS for anon requests too, so anon
--     keeps the EXECUTE it already had; nothing new is granted to anon.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_admin() FROM public;
REVOKE ALL ON FUNCTION public.is_coordinator() FROM public;
REVOKE ALL ON FUNCTION public.is_admin_or_coordinator() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_coordinator() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_coordinator() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_profile_email_rules() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_privileged_columns() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_audit_log_actor() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_privileged_audit_log(text, text, text, uuid, text, jsonb, jsonb) FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.complete_signup_registration(text, text, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.adviser_approve_student(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.adviser_reject_student(uuid, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.coordinator_approve_company_account(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.coordinator_set_adviser_status(uuid, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_update_user_role(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_update_user_status(uuid, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_update_user_permissions(uuid, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_unlock_user_account(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_company(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_get_security_alerts() FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_get_security_alerts(uuid) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.complete_signup_registration(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adviser_approve_student(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adviser_reject_student(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordinator_approve_company_account(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coordinator_set_adviser_status(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_status(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_permissions(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlock_user_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_company(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_security_alerts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_security_alerts(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
