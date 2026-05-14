-- ==============================================================================
-- Fix RLS Policies for dtr_records table
-- 
-- PROBLEM: Coordinators cannot see student DTR records because the RLS policy
-- only allows users to read their own records (auth.uid() = user_id).
-- When a coordinator calls fetchMonthDTRForUser(studentUserId), the query
-- returns empty because the coordinator's auth.uid() ≠ student's user_id.
--
-- SOLUTION: Add a SELECT policy that lets coordinators and admins read all
-- dtr_records.
--
-- Run this in the Supabase SQL Editor.
-- ==============================================================================

-- 1. Allow coordinators and admins to read ALL dtr_records
CREATE POLICY "Coordinators and Admins can view all DTR records"
  ON public.dtr_records FOR SELECT
  USING (
    -- Users can always see their own records
    auth.uid() = user_id
    OR
    -- Coordinators and admins can see all records
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.auth_user_id = auth.uid()
        AND profiles.account_type IN ('coordinator', 'admin')
    )
  );

-- 2. If an existing restrictive SELECT policy exists, drop it first
-- (Run this BEFORE the CREATE POLICY above if you get a conflict error)
--
-- To find existing policies, run:
--   SELECT policyname FROM pg_policies WHERE tablename = 'dtr_records';
--
-- Then drop the restrictive one, e.g.:
--   DROP POLICY IF EXISTS "Users can view own DTR records" ON public.dtr_records;
--   DROP POLICY IF EXISTS "Enable read access for users" ON public.dtr_records;
--   DROP POLICY IF EXISTS "dtr_records_select_policy" ON public.dtr_records;
