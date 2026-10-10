-- =====================================================================
-- RHC City V4 — Business Operating System migration
-- Safe to run on top of the V3.1 schema (001_base_schema.sql — the old supabase/schema.sql).
-- Idempotent: every statement can be re-run without damage.
-- Run in the Supabase SQL Editor AFTER 001_base_schema.sql (existing V3.1 databases already have it).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. Helper functions (security definer so RLS policies on profiles do
--    not recurse — the V3.1 profiles policy queried profiles from inside
--    its own policy, which Postgres rejects with "infinite recursion").
-- ---------------------------------------------------------------------
create or replace function public.rhc_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid()
$$;

create or replace function public.rhc_has_role(roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text from public.profiles where id = auth.uid()) = any(roles), false)
$$;

create or replace function public.rhc_can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and coalesce((select role::text from public.profiles where id = auth.uid()), 'member') <> 'viewer'
$$;

-- ---------------------------------------------------------------------
-- 1. Profiles: email + title; trigger keeps email in sync.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists title text;
alter table public.profiles add column if not exists active boolean not null default true;
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- The first user to exist becomes admin if nobody is admin yet.
update public.profiles set role = 'admin'
where id = (select id from public.profiles order by created_at asc limit 1)
  and not exists (select 1 from public.profiles where role = 'admin');

-- ---------------------------------------------------------------------
-- 2. App settings (RHC AI system instructions, policies)
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.app_settings(key, value) values
  ('ai_system_instructions', to_jsonb('You are RHC City AI, the private operating assistant for RHC City. Act in RHC''s commercial interest. Be concise, factual and specific. Never invent facts, figures, approvals, parties or sources. When you rely on supplied RHC knowledge, cite it with the given [RHC-n] or [DOC-n] tag. If information is missing, say so and say what is needed. Legal content is analysis to assist RHC and its solicitors, not legal advice.'::text)),
  ('email_requires_approval', 'true'::jsonb),
  ('home_jurisdiction', to_jsonb('Queensland'::text)),
  ('rhc_entity_names', '["RHC City", "RHC"]'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 3. Projects: operating fields
-- ---------------------------------------------------------------------
alter table public.projects add column if not exists location text;
alter table public.projects add column if not exists counterparty text;
alter table public.projects add column if not exists next_action text;
alter table public.projects add column if not exists next_action_at timestamptz;
alter table public.projects add column if not exists tags text[] not null default '{}';
alter table public.projects add column if not exists highlights text;
alter table public.projects add column if not exists created_by uuid references public.profiles(id);

-- ---------------------------------------------------------------------
-- 4. Counterparties and contacts
-- ---------------------------------------------------------------------
create table if not exists public.counterparties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'company',
  abn text,
  website text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  counterparty_id uuid references public.counterparties(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  full_name text not null,
  position text,
  email text,
  phone text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_project_idx on public.contacts(project_id);
create index if not exists contacts_counterparty_idx on public.contacts(counterparty_id);

-- ---------------------------------------------------------------------
-- 5. Deals: full pipeline
-- ---------------------------------------------------------------------
alter table public.deals add column if not exists title text;
alter table public.deals add column if not exists counterparty_id uuid references public.counterparties(id) on delete set null;
alter table public.deals add column if not exists contact_phone text;
alter table public.deals add column if not exists notes text;
alter table public.deals add column if not exists lost_reason text;
alter table public.deals add column if not exists closed_at timestamptz;
alter table public.deals alter column project_id drop not null;
update public.deals set stage = 'completed' where stage in ('closed', 'won');
update public.deals set stage = 'lead' where stage not in ('lead','opportunity','negotiation','due_diligence','contract','completed','lost');
do $$ begin
  alter table public.deals add constraint deals_stage_check check (stage in ('lead','opportunity','negotiation','due_diligence','contract','completed','lost'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 6. Documents: authority, review status, deal link, Drive fields
-- ---------------------------------------------------------------------
alter table public.documents add column if not exists authority text not null default 'draft';
alter table public.documents add column if not exists review_status text not null default 'unreviewed';
alter table public.documents add column if not exists category text;
alter table public.documents add column if not exists deal_id uuid references public.deals(id) on delete set null;
alter table public.documents add column if not exists web_url text;
alter table public.documents add column if not exists external_modified_at timestamptz;
do $$ begin
  alter table public.documents add constraint documents_authority_check check (authority in ('approved','preferred','fallback','historical_precedent','draft'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.documents add constraint documents_review_status_check check (review_status in ('unreviewed','awaiting_review','reviewed','approved','rejected'));
exception when duplicate_object then null; end $$;
create index if not exists documents_review_idx on public.documents(review_status);
create unique index if not exists documents_drive_unique on public.documents(external_id) where source = 'google_drive' and external_id is not null;

-- Full-text search over chunks (English stemming) + RPC used by the app
create index if not exists document_chunks_fts_en_idx on public.document_chunks using gin (to_tsvector('english', content));
create or replace function public.search_chunks(q text, p_project uuid default null, p_documents uuid[] default null, lim int default 12)
returns table(id uuid, document_id uuid, project_id uuid, ordinal int, content text, rank real)
language sql stable as $$
  select c.id, c.document_id, c.project_id, c.ordinal, c.content,
         ts_rank(to_tsvector('english', c.content), websearch_to_tsquery('english', q)) as rank
  from public.document_chunks c
  where to_tsvector('english', c.content) @@ websearch_to_tsquery('english', q)
    and (p_project is null or c.project_id = p_project)
    and (p_documents is null or c.document_id = any(p_documents))
  order by rank desc
  limit greatest(1, least(lim, 50))
$$;
create or replace function public.search_chunks_any(q text, p_project uuid default null, p_documents uuid[] default null, lim int default 12)
returns table(id uuid, document_id uuid, project_id uuid, ordinal int, content text, rank real)
language sql stable as $$
  -- OR-semantics fallback when the strict websearch query finds nothing
  with terms as (
    select string_agg(quote_literal(lexeme), ' | ') as tsq
    from unnest(tsvector_to_array(to_tsvector('english', q))) as lexeme
  )
  select c.id, c.document_id, c.project_id, c.ordinal, c.content,
         ts_rank(to_tsvector('english', c.content), to_tsquery('english', t.tsq)) as rank
  from public.document_chunks c, terms t
  where t.tsq is not null
    and to_tsvector('english', c.content) @@ to_tsquery('english', t.tsq)
    and (p_project is null or c.project_id = p_project)
    and (p_documents is null or c.document_id = any(p_documents))
  order by rank desc
  limit greatest(1, least(lim, 50))
$$;

alter table public.ai_messages add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.ai_conversations add column if not exists archived boolean not null default false;

-- ---------------------------------------------------------------------
-- 7. Tasks / notes: deal link, reminders
-- ---------------------------------------------------------------------
alter table public.tasks add column if not exists deal_id uuid references public.deals(id) on delete set null;
alter table public.tasks add column if not exists completed_at timestamptz;
alter table public.notes add column if not exists deal_id uuid references public.deals(id) on delete set null;
alter table public.notes add column if not exists tags text[] not null default '{}';
create index if not exists tasks_assigned_idx on public.tasks(assigned_to, status);
create index if not exists tasks_due_idx on public.tasks(due_at) where status <> 'done';
alter table public.reminders add column if not exists event_id uuid references public.calendar_events(id) on delete cascade;
alter table public.reminders add column if not exists notified_at timestamptz;

-- ---------------------------------------------------------------------
-- 8. Legal: clause authority, reviews with full structured analysis
-- ---------------------------------------------------------------------
alter table public.legal_clauses add column if not exists authority text not null default 'draft';
alter table public.legal_clauses add column if not exists clause_text text;
alter table public.legal_clauses add column if not exists keywords text[] not null default '{}';
alter table public.legal_clauses add column if not exists notes text;
alter table public.legal_clauses add column if not exists created_by uuid references public.profiles(id);
update public.legal_clauses set authority = 'approved' where status = 'approved' and authority = 'draft' and approved_by is not null;
do $$ begin
  alter table public.legal_clauses add constraint legal_clauses_authority_check check (authority in ('approved','preferred','fallback','historical_precedent','draft'));
exception when duplicate_object then null; end $$;

alter table public.contract_reviews add column if not exists title text;
alter table public.contract_reviews add column if not exists engine text not null default 'ai';
alter table public.contract_reviews add column if not exists risk_rating text;
alter table public.contract_reviews add column if not exists risk_score integer;
alter table public.contract_reviews add column if not exists analysis jsonb not null default '{}'::jsonb;
alter table public.contract_reviews add column if not exists ai_error text;
alter table public.contract_reviews add column if not exists approval_id uuid;
alter table public.contract_reviews drop constraint if exists contract_reviews_status_check;
alter table public.contract_reviews add constraint contract_reviews_status_check check (status in ('draft','under_review','awaiting_approval','approved','rejected','changes_requested'));

-- ---------------------------------------------------------------------
-- 9. Templates: authority-aware + system starter flag
-- ---------------------------------------------------------------------
alter table public.document_templates add column if not exists description text;
alter table public.document_templates add column if not exists kind text not null default 'document';
alter table public.document_templates add column if not exists system_seed boolean not null default false;
alter table public.document_templates add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists document_templates_seed_unique on public.document_templates(name) where system_seed;

-- ---------------------------------------------------------------------
-- 10. Generated documents (MOU, offer, letter, HoA, contract, proposal …)
-- ---------------------------------------------------------------------
create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  template_id uuid references public.document_templates(id) on delete set null,
  doc_type text not null,
  title text not null,
  body text not null,
  inputs jsonb not null default '{}'::jsonb,
  clause_ids uuid[] not null default '{}',
  engine text not null default 'template',
  provider text,
  status text not null default 'draft' check (status in ('draft','awaiting_approval','approved','rejected','changes_requested','exported')),
  approval_id uuid,
  version integer not null default 1,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists generated_documents_project_idx on public.generated_documents(project_id);

-- ---------------------------------------------------------------------
-- 11. Marketing assets + Designer
-- ---------------------------------------------------------------------
alter table public.marketing_assets add column if not exists kind text not null default 'copy';
alter table public.marketing_assets add column if not exists layout text;
alter table public.marketing_assets add column if not exists design jsonb not null default '{}'::jsonb;
alter table public.marketing_assets add column if not exists channel text;
alter table public.marketing_assets add column if not exists engine text;
alter table public.marketing_assets add column if not exists approval_id uuid;
do $$ begin
  alter table public.marketing_assets add constraint marketing_assets_status_check check (status in ('draft','awaiting_approval','approved','rejected','changes_requested','archived'));
exception when duplicate_object then null; when check_violation then null; end $$;

-- ---------------------------------------------------------------------
-- 12. Approvals: richer workflow
-- ---------------------------------------------------------------------
alter table public.approvals add column if not exists title text;
alter table public.approvals add column if not exists summary text;
alter table public.approvals add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.approvals add column if not exists decided_by uuid references public.profiles(id);
alter table public.approvals add column if not exists decision_note text;
alter table public.approvals add column if not exists category text;
alter table public.approvals add column if not exists updated_at timestamptz not null default now();
do $$ begin
  alter table public.approvals add constraint approvals_status_check check (status in ('pending','approved','rejected','changes_requested','cancelled'));
exception when duplicate_object then null; when check_violation then null; end $$;
create table if not exists public.approval_comments (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.approvals(id) on delete cascade,
  author_id uuid references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists approval_comments_idx on public.approval_comments(approval_id, created_at);

-- ---------------------------------------------------------------------
-- 13. Email: project links and drafts awaiting approval
-- ---------------------------------------------------------------------
create table if not exists public.email_links (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null,
  gmail_thread_id text,
  project_id uuid references public.projects(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  subject text,
  from_address text,
  snippet text,
  sent_at timestamptz,
  linked_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(gmail_message_id, project_id)
);
create table if not exists public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  in_reply_to text,
  gmail_thread_id text,
  to_addresses text not null,
  cc_addresses text,
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft','awaiting_approval','approved','rejected','changes_requested','sent','failed')),
  approval_id uuid,
  gmail_message_id text,
  engine text,
  error text,
  created_by uuid references public.profiles(id),
  sent_by uuid references public.profiles(id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 14. Calendar additions
-- ---------------------------------------------------------------------
alter table public.calendar_events add column if not exists attendees text[] not null default '{}';
alter table public.calendar_events add column if not exists reminder_minutes integer;
alter table public.calendar_events add column if not exists all_day boolean not null default false;
alter table public.calendar_events add column if not exists synced_at timestamptz;
create unique index if not exists calendar_events_external_unique on public.calendar_events(external_id) where external_id is not null;

-- ---------------------------------------------------------------------
-- 15. Team channels
-- ---------------------------------------------------------------------
create table if not exists public.team_channels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  project_id uuid references public.projects(id) on delete cascade,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
insert into public.team_channels(slug, name, description) values
  ('general','General','Company-wide RHC conversation'),
  ('deals','Deals','Pipeline, offers and negotiations'),
  ('legal','Legal','Contracts, reviews and solicitor matters'),
  ('marketing','Marketing','Campaigns, designs and approvals')
on conflict (slug) do nothing;
alter table public.team_messages add column if not exists edited_at timestamptz;

-- ---------------------------------------------------------------------
-- 16. Row-level security for every table.
--     Read: any signed-in team member. Write: anyone except 'viewer'.
--     The server uses the service role and enforces finer RBAC in code.
--     (V3.0's RLS loop declared no loop variable and would have failed,
--      so it is re-applied here.)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array[
    'projects','documents','document_chunks','tasks','notes','ai_conversations','ai_messages',
    'document_templates','team_presence','contract_reviews','deals','team_messages','calendar_events',
    'reminders','marketing_assets','legal_clauses','approvals','approval_comments','counterparties','contacts',
    'generated_documents','email_links','email_drafts','team_channels'
  ]) loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "rhc read %s" on public.%I', t, t);
    execute format('drop policy if exists "rhc write %s" on public.%I', t, t);
    execute format('create policy "rhc read %s" on public.%I for select using (auth.uid() is not null)', t, t);
    execute format('create policy "rhc write %s" on public.%I for all using (public.rhc_can_write()) with check (public.rhc_can_write())', t, t);
  end loop;
end $$;

-- Replace permissive V3 policies with the role-aware ones above
drop policy if exists "projects authenticated write" on public.projects;
drop policy if exists "documents authenticated" on public.documents;
drop policy if exists "tasks authenticated" on public.tasks;
drop policy if exists "notes authenticated" on public.notes;
drop policy if exists "ai conversations authenticated" on public.ai_conversations;
drop policy if exists "ai messages authenticated" on public.ai_messages;
drop policy if exists "document chunks authenticated" on public.document_chunks;
drop policy if exists "contract reviews authenticated" on public.contract_reviews;
drop policy if exists "presence authenticated" on public.team_presence;
drop policy if exists "templates manager write" on public.document_templates;
do $$
declare t text;
begin
  for t in select unnest(array['deals','team_messages','calendar_events','reminders','marketing_assets','legal_clauses','approvals']) loop
    execute format('drop policy if exists "authenticated access %s" on public.%I', t, t);
  end loop;
end $$;

-- Profiles: non-recursive policies
drop policy if exists "profiles self or admin" on public.profiles;
drop policy if exists "rhc profiles read" on public.profiles;
drop policy if exists "rhc profiles self update" on public.profiles;
drop policy if exists "rhc profiles admin" on public.profiles;
create policy "rhc profiles read" on public.profiles for select using (auth.uid() is not null);
create policy "rhc profiles self update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id and role::text = public.rhc_role());
create policy "rhc profiles admin" on public.profiles for all using (public.rhc_has_role(array['admin','director'])) with check (public.rhc_has_role(array['admin','director']));

-- Integrations + settings + syncs: admin/director only (tokens are encrypted, never sent to browsers)
drop policy if exists "integrations admin" on public.integrations;
create policy "integrations admin" on public.integrations for all using (public.rhc_has_role(array['admin','director'])) with check (public.rhc_has_role(array['admin','director']));
alter table public.app_settings enable row level security;
drop policy if exists "settings read" on public.app_settings;
drop policy if exists "settings admin" on public.app_settings;
create policy "settings read" on public.app_settings for select using (auth.uid() is not null);
create policy "settings admin" on public.app_settings for all using (public.rhc_has_role(array['admin','director'])) with check (public.rhc_has_role(array['admin','director']));
drop policy if exists "sync admin" on public.knowledge_syncs;
create policy "sync admin" on public.knowledge_syncs for all using (public.rhc_has_role(array['admin','director'])) with check (public.rhc_has_role(array['admin','director']));

-- Audit log: append-only for users
drop policy if exists "audit authenticated insert" on public.audit_events;
create policy "audit authenticated insert" on public.audit_events for insert with check (auth.uid() is not null and actor_id = auth.uid());

-- ---------------------------------------------------------------------
-- 17. Storage bucket for documents and design images (private)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('rhc-documents', 'rhc-documents', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
