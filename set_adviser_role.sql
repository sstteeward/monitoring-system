-- Run this in Supabase SQL Editor to convert a user account to Adviser
-- Replace 'carl@example.edu.ph' or 'Carl' with the target user's email or name

UPDATE public.profiles
SET 
  account_type = 'adviser',
  course = NULL,
  year_level = NULL,
  section = NULL,
  required_ojt_hours = NULL,
  adviser_type = NULL, -- Reset so Adviser Onboarding form will trigger
  is_active = true
WHERE first_name ILIKE '%Carl%' OR last_name ILIKE '%Suelto%';

-- Also update auth user metadata if needed
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{account_type}',
  '"adviser"'
)
WHERE email IN (
  SELECT email FROM public.profiles WHERE first_name ILIKE '%Carl%' OR last_name ILIKE '%Suelto%'
);
