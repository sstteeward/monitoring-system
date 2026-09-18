-- ==============================================================================
-- Admin force control: DTR submissions, grading sheets, clock records
-- ==============================================================================
-- Three SIL workflows can strand a student with no way forward, and today an
-- administrator has no lever to move them:
--
--   A. Final DTR submission - only the one adviser the DTR was addressed to can
--      review it, and approval is final. If that adviser leaves, the submission
--      has nobody who can act on it.
--   B. Official Grading Sheet - `finalized` is a dead end ("read-only for
--      everyone"), and the admin portal has no grading screen even though the
--      workflow RPCs already admit admins.
--   C. Clock-in/out records - a missing clock-out, a missing clock-in, a reversed
--      range or an over-limit day blocks DTR submission, with no audited admin
--      correction path.
--
-- This file adds admin-only, reason-required, server-audited overrides for all
-- three. Every override:
--   * is a SECURITY DEFINER RPC gated by public.is_admin();
--   * requires a non-empty reason (<= 500 chars);
--   * writes its audit trail (audit_logs, plus the domain trail) and notifies
--     the affected users in the SAME transaction;
--   * leaves every existing guard for non-admin roles exactly as it is.
--
-- What it reuses rather than rebuilds
--   * is_admin()                        - the hardened admin gate
--   * write_privileged_audit_log()      - the audit-writer style (copied here as
--                                         write_force_action_audit, retargeted)
--   * resolve_student_adviser()         - the student's current section adviser
--   * open_grading_sheet()              - redefined (one line) so a reopened
--                                         sheet is not roster-synced
--   * timesheet_worked_minutes(),
--     attendance_daily_minutes(),
--     attendance_limit_state(),
--     attendance_daily_limit_minutes(),
--     attendance_time_zone()            - the rendered-time and limit rules
--   * user_notifications                - one row IS the email, via the existing
--                                         notification_email webhook
--
-- Cross-workflow lock: a clock-record correction (Part C) is refused while a DTR
-- covering that day is pending or approved. The admin must first request a
-- revision or reopen the DTR (Part A), so an approved DTR's snapshot stays
-- consistent with its records.
--
-- Safe to re-run: CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT
-- IF EXISTS then ADD. It adds no RLS write policy and grants no table privilege.
-- ==============================================================================


-- ----------------------------------------------------------------------------
-- 0. Additive schema changes (the only ones in this task)
-- ----------------------------------------------------------------------------

-- A. DTR events: admins add four new kinds of event to the trail.
ALTER TABLE public.dtr_submission_events
    DROP CONSTRAINT IF EXISTS dtr_submission_events_event_check;
ALTER TABLE public.dtr_submission_events
    ADD CONSTRAINT dtr_submission_events_event_check
    CHECK (event = ANY (ARRAY[
        'submitted', 'resubmitted', 'revision_requested', 'approved',
        'admin_approved', 'admin_revision_requested', 'reopened', 'reviewer_reassigned'
    ]));

-- B. Grading sheets remember when an admin reopened a finalized record.
ALTER TABLE public.grading_sheets
    ADD COLUMN IF NOT EXISTS reopened_at timestamptz;
ALTER TABLE public.grading_sheets
    ADD COLUMN IF NOT EXISTS reopened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- C. Timesheets carry the provenance of an admin correction. Existing rows stay
--    'clock'; nothing else changes.
ALTER TABLE public.timesheets
    ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'clock'
        CHECK (entry_source IN ('clock', 'admin'));
ALTER TABLE public.timesheets
    ADD COLUMN IF NOT EXISTS corrected_at timestamptz;
ALTER TABLE public.timesheets
    ADD COLUMN IF NOT EXISTS corrected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.timesheets
    ADD COLUMN IF NOT EXISTS correction_reason text;


-- ----------------------------------------------------------------------------
-- Part 0. Shared audit writer
--   Same body as write_privileged_audit_log, but the target table/type and id
--   are parameters instead of hard-coded 'profiles'. SECURITY INVOKER, and not
--   callable by any API role: it is only ever called from inside the RPCs below,
--   which have already established the admin's identity. The audit_logs
--   actor-stamp trigger rewrites only browser inserts (current_user =
--   'authenticated'); inside a DEFINER RPC current_user is the owner, so the
--   values written here stand.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.write_force_action_audit(
    p_action      text,
    p_module      text,
    p_description text,
    p_target_type text,
    p_target_id   text,
    p_target_name text,
    p_old         jsonb,
    p_new         jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_uid  uuid := auth.uid();
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
        p_target_type, p_target_id, p_target_type, p_target_id, p_target_name,
        p_old, p_new, 'success'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.write_force_action_audit(text,text,text,text,text,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- Part A. DTR submission overrides
-- ============================================================================

-- A2. Read-only admin list of every submission, with the "needs attention"
--     signal an admin acts on: a pending DTR whose reviewer is missing,
--     deactivated, or no longer the student's section adviser.
CREATE OR REPLACE FUNCTION public.get_admin_dtr_submissions(p_status text DEFAULT NULL)
RETURNS TABLE(
    id uuid, student_id uuid, student_name text, student_email text,
    section_name text, company_name text, period_start date, period_end date,
    required_hours integer, total_minutes integer, working_days integer,
    status text, submitted_at timestamptz, reviewed_at timestamptz,
    adviser_remarks text, attempt integer,
    adviser_id uuid, adviser_name text, adviser_active boolean,
    current_adviser_id uuid, needs_attention boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_filter text := nullif(lower(btrim(coalesce(p_status, ''))), '');
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can do this.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH enriched AS (
        SELECT
            s.id, s.student_id, s.section_name, s.company_name,
            s.period_start, s.period_end, s.required_hours, s.total_minutes,
            s.working_days, s.status, s.submitted_at, s.reviewed_at,
            s.adviser_remarks, s.attempt, s.adviser_id,
            (SELECT ra.adviser_id FROM public.resolve_student_adviser(s.student_id) ra) AS cur_adv,
            COALESCE((SELECT ap.account_type = 'adviser' AND ap.is_active IS TRUE
                        FROM public.profiles ap WHERE ap.auth_user_id = s.adviser_id), false) AS adv_active
          FROM public.dtr_submissions s
    ),
    flagged AS (
        SELECT e.*,
               (e.status = 'pending'
                AND (e.adviser_id IS NULL OR NOT e.adv_active OR e.adviser_id IS DISTINCT FROM e.cur_adv)) AS na
          FROM enriched e
    )
    SELECT
        f.id, f.student_id,
        (SELECT NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
           FROM public.profiles p WHERE p.auth_user_id = f.student_id),
        (SELECT p.email FROM public.profiles p WHERE p.auth_user_id = f.student_id),
        f.section_name, f.company_name, f.period_start, f.period_end,
        f.required_hours, f.total_minutes, f.working_days, f.status,
        f.submitted_at, f.reviewed_at, f.adviser_remarks, f.attempt,
        f.adviser_id,
        (SELECT NULLIF(btrim(concat_ws(' ', ap.first_name, ap.last_name)), '')
           FROM public.profiles ap WHERE ap.auth_user_id = f.adviser_id),
        f.adv_active, f.cur_adv, f.na
      FROM flagged f
     WHERE v_filter IS NULL
        OR v_filter = 'all'
        OR (v_filter = 'needs_attention' AND f.na)
        OR (v_filter IN ('pending', 'approved', 'revision_requested') AND f.status = v_filter)
     ORDER BY
        f.na DESC,
        CASE f.status WHEN 'pending' THEN 0 WHEN 'revision_requested' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,
        f.submitted_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_dtr_submissions(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dtr_submissions(text) TO authenticated;


-- A3. Admin approve / request revision / reopen.
CREATE OR REPLACE FUNCTION public.admin_review_dtr_submission(p_id uuid, p_action text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_reason  text := btrim(coalesce(p_reason, ''));
    v_actor   text;
    v_student text;
    v_sub     public.dtr_submissions;
    v_old     text;
    v_new     text;
    v_event   text;
    v_verb    text;
    v_action  text;   -- audit action
    v_title   text;
    v_msg     text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can do this.' USING ERRCODE = '42501';
    END IF;
    IF v_reason = '' THEN
        RAISE EXCEPTION 'A reason is required for an administrator override.';
    END IF;
    IF length(v_reason) > 500 THEN
        RAISE EXCEPTION 'The reason is too long (500 characters max).';
    END IF;

    SELECT NULLIF(btrim(concat_ws(' ', first_name, last_name)), '')
      INTO v_actor FROM public.profiles WHERE auth_user_id = auth.uid();

    SELECT * INTO v_sub FROM public.dtr_submissions WHERE id = p_id FOR UPDATE;
    IF v_sub.id IS NULL THEN
        RAISE EXCEPTION 'DTR submission not found.';
    END IF;

    v_old  := v_sub.status;
    v_verb := CASE p_action
                WHEN 'approve'          THEN 'approved'
                WHEN 'request_revision' THEN 'sent back for revision'
                WHEN 'reopen'           THEN 'reopened'
                ELSE p_action
              END;

    IF p_action = 'approve' AND v_sub.status = 'pending' THEN
        v_new := 'approved';           v_event := 'admin_approved';           v_action := 'APPROVE';
    ELSIF p_action = 'request_revision' AND v_sub.status = 'pending' THEN
        v_new := 'revision_requested'; v_event := 'admin_revision_requested'; v_action := 'REJECT';
    ELSIF p_action = 'reopen' AND v_sub.status = 'approved' THEN
        v_new := 'revision_requested'; v_event := 'reopened';                 v_action := 'UPDATE';
    ELSE
        RAISE EXCEPTION 'This DTR is % and cannot be % here.', v_old, v_verb;
    END IF;

    -- Reopen re-opens an approved row; if the student already has another open
    -- submission the partial unique index would throw a raw error. Catch it here.
    IF p_action = 'reopen' AND EXISTS (
        SELECT 1 FROM public.dtr_submissions o
         WHERE o.student_id = v_sub.student_id AND o.id <> v_sub.id AND o.status <> 'approved'
    ) THEN
        RAISE EXCEPTION 'This student already has an open DTR submission. Resolve that one first.';
    END IF;

    UPDATE public.dtr_submissions
       SET status = v_new, reviewed_at = now(), reviewed_by = auth.uid(),
           adviser_remarks = v_reason, updated_at = now()
     WHERE id = p_id;

    INSERT INTO public.dtr_submission_events (submission_id, event, actor_id, actor_name, remarks)
    VALUES (p_id, v_event, auth.uid(), v_actor, v_reason);

    -- Notify the student.
    IF v_new = 'approved' THEN
        v_title := 'DTR Approved';
        v_msg   := 'An administrator reviewed and approved your DTR.' || E'\n\n' || 'Reason: ' || v_reason;
    ELSIF p_action = 'reopen' THEN
        v_title := 'DTR Reopened for Correction';
        v_msg   := 'An administrator reopened your approved DTR for correction. Please review and resubmit.'
                   || E'\n\n' || 'Reason: ' || v_reason;
    ELSE
        v_title := 'DTR Revision Required';
        v_msg   := 'An administrator reviewed your DTR and requested revisions. Please review and resubmit.'
                   || E'\n\n' || 'Reason: ' || v_reason;
    END IF;

    INSERT INTO public.user_notifications (
        user_id, title, message, type, is_read,
        notification_type, related_type, related_id, created_by, action_path, action_label
    ) VALUES (
        v_sub.student_id, v_title, v_msg,
        CASE WHEN v_new = 'approved' THEN 'success' ELSE 'warning' END, false,
        CASE WHEN v_new = 'approved' THEN 'dtr_approved' ELSE 'dtr_revision' END,
        'dtr_submission', p_id, auth.uid(),
        '/student/dtr', CASE WHEN v_new = 'approved' THEN 'View DTR' ELSE 'Review my DTR' END
    );

    -- Notify the addressed adviser, if there is one.
    IF v_sub.adviser_id IS NOT NULL THEN
        INSERT INTO public.user_notifications (
            user_id, title, message, type, is_read,
            notification_type, related_type, related_id, created_by, action_path, action_label
        ) VALUES (
            v_sub.adviser_id,
            CASE WHEN v_new = 'approved' THEN 'DTR Approved by Administrator' ELSE 'DTR Action by Administrator' END,
            'An administrator ' || v_verb || ' a DTR submission addressed to you.' || E'\n\n' || 'Reason: ' || v_reason,
            CASE WHEN v_new = 'approved' THEN 'info' ELSE 'warning' END, false,
            CASE WHEN v_new = 'approved' THEN 'dtr_approved' ELSE 'dtr_revision' END,
            'dtr_submission', p_id, auth.uid(),
            '/adviser/approvals?tab=dtr', 'View DTR'
        );
    END IF;

    SELECT NULLIF(btrim(concat_ws(' ', first_name, last_name)), '')
      INTO v_student FROM public.profiles WHERE auth_user_id = v_sub.student_id;

    PERFORM public.write_force_action_audit(
        v_action, 'Attendance',
        'Admin override: ' || v_verb || ' DTR submission.',
        'dtr_submission', p_id::text, v_student,
        jsonb_build_object('status', v_old),
        jsonb_build_object('status', v_new, 'override', true, 'reason', v_reason)
    );

    RETURN jsonb_build_object('status', v_new, 'reviewed_at', now());
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_review_dtr_submission(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_dtr_submission(uuid,text,text) TO authenticated;


-- A4. Reassign the reviewer of an open DTR submission.
CREATE OR REPLACE FUNCTION public.admin_reassign_dtr_reviewer(
    p_id uuid, p_adviser_id uuid DEFAULT NULL, p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_reason   text := btrim(coalesce(p_reason, ''));
    v_sub      public.dtr_submissions;
    v_adv      record;
    v_target   uuid;
    v_new_name text;
    v_old_adv  uuid;
    v_section  uuid;
    v_secname  text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can do this.' USING ERRCODE = '42501';
    END IF;
    IF v_reason = '' THEN
        RAISE EXCEPTION 'A reason is required for an administrator override.';
    END IF;
    IF length(v_reason) > 500 THEN
        RAISE EXCEPTION 'The reason is too long (500 characters max).';
    END IF;

    SELECT * INTO v_sub FROM public.dtr_submissions WHERE id = p_id FOR UPDATE;
    IF v_sub.id IS NULL THEN
        RAISE EXCEPTION 'DTR submission not found.';
    END IF;
    IF v_sub.status NOT IN ('pending', 'revision_requested') THEN
        RAISE EXCEPTION 'Only an open DTR submission can be reassigned.';
    END IF;

    v_old_adv := v_sub.adviser_id;
    v_section := v_sub.section_id;
    v_secname := v_sub.section_name;

    IF p_adviser_id IS NULL THEN
        SELECT * INTO v_adv FROM public.resolve_student_adviser(v_sub.student_id);
        IF v_adv.adviser_id IS NULL THEN
            RAISE EXCEPTION 'No active adviser holds this student''s section. Assign an adviser to the section first.';
        END IF;
        v_target  := v_adv.adviser_id;
        v_section := v_adv.section_id;
        v_secname := v_adv.section_name;
        v_new_name := v_adv.adviser_name;
    ELSE
        SELECT NULLIF(btrim(concat_ws(' ', first_name, last_name)), '')
          INTO v_new_name
          FROM public.profiles
         WHERE auth_user_id = p_adviser_id AND account_type = 'adviser' AND is_active IS TRUE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'The selected account is not an active adviser.';
        END IF;
        v_target := p_adviser_id;
    END IF;

    IF v_target IS NOT DISTINCT FROM v_old_adv THEN
        RAISE EXCEPTION 'This DTR is already assigned to that adviser.';
    END IF;

    UPDATE public.dtr_submissions
       SET adviser_id = v_target, section_id = v_section, section_name = v_secname, updated_at = now()
     WHERE id = p_id;

    INSERT INTO public.dtr_submission_events (submission_id, event, actor_id, actor_name, remarks)
    VALUES (p_id, 'reviewer_reassigned', auth.uid(),
            (SELECT NULLIF(btrim(concat_ws(' ', first_name, last_name)), '') FROM public.profiles WHERE auth_user_id = auth.uid()),
            v_reason || ' → ' || coalesce(v_new_name, 'the new adviser'));

    -- A pending DTR is actively in the new adviser's queue; tell them.
    IF v_sub.status = 'pending' THEN
        INSERT INTO public.user_notifications (
            user_id, title, message, type, is_read,
            notification_type, related_type, related_id, created_by, action_path, action_label
        ) VALUES (
            v_target, 'DTR Assigned to You',
            'An administrator assigned a pending DTR submission to you for review.' || E'\n\n'
              || 'Section: ' || coalesce(v_secname, '—') || E'\n' || 'Reason: ' || v_reason,
            'info', false, 'dtr_submitted', 'dtr_submission', p_id, auth.uid(),
            '/adviser/approvals?tab=dtr', 'Review DTR'
        );
    END IF;

    -- Tell the student who now holds their DTR.
    INSERT INTO public.user_notifications (
        user_id, title, message, type, is_read,
        notification_type, related_type, related_id, created_by, action_path, action_label
    ) VALUES (
        v_sub.student_id, 'DTR Reviewer Updated',
        'An administrator assigned your DTR to a new reviewer' ||
        CASE WHEN v_new_name IS NOT NULL THEN ': ' || v_new_name ELSE '.' END,
        'info', false, 'dtr_submitted', 'dtr_submission', p_id, auth.uid(),
        '/student/dtr', 'View DTR'
    );

    PERFORM public.write_force_action_audit(
        'ASSIGN', 'Attendance',
        'Admin override: reassigned DTR reviewer.',
        'dtr_submission', p_id::text,
        (SELECT NULLIF(btrim(concat_ws(' ', first_name, last_name)), '') FROM public.profiles WHERE auth_user_id = v_sub.student_id),
        jsonb_build_object('adviser_id', v_old_adv),
        jsonb_build_object('adviser_id', v_target, 'override', true, 'reason', v_reason)
    );

    RETURN jsonb_build_object('adviser_id', v_target, 'adviser_name', v_new_name, 'status', v_sub.status);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_reassign_dtr_reviewer(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reassign_dtr_reviewer(uuid,uuid,text) TO authenticated;


-- ============================================================================
-- Part B. Grading sheet reopen and admin view
-- ============================================================================

-- B2. Redefine open_grading_sheet. This is the LIVE definition, with ONE change:
--     the roster-sync guard also requires reopened_at IS NULL. A reopened sheet
--     belongs to a past term, so syncing it against today's section membership
--     would add students who were never on it. Every adviser check is unchanged.
CREATE OR REPLACE FUNCTION public.open_grading_sheet(p_section_id uuid, p_school_year_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_sheet_id uuid;
    v_cfg      public.grading_settings;
BEGIN
    IF NOT public.is_adviser() THEN
        RAISE EXCEPTION 'Only a Section Adviser may open a grading sheet.';
    END IF;
    IF NOT public.adviser_owns_section(p_section_id) THEN
        RAISE EXCEPTION 'That section is not assigned to you.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.school_years WHERE id = p_school_year_id) THEN
        RAISE EXCEPTION 'Unknown school year.';
    END IF;

    SELECT * INTO v_cfg FROM public.grading_settings WHERE scope = 'global';

    SELECT id INTO v_sheet_id
      FROM public.grading_sheets
     WHERE section_id = p_section_id AND school_year_id = p_school_year_id;

    IF v_sheet_id IS NULL THEN
        INSERT INTO public.grading_sheets (
            section_id, adviser_id, school_year_id,
            subject_code, course_description,
            passing_grade, min_grade, max_grade, created_by
        ) VALUES (
            p_section_id, auth.uid(), p_school_year_id,
            v_cfg.subject_code, v_cfg.course_description,
            v_cfg.passing_grade, v_cfg.min_grade, v_cfg.max_grade, auth.uid()
        )
        RETURNING id INTO v_sheet_id;

        INSERT INTO public.grade_audit_logs (grading_sheet_id, user_id, action, new_status)
        VALUES (v_sheet_id, auth.uid(), 'create', 'draft');

    ELSIF NOT EXISTS (
        SELECT 1 FROM public.grading_sheets
         WHERE id = v_sheet_id AND adviser_id = auth.uid()
    ) THEN
        -- The section changed hands. The sheet follows the section, so the
        -- adviser who now holds it takes over the sheet as well.
        UPDATE public.grading_sheets
           SET adviser_id = auth.uid(), updated_at = now()
         WHERE id = v_sheet_id;

        INSERT INTO public.grade_audit_logs (grading_sheet_id, user_id, action, reason)
        VALUES (v_sheet_id, auth.uid(), 'reassign', 'Section reassigned to a different adviser.');
    END IF;

    -- A finalized sheet is a closed record; its roster is never touched again.
    -- A reopened sheet belongs to a past term, so its roster is frozen too: it
    -- must never pick up students who joined the section afterwards.
    IF (SELECT status FROM public.grading_sheets WHERE id = v_sheet_id) IN ('draft', 'for_review')
       AND (SELECT reopened_at FROM public.grading_sheets WHERE id = v_sheet_id) IS NULL THEN
        PERFORM public.sync_grading_sheet_roster(v_sheet_id);
    END IF;

    RETURN v_sheet_id;
END;
$function$;


-- B3. Read-only admin list of grading sheets (drafts included).
CREATE OR REPLACE FUNCTION public.get_admin_grading_sheets(p_status text DEFAULT NULL)
RETURNS TABLE(
    id uuid, section_id uuid, section_name text, course_code text,
    school_year text, semester text, adviser_name text, status text,
    student_count integer, graded_count integer,
    submitted_at timestamptz, verified_at timestamptz, finalized_at timestamptz,
    updated_at timestamptz,
    adviser_id uuid, adviser_active boolean, adviser_holds_section boolean,
    return_reason text, reopened_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can do this.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        gs.id, s.id, s.name, s.course_code,
        sy.school_year, sy.semester,
        btrim(coalesce(ap.first_name, '') || ' ' || coalesce(ap.last_name, '')),
        gs.status,
        (SELECT count(*)::integer FROM public.grading_sheet_items i WHERE i.grading_sheet_id = gs.id),
        (SELECT count(*)::integer FROM public.grading_sheet_items i
          WHERE i.grading_sheet_id = gs.id AND i.final_grade IS NOT NULL),
        gs.submitted_at, gs.verified_at, gs.finalized_at, gs.updated_at,
        gs.adviser_id,
        COALESCE(ap.account_type = 'adviser' AND ap.is_active IS TRUE, false),
        EXISTS (SELECT 1 FROM public.adviser_sections a
                 WHERE a.section_id = gs.section_id AND a.adviser_id = gs.adviser_id AND a.status = 'active'),
        gs.return_reason, gs.reopened_at
      FROM public.grading_sheets gs
      JOIN public.sections s      ON s.id = gs.section_id
      JOIN public.school_years sy ON sy.id = gs.school_year_id
      LEFT JOIN public.profiles ap ON ap.auth_user_id = gs.adviser_id
     WHERE (p_status IS NULL OR p_status = 'all' OR gs.status = p_status)
     ORDER BY
        CASE gs.status WHEN 'for_review' THEN 0 WHEN 'verified' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
        gs.updated_at DESC NULLS LAST;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_grading_sheets(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_grading_sheets(text) TO authenticated;


-- B4. Reopen a finalized grading sheet.
CREATE OR REPLACE FUNCTION public.admin_reopen_grading_sheet(p_sheet_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_reason  text := btrim(coalesce(p_reason, ''));
    v_sheet   public.grading_sheets;
    v_section text;
    v_dept    uuid;
    v_active  boolean;
    v_holds   boolean;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can do this.' USING ERRCODE = '42501';
    END IF;
    IF v_reason = '' THEN
        RAISE EXCEPTION 'A reason is required for an administrator override.';
    END IF;
    IF length(v_reason) > 500 THEN
        RAISE EXCEPTION 'The reason is too long (500 characters max).';
    END IF;

    SELECT * INTO v_sheet FROM public.grading_sheets WHERE id = p_sheet_id FOR UPDATE;
    IF v_sheet.id IS NULL THEN
        RAISE EXCEPTION 'Grading sheet not found.';
    END IF;
    IF v_sheet.status <> 'finalized' THEN
        RAISE EXCEPTION 'Only a finalized grading sheet can be reopened. Use Return for Correction for a sheet that is still under review or verified.';
    END IF;

    SELECT s.name, s.department_id INTO v_section, v_dept
      FROM public.sections s WHERE s.id = v_sheet.section_id;

    SELECT COALESCE(p.account_type = 'adviser' AND p.is_active IS TRUE, false)
      INTO v_active FROM public.profiles p WHERE p.auth_user_id = v_sheet.adviser_id;
    v_active := COALESCE(v_active, false);

    v_holds := EXISTS (SELECT 1 FROM public.adviser_sections a
                        WHERE a.section_id = v_sheet.section_id AND a.adviser_id = v_sheet.adviser_id AND a.status = 'active');

    IF NOT v_active OR NOT v_holds THEN
        RAISE EXCEPTION 'The adviser on this sheet no longer holds section %. Assign the section to an adviser and have them open this term''s sheet first, then reopen it.', coalesce(v_section, '(unknown)');
    END IF;

    UPDATE public.grading_sheets
       SET status = 'draft',
           return_reason = v_reason, returned_at = now(), returned_by = auth.uid(),
           submitted_at = NULL,
           verified_at = NULL, verified_by = NULL,
           finalized_at = NULL, finalized_by = NULL,
           reopened_at = now(), reopened_by = auth.uid(),
           updated_at = now()
     WHERE id = p_sheet_id;

    INSERT INTO public.grade_audit_logs (grading_sheet_id, user_id, action, old_status, new_status, reason)
    VALUES (p_sheet_id, auth.uid(), 'reopen', 'finalized', 'draft', v_reason);

    -- Tell the adviser.
    INSERT INTO public.user_notifications (
        user_id, title, message, type, is_read,
        notification_type, related_type, related_id, created_by, action_path, action_label
    ) VALUES (
        v_sheet.adviser_id, 'Grading Sheet Reopened',
        'The finalized ' || coalesce(v_section, 'section') || ' Official Grading Sheet was reopened by an administrator.'
          || E'\n\n' || 'Reason: ' || v_reason,
        'warning', false, 'assignment', 'grading_sheet', p_sheet_id, auth.uid(),
        '/adviser/grading', 'Open Grading Sheet'
    );

    -- Tell the department coordinators (same recipient filter as submit_grading_sheet).
    INSERT INTO public.user_notifications (
        user_id, title, message, type, is_read,
        notification_type, related_type, related_id, created_by, action_path, action_label
    )
    SELECT
        p.auth_user_id, 'Grading Sheet Reopened',
        'The finalized ' || coalesce(v_section, 'section') || ' Official Grading Sheet was reopened by an administrator.'
          || E'\n\n' || 'Reason: ' || v_reason,
        'warning', false, 'assignment', 'grading_sheet', p_sheet_id, auth.uid(),
        '/coordinator/grading-sheets', 'Review Grading Sheet'
      FROM public.profiles p
     WHERE p.account_type = 'coordinator'
       AND p.auth_user_id IS NOT NULL
       AND (p.department_id IS NULL OR v_dept IS NULL OR p.department_id = v_dept);

    PERFORM public.write_force_action_audit(
        'UPDATE', 'Grading',
        'Admin override: reopened finalized grading sheet.',
        'grading_sheet', p_sheet_id::text, v_section,
        jsonb_build_object('status', 'finalized'),
        jsonb_build_object('status', 'draft', 'override', true, 'reason', v_reason)
    );

    RETURN jsonb_build_object('status', 'draft');
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_reopen_grading_sheet(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reopen_grading_sheet(uuid,text) TO authenticated;


-- ============================================================================
-- Part C. Clock-record corrections
-- ============================================================================

-- Internal: validate a proposed clock-record range. SECURITY INVOKER, not
-- callable by API roles; only the RPCs below call it, after is_admin().
CREATE OR REPLACE FUNCTION public.admin_validate_timesheet_range(
    p_user uuid, p_exclude uuid,
    p_in timestamptz, p_out timestamptz, p_bs timestamptz, p_be timestamptz
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_day date;
BEGIN
    IF p_in IS NULL OR p_out IS NULL THEN
        RAISE EXCEPTION 'Clock-in and clock-out are both required.';
    END IF;
    IF p_out <= p_in THEN
        RAISE EXCEPTION 'Clock-out must be later than clock-in.';
    END IF;
    IF p_out > now() THEN
        RAISE EXCEPTION 'A clock record cannot end in the future.';
    END IF;
    IF p_out - p_in > interval '24 hours' THEN
        RAISE EXCEPTION 'A single session cannot exceed 24 hours.';
    END IF;

    -- A break is either fully specified and inside the session, or absent.
    IF (p_bs IS NULL) <> (p_be IS NULL)
       OR (p_bs IS NOT NULL AND NOT (p_in <= p_bs AND p_bs < p_be AND p_be <= p_out)) THEN
        RAISE EXCEPTION 'The break must start and end inside the session.';
    END IF;

    v_day := (p_in AT TIME ZONE public.attendance_time_zone())::date;

    IF EXISTS (
        SELECT 1 FROM public.timesheets t
         WHERE t.user_id = p_user
           AND (p_exclude IS NULL OR t.id <> p_exclude)
           AND COALESCE(t.approval_status, 'pending') <> 'rejected'
           AND tstzrange(t.clock_in, COALESCE(t.clock_out, now())) && tstzrange(p_in, p_out)
    ) THEN
        RAISE EXCEPTION 'This session overlaps another clock record on %.', v_day;
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_validate_timesheet_range(uuid,uuid,timestamptz,timestamptz,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;


-- Internal: refuse to touch a day that is locked inside a DTR.
CREATE OR REPLACE FUNCTION public.admin_assert_dtr_editable(p_user uuid, p_day date)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.dtr_submissions d
         WHERE d.student_id = p_user AND d.status = 'pending'
           AND p_day BETWEEN d.period_start AND d.period_end
    ) THEN
        RAISE EXCEPTION 'This student''s DTR is under review. Request a revision on the DTR first.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.dtr_submissions d
         WHERE d.student_id = p_user AND d.status = 'approved'
           AND p_day BETWEEN d.period_start AND d.period_end
    ) THEN
        RAISE EXCEPTION 'This day belongs to an approved DTR. Reopen the DTR first.';
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_assert_dtr_editable(uuid,date) FROM PUBLIC, anon, authenticated;


-- Internal: recompute the day's rendered-limit fields on every non-rejected row,
-- without touching notifications or alerts (that is process_attendance_daily_limits'
-- job, and it must not be called from here).
CREATE OR REPLACE FUNCTION public.admin_refresh_day_limit(p_user uuid, p_day date)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_min   integer := public.attendance_daily_minutes(p_user, p_day);
    v_limit integer := public.attendance_daily_limit_minutes();
BEGIN
    UPDATE public.timesheets t
       SET daily_limit_status = public.attendance_limit_state(v_min, v_limit),
           over_limit_minutes = GREATEST(0, v_min - v_limit)
     WHERE t.user_id = p_user
       AND COALESCE(t.approval_status, 'pending') <> 'rejected'
       AND (t.clock_in AT TIME ZONE public.attendance_time_zone())::date = p_day;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_refresh_day_limit(uuid,date) FROM PUBLIC, anon, authenticated;


-- C2. Read-only: every clock record for a student on a given attendance day.
CREATE OR REPLACE FUNCTION public.get_admin_student_timesheets(p_student_id uuid, p_date date)
RETURNS TABLE(
    id uuid, clock_in timestamptz, clock_out timestamptz,
    break_start timestamptz, break_end timestamptz,
    status text, approval_status text, worked_minutes integer,
    daily_limit_status text, over_limit_minutes integer,
    entry_source text, corrected_at timestamptz, corrected_by_name text, correction_reason text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can do this.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        t.id, t.clock_in, t.clock_out, t.break_start, t.break_end,
        t.status, t.approval_status,
        public.timesheet_worked_minutes(t.clock_in, t.clock_out, t.break_start, t.break_end, now()),
        t.daily_limit_status, t.over_limit_minutes,
        t.entry_source, t.corrected_at,
        (SELECT NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
           FROM public.profiles p WHERE p.auth_user_id = t.corrected_by),
        t.correction_reason
      FROM public.timesheets t
     WHERE t.user_id = p_student_id
       AND (t.clock_in AT TIME ZONE public.attendance_time_zone())::date = p_date
     ORDER BY t.clock_in;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_student_timesheets(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_student_timesheets(uuid,date) TO authenticated;


-- C3. Correct the four times on an existing clock record.
CREATE OR REPLACE FUNCTION public.admin_correct_timesheet(
    p_timesheet_id uuid,
    p_clock_in timestamptz, p_clock_out timestamptz,
    p_break_start timestamptz, p_break_end timestamptz,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_reason text := btrim(coalesce(p_reason, ''));
    v_row    public.timesheets;
    v_owner  text;
    v_day    date;
    v_sname  text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can do this.' USING ERRCODE = '42501';
    END IF;
    IF v_reason = '' THEN
        RAISE EXCEPTION 'A reason is required for an administrator override.';
    END IF;
    IF length(v_reason) > 500 THEN
        RAISE EXCEPTION 'The reason is too long (500 characters max).';
    END IF;

    SELECT * INTO v_row FROM public.timesheets WHERE id = p_timesheet_id FOR UPDATE;
    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'Clock record not found.';
    END IF;

    SELECT account_type INTO v_owner FROM public.profiles WHERE auth_user_id = v_row.user_id;
    IF v_owner IS DISTINCT FROM 'student' THEN
        RAISE EXCEPTION 'This clock record does not belong to a student.';
    END IF;

    v_day := (v_row.clock_in AT TIME ZONE public.attendance_time_zone())::date;
    IF (p_clock_in AT TIME ZONE public.attendance_time_zone())::date <> v_day THEN
        RAISE EXCEPTION 'A correction must stay on the same attendance date.';
    END IF;

    PERFORM public.admin_assert_dtr_editable(v_row.user_id, v_day);
    PERFORM public.admin_validate_timesheet_range(v_row.user_id, p_timesheet_id, p_clock_in, p_clock_out, p_break_start, p_break_end);

    UPDATE public.timesheets
       SET clock_in = p_clock_in, clock_out = p_clock_out,
           break_start = p_break_start, break_end = p_break_end,
           status = 'completed',
           corrected_at = now(), corrected_by = auth.uid(), correction_reason = v_reason
     WHERE id = p_timesheet_id;

    PERFORM public.admin_refresh_day_limit(v_row.user_id, v_day);

    SELECT NULLIF(btrim(concat_ws(' ', first_name, last_name)), '')
      INTO v_sname FROM public.profiles WHERE auth_user_id = v_row.user_id;

    PERFORM public.write_force_action_audit(
        'UPDATE', 'Timesheets',
        'Admin override: corrected clock record for ' || v_day || '.',
        'timesheet', p_timesheet_id::text, v_sname,
        jsonb_build_object('clock_in', v_row.clock_in, 'clock_out', v_row.clock_out,
                           'break_start', v_row.break_start, 'break_end', v_row.break_end),
        jsonb_build_object('clock_in', p_clock_in, 'clock_out', p_clock_out,
                           'break_start', p_break_start, 'break_end', p_break_end,
                           'override', true, 'reason', v_reason)
    );

    INSERT INTO public.user_notifications (
        user_id, title, message, type, is_read,
        notification_type, related_type, related_id, created_by, action_path, action_label
    ) VALUES (
        v_row.user_id, 'Clock Record Corrected',
        'An administrator corrected your clock record for ' || v_day || '.' || E'\n\n' || 'Reason: ' || v_reason,
        'info', false, 'attendance', 'timesheet', p_timesheet_id, auth.uid(),
        '/student/dtr', 'View DTR'
    );

    RETURN jsonb_build_object('id', p_timesheet_id, 'status', 'completed');
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_correct_timesheet(uuid,timestamptz,timestamptz,timestamptz,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_correct_timesheet(uuid,timestamptz,timestamptz,timestamptz,timestamptz,text) TO authenticated;


-- C4. Force a missing clock-out onto an open record.
CREATE OR REPLACE FUNCTION public.admin_force_clock_out(
    p_timesheet_id uuid, p_clock_out timestamptz, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_reason text := btrim(coalesce(p_reason, ''));
    v_row    public.timesheets;
    v_owner  text;
    v_day    date;
    v_be     timestamptz;
    v_sname  text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can do this.' USING ERRCODE = '42501';
    END IF;
    IF v_reason = '' THEN
        RAISE EXCEPTION 'A reason is required for an administrator override.';
    END IF;
    IF length(v_reason) > 500 THEN
        RAISE EXCEPTION 'The reason is too long (500 characters max).';
    END IF;

    SELECT * INTO v_row FROM public.timesheets WHERE id = p_timesheet_id FOR UPDATE;
    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'Clock record not found.';
    END IF;
    IF v_row.clock_out IS NOT NULL THEN
        RAISE EXCEPTION 'This session is already clocked out.';
    END IF;

    SELECT account_type INTO v_owner FROM public.profiles WHERE auth_user_id = v_row.user_id;
    IF v_owner IS DISTINCT FROM 'student' THEN
        RAISE EXCEPTION 'This clock record does not belong to a student.';
    END IF;

    -- On break with no break-end: end the break at clock-out.
    v_be := v_row.break_end;
    IF v_row.status = 'break' AND v_row.break_end IS NULL THEN
        v_be := p_clock_out;
    END IF;

    v_day := (v_row.clock_in AT TIME ZONE public.attendance_time_zone())::date;

    PERFORM public.admin_assert_dtr_editable(v_row.user_id, v_day);
    PERFORM public.admin_validate_timesheet_range(v_row.user_id, p_timesheet_id, v_row.clock_in, p_clock_out, v_row.break_start, v_be);

    UPDATE public.timesheets
       SET clock_out = p_clock_out, break_end = v_be,
           status = 'completed',
           corrected_at = now(), corrected_by = auth.uid(), correction_reason = v_reason
     WHERE id = p_timesheet_id;

    PERFORM public.admin_refresh_day_limit(v_row.user_id, v_day);

    SELECT NULLIF(btrim(concat_ws(' ', first_name, last_name)), '')
      INTO v_sname FROM public.profiles WHERE auth_user_id = v_row.user_id;

    PERFORM public.write_force_action_audit(
        'UPDATE', 'Timesheets',
        'Admin override: forced clock-out for ' || v_day || '.',
        'timesheet', p_timesheet_id::text, v_sname,
        jsonb_build_object('clock_in', v_row.clock_in, 'clock_out', v_row.clock_out,
                           'break_start', v_row.break_start, 'break_end', v_row.break_end),
        jsonb_build_object('clock_in', v_row.clock_in, 'clock_out', p_clock_out,
                           'break_start', v_row.break_start, 'break_end', v_be,
                           'override', true, 'reason', v_reason)
    );

    INSERT INTO public.user_notifications (
        user_id, title, message, type, is_read,
        notification_type, related_type, related_id, created_by, action_path, action_label
    ) VALUES (
        v_row.user_id, 'Clock Record Corrected',
        'An administrator recorded a clock-out for your session on ' || v_day || '.' || E'\n\n' || 'Reason: ' || v_reason,
        'info', false, 'attendance', 'timesheet', p_timesheet_id, auth.uid(),
        '/student/dtr', 'View DTR'
    );

    RETURN jsonb_build_object('id', p_timesheet_id, 'status', 'completed');
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_force_clock_out(uuid,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_force_clock_out(uuid,timestamptz,text) TO authenticated;


-- C5. Add a whole clock record for a deployed student.
CREATE OR REPLACE FUNCTION public.admin_add_timesheet(
    p_student_id uuid,
    p_clock_in timestamptz, p_clock_out timestamptz,
    p_break_start timestamptz, p_break_end timestamptz,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_reason text := btrim(coalesce(p_reason, ''));
    v_prof   record;
    v_day    date;
    v_id     uuid;
    v_sname  text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can do this.' USING ERRCODE = '42501';
    END IF;
    IF v_reason = '' THEN
        RAISE EXCEPTION 'A reason is required for an administrator override.';
    END IF;
    IF length(v_reason) > 500 THEN
        RAISE EXCEPTION 'The reason is too long (500 characters max).';
    END IF;

    SELECT account_type, company_id,
           NULLIF(btrim(concat_ws(' ', first_name, last_name)), '') AS name
      INTO v_prof FROM public.profiles WHERE auth_user_id = p_student_id;

    IF v_prof.account_type IS DISTINCT FROM 'student' OR v_prof.company_id IS NULL THEN
        RAISE EXCEPTION 'This student is not deployed to a company.';
    END IF;

    v_day  := (p_clock_in AT TIME ZONE public.attendance_time_zone())::date;
    v_sname := v_prof.name;

    PERFORM public.admin_assert_dtr_editable(p_student_id, v_day);
    PERFORM public.admin_validate_timesheet_range(p_student_id, NULL, p_clock_in, p_clock_out, p_break_start, p_break_end);

    INSERT INTO public.timesheets (
        user_id, clock_in, clock_out, break_start, break_end,
        status, approval_status, requires_approval,
        entry_source, corrected_at, corrected_by, correction_reason
    ) VALUES (
        p_student_id, p_clock_in, p_clock_out, p_break_start, p_break_end,
        'completed', 'approved', false,
        'admin', now(), auth.uid(), v_reason
    )
    RETURNING id INTO v_id;

    PERFORM public.admin_refresh_day_limit(p_student_id, v_day);

    PERFORM public.write_force_action_audit(
        'CREATE', 'Timesheets',
        'Admin override: added clock record for ' || v_day || '.',
        'timesheet', v_id::text, v_sname,
        NULL,
        jsonb_build_object('clock_in', p_clock_in, 'clock_out', p_clock_out,
                           'break_start', p_break_start, 'break_end', p_break_end,
                           'entry_source', 'admin', 'override', true, 'reason', v_reason)
    );

    INSERT INTO public.user_notifications (
        user_id, title, message, type, is_read,
        notification_type, related_type, related_id, created_by, action_path, action_label
    ) VALUES (
        p_student_id, 'Clock Record Added',
        'An administrator added a clock record for you on ' || v_day || '.' || E'\n\n' || 'Reason: ' || v_reason,
        'info', false, 'attendance', 'timesheet', v_id, auth.uid(),
        '/student/dtr', 'View DTR'
    );

    RETURN jsonb_build_object('id', v_id, 'status', 'completed');
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_add_timesheet(uuid,timestamptz,timestamptz,timestamptz,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_timesheet(uuid,timestamptz,timestamptz,timestamptz,timestamptz,text) TO authenticated;


-- C6. Void (reject) or restore (approve) a clock record.
CREATE OR REPLACE FUNCTION public.admin_set_timesheet_voided(
    p_timesheet_id uuid, p_void boolean, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_reason text := btrim(coalesce(p_reason, ''));
    v_row    public.timesheets;
    v_owner  text;
    v_day    date;
    v_new    text;
    v_sname  text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can do this.' USING ERRCODE = '42501';
    END IF;
    IF v_reason = '' THEN
        RAISE EXCEPTION 'A reason is required for an administrator override.';
    END IF;
    IF length(v_reason) > 500 THEN
        RAISE EXCEPTION 'The reason is too long (500 characters max).';
    END IF;

    SELECT * INTO v_row FROM public.timesheets WHERE id = p_timesheet_id FOR UPDATE;
    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'Clock record not found.';
    END IF;

    SELECT account_type INTO v_owner FROM public.profiles WHERE auth_user_id = v_row.user_id;
    IF v_owner IS DISTINCT FROM 'student' THEN
        RAISE EXCEPTION 'This clock record does not belong to a student.';
    END IF;

    v_day := (v_row.clock_in AT TIME ZONE public.attendance_time_zone())::date;
    PERFORM public.admin_assert_dtr_editable(v_row.user_id, v_day);

    IF p_void THEN
        IF v_row.clock_out IS NULL THEN
            RAISE EXCEPTION 'Clock the session out before voiding it.';
        END IF;
        v_new := 'rejected';
    ELSE
        -- Restoring must not resurrect an overlap with the rows that stayed active.
        PERFORM public.admin_validate_timesheet_range(v_row.user_id, p_timesheet_id,
                                                       v_row.clock_in, v_row.clock_out, v_row.break_start, v_row.break_end);
        v_new := 'approved';
    END IF;

    UPDATE public.timesheets
       SET approval_status = v_new,
           corrected_at = now(), corrected_by = auth.uid(), correction_reason = v_reason
     WHERE id = p_timesheet_id;

    PERFORM public.admin_refresh_day_limit(v_row.user_id, v_day);

    SELECT NULLIF(btrim(concat_ws(' ', first_name, last_name)), '')
      INTO v_sname FROM public.profiles WHERE auth_user_id = v_row.user_id;

    PERFORM public.write_force_action_audit(
        CASE WHEN p_void THEN 'REJECT' ELSE 'APPROVE' END, 'Timesheets',
        'Admin override: ' || CASE WHEN p_void THEN 'voided' ELSE 'restored' END || ' clock record for ' || v_day || '.',
        'timesheet', p_timesheet_id::text, v_sname,
        jsonb_build_object('approval_status', v_row.approval_status),
        jsonb_build_object('approval_status', v_new, 'override', true, 'reason', v_reason)
    );

    INSERT INTO public.user_notifications (
        user_id, title, message, type, is_read,
        notification_type, related_type, related_id, created_by, action_path, action_label
    ) VALUES (
        v_row.user_id,
        CASE WHEN p_void THEN 'Clock Record Voided' ELSE 'Clock Record Restored' END,
        'An administrator ' || CASE WHEN p_void THEN 'voided' ELSE 'restored' END
          || ' your clock record for ' || v_day || '.' || E'\n\n' || 'Reason: ' || v_reason,
        CASE WHEN p_void THEN 'warning' ELSE 'info' END, false,
        'attendance', 'timesheet', p_timesheet_id, auth.uid(),
        '/student/dtr', 'View DTR'
    );

    RETURN jsonb_build_object('id', p_timesheet_id, 'approval_status', v_new);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_timesheet_voided(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_timesheet_voided(uuid,boolean,text) TO authenticated;


-- ============================================================================
-- Part D. Keep the printable DTR (dtr_records) in sync with admin corrections
-- ============================================================================
-- The monthly DTR grid (DTRCard) reads public.dtr_records first and only falls
-- back to timesheets when that table is empty for the month. dtr_records is
-- written live by the student's own clock-in/out, so once a student has any row
-- for the month the grid never looks at timesheets again — and every admin
-- override in Part C writes to timesheets only. The result: an admin-forced
-- clock-out (or correction, added session, or void) never showed on the DTR.
--
-- Fix: rebuild the affected day's dtr_records row from the day's clock records
-- whenever an admin-sourced row changes. The student's normal live path is left
-- exactly as it was — the trigger fires only for rows an admin touched
-- (corrected_at set, or entry_source = 'admin').

-- D1. Rebuild one day's dtr_records row from its (non-rejected, closed) sessions.
--     Each session is one block (IN = clock-in, OUT = clock-out) placed in the
--     column pair its clock-in time falls in — Morning before 12:00, Afternoon
--     12:00–17:59, Overtime 18:00 and later — so a PM session never shows under
--     Morning. When two sessions want the same pair, the later one overflows to
--     the next free pair. The daily total is the authoritative rendered time
--     (breaks already removed).
CREATE OR REPLACE FUNCTION public.admin_sync_dtr_record(p_user uuid, p_day date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
    v_tz    text := public.attendance_time_zone();
    v_count integer := 0;
    v_min   integer;
    r       record;
    v_hour  numeric;
    v_slot  integer;
    -- index 1 = morning, 2 = afternoon, 3 = overtime
    v_in    timestamptz[] := ARRAY[NULL, NULL, NULL]::timestamptz[];
    v_out   timestamptz[] := ARRAY[NULL, NULL, NULL]::timestamptz[];
BEGIN
    FOR r IN
        SELECT t.clock_in, t.clock_out
          FROM public.timesheets t
         WHERE t.user_id = p_user
           AND COALESCE(t.approval_status, 'pending') <> 'rejected'
           AND t.clock_out IS NOT NULL
           AND (t.clock_in AT TIME ZONE v_tz)::date = p_day
         ORDER BY t.clock_in
    LOOP
        v_count := v_count + 1;

        -- Local hour-of-day of the clock-in picks the natural column pair.
        v_hour := EXTRACT(HOUR   FROM (r.clock_in AT TIME ZONE v_tz))
                + EXTRACT(MINUTE FROM (r.clock_in AT TIME ZONE v_tz)) / 60.0;
        v_slot := CASE WHEN v_hour < 12 THEN 1 WHEN v_hour < 18 THEN 2 ELSE 3 END;

        -- If that pair is already used, overflow to the next free one.
        WHILE v_slot <= 3 AND v_in[v_slot] IS NOT NULL LOOP
            v_slot := v_slot + 1;
        END LOOP;
        IF v_slot > 3 THEN v_slot := 3; END IF; -- fold rare extras into overtime

        v_in[v_slot]  := r.clock_in;
        v_out[v_slot] := r.clock_out;
    END LOOP;

    -- No live clock records remain (e.g. the only session was voided): blank the
    -- derived times on any existing row rather than leaving stale values.
    IF v_count = 0 THEN
        UPDATE public.dtr_records
           SET morning_in = NULL, morning_out = NULL,
               afternoon_in = NULL, afternoon_out = NULL,
               overtime_in = NULL, overtime_out = NULL,
               daily_total = NULL, updated_at = now()
         WHERE user_id = p_user AND record_date = p_day;
        RETURN;
    END IF;

    v_min := public.attendance_daily_minutes(p_user, p_day);

    INSERT INTO public.dtr_records (
        user_id, record_date,
        morning_in, morning_out, afternoon_in, afternoon_out,
        overtime_in, overtime_out, daily_total, created_at, updated_at
    ) VALUES (
        p_user, p_day,
        v_in[1], v_out[1], v_in[2], v_out[2], v_in[3], v_out[3],
        CASE WHEN v_min > 0 THEN round(v_min / 60.0, 2) ELSE NULL END,
        now(), now()
    )
    ON CONFLICT (user_id, record_date) DO UPDATE
       SET morning_in    = EXCLUDED.morning_in,
           morning_out   = EXCLUDED.morning_out,
           afternoon_in  = EXCLUDED.afternoon_in,
           afternoon_out = EXCLUDED.afternoon_out,
           overtime_in   = EXCLUDED.overtime_in,
           overtime_out  = EXCLUDED.overtime_out,
           daily_total   = EXCLUDED.daily_total,
           updated_at    = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_sync_dtr_record(uuid,date) FROM PUBLIC, anon, authenticated;


-- D2. Trigger wrapper: sync only admin-sourced changes. A student's own live
--     clock write (entry_source 'clock', corrected_at NULL) is ignored, so the
--     existing client-side dtr_records path is unchanged. dtr_records is never
--     touched here except through the SECURITY DEFINER function above, and that
--     function writes to dtr_records only — so the trigger cannot recurse.
CREATE OR REPLACE FUNCTION public.sync_dtr_on_admin_timesheet()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
    IF NEW.corrected_at IS NOT NULL OR NEW.entry_source = 'admin' THEN
        PERFORM public.admin_sync_dtr_record(
            NEW.user_id,
            (NEW.clock_in AT TIME ZONE public.attendance_time_zone())::date
        );
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_dtr_on_admin_timesheet ON public.timesheets;
CREATE TRIGGER trg_sync_dtr_on_admin_timesheet
    AFTER INSERT OR UPDATE OF clock_in, clock_out, break_start, break_end,
                              status, approval_status, corrected_at, entry_source
    ON public.timesheets
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_dtr_on_admin_timesheet();


-- D3. One-time backfill: repair every day that already carries an admin
--     correction but whose dtr_records row was never updated.
DO $backfill$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT DISTINCT t.user_id AS uid,
               (t.clock_in AT TIME ZONE public.attendance_time_zone())::date AS day
          FROM public.timesheets t
         WHERE t.corrected_at IS NOT NULL OR t.entry_source = 'admin'
    LOOP
        PERFORM public.admin_sync_dtr_record(r.uid, r.day);
    END LOOP;
END
$backfill$;


-- ----------------------------------------------------------------------------
-- Tell PostgREST to reload its schema cache so the new RPCs are exposed.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
