/**
 * AI provider layer. All keys stay server-side. Every call goes to the real
 * provider API — there are no simulated responses anywhere in Infinity Planet.
 */
export type Provider = 'openai' | 'gemini' | 'anthropic' | 'ollama';
export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type PdfAttachment = { mimeType: 'application/pdf' | 'image/png' | 'image/jpeg'; base64: string };

export const PROVIDER_LABEL: Record<Provider, string> = {
  openai: 'OpenAI (ChatGPT)', gemini: 'Google Gemini', anthropic: 'Anthropic Claude', ollama: 'Ollama (local)',
};

export function models() {
  return {
    openai: process.env.OPENAI_MODEL || 'gpt-5',
    gemini: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    anthropic: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
    ollama: process.env.OLLAMA_MODEL || 'llama3.1',
  };
}

export function ollamaBase() {
  return (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
}

/** Whether each provider has the configuration it needs (keys present). */
export function providerStatus() {
  return {
    openai: Boolean(process.env.OPENAI_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    ollama: process.env.OLLAMA_ENABLED !== 'false',
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  };
}

export function isProvider(p: unknown): p is Provider {
  return p === 'openai' || p === 'gemini' || p === 'anthropic' || p === 'ollama';
}

/** Live reachability check for Ollama (keys don't apply; the server must be running). */
export async function probeOllama(): Promise<{ ok: boolean; models: string[]; error?: string }> {
  if (process.env.OLLAMA_ENABLED === 'false') return { ok: false, models: [], error: 'Disabled (OLLAMA_ENABLED=false)' };
  try {
    const r = await fetch(`${ollamaBase()}/api/tags`, { headers: ollamaHeaders(), signal: AbortSignal.timeout(2500) });
    if (!r.ok) return { ok: false, models: [], error: `HTTP ${r.status}` };
    const d = await r.json();
    return { ok: true, models: (d.models || []).map((m: any) => m.name) };
  } catch (e: any) { return { ok: false, models: [], error: e?.name === 'TimeoutError' ? `Not reachable at ${ollamaBase()}` : (e?.message || 'Not reachable') }; }
}

function ollamaHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.OLLAMA_API_KEY) h.Authorization = `Bearer ${process.env.OLLAMA_API_KEY}`;
  return h;
}

async function readError(res: Response, name: string) {
  let detail = '';
  try { const t = await res.text(); const j = JSON.parse(t); detail = j?.error?.message || j?.error || j?.message || t; } catch {}
  if (typeof detail !== 'string') detail = JSON.stringify(detail);
  return new Error(`${name} error ${res.status}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`);
}

export type ChatOptions = {
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  attachments?: PdfAttachment[]; // only used by providers that accept files (Gemini, Claude, OpenAI)
  timeoutMs?: number;
  /** OpenAI reasoning models (gpt-5, o-series): how much thinking to spend. Thinking uses the same token budget as the answer. */
  reasoning?: 'minimal' | 'low' | 'medium' | 'high';
};

export async function chat(provider: Provider, opts: ChatOptions): Promise<string> {
  await (await import('./ai-keys')).ensureAiKeys();
  const maxTokens = opts.maxTokens || 2000;
  const timeout = AbortSignal.timeout(opts.timeoutMs || 180_000);
  const m = models();
  const msgs = opts.messages.filter(x => x.content?.trim());
  if (!msgs.length) throw new Error('No message supplied');

  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY; if (!key) throw new Error('OPENAI_API_KEY is not configured on the Infinity Planet server');
    const input: any[] = msgs.map(x => ({ role: x.role, content: x.content }));
    if (opts.attachments?.length) {
      const last = input[input.length - 1];
      last.content = [
        ...opts.attachments.map(a => a.mimeType === 'application/pdf'
          ? { type: 'input_file', filename: 'document.pdf', file_data: `data:application/pdf;base64,${a.base64}` }
          : { type: 'input_image', image_url: `data:${a.mimeType};base64,${a.base64}` }),
        { type: 'input_text', text: msgs[msgs.length - 1].content },
      ];
    }
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: timeout,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: m.openai, instructions: opts.system, input,
        // Reasoning models spend part of the budget thinking — give them room so the answer is not cut short.
        max_output_tokens: /^(gpt-5(?!-chat)|o\d)/i.test(m.openai) ? Math.max(maxTokens * 2, 8000) : Math.max(maxTokens, 1000),
        ...(/^(gpt-5(?!-chat)|o\d)/i.test(m.openai) ? { reasoning: { effort: opts.reasoning || 'low' } } : {}),
      }),
    });
    if (!res.ok) throw await readError(res, 'OpenAI');
    const data = await res.json();
    const text = data.output_text || (data.output || []).flatMap((x: any) => x.content || []).map((x: any) => x.text || '').join('');
    if (!text) throw new Error(data.status === 'incomplete' ? 'OpenAI ran out of room before answering — try again or pick another AI' : 'OpenAI returned an empty response');
    return text;
  }

  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY; if (!key) throw new Error('GEMINI_API_KEY is not configured on the Infinity Planet server');
    const contents = msgs.map((x, i) => ({
      role: x.role === 'assistant' ? 'model' : 'user',
      parts: [
        ...(i === msgs.length - 1 ? (opts.attachments || []).map(a => ({ inline_data: { mime_type: a.mimeType, data: a.base64 } })) : []),
        { text: x.content },
      ],
    }));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m.gemini)}:generateContent`, {
      method: 'POST', signal: timeout,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents, ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}), generationConfig: { maxOutputTokens: maxTokens } }),
    });
    if (!res.ok) throw await readError(res, 'Gemini');
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('');
    if (!text) throw new Error(`Gemini returned no text${data.candidates?.[0]?.finishReason ? ` (${data.candidates[0].finishReason})` : ''}`);
    return text;
  }

  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error('ANTHROPIC_API_KEY is not configured on the Infinity Planet server');
    const messages: any[] = msgs.map(x => ({ role: x.role, content: x.content }));
    if (opts.attachments?.length) {
      const last = messages[messages.length - 1];
      last.content = [
        ...opts.attachments.map(a => a.mimeType === 'application/pdf'
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.base64 } }
          : { type: 'image', source: { type: 'base64', media_type: a.mimeType, data: a.base64 } }),
        { type: 'text', text: msgs[msgs.length - 1].content },
      ];
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: timeout,
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: m.anthropic, max_tokens: maxTokens, ...(opts.system ? { system: opts.system } : {}), messages }),
    });
    if (!res.ok) throw await readError(res, 'Claude');
    const data = await res.json();
    const text = (data.content || []).map((x: any) => x.text || '').join('');
    if (!text) throw new Error('Claude returned an empty response');
    return text;
  }

  // Ollama — native /api/chat. Works against Ollama directly (default :11434)
  // or Open WebUI's Ollama proxy (OLLAMA_BASE_URL=http://localhost:3000/ollama + OLLAMA_API_KEY).
  if (process.env.OLLAMA_ENABLED === 'false') throw new Error('Ollama is disabled on the Infinity Planet server');
  const res = await fetch(`${ollamaBase()}/api/chat`, {
    method: 'POST', signal: timeout, headers: ollamaHeaders(),
    body: JSON.stringify({ model: m.ollama, stream: false, options: { num_predict: maxTokens, num_ctx: Number(process.env.OLLAMA_NUM_CTX) || 16384 }, messages: [...(opts.system ? [{ role: 'system', content: opts.system }] : []), ...msgs] }),
  }).catch((e: any) => { throw new Error(`Ollama is not reachable at ${ollamaBase()} (${e?.message || 'connection failed'}). Start Ollama or set OLLAMA_BASE_URL.`); });
  if (!res.ok) throw await readError(res, 'Ollama');
  const data = await res.json();
  const text = data.message?.content || '';
  if (!text) throw new Error('Ollama returned an empty response');
  return text;
}

/** V3 compatibility: single-prompt call. */
export async function askProvider(provider: Provider, message: string) {
  return chat(provider, { messages: [{ role: 'user', content: message }] });
}

/** Extract the first JSON object from a model response (handles ```json fences and prose). */
export function extractJson<T = any>(raw: string): T | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || raw;
  const start = fenced.indexOf('{'); const end = fenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
}

/** True when p names a provider that has its configuration on this server. */
export function providerReady(p: unknown): p is Provider {
  return isProvider(p) && providerStatus()[p];
}

let autoCache: { at: number; p: Provider | null } | null = null;
/** "auto": the first AI provider with a key (Claude, OpenAI, Gemini), else local Ollama when it is running, else null (built-in engine). */
export async function autoProvider(): Promise<Provider | null> {
  if (autoCache && Date.now() - autoCache.at < 60_000) return autoCache.p;
  const st = providerStatus();
  let p: Provider | null = (['anthropic', 'openai', 'gemini'] as Provider[]).find(x => st[x]) || null;
  if (!p && st.ollama) { const o = await probeOllama().catch(() => ({ ok: false, models: [] as string[] })); if (o.ok && o.models.length) p = 'ollama'; }
  autoCache = { at: Date.now(), p };
  return p;
}
/** Resolves a requested provider ("auto", a provider id, or none). */
export async function resolveProvider(requested: unknown): Promise<Provider | null> {
  if (requested === 'auto') return autoProvider();
  return isProvider(requested) ? requested : null;
}
