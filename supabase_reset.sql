-- ============================================================
-- FULL RESET: Run this entire script in Supabase SQL Editor
-- It drops everything first, then recreates from scratch.
-- ============================================================

-- 1. Drop triggers first (they depend on tables)
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_profiles_updated on public.profiles;

-- 2. Drop functions
drop function if exists public.handle_new_user();
drop function if exists public.handle_updated_at();

-- 3. Drop tables (profiles first, then timesheets)
drop table if exists public.profiles cascade;
drop table if exists public.timesheets cascade;

-- ============================================================
-- TIMESHEETS TABLE
-- ============================================================
create table public.timesheets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  break_start timestamptz,
  break_end timestamptz,
  status text not null default 'working' check (status in ('working', 'break', 'completed')),
  created_at timestamptz default now()
);

alter table public.timesheets enable row level security;

create policy "Users can view own timesheets"
  on public.timesheets for select
  using (auth.uid() = user_id);

create policy "Users can insert own timesheets"
  on public.timesheets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own timesheets"
  on public.timesheets for update
  using (auth.uid() = user_id);

-- ============================================================
-- PROFILES TABLE
-- ============================================================
create table public.profiles (
  id uuid default gen_random_uuid() primary key,
  auth_user_id uuid references auth.users(id) on delete cascade not null unique,
  email text,
  email_domain text,
  first_name text,
  middle_name text,
  last_name text,
  account_type text default 'student' check (account_type in ('student', 'coordinator', 'admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = auth_user_id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = auth_user_id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = auth_user_id);

-- ============================================================
-- FUNCTION: auto-update updated_at on profiles
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_profiles_updated
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- ============================================================
-- FUNCTION + TRIGGER: auto-create profile on new user signup
-- Uses SECURITY DEFINER to bypass RLS (runs as DB owner)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (
    auth_user_id,
    email,
    email_domain,
    first_name,
    middle_name,
    last_name,
    account_type
  ) values (
    new.id,
    lower(coalesce(new.email, '')),
    split_part(lower(coalesce(new.email, '')), '@', 2),
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'middle_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'account_type', 'student')
  )
  on conflict (auth_user_id) do nothing;
  return new;
exception when others then
  -- Log the error but don't block user creation
  raise warning 'handle_new_user error: % %', sqlerrm, sqlstate;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
