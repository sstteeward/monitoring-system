-- ============================================================================
-- Admin: change a student's year level
-- ============================================================================
-- Sibling of admin_update_student_course. Admins have no direct UPDATE policy on
-- public.profiles, so this SECURITY DEFINER RPC gated by public.is_admin() is the
-- path. profiles.year_level stores the label text ('3rd Year'); the client sends
-- a label chosen from the active catalog, and the server re-derives the canonical
-- label from year_levels so what is stored always parses back to its number.
--
-- Section coupling: a section name embeds the year digit (DIT-3A). If the saved
-- section is a generated name for a DIFFERENT year, it is cleared so the student
-- is re-assigned rather than left in a section for the wrong year. A free-text /
-- legacy section is left untouched.
--
-- Idempotent and safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_update_student_year_level(target_user_id uuid, p_year_level text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target      public.profiles%ROWTYPE;
    v_input       text := btrim(coalesce(p_year_level, ''));
    v_num         smallint;
    v_label       text;
    v_name        text;
    v_new_section text;
    v_sec_year    smallint;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED: Only active administrators can perform this action.' USING ERRCODE = '42501';
    END IF;

    IF v_input = '' THEN
        RAISE EXCEPTION 'A year level is required.';
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE auth_user_id = target_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    IF v_target.account_type <> 'student' THEN
        RAISE EXCEPTION 'Only a student''s year level can be changed here.';
    END IF;

    -- The digit inside the label ('3rd Year' -> 3) is what a section name and
    -- every matcher use.
    v_num := (substring(v_input from '(\d+)'))::smallint;
    IF v_num IS NULL OR v_num < 1 OR v_num > 9 THEN
        RAISE EXCEPTION 'Year level "%" is not valid.', v_input;
    END IF;

    -- Re-save of the current value is always allowed; otherwise it must be an
    -- active catalog level, and the stored label is the catalog's canonical one.
    IF v_input = btrim(coalesce(v_target.year_level, '')) THEN
        v_label := v_target.year_level;
    ELSE
        SELECT label INTO v_label FROM public.year_levels WHERE year_number = v_num AND is_active;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Year % is not an active year level. Add or activate it under Year Levels first.', v_num;
        END IF;
    END IF;

    -- Clear the section only when it is a generated name for another year.
    v_new_section := v_target.section;
    v_sec_year := (substring(upper(btrim(coalesce(v_target.section, ''))) from '^[A-Z0-9]{2,10}-([1-9])[A-Z]$'))::smallint;
    IF v_sec_year IS NOT NULL AND v_sec_year <> v_num THEN
        v_new_section := NULL;
    END IF;

    UPDATE public.profiles
       SET year_level = v_label, section = v_new_section
     WHERE auth_user_id = target_user_id;

    v_name := coalesce(nullif(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), ''), v_target.email);
    PERFORM public.write_privileged_audit_log(
        'UPDATE', 'User Management',
        format('Changed year level for %s', coalesce(v_name, target_user_id::text)),
        target_user_id, v_name,
        jsonb_build_object('year_level', v_target.year_level, 'section', v_target.section),
        jsonb_build_object('year_level', v_label, 'section', v_new_section)
    );

    RETURN jsonb_build_object(
        'year_level', v_label,
        'section', v_new_section,
        'section_cleared', (v_new_section IS NULL AND v_target.section IS NOT NULL)
    );
END;
$$;

COMMENT ON FUNCTION public.admin_update_student_year_level(uuid, text) IS
    'Admin-only: set a student''s year level (validated against the active year_levels catalog). Clears a generated section that belongs to another year. Writes an audit row.';

REVOKE ALL    ON FUNCTION public.admin_update_student_year_level(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_student_year_level(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
