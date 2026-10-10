# Connecting AI to Infinity Planet

Infinity Planet works **without any AI key**. Built-in engines handle these features:
- **Infinity AI bot:** tasks, reminders, meetings, notes, documents, designs, how-to help and answers from your files.
- **Legal AI rules engine**
- **Drafting templates**
- **Designer**
- **Infinity Search**
- **OCR:** reads photos.

Adding an AI provider makes the answers written and conversational, and deepens Legal AI, drafting and marketing. You can add one provider or several, and choose per chat.

All keys live **only** in `.env.local` on the server PC. They are never sent to browsers, phones or the desktop app.

---

## 1. Pick a provider

| Provider | Best for | Cost | What to put in `.env.local` |
|---|---|---|---|
| **Anthropic Claude** | Contract review, careful writing | Pay per use | `ANTHROPIC_API_KEY=sk-ant-...` (optional `ANTHROPIC_MODEL`) |
| **OpenAI (ChatGPT)** | General questions, drafting | Pay per use | `OPENAI_API_KEY=sk-...` (optional `OPENAI_MODEL`) |
| **Google Gemini** | Long documents, scanned PDFs | Free tier, then pay per use | `GEMINI_API_KEY=...` (optional `GEMINI_MODEL`) |
| **Ollama (local)** | Private, offline, free | Free (uses your PC) | `OLLAMA_BASE_URL=http://localhost:11434`, `OLLAMA_MODEL=llama3.1` |

Where to get keys:
- **Claude:** console.anthropic.com → API Keys
- **OpenAI:** platform.openai.com → API keys (add billing)
- **Gemini:** aistudio.google.com → Get API key
- **Ollama:** install from ollama.com, then run `ollama pull llama3.1`

## 2. Add the key

1. Open `C:\Users\falah\RHC Software\.env.local` in VS Code or Notepad.
2. Paste the key straight after the `=`, with no spaces or quotes, for example:
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxx
   ```
3. Save the file.
4. In the server terminal, press **Ctrl + C**, then run `npm start` again. A rebuild is not needed because keys are read when the server starts.

## 3. Check it

- Go to **System → Status**. The provider should show a green tick and its model.
- Go to **System → Integrations & AI → "Infinity AI bot uses"** and choose:
  - **Auto** (recommended): the first connected provider, falling back to the built-in engine.
  - **A specific provider.**
  - **Built-in engine only.**
- Open **AI Assistant**, pick the provider in the drop-down and ask a question. In **Legal AI**, run a review with that provider.
- If a model name has changed at the provider, set `OPENAI_MODEL`, `GEMINI_MODEL` or `ANTHROPIC_MODEL`.

## 4. How the AI is wired (for whoever maintains it)

```
User (chat, @ai, Assistant)
      │
      ▼
lib/agent.ts ── chooses an engine:
      │          • AI provider (lib/providers.ts: OpenAI / Gemini / Anthropic / Ollama)
      │          • built-in rules (parseCommand + lib/when.ts date parsing)
      │
      ├─ context: team list, projects, app guide (lib/app-guide.ts),
      │           brand book (lib/brand-book.ts), retrieved documents (lib/retrieval.ts),
      │           files attached to the message (lib/attachments.ts: PDF/Word/Excel/photo OCR)
      │
      ▼
validated actions → executeActions() runs them with the asking user's permissions:
  create_task · set_reminder · create_meeting · add_note · generate_document (MOU, offer, report…)
  create_design · review_contract · list_tasks
```

- The AI never writes to the database directly. It returns JSON actions, and the server checks each one first:
  - known action type;
  - real team member;
  - real project;
  - valid time;
  - the user's role allows it (viewers are read-only).
- Unknown people and missing times are refused or asked about, never invented.
- System instructions live in **System → Settings → AI system instructions**. `{{business}}`, `{{short}}` and `{{ai}}` are replaced with your business name, short name and the bot name.
- To add a new action:
  1. Add it to `AgentAction` in `lib/agent.ts`.
  2. Implement it in `executeActions()`.
  3. Describe it in the JSON schema inside `aiAgent()`.
  4. Optionally add a plain-English pattern in `parseCommand()` so it also works without a key.

## 5. Privacy

- Cloud providers receive only what a request needs: the question, short document excerpts and the team member list for the bot.
- Ollama keeps everything on your PC.
- The audit log records every AI action under the person who asked.
