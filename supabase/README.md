# RHC City — Supabase database

| File | When to run |
|---|---|
| `migrations/001_base_schema.sql` | **Only for a brand-new Supabase project.** Your existing V3.1 database already has this. (This is the old `schema.sql`, with its broken final block fixed.) |
| `migrations/004_rhc_v4_operating_system.sql` | **Run once on your existing V3.1 database to upgrade to V4.** Safe to re-run. |
| `migrations/005_infinity_planet_4_1.sql` | **Run after 004 to upgrade to Infinity Planet 4.1** (business identity, team-chat files and AI bot, Drive links, chat history). Safe to re-run. |

Run them in Supabase → SQL Editor → New query → paste the file → Run.

What 004 does:
- Adds V4 tables: app settings, counterparties, contacts, generated documents, approval comments, email links, email drafts, team channels.
- Adds V4 columns: document authority (APPROVED / PREFERRED / FALLBACK / HISTORICAL PRECEDENT / DRAFT), review status, full structured legal analysis, deal pipeline fields, Designer fields, calendar attendees and reminders.
- Adds full-text search functions (`search_chunks`, `search_chunks_any`) used for knowledge retrieval and citations.
- **Fixes security:** V3.1's last block failed, so row-level security was never enabled on deals, team messages, calendar events, reminders, marketing assets, legal clauses and approvals. 004 enables RLS on every table, makes viewers read-only at the database level, and fixes the recursive `profiles` policy.
- Makes the earliest user an admin if no admin exists yet.
- Creates the private `rhc-documents` storage bucket.
