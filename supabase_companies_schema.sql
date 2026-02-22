-- ==============================================================================
-- Companies Schema
-- Run this in the Supabase SQL Editor
-- ==============================================================================

-- 1. Create companies table
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  contact_person TEXT,
  contact_email TEXT,
  industry TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add company_id to student profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

-- 3. Row Level Security (RLS) for companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view companies (students need to see their company)
CREATE POLICY "All authenticated users can view companies"
  ON public.companies FOR SELECT
  TO authenticated
  USING (true);

-- Only coordinators can insert companies
CREATE POLICY "Coordinators can insert companies"
  ON public.companies FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'coordinator'
    )
  );

-- Only coordinators can update companies
CREATE POLICY "Coordinators can update companies"
  ON public.companies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'coordinator'
    )
  );

-- Only coordinators can delete companies
CREATE POLICY "Coordinators can delete companies"
  ON public.companies FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'coordinator'
    )
  );

-- 4. Trigger to update updated_at
CREATE TRIGGER on_companies_updated
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- 5. Allow coordinators to update a student's company assignment
-- (The coordinator policy on profiles already allows UPDATE, so this is covered)

-- 6. Seed some example companies (optional - comment out if not needed)
-- INSERT INTO public.companies (name, address, contact_person, industry)
-- VALUES 
--   ('Tech Solutions Inc.', 'Dumaguete City', 'Juan dela Cruz', 'Information Technology'),
--   ('Global BPO Corp.', 'Dumaguete City', 'Maria Santos', 'Business Process Outsourcing'),
--   ('Creative Agency Ltd.', 'Dumaguete City', 'Jose Reyes', 'Creative Services');
