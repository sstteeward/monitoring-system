-- ==============================================================================
-- Company Requests Schema
-- Run this in the Supabase SQL Editor
-- ==============================================================================

-- 1. Create company_requests table
CREATE TABLE IF NOT EXISTS public.company_requests (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  requested_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  student_name  TEXT,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.company_requests ENABLE ROW LEVEL SECURITY;

-- 3. Any authenticated user can INSERT a request (students included)
CREATE POLICY "Authenticated users can submit company requests"
  ON public.company_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 4. Anyone authenticated can read requests (coordinator needs to see all; student sees own)
CREATE POLICY "Authenticated users can view company requests"
  ON public.company_requests FOR SELECT
  TO authenticated
  USING (true);

-- 5. Only coordinators can update (approve / reject)
CREATE POLICY "Coordinators can update company requests"
  ON public.company_requests FOR UPDATE
  USING (public.is_coordinator());
