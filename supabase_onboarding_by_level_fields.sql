-- ==============================================================================
-- Standardize every onboarding flow on "by level" name and address fields
-- (Student / Adviser / Coordinator / Company). Admin has no onboarding step.
--
-- Safe to re-run: every statement is idempotent and no column is dropped.
-- Run this in the Supabase SQL Editor.
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. profiles — name by level (suffix was previously glued onto last_name)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suffix TEXT;

-- Address-by-level columns. Most already exist from earlier migrations; the
-- IF NOT EXISTS guards make this safe on every environment.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country                TEXT DEFAULT 'Philippines',
  ADD COLUMN IF NOT EXISTS region                 TEXT,
  ADD COLUMN IF NOT EXISTS region_code            TEXT,
  ADD COLUMN IF NOT EXISTS province               TEXT,
  ADD COLUMN IF NOT EXISTS province_code          TEXT,
  ADD COLUMN IF NOT EXISTS city_municipality      TEXT,
  ADD COLUMN IF NOT EXISTS city_municipality_code TEXT,
  ADD COLUMN IF NOT EXISTS barangay               TEXT,
  ADD COLUMN IF NOT EXISTS barangay_code          TEXT,
  ADD COLUMN IF NOT EXISTS house_street           TEXT,
  ADD COLUMN IF NOT EXISTS birthday               DATE,
  ADD COLUMN IF NOT EXISTS contact_number         TEXT;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. company_requests — contact person by level + office address by level
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_requests
  ADD COLUMN IF NOT EXISTS contact_first_name     TEXT,
  ADD COLUMN IF NOT EXISTS contact_middle_name    TEXT,
  ADD COLUMN IF NOT EXISTS contact_last_name      TEXT,
  ADD COLUMN IF NOT EXISTS contact_suffix         TEXT,
  ADD COLUMN IF NOT EXISTS country                TEXT DEFAULT 'Philippines',
  ADD COLUMN IF NOT EXISTS region                 TEXT,
  ADD COLUMN IF NOT EXISTS region_code            TEXT,
  ADD COLUMN IF NOT EXISTS province               TEXT,
  ADD COLUMN IF NOT EXISTS province_code          TEXT,
  ADD COLUMN IF NOT EXISTS city_municipality      TEXT,
  ADD COLUMN IF NOT EXISTS city_municipality_code TEXT,
  ADD COLUMN IF NOT EXISTS barangay               TEXT,
  ADD COLUMN IF NOT EXISTS barangay_code          TEXT,
  ADD COLUMN IF NOT EXISTS house_street           TEXT;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. companies — same address levels, carried over when a request is approved
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS contact_first_name     TEXT,
  ADD COLUMN IF NOT EXISTS contact_middle_name    TEXT,
  ADD COLUMN IF NOT EXISTS contact_last_name      TEXT,
  ADD COLUMN IF NOT EXISTS contact_suffix         TEXT,
  ADD COLUMN IF NOT EXISTS country                TEXT DEFAULT 'Philippines',
  ADD COLUMN IF NOT EXISTS region                 TEXT,
  ADD COLUMN IF NOT EXISTS region_code            TEXT,
  ADD COLUMN IF NOT EXISTS province               TEXT,
  ADD COLUMN IF NOT EXISTS province_code          TEXT,
  ADD COLUMN IF NOT EXISTS city_municipality      TEXT,
  ADD COLUMN IF NOT EXISTS city_municipality_code TEXT,
  ADD COLUMN IF NOT EXISTS barangay               TEXT,
  ADD COLUMN IF NOT EXISTS barangay_code          TEXT,
  ADD COLUMN IF NOT EXISTS house_street           TEXT;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Review queue for rows that cannot be split cleanly
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_split_review (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id    uuid NOT NULL,
  field        TEXT NOT NULL,          -- 'name' | 'address'
  raw_value    TEXT,
  reason       TEXT NOT NULL,
  resolved     BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source_table, source_id, field)
);

ALTER TABLE public.onboarding_split_review ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and coordinators can read split review" ON public.onboarding_split_review;
CREATE POLICY "Admins and coordinators can read split review"
  ON public.onboarding_split_review FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type IN ('admin', 'coordinator')
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Backfill: extract a trailing suffix out of profiles.last_name
--    Adviser onboarding used to save "Dela Cruz Jr." into last_name.
-- ──────────────────────────────────────────────────────────────────────────────
WITH matched AS (
  SELECT
    id,
    last_name,
    (regexp_match(last_name, '^(.*?)[,]?\s+(Jr\.?|Sr\.?|II|III|IV|V)$', 'i')) AS parts
  FROM public.profiles
  WHERE last_name IS NOT NULL
    AND suffix IS NULL
    AND last_name ~* '\s+(Jr\.?|Sr\.?|II|III|IV|V)$'
)
UPDATE public.profiles p
SET last_name = btrim(m.parts[1]),
    suffix    = btrim(m.parts[2])
FROM matched m
WHERE p.id = m.id
  AND m.parts IS NOT NULL
  AND btrim(m.parts[1]) <> '';

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. Backfill: split company_requests.student_name (the contact person)
--    "First Last"        -> first + last
--    "First Middle Last" -> first + middle + last
--    anything else       -> flagged for manual review
-- ──────────────────────────────────────────────────────────────────────────────
WITH parsed AS (
  SELECT
    id,
    student_name,
    -- Strip a trailing suffix first so it does not land in last_name.
    btrim(regexp_replace(student_name, '[,]?\s+(Jr\.?|Sr\.?|II|III|IV|V)$', '', 'i')) AS base_name,
    NULLIF((regexp_match(student_name, '[,]?\s+(Jr\.?|Sr\.?|II|III|IV|V)$', 'i'))[1], '') AS parsed_suffix
  FROM public.company_requests
  WHERE student_name IS NOT NULL
    AND btrim(student_name) <> ''
    AND contact_first_name IS NULL
),
tokens AS (
  SELECT
    id,
    student_name,
    base_name,
    parsed_suffix,
    regexp_split_to_array(regexp_replace(base_name, '\s+', ' ', 'g'), ' ') AS words
  FROM parsed
)
UPDATE public.company_requests cr
SET contact_first_name  = t.words[1],
    contact_middle_name = CASE WHEN array_length(t.words, 1) >= 3
                               THEN array_to_string(t.words[2:array_length(t.words, 1) - 1], ' ')
                               ELSE NULL END,
    contact_last_name   = t.words[array_length(t.words, 1)],
    contact_suffix      = t.parsed_suffix
FROM tokens t
WHERE cr.id = t.id
  AND array_length(t.words, 1) BETWEEN 2 AND 4;

-- Flag contact names that could not be split (single word, or 5+ words).
INSERT INTO public.onboarding_split_review (source_table, source_id, field, raw_value, reason)
SELECT
  'company_requests',
  cr.id,
  'name',
  cr.student_name,
  CASE
    WHEN array_length(regexp_split_to_array(btrim(regexp_replace(cr.student_name, '\s+', ' ', 'g')), ' '), 1) < 2
      THEN 'Only one word — cannot tell first name from last name'
    ELSE 'Five or more words — ambiguous middle/last name boundary'
  END
FROM public.company_requests cr
WHERE cr.student_name IS NOT NULL
  AND btrim(cr.student_name) <> ''
  AND cr.contact_first_name IS NULL
ON CONFLICT (source_table, source_id, field) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Flag combined addresses that have no by-level equivalent.
--    A free-text address cannot be mapped back to PSGC codes reliably, so these
--    are listed for manual review rather than guessed at. No data is deleted —
--    the original `address` text is left untouched.
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO public.onboarding_split_review (source_table, source_id, field, raw_value, reason)
SELECT 'profiles', p.id, 'address', p.address,
       'Combined address with no PSGC codes — re-enter by level to populate region/province/city/barangay'
FROM public.profiles p
WHERE p.address IS NOT NULL
  AND btrim(p.address) <> ''
  AND p.region_code IS NULL
ON CONFLICT (source_table, source_id, field) DO NOTHING;

INSERT INTO public.onboarding_split_review (source_table, source_id, field, raw_value, reason)
SELECT 'company_requests', cr.id, 'address', cr.address,
       'Combined address with no PSGC codes — re-enter by level to populate region/province/city/barangay'
FROM public.company_requests cr
WHERE cr.address IS NOT NULL
  AND btrim(cr.address) <> ''
  AND cr.region_code IS NULL
ON CONFLICT (source_table, source_id, field) DO NOTHING;

INSERT INTO public.onboarding_split_review (source_table, source_id, field, raw_value, reason)
SELECT 'companies', c.id, 'address', c.address,
       'Combined address with no PSGC codes — re-enter by level to populate region/province/city/barangay'
FROM public.companies c
WHERE c.address IS NOT NULL
  AND btrim(c.address) <> ''
  AND c.region_code IS NULL
ON CONFLICT (source_table, source_id, field) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. Keep new signups' by-level name columns populated from auth metadata
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    auth_user_id,
    email,
    first_name,
    middle_name,
    last_name,
    suffix,
    account_type,
    required_ojt_hours,
    grade,
    absences
  )
  VALUES (
    new.id,
    new.email,
    (new.raw_user_meta_data->>'first_name'),
    (new.raw_user_meta_data->>'middle_name'),
    (new.raw_user_meta_data->>'last_name'),
    (new.raw_user_meta_data->>'suffix'),
    coalesce(new.raw_user_meta_data->>'account_type', 'student'),
    500,
    null,
    0
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────────────────────
-- 9. What needs a human? Run this after the migration.
-- ──────────────────────────────────────────────────────────────────────────────
-- SELECT source_table, field, reason, count(*)
-- FROM public.onboarding_split_review
-- WHERE resolved = false
-- GROUP BY source_table, field, reason
-- ORDER BY source_table, field;
