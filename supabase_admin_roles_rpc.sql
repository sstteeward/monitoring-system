-- ============================================================
-- ADMIN ROLE MANAGEMENT RPCs
-- These functions bypass RLS to allow Admins to manage other
-- users' profiles securely.
-- Run this script in the Supabase SQL Editor.
-- ============================================================

-- 1. Update User Role
CREATE OR REPLACE FUNCTION admin_update_user_role(target_user_id UUID, new_role TEXT)
RETURNS void AS $$
BEGIN
    -- Check if the calling user is an admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND account_type = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform this action';
    END IF;

    UPDATE public.profiles SET account_type = new_role WHERE auth_user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update User Active Status
CREATE OR REPLACE FUNCTION admin_update_user_status(target_user_id UUID, new_status BOOLEAN)
RETURNS void AS $$
BEGIN
    -- Check if the calling user is an admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND account_type = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform this action';
    END IF;

    UPDATE public.profiles SET is_active = new_status WHERE auth_user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update User Permissions
CREATE OR REPLACE FUNCTION admin_update_user_permissions(target_user_id UUID, new_permissions JSONB)
RETURNS void AS $$
BEGIN
    -- Check if the calling user is an admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND account_type = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform this action';
    END IF;

    UPDATE public.profiles SET permissions = new_permissions WHERE auth_user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Unlock User Account
CREATE OR REPLACE FUNCTION admin_unlock_user_account(target_user_id UUID)
RETURNS void AS $$
BEGIN
    -- Check if the calling user is an admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND account_type = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform this action';
    END IF;

    UPDATE public.profiles SET failed_login_attempts = 0, locked_until = NULL WHERE auth_user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
