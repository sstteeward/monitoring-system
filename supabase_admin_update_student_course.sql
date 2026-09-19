-- ============================================================================
-- Admin: change a student's course
-- ============================================================================
-- Administrators have no direct UPDATE policy on public.profiles (only the
-- owner, coordinators for their students/advisers, and advisers for their
-- section students do). So an admin edit of a student's course goes through a
-- SECURITY DEFINER RPC gated by public.is_admin(), exactly like the existing
-- admin_set_user_company / admin_update_user_* family.
--
-- Section coupling: a section name embeds the course (DIT-1A). If the student's
-- saved section is a generated name for a DIFFERENT course, it no longer fits
-- after the change, so it is cleared — the student is re-assigned rather than
-- left rostered under the wrong course. A free-text / legacy section is left
-- untouched. Everything else on the profile is unchanged.
--
-- Idempotent and safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_update_student_course(target_user_id uuid, p_course text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target        public.profiles%ROWTYPE;
    v_code          text := upper(btrim(coalesce(p_course, '')));
    v_name          text;
    v_new_section   text;
    v_parsed_course text;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED: Only active administrators can perform this action.' USING ERRCODE = '42501';
    END IF;

    IF v_code = '' THEN
        RAISE EXCEPTION 'A course is required.';
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE auth_user_id = target_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    IF v_target.account_type <> 'student' THEN
        RAISE EXCEPTION 'Only a student''s course can be changed here.';
    END IF;

    -- The course must be one the catalog still offers, unless it is the value
    -- already saved (an idempotent re-save must never be refused).
    IF v_code <> upper(btrim(coalesce(v_target.course, '')))
       AND NOT EXISTS (
           SELECT 1 FROM public.courses c
           WHERE upper(btrim(c.code)) = v_code AND c.is_active
       ) THEN
        RAISE EXCEPTION 'Course % is not an active course. Add or activate it under Courses first.', v_code;
    END IF;

    -- Clear the section only when it is a generated name for another course.
    v_new_section := v_target.section;
    v_parsed_course := upper(substring(upper(btrim(coalesce(v_target.section, '')))
                                       from '^([A-Z0-9]{2,10})-[1-9][A-Z]$'));
    IF v_parsed_course IS NOT NULL AND v_parsed_course <> '' AND v_parsed_course <> v_code THEN
        v_new_section := NULL;
    END IF;

    UPDATE public.profiles
       SET course = v_code, section = v_new_section
     WHERE auth_user_id = target_user_id;

    v_name := coalesce(nullif(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), ''), v_target.email);
    PERFORM public.write_privileged_audit_log(
        'UPDATE', 'User Management',
        format('Changed course for %s', coalesce(v_name, target_user_id::text)),
        target_user_id, v_name,
        jsonb_build_object('course', v_target.course, 'section', v_target.section),
        jsonb_build_object('course', v_code, 'section', v_new_section)
    );

    RETURN jsonb_build_object(
        'course', v_code,
        'section', v_new_section,
        'section_cleared', (v_new_section IS NULL AND v_target.section IS NOT NULL)
    );
END;
$$;

COMMENT ON FUNCTION public.admin_update_student_course(uuid, text) IS
    'Admin-only: set a student''s course (by catalog code). Clears a generated section that belongs to another course. Writes an audit row.';

REVOKE ALL    ON FUNCTION public.admin_update_student_course(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_student_course(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
