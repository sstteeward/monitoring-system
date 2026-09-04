-- ═══════════════════════════════════════════════════════════════════════════
-- Course catalogue management
--
-- Before: public.courses held only (id, name, description, created_at).
--         `description` was doubling as the abbreviation — onboarding wrote
--         `description || name` into profiles.course — so a course had no real
--         description, no status, and no way to be renamed without orphaning
--         every student record that stored the old value.
--
-- After:  the abbreviation gets its own `code` column, `description` is freed
--         to hold an actual description, and courses can be deactivated instead
--         of deleted.
--
-- Why `code` matters for safety: profiles.course and sections.course_code
-- reference a course by TEXT, not by foreign key. Pinning the stored value to
-- `code` (never to `name`) is what lets an admin rename "DIT" to "Information
-- Technology" without breaking a single existing student, section or adviser.
--
-- Safe to run repeatedly:
--   * every ADD COLUMN is IF NOT EXISTS;
--   * the backfill only touches rows whose code is still NULL;
--   * constraints and indexes are created only when absent;
--   * nothing is deleted, renamed or re-keyed.
--
-- Run this in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Abbreviation gets its own column ────────────────────────────────────
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS code text;

-- Backfill with exactly the value onboarding already writes into
-- profiles.course (`description` when set, otherwise `name`), so no existing
-- student record changes meaning.
UPDATE public.courses
SET code = upper(btrim(COALESCE(NULLIF(btrim(description), ''), name)))
WHERE code IS NULL;

-- `description` was the abbreviation field, so wherever it merely repeats the
-- code it is not a description. Clear it; the admin can now write a real one.
UPDATE public.courses
SET description = NULL
WHERE description IS NOT NULL
  AND upper(btrim(description)) = upper(btrim(code));

ALTER TABLE public.courses ALTER COLUMN code SET NOT NULL;

-- ── 2. Status ──────────────────────────────────────────────────────────────
-- Inactive courses stay in the table and keep serving existing records; they
-- are simply withheld from new student onboarding selections.
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ── 3. Audit timestamp ─────────────────────────────────────────────────────
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc', now());

CREATE OR REPLACE FUNCTION public.touch_courses_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS courses_set_updated_at ON public.courses;
CREATE TRIGGER courses_set_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_courses_updated_at();

-- ── 4. Integrity ───────────────────────────────────────────────────────────
-- Blank names/codes would produce a course that cannot be selected or matched.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.courses'::regclass AND conname = 'courses_name_not_blank'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_name_not_blank CHECK (btrim(name) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.courses'::regclass AND conname = 'courses_code_not_blank'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_code_not_blank CHECK (btrim(code) <> '');
  END IF;
END $$;

-- Duplicates are rejected case-insensitively, so "DIT", "dit" and "DIt" are one
-- and the same abbreviation. The admin UI checks this too, in order to show a
-- readable message instead of a raw constraint error.
CREATE UNIQUE INDEX IF NOT EXISTS courses_name_lower_key
  ON public.courses (lower(btrim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS courses_code_lower_key
  ON public.courses (lower(btrim(code)));

-- ── 5. Row level security ──────────────────────────────────────────────────
-- Unchanged, and listed here only so the policy set is documented alongside the
-- columns it protects:
--   "Courses are viewable by everyone"  SELECT  using (true)
--   "Admins can manage courses"         ALL     using (profiles.account_type = 'admin')
-- The existing ALL policy already covers the new UPDATE traffic, so no new
-- policy is needed.
