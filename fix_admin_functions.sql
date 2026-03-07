-- ============================================================
-- COMPLETE ADMIN DELETE USER FIX
-- Run this ENTIRE script in the Supabase SQL Editor.
-- It fixes all foreign key constraints AND creates a robust
-- delete function that explicitly cleans up all user data.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- STEP 1: Fix ALL foreign key constraints to use ON DELETE CASCADE
-- ──────────────────────────────────────────────────────────────

-- Timesheets
ALTER TABLE public.timesheets 
  DROP CONSTRAINT IF EXISTS timesheets_user_id_fkey;
ALTER TABLE public.timesheets
  ADD CONSTRAINT timesheets_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Daily Journals
ALTER TABLE public.daily_journals 
  DROP CONSTRAINT IF EXISTS daily_journals_user_id_fkey;
ALTER TABLE public.daily_journals
  ADD CONSTRAINT daily_journals_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Student Documents
ALTER TABLE public.student_documents 
  DROP CONSTRAINT IF EXISTS student_documents_user_id_fkey;
ALTER TABLE public.student_documents
  ADD CONSTRAINT student_documents_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Messages (sender)
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Messages (receiver)
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_receiver_id_fkey;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_receiver_id_fkey
  FOREIGN KEY (receiver_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- User Notifications
ALTER TABLE public.user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_user_id_fkey;
ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Feedback
ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_user_id_fkey;
ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Audit Logs (SET NULL is fine here, we want to keep logs)
ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────
-- STEP 2: Create a ROBUST admin_delete_user function
-- This explicitly deletes from ALL related tables first,
-- then removes the user from auth.users.
-- ──────────────────────────────────────────────────────────────

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

    -- 2. Explicitly delete from ALL related tables
    DELETE FROM public.messages       WHERE sender_id = target_user_id OR receiver_id = target_user_id;
    DELETE FROM public.user_notifications WHERE user_id = target_user_id;
    DELETE FROM public.feedback       WHERE user_id = target_user_id;
    DELETE FROM public.student_documents WHERE user_id = target_user_id;
    DELETE FROM public.daily_journals WHERE user_id = target_user_id;
    DELETE FROM public.timesheets     WHERE user_id = target_user_id;
    DELETE FROM public.company_requests WHERE requested_by = target_user_id;

    -- 3. Nullify audit logs (keep the log, remove the user reference)
    UPDATE public.audit_logs SET user_id = NULL WHERE user_id = target_user_id;

    -- 4. Delete from profiles
    DELETE FROM public.profiles WHERE auth_user_id = target_user_id;

    -- 5. Finally, delete the auth user
    DELETE FROM auth.users WHERE id = target_user_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────
-- STEP 3: Other Admin RPCs (ensure they exist)
-- ──────────────────────────────────────────────────────────────

-- Update User Role
CREATE OR REPLACE FUNCTION admin_update_user_role(target_user_id UUID, new_role TEXT)
RETURNS void AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND account_type = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform this action';
    END IF;
    UPDATE public.profiles SET account_type = new_role WHERE auth_user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update User Status
CREATE OR REPLACE FUNCTION admin_update_user_status(target_user_id UUID, new_status BOOLEAN)
RETURNS void AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND account_type = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform this action';
    END IF;
    UPDATE public.profiles SET is_active = new_status WHERE auth_user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update User Permissions
CREATE OR REPLACE FUNCTION admin_update_user_permissions(target_user_id UUID, new_permissions JSONB)
RETURNS void AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND account_type = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform this action';
    END IF;
    UPDATE public.profiles SET permissions = new_permissions WHERE auth_user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Unlock User Account
CREATE OR REPLACE FUNCTION admin_unlock_user_account(target_user_id UUID)
RETURNS void AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND account_type = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform this action';
    END IF;
    UPDATE public.profiles SET failed_login_attempts = 0, locked_until = NULL WHERE auth_user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
