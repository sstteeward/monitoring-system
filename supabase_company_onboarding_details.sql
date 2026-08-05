-- Company onboarding extra fields (contact position + logo)
-- Run after supabase_company_onboarding.sql.

-- Add position + logo_url to company requests
ALTER TABLE public.company_requests
  ADD COLUMN IF NOT EXISTS position TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add contact position to companies so it can be carried over on approval
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS contact_position TEXT;

-- Storage bucket for company logos (public so approved companies can show them)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company_logos', 'company_logos', true)
ON CONFLICT (id) DO NOTHING;

-- Any authenticated user can upload a logo while applying
DROP POLICY IF EXISTS "Authenticated users can upload company logos" ON storage.objects;
CREATE POLICY "Authenticated users can upload company logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'company_logos');

-- Anyone can view company logos
DROP POLICY IF EXISTS "Anyone can view company logos" ON storage.objects;
CREATE POLICY "Anyone can view company logos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'company_logos');
