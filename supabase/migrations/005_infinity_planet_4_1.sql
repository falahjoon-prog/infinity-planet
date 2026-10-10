-- =====================================================================
-- Infinity Planet 4.1 — business identity, team-chat files and AI bot,
-- Google Drive links, AI chat history.
-- Run AFTER 004. Idempotent: safe to run more than once.
-- =====================================================================

-- 1. Business identity (System → Business). Existing values are kept.
insert into public.app_settings(key, value) values
  ('business_name', to_jsonb('RHC City'::text)),
  ('business_short_name', to_jsonb('RHC'::text)),
  ('bot_provider', to_jsonb('auto'::text))
on conflict (key) do nothing;

-- The 4.0 default AI instructions become a template that follows the business name.
update public.app_settings
set value = to_jsonb('You are {{ai}}, the private operating assistant for {{business}}. Act in {{short}}''s commercial interest. Be concise, factual and specific. Never invent facts, figures, approvals, parties or sources. When you rely on supplied knowledge, cite it with the given [KB-n] or [DOC-n] tag. If information is missing, say so and say what is needed. Legal content is analysis to assist {{short}} and its solicitors, not legal advice.'::text)
where key = 'ai_system_instructions'
  and value = to_jsonb('You are RHC City AI, the private operating assistant for RHC City. Act in RHC''s commercial interest. Be concise, factual and specific. Never invent facts, figures, approvals, parties or sources. When you rely on supplied RHC knowledge, cite it with the given [RHC-n] or [DOC-n] tag. If information is missing, say so and say what is needed. Legal content is analysis to assist RHC and its solicitors, not legal advice.'::text);

-- 2. Team chat: file attachments, AI bot messages, full history paging.
alter table public.team_messages add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.team_messages add column if not exists is_bot boolean not null default false;
alter table public.team_messages add column if not exists bot_meta jsonb;
alter table public.team_messages alter column sender_id drop not null;
create index if not exists team_messages_channel_time_idx on public.team_messages(channel, created_at desc);
insert into public.team_channels(slug, name, description) values
  ('ai-assistant', 'Ask Infinity AI', 'Talk to the AI bot: ask questions, or give it tasks, reminders, meetings and notes')
on conflict (slug) do nothing;

-- 3. AI chat history: pin and rename conversations.
alter table public.ai_conversations add column if not exists pinned boolean not null default false;
create index if not exists ai_conversations_user_idx on public.ai_conversations(created_by, updated_at desc);

-- 4. Google Drive links (folders or files the team adds; synced into knowledge).
create table if not exists public.drive_links (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  file_id text not null unique,
  kind text not null default 'folder' check (kind in ('folder', 'file')),
  name text,
  project_id uuid references public.projects(id) on delete set null,
  recursive boolean not null default true,
  purpose text not null default 'knowledge' check (purpose in ('knowledge', 'brand_book')),
  last_synced_at timestamptz,
  last_status text,
  last_result jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.drive_links enable row level security;
drop policy if exists "rhc read drive_links" on public.drive_links;
drop policy if exists "rhc write drive_links" on public.drive_links;
create policy "rhc read drive_links" on public.drive_links for select using (auth.uid() is not null);
create policy "rhc write drive_links" on public.drive_links for all using (public.rhc_can_write()) with check (public.rhc_can_write());

-- 5. Brand book: documents tagged as the brand book guide marketing, Designer and AI.
create index if not exists documents_category_idx on public.documents(category);

notify pgrst, 'reload schema';
