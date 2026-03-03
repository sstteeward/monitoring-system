-- ============================================================
-- ENTERPRISE ADMIN FEATURES - SCHEMA SETUP
-- Run this script in the Supabase SQL Editor.
-- ============================================================

-- 1. Create Departments Table
create table if not exists public.departments (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  description text,
  created_at timestamptz default now()
);

alter table public.departments enable row level security;
-- Everyone can read departments
create policy "Anyone can read departments" on public.departments for select using (true);
-- Only admins can modify departments
create policy "Admins can insert departments" on public.departments for insert with check (
  exists (select 1 from public.profiles where auth_user_id = auth.uid() and account_type = 'admin')
);
create policy "Admins can update departments" on public.departments for update using (
  exists (select 1 from public.profiles where auth_user_id = auth.uid() and account_type = 'admin')
);
create policy "Admins can delete departments" on public.departments for delete using (
  exists (select 1 from public.profiles where auth_user_id = auth.uid() and account_type = 'admin')
);

-- 2. Create System Settings Table
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz default now()
);

alter table public.system_settings enable row level security;
-- Everyone can read system settings
create policy "Anyone can read system settings" on public.system_settings for select using (true);
-- Only admins can modify system settings
create policy "Admins can manage system settings" on public.system_settings using (
  exists (select 1 from public.profiles where auth_user_id = auth.uid() and account_type = 'admin')
);

-- Insert Default Settings
insert into public.system_settings (key, value, description) values
  ('ojt_hours', '{"required": 300, "max_daily": 8}', 'OJT Hours Configuration'),
  ('journal_submission', '{"deadline_days": 7}', 'Journal Submission Rules'),
  ('file_uploads', '{"max_size_mb": 10, "allowed_types": ["application/pdf", "image/png", "image/jpeg"]}', 'File Upload Constraints'),
  ('maintenance_mode', '{"enabled": false, "message": "System is currently undergoing maintenance. Please try again later."}', 'System Maintenance Mode')
on conflict (key) do nothing;

-- 3. Create Audit Logs Table
create table if not exists public.audit_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  table_name text,
  record_id text,
  details jsonb,
  ip_address text,
  created_at timestamptz default now()
);

alter table public.audit_logs enable row level security;
-- Only admins can read audit logs
create policy "Admins can read audit logs" on public.audit_logs for select using (
  exists (select 1 from public.profiles where auth_user_id = auth.uid() and account_type = 'admin')
);
-- Authenticated users can insert their own audit logs (backend functions might bypass this with service role)
create policy "Authenticated users can insert audit logs" on public.audit_logs for insert with check (auth.role() = 'authenticated');


-- 4. Update Profiles Table
alter table public.profiles
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists permissions jsonb default '{"can_approve_journals": true, "can_edit_grades": false, "can_export_reports": false, "can_delete_students": false}'::jsonb,
  add column if not exists is_active boolean default true,
  add column if not exists failed_login_attempts integer default 0,
  add column if not exists locked_until timestamptz;

-- Refresh schema cache if needed
notify pgrst, 'reload schema';
