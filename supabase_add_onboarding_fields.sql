-- Add new columns for student onboarding details
alter table public.profiles 
  add column if not exists birthday date,
  add column if not exists address text,
  add column if not exists contact_number text,
  add column if not exists year_level text,
  add column if not exists section text,
  add column if not exists course text,
  add column if not exists department text;
