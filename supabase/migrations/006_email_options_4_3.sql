-- Infinity Planet 4.3: full email options (Bcc, attachments, schedule send, forward).
-- Safe to run more than once. Run in Supabase → SQL Editor after 005.
alter table public.email_drafts add column if not exists bcc_addresses text;
alter table public.email_drafts add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.email_drafts add column if not exists scheduled_at timestamptz;
alter table public.email_drafts add column if not exists scheduled_by uuid references public.profiles(id);
alter table public.email_drafts add column if not exists forward_of text;
create index if not exists email_drafts_scheduled_idx on public.email_drafts(scheduled_at) where scheduled_at is not null and status <> 'sent';
insert into public.app_settings(key, value) values ('email_snippets', '[]'::jsonb) on conflict (key) do nothing;

-- Notes can belong to a team member (their colour and name show on the note)
alter table public.notes add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
create index if not exists notes_assigned_idx on public.notes(assigned_to);
-- Personal colour and language (English / Farsi) for each team member
alter table public.profiles add column if not exists color text;
alter table public.profiles add column if not exists language text not null default 'en';

-- Named approvers: only the people listed can approve (and edit the item while it is under approval); everyone else can view
alter table public.approvals add column if not exists approvers uuid[] not null default '{}';
create index if not exists approvals_approvers_idx on public.approvals using gin(approvers);

-- Access control per member: custom role label and the app areas they may use (null = every area allowed by their role)
alter table public.profiles add column if not exists custom_role text;
alter table public.profiles add column if not exists areas text[];

-- Signature requests: send a PDF to a client to sign online (secure link), signed copy saved back to Documents
create table if not exists public.sign_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  token_hash text not null unique,
  title text not null,
  message text,
  signer_name text not null,
  signer_email text not null,
  fields jsonb not null default '[]'::jsonb,
  status text not null default 'sent' check (status in ('sent','viewed','signed','declined','cancelled','expired')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  viewed_at timestamptz, signed_at timestamptz, declined_reason text,
  signed_document_id uuid references public.documents(id) on delete set null,
  signer_ip text, signer_agent text, original_sha256 text, signed_sha256 text,
  email_draft_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sign_requests enable row level security;
create index if not exists sign_requests_document_idx on public.sign_requests(document_id);
create index if not exists sign_requests_status_idx on public.sign_requests(status, created_at desc);
