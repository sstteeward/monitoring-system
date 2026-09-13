-- ============================================================================
-- Adviser: create one of their own sections and take it in the same step
-- ============================================================================
-- Section creation used to be coordinator-only, which made every new section a
-- request. The adviser is the person who knows their own sections, so they may
-- now add one — but only inside their own course family, because
-- trg_validate_adviser_course_assignment (and the SIL rules it encodes) allow a
-- DHT section only for an HT Adviser and a DIT section only for an IT Adviser.
--
-- SECURITY DEFINER on purpose: advisers hold no INSERT privilege on
-- public.sections or public.adviser_sections, and they must not be given one.
-- This function is the whole of the adviser's write access, and it re-derives
-- the course code from the caller's own profile rather than trusting any
-- argument.
--
-- The name grammar mirrors src/utils/sections.ts (COURSE-YEARLETTER, years 1–4,
-- letters A–Z). The A–J of SECTION_LETTERS is what the dropdowns offer, not the
-- limit of what a cohort may be called, and public.canonical_section_name already
-- accepts any letter — so a section past J parses, canonicalises and reaches
-- student onboarding like any other. Keep the two in step.
--
-- Nothing here adds a table, column, constraint, index or RLS policy, and no
-- existing policy is relaxed. It is safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.adviser_create_section(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_name    text := upper(btrim(coalesce(p_name, '')));
    v_type    text;
    v_course  text;
    v_dept    uuid;
    v_code    text;
    v_section public.sections;
BEGIN
    IF NOT public.is_adviser() THEN
        RAISE EXCEPTION 'Unauthorized: only an active Section Adviser may create a section.';
    END IF;

    SELECT adviser_type, course, department_id
      INTO v_type, v_course, v_dept
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    -- The adviser's own course family. Mirrors AdviserDashboard's derivation, but
    -- server-side, and refuses rather than defaulting when it cannot be resolved.
    v_code := CASE
        WHEN v_type = 'HT Adviser' THEN 'DHT'
        WHEN v_type = 'IT Adviser' THEN 'DIT'
        WHEN upper(btrim(coalesce(v_course, ''))) IN ('DHT','DIT') THEN upper(btrim(v_course))
        ELSE NULL
    END;

    IF v_code IS NULL THEN
        RAISE EXCEPTION 'Your adviser profile has no course assigned. Ask the SIL Coordinator to set your adviser type before adding a section.';
    END IF;

    IF v_name !~ '^[A-Z0-9]{2,10}-[1-4][A-Z]$' THEN
        RAISE EXCEPTION 'Invalid section name "%". Use the COURSE-YEARLETTER format, for example %-1A, with a year of 1 to 4 and a single letter.', v_name, v_code;
    END IF;

    IF split_part(v_name, '-', 1) <> v_code THEN
        RAISE EXCEPTION 'You may only create % sections. "%" belongs to another course.', v_code, v_name;
    END IF;

    IF EXISTS (SELECT 1 FROM public.sections WHERE upper(btrim(name)) = v_name) THEN
        RAISE EXCEPTION 'Section % already exists. Ask the SIL Coordinator to assign it to you.', v_name;
    END IF;

    INSERT INTO public.sections (name, course_code, department_id)
    VALUES (v_name, v_code, v_dept)
    RETURNING * INTO v_section;

    -- Creating without holding it would leave an orphan section only the
    -- coordinator could resolve, so the assignment is part of the same transaction.
    INSERT INTO public.adviser_sections (adviser_id, section_id, assigned_by, status, assigned_at)
    VALUES (auth.uid(), v_section.id, auth.uid(), 'active', now());

    RETURN jsonb_build_object(
        'id',            v_section.id,
        'name',          v_section.name,
        'course_code',   v_section.course_code,
        'department_id', v_section.department_id
    );
EXCEPTION
    WHEN unique_violation THEN
        -- Two advisers pressing Add at the same moment; sections.name is UNIQUE.
        RAISE EXCEPTION 'Section % already exists. Ask the SIL Coordinator to assign it to you.', v_name;
END;
$$;

COMMENT ON FUNCTION public.adviser_create_section(text) IS
    'Lets an active Section Adviser create a section in their own course family and assign themselves to it. Course code and department are derived from the caller''s profile, never from the client.';

-- Postgres grants EXECUTE to PUBLIC on creation, which would leave this
-- SECURITY DEFINER function callable by the `anon` role over /rest/v1/rpc. It
-- already refuses an anonymous caller — auth.uid() is NULL, so is_adviser() is
-- false — but there is no reason to expose it at all.
REVOKE ALL       ON FUNCTION public.adviser_create_section(text) FROM PUBLIC, anon;
GRANT EXECUTE    ON FUNCTION public.adviser_create_section(text) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- VERIFY (read-only) — run after the migration above
-- ============================================================================
-- Which sections each adviser holds, including the ones they created
-- themselves (assigned_by = adviser_id):
--
--   SELECT pr.email, s.name, s.course_code, a.status,
--          (a.assigned_by = a.adviser_id) AS self_created
--   FROM public.adviser_sections a
--   JOIN public.sections s  ON s.id = a.section_id
--   JOIN public.profiles pr ON pr.auth_user_id = a.adviser_id
--   ORDER BY pr.email, s.name;
--
-- Confirm no write privilege was granted on the tables themselves — advisers
-- must still reach them only through this function:
--
--   SELECT table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE grantee = 'authenticated'
--     AND table_name IN ('sections', 'adviser_sections')
--   ORDER BY table_name, privilege_type;
