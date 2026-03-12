-- ============================================================
-- COORDINATOR DEPARTMENT MANAGEMENT - RLS & RPC
-- Run this script in the Supabase SQL Editor.
-- ============================================================

-- 1. RPC: Allow admins to assign a coordinator to a department
--    This uses SECURITY DEFINER to bypass RLS, matching the existing
--    admin RPC pattern (admin_update_user_role, admin_update_user_status, etc.)

CREATE OR REPLACE FUNCTION admin_assign_department(target_user_id UUID, new_department_id UUID)
RETURNS void AS $$
BEGIN
    -- Check if the calling user is an admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND account_type = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform this action';
    END IF;

    UPDATE public.profiles SET department_id = new_department_id WHERE auth_user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. RLS: Allow coordinators to update student department_id
--    A coordinator can only assign students to their OWN department (or set to null).

DROP POLICY IF EXISTS "Coordinators can manage their department students" ON public.profiles;

CREATE POLICY "Coordinators can manage their department students"
  ON public.profiles FOR UPDATE
  USING (
    account_type = 'student'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = auth.uid()
        AND p.account_type = 'coordinator'
    )
  )
  WITH CHECK (
    account_type = 'student'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = auth.uid()
        AND p.account_type = 'coordinator'
    )
    AND (
      department_id IS NULL
      OR department_id = (
        SELECT p.department_id FROM public.profiles p
        WHERE p.auth_user_id = auth.uid()
      )
    )
  );

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
