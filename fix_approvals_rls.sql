-- ==============================================================================
-- Fix RLS Policies for Coordinator Approvals
-- Run this in the Supabase SQL Editor
-- ==============================================================================

-- 1. Timesheets Table: Allow coordinators and admins to update
DROP POLICY IF EXISTS "Coordinators can update timesheets" ON public.timesheets;
CREATE POLICY "Coordinators and Admins can update timesheets"
  ON public.timesheets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type IN ('coordinator', 'admin')
    )
  );

-- 2. Daily Journals: Allow coordinators and admins to update
DROP POLICY IF EXISTS "Coordinators can update journals" ON public.daily_journals;
CREATE POLICY "Coordinators and Admins can update journals"
  ON public.daily_journals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type IN ('coordinator', 'admin')
    )
  );

-- 3. Department Change Requests: Allow coordinators and admins to update
DROP POLICY IF EXISTS "Coordinators and Admins can update department change requests" ON public.department_change_requests;
CREATE POLICY "Coordinators and Admins can update department change requests"
  ON public.department_change_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type IN ('coordinator', 'admin')
    )
  );
