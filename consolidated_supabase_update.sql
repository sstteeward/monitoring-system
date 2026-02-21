-- =========================================================================
-- CONSOLIDATED DATABASE UPDATE SCRIPT
-- =========================================================================
-- This script safely updates your existing Supabase database with all new features:
-- 1. Adds missing columns to the profiles table (SIL target, Grade, Absences).
-- 2. Updates the profile creation trigger with new default fields.
-- 3. Refreshes the API cache to ensure the frontend can see the changes.

-- 1. ADD NEW COLUMNS SAFELY
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS required_ojt_hours integer default 500,
ADD COLUMN IF NOT EXISTS grade text default null,
ADD COLUMN IF NOT EXISTS absences integer default 0;

-- 2. UPDATE EXISTING RECORDS WITH DEFAULTS
UPDATE public.profiles
SET required_ojt_hours = 500
WHERE required_ojt_hours IS NULL;

UPDATE public.profiles
SET absences = 0
WHERE absences IS NULL;

-- 3. UPDATE TRIGGER FUNCTION (handle_new_user)
-- This ensures future signups automatically get the new data fields.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    auth_user_id,
    email,
    email_domain,
    first_name,
    middle_name,
    last_name,
    account_type,
    required_ojt_hours,
    grade,
    absences
  ) VALUES (
    new.id,
    lower(new.email),
    split_part(lower(new.email), '@', 2),
    (new.raw_user_meta_data->>'first_name'),
    (new.raw_user_meta_data->>'middle_name'),
    (new.raw_user_meta_data->>'last_name'),
    coalesce(new.raw_user_meta_data->>'account_type', 'student'),
    500,   -- Default SIL Target
    null,  -- Default Grade
    0      -- Default Absences
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. REFRESH SCHEMA CACHE
-- This fixes the "column not found in schema cache" error.
NOTIFY pgrst, 'reload schema';

COMMIT; -- Optional depending on where you run this
