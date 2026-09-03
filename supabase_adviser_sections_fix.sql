-- ============================================================================
-- Adviser → My Sections fix
-- ============================================================================
-- Problem this solves
-- -------------------
-- `sections.name` stores the canonical section name ("DIT-1A"), but a student's
-- `profiles.section` may still hold the legacy bare letter ("A" / "a") with the
-- course code and year level living in `profiles.course` / `profiles.year_level`.
-- Every roster/count query compared those two values directly, so a section that
-- really has students reported "0 Students Enrolled".
--
-- What this migration adds
-- ------------------------
--   1. canonical_section_name()          - single server-side source of truth for
--                                          resolving a student's section value to
--                                          the canonical "DIT-1A" form. Mirrors
--                                          src/utils/sections.ts.
--   2. get_adviser_sections()            - every section assigned to the caller,
--                                          with an accurate student count.
--   3. get_adviser_section_students()    - roster for ONE section, refusing any
--                                          section not assigned to the caller.
--   4. get_adviser_students()            - roster across all assigned sections.
--   5. Corrected adviser RLS predicates so they compare canonical names too.
--   6. A unique (adviser_id, section_id) index so a duplicate assignment cannot
--      be created.
--
-- Nothing here removes an existing policy, table, column or function, and no
-- student/section row is modified. It is safe to re-run.
-- ============================================================================

-- ─── 1. Canonical section name ──────────────────────────────────────────────
-- "DIT-1A"              → "DIT-1A"   (already canonical)
-- "A"   + DIT + 1st Year → "DIT-1A"  (legacy bare letter)
-- "a"   + DIT + 1st Year → "DIT-1A"  (legacy, wrong case)
-- "F"   + IT  + 3rd Year → "IT-3F"   (course with no matching section row)
-- NULL / ''              → NULL      (student has no section yet)
CREATE OR REPLACE FUNCTION public.canonical_section_name(
    p_section    text,
    p_course     text,
    p_year_level text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN v.sec = '' THEN NULL
        -- Already a generated name: COURSE-<year><letter>
        WHEN v.sec ~ '^[A-Z0-9]{2,10}-[0-9][A-Z]$' THEN v.sec
        -- Legacy bare letter: rebuild it from course code + year level
        WHEN v.sec ~ '^[A-Z]$' AND v.code <> '' AND v.yr IS NOT NULL AND v.yr <> ''
             THEN v.code || '-' || v.yr || v.sec
        -- Anything else (coordinator-created or free-text) is used as-is
        ELSE v.sec
    END
    FROM (
        SELECT
            upper(btrim(coalesce(p_section, ''))) AS sec,
            CASE
                WHEN upper(btrim(coalesce(p_course, ''))) ~ '^[A-Z0-9]{2,10}$'
                    THEN upper(btrim(p_course))
                ELSE ''
            END AS code,
            substring(coalesce(p_year_level, '') from '([0-9]+)') AS yr
    ) v;
$$;

COMMENT ON FUNCTION public.canonical_section_name(text, text, text) IS
    'Resolves a student profile''s section value to the canonical sections.name form ("DIT-1A"). Server-side mirror of src/utils/sections.ts.';


-- ─── 2. Sections assigned to the calling adviser, with real student counts ───
-- Deliberately takes no adviser argument: the caller can only ever see their own
-- assignments.
CREATE OR REPLACE FUNCTION public.get_adviser_sections()
RETURNS TABLE (
    id            uuid,
    name          text,
    course_code   text,
    department_id uuid,
    created_at    timestamptz,
    assigned_at   timestamptz,
    student_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        s.id,
        s.name,
        s.course_code,
        s.department_id,
        s.created_at,
        a.assigned_at,
        (
            SELECT count(*)
            FROM public.profiles p
            WHERE p.account_type = 'student'
              AND public.canonical_section_name(p.section, p.course, p.year_level)
                  = upper(btrim(s.name))
        ) AS student_count
    FROM public.adviser_sections a
    JOIN public.sections s ON s.id = a.section_id
    WHERE a.adviser_id = auth.uid()
      AND a.status = 'active'
    ORDER BY s.name;
$$;

COMMENT ON FUNCTION public.get_adviser_sections() IS
    'Every active section assigned to the calling adviser, each with its true enrolled-student count.';


-- ─── 3. Roster for a single assigned section ────────────────────────────────
-- Raises rather than returning an empty set when the caller is not entitled to
-- the section, so the UI can tell "no students" apart from "not allowed".
CREATE OR REPLACE FUNCTION public.get_adviser_section_students(p_section_id uuid)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role         text;
    v_section_name text;
BEGIN
    SELECT account_type INTO v_role
    FROM public.profiles
    WHERE auth_user_id = auth.uid();

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: no profile found for the current user.';
    END IF;

    SELECT s.name INTO v_section_name
    FROM public.sections s
    WHERE s.id = p_section_id;

    IF v_section_name IS NULL THEN
        RAISE EXCEPTION 'Section not found.';
    END IF;

    IF v_role = 'adviser' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.adviser_sections a
            WHERE a.adviser_id = auth.uid()
              AND a.section_id = p_section_id
              AND a.status = 'active'
        ) THEN
            RAISE EXCEPTION 'Unauthorized: section % is not assigned to you.', v_section_name;
        END IF;
    ELSIF v_role NOT IN ('coordinator', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: only advisers, coordinators and admins may view a section roster.';
    END IF;

    RETURN QUERY
        SELECT p.*
        FROM public.profiles p
        WHERE p.account_type = 'student'
          AND public.canonical_section_name(p.section, p.course, p.year_level)
              = upper(btrim(v_section_name))
        ORDER BY p.last_name NULLS LAST, p.first_name NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_adviser_section_students(uuid) IS
    'Students of one section. Advisers may only pass a section assigned to them; coordinators and admins may pass any.';


-- ─── 4. Roster across every section assigned to the caller ──────────────────
CREATE OR REPLACE FUNCTION public.get_adviser_students(p_section_name text DEFAULT NULL)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role   text;
    v_filter text := nullif(upper(btrim(coalesce(p_section_name, ''))), '');
BEGIN
    SELECT account_type INTO v_role
    FROM public.profiles
    WHERE auth_user_id = auth.uid();

    IF v_role IS DISTINCT FROM 'adviser' THEN
        RAISE EXCEPTION 'Unauthorized: only advisers may load their own section rosters.';
    END IF;

    -- A filter naming a section the adviser does not hold must not silently fall
    -- back to "all my students".
    IF v_filter IS NOT NULL AND v_filter <> 'ALL' AND NOT EXISTS (
        SELECT 1
        FROM public.adviser_sections a
        JOIN public.sections s ON s.id = a.section_id
        WHERE a.adviser_id = auth.uid()
          AND a.status = 'active'
          AND upper(btrim(s.name)) = v_filter
    ) THEN
        RAISE EXCEPTION 'Unauthorized: section % is not assigned to you.', p_section_name;
    END IF;

    RETURN QUERY
        SELECT p.*
        FROM public.profiles p
        WHERE p.account_type = 'student'
          AND public.canonical_section_name(p.section, p.course, p.year_level) IN (
                SELECT upper(btrim(s.name))
                FROM public.adviser_sections a
                JOIN public.sections s ON s.id = a.section_id
                WHERE a.adviser_id = auth.uid()
                  AND a.status = 'active'
                  AND (v_filter IS NULL OR v_filter = 'ALL' OR upper(btrim(s.name)) = v_filter)
          )
        ORDER BY p.last_name NULLS LAST, p.first_name NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_adviser_students(text) IS
    'Students across every section assigned to the calling adviser, optionally narrowed to one of those sections.';


-- ─── 5. Adviser RLS predicates now compare canonical names ──────────────────
-- Same scope as before (own profile + students of assigned sections); the only
-- change is that a legacy "A" section value now resolves to "DIT-1A" before the
-- comparison, so the policy matches the students it was always meant to match.
DROP POLICY IF EXISTS "Advisers can view assigned section students" ON public.profiles;
CREATE POLICY "Advisers can view assigned section students"
    ON public.profiles
    FOR SELECT
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
    );

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
    );


-- ─── 6. No duplicate adviser ↔ section assignments ──────────────────────────
-- `unique_active_section_assignment` already keeps one adviser per section; this
-- also rules out the same pair being inserted twice.
CREATE UNIQUE INDEX IF NOT EXISTS adviser_sections_adviser_section_uniq
    ON public.adviser_sections (adviser_id, section_id);


-- ─── 7. Grants ──────────────────────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC on creation, which would leave the three
-- SECURITY DEFINER functions callable by the `anon` role over /rest/v1/rpc.
-- They already refuse an anonymous caller — auth.uid() is NULL, so there is no
-- profile and no assignment — but there is no reason to expose them at all.
REVOKE EXECUTE ON FUNCTION public.get_adviser_sections()             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_adviser_section_students(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_adviser_students(text)         FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_adviser_sections()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_adviser_section_students(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_adviser_students(text)         TO authenticated;

-- canonical_section_name is deliberately left executable by PUBLIC. It is
-- SECURITY INVOKER and pure text manipulation, it exposes no data, and the RLS
-- policies below call it — revoking it could turn an anonymous read into a
-- permission error instead of an empty result.
GRANT EXECUTE ON FUNCTION public.canonical_section_name(text, text, text) TO authenticated;


-- ============================================================================
-- VERIFY (read-only) — run after the migration above
-- ============================================================================
-- Real head count per section. Before this migration every row read 0 because
-- `profiles.section` held "A" while `sections.name` held "DIT-1A".
--
--   SELECT s.name,
--          count(p.id) AS students
--   FROM public.sections s
--   LEFT JOIN public.profiles p
--     ON p.account_type = 'student'
--    AND public.canonical_section_name(p.section, p.course, p.year_level)
--        = upper(btrim(s.name))
--   GROUP BY s.name
--   ORDER BY s.name;
--
-- Which sections each adviser holds:
--
--   SELECT pr.email, s.name, a.status
--   FROM public.adviser_sections a
--   JOIN public.sections s  ON s.id = a.section_id
--   JOIN public.profiles pr ON pr.auth_user_id = a.adviser_id
--   ORDER BY pr.email, s.name;


-- ============================================================================
-- OPTIONAL A — give an adviser several sections, to exercise the page
-- ============================================================================
-- The Coordinator portal is the supported way to do this (Advisers → Assign
-- Section, tick as many sections as needed). This is the SQL equivalent, useful
-- for testing. Replace the email with the adviser you want.
--
--   INSERT INTO public.adviser_sections (adviser_id, section_id, assigned_by, status)
--   SELECT pr.auth_user_id, s.id, pr.auth_user_id, 'active'
--   FROM public.profiles pr
--   CROSS JOIN public.sections s
--   WHERE pr.email = 'cbsuelto.student@asiancollege.edu.ph'
--     AND s.name IN ('DIT-1A', 'DIT-1B', 'DIT-1C', 'DIT-2A')
--   ON CONFLICT (section_id) DO UPDATE
--     SET adviser_id = EXCLUDED.adviser_id, status = 'active', assigned_at = now();


-- ============================================================================
-- OPTIONAL B — normalise legacy section values (changes student rows)
-- ============================================================================
-- Not required: every query above already resolves "A" + DIT + 1st Year to
-- "DIT-1A" on the fly. Running this makes the stored data match what onboarding
-- writes today, which also tidies up features that still group on the raw value
-- (Grades, the coordinator's bulk section rename).
--
-- Review the preview before running the UPDATE.
--
--   -- Preview
--   SELECT id, email, section AS current_value,
--          public.canonical_section_name(section, course, year_level) AS new_value
--   FROM public.profiles
--   WHERE account_type = 'student'
--     AND section IS NOT NULL
--     AND section IS DISTINCT FROM public.canonical_section_name(section, course, year_level);
--
--   -- Apply
--   UPDATE public.profiles
--   SET section = public.canonical_section_name(section, course, year_level)
--   WHERE account_type = 'student'
--     AND section IS NOT NULL
--     AND section IS DISTINCT FROM public.canonical_section_name(section, course, year_level);
--
-- Note that some students resolve to sections that do not exist as rows yet
-- (DIT-1F, DIT-3D, DIT-3F, DHT-3D, DHT-4F, BSIT-3A, IT-3F). Create those in the
-- Coordinator portal if advisers are meant to handle them.
