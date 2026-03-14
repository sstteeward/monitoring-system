-- ============================================================
-- COMPANY-DEPARTMENT CATEGORIZATION & COORDINATOR TRACKING
-- Run this script in the Supabase SQL Editor.
-- ============================================================

-- 1. Add department_id to companies table if it doesn't exist
ALTER TABLE public.companies 
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- 2. Create coordinator_handled_companies table
CREATE TABLE IF NOT EXISTS public.coordinator_handled_companies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  coordinator_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(coordinator_id, company_id)
);

-- 3. Enable RLS
ALTER TABLE public.coordinator_handled_companies ENABLE ROW LEVEL SECURITY;

-- 4. Policies for coordinator_handled_companies
-- Coordinators can view their own handled companies
CREATE POLICY "Coordinators can view their handled companies"
  ON public.coordinator_handled_companies FOR SELECT
  USING (auth.uid() = coordinator_id);

-- Coordinators can insert/delete their own mappings
CREATE POLICY "Coordinators can manage their handled companies"
  ON public.coordinator_handled_companies FOR ALL
  USING (auth.uid() = coordinator_id);

-- Admins can view everything
CREATE POLICY "Admins can view all handled companies"
  ON public.coordinator_handled_companies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE auth_user_id = auth.uid() 
        AND account_type = 'admin'
    )
  );

-- 5. Refresh schema cache
NOTIFY pgrst, 'reload schema';
