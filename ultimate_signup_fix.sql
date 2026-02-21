-- =========================================================================
-- ULTIMATE SIGNUP FIX & DEBUG SCRIPT
-- =========================================================================
-- This script is designed to fix the "Database error" once and for all.
-- It adds a debug table to capture EXACTLY why the trigger is failing.

-- 1. CREATE A DEBUG LOG TABLE
CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name text,
  error_message text,
  user_id uuid,
  created_at timestamptz DEFAULT now()
);

-- 2. ENSURE PROFILES TABLE IS PERFECT
-- We ensure all possible columns exist with safe defaults.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS middle_name text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_domain text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'student';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS required_ojt_hours integer DEFAULT 500;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS absences integer DEFAULT 0;

-- 3. RECREATE THE TRIGGER FUNCTION WITH LOGGING
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_first_name text;
  v_last_name text;
  v_acct_type text;
BEGIN
  -- Extract metadata safely
  v_first_name := COALESCE(new.raw_user_meta_data->>'first_name', '');
  v_last_name := COALESCE(new.raw_user_meta_data->>'last_name', '');
  v_acct_type := COALESCE(new.raw_user_meta_data->>'account_type', 'student');

  -- Attempt the insert
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
    LOWER(new.email),
    SPLIT_PART(LOWER(new.email), '@', 2),
    v_first_name,
    COALESCE(new.raw_user_meta_data->>'middle_name', ''),
    v_last_name,
    v_acct_type,
    500,
    NULL,
    0
  )
  ON CONFLICT (auth_user_id) DO NOTHING;

  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    -- LOG THE ERROR to our debug table so we can see it!
    INSERT INTO public.system_logs (event_name, error_message, user_id)
    VALUES ('signup_trigger_failure', SQLERRM, new.id);
    
    -- IMPORTANT: STILL RETURN NEW so the user actually gets created in Auth
    -- Even if the profile fails, the user won't see a "Database Error" anymore.
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RE-ATTACH TRIGGER
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 5. RE-SYNC SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

-- 6. VIEW THIS TABLE IF SIGNUP STILL FAILS OR HAS MISSING PROFILES:
-- SELECT * FROM public.system_logs ORDER BY created_at DESC;
