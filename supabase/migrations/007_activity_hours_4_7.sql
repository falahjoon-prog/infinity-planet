-- Infinity Planet 4.7: activity hours (real app usage), real-world time logs with approval, member duties.
-- Safe to run more than once. Run in Supabase → SQL Editor after 006.

-- One row per member per minute they were actually using the app (typing, clicking, scrolling — not just signed in).
create table if not exists public.activity_minutes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  minute timestamptz not null,
  area text,
  primary key (user_id, minute)
);
create index if not exists activity_minutes_minute_idx on public.activity_minutes(minute);

-- Time spent on real-world work (meetings, site visits, agenda items, tasks), checked against the app's estimate.
create table if not exists public.time_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'task' check (kind in ('task','meeting','online_meeting','site_visit','agenda','travel','other')),
  source_type text,
  source_id text,
  title text not null,
  occurred_on date not null default current_date,
  estimated_minutes integer not null,
  reported_minutes integer not null check (reported_minutes >= 0 and reported_minutes <= 1440),
  counted_minutes integer not null default 0,
  status text not null default 'accepted' check (status in ('accepted','justified','pending_approval','approved','adjusted','rejected','skipped')),
  verdict text,
  justification text,
  check_note text,
  approver_id uuid references public.profiles(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  project_id uuid references public.projects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists time_logs_source_uq on public.time_logs(user_id, source_type, source_id);
create index if not exists time_logs_user_day_idx on public.time_logs(user_id, occurred_on);
create index if not exists time_logs_pending_idx on public.time_logs(approver_id) where status = 'pending_approval';

-- Only the server (service role) reads and writes these tables.
alter table public.activity_minutes enable row level security;
alter table public.time_logs enable row level security;

-- Who does what (design, contracts, agenda…) and extra approval rights given to a person beyond their role.
alter table public.profiles add column if not exists duties text[] not null default '{}';
alter table public.profiles add column if not exists extra_approves text[] not null default '{}';
