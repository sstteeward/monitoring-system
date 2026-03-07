-- ============================================================
-- ADMIN DELETE USER RPC
-- This function allows an admin to securely delete a user account
-- from both public.profiles and auth.users.
-- Run this script in the Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_delete_user(target_user_id UUID)
RETURNS void AS $$
BEGIN
    -- 1. Check if the calling user is an admin
    IF NOT EXISTS (
        SELECT 1 
        FROM public.profiles 
        WHERE auth_user_id = auth.uid() 
        AND account_type = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform this action';
    END IF;

    -- 2. Delete the user from auth.users (this will cascade to public.profiles 
    -- and other related tables if foreign keys are set up correctly, but we'll 
    -- delete from profiles explicitly just in case)
    DELETE FROM auth.users WHERE id = target_user_id;
    DELETE FROM public.profiles WHERE auth_user_id = target_user_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
