-- ═══════════════════════════════════════════════════════════════════════════
-- Sections A–J for every Course + Year Level
--
-- Before: public.sections was seeded with a handful of rows only
--         (DHT-1A..1C, DHT-2A..2B, DIT-1A..1C, DIT-2A..2B), so the student
--         onboarding dropdown could never offer more than C, and only years 1-2.
--
-- After:  every course code has <CODE>-<year><letter> for years 1-4 and
--         letters A-J.  e.g. DIT-1A … DIT-1J, DIT-2A … DIT-2J, … DIT-4J.
--
-- Safe to run repeatedly:
--   * inserts use ON CONFLICT (name) DO NOTHING, so existing rows keep their
--     id, department_id and every adviser_sections / profiles.section link;
--   * nothing is deleted or renamed.
--
-- Run this in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Allow course codes beyond the original DHT / DIT ────────────────────
-- The old CHECK hard-coded two courses, so a new course could never have
-- sections. Replace it with a format check. The adviser-assignment trigger
-- (validate_adviser_course_assignment) already only constrains DHT and DIT and
-- lets any other code through, so this stays compatible.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.sections'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%course_code%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.sections DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.sections
  ADD CONSTRAINT sections_course_code_format
  CHECK (course_code ~ '^[A-Z0-9]{2,10}$');

-- ── 2. Generate the sections ───────────────────────────────────────────────
-- Course codes are derived, not hard-coded: every code already present in
-- `sections`, plus the short code of every row in `courses` (stored in
-- courses.description, e.g. 'DIT'). Anything that is not a 2-10 character
-- code is skipped, since it cannot form a valid section name.
WITH course_codes AS (
    SELECT DISTINCT upper(trim(course_code)) AS code
    FROM public.sections
    WHERE course_code IS NOT NULL

    UNION

    SELECT DISTINCT upper(trim(description)) AS code
    FROM public.courses
    WHERE description IS NOT NULL
),
valid_codes AS (
    SELECT code FROM course_codes WHERE code ~ '^[A-Z0-9]{2,10}$'
),
generated AS (
    SELECT
        c.code || '-' || y.year || l.letter AS name,
        c.code AS course_code
    FROM valid_codes c
    CROSS JOIN generate_series(1, 4) AS y(year)
    CROSS JOIN unnest(ARRAY['A','B','C','D','E','F','G','H','I','J']) AS l(letter)
)
INSERT INTO public.sections (name, course_code)
SELECT name, course_code FROM generated
ON CONFLICT (name) DO NOTHING;

-- ── 3. Verify ──────────────────────────────────────────────────────────────
-- Expect 40 rows per course code (4 years x 10 letters), plus any legacy
-- section names that do not follow the pattern.
SELECT course_code, count(*) AS section_count
FROM public.sections
GROUP BY course_code
ORDER BY course_code;
