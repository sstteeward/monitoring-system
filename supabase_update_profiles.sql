-- =========================================================================
-- Migration Script: Add Reports Metrics to Profiles
-- Run this script in your Supabase SQL Editor.
-- =========================================================================

-- 1. Add new columns to public.profiles safely
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS required_ojt_hours integer default 500,
ADD COLUMN IF NOT EXISTS grade text default null,
ADD COLUMN IF NOT EXISTS absences integer default 0;

-- 2. Ensure existing records have default SIL target if null
UPDATE public.profiles
SET required_ojt_hours = 500
WHERE required_ojt_hours IS NULL;

-- 3. Ensure existing records have 0 absences if null
UPDATE public.profiles
SET absences = 0
WHERE absences IS NULL;
