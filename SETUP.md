# Infinity Planet 4.3 — Setup guide (Windows)

Infinity Planet is the app (formerly "RHC City V4"). The business using it — RHC City by default — is set in **System → Business** (name, short name, logo, colours, letterhead).

## 0b. Updating to 4.3 (5 minutes)

1. **Database (once):** open Supabase → **SQL Editor** → **New query**. Paste the whole of `supabase/migrations/006_email_options_4_3.sql` and click **Run**. You should see "Success. No rows returned".
2. **App:** stop the server (**Ctrl + C**), then run:
   ```
   cd "C:\Users\falah\RHC Software"
   npm install
   npm run build
   npm start
   ```
3. In the browser, press **Ctrl + F5**. System → Status should show "Database migrations (004, 005, 006): Applied".
4. **Google (once):** in System → Integrations, click **Reconnect Google** and allow the new permission. Auto-reply and reading your Gmail signature need it.
5. **Each person:** go to System → My profile and set:
   - email signature mode (Gmail signature is the default);
   - My signatures (draw your signature, initials, stamp);
   - colour and language (English or فارسی);
   - display size.
6. **Admin:**
   - System → Team & roles → **Edit** → Access to tick the areas each member may open;
   - **Manage roles…** to add your own roles;
   - My profile → My signatures → Company stamp.
7. **Client e-signing from outside the office** needs the server reachable on the internet. Set `RHC_PUBLIC_URL` in `.env.local` to that address (for example `https://app.rhccity.com.au`) so signing links work for clients.

## 0a. Updating 4.1 → 4.2 (2 minutes, no database change)

Every update needs a rebuild before the dashboard shows the changes. In the command window where the app runs:

1. Press **Ctrl + C** to stop the server.
2. Run:
   ```
   cd "C:\Users\falah\RHC Software"
   npm install
   npm run build
   npm start
   ```
3. In the browser, press **Ctrl + F5**.

Then set up the new email features once:
- **System → Business → Professional email look:** check the preview. Use a PNG or JPG logo, because email apps don't show SVG.
- **System → My profile → My email signature:** each person adds their title, phone and mobile, and chooses the role they usually reply as.
- **Gmail:** open an email, then click **AI reply**.
- **Drive:** linked folders re-sync every 30 minutes on their own. Infinity AI also searches Drive directly when it can't find something. To check Drive is linked, open **Documents → Google Drive links**, and look at **System → Status** to see how many files are indexed.

## 0. Upgrading an existing 4.0 install to 4.1 (5 minutes)

1. **Database:** in Supabase → **SQL Editor**, run `supabase/migrations/005_infinity_planet_4_1.sql` (after 004). It finishes with "Success. No rows returned" and is safe to run twice.
2. **App:** in the app folder, stop the server (**Ctrl + C**), then run:
   ```
   npm install
   npm run build
   npm start
   ```
3. **System → Status** should show "Database migrations (004 + 005): Applied".
4. **System → Business:** check the business name, upload your logo (PNG or JPG works everywhere), set colours (or use **From brand book** / **From logo**) and the footer line.

What's new in 4.1:
- **Infinity AI bot** in Team Chat (mention `@ai`, or use the "Ask Infinity AI" channel) and on the **AI Assistant** page. It can create tasks, reminders, meetings, notes, MOUs and other documents, project status reports and designs, review attached contracts and teach people how to use the app. It works without an AI key.
- **Chat history:** AI conversations are saved, searchable, renameable and pinnable. Team chat keeps every message; use "Load earlier messages" and channel search.
- **Files in Team Chat:** attach photos, PDFs and any file (up to 10 files, 50 MB each), or drag and drop. Photos preview inline.
- **Photo, PDF and Excel reader:** photos are read automatically with the built-in OCR, and Excel files are read and searchable.
- **Google Drive:** preview and open files in the app, and add Drive links (folders or files, as many as you like) that sync into knowledge so the AI can read them. A link can be marked **Brand book**.
- **Brand book:** set a document's category to "Brand book". The AI, marketing writer and Designer follow it, and System → Business can read its colours and fonts.
- **Letterhead:** Word and PDF exports get your logo, name, colours, footer details and page numbers.
- **Exports:** Excel from Tasks, Projects, CRM and Legal. Word **and PDF** for approved documents.
- **Reminders:** a "New reminder" option in the bell and on the Calendar, for me, a person or everyone. Editing a task reminder replaces it.
- **Business details from your files:** **System → Business → Fill from your documents** reads your documents and synced Google Drive files, then proposes:
  - your legal name, ABN and ACN (checksum-verified), address, phone, email and website;
  - your logo (any image with "logo" in its file name);
  - brand-book colours.

  You choose, then apply. The bot can do this too: "fill in our business details from our documents".
- **Templates from your documents:** go to **Drafting → Templates**.
  - **From a document** turns, for example, one of your MOUs from Drive into a template with placeholders.
  - **Update from documents** makes an existing template follow your own wording.

  Both save a draft that needs approval. The bot can do this too: "update the MOU template from our RHC documents".
- **Team accounts:**
  - **System → Team & roles → Add several** creates many accounts at once, with one-time temporary passwords.
  - **Request access** on the sign-in page lets staff with company emails ask for an account, and an admin approves each one. To turn it on, set `SIGNUP_DOMAINS=rhccity.com.au` in `.env.local`, or use System → Team & roles → Sign-up requests.
  - To make yourself admin from the terminal, run `node scripts/create-admin.mjs you@company.com "Password-123456" "Your Name"`.
- **Connecting AI:** see **docs/CONNECT-AI.md**.

---

# Full setup (first install)

This guide upgrades your working V3.1 install at `C:\Users\falah\OneDrive\Desktop\RHC` to V4 and then gets the whole team on it, using the Windows desktop app and Android/iPhone.

**How it fits together**

```
 Server PC (yours)                         Team members
 ┌────────────────────────────┐            ┌──────────────────────────────┐
 │ RHC City server :3300      │◄──────────►│ RHC City desktop app (Windows)│
 │  • holds ALL secrets       │            │ Android / iPhone (web app)   │
 │  • Legal AI, Designer,     │            │ any browser                  │
 │    Search (built in)       │            └──────────────────────────────┘
 │  • talks to Supabase,      │     no keys or passwords are stored on team devices
 │    Google, AI providers,   │
 │    Ollama :11434           │
 └────────────────────────────┘
```

---

## 1. Upgrade the server (about 10 minutes)

### 1.1 Back up and unpack
1. Rename your current folder `C:\Users\falah\OneDrive\Desktop\RHC` to `RHC-V3.1-backup`.
2. Unzip **RHC-City-V4.zip** to `C:\Users\falah\OneDrive\Desktop\RHC`.
   > Tip: OneDrive slows down `node_modules` (tens of thousands of files). If you can, use `C:\RHC` instead and use that path wherever this guide says `...\RHC`.
3. Copy your existing `.env.local` from `RHC-V3.1-backup` into the new `RHC` folder.
4. Open `.env.local` in Notepad and compare it with `.env.example`. Add these lines (keep your existing Supabase values):

```
RHC_PUBLIC_URL=http://localhost:3300
GOOGLE_REDIRECT_URI=http://localhost:3300/api/google/callback
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
GOOGLE_ENCRYPTION_KEY=<paste 40+ random characters>
```

To generate a random key, run this in PowerShell:
`-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | % {[char]$_})`

### 1.2 Upgrade the database (Supabase)
1. Supabase dashboard → your project → **SQL Editor** → **New query**.
2. Open `supabase\migrations\004_rhc_v4_operating_system.sql`, paste the whole file, and click **Run**. It should finish with "Success. No rows returned". Then do the same with `005_infinity_planet_4_1.sql`.
   - It is safe to run more than once.
   - **Do not** run `001_base_schema.sql`, because your database already has it. That file is only for a brand-new Supabase project.

### 1.3 Install, build and start
Open **PowerShell** in the RHC folder (Shift + right-click the folder → *Open in Terminal*):

```powershell
npm install
npm run check-config
npm run build
npm start
```

Open <http://localhost:3300> and sign in with your existing account.

- **Admin access:** the migration makes the earliest account an admin if there was no admin yet. To make (or create) a specific admin:
  `node scripts/create-admin.mjs falah@yourdomain.com "A-Strong-Password" "Falah"`
- **Port:** RHC City now runs on port **3300**, matching your setup. Open WebUI stays on 3000.
- **Day to day:** double-click `scripts\start-rhc.bat` to start the server. To start it automatically with Windows, press Win+R, type `shell:startup`, and put a shortcut to `start-rhc.bat` in that folder.
- **After future code updates:** run `scripts\update-rhc.bat`.

### 1.4 RHC settings (2 minutes)
In **System → Settings**, enter:
- RHC's legal entity name, ABN, address, default signatory, contact email and phone.
- The names RHC appears under in agreements, e.g. `RHC City, RHC`.
- Home jurisdiction (default Queensland).
- Optionally, edit the RHC AI system instructions.

---

## 2. Built-in features: no keys needed

These work immediately:

| Feature | Engine |
|---|---|
| **Legal AI** | RHC rules engine: clause segmentation, about 40 legal topics, 30+ RHC-perspective risk rules, missing protections, conditions precedent, due-diligence checklist, negotiation points, recommended wording, solicitor questions, 0–100 risk score, clause-library comparison with APPROVED/PREFERRED/FALLBACK/HISTORICAL PRECEDENT/DRAFT authority |
| **Designer** | 10 layouts (A4 flyer, brochure, fact sheet, investor one-pager, A3 EOI poster, site hoarding, social post, story, LinkedIn banner, email header), 5 themes, filled from project data, print-ready PDF export after approval |
| **Drafting** | 8 RHC starter templates (MOU, Heads of Agreement, Letter of Offer, Commercial Proposal, Project Correspondence, Business Letter, Services Agreement, Mutual NDA) that insert your **approved** clause wording; Word export after approval |
| **Marketing** | 11 templates filled only with recorded project facts |
| **RHC Search** | Full-text search with citations in the AI chat ("RHC Search (no AI)") |
| **OCR for images** | Built-in Tesseract (English data ships with the app) |

When a key is added, the AI goes deeper on top of these engines. It never replaces them.

---

## 3. Optional: AI providers
Add any of these to `.env.local`, then restart the server (close the window, run `start-rhc.bat`):

```
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
```

Model names can be changed with `OPENAI_MODEL`, `GEMINI_MODEL` and `ANTHROPIC_MODEL`.

**Ollama (local AI on the server PC):**
- RHC City talks to Ollama's API on `http://localhost:11434` by default. Check that `ollama list` shows `llama3.1`, or set `OLLAMA_MODEL` to a model you have pulled.
- To go through Open WebUI instead, set `OLLAMA_BASE_URL=http://localhost:3000/ollama` and `OLLAMA_API_KEY=<Open WebUI API key>`.

**Scanned PDFs** need a Gemini, Claude or OpenAI key for OCR (they read the PDF directly). Scanned *images* don't need a key.

**System → Status** shows exactly what is connected.

---

## 4. Optional: Google Workspace (Gmail, Calendar, Drive)

One Google account is connected for the whole team, typically RHC's shared mailbox.

1. Go to <https://console.cloud.google.com> and create a project called "RHC City".
2. **APIs & Services → Library:** enable **Gmail API**, **Google Calendar API** and **Google Drive API**.
3. **OAuth consent screen:**
   - **Internal** if you use Google Workspace, otherwise **External**.
   - For External, add the Google account as a *Test user*. In testing mode Google expires access every 7 days; publish the app to avoid this.
4. **Credentials → Create credentials → OAuth client ID → Web application:**
   - Authorized redirect URI: `http://localhost:3300/api/google/callback`
   - If you later host RHC on a domain, also add `https://rhc.yourdomain.com/api/google/callback` and set `GOOGLE_REDIRECT_URI` and `RHC_PUBLIC_URL` to match.
5. Put the Client ID and Secret in `.env.local` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and restart.
6. **On the server PC**, open <http://localhost:3300/system?tab=integrations> → **Connect Google Workspace** → choose the RHC Google account → Allow.
   - Google only accepts `localhost` or a real domain as the return address, so do this step on the server PC, not from another computer's IP address.
7. **Documents → Google Drive** → **Add link**: paste a Drive folder or file link (or browse to a folder and **Sync**). Add as many links as you like; **Sync all** refreshes them.
   - Every supported file is imported, extracted and indexed for search and AI.
   - Google Docs are exported as Word, Sheets as CSV, Slides as PDF.
   - Re-running the sync imports only new or changed files.
   - Drive access is read-only, so nothing in Drive is modified.

---

## 5. Getting the team on RHC City

### 5.1 Create accounts
**System → Team & roles → Add member.** Give each person a role:

| Role | Can do |
|---|---|
| Admin / Director | Everything, including team, settings, Google and all approvals |
| Manager | All work; approves general, email and document items |
| Legal | Approves legal reviews, contracts and clause positions; classifies documents as APPROVED, PREFERRED or FALLBACK |
| Marketing | Approves marketing, designs and marketing templates |
| Project / Member | Create and edit work; request approvals |
| Viewer | Read-only (enforced on the server and in the database) |

Share the temporary password securely. Each person can change it in **System → My profile**.

### 5.2 Make the server reachable

**Same office or network:**
1. The server listens on the whole network. Find the server PC's address with `ipconfig` (IPv4 address, e.g. `192.168.1.20`).
2. Allow the port through Windows Firewall. Run this once in an **Administrator** PowerShell:
   `netsh advfirewall firewall add rule name="Infinity Planet 3300" dir=in action=allow protocol=TCP localport=3300 profile=private`
3. Team members use `http://192.168.1.20:3300`.
4. The server PC must be on and running `start-rhc.bat`.

**Team members outside the office, and phones (recommended: Tailscale, free for small teams):**
1. Install Tailscale on the server PC and on each team device, and sign in with the same Tailscale account or team.
2. On the server PC run: `tailscale serve --bg 3300`.
   This gives you `https://<pc-name>.<tailnet>.ts.net`, a private HTTPS address that only your team's devices can open.
3. Use that HTTPS address in the desktop app and on phones. Phones need HTTPS to install the app.

**Alternative:** host the server on a cloud VM or a Node host with your own domain and HTTPS. A `Dockerfile` is included. Ollama on your PC won't be reachable from a cloud host; use a cloud AI key there or set `OLLAMA_ENABLED=false`.

### 5.3 Windows desktop app (team PCs)
1. Run **`Infinity-Planet-Setup-4.1.0.exe`** on each PC (you can choose the install folder; shortcuts are created).
   - The installer is not code-signed, so Windows SmartScreen may show "Windows protected your PC". Click **More info → Run anyway**.
   - To remove the warning, sign it with a code-signing certificate (see `desktop/README.md`).
2. On first launch, enter the server address from 5.2, then sign in.
3. The app shows desktop notifications for reminders, meetings, approvals and @mentions, keeps a tray icon, and remembers the session. Only the server address is stored on the PC.

To rebuild the installer yourself, on any Windows PC with Node.js 22:
```powershell
cd desktop
npm install
npm run dist:win     # → desktop\dist\Infinity-Planet-Setup-4.1.0.exe
```

### 5.4 Android and iPhone
- **Android (Chrome):** open the server's **HTTPS** address → menu ⋮ → **Install app** (or *Add to Home screen*).
- **iPhone / iPad (Safari):** open the HTTPS address → **Share** → **Add to Home Screen**.

The phone layout has bottom navigation for Home, Projects, Tasks, Approvals and More.

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| Red banner "The database update has not been applied" | Run `004_rhc_v4_operating_system.sql`, then `005_infinity_planet_4_1.sql`, in the Supabase SQL Editor |
| "Supabase is not configured" in the browser | `NEXT_PUBLIC_SUPABASE_*` were missing when you ran `npm run build`. Fix `.env.local`, then `npm run build` again |
| Provider shows "not connected" | Key missing in `.env.local`, or the server wasn't restarted |
| Ollama "not reachable" | Start Ollama; check `http://localhost:11434/api/tags` in a browser; check `OLLAMA_BASE_URL` |
| Ollama "model not found" | `ollama pull llama3.1`, or set `OLLAMA_MODEL` to an installed model |
| Google: "did not return a refresh token" | Remove "Infinity Planet" (or "RHC City") at <https://myaccount.google.com/permissions>, then connect again |
| Google stops working after 7 days | The OAuth app is in *Testing* (External). Publish it, or use an Internal Workspace app |
| Team PC can't connect | Check the server is running, the firewall rule from 5.2, the same network or Tailscale, and use the correct IP |
| Phone can't install the app | It needs HTTPS (Tailscale serve or a domain). `http://192.168…` won't install on iPhone |
| Scanned PDF shows "needs OCR" | Open it → **Run OCR** (needs a Gemini, Claude or OpenAI key). Images work without a key |

`npm run check-config` validates `.env.local`. **System → Status** shows live status. `GET /api/system/health` is a public health check.
