
-- Create daily_journals table
create table if not exists public.daily_journals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  entry_date date not null default current_date,
  tasks text not null default '',
  learnings text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, entry_date)
);

-- Set up Row Level Security (RLS)
alter table public.daily_journals enable row level security;

-- Policy: Users can view their own journals
create policy "Users can view own journals"
  on public.daily_journals for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own journals
create policy "Users can insert own journals"
  on public.daily_journals for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update their own journals
create policy "Users can update own journals"
  on public.daily_journals for update
  using (auth.uid() = user_id);

-- Trigger to update updated_at
create trigger on_journals_updated
  before update on public.daily_journals
  for each row execute procedure public.handle_updated_at();
