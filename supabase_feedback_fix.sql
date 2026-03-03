-- Run this in the Supabase SQL Editor to fix the feedback visibility issue
-- This adds the necessary relationship for the Admin Dashboard to join feedback with user profiles

-- 1. Drop the existing foreign key to auth.users if it exists (standard Supabase name is usually table_column_fkey)
ALTER TABLE IF EXISTS public.feedback 
DROP CONSTRAINT IF EXISTS feedback_user_id_fkey;

-- 2. Add the foreign key to public.profiles(auth_user_id)
-- This allows Supabase to recognize the relationship between feedback and profiles
ALTER TABLE public.feedback
ADD CONSTRAINT feedback_profiles_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(auth_user_id) 
ON DELETE CASCADE;

-- 3. Verify the relationship is recognized (no action needed, just for your information)
-- After running this, the 'profiles(...)' selector in getFeedback() will work correctly.
