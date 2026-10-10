# Infinity Planet — changelog

## 4.13.0 — Email gets the whole window

- **One slim toolbar in Gmail:** Inbox · Drafts · Auto-reply (with icons), your address, Mine / Shared and Compose all on one line. The big "Connect your own email" box only shows if your email isn't connected at all.
- **Filters are small pills on one line** instead of two rows of big tiles; filters with nothing in them are hidden.
- **The email list shrinks to icons again:** drag the divider far to the left (or click it) and the list becomes a slim strip with one round letter per email (unread ones are ringed, and hovering shows who it's from and the subject). Drag it back out or click ›› to open the list again.
- **Wide reading button** (the ⤢ beside the email's star): folds the left menu and the email list to icons in one click so the email fills the window; click again to bring them back.
- **Easier on the eyes:** emails are shown in slightly bigger, softer text with more line spacing and a comfortable line length; less padding around the header and buttons.
- **"?" help instead of long sentences:** explanations such as "Sign in with your own address…" are now behind a small **?** — hover for a short tip, click to read the full text in a larger card.

## 4.12.3 — No more page code in error boxes; Gmail key check

- When the online server is waking up or restarting, a box full of web-page code (<!DOCTYPE html>…) could appear instead of the page's data (seen in Legal AI → Company records). The app now waits a moment and asks again by itself, and if it still can't, says "The server was just waking up — please try again in a few seconds."
- Gmail on the online server: the key that protects the saved Gmail connection is read more forgivingly (stray spaces or line breaks from pasting are ignored). If the PC and the online server still have different keys, the message now says so plainly.

## 4.12.2 — Back closes pop-up windows everywhere

- **Every pop-up window is now a step of its own** — Pay rates, New task / note / event, compose email, Add money in / expense, templates, side panels and so on, in every section. **Back (the mouse's back button, the browser's, the top bar's ←, Alt+←) closes the window and stays on the page**; the next Back goes to the previous page. Closing with ✕, Esc or Save leaves no extra step behind. "Are you sure?" questions are not steps.
- A "Delete?" question opened from a side panel (e.g. an invoice) now appears in front of the panel instead of behind it.

## 4.12.1 — Mouse back button, one-screen Finance overview

- **The mouse's back button (and the browser's own Back) now close an open presentation and stay in Presentations.** Browsers ignore any step a page adds without a click; a new presentation was added as a step after it saved (no click at that moment), so the mouse's back skipped it and jumped to the section before. The step is now added the moment you click a template or send your first message, and nothing in the app adds a step without a click.
- **Finance overview fits on one screen:** slimmer money in / out / net / bills / payroll boxes, a shorter month-by-month chart with Bills to pay beside it, and the category lists side by side.
- Suggestion chips in the presentation conversation wrap onto two lines instead of being cut off.

## 4.12.0 — Finance and Payroll

**Database update 009 (Finance & payroll) is needed — run supabase/migrations/009_finance_payroll_4_12.sql once in Supabase → SQL Editor.**

- **New Finance section** (left menu), for admins and directors only (others only if an admin ticks "Finance & payroll" for them in Team & roles):
  - **Overview** — money in, money out, net, bills to pay (and overdue), payroll for the financial year (1 July – 30 June), month by month, and where money came from / went.
  - **Money in** — investor funds (capital, loans) and other income, with a running total per investor. "Expected" for money promised but not yet in the bank.
  - **Expenses** — everything paid out, by category (consultancy, legal, accounting, engineering, architecture & design, planning, marketing, software, rent, utilities, travel, insurance, government fees, wages, super, PAYG…).
  - **Invoices** — bills received from consultants and suppliers. **Upload** a PDF, Word file or photo, or **Find invoices in email**: the app looks through your mailbox for emails with an invoice, bill or receipt attached, reads the supplier, ABN, invoice number, dates, GST and total, sorts it into a category and files it as a bill to check. Open it, compare with the invoice shown beside the fields, then **Confirm & save**; **Mark paid** when paid. The same attachment is never imported twice. Invoice files are kept privately, separate from the shared document library.
  - **Payroll** — set each person's pay in **Pay rates**: employee (tax withheld + super) or contractor (ABN, optional GST), hourly rate or annual salary, tax-free threshold and other ATO scales, super rate (12%) and fund. Each week the hours come from Activity & hours (the signed-off hours, otherwise app use + logged time) and can be changed. The app works out gross pay, **PAYG withholding (ATO Schedule 1 weekly formulas for payments from 1 July 2026)**, super and net pay; **Finalise** locks the run and records wages, PAYG (owed to the ATO) and super as bills to pay; **Mark as paid** when paid. Printable payslips for each person.
- Not included yet: STP (Single Touch Payroll) lodgement with the ATO, HELP/study-loan repayments, leave balances and overtime rates — use your payroll/STP service for lodging.
- **Online:** the app now also runs at https://infinity-planet.onrender.com (free plan: it sleeps when unused, so the first visit can take about a minute).

## 4.10.2 — Back closes an open presentation, Send never under the assistant button

- **An open presentation is always one step:** a presentation that appears from a template or from the conversation is saved as a draft straight away and opened in the address, so **Back closes it and you stay in Presentations**; the next Back goes to the section you were in before (e.g. Marketing). Before, only presentations opened from "Saved" did this.
- **Team Chat, Presentations, Writer, Gmail:** the bottom-right corner is kept clear for the floating assistant button, so Send, Saved, PDF and similar buttons are never behind it.

## 4.10.1 — Back and forward, slimmer headers, tab buttons

- **← → buttons in the top bar.** Back goes to the previous step; Forward goes on again. The tooltip says where it will take you (e.g. "Back — Documents › Board meetings"). The browser's own Back/Forward (and Alt+← / Alt+→) do the same.
- **A window inside a page is a step of its own** — an open presentation, document, approval, email, task, note or saved asset is in the address (…?open=…). Back first closes the window and stays in that section; it no longer jumps to the section you were in before. Closing with ✕ or Esc does the same, and a window opened from another section (e.g. a board record's "In Documents") goes back there.
- **The AI conversation folds away** in Presentations, Writer and Infinity AI, like the email list in Gmail: click the arrow on the divider to hide or show it. The app remembers your choice.
- **Page tabs are buttons** (Overview · Deals · Documents … in a project, deal or review; Inbox · Drafts in Gmail; Write · Saved in Marketing; Company records) and they stay just under the top bar while the page scrolls.
- **Slimmer page headers and toolbars** — the page name is one short line, so the work starts higher on the screen.
- The highlight-and-ask bubble (Explain · Risky for us? · Farsi · Ask…) closes when you click elsewhere or move to another page.

## 4.10.0 — Infinity Planet template collection, email newsletter, Weekly Board Meeting Record

- **18 new presentation templates — "Infinity Planet collection"**, drawn to our Brand Book (Jan 2025): Navy and/or Stone with one accent colour from the brand palette, cream / taupe / white backgrounds, Gabarito headings and DM Sans text, the official logos (with descriptor, and with the "Endless Possibilities" tagline) and the Endless Possibilities Ribbon in Aqua. Themes: The Project · The Land & Location · Masterplan & Concepts · Theme Parks & Attractions · City Hall, Events & Weddings · Hotels & Accommodation · Glamping, Beach & Waterfall · Global Cultural Mall · International Food Court · Garden Avenues & Paradise Gardens · Technology Park & Innovation · Sustainability & ESG · Investment Opportunity · Financials & Returns · Real Estate & Property · International Investors · Why Queensland & Moreton Bay · Newsletter & News.
- **Each template starts with a ready outline** (7–10 slides) built from our own material — the Infinity Planet Presentation 2025, Investment Plan 2025, Brand Book and infinityplanet.com.au — with sources in each slide's notes and [●] where something needs filling in or confirming. Covers use "Australia's First Integrated Entertainment City — Where Imagination Becomes an Experience"; every closing slide says "We bring the world to Australia, and Australia to the world."
- **8 new official renders in the photo library** (from the Infinity Planet Design pack): dome at night, city aerial, cultural avenue, highway panorama, beach & waterfall resort, heritage boulevard, the labelled masterplan and the "welcome" media wall.
- **Email newsletter** (Designer → Email newsletter): the infinityplanet.com.au look — cream page, white rounded cards with the round arrow button, lime highlights, black call-to-action band — with news stories, key figures, our photos, and HTML export for your email program (pictures embedded).
- **Weekly Board Meeting Record** (Documents → Board meetings, or Create → Board meeting record): the same setup as our board minutes — meeting information, agenda (any length, runs over pages), decisions, action items, approval of previous minutes, other notes — with a blank signature block for each member. **Send for signatures** emails each member; their name and date are printed only when they sign, and all signatures end up on one copy.
- PowerPoint files use the brand fonts Gabarito and DM Sans. They are included: in the app folder open **public\brand\fonts** and double-click **Install brand fonts** once on each PC (otherwise PowerPoint shows a standard font).
## 4.9.0 — Edit slides directly, delete legal reviews, tidier pages

- **Presentations — type straight on the slide:** double-click any title, point, column, number or quote on the slide and edit it right there (Enter or click away to keep it, Esc to cancel). Double-click an empty part of the slide to open the full slide editor. The conversation stays open beside the editor, so you can ask Infinity AI for help while you edit — "this slide" means the slide you are on, and quick buttons offer "Rewrite this slide", "Suggest a better title"…
- **Legal AI:** each review in the list has a delete button (admins, directors, legal, and the person who ran the review). In an open review the button is labelled Delete. Approvals still waiting on a deleted review are cancelled.
- **Switching accounts never signs you out:** "Add another account" now keeps the first account signed in, so "Switch to …" works without a password.
- **Campaigns:** the big heading is gone — just a slim Write / Saved switch.
- **Documents:** the row buttons are icons and fit the window (Send for review is the shield icon).

## 4.8.1 — Account menu at the top right, address chips

- **Account menu** (switch account, add another account, profile, settings, sign out) now opens at the top right under your avatar. Clicking your name at the bottom of the left menu opens it there too.
- **To / Cc / Bcc work like Gmail and Yahoo:** each address is its own chip showing the person's name, with an × to remove it. Type an address and press Enter, comma or Tab to add it; Backspace removes the last one; pasting a list splits it into chips. Addresses that aren't valid show in red.

## 4.8.0 — Everyone has their own mailbox, switch between your accounts

- **Your own email:** each person connects their own work address once (Gmail page, or My profile → My email → **Connect my Google account**). Their inbox, sending, auto-reply and Gmail signature then use **their own mailbox**: Ramin sends from ramin@…, Alex from alex@…, and nobody can see anyone else's inbox or drafts. Members must sign in with their own address.
- The company Google account (Settings → Google) is still used for Google Drive and Calendar. Admins and directors can switch the Gmail page between **Mine** and the **Shared** mailbox.
- **No approval for email at all:** emails can't be sent for approval any more, old email approvals no longer show in Approvals, and the daily briefing counts your unsent drafts instead. Only the person who wrote an email can change or send it.
- **Several accounts on one computer:** your name at the bottom of the menu → **Add another account** keeps you signed in and lets you sign in to a second account. Then **Switch to …** moves between them with one click — no password. The sign-in page also offers "Continue as …" for accounts already signed in on this computer. Signing out signs out only the current account.

## 4.7.3 — Email without approval

- **Email no longer needs approval.** Each person sends their own email straight from Gmail → Drafts, or with the new **Send…** button in the compose window. Send still asks you to confirm, and Schedule works the same.
- **Cc reminder:** the Send window reminds you when nobody is copied and shows the team as one-click Cc buttons. Copying people is your choice; you can send without.
- The "Outgoing emails require approval" setting is gone. Emails already waiting for approval can now just be sent.

## 4.7.2 — Photos in presentations

- **Our photo library:** 72 photos from our own decks (Infinity Planet presentation and Investment Plan) — aerials, masterplan, hotel, glamping, theme park, culture, food court, transport, sustainability, events — each labelled with what it shows.
- **The AI adds photos:** when it writes or changes a deck, it puts a fitting photo beside the text on suitable slides (about one in three). The built-in writer does the same, and understands "add a photo of the hotel to slide 3", "remove the photo from slide 3" and "add photos".
- **Edit this slide → Photo:** pick another library photo (search by subject), upload your own (cut to the frame, never stretched) or choose No photo. Photos appear in the PowerPoint and PDF too.

## 4.7.1 — Main admin, mail, presentation templates, arranging slides, new look everywhere

- **Main admin:** your account (set in the app folder's settings file) is always an active admin and its name is fixed if it was showing as an email. Other admins can't demote, deactivate, remove or reset it. **Settings → Team & access → Admins** makes anyone a second admin (or takes it away).
- **Mail:** older emails load by themselves as you scroll (no "Older messages" button, no jump to the top). Click anywhere on the divider to hide/show the email list (drag still resizes). The filters are now count tiles in the same colours as the email badges. Signatures in plain-text emails show smaller and grey, without "[image: …]" placeholders.
- **New look on every page:** the Settings style (teal section label + bold title, cleaner cards, tabs, tables) now on all pages. Settings tiles are compact and stay 7 per row.
- **Left menu:** the whole right edge of the menu is a button — hover to light it up, click to fold/open, drag to resize.
- **Presentations:** two templates from our own decks — **Infinity Planet** (cyan cover, navy section slides with the swoosh, wavy photo strip, navy number slides, photo closing slide with our logos; now the default) and **Investor Plan** (navy bands, red headings). **Photos & drawing**: add photos, lines, arrows, boxes, circles and text on any slide; drag, resize, bring forward / send back (also behind the template's text). They appear in the PowerPoint and PDF too and stay when the AI changes the deck. Window bar on the slide area: minimise, maximise, close.
- Shorter example text in the message boxes.

## 4.7.0 — Activity & hours, time checks, who does what, document dates

**Database update needed:** in Supabase → SQL Editor run `supabase/migrations/007_activity_hours_4_7.sql` once (safe to run again).

- **Activity & hours** (new menu item): each person's hours for the week — **app time** (only minutes when the app is in front and they typed, clicked or scrolled in the last 2 minutes, not just signed in) plus **real-world time** (meetings, site visits, agenda items, tasks). Shows who has been most active, a Monday→Sunday chart, where their app time went (Legal, Gmail, Tasks…), and their time logs. Use ‹ › to look at earlier weeks.
- **How long did it take?** When someone completes a task, or a meeting they booked or attend has ended, the app asks how long it took (including travel for in-person meetings). It has its own estimate (built-in rules — the booked length plus travel, or the usual time for that kind of work; "2 hours" written in the task is used). The estimate is shown only after they answer.
  - Within reason → counted straight away.
  - Much longer → the app asks why. A clear reason (traffic, waiting for the client, extra work, a problem… English or Farsi) → counted. A vague reason gets one follow-up question.
  - Still not clear → recorded and sent to the **time approver**, who can approve, adjust the minutes, or reject (with a reason). It counts only after approval. The member is told who will approve it.
  - "I didn't spend time on this" stops the question; "Later" asks again in 3 hours. **Log time** (Activity page or Create menu) records anything else.
- **Who approves hours** (Activity → Who approves hours): each member's manager from the company structure (default), the HR person, or one chosen person. Approvers get a bell notification and a count on the menu, and can **sign off each member's week**. Admins and directors can always approve; nobody approves their own time.
- **Team access — more control:**
  - Every part of the app can be **Full access, View only or No access** per person or per role (view only = can open and read, can't change anything). New areas: Research, Company records, Send for signature, Activity & hours.
  - **Duties — who does what:** Design & graphics, Contracts & legal, Agenda & meetings, Marketing, Deals & clients, Project management, Site & operations, Document control, Email & correspondence, Presentations & research, Finance, HR & weekly hours, IT — plus your own. Ticking a duty opens the parts of the app it needs. A **Who does what** card lists each duty and its people, and Infinity AI uses it when assigning work.
  - **Can also approve:** give a person approval rights beyond their role (e.g. a member who approves contracts, or weekly hours).
  - More quick-pick roles: Designer, Contracts Officer, Executive Assistant, Project Manager, Marketing Coordinator, HR Officer, Researcher. Roles can carry duties and approval rights.
- **Document date:** Drafting, the Writer and Marketing now have a **Date** (today by default, change it before writing). It is printed under the title / on the letter and used wherever the document is dated; "[● date]" gaps and "Dated: [●]" lines are filled, and it is added automatically if the AI left it out. Changing the date in the Writer updates the draft too. Dates now always use Brisbane time.

## 4.6.0 — New look, company records, approvals by structure, presentation templates

- **New look (Slate & Teal):** slate menu with teal highlights, Plus Jakarta Sans, softer rounded cards, Settings as tiles, a new profile page (colour band, colour swatches, password tucked away). Admins can still pick other themes in Settings → Theme & colours.
- **Company records (Legal AI → Company records):** the Constitution, Unitholders' Agreement, RAS trust deed, Securityholders Agreement (draft), ASIC extract, founder's structure letter and the July 2026 unit transfer proposal are filed as approved records (scanned ones read by OCR), with a plain-English profile: who's who, ownership, signing rules, decisions needing Board/unitholder approval, and open points. Infinity AI and Legal AI follow them. Admins click **Load company records** once.
- **Approvals follow the company structure:** Settings → Team & access → Company structure (the RHC organisation chart). A request to someone higher goes through the requester's managers first, one level at a time (or copies them — your choice). Requests to another department copy the requester's manager.
- **Ask about what's on screen:** highlight any words (a contract term, a sentence in an email) → Explain / Risky for us? / Farsi / Ask… Infinity AI knows the contract, document, email, project or deal you have open. Built-in plain-English glossary of 45+ contract and property terms works without an AI key.
- **Presentations:** 14 templates with previews (Our colours, Executive Navy, Consulting Blue, Property Prospectus, Architect, Investor Pitch, Modern Teal, Minimal White, Editorial Mono, Bold Charcoal, Midnight Gold, Forest, Coral & Violet, Terracotta). Import your own PowerPoint template (.pptx/.potx: colours, fonts, cover picture). **Learn from our Google Drive**: reads your decks, learns your usual section order and makes a house template. The slides, PowerPoint and PDF now match exactly. Say "use the Executive Navy template" to switch.
- **Dome watermark:** the Infinity Planet dome, faint, on cover and section slides (switch in the Presentations toolbar).
- **Stamps:** stamp maker in My signatures (round seal or rectangle, inked look, dome emblem); admins save the company template so everyone makes theirs with their own name and title. The GM's red round seal is set up automatically.
- **Resizable split screens:** drag the handle between panes (Gmail, Presentations, Writer, Assistant, Designer, Team Chat, Legal review, projects, deals, drafts). Double-click resets. Sizes are remembered.
- PowerPoint files uploaded to Documents are now read (slide text), and Google Slides sync as PowerPoint.
- Local AI (Ollama) gets a larger context window (16k) so it can read longer contracts and instructions.

## 4.5.4 — Infinity AI follows your rules

- **Give Infinity AI a rule once and it follows it every time**, in chat, emails, documents and reminders. Just say it in chat: "from now on, remind me 15 minutes before meetings", "always write my emails as project manager", "never use exclamation marks", "remember Harbourline prefers calls after 2pm".
- **Rules for the whole team** (admins, directors and managers): "rule for the team: always cc Ramin on Harbourline emails".
- **Shortcuts:** "whenever I say morning, show what needs my attention today", then just type "morning".
- **"show my rules"** lists them and **"forget rule 2"** removes one. There's also a new **Settings → AI rules** page to add, edit, remove, or switch a rule between "just me" and "whole team".
- What you ask for this time beats a rule (e.g. "…for 90 minutes" beats "meetings should be 30 minutes"). Your own rule beats a team rule.
- Without an AI key, the built-in engine still follows meeting length and reminders, task reminders and priority, who your emails are written as, and your shortcuts. With an AI key, every rule is followed.

## 4.5.3 — Left menu folds and resizes

- **Fold the left menu to icons** with the button beside the business name (or **Ctrl+B**). Hover over an icon to see its name. Counts (overdue, approvals) stay on the icons.
- **Drag the menu's right edge** to make it wider or narrower. Drag it all the way left to fold it. Double-click the edge to reset.
- The app remembers your choice on each computer. Phones keep the slide-out menu.

## 4.5.2 — Emails look like Gmail and Outlook

- **Emails show as the sender designed them** — pictures, logos, signatures, buttons and links — like Gmail and Outlook. Pictures inside emails (signature logos) now appear. "Simple view" still gives clean text.
- **Attachments** are shown as cards at the bottom of the email; click one to download it.
- **Plain-text emails** no longer break sentences across lines ("Manage API / keys").
- **All mail filters are visible** (Needs reply, New, Drafted, Waiting, Replied, FYI, Starred) — they wrap instead of hiding off the edge.
- **Presentations**: Previous / Next buttons, click the left or right side of a slide (or press ← →) to move between slides; "Edit this slide" opens the editor in the left column so the slide stays big; **Full screen** keeps every button (editing, downloads, Finalise) — press Esc to leave.
- **Write settings are one slim row** (Start from, Project, To, From, Layout, Length).
- **Write screen is simpler**: one short line to start, and example buttons that fill the box with a sentence to complete (the [blanks] are selected so you just type over them).

## 4.5.1 — RHC look built in

- **The RHC letterhead, logo and colours are now built in**: every PDF, Word file, presentation and email signature uses the real RHC letterhead (logo and pattern at the top, Eagle St address and colour blocks at the bottom), the RHC logo and RHC blue and yellow — no setup needed. A different letterhead can still be taken from a document; "Use the RHC letterhead" goes back.
- **Your name, not your email**: wherever the app showed an email address as a name (greeting, menu, approvals, letters), it now shows the name. If your account has no name yet, Today asks for it once.
- **Fixed**: the highlighted tab in the top bar (e.g. Google Drive vs Library, Research vs Presentations) now always matches the page you are on.

## 4.5.0 — Presentations and Research

- **Presentations** (new menu item): describe the deck and it is built in your colours with your logo — title, agenda, content, big numbers, charts, quotes, two-column comparisons and a closing slide. Change it by talking ("add a slide on funding", "make slide 4 a bar chart: 2024 = 12, 2025 = 18", "move slide 6 to 2") or click a slide and edit it directly. Download a real, editable **PowerPoint (.pptx)** with native charts and speaker notes, or a PDF. Finalise removes the DRAFT mark and files a final PDF in Documents. Works with ChatGPT, Claude or Gemini — or the built-in writer, which builds a starting deck from your project's facts and research.
- **Research** (Presentations → Research): ask a question and the AI searches the web, reads the sources and writes a cited report (Quick / Standard / Deep). Ask follow-ups in the same conversation, then "Make a presentation" from it or "Save to Documents" so the AI can use it later. ChatGPT, Claude and Gemini use their own web search; without them the app searches the web itself (and Ollama, if installed, summarises it).
- **Instant navigation**: "open tasks", "go to approvals", "show calendar" open the page immediately — no AI round trip.
- **Fixed**: Google Drive file previews showed "localhost is blocked".

## 4.4.1 — Professional documents on your letterhead, an assistant that follows orders

- **Full, professional documents**: Marketing and Drafting now write complete documents from everything recorded about the project (description, highlights, value, deals, contacts, notes, meetings and uploaded documents) — not thin templates. Legal drafting writes complete long-form Australian agreements (definitions, operative clauses, GST, liability, termination, disputes, notices, governing law, s127 execution blocks) and keeps approved clauses word for word. Missing facts are marked [●] — nothing is invented.
- **To and From**: choose who the document is for (pick a saved contact or type name, position, company, address) and who signs. Letters get the date, address block, "Dear …", a "Re:" line and your sign-off automatically; documents get "Prepared for / Prepared by".
- **On your letterhead**: every document shows straight away on your letterhead — logo and business name at the top, company details and page numbers at the bottom, proper headings, numbered clauses, bullets and signature lines. Approved items download as PDF or Word.
- **Project check**: Marketing and Drafting show how much information the chosen project has, so you know before writing whether the AI has enough to work with.
- **Length**: Brief / Standard / Full for marketing; Short form / Full / Comprehensive for agreements.
- **Write by conversation**: Marketing → Write is now a conversation next to the live document. Say what you want ("write to Alex and tell him the site visit moves to Monday"), get a draft on your letterhead, then keep talking to change it step by step — every change can be undone. Project, To, From, Layout and Length sit in one slim bar. Drafted agreements have the same "Talk to this document" panel.
- **Built-in writer (no AI key needed)**: turns your key points into a proper letter or document (opening, your points as full sentences, closing, sign-off) and understands simple changes: replace words, add a point or clause, remove a paragraph or clause, shorter, more formal, friendlier, change the title or who it is addressed to.
- **Finalise** (admins and directors): one button saves, records your approval and gives the final PDF/Word with no DRAFT mark. Staff get "Send for approval".
- **Final copies in Documents**: every approved document is filed automatically as "… (final).pdf" on your letterhead, marked Approved and linked to its project. The DRAFT banner line is removed from final files.
- **Your real letterhead**: Settings → Business details → "Take it from a document" copies the top band (logo, pattern) and bottom band (address, colour blocks) from one of your own PDFs — every PDF and Word file then uses it, and the logo is picked up for the app.
- **Writing style that learns**: approved documents are used as samples of how you write; a change you ask for twice, or anything said with "always"/"never", becomes a standing rule (Settings → Business details → Writing style, where rules can be removed or added).
- **Detail pages** (legal reviews, drafts, deals, projects, PDFs) have a clear "← Back" button and a ✕ to close.
- **Messages** (saved, approved, errors) now appear at the top of the screen instead of over the buttons at the bottom.
- **Security**: staff can no longer name themselves as approver of their own request; removing the logo or letterhead now actually removes it.
- **Fixed**: AI output that repeated the instructions or came back almost empty (ChatGPT gpt-5 ran out of room while thinking). The writer now checks the result and tries again once.
- **Fixed**: the assistant now carries out "open …", "show my approvals", "approve / reject …", "mark … as done" even when an AI writer is selected — these run instantly. Other requests (create a task, meeting, note…) are done by the AI, and if it only replies in words to a clear command, the command is carried out anyway.
- **Fixed**: any logo format (WebP, SVG as well as PNG/JPEG) now appears on Word and PDF letterheads.
- **Fixed**: the Mail page fits the window, so the top bar no longer covers the Inbox / Compose row.

## 4.4.0 — New look across the whole app, an assistant that acts

- **Simpler menu — 7 places instead of 17**: Today · Inbox (Gmail, Team Chat) · Work (Projects, Deals, Tasks, Calendar) · Documents (Library, Google Drive, Drafting, Notes) · Legal AI · Marketing (Campaigns, Designer) · Approvals. Each place has tabs along the top. Settings is the gear next to your name; the AI Assistant is the button in the corner of every page (with "full screen").
- **Today** (the new home page) shows what needs you: approvals waiting for you (Open / Approve), emails to answer (Reply), your tasks due soon (tick to finish), today's and tomorrow's meetings and reminders, deadlines and a short summary. "Ask Infinity AI" is one line at the top. The business overview (pipeline, projects at risk, legal risks, recent documents, activity) sits underneath.
- **Pages are quieter**: no description lines under titles; titles match the menu (Deals, Campaigns, Library).
- **Tabs live in the top bar** next to search, and pages no longer repeat their own name as a big title — the work starts right at the top.
- **Calendar redesigned**: a compact month that fits the screen (small coloured entries, today in gold), the selected day's meetings, tasks and reminders on the right with quick "+ Meeting" and "+ Reminder", and a cleaner agenda list.
- **Upload window**: a clear "Choose files" area (with Browse button), the chosen files listed, and "What is it?" as one-click buttons instead of a long dropdown. Cancelling no longer reloads the page.
- **Document viewer**: opens on the document or picture itself; details fold away under "Details"; "Text", "Sign / edit", "Legal review" and "Read text" sit in one row.
- **Photo reading**: with an AI key, photos and screenshots are read by the AI (far more accurate). Without one, the built-in reader cleans up the image first and no longer saves unreadable junk.
- **Designer** opens straight on "Start a new design" — click a format (flyer, brochure, social post…) and you are in the editor. The format is a simple dropdown inside the editor.
- **Approval panel**: details are one line, the comment is one line, and the item being approved gets the space.
- **Side panels can be resized** — drag the left edge, double-click it or press the expand button for full width; the size is remembered.
- **Dark mode** uses neutral grey layers so panels, cards, fields and buttons stand apart; "Same as Windows" explains what Windows is set to.
- **Account menu links** (My profile, Display, Settings) now work when you are already in Settings. "Excel" buttons are now "Export" (downloads that list as a spreadsheet).
- **Documents → Library**: one search box that searches names or inside files (the old "Knowledge search" tab), a **Filters** button for project, category, type, source, review and authority, sort and view.
- **New design everywhere**: a light, calm look in RHC navy with one gold accent. White side menu with a gold marker on the current page, thin lines instead of shadows, one size for every button and box, the clearer Figtree typeface, and Farsi in Vazirmatn. Admins can still choose a darker menu in Settings → Theme & colours ("Navy sidebar").
- **Compose and reply**: the message box now takes most of the window. To and Cc sit on one line, suggested people appear as small chips, and the AI request is one line ("Tell Infinity AI what to say" → Draft reply), with tone, role and AI choice behind the options button. Polish, Proofread, Shorten, Attach and Preview are in a slim toolbar under the message.
- **Assistant actions**: with Actions on, Infinity AI now does what you ask instead of searching documents:
  - "open approvals", "go to my tasks", "open gmail", "open project Fortitude Valley" → takes you there;
  - "show my approvals" → lists what's waiting for you, with links;
  - "approve 1", "approve the Harbourline MOU", "reject 2 because the deposit is too high" → decides it (only if you're an allowed approver; a reason is needed to reject);
  - "mark send the MOU as done", "complete task review lease", "start task …" → updates the task.
- The Actions and Files switches are remembered and are the same in every chat window; the chat header is now a single line.
- **Gemini keys** that start with "AQ." (Google's newer format) are accepted in Settings → AI.
- **Roles window rebuilt**: one-click names (Cleaner, Security, Driver, Receptionist, Site Supervisor, Accountant, Sales Agent) or type any name; "What can they do?" in plain words; tick which parts of the app they can open and **who has the role**, all in one place.
- **No more typing CMD commands**: an **Infinity Planet** icon on the Desktop and in the Start menu starts the app (its window stays minimised) and opens it in the browser. After an update, use **Start menu → Infinity Planet → Update Infinity Planet** (or Launcher\Update Infinity Planet.bat in the app folder).
- **Display & text size** moved out of the account menu into Settings → Display & text size.
- **Google Drive screen redesigned**: browse your Drive like Google Drive (thumbnails or list, search, type and sort). At the top, "The AI reads" shows the folders the AI knows about as chips (update or stop each one). Inside any folder, one button: **Let the AI read this folder** — it reads everything there and keeps up with changes. Tick files and a bar appears at the bottom: choose a project and **Add to Documents**. "Paste a link" is there for folders shared with you.
- AI key "Test" explains in plain English why a key fails (wrong key, service switched off, credit run out, no internet).

## 4.3.1 — Easier to read, AI keys in Settings, calmer Gmail

**No new database update**, but update 006 (from 4.3.0) must be applied: the app now shows a yellow box with **Copy update** and **Open Supabase** buttons — paste, click Run, reload.

- **Text size and spacing**: normal reading size is back; the layout is compact by removing empty space, not by shrinking text. Each person picks their own screen size and text size (saved to their account) in Settings → My profile.
- **Page headers** are one compact line everywhere (no repeated section labels), so the work starts higher on the screen.
- **Clear hierarchy**: headings dark and bold, labels small and grey, values easy to read; no more ALL-CAPS labels.
- **Home**: the ten big number boxes are now one slim row; Infinity AI sits right under them and fills the screen.
- **Settings** (was "System"): a normal left-hand menu — You, Company, Connections, Team, System.
- **AI keys**: admins paste a Claude, OpenAI or Gemini key in Settings → AI. It is checked straight away, stored encrypted, never shown again (only the last 4 characters), and works without a restart. Keys in `.env.local` still work.
- **Gmail reading**: no more `<mailto:…>` and long Google links; links show as short clickable text. Calendar invites show as a simple card (what, when, where, video call, who) with no RSVP clutter. "Show original formatting" shows the sender's layout safely.
- **Replies no longer paste the previous email underneath** (Gmail keeps the conversation together). It can be switched back on in Settings → Email look.
- **Gmail "Quota exceeded"** fixed: the inbox makes about half as many Google requests, a few at a time, with a short cache, and waits and retries automatically if Google says to slow down.
- **Legal AI**: "Print" opens a clean PDF of the review, and "PDF" downloads it (no more stuck print window). Text hierarchy on the review is clearer.
- **Designer and PDF editor** have a close (×) button.
- **Roles**: the Roles card has an "Add or edit roles" button.
- **Logo upload**: big images are resized automatically instead of being refused.
- AI assistant button stays in the bottom-right corner of every page (Ctrl+J).

## 4.3.0 — Full email, signing, approvals by name, access control, Farsi

**One database update is needed:** in Supabase → SQL Editor, run `supabase/migrations/006_email_options_4_3.sql`. It is safe to run twice. Then rebuild. System → Status shows "Database migrations (004, 005, 006): Applied".

**Screen size**
- The whole app now scales to fit the window ("Fit to window"), with a denser layout.
- Choose Compact, Small, Normal or Large from your name menu (bottom left) or System → My profile → Display size.

**Gmail**
- Every email in the inbox shows a clear status, with filter buttons and counts:
  - **New**;
  - **Needs reply**;
  - **Reply drafted**;
  - **Waiting on them**;
  - **Replied** (also counts replies by colleagues at your company);
  - **FYI** (newsletters, notifications, calendar invites).
- Previews stay on one line.
- Inbox actions: star, mark read or unread, archive and delete (Gmail trash). Opening an email marks it read.
- Views: Inbox, Unread, Starred, Sent, With attachments, Trash.
- Thread dates are shown in Brisbane time.
- **Link to project** now offers "＋ New project from this email…" and shows which projects the email is already linked to.
- **Forward** includes the original email's attachments.
- **AI reply** now answers the other side of the conversation, not your colleague. Everyone else on the thread stays in Cc.
- **Cc suggestions:** one-click chips for people already on the conversation and for your team. **Bcc** is available.
- **Attachments:** from your computer or from Documents, up to 25 MB in total.
- **Saved replies:** insert one in a click, or save the selected text as a new one.
- **Schedule send:** tomorrow 8am, tomorrow 1pm, Monday 9am, or any date and time. The email must be approved first, and the server sends it.
- **Auto-reply (out of office)** tab, with start and end dates. Google needs one extra permission for this, so reconnect Google once in System → Integrations.
- **Your real signature:** emails use your Gmail signature (logo, phone, address, Acknowledgement of Country) and are laid out like normal Gmail. You can also paste your own signature in My profile, or use the generated one.
- **Rewrite buttons:**
  - With no AI connected, Polish, Proofread, Shorten, More formal and Friendlier now change the wording, not just the greeting.
  - "Auto" uses a connected AI, or Ollama on the server PC if it is running, for full rewrites.

**Legal AI**
- **Upload a file** directly in "Review an agreement" (PDF, Word, text or photo).
- **Amend contract:**
  - tick the amendments and missing protections to apply, and edit their wording;
  - build the amended contract and see a **redline** (additions and deletions marked);
  - edit the text;
  - download a **Word redline** or a **clean copy**, or save it as a draft document for approval.

**Documents, Drive and PDFs**
- **Thumbnail view** with photo and PDF previews, plus a list view. Sort by name, date or type, and filter by file type. This is available in Documents and in Google Drive (which also sorts by size).
- **Sign / edit PDF:**
  - add your handwritten or typed signature, initials, your stamp or the company stamp;
  - add text, dates, ticks, crosses, highlights, lines and white-out;
  - saving creates a new signed copy, and the original is kept.
- **Send for signature:**
  - place the boxes for the client: signature, initials, date, name and text;
  - a secure link is created (you can copy it), and an email draft with the link waits for approval;
  - the client signs in the browser, no account needed, or declines with a reason;
  - the signed PDF comes back to Documents with a **signing certificate page** (name, email, time, IP address and SHA-256 fingerprints), and you get a notification.
- **My signatures** in My profile: handwritten (draw or upload), typed, initials and a personal stamp. Admins can add the company stamp.
- **Letterhead preview:** templates and generated documents show your logo header and company footer, with a DRAFT watermark until approved. Word and PDF exports always include the letterhead.

**Approvals by name**
- When you request an approval you must choose the approver or approvers.
- Only those people can approve the item, or change it while it is under approval. Everyone else can view it and comment.
- The requester or an admin can change the approvers.

**Team & access**
- **Manage roles…** at the end of the role list lets you create your own roles (e.g. "Site Supervisor"). Each one works like a built-in role and has its own default areas.
- **Access:** tick the areas each member may open. Unticked areas are hidden from their menu and blocked on the server. Admins and directors always see everything.
- **Passwords:** set a temporary password and make them choose their own at next sign-in, or email them a reset link.

**Notes**
- A note can be **for a team member**. It shows their colour and name, and they are notified.
- Filters: All, Mine, General, or by person.

**Farsi**
- Each person chooses English or فارسی in My profile. Infinity AI and the team bot reply in Farsi, and Farsi text in a message also triggers it.
- Right-to-left text displays correctly, with the Vazirmatn font.
- **Translate** (English ⇄ Farsi) on team chat messages, AI answers, emails and documents. This needs an AI connected.

**Other**
- "What needs my attention today?" briefing. Drive auto-sync every 30 minutes, and the AI searches Drive live when it can't find something.
- Signing links and reset emails use `RHC_PUBLIC_URL`. Clients can only open signing links if the server is reachable from the internet (see SETUP → "Making the app available").

**Tests:**
- 4.3 e2e 65/65;
- email/briefing/team e2e 44/44;
- API 140/140;
- 4.1 suite 115/115;
- email engine 58/58;
- bot rules 43/43;
- Legal AI 19/19.

## 4.2.0 — Professional email, Drive-connected AI, daily briefing

No database migration is needed. Rebuild with `npm install`, `npm run build`, `npm start`.

**Gmail: Infinity AI reads, drafts and polishes**
- When you open an email, a "Read by Infinity AI" panel shows the sender, topic, questions asked, requests, dates, deadline, attachments and urgency. The full conversation is shown with earlier messages collapsed.
- **Earlier emails:** it searches your mailbox for emails with the same sender (and their company domain) from the last two years. It ranks the ones on the same topic and reads the two closest. Replies refer to them ("Further to our previous correspondence on … (2 Sept 2026)"), and the project those emails were linked to is picked up automatically.
- **Reply as Admin, Project Coordinator, Project Manager or CEO.** Each role has its own voice and authority:
  - Admin acknowledges and routes the email.
  - Project Coordinator coordinates and refers decisions to the Project Manager.
  - Project Manager commits to actions and timing.
  - CEO is senior and commits "in principle, subject to documentation".
  - The role's title goes under your name.
  - Each person sets a default role in System → My profile, and admins set an organisation default.
- **AI reply** in one click. Say what the reply should say in shorthand (e.g. "accept tue 10am, we'll send the site plan by Wednesday, ask for their board timeline"). Each point in the email is answered: your answers are matched to the questions, and anything left open becomes a highlighted [placeholder].
- **Tones:** Professional, Warm, Formal, Brief.
- **Rewrite tools:** Polish, Proofread, Shorten, More formal, Friendlier, plus Undo. With an AI provider you can also give a custom instruction.
- **Works without an AI key**, using the built-in writer. With a provider (OpenAI, Gemini, Claude or Ollama) the model writes from the whole thread, earlier emails, the project and the brand book. It falls back to the built-in writer if the provider fails.
- **Reply all** keeps the Cc list, minus your own mailbox.

**A very professional look for every email**
- Emails go out as branded HTML with a plain-text copy:
  - logo embedded inline (so it shows without "load images"), or a name wordmark;
  - clean typography, with numbered and bulleted lists;
  - a signature block in your brand colours (name, title or role, company, phone, mobile, email, website);
  - a footer with legal name, ABN, ACN, address and a confidentiality notice;
  - for replies, the original message quoted underneath.
- The From name shows as "Your Name | Business".
- **Preview** in the compose window, the drafts list and the send dialog shows exactly what the recipient will see.
- **System → Business → Professional email look** sets the header style (logo / colour band / none), footer, quoting, disclaimer text, default tone and default role.
- **System → My profile → My email signature** sets title, phone, mobile and usual role.

**Bot email actions** (drafts only; sending still needs approval and confirmation)
- "reply to the latest email from Harbourline saying we accept Tuesday 10am, as project manager"
- "draft an email to sarah@harbourline.com.au about the revised deposit"
- "read the latest email from Harbourline"

**Connected to your Google Drive**
- Linked Drive folders re-sync automatically every 30 minutes while the server runs (new and changed files only). Set `DRIVE_AUTO_SYNC=off` to disable.
- When the knowledge base has no answer, Infinity AI searches Google Drive directly (full text), reads the best-matching files and answers from them straight away.
- A "couldn't find it" reply now says how many Drive files were searched and when Drive last synced.
- System → Status shows how many Drive files are indexed.

**Daily briefing**
- "What needs my attention today?" (or "brief me") lists:
  - overdue work and work due today or tomorrow;
  - today's meetings and reminders;
  - approvals waiting for you;
  - emails awaiting approval;
  - unread inbox email, with the top senders;
  - for admins, team-wide overdue tasks and pending accounts.

**Team**
- **Edit member:** change name, sign-in email, title and role.
- **Remove member:** the account is deleted if it has no work on record; otherwise it is deactivated and its history kept.

**Tests:** email unit tests 51/51, email/briefing/team e2e 44/44, API 140/140, 4.1 suite 115/115, bot rules 43/43, Legal AI 19/19.

## 4.1.0 — Infinity Planet

**Renamed:** the app is now **Infinity Planet**, with a new icon for the desktop app, phone app and browser. The business using it (default RHC City) is configurable in **System → Business**: name, short name, logo, brand colours, font, website, footer line and letterhead on/off. The AI, Legal AI, drafting, marketing, exports and the sign-in page all use the business name. Migration `005_infinity_planet_4_1.sql` is required.

**Infinity AI bot**
- In Team Chat, mention `@ai` in any channel or use the "Ask Infinity AI" channel. There is also a new **AI Assistant** page.
- It takes actions with the asking user's permissions: create tasks (assignee, priority, due date and reminder), reminders (for me, a person or everyone), meetings (attendees, duration, reminder), notes, documents (MOU, Heads of Agreement, offer, proposal, letter, services agreement, NDA and the new **Project Status Report**), branded designs, and legal reviews of contracts attached to the message. It can also list tasks.
- It teaches people how to use the app ("how do I…?") from a built-in guide.
- **Works without an AI key:** a rules engine understands plain-English commands and Queensland-time dates ("tomorrow 3pm", "on 14/10 at 10am", "in 2 hours"). With a provider connected, the AI reads the request, team list, projects, brand book, documents and attachments, and returns validated actions. It never invents people, times or projects.

**Chat and files**
- AI chat history is saved, searchable, renameable, pinnable and removable.
- Team chat keeps all messages, with "Load earlier messages" and per-channel search.
- File attachments in chat: up to 10 files of 50 MB each, drag and drop or paste, photo previews and signed download links.

**Readers**
- Photos are OCR'd automatically on upload (offline).
- Excel (.xlsx) files are read and indexed.
- The bot reads PDF, Word, Excel, text and photo attachments.

**Google Drive**
- Preview and open Drive files in the app.
- **Drive links:** add any number of folder or file links (including My Drive), synced into knowledge. A link can be marked as the Brand book.

**Brand book and letterhead**
- Documents can be tagged "Brand book". AI chat, the bot, drafting and marketing follow it.
- System → Business can read colours and fonts from the brand book, or colours from the logo.
- Word and PDF exports get the letterhead: logo, business name, brand colours, footer details and "Page X of Y".

**Exports:** Excel for tasks, projects, deals, contacts and legal reviews. PDF export for approved documents, alongside Word.

**Business setup from your files:**
- "Fill from your documents" proposes your legal name, ABN and ACN (checksum-validated), address, phone, email, website, logo and brand colours from your uploads and Drive files. The admin chooses what to apply.
- The bot action `autofill_business` does the same (admins only).

**Templates that learn from your documents:**
- Create a template from any document (rules engine or AI). Your business details and the counterparty become placeholders.
- Update a template to follow your own documents. This saves a new draft version that needs approval, and the previous wording is kept.
- Bot actions: `template_from_document` and `update_template`.

**Team accounts:**
- Bulk "Add several" with one-time temporary passwords.
- Optional "Request access" on the sign-in page for company email domains. Requests need admin approval, admins are notified in the bell, and a declined request removes the account. Pending accounts cannot sign in.

**Google sign-in return address:** after connecting Google, you now land back on `RHC_PUBLIC_URL` (e.g. localhost:3300), not the server's 0.0.0.0 bind address.

**Reminders:** stand-alone reminders from the bell and the Calendar. Reminder recipients are shown. Editing a task reminder replaces the old one instead of duplicating it.

**Tests:** 140/140 V4 API, 115/115 new 4.1 end-to-end, 43/43 bot and rules unit tests, 19/19 Legal AI, 12/12 provider integration and 7/7 bot AI-path tests (Ollama-protocol test double).


## 4.0.0 — Business Operating System (built on V3.1)

**Front end:** the V3.1 single-file UI (24 lines, raw JSON on most screens) was replaced with a full application. It has 19 pages, a shared design system, a command bar (Ctrl K), a notifications bell, a phone layout with bottom navigation and an installable PWA.

**New / completed**
- **Command Centre:**
  - Real AI chat: OpenAI, Gemini, Claude and Ollama, plus "RHC Search (no AI)". It supports project context, document attachments, persistent conversations and clickable citations.
  - 10 live KPIs, a data-driven executive summary plus optional AI briefing, deadlines, high-risk projects, legal risks, pipeline, meetings, open work, approvals, documents and activity.
- **Projects:** a full workspace with 13 tabs (overview, deals, documents, tasks, notes, AI, legal, marketing, emails, calendar, contacts, approvals, activity).
- **CRM:** a 7-stage pipeline (lead → opportunity → negotiation → due diligence → contract → completed / lost) with a drag-and-drop board, table, deal pages, counterparties and contacts.
- **Legal AI:**
  - A built-in rules engine that needs no key, with an optional AI deepening pass.
  - Structured report covering summary, key terms, risks with clause references and excerpts, missing protections, financial/termination/liability risks, conditions precedent, due diligence, negotiation points, recommended wording, solicitor questions and a risk score.
  - Clause library with APPROVED / PREFERRED / FALLBACK / HISTORICAL PRECEDENT / DRAFT authority. Old agreements are never treated as approved.
  - Approval workflow.
- **Drafting:**
  - 8 starter templates (MOU, Heads of Agreement, offer, proposal, correspondence, letter, services agreement, NDA) that insert approved clause wording.
  - Missing facts are flagged, editing is versioned, and Word export only becomes available after approval.
- **Designer:** 10 layouts and 5 themes, filled from project data or AI copy. Image upload, live preview, approval-gated print/PDF and HTML export.
- **Marketing:** 11 templates filled only with recorded facts, optional AI copywriting, assets with approval.
- **Documents:**
  - Multi-file upload, a current pdf.js text extractor (replaces `pdf-parse` 1.1.1, which failed on many modern PDFs), DOCX/text extraction and Postgres full-text search.
  - Preview and download through signed URLs.
  - Authority classification, review requests, Google Drive browsing, import and folder sync.
  - OCR: built-in Tesseract for images (language data bundled), AI vision for scanned PDFs.
- **Gmail:** inbox and search, read messages, link to projects, template or AI drafting. Sending only after approval and explicit confirmation, with header-injection protection.
- **Calendar:** month and agenda views, RHC and Google events merged, Google create/update/delete with invitations, reminders.
- **Tasks:** board and list, assignment, priorities, due dates, reminders, overdue notifications.
- **Team Chat:** channels, project channels, presence, @mention notifications.
- **Approvals:** one workflow for reviews, contracts, marketing and designs, documents, templates, clause positions and emails. It records requester, reviewer, role-based deciders, mandatory comments on rejection, a discussion thread and the decision trail.
- **System:** live status, integrations, team and role administration (create accounts, roles, deactivate, reset passwords), RHC identity and AI-instruction settings, profile, desktop/mobile instructions, audit log.
- **Desktop app:** a Windows installer (Electron) for team PCs, with native notifications and tray.

**Security fixes**
- V3.1's final SQL block failed, so RLS was never enabled on deals, team messages, calendar events, reminders, marketing assets, legal clauses and approvals. Migration 004 enables RLS everywhere and makes viewers read-only at the database level.
- Fixed the recursive `profiles` RLS policy.
- Every API write now checks the user's role on the server (V3.1 only checked that someone was signed in).
- The middleware strips any client-supplied `x-rhc-actor-id` header.
- Google OAuth now requires a signed-in admin (signed state). Previously anyone could hit `/api/google/oauth`.
- The encryption key must be 32+ characters (previously an empty key was silently accepted).
- V3.1's project "review document" workflow called another API route without the auth token and always failed. Replaced.

**Removed V3.1 endpoints** (superseded): `/api/ai`, `/api/ai/history`, `/api/chat`, `/api/crm`, `/api/dashboard`, `/api/integrations`, `/api/connections`, `/api/audit` (POST), `/api/knowledge/context`, `/api/knowledge/sources`, `/api/projects/[id]/workflow`, `/api/projects/[id]/context`.

**Port:** 3300 (was 3201 in package.json).
