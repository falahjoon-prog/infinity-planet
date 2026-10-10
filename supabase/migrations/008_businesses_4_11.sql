-- =====================================================================
-- Infinity Planet / RHC City — 4.11 database update: more than one business
--
-- Run once in Supabase → SQL Editor (safe to run again).
-- It only ADDS things: a list of businesses, who belongs to which business,
-- and a "business" column on the records that belong to a business.
-- Everything you already have is filed under your current business (RHC City),
-- and anything the app saves keeps going there until the business switcher is installed.
-- Nothing is deleted or changed.
-- =====================================================================

-- 1. Businesses ---------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  slug text unique,
  is_default boolean not null default false,
  active boolean not null default true,
  sort integer not null default 0,
  -- brand (logo, colours, letterhead, email signature) and other per-business settings
  brand jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists businesses_one_default on public.businesses(is_default) where is_default;

-- Your current business becomes the first (default) one, named from Settings → Business details.
insert into public.businesses (name, short_name, slug, is_default, sort)
select coalesce(nullif(trim(both '"' from (select value::text from public.app_settings where key = 'business_name')), ''), 'RHC City'),
       nullif(trim(both '"' from (select value::text from public.app_settings where key = 'business_short_name')), ''),
       'main', true, 0
where not exists (select 1 from public.businesses);

-- The default business (used for existing records and for anything saved by older versions of the app)
create or replace function public.default_business_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.businesses where is_default order by created_at limit 1
$$;

-- 2. Who belongs to which business --------------------------------------
create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text,                 -- their role in this business (empty = their normal role)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (business_id, profile_id)
);
create index if not exists business_members_profile_idx on public.business_members(profile_id);

-- Everyone already on the team belongs to the default business.
insert into public.business_members (business_id, profile_id)
select public.default_business_id(), p.id from public.profiles p
on conflict do nothing;

-- New team members join the default business automatically (until the switcher lets you choose).
create or replace function public.add_member_to_default_business() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.default_business_id() is not null then
    insert into public.business_members (business_id, profile_id) values (public.default_business_id(), new.id) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists profiles_default_business on public.profiles;
create trigger profiles_default_business after insert on public.profiles for each row execute function public.add_member_to_default_business();

-- Can the signed-in person see this business? (admins and directors see every business)
create or replace function public.rhc_in_business(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.rhc_has_role(array['admin','director'])
    or exists (select 1 from public.business_members m where m.business_id = b and m.profile_id = auth.uid() and m.active)
  )
$$;

-- 3. A "business" column on every record that belongs to a business --------
do $$
declare t text;
begin
  foreach t in array array[
    'projects','deals','contacts','counterparties',
    'documents','document_chunks','drive_links','document_templates','generated_documents',
    'legal_clauses','contract_reviews',
    'marketing_assets','email_drafts','email_links','calendar_events',
    'tasks','notes','reminders','approvals','sign_requests',
    'time_logs','activity_minutes','team_channels',
    'knowledge_syncs','ai_conversations','audit_events','integrations'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists business_id uuid references public.businesses(id)', t);
      execute format('update public.%I set business_id = public.default_business_id() where business_id is null', t);
      execute format('alter table public.%I alter column business_id set default public.default_business_id()', t);
      execute format('create index if not exists %I on public.%I(business_id)', t || '_business_idx', t);
    end if;
  end loop;
end $$;

-- 4. Row security for the new tables ------------------------------------
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

drop policy if exists "businesses read" on public.businesses;
create policy "businesses read" on public.businesses for select using (public.rhc_in_business(id));
drop policy if exists "businesses admin write" on public.businesses;
create policy "businesses admin write" on public.businesses for all
  using (public.rhc_has_role(array['admin','director'])) with check (public.rhc_has_role(array['admin','director']));

drop policy if exists "business members read" on public.business_members;
create policy "business members read" on public.business_members for select
  using (profile_id = auth.uid() or public.rhc_has_role(array['admin','director']));
drop policy if exists "business members admin write" on public.business_members;
create policy "business members admin write" on public.business_members for all
  using (public.rhc_has_role(array['admin','director'])) with check (public.rhc_has_role(array['admin','director']));

-- Done. Check: select name, is_default from public.businesses;  → your business, marked default.
