-- ============================================================================
-- Year Levels catalog — which year levels the programme offers
-- ============================================================================
-- Year levels used to be hard-coded ('1st Year' … '4th Year') in the frontend
-- and in SQL, so offering a new one meant a code change and a deploy. This adds
-- a small catalog the Administrator manages at runtime. Every screen that lets
-- someone *choose* a year reads the active rows here; everything that only
-- *displays* existing data keeps matching by the year digit inside a section
-- name, so deactivating a level never hides sections, students, rosters, grades
-- or DTRs already in that year.
--
-- Design decisions, so the next reader does not have to reverse-engineer them:
--   * year_number is bounded 1–9. parseSectionName / canonical_section_name
--     match a SINGLE year digit inside 'COURSE-YEARLETTER' (e.g. DIT-3A), and
--     that name is stored in sections.name and profiles.section. Widening the
--     grammar past one digit is out of scope, so the catalog stops at 9.
--   * The label is derived server-side from the number (1st, 2nd, 3rd, 4th …
--     9th Year) — the admin never types free text — so it always parses back
--     through yearNumberFromLevel. Mirrors ordinalYearLabel() in
--     src/utils/sections.ts; keep the two in step.
--   * No DELETE. profiles.year_level stores the label text and section names
--     store the digit, so removing a row would orphan nothing in SQL but would
--     make existing data unexplainable. Deactivate instead.
--   * SECURITY DEFINER RPCs, because the table has NO write RLS policy: all
--     writes go through admin_create_year_level / admin_set_year_level_active,
--     each gated by public.is_admin().
--   * SELECT is granted to `authenticated` only. Onboarding (the earliest year
--     choice) runs after sign-in — complete_signup_registration needs
--     auth.uid() — so no `anon` read is required.
--
-- Seeds exactly 1st–4th Year, all active, so the day this ships nothing visible
-- changes. Idempotent and safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.year_levels (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    year_number smallint NOT NULL UNIQUE CHECK (year_number BETWEEN 1 AND 9),
    label       text     NOT NULL UNIQUE,
    is_active   boolean  NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.year_levels IS
    'Catalog of year levels the programme offers. Choices read active rows; matching never does. Written only via admin_create_year_level / admin_set_year_level_active.';

-- ----------------------------------------------------------------------------
-- 2. Server-side label derivation (mirrors ordinalYearLabel in sections.ts)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.year_level_label(p_year_number smallint)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT p_year_number::text
        || CASE
             WHEN p_year_number = 1 THEN 'st'
             WHEN p_year_number = 2 THEN 'nd'
             WHEN p_year_number = 3 THEN 'rd'
             ELSE 'th'
           END
        || ' Year';
$$;

-- ----------------------------------------------------------------------------
-- 3. Seed 1st–4th Year (idempotent). Nothing visible changes on first deploy.
-- ----------------------------------------------------------------------------
INSERT INTO public.year_levels (year_number, label)
SELECT n, public.year_level_label(n::smallint)
FROM generate_series(1, 4) AS n
ON CONFLICT (year_number) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. RLS — everyone signed in may read; no one writes except through the RPCs.
-- ----------------------------------------------------------------------------
ALTER TABLE public.year_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view year levels" ON public.year_levels;
CREATE POLICY "Authenticated users can view year levels"
    ON public.year_levels FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policy on purpose. Writes go only through the two
-- SECURITY DEFINER RPCs below.

-- ----------------------------------------------------------------------------
-- 5. admin_create_year_level(smallint) — add one year level
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_year_level(p_year_number smallint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_label text;
    v_row   public.year_levels;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can do this.' USING ERRCODE = '42501';
    END IF;

    IF p_year_number IS NULL OR p_year_number < 1 OR p_year_number > 9 THEN
        RAISE EXCEPTION 'Year number must be between 1 and 9.';
    END IF;

    v_label := public.year_level_label(p_year_number);

    IF EXISTS (SELECT 1 FROM public.year_levels WHERE year_number = p_year_number) THEN
        RAISE EXCEPTION 'Year level % already exists.', v_label;
    END IF;

    INSERT INTO public.year_levels (year_number, label, created_by)
    VALUES (p_year_number, v_label, auth.uid())
    RETURNING * INTO v_row;

    PERFORM public.write_force_action_audit(
        'CREATE', 'System Settings',
        'Added year level ' || v_label || '.',
        'year_level', v_row.id::text, v_label,
        NULL,
        jsonb_build_object('year_number', v_row.year_number, 'label', v_row.label, 'is_active', v_row.is_active)
    );

    RETURN jsonb_build_object(
        'id', v_row.id,
        'year_number', v_row.year_number,
        'label', v_row.label,
        'is_active', v_row.is_active
    );
EXCEPTION
    WHEN unique_violation THEN
        -- Two admins adding the same number at once; year_number is UNIQUE.
        RAISE EXCEPTION 'Year level % already exists.', v_label;
END;
$$;

COMMENT ON FUNCTION public.admin_create_year_level(smallint) IS
    'Admin-only: add a year level (1–9). Label is derived server-side; the client sends only the number.';

REVOKE ALL    ON FUNCTION public.admin_create_year_level(smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_year_level(smallint) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. admin_set_year_level_active(uuid, boolean) — activate / deactivate one
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_year_level_active(p_id uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old public.year_levels;
    v_row public.year_levels;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an active administrator can do this.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_old FROM public.year_levels WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TARGET_NOT_FOUND';
    END IF;

    -- Refuse to leave the programme with no offered year at all.
    IF p_active IS FALSE AND v_old.is_active IS TRUE
       AND (SELECT count(*) FROM public.year_levels WHERE is_active) <= 1 THEN
        RAISE EXCEPTION 'At least one year level must remain active.';
    END IF;

    UPDATE public.year_levels
       SET is_active = p_active
     WHERE id = p_id
    RETURNING * INTO v_row;

    PERFORM public.write_force_action_audit(
        'STATUS_CHANGE', 'System Settings',
        CASE WHEN p_active THEN 'Activated year level ' ELSE 'Deactivated year level ' END || v_row.label || '.',
        'year_level', v_row.id::text, v_row.label,
        jsonb_build_object('is_active', v_old.is_active),
        jsonb_build_object('is_active', v_row.is_active)
    );

    RETURN jsonb_build_object(
        'id', v_row.id,
        'year_number', v_row.year_number,
        'label', v_row.label,
        'is_active', v_row.is_active
    );
END;
$$;

COMMENT ON FUNCTION public.admin_set_year_level_active(uuid, boolean) IS
    'Admin-only: activate or deactivate a year level. Deactivating hides it from new choices; existing data keeps matching. The last active level cannot be deactivated.';

REVOKE ALL    ON FUNCTION public.admin_set_year_level_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_year_level_active(uuid, boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. adviser_create_section — follow the catalog instead of a hard-coded [1-4]
-- ----------------------------------------------------------------------------
-- Supersedes the definition in supabase_adviser_create_section.sql. The only
-- change is the year bound: the grammar now accepts any single digit 1–9, and
-- the digit must be an ACTIVE year level in the catalog. Everything else — the
-- is_adviser() guard, course-family derivation, self-assignment, error voice,
-- grants — is unchanged. Keep in step with validateNewSectionName in
-- src/utils/sections.ts, which mirrors this guard with the active year list.
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
    v_year    smallint;
    v_section public.sections;
BEGIN
    IF NOT public.is_adviser() THEN
        RAISE EXCEPTION 'Unauthorized: only an active Section Adviser may create a section.';
    END IF;

    SELECT adviser_type, course, department_id
      INTO v_type, v_course, v_dept
      FROM public.profiles
     WHERE auth_user_id = auth.uid();

    v_code := CASE
        WHEN v_type = 'HT Adviser' THEN 'DHT'
        WHEN v_type = 'IT Adviser' THEN 'DIT'
        WHEN upper(btrim(coalesce(v_course, ''))) IN ('DHT','DIT') THEN upper(btrim(v_course))
        ELSE NULL
    END;

    IF v_code IS NULL THEN
        RAISE EXCEPTION 'Your adviser profile has no course assigned. Ask the SIL Coordinator to set your adviser type before adding a section.';
    END IF;

    -- Grammar first (single year digit 1–9, one letter), then the catalog.
    IF v_name !~ '^[A-Z0-9]{2,10}-[1-9][A-Z]$' THEN
        RAISE EXCEPTION 'Invalid section name "%". Use the COURSE-YEARLETTER format, for example %-1A, with a year of 1 to 9 and a single letter.', v_name, v_code;
    END IF;

    IF split_part(v_name, '-', 1) <> v_code THEN
        RAISE EXCEPTION 'You may only create % sections. "%" belongs to another course.', v_code, v_name;
    END IF;

    v_year := substring(v_name from '-([1-9])[A-Z]$')::smallint;
    IF NOT EXISTS (SELECT 1 FROM public.year_levels WHERE year_number = v_year AND is_active) THEN
        RAISE EXCEPTION 'Year % is not an active year level. Ask the Administrator to add it under Year Levels first.', v_year;
    END IF;

    IF EXISTS (SELECT 1 FROM public.sections WHERE upper(btrim(name)) = v_name) THEN
        RAISE EXCEPTION 'Section % already exists. Ask the SIL Coordinator to assign it to you.', v_name;
    END IF;

    INSERT INTO public.sections (name, course_code, department_id)
    VALUES (v_name, v_code, v_dept)
    RETURNING * INTO v_section;

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
        RAISE EXCEPTION 'Section % already exists. Ask the SIL Coordinator to assign it to you.', v_name;
END;
$$;

REVOKE ALL    ON FUNCTION public.adviser_create_section(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adviser_create_section(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY (read-only)
-- ============================================================================
--   SELECT year_number, label, is_active FROM public.year_levels ORDER BY year_number;
--   -- expect 1st–4th Year, all active, after a fresh deploy.
