-- =========================================================================
-- SIGNUP RESCUE SCRIPT (RUN THIS IN SUPABASE SQL EDITOR)
-- =========================================================================
-- This script fixes the "Database error saving new user" by ensuring the
-- profiles table and the signup trigger are perfectly synchronized.

-- 1. ENSURE PROFILES TABLE EXISTS WITH ALL REQUIRED COLUMNS
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email text,
  email_domain text,
  first_name text,
  middle_name text,
  last_name text,
  account_type text DEFAULT 'student' CHECK (account_type IN ('student', 'coordinator', 'admin')),
  required_ojt_hours integer DEFAULT 500,
  grade text,
  absences integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. SAFELY ADD ANY MISSING COLUMNS (In case table already existed but was incomplete)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS required_ojt_hours integer DEFAULT 500;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS grade text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS absences integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS middle_name text;

-- 3. CLEAN UP TRIGGER AND FUNCTION TO PREVENT CONFLICTS
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 4. RECREATE THE SIGNUP TRIGGER FUNCTION WITH ROBUST LOGIC
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Insert the new user's profile data
  -- We use the metadata passed from the Auth.signUp() call in the frontend
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
    COALESCE(new.raw_user_meta_data->>'first_name', ''),
    COALESCE(new.raw_user_meta_data->>'middle_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    COALESCE(new.raw_user_meta_data->>'account_type', 'student'),
    500,  -- Default SIL hours
    NULL, -- Default grade
    0     -- Default absences
  );
  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    -- If anything fails, log the error (will show in Supabase Logs) and return new
    -- This prevents the ENTIRE signup from failing if only the profile row fails
    RAISE LOG 'Error in handle_new_user trigger for user %: %', new.id, SQLERRM;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RE-ATTACH THE TRIGGER
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 6. ENABLE RLS (Just in case)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 7. RE-APPLY RLS POLICIES (Clean start)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = auth_user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = auth_user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = auth_user_id);

-- 8. REFRESH CACHE
NOTIFY pgrst, 'reload schema';
