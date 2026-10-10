create extension if not exists pgcrypto;

create type public.member_role as enum ('admin','director','manager','legal','marketing','project','member','viewer');
create type public.project_status as enum ('active','due_diligence','negotiation','marketing','completed','archived');
create type public.risk_level as enum ('low','medium','high','critical');
create type public.task_status as enum ('todo','in_progress','blocked','done');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.member_role not null default 'member',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  project_type text,
  status public.project_status not null default 'active',
  risk public.risk_level not null default 'medium',
  deal_value numeric,
  owner_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  mime_type text,
  storage_path text,
  source text not null default 'upload',
  external_id text,
  content_text text,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  status public.task_status not null default 'todo',
  priority text not null default 'normal',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  body text not null,
  important boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  title text,
  provider text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  provider text,
  source_ids uuid[] default '{}',
  created_at timestamptz not null default now()
);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  account_email text,
  scopes text[] default '{}',
  encrypted_refresh_token text,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  connected_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.documents enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.integrations enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles self or admin" on public.profiles for select using (auth.uid() = id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','director')));
create policy "projects authenticated read" on public.projects for select using (auth.uid() is not null);
create policy "projects authenticated write" on public.projects for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "documents authenticated" on public.documents for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "tasks authenticated" on public.tasks for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "notes authenticated" on public.notes for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "ai conversations authenticated" on public.ai_conversations for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "ai messages authenticated" on public.ai_messages for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "integrations admin" on public.integrations for all using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','director'))) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','director')));
create policy "audit authenticated read" on public.audit_events for select using (auth.uid() is not null);
create policy "audit authenticated insert" on public.audit_events for insert with check (auth.uid() is not null);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email)); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- V6 integration hardening
create unique index if not exists integrations_provider_unique on public.integrations(provider);
create index if not exists documents_project_idx on public.documents(project_id);
create index if not exists documents_external_idx on public.documents(source,external_id);
create index if not exists tasks_project_idx on public.tasks(project_id);
create index if not exists notes_project_idx on public.notes(project_id);
create index if not exists audit_created_idx on public.audit_events(created_at desc);

-- V1.7 production foundation
create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'general',
  body text not null,
  status text not null default 'draft' check (status in ('draft','under_review','approved','superseded','archived')),
  version integer not null default 1,
  created_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'offline' check (status in ('online','away','busy','offline')),
  last_seen timestamptz not null default now()
);

create table if not exists public.knowledge_syncs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  cursor text,
  status text not null default 'idle' check (status in ('idle','running','failed','complete')),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contract_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  provider text,
  status text not null default 'draft' check (status in ('draft','under_review','approved','rejected')),
  extracted_facts jsonb not null default '{}'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  negotiation_points jsonb not null default '[]'::jsonb,
  counsel_questions jsonb not null default '[]'::jsonb,
  raw_analysis text,
  created_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_status_idx on public.document_templates(status);
create index if not exists presence_seen_idx on public.team_presence(last_seen desc);
create index if not exists contract_reviews_project_idx on public.contract_reviews(project_id);
create index if not exists knowledge_sync_provider_idx on public.knowledge_syncs(provider);

alter table public.document_templates enable row level security;
alter table public.team_presence enable row level security;
alter table public.knowledge_syncs enable row level security;
alter table public.contract_reviews enable row level security;

create policy "templates authenticated read" on public.document_templates for select using (auth.uid() is not null);
create policy "templates manager write" on public.document_templates for all using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','director','manager','marketing','legal'))) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','director','manager','marketing','legal')));
create policy "presence authenticated" on public.team_presence for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "sync admin" on public.knowledge_syncs for all using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','director'))) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','director')));
create policy "contract reviews authenticated" on public.contract_reviews for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- V1.9 legal workflow + project context hardening
create index if not exists contract_reviews_document_idx on public.contract_reviews(document_id);
create index if not exists ai_messages_conversation_created_idx on public.ai_messages(conversation_id, created_at desc);
create index if not exists documents_project_status_idx on public.documents(project_id, status);

-- V1.9 legal workflow + project context hardening
create index if not exists contract_reviews_document_idx on public.contract_reviews(document_id);
create index if not exists ai_messages_conversation_created_idx on public.ai_messages(conversation_id, created_at desc);
create index if not exists documents_project_status_idx on public.documents(project_id, status);

-- V1.9 legal workflow + project context hardening
create index if not exists contract_reviews_document_idx on public.contract_reviews(document_id);
create index if not exists ai_messages_conversation_created_idx on public.ai_messages(conversation_id, created_at desc);
create index if not exists documents_project_status_idx on public.documents(project_id, status);

-- V2.3 knowledge intelligence
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  ordinal integer not null,
  content text not null,
  char_start integer not null default 0,
  char_end integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(document_id, ordinal)
);
create index if not exists document_chunks_document_idx on public.document_chunks(document_id, ordinal);
create index if not exists document_chunks_project_idx on public.document_chunks(project_id);
create index if not exists document_chunks_content_idx on public.document_chunks using gin (to_tsvector('simple', content));
alter table public.document_chunks enable row level security;
create policy "document chunks authenticated" on public.document_chunks for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- V3.0 completion release
create table if not exists public.deals (
 id uuid primary key default gen_random_uuid(), project_id uuid references public.projects(id) on delete cascade,
 stage text not null default 'lead', probability numeric not null default 0, counterparty text, contact_name text, contact_email text,
 expected_value numeric, next_action text, next_action_at timestamptz, owner_id uuid references public.profiles(id), metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.team_messages (
 id uuid primary key default gen_random_uuid(), channel text not null default 'general', sender_id uuid references public.profiles(id), body text not null,
 project_id uuid references public.projects(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.calendar_events (
 id uuid primary key default gen_random_uuid(), project_id uuid references public.projects(id) on delete set null, title text not null,
 starts_at timestamptz not null, ends_at timestamptz, location text, description text, external_id text, provider text default 'internal',
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.reminders (
 id uuid primary key default gen_random_uuid(), project_id uuid references public.projects(id) on delete set null, task_id uuid references public.tasks(id) on delete set null,
 title text not null, remind_at timestamptz not null, status text not null default 'pending', recipient_id uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.marketing_assets (
 id uuid primary key default gen_random_uuid(), project_id uuid references public.projects(id) on delete set null, template_id uuid references public.document_templates(id) on delete set null,
 title text not null, content text not null, status text not null default 'draft', version integer not null default 1, approved_by uuid references public.profiles(id), created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.legal_clauses (
 id uuid primary key default gen_random_uuid(), name text not null, category text not null, preferred_position text, fallback_position text, prohibited_position text,
 source_document_id uuid references public.documents(id) on delete set null, status text not null default 'draft', approved_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.approvals (
 id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid not null, requested_by uuid references public.profiles(id), reviewer_id uuid references public.profiles(id),
 status text not null default 'pending', comments text, created_at timestamptz not null default now(), decided_at timestamptz
);
create index if not exists deals_project_idx on public.deals(project_id); create index if not exists deals_stage_idx on public.deals(stage);
create index if not exists team_messages_channel_idx on public.team_messages(channel,created_at desc);
create index if not exists calendar_events_start_idx on public.calendar_events(starts_at);
create index if not exists reminders_due_idx on public.reminders(remind_at) where status='pending';
create index if not exists marketing_assets_project_idx on public.marketing_assets(project_id);
create index if not exists legal_clauses_category_idx on public.legal_clauses(category);
create index if not exists approvals_pending_idx on public.approvals(status,created_at desc);

do $$ declare t text; begin
 for t in select unnest(array['deals','team_messages','calendar_events','reminders','marketing_assets','legal_clauses','approvals']) loop
   execute format('alter table public.%I enable row level security',t);
   execute format('create policy "authenticated access %s" on public.%I for all using (auth.uid() is not null) with check (auth.uid() is not null)',t,t);
 end loop;
exception when duplicate_object then null; end $$;
