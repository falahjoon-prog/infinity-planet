-- =====================================================================
-- Infinity Planet — 4.12 database update: Finance and Payroll
--
-- Run once in Supabase → SQL Editor (safe to run again). It only ADDS things.
--   • finance_parties   investors, consultants, suppliers and others we pay or receive money from
--   • finance_entries   money in (investor funds, other income) and money out (expenses, bills/invoices received)
--   • pay_settings      each team member's pay: employee or contractor, hourly rate or salary, tax and super settings
--   • pay_runs / pay_lines  weekly pay runs with hours, gross pay, PAYG withheld, super and net pay
-- Only the app's server reads and writes these tables (row security on, no public policies);
-- the app lets admins and directors in, plus anyone an admin ticks for "Finance".
-- =====================================================================

create table if not exists public.finance_parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'supplier' check (kind in ('investor','consultant','supplier','customer','government','other')),
  abn text,
  email text,
  phone text,
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists finance_parties_name_uq on public.finance_parties(lower(name));

create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income','expense')),
  category text not null default 'other',
  party_id uuid references public.finance_parties(id) on delete set null,
  party_name text,
  description text,
  reference text,                       -- invoice / receipt number
  amount_cents bigint not null default 0,   -- excluding GST
  gst_cents bigint not null default 0,
  total_cents bigint not null default 0,    -- including GST
  currency text not null default 'AUD',
  entry_date date not null default current_date,
  due_date date,
  status text not null default 'unpaid' check (status in ('draft','unpaid','paid','received','expected','cancelled')),
  paid_date date,
  is_invoice boolean not null default false,   -- an invoice/bill we received (consultants, suppliers)
  needs_review boolean not null default false,  -- read automatically from an email/upload: check before relying on it
  source text not null default 'manual' check (source in ('manual','upload','email','payroll')),
  project_id uuid references public.projects(id) on delete set null,
  pay_run_id uuid,
  file_path text,
  file_name text,
  file_mime text,
  gmail_message_id text,
  gmail_attachment_key text,           -- message id + attachment file name: stops the same attachment being imported twice
  email_from text,
  email_subject text,
  extracted jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists finance_entries_kind_date_idx on public.finance_entries(kind, entry_date desc);
create index if not exists finance_entries_party_idx on public.finance_entries(party_id);
create unique index if not exists finance_entries_gmail_uq on public.finance_entries(gmail_attachment_key) where gmail_attachment_key is not null;

create table if not exists public.pay_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  pay_type text not null default 'employee' check (pay_type in ('employee','contractor')),
  rate_type text not null default 'hourly' check (rate_type in ('hourly','salary')),
  hourly_rate_cents bigint not null default 0,
  annual_salary_cents bigint not null default 0,
  salary_hours numeric(5,2) not null default 38,       -- standard weekly hours for a salary
  tax_scale text not null default '2' check (tax_scale in ('1','2','3','4','5','6')),
  study_loan boolean not null default false,
  super_rate numeric(5,2) not null default 12.00,
  super_fund text,
  super_member_no text,
  abn text,
  gst_registered boolean not null default false,
  active boolean not null default true,
  notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.pay_runs (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  pay_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','finalised','paid')),
  gross_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  super_cents bigint not null default 0,
  net_cents bigint not null default 0,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  finalised_by uuid references public.profiles(id) on delete set null,
  finalised_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists pay_runs_week_uq on public.pay_runs(week_start);

create table if not exists public.pay_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pay_runs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  pay_type text not null,
  hours numeric(7,2) not null default 0,
  hours_source text,                    -- 'signed off', 'app + logged time', 'entered'
  rate_cents bigint not null default 0,
  gross_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  super_cents bigint not null default 0,
  gst_cents bigint not null default 0,
  net_cents bigint not null default 0,
  tax_scale text,
  note text,
  created_at timestamptz not null default now(),
  unique (run_id, profile_id)
);

alter table public.finance_parties enable row level security;
alter table public.finance_entries enable row level security;
alter table public.pay_settings enable row level security;
alter table public.pay_runs enable row level security;
alter table public.pay_lines enable row level security;

-- File them under the business (from update 008), when that update has been run.
do $$
declare t text;
begin
  if to_regprocedure('public.default_business_id()') is not null then
    foreach t in array array['finance_parties','finance_entries','pay_runs'] loop
      execute format('alter table public.%I add column if not exists business_id uuid references public.businesses(id)', t);
      execute format('update public.%I set business_id = public.default_business_id() where business_id is null', t);
      execute format('alter table public.%I alter column business_id set default public.default_business_id()', t);
    end loop;
  end if;
end $$;

-- Make the new tables visible to the app straight away
notify pgrst, 'reload schema';

-- Done. Check: select count(*) from public.finance_entries;  → 0 (nothing yet)
