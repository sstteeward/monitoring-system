-- Update Row Level Security (RLS) policies for the profiles table
-- Purpose: Allow authenticated users to see other users' profiles so they can chat with them.

-- First, drop the overly restrictive strict policy if it exists
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Create a new policy that allows any logged-in user to see all profiles
-- (Needed for student/coordinator chat directory)
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- Keep the existing insert/update policies as they are (users can only edit their own profile)
-- (No changes needed for INSERT and UPDATE)
