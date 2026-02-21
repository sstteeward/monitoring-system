
-- Create timesheets table
create table if not exists public.timesheets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  break_start timestamptz,
  break_end timestamptz,
  status text not null default 'working' check (status in ('working', 'break', 'completed')),
  created_at timestamptz default now()
);

-- Set up Row Level Security (RLS)
alter table public.timesheets enable row level security;

-- Policy: Users can view their own timesheets
create policy "Users can view own timesheets"
  on public.timesheets for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own timesheets
create policy "Users can insert own timesheets"
  on public.timesheets for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update their own timesheets
create policy "Users can update own timesheets"
  on public.timesheets for update
  using (auth.uid() = user_id);

-- Create profiles table
create table if not exists public.profiles (
  id uuid default gen_random_uuid() primary key,
  auth_user_id uuid references auth.users(id) on delete cascade not null unique,
  email text,
  email_domain text,
  first_name text,
  middle_name text,
  last_name text,
  account_type text default 'student' check (account_type in ('student', 'coordinator', 'admin')),
  required_ojt_hours integer default 500,
  grade text,
  absences integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Set up Row Level Security (RLS) for profiles
alter table public.profiles enable row level security;

-- Policy: Users can view their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = auth_user_id);

-- Policy: Users can insert their own profile
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = auth_user_id);

-- Policy: Users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = auth_user_id);

-- Create a trigger to automatically update the updated_at column
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
-- Trigger: auto-create a profile row when a new user signs up
-- This runs with SECURITY DEFINER so it bypasses RLS policies.
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
    account_type,
    required_ojt_hours,
    grade,
    absences
  ) values (
    new.id,
    lower(new.email),
    split_part(lower(new.email), '@', 2),
    (new.raw_user_meta_data->>'first_name'),
    (new.raw_user_meta_data->>'middle_name'),
    (new.raw_user_meta_data->>'last_name'),
    coalesce(new.raw_user_meta_data->>'account_type', 'student'),
    500,
    null,
    0
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
