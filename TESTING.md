# Infinity Planet 4.1 — Testing performed and genuine limitations

## 4.1 additions
| Suite | Result |
|---|---|
| V4 API end-to-end (`tests/api-e2e.mjs`, updated for 4.1) | **140 / 140 passed** |
| 4.1 end-to-end (`tests/v41-e2e.mjs`): business identity & logo, bot actions, chat history, team-chat files/history/bot, reminders, Excel/Word/PDF exports, Drive links, brand book, Excel reader, business details from documents, templates from documents, bulk accounts, sign-up requests | **115 / 115 passed** |
| Bot & rules unit tests (`npx tsx tests/bot-rules.test.ts`): dates, commands, Drive links, brand-book colours, business naming in Legal AI | **43 / 43 passed** |
| Bot AI path with an Ollama-protocol test double (AI-chosen actions validated and executed; unknown actions and invented people refused; fallback to built-in engine) | **7 / 7 passed** |
| Pages rendered in Chromium (desktop + phone), no errors | **passed** |

4.1 limitations:
- **Google Drive** links, previews and sync were not run against a real Google account here. The not-connected path is tested; the code uses the official Drive API with your read-only scope. Linking a whole "My Drive" imports up to 500 files per sync, so link specific folders for speed.
- **Bot dates** use Queensland time (UTC+10). The built-in engine understands common phrasings; unusual ones are better with an AI provider.
- **Letterhead** logos in Word/PDF must be PNG or JPG; SVG/WebP logos show in the app and designs only. PDFs use standard fonts (Latin characters).
- **Bot replies** in Team Chat arrive by the 4-second refresh (1.5 seconds while waiting for the bot), not over a live socket.

---

# V4.0 testing (still applies)

## Test environment
- Production build (`next build` / `next start`) on Node 22, port 3300.
- Database: **real PostgreSQL 16 + PostgREST 12** (the same components Supabase uses), plus a Supabase-compatible auth and storage gateway, driven by the official `@supabase/supabase-js`. Migrations were applied exactly as you will apply them: V3.1 base schema, then `004`.
- The upgrade path was also checked by applying the **original, unmodified V3.1 schema** and then `004` (twice, to prove it can be re-run).
- Browser tests: Playwright + Chromium at 1440×900 (desktop) and 390×844 (phone).
- Desktop app: Electron 33 driven by Playwright under a virtual display.

## Results
| Suite | Result |
|---|---|
| API end-to-end (`tests/api-e2e.mjs`) — 15 groups | **139 / 139 passed** |
| Legal AI engine regression (`npm run test:legal`) | **19 / 19 passed** |
| Email engine unit tests (`npm run test:email`) | **58 / 58 passed** |
| 4.3 features e2e (`npm run test:e2e:v43`) | **65 / 65 passed** |
| Email, briefing & team e2e (`npm run test:e2e:email`) | **44 / 44 passed** |
| AI provider integration (Ollama protocol test double) | **12 / 12 passed** |
| Interactive UI flows (create project, upload, view document, legal review, AI chat and citation, command search, task, Designer, kanban drag, sign-out) | **12 / 12 steps passed** |
| Page rendering — 26 pages desktop + 11 pages phone: no JavaScript errors, no server errors, no horizontal overflow on phones | **passed** |
| Designer PNG export (1080×1080) and approval-gated PDF/HTML export | **passed** |
| Windows desktop app (connect screen, bad-address handling, sign-in, bridge isolation, nothing secret stored, relaunch keeps the session) | **8 / 8 passed** |
| Windows installer build (`RHC-City-Setup-4.0.0.exe`, NSIS x64) | **built** |

### What the API suite covers
- **Auth & RBAC:** no token, bad token and forged actor header are all rejected. Viewers are blocked from writing; members are blocked from settings and Google; members can't archive projects.
- **Data and limits:** projects, deals (stage probabilities, DB constraint), contacts and counterparties; tasks (overdue notifications, reminders, completion); notes search.
- **Documents:**
  - Upload of TXT, DOCX and PDF with extraction and chunking; scanned PDF and image detected as needing OCR.
  - Authority rules on upload and edit; full-text search with citations; signed download.
  - **Built-in OCR on a scanned image (95% confidence, fully offline)**; a scanned PDF without an AI key returns an honest message.
- **AI chat:**
  - RHC Search mode answers with citations, attached documents are cited as `[DOC-n]`, and conversations persist.
  - An unconfigured provider returns a clear error, Ollama down returns a clear error, and viewers are blocked.
- **Legal AI:**
  - The one-sided MOU is rated Critical with the correct clause references.
  - DOCX services agreement: the RHC indemnity is found.
  - Authority handling: historical precedent is labelled as reference only, and a review requested with an AI provider but no key still saves the rules analysis and records the AI error.
  - Clause library: a new clause starts unapproved, unapproved clauses are reference only, and an approved Queensland position flags an NSW clause. Editing an approved clause voids its approval.
  - Approvals: users can't approve their own requests; rejecting without a comment is refused; changes-requested flows through.
  - The project's risk escalates automatically.
- **Drafting:**
  - 8 + 11 starter templates seeded and **not** auto-approved; facts filled from deal, project and settings; starter wording clearly marked; missing facts flagged.
  - Export is blocked until approved; editing is locked while awaiting approval; the approved file is a real `.docx`; editing after export forces re-approval.
- **Marketing / Designer:**
  - Facts-only filling; draft watermark on previews; export blocked until approved.
  - Only marketing-capable roles can approve; image upload.
- **Email:** drafts; invalid and header-injected addresses rejected; sending blocked without approval and without explicit confirmation; template reply drafting.
- **Calendar and chat:**
  - An event saves locally and the Google failure is reported honestly; reminders surface.
  - Project channels, messages, @mention notification, presence.
- **Team admin:** create an account, new user signs in with the assigned role, deactivated user is blocked, admins can't demote themselves.
- **Command Centre:** KPIs computed from records, rules summary, global search, audit trail, project workspace aggregating every module.
- **Database row-level security directly:** the anonymous key reads nothing (including deals — the V3.1 gap); viewers can read but not insert or self-promote; integrations are hidden; no recursion error on profiles.

### Defects found by testing and fixed
1. **PDF extraction:** `pdf-parse` 1.1.1 (from V3.1) failed on standard PDFs ("bad XRef entry"). Replaced with a current pdf.js extractor that keeps line structure.
2. **OCR:** it depended on a runtime CDN download that can be blocked, and a failure crashed the request. Language data is now bundled, with timeouts and error handling.
3. **V3.1 SQL:** the final block never ran, leaving 7 tables without RLS. Fixed in 004 and in the base schema.
4. **Templates:** they weren't re-seeded after a database reset, because of a stale in-memory flag.
5. **Legal AI false positives:** "exclusive of GST" was read as exclusivity, signature lines as blanks, and the plural "Variations" wasn't recognised. Fixed with regression tests.
6. **UI:** the AI chat scrolled the page on load; the top bar overflowed on phones; a wrong "awaiting approval" badge; the "Approval approved" wording.

## Genuine limitations — please read
1. **Cloud AI providers were not called live.** No OpenAI, Gemini or Claude keys were available while building.
   - The request code follows each provider's current public API (OpenAI Responses, Gemini `generateContent`, Anthropic Messages), and the whole AI pipeline was verified end-to-end against an Ollama-protocol test double.
   - **First thing to do after adding a key:** ask one question in the Command Centre and run one Legal AI review with that provider. If a model name has changed, set `OPENAI_MODEL`, `GEMINI_MODEL` or `ANTHROPIC_MODEL`.
2. **Google Gmail, Calendar and Drive were not exercised against a real Google account** (no OAuth credentials were available). The code uses Google's official `googleapis` client; the not-connected and error paths were tested. Test connect → inbox → Drive sync once credentials are in.
3. **Hosted Supabase was not used directly.** Testing used the same Postgres and PostgREST stack Supabase runs. Migration 004 uses only standard Postgres and Supabase objects, but run it on your project and check that **System → Status** shows "V4 migration: Applied".
4. **Ollama on a real machine** was not contacted (it isn't reachable from the build environment). If the status shows "model not pulled", run `ollama pull llama3.1` or set `OLLAMA_MODEL`.
5. **The Legal AI rules engine is heuristic.**
   - It is designed for English-language, Australian-style agreements.
   - It infers who owes each obligation from sentence structure, so set RHC's role (e.g. "Purchaser") on the review for best accuracy.
   - It is decision support, not legal advice: counsel review remains required (stated in every report).
6. **OCR:** images are English only. Scanned PDFs need a Gemini, Claude or OpenAI key (Ollama vision is not wired in).
7. **Notifications appear while the app is open** (desktop app, browser tab or installed web app). There is no email/SMS reminder delivery and no phone push notifications when the app is closed.
8. **Team chat** refreshes every 4 seconds (polling), not over a live socket. That's fine for a small team.
9. **One Google account** is connected for the whole organisation, not one mailbox per person.
10. **Version history:** templates and generated documents carry version numbers and every change is in the audit log, but earlier versions' full text is not kept as separate copies.
11. **The desktop installer is unsigned**, so Windows SmartScreen shows a warning until you sign it (see `desktop/README.md`).
12. **Phones need HTTPS** to install the app (Tailscale or a domain). A plain office IP works in the desktop app and browsers, not for iPhone install.
13. **Fonts:** Designer layouts load Playfair Display / Inter / Space Grotesk from Google Fonts; offline they fall back to system fonts.

## Running the tests yourself
- `npm run test:legal` — safe anywhere (no database).
- `tests/api-e2e.mjs` **creates data and expects specific test users**. Run it only against a separate test Supabase project, never your live RHC database.
