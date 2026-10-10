# Infinity Planet — Business Operating System (4.3)

Private operating system for your business (set up for RHC City): projects, deals, documents, Legal AI, drafting, marketing and design, Gmail, calendar, tasks, team chat and approvals in one place. It runs on one server and is used from the Windows desktop app, Android/iPhone, or any browser.

**→ Start with [SETUP.md](SETUP.md)** for exact install, upgrade and team rollout steps.

## Run (server PC)
```powershell
npm install
npm run check-config
npm run build
npm start            # http://localhost:3300 (listens on the network for team PCs)
```
Database: run `supabase/migrations/004_rhc_v4_operating_system.sql`, then `005_infinity_planet_4_1.sql`, in the Supabase SQL Editor (existing V3.1 databases). New in 4.1: see [CHANGELOG.md](CHANGELOG.md). Connecting AI: [docs/CONNECT-AI.md](docs/CONNECT-AI.md). See [supabase/README.md](supabase/README.md).

## What works without any API key
- **Infinity AI bot:** takes tasks, reminders, meetings, notes, documents, designs and contract reviews from plain English; teaches the app
- **Legal AI rules engine:** full business-perspective contract analysis and risk rating
- **Designer:** 10 layouts, project-data fill, print-ready export after approval
- **Drafting:** 9 templates (incl. Project Status Report) using approved clauses; Word/PDF export with letterhead after approval
- **Marketing:** 11 templates filled from recorded project facts
- **Infinity Search:** full-text search with citations
- **Excel exports**, PDF/Word/Excel/photo readers
- **OCR for photos:** built-in Tesseract, automatic on upload

## What each credential unlocks
| Credential (`.env.local`) | Unlocks |
|---|---|
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | Written AI answers with citations, AI executive briefing, deeper Legal AI pass, AI drafting and copywriting, OCR for scanned PDFs |
| Ollama running (`OLLAMA_BASE_URL`, `OLLAMA_MODEL`) | Local AI for chat, Legal AI pass, drafting and copy (no cloud) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_ENCRYPTION_KEY` + admin connects in System | Gmail inbox, search, link and send; Google Calendar sync; Google Drive import and folder sync |

## Modules
| Area | Highlights |
|---|---|
| Command Centre | AI chat (4 providers + no-AI search), 10 KPIs, executive summary, deadlines, risks, pipeline, meetings, approvals, activity |
| Projects | 13-tab workspace that links every module |
| CRM / Deals | 7-stage drag-and-drop pipeline, deal pages, counterparties, contacts, weighted pipeline |
| Documents | Upload/extract/index, thumbnails, full-text search, authority classification, review requests, Drive sync, OCR, PDF sign/edit, client e-signing with certificate |
| Legal AI | Structured review, upload, Amend contract (redline + clean Word), clause library, approval workflow |
| Drafting | MOU, HoA, offer, proposal, correspondence, letter, services agreement, NDA; versioned; approval-gated export |
| Marketing / Designer | Templates, AI copy, visual layouts, approval-gated export |
| Gmail / Calendar | Inbox status (new / needs reply / replied / waiting), AI replies by role with past-email context, rewrite tools, real signatures, Cc suggestions, Bcc, attachments, saved replies, schedule send, auto-reply; sending only after approval and confirmation |
| Tasks / Notes / Team Chat | Board and list, reminders, @mentions, presence, project channels |
| Approvals | Named approvers (only they can approve or amend), comments, audit trail |
| System | Status, integrations, team, custom roles, per-member area access, password resets, signatures, display size, English/Farsi, audit log |

## Apps
- **Windows:** `desktop/` (Electron). Installer: `RHC-City-Setup-4.0.0.exe`. See [desktop/README.md](desktop/README.md).
- **Android / iPhone:** installable web app (PWA) over HTTPS.

## Security
Supabase Auth on every API call; role-based permissions enforced on the server; row-level security on every table (viewers read-only in the database too); audit log on every change; API keys and the Google refresh token stay on the server (the token is AES-256-GCM encrypted). Team devices store nothing but the server address.

## Tests
See [TESTING.md](TESTING.md): 139 API end-to-end tests, 12 AI-integration tests, 12 UI flow steps plus 37 page screenshots, 8 desktop-app tests.

## Project layout
```
app/(app)/…        pages (Command Centre, projects, crm, documents, legal, drafting, marketing, designer, gmail, calendar, tasks, team, approvals, notes, system)
app/api/…          69 API routes
lib/legal/         built-in Legal AI rules engine + AI enhancement
lib/designer.ts    Designer layout engine
lib/templates/     drafting and marketing templates + renderer
supabase/          database migrations
desktop/           Windows desktop app
tests/             end-to-end tests and fixtures
```
