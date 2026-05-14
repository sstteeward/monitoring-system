-- ==============================================================================
-- Fix RLS Policies for Admin Access
-- Run this in the Supabase SQL Editor
-- ==============================================================================

-- 1. Update Companies Table Policies
DROP POLICY IF EXISTS "Coordinators can insert companies" ON public.companies;
CREATE POLICY "Coordinators and Admins can insert companies"
  ON public.companies FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type IN ('coordinator', 'admin')
    )
  );

DROP POLICY IF EXISTS "Coordinators can update companies" ON public.companies;
CREATE POLICY "Coordinators and Admins can update companies"
  ON public.companies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type IN ('coordinator', 'admin')
    )
  );

DROP POLICY IF EXISTS "Coordinators can delete companies" ON public.companies;
CREATE POLICY "Coordinators and Admins can delete companies"
  ON public.companies FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type IN ('coordinator', 'admin')
    )
  );

-- 2. Update Company Requests Table Policies
-- Since company_requests uses public.is_coordinator(), we'll update the policy to also allow admins.
DROP POLICY IF EXISTS "Coordinators can update company requests" ON public.company_requests;
CREATE POLICY "Coordinators and Admins can update company requests"
  ON public.company_requests FOR UPDATE
  USING (
    public.is_coordinator() OR 
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid() AND account_type = 'admin'
    )
  );
