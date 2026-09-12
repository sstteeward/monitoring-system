-- ═══════════════════════════════════════════════════════════════════════════
-- OFFICIAL SIL GRADING SHEET
--
-- The grading sheet is the final output of the whole SIL monitoring process:
--
--   Adviser → Assigned Section → SIL Students → Final Grade
--           → Official Grading Sheet → Coordinator Verification
--           → Finalized Academic Record
--
-- Design rules this file enforces:
--
--   1. No duplicated student identity. A grading sheet item points at
--      public.profiles; the name, student number and section are always read
--      from there, so a corrected profile corrects every sheet showing it.
--
--   2. No client write path. The four grade tables grant SELECT only. Every
--      change goes through a SECURITY DEFINER function that checks the sheet's
--      status and writes a grade_audit_logs row in the same transaction, so a
--      grade change without an audit record is unreachable.
--
--   3. Remarks are derived, never typed. A trigger computes PASSED / FAILED
--      from the grade and the sheet's own passing mark.
--
--   4. Policy is configuration. The passing mark, the allowed range, the
--      printed subject line and the component weights live in
--      public.grading_settings. Each sheet freezes the range and the passing
--      mark at creation so a later policy change cannot silently re-grade a
--      record that is already verified.
--
-- This file is idempotent and safe to re-run.
--
-- Applied as migrations:
--   20260912032811  official_grading_sheet_tables
--   20260912032942  official_grading_sheet_functions
--   20260912033156  official_grading_sheet_workflow
--   20260912033232  official_grading_sheet_rls
--   20260912033326  grade_audit_logs_immutability_scope
--   20260912033454  grading_functions_harden_search_path_and_anon
--   20260912040901  set_student_number_rpc
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Student number ─────────────────────────────────────────────────────────
-- The official sheet prints "2023-24610795" beside every name and the system
-- had nowhere to keep it. It lives on the profile, like every other piece of
-- student identity, never on the grading sheet.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS student_number text;

COMMENT ON COLUMN public.profiles.student_number IS
    'Official school student number (e.g. 2023-24610795). Printed on the Official Grading Sheet.';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_student_number_key
    ON public.profiles (upper(btrim(student_number)))
    WHERE student_number IS NOT NULL AND btrim(student_number) <> '';

-- ── School years ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_years (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_year  text NOT NULL CHECK (school_year ~ '^[0-9]{4}-[0-9]{4}$'),
    semester     text NOT NULL CHECK (semester IN ('FIRST', 'SECOND', 'SUMMER')),
    is_active    boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (school_year, semester)
);

COMMENT ON TABLE public.school_years IS
    'One row per school year + semester. A grading sheet is always scoped to one of these.';

-- ── Grading settings ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grading_settings (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope              text NOT NULL DEFAULT 'global' CHECK (scope = 'global'),
    subject_code       text NOT NULL DEFAULT 'SIL',
    course_description text NOT NULL DEFAULT 'SUPERVISED INDUSTRY LEARNING',
    min_grade          numeric(5,2) NOT NULL DEFAULT 0,
    max_grade          numeric(5,2) NOT NULL DEFAULT 100,
    passing_grade      numeric(5,2) NOT NULL DEFAULT 75,
    -- Weights of the components the calculation layer may draw on, as
    -- percentages that add up to 100. Read by the grade calculation service;
    -- never hard-coded in the UI.
    components         jsonb NOT NULL DEFAULT jsonb_build_object(
                           'company_evaluation', 40,
                           'adviser_evaluation', 20,
                           'attendance',         20,
                           'journals',           10,
                           'requirements',       10
                       ),
    updated_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT grading_settings_range_ck CHECK (max_grade > min_grade),
    CONSTRAINT grading_settings_passing_ck
        CHECK (passing_grade >= min_grade AND passing_grade <= max_grade),
    CONSTRAINT grading_settings_one_global UNIQUE (scope)
);

-- ── Grading sheets ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grading_sheets (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id         uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
    -- auth.users id, matching public.adviser_sections.adviser_id.
    adviser_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    school_year_id     uuid NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
    subject_code       text NOT NULL DEFAULT 'SIL',
    course_description text NOT NULL DEFAULT 'SUPERVISED INDUSTRY LEARNING',
    status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'for_review', 'verified', 'finalized')),
    -- Copied from grading_settings when the sheet is created. Frozen for the
    -- life of the sheet: the remarks printed on a finalized record must stay
    -- reproducible even if the institution later changes the passing mark.
    passing_grade      numeric(5,2) NOT NULL,
    min_grade          numeric(5,2) NOT NULL,
    max_grade          numeric(5,2) NOT NULL,
    return_reason      text,
    returned_at        timestamptz,
    returned_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    submitted_at       timestamptz,
    verified_at        timestamptz,
    verified_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    finalized_at       timestamptz,
    finalized_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT grading_sheets_range_ck CHECK (max_grade > min_grade),
    -- One official sheet per section per school year + semester. An adviser
    -- holding three sections therefore has three separate sheets.
    CONSTRAINT grading_sheets_section_term_key UNIQUE (section_id, school_year_id)
);

CREATE INDEX IF NOT EXISTS grading_sheets_adviser_idx ON public.grading_sheets (adviser_id);
CREATE INDEX IF NOT EXISTS grading_sheets_status_idx  ON public.grading_sheets (status);

COMMENT ON TABLE public.grading_sheets IS
    'One Official Grading Sheet per section per term. Status moves draft → for_review → verified → finalized.';

-- ── Grading sheet items ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grading_sheet_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grading_sheet_id uuid NOT NULL REFERENCES public.grading_sheets(id) ON DELETE CASCADE,
    -- public.profiles.id — the student's identity is READ from there, never
    -- copied here. No name, no student number, no section on this row.
    student_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    final_grade      numeric(5,2),
    remarks          text,
    grade_status     text NOT NULL DEFAULT 'pending'
                     CHECK (grade_status IN ('pending', 'encoded')),
    entered_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    entered_at       timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (grading_sheet_id, student_id)
);

CREATE INDEX IF NOT EXISTS grading_sheet_items_sheet_idx
    ON public.grading_sheet_items (grading_sheet_id);

-- ── Grade audit logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grade_audit_logs (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grading_sheet_id      uuid NOT NULL REFERENCES public.grading_sheets(id) ON DELETE CASCADE,
    grading_sheet_item_id uuid REFERENCES public.grading_sheet_items(id) ON DELETE SET NULL,
    student_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    action                text NOT NULL,
    old_grade             numeric(5,2),
    new_grade             numeric(5,2),
    old_status            text,
    new_status            text,
    reason                text,
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS grade_audit_logs_sheet_idx
    ON public.grade_audit_logs (grading_sheet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS grade_audit_logs_item_idx
    ON public.grade_audit_logs (grading_sheet_item_id, created_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.grade_audit_logs_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Grade audit records are immutable and cannot be % .', lower(TG_OP);
END;
$$;

-- Rewriting history is the risk worth a trigger; a cascade is not — blocking
-- DELETE here would make a section with any graded sheet impossible to delete.
-- DELETE is instead blocked for every application role by the absence of a
-- DELETE policy and of the DELETE grant (section 5).
DROP TRIGGER IF EXISTS grade_audit_logs_no_update ON public.grade_audit_logs;
CREATE TRIGGER grade_audit_logs_no_update
    BEFORE UPDATE ON public.grade_audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.grade_audit_logs_immutable();

-- Remarks are derived, never typed: the adviser cannot enter a remark that
-- disagrees with the grade. Computed here so it holds whichever path wrote the
-- row. Mirrored in src/utils/grading.ts — keep the two in step.
CREATE OR REPLACE FUNCTION public.grading_item_apply_remarks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_passing numeric(5,2);
    v_min     numeric(5,2);
    v_max     numeric(5,2);
BEGIN
    SELECT passing_grade, min_grade, max_grade
      INTO v_passing, v_min, v_max
      FROM public.grading_sheets
     WHERE id = NEW.grading_sheet_id;

    IF NEW.final_grade IS NULL THEN
        NEW.remarks      := NULL;
        NEW.grade_status := 'pending';
    ELSE
        IF NEW.final_grade < v_min OR NEW.final_grade > v_max THEN
            RAISE EXCEPTION 'Final grade % is outside the allowed range %–%.',
                NEW.final_grade, v_min, v_max;
        END IF;
        NEW.remarks      := CASE WHEN NEW.final_grade >= v_passing THEN 'PASSED' ELSE 'FAILED' END;
        NEW.grade_status := 'encoded';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grading_item_remarks ON public.grading_sheet_items;
CREATE TRIGGER grading_item_remarks
    BEFORE INSERT OR UPDATE ON public.grading_sheet_items
    FOR EACH ROW EXECUTE FUNCTION public.grading_item_apply_remarks();


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. AUTHORIZATION HELPERS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.current_account_type()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT account_type FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

/** Is the given section currently assigned to the signed-in adviser? */
CREATE OR REPLACE FUNCTION public.adviser_owns_section(p_section_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.adviser_sections
        WHERE section_id = p_section_id
          AND adviser_id = auth.uid()
          AND status = 'active'
    );
$$;

/**
 * "ABDUL AZIZ, MARIAM ISLAM B." — the name exactly as the official sheet
 * prints it: surname first, in capitals, then the given names and a middle
 * initial. Composed from the profile, so a corrected profile corrects the
 * sheet.
 */
CREATE OR REPLACE FUNCTION public.official_student_name(
    p_first text, p_middle text, p_last text, p_suffix text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT nullif(btrim(
        upper(btrim(coalesce(p_last, '')))
        || CASE WHEN btrim(coalesce(p_suffix, '')) <> ''
                THEN ' ' || upper(btrim(p_suffix)) ELSE '' END
        || CASE WHEN btrim(coalesce(p_last, '')) <> '' AND btrim(coalesce(p_first, '')) <> ''
                THEN ', ' ELSE '' END
        || upper(btrim(coalesce(p_first, '')))
        || CASE WHEN btrim(coalesce(p_middle, '')) <> ''
                THEN ' ' || upper(left(btrim(p_middle), 1)) || '.' ELSE '' END
    ), '');
$$;

/**
 * May the signed-in user see this grading sheet?
 *   adviser     — only their own sheets
 *   coordinator — sheets for sections in their department; every sheet when
 *                 they have no department set (departments are optional in
 *                 this deployment, and a null there must not hide the queue)
 *   admin       — all
 */
CREATE OR REPLACE FUNCTION public.can_view_grading_sheet(p_sheet_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role     text;
    v_dept     uuid;
    v_adviser  uuid;
    v_sec_dept uuid;
BEGIN
    SELECT p.account_type, p.department_id INTO v_role, v_dept
      FROM public.profiles p WHERE p.auth_user_id = auth.uid() LIMIT 1;

    IF v_role IS NULL THEN RETURN false; END IF;
    IF v_role = 'admin' THEN RETURN true; END IF;

    SELECT gs.adviser_id, s.department_id INTO v_adviser, v_sec_dept
      FROM public.grading_sheets gs
      JOIN public.sections s ON s.id = gs.section_id
     WHERE gs.id = p_sheet_id;

    IF v_adviser IS NULL THEN RETURN false; END IF;

    IF v_role = 'adviser'     THEN RETURN v_adviser = auth.uid(); END IF;
    IF v_role = 'coordinator' THEN RETURN v_dept IS NULL OR v_sec_dept IS NULL OR v_sec_dept = v_dept; END IF;

    RETURN false;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. API
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Reference data ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_school_years()
RETURNS TABLE (id uuid, school_year text, semester text, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT sy.id, sy.school_year, sy.semester, sy.is_active
      FROM public.school_years sy
     WHERE auth.uid() IS NOT NULL
     ORDER BY sy.school_year DESC,
              CASE sy.semester WHEN 'FIRST' THEN 1 WHEN 'SECOND' THEN 2 ELSE 3 END;
$$;

CREATE OR REPLACE FUNCTION public.get_grading_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT to_jsonb(g) - 'updated_by'
      FROM public.grading_settings g
     WHERE g.scope = 'global' AND auth.uid() IS NOT NULL;
$$;

/** Passing mark, range, weights and the printed subject line. Admin only. */
CREATE OR REPLACE FUNCTION public.update_grading_settings(
    p_passing_grade      numeric DEFAULT NULL,
    p_min_grade          numeric DEFAULT NULL,
    p_max_grade          numeric DEFAULT NULL,
    p_subject_code       text    DEFAULT NULL,
    p_course_description text    DEFAULT NULL,
    p_components         jsonb   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.grading_settings;
BEGIN
    IF public.current_account_type() <> 'admin' THEN
        RAISE EXCEPTION 'Only an administrator may change the grading configuration.';
    END IF;

    UPDATE public.grading_settings SET
        passing_grade      = COALESCE(p_passing_grade, passing_grade),
        min_grade          = COALESCE(p_min_grade, min_grade),
        max_grade          = COALESCE(p_max_grade, max_grade),
        subject_code       = COALESCE(NULLIF(btrim(p_subject_code), ''), subject_code),
        course_description = COALESCE(NULLIF(btrim(p_course_description), ''), course_description),
        components         = COALESCE(p_components, components),
        updated_by         = auth.uid(),
        updated_at         = now()
     WHERE scope = 'global'
    RETURNING * INTO v_row;

    RETURN to_jsonb(v_row) - 'updated_by';
END;
$$;

-- ── Roster sync ────────────────────────────────────────────────────────────

/**
 * Brings a sheet's items in line with the section's current roster.
 *
 * Adds an item for every student now in the section; removes items only for
 * students who left AND have no grade yet. A student who was graded and then
 * moved out keeps their row, because deleting it would destroy an academic
 * record. Internal — never callable on its own (section 5 revokes EXECUTE).
 */
CREATE OR REPLACE FUNCTION public.sync_grading_sheet_roster(p_sheet_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_section_name text;
    v_added integer := 0;
BEGIN
    SELECT upper(btrim(s.name)) INTO v_section_name
      FROM public.grading_sheets gs
      JOIN public.sections s ON s.id = gs.section_id
     WHERE gs.id = p_sheet_id;

    IF v_section_name IS NULL THEN
        RAISE EXCEPTION 'Grading sheet not found.';
    END IF;

    WITH roster AS (
        SELECT p.id
          FROM public.profiles p
         WHERE p.account_type = 'student'
           AND public.canonical_section_name(p.section, p.course, p.year_level) = v_section_name
    ), inserted AS (
        INSERT INTO public.grading_sheet_items (grading_sheet_id, student_id)
        SELECT p_sheet_id, roster.id FROM roster
        ON CONFLICT (grading_sheet_id, student_id) DO NOTHING
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_added FROM inserted;

    DELETE FROM public.grading_sheet_items i
     WHERE i.grading_sheet_id = p_sheet_id
       AND i.final_grade IS NULL
       AND NOT EXISTS (
           SELECT 1 FROM public.profiles p
            WHERE p.id = i.student_id
              AND p.account_type = 'student'
              AND public.canonical_section_name(p.section, p.course, p.year_level) = v_section_name
       );

    RETURN v_added;
END;
$$;

-- ── Opening a sheet ────────────────────────────────────────────────────────

/**
 * The adviser's entry point: returns the id of the grading sheet for one of
 * their sections in one term, creating it in DRAFT the first time and syncing
 * the roster every time.
 */
CREATE OR REPLACE FUNCTION public.open_grading_sheet(
    p_section_id     uuid,
    p_school_year_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    IF (SELECT status FROM public.grading_sheets WHERE id = v_sheet_id) IN ('draft', 'for_review') THEN
        PERFORM public.sync_grading_sheet_roster(v_sheet_id);
    END IF;

    RETURN v_sheet_id;
END;
$$;

-- ── Reading ────────────────────────────────────────────────────────────────

/** One sheet, its term, its section and every student row, ready to render. */
CREATE OR REPLACE FUNCTION public.get_grading_sheet(p_sheet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
    IF NOT public.can_view_grading_sheet(p_sheet_id) THEN
        RAISE EXCEPTION 'You are not authorized to view this grading sheet.';
    END IF;

    SELECT jsonb_build_object(
        'id',                 gs.id,
        'status',             gs.status,
        'subject_code',       gs.subject_code,
        'course_description', gs.course_description,
        'passing_grade',      gs.passing_grade,
        'min_grade',          gs.min_grade,
        'max_grade',          gs.max_grade,
        'return_reason',      gs.return_reason,
        'returned_at',        gs.returned_at,
        'submitted_at',       gs.submitted_at,
        'verified_at',        gs.verified_at,
        'finalized_at',       gs.finalized_at,
        'created_at',         gs.created_at,
        'updated_at',         gs.updated_at,
        'section', jsonb_build_object(
            'id', s.id, 'name', s.name, 'course_code', s.course_code
        ),
        'school_year', jsonb_build_object(
            'id', sy.id, 'school_year', sy.school_year, 'semester', sy.semester
        ),
        'adviser', jsonb_build_object(
            'id', ap.auth_user_id,
            'name', btrim(coalesce(ap.first_name, '') || ' ' || coalesce(ap.last_name, '')),
            'adviser_type', ap.adviser_type
        ),
        'verified_by_name', (
            SELECT btrim(coalesce(vp.first_name, '') || ' ' || coalesce(vp.last_name, ''))
              FROM public.profiles vp WHERE vp.auth_user_id = gs.verified_by
        ),
        'items', COALESCE((
            SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_name, x.first_name)
              FROM (
                SELECT
                    i.id,
                    i.student_id,
                    i.final_grade,
                    i.remarks,
                    i.grade_status,
                    i.entered_at,
                    p.student_number,
                    p.first_name,
                    p.middle_name,
                    p.last_name,
                    p.suffix,
                    public.official_student_name(p.first_name, p.middle_name, p.last_name, p.suffix) AS student_name,
                    upper(btrim(coalesce(p.last_name, 'ZZZZ'))) AS sort_name,
                    (SELECT btrim(coalesce(ep.first_name,'') || ' ' || coalesce(ep.last_name,''))
                       FROM public.profiles ep WHERE ep.auth_user_id = i.entered_by) AS entered_by_name
                  FROM public.grading_sheet_items i
                  JOIN public.profiles p ON p.id = i.student_id
                 WHERE i.grading_sheet_id = gs.id
              ) x
        ), '[]'::jsonb)
    )
    INTO v_result
    FROM public.grading_sheets gs
    JOIN public.sections s      ON s.id = gs.section_id
    JOIN public.school_years sy ON sy.id = gs.school_year_id
    LEFT JOIN public.profiles ap ON ap.auth_user_id = gs.adviser_id
    WHERE gs.id = p_sheet_id;

    RETURN v_result;
END;
$$;

/** The adviser's "My Grading Sheets" list — one row per section per term. */
CREATE OR REPLACE FUNCTION public.get_my_grading_sheets()
RETURNS TABLE (
    id uuid, section_id uuid, section_name text, course_code text,
    school_year_id uuid, school_year text, semester text,
    status text, student_count integer, graded_count integer,
    return_reason text, submitted_at timestamptz, verified_at timestamptz,
    finalized_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        gs.id, s.id, s.name, s.course_code,
        sy.id, sy.school_year, sy.semester,
        gs.status,
        (SELECT count(*)::integer FROM public.grading_sheet_items i WHERE i.grading_sheet_id = gs.id),
        (SELECT count(*)::integer FROM public.grading_sheet_items i
          WHERE i.grading_sheet_id = gs.id AND i.final_grade IS NOT NULL),
        gs.return_reason, gs.submitted_at, gs.verified_at, gs.finalized_at, gs.updated_at
      FROM public.grading_sheets gs
      JOIN public.sections s      ON s.id = gs.section_id
      JOIN public.school_years sy ON sy.id = gs.school_year_id
     WHERE gs.adviser_id = auth.uid()
     ORDER BY sy.school_year DESC, sy.semester, s.name;
$$;

/** The coordinator's verification queue. */
CREATE OR REPLACE FUNCTION public.get_coordinator_grading_sheets(p_status text DEFAULT NULL)
RETURNS TABLE (
    id uuid, section_id uuid, section_name text, course_code text,
    school_year text, semester text, adviser_name text,
    status text, student_count integer, graded_count integer,
    submitted_at timestamptz, verified_at timestamptz, finalized_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role text;
    v_dept uuid;
BEGIN
    SELECT p.account_type, p.department_id INTO v_role, v_dept
      FROM public.profiles p WHERE p.auth_user_id = auth.uid() LIMIT 1;

    IF v_role NOT IN ('coordinator', 'admin') THEN
        RAISE EXCEPTION 'Only a Coordinator or Administrator may review grading sheets.';
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
        gs.submitted_at, gs.verified_at, gs.finalized_at, gs.updated_at
      FROM public.grading_sheets gs
      JOIN public.sections s      ON s.id = gs.section_id
      JOIN public.school_years sy ON sy.id = gs.school_year_id
      LEFT JOIN public.profiles ap ON ap.auth_user_id = gs.adviser_id
     WHERE (v_role = 'admin' OR v_dept IS NULL OR s.department_id IS NULL OR s.department_id = v_dept)
       -- A draft has not been handed in yet; it is the adviser's working copy.
       AND gs.status <> 'draft'
       AND (p_status IS NULL OR gs.status = p_status)
     ORDER BY
        CASE gs.status WHEN 'for_review' THEN 1 WHEN 'verified' THEN 2 ELSE 3 END,
        gs.submitted_at DESC NULLS LAST;
END;
$$;

/** Grade history — every change to one sheet, or to one student's grade. */
CREATE OR REPLACE FUNCTION public.get_grading_sheet_history(
    p_sheet_id uuid,
    p_item_id  uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid, action text, old_grade numeric, new_grade numeric,
    old_status text, new_status text, reason text, created_at timestamptz,
    user_name text, user_role text, student_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.can_view_grading_sheet(p_sheet_id) THEN
        RAISE EXCEPTION 'You are not authorized to view this grade history.';
    END IF;

    RETURN QUERY
    SELECT
        l.id, l.action, l.old_grade, l.new_grade, l.old_status, l.new_status,
        l.reason, l.created_at,
        btrim(coalesce(up.first_name, '') || ' ' || coalesce(up.last_name, '')),
        up.account_type,
        public.official_student_name(sp.first_name, sp.middle_name, sp.last_name, sp.suffix)
      FROM public.grade_audit_logs l
      LEFT JOIN public.profiles up ON up.auth_user_id = l.user_id
      LEFT JOIN public.profiles sp ON sp.id = l.student_id
     WHERE l.grading_sheet_id = p_sheet_id
       AND (p_item_id IS NULL OR l.grading_sheet_item_id = p_item_id)
     ORDER BY l.created_at DESC;
END;
$$;

-- ── The write path ─────────────────────────────────────────────────────────

/**
 * Save a batch of final grades.
 *
 * p_grades is [{ "item_id": uuid, "final_grade": number|null }, …] — only the
 * rows the adviser actually touched. Remarks are NOT accepted: they are
 * derived from the grade by the grading_item_remarks trigger.
 *
 * A grade that did not change writes nothing and audits nothing, so re-saving
 * an unchanged sheet does not flood the history.
 */
CREATE OR REPLACE FUNCTION public.save_grading_sheet_grades(
    p_sheet_id uuid,
    p_grades   jsonb,
    p_reason   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sheet   public.grading_sheets;
    v_entry   jsonb;
    v_item    public.grading_sheet_items;
    v_new     numeric(5,2);
    v_changed integer := 0;
BEGIN
    SELECT * INTO v_sheet FROM public.grading_sheets WHERE id = p_sheet_id;
    IF v_sheet.id IS NULL THEN
        RAISE EXCEPTION 'Grading sheet not found.';
    END IF;
    IF v_sheet.adviser_id <> auth.uid() OR NOT public.is_adviser() THEN
        RAISE EXCEPTION 'Only the adviser who owns this grading sheet may enter grades.';
    END IF;
    IF v_sheet.status <> 'draft' THEN
        RAISE EXCEPTION 'This grading sheet is % and can no longer be edited.',
            replace(v_sheet.status, '_', ' ');
    END IF;
    IF jsonb_typeof(p_grades) <> 'array' THEN
        RAISE EXCEPTION 'Grades must be sent as a list.';
    END IF;

    FOR v_entry IN SELECT * FROM jsonb_array_elements(p_grades) LOOP
        SELECT * INTO v_item
          FROM public.grading_sheet_items
         WHERE id = (v_entry->>'item_id')::uuid
           AND grading_sheet_id = p_sheet_id;

        IF v_item.id IS NULL THEN
            RAISE EXCEPTION 'A student row in this request does not belong to the grading sheet.';
        END IF;

        -- Anything that is not a JSON number is rejected outright; a blank
        -- clears the grade rather than storing zero.
        IF v_entry->'final_grade' IS NULL OR jsonb_typeof(v_entry->'final_grade') = 'null' THEN
            v_new := NULL;
        ELSIF jsonb_typeof(v_entry->'final_grade') <> 'number' THEN
            RAISE EXCEPTION 'A final grade must be a number.';
        ELSE
            v_new := round((v_entry->>'final_grade')::numeric, 2);
            IF v_new < v_sheet.min_grade OR v_new > v_sheet.max_grade THEN
                RAISE EXCEPTION 'Final grade % is outside the allowed range %–%.',
                    v_new, v_sheet.min_grade, v_sheet.max_grade;
            END IF;
        END IF;

        CONTINUE WHEN v_new IS NOT DISTINCT FROM v_item.final_grade;

        UPDATE public.grading_sheet_items
           SET final_grade = v_new, entered_by = auth.uid(), entered_at = now()
         WHERE id = v_item.id;

        INSERT INTO public.grade_audit_logs (
            grading_sheet_id, grading_sheet_item_id, student_id, user_id,
            action, old_grade, new_grade, reason
        ) VALUES (
            p_sheet_id, v_item.id, v_item.student_id, auth.uid(),
            CASE WHEN v_item.final_grade IS NULL THEN 'grade_entered' ELSE 'grade_changed' END,
            v_item.final_grade, v_new, NULLIF(btrim(coalesce(p_reason, '')), '')
        );

        v_changed := v_changed + 1;
    END LOOP;

    IF v_changed > 0 THEN
        UPDATE public.grading_sheets SET updated_at = now() WHERE id = p_sheet_id;
    END IF;

    RETURN jsonb_build_object('changed', v_changed);
END;
$$;

/**
 * Hand the sheet to the coordinator. Every student must carry a grade — an
 * official record with blanks in it is not a record — and the coordinators
 * are notified once, for the sheet, never once per grade.
 */
CREATE OR REPLACE FUNCTION public.submit_grading_sheet(p_sheet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sheet    public.grading_sheets;
    v_section  text;
    v_term     text;
    v_adviser  text;
    v_total    integer;
    v_missing  integer;
    v_dept     uuid;
BEGIN
    SELECT * INTO v_sheet FROM public.grading_sheets WHERE id = p_sheet_id;
    IF v_sheet.id IS NULL THEN
        RAISE EXCEPTION 'Grading sheet not found.';
    END IF;
    IF v_sheet.adviser_id <> auth.uid() OR NOT public.is_adviser() THEN
        RAISE EXCEPTION 'Only the adviser who owns this grading sheet may submit it.';
    END IF;
    IF v_sheet.status <> 'draft' THEN
        RAISE EXCEPTION 'Only a draft grading sheet can be submitted for verification.';
    END IF;

    SELECT count(*), count(*) FILTER (WHERE final_grade IS NULL)
      INTO v_total, v_missing
      FROM public.grading_sheet_items WHERE grading_sheet_id = p_sheet_id;

    IF v_total = 0 THEN
        RAISE EXCEPTION 'This grading sheet has no students.';
    END IF;
    IF v_missing > 0 THEN
        RAISE EXCEPTION '% student(s) still have no final grade.', v_missing;
    END IF;

    UPDATE public.grading_sheets
       SET status = 'for_review', submitted_at = now(), updated_at = now(),
           return_reason = NULL, returned_at = NULL, returned_by = NULL
     WHERE id = p_sheet_id;

    INSERT INTO public.grade_audit_logs (grading_sheet_id, user_id, action, old_status, new_status)
    VALUES (p_sheet_id, auth.uid(), 'submit', 'draft', 'for_review');

    SELECT s.name, s.department_id, sy.school_year || ' · ' || initcap(sy.semester) || ' Semester'
      INTO v_section, v_dept, v_term
      FROM public.grading_sheets gs
      JOIN public.sections s      ON s.id = gs.section_id
      JOIN public.school_years sy ON sy.id = gs.school_year_id
     WHERE gs.id = p_sheet_id;

    SELECT btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
      INTO v_adviser FROM public.profiles WHERE auth_user_id = auth.uid();

    INSERT INTO public.user_notifications (
        user_id, title, message, type, notification_type,
        related_type, related_id, created_by, action_path, action_label
    )
    SELECT
        p.auth_user_id,
        'Grading Sheet Submitted for Verification',
        coalesce(nullif(v_adviser, ''), 'A Section Adviser')
            || ' submitted the Official Grading Sheet for ' || v_section
            || ' (' || v_term || ') with ' || v_total || ' students.',
        'info', 'assignment', 'grading_sheet', p_sheet_id, auth.uid(),
        '/coordinator/grading-sheets', 'Review Grading Sheet'
      FROM public.profiles p
     WHERE p.account_type = 'coordinator'
       AND p.auth_user_id IS NOT NULL
       AND (p.department_id IS NULL OR v_dept IS NULL OR p.department_id = v_dept);

    RETURN jsonb_build_object('status', 'for_review', 'students', v_total);
END;
$$;

/** Coordinator: the sheet is correct. */
CREATE OR REPLACE FUNCTION public.verify_grading_sheet(p_sheet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sheet   public.grading_sheets;
    v_section text;
BEGIN
    SELECT * INTO v_sheet FROM public.grading_sheets WHERE id = p_sheet_id;
    IF v_sheet.id IS NULL THEN
        RAISE EXCEPTION 'Grading sheet not found.';
    END IF;
    IF public.current_account_type() NOT IN ('coordinator', 'admin')
       OR NOT public.can_view_grading_sheet(p_sheet_id) THEN
        RAISE EXCEPTION 'Only the Coordinator for this section may verify its grading sheet.';
    END IF;
    IF v_sheet.status <> 'for_review' THEN
        RAISE EXCEPTION 'Only a grading sheet awaiting review can be verified.';
    END IF;

    UPDATE public.grading_sheets
       SET status = 'verified', verified_at = now(), verified_by = auth.uid(), updated_at = now()
     WHERE id = p_sheet_id;

    INSERT INTO public.grade_audit_logs (grading_sheet_id, user_id, action, old_status, new_status)
    VALUES (p_sheet_id, auth.uid(), 'verify', 'for_review', 'verified');

    SELECT s.name INTO v_section FROM public.sections s WHERE s.id = v_sheet.section_id;

    INSERT INTO public.user_notifications (
        user_id, title, message, type, notification_type,
        related_type, related_id, created_by, action_path, action_label
    ) VALUES (
        v_sheet.adviser_id,
        'Grading Sheet Verified',
        'Your Official Grading Sheet for ' || v_section
            || ' has been reviewed and verified by the Diploma Program Coordinator.',
        'success', 'assignment', 'grading_sheet', p_sheet_id, auth.uid(),
        '/adviser/grading', 'Open Grading Sheet'
    );

    RETURN jsonb_build_object('status', 'verified');
END;
$$;

/** Coordinator: send it back. A reason is required and reaches the adviser. */
CREATE OR REPLACE FUNCTION public.return_grading_sheet(p_sheet_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sheet   public.grading_sheets;
    v_section text;
    v_reason  text := btrim(coalesce(p_reason, ''));
BEGIN
    SELECT * INTO v_sheet FROM public.grading_sheets WHERE id = p_sheet_id;
    IF v_sheet.id IS NULL THEN
        RAISE EXCEPTION 'Grading sheet not found.';
    END IF;
    IF public.current_account_type() NOT IN ('coordinator', 'admin')
       OR NOT public.can_view_grading_sheet(p_sheet_id) THEN
        RAISE EXCEPTION 'Only the Coordinator for this section may return its grading sheet.';
    END IF;
    IF v_sheet.status NOT IN ('for_review', 'verified') THEN
        RAISE EXCEPTION 'This grading sheet cannot be returned for correction.';
    END IF;
    IF v_reason = '' THEN
        RAISE EXCEPTION 'A reason is required when returning a grading sheet.';
    END IF;

    UPDATE public.grading_sheets
       SET status = 'draft', return_reason = v_reason, returned_at = now(),
           returned_by = auth.uid(), submitted_at = NULL,
           verified_at = NULL, verified_by = NULL, updated_at = now()
     WHERE id = p_sheet_id;

    INSERT INTO public.grade_audit_logs (grading_sheet_id, user_id, action, old_status, new_status, reason)
    VALUES (p_sheet_id, auth.uid(), 'return', v_sheet.status, 'draft', v_reason);

    SELECT s.name INTO v_section FROM public.sections s WHERE s.id = v_sheet.section_id;

    INSERT INTO public.user_notifications (
        user_id, title, message, type, notification_type,
        related_type, related_id, created_by, action_path, action_label
    ) VALUES (
        v_sheet.adviser_id,
        'Grading Sheet Returned for Correction',
        'Your ' || v_section || ' Official Grading Sheet was returned for correction. Reason: ' || v_reason,
        'warning', 'assignment', 'grading_sheet', p_sheet_id, auth.uid(),
        '/adviser/grading', 'Open Grading Sheet'
    );

    RETURN jsonb_build_object('status', 'draft');
END;
$$;

/** Close the record. After this the sheet is read-only for everybody. */
CREATE OR REPLACE FUNCTION public.finalize_grading_sheet(p_sheet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sheet   public.grading_sheets;
    v_section text;
BEGIN
    SELECT * INTO v_sheet FROM public.grading_sheets WHERE id = p_sheet_id;
    IF v_sheet.id IS NULL THEN
        RAISE EXCEPTION 'Grading sheet not found.';
    END IF;
    IF public.current_account_type() NOT IN ('coordinator', 'admin')
       OR NOT public.can_view_grading_sheet(p_sheet_id) THEN
        RAISE EXCEPTION 'Only the Coordinator for this section may finalize its grading sheet.';
    END IF;
    IF v_sheet.status <> 'verified' THEN
        RAISE EXCEPTION 'Only a verified grading sheet can be finalized.';
    END IF;

    UPDATE public.grading_sheets
       SET status = 'finalized', finalized_at = now(), finalized_by = auth.uid(), updated_at = now()
     WHERE id = p_sheet_id;

    INSERT INTO public.grade_audit_logs (grading_sheet_id, user_id, action, old_status, new_status)
    VALUES (p_sheet_id, auth.uid(), 'finalize', 'verified', 'finalized');

    SELECT s.name INTO v_section FROM public.sections s WHERE s.id = v_sheet.section_id;

    INSERT INTO public.user_notifications (
        user_id, title, message, type, notification_type,
        related_type, related_id, created_by, action_path, action_label
    ) VALUES (
        v_sheet.adviser_id,
        'Grading Sheet Finalized',
        'The Official Grading Sheet for ' || v_section
            || ' has been finalized and is now a closed academic record.',
        'success', 'assignment', 'grading_sheet', p_sheet_id, auth.uid(),
        '/adviser/grading', 'View Grading Sheet'
    );

    RETURN jsonb_build_object('status', 'finalized');
END;
$$;


-- ── The student number ─────────────────────────────────────────────────────

/**
 * Set (or clear) a student's official student number.
 *
 * Printed beside every name on the Official Grading Sheet, so a blank one
 * produces an invalid official document. Students supply it during onboarding
 * when they have it to hand; this is how an adviser or coordinator fills the
 * gaps afterwards.
 *
 * The format rule is mirrored in src/utils/studentNumber.ts — keep the two in
 * step. This copy is the authority.
 */
CREATE OR REPLACE FUNCTION public.set_student_number(
    p_student_id     uuid,
    p_student_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role    text;
    v_dept    uuid;
    v_student public.profiles;
    v_value   text;
    v_year    integer;
BEGIN
    SELECT p.account_type, p.department_id INTO v_role, v_dept
      FROM public.profiles p WHERE p.auth_user_id = auth.uid() LIMIT 1;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    SELECT * INTO v_student FROM public.profiles WHERE id = p_student_id;
    IF v_student.id IS NULL OR v_student.account_type <> 'student' THEN
        RAISE EXCEPTION 'Student not found.';
    END IF;

    -- Who may set it: the adviser who currently holds the student's section,
    -- the coordinator for that department, or an administrator.
    IF v_role = 'adviser' THEN
        IF NOT EXISTS (
            SELECT 1
              FROM public.get_adviser_assigned_section_names(auth.uid()) AS s(section_name)
             WHERE upper(btrim(s.section_name))
                   = public.canonical_section_name(
                         v_student.section, v_student.course, v_student.year_level)
        ) THEN
            RAISE EXCEPTION 'That student is not in one of your assigned sections.';
        END IF;
    ELSIF v_role NOT IN ('coordinator', 'admin') THEN
        RAISE EXCEPTION 'You are not authorized to set a student number.';
    END IF;

    -- Normalise: pasted en/em/full-width dashes and stray spaces are common
    -- when this comes off a registration form or a spreadsheet.
    v_value := btrim(regexp_replace(
        translate(coalesce(p_student_number, ''), '‐‑‒–—―－', '-------'),
        '\s', '', 'g'));

    IF v_value = '' THEN
        v_value := NULL;
    ELSE
        IF v_value !~ '^\d{4}-\d{4,12}$' THEN
            RAISE EXCEPTION 'Use the format printed on the registration form, e.g. 2023-24610795.';
        END IF;
        v_year := substring(v_value from '^(\d{4})')::integer;
        IF v_year < 1900 OR v_year > extract(year from now())::integer + 1 THEN
            RAISE EXCEPTION '% is not a valid admission year.', v_year;
        END IF;
    END IF;

    BEGIN
        UPDATE public.profiles
           SET student_number = v_value, updated_at = now()
         WHERE id = p_student_id;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Student number % is already assigned to another student.', v_value;
    END;

    RETURN jsonb_build_object('student_id', p_student_id, 'student_number', v_value);
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. ROW LEVEL SECURITY AND GRANTS
--
-- Reading is policy-driven; writing is function-driven. None of the four grade
-- tables has an INSERT, UPDATE or DELETE policy, so the only way a grade can
-- change is through the functions above.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.school_years        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_sheets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_sheet_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_audit_logs    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read school years" ON public.school_years;
CREATE POLICY "Authenticated users can read school years"
    ON public.school_years FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage school years" ON public.school_years;
CREATE POLICY "Admins manage school years"
    ON public.school_years FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can read grading settings" ON public.grading_settings;
CREATE POLICY "Authenticated users can read grading settings"
    ON public.grading_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Grading sheets are readable by their adviser and coordinators" ON public.grading_sheets;
CREATE POLICY "Grading sheets are readable by their adviser and coordinators"
    ON public.grading_sheets FOR SELECT TO authenticated
    USING (public.can_view_grading_sheet(id));

DROP POLICY IF EXISTS "Grading sheet items follow their sheet" ON public.grading_sheet_items;
CREATE POLICY "Grading sheet items follow their sheet"
    ON public.grading_sheet_items FOR SELECT TO authenticated
    USING (public.can_view_grading_sheet(grading_sheet_id));

DROP POLICY IF EXISTS "Grade history follows its sheet" ON public.grade_audit_logs;
CREATE POLICY "Grade history follows its sheet"
    ON public.grade_audit_logs FOR SELECT TO authenticated
    USING (public.can_view_grading_sheet(grading_sheet_id));

-- No write privilege on any grade table. Even an administrator changes a grade
-- only through the audited functions.
GRANT SELECT ON public.school_years        TO authenticated;
GRANT SELECT ON public.grading_settings    TO authenticated;
GRANT SELECT ON public.grading_sheets      TO authenticated;
GRANT SELECT ON public.grading_sheet_items TO authenticated;
GRANT SELECT ON public.grade_audit_logs    TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.grading_sheets      FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.grading_sheet_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.grade_audit_logs    FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.grading_settings    FROM authenticated;

-- sync_grading_sheet_roster is an internal step of open_grading_sheet and does
-- no authorization of its own, so it must not be callable on its own.
REVOKE ALL ON FUNCTION public.sync_grading_sheet_roster(uuid) FROM public, anon, authenticated;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, which reaches
-- the `anon` role through PostgREST. A SECURITY DEFINER function should not be
-- reachable without a session at all.
REVOKE EXECUTE ON FUNCTION public.get_school_years()                                      FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_grading_settings()                                  FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.update_grading_settings(numeric, numeric, numeric, text, text, jsonb) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.open_grading_sheet(uuid, uuid)                          FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_grading_sheet(uuid)                                 FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_grading_sheets()                                 FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_coordinator_grading_sheets(text)                    FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_grading_sheet_history(uuid, uuid)                   FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.save_grading_sheet_grades(uuid, jsonb, text)            FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.submit_grading_sheet(uuid)                              FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.verify_grading_sheet(uuid)                              FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.return_grading_sheet(uuid, text)                        FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.finalize_grading_sheet(uuid)                            FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_grading_sheet(uuid)                            FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.adviser_owns_section(uuid)                              FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.current_account_type()                                  FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.official_student_name(text, text, text, text)           FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.set_student_number(uuid, text)                          FROM public, anon;

GRANT EXECUTE ON FUNCTION public.get_school_years()                                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_grading_settings()                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_grading_settings(numeric, numeric, numeric, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_grading_sheet(uuid, uuid)                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_grading_sheet(uuid)                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_grading_sheets()                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coordinator_grading_sheets(text)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_grading_sheet_history(uuid, uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_grading_sheet_grades(uuid, jsonb, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_grading_sheet(uuid)                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_grading_sheet(uuid)                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_grading_sheet(uuid, text)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_grading_sheet(uuid)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_grading_sheet(uuid)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.adviser_owns_section(uuid)                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.official_student_name(text, text, text, text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_account_type()                                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_number(uuid, text)                            TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. SEED
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.grading_settings (scope) VALUES ('global')
ON CONFLICT (scope) DO NOTHING;

INSERT INTO public.school_years (school_year, semester, is_active) VALUES
    ('2024-2025', 'FIRST',  false),
    ('2024-2025', 'SECOND', false),
    ('2025-2026', 'FIRST',  false),
    ('2025-2026', 'SECOND', false),
    ('2026-2027', 'FIRST',  true),
    ('2026-2027', 'SECOND', false)
ON CONFLICT (school_year, semester) DO NOTHING;
