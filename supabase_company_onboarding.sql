-- Company self-registration and onboarding application fields
-- Run after supabase_company_requests.sql and supabase_company_portal.sql.

ALTER TABLE public.company_requests
  ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'student_company',
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.company_requests
  DROP CONSTRAINT IF EXISTS company_requests_request_type_check;

ALTER TABLE public.company_requests
  ADD CONSTRAINT company_requests_request_type_check
  CHECK (request_type IN ('student_company', 'company_account'));

CREATE INDEX IF NOT EXISTS company_requests_request_type_status_idx
  ON public.company_requests (request_type, status);

-- Coordinators already have update access to company_requests from the base schema.
-- Company applicants only need to insert and view their own request.
DROP POLICY IF EXISTS "Company applicants can view their own onboarding request" ON public.company_requests;
CREATE POLICY "Company applicants can view their own onboarding request"
  ON public.company_requests FOR SELECT
  TO authenticated
  USING (requested_by = auth.uid());
