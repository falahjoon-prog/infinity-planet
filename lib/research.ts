/**
 * Research: the AI searches the web, reads sources and writes a cited report.
 * - ChatGPT (OpenAI), Claude (Anthropic) and Gemini use their own built-in web search.
 * - Without one of those (local Ollama or no AI at all) the server searches the web itself (DuckDuckGo), reads the
 *   top pages and either has Ollama summarise them or lists the findings with their sources.
 */
import { Provider, providerStatus, chat } from './providers';
import { getBrand } from './brand';
import { getSetting } from './settings';

export type Source = { title: string; url: string };
export type ResearchResult = { report: string; sources: Source[]; engine: string; searched: boolean };
type Turn = { role: 'user' | 'assistant'; content: string };

async function readError(res: Response, name: string) { let t = ''; try { t = await res.text(); const j = JSON.parse(t); t = j?.error?.message || j?.error || t; } catch {} return new Error(`${name} error ${res.status}: ${String(t).slice(0, 240)}`); }

async function instructions(depth: 'quick' | 'standard' | 'deep') {
  const b = await getBrand(); const law = String((await getSetting<string>('home_jurisdiction')) || 'Queensland');
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' });
  return `You are a senior research analyst working for ${b.business_name} (${b.short_name}), a property, development and investment business based in ${law}, Australia. Today is ${today}.
Research the user's question on the web thoroughly${depth === 'deep' ? ' — run several searches from different angles, compare sources, and prefer primary sources (government, regulators, company filings, ABS, reputable industry bodies and major news)' : ''}.
Write a ${depth === 'quick' ? 'short (250–400 words)' : depth === 'deep' ? 'comprehensive (1,200–2,000 words)' : 'well-structured (600–1,000 words)'} report in Australian English with this structure:
## Summary — 3–5 sentences answering the question directly.
## Key findings — bullet points, each with figures, dates and a citation like [1].
## Details — sections with headings as needed.
## What this means for ${b.short_name} — practical implications and opportunities or risks.
## Sources — numbered list: [n] Title — URL
Rules: cite every fact with [n]; give dates for figures and say how current they are; say clearly when sources disagree or information could not be found; never invent figures, quotes or URLs. Plain markdown only (no tables).`;
}

// ------------------------------------------------------------------ provider web search
async function openaiSearch(q: string, history: Turn[], depth: 'quick' | 'standard' | 'deep'): Promise<ResearchResult> {
  const key = process.env.OPENAI_API_KEY!; const model = process.env.OPENAI_MODEL || 'gpt-5';
  const instr = await instructions(depth);
  const reasoning = /^(gpt-5(?!-chat)|o\d)/i.test(model) ? { reasoning: { effort: depth === 'deep' ? 'medium' : 'low' } } : {};
  const send = (tool: string) => fetch('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(280_000), headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, instructions: instr, input: [...history.map(h => ({ role: h.role, content: h.content })), { role: 'user', content: q }], tools: [{ type: tool }], max_output_tokens: 16000, ...reasoning }),
  });
  let res = await send('web_search');
  if (res.status === 400) res = await send('web_search_preview');
  if (!res.ok) throw await readError(res, 'OpenAI');
  const data = await res.json();
  const msgs = (data.output || []).filter((x: any) => x.type === 'message').flatMap((x: any) => x.content || []);
  const text = data.output_text || msgs.map((c: any) => c.text || '').join('');
  const sources: Source[] = []; for (const c of msgs) for (const a of c.annotations || []) if (a.type === 'url_citation' && a.url && !sources.some(s => s.url === a.url)) sources.push({ title: a.title || a.url, url: a.url });
  if (!text) throw new Error('OpenAI returned no report');
  return { report: text, sources, engine: 'openai', searched: true };
}

async function claudeSearch(q: string, history: Turn[], depth: 'quick' | 'standard' | 'deep'): Promise<ResearchResult> {
  const key = process.env.ANTHROPIC_API_KEY!; const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(280_000), headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 12000, system: await instructions(depth), messages: [...history, { role: 'user', content: q }], tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: depth === 'deep' ? 10 : depth === 'quick' ? 3 : 6 }] }),
  });
  if (!res.ok) throw await readError(res, 'Claude');
  const data = await res.json();
  const sources: Source[] = []; let text = '';
  for (const b of data.content || []) {
    if (b.type === 'text') { text += b.text || ''; for (const c of b.citations || []) if (c.url && !sources.some(s => s.url === c.url)) sources.push({ title: c.title || c.url, url: c.url }); }
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.url && !sources.some(s => s.url === r.url)) sources.push({ title: r.title || r.url, url: r.url });
  }
  if (!text.trim()) throw new Error('Claude returned no report');
  return { report: text, sources, engine: 'anthropic', searched: true };
}

async function geminiSearch(q: string, history: Turn[], depth: 'quick' | 'standard' | 'deep'): Promise<ResearchResult> {
  const key = process.env.GEMINI_API_KEY!; const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(280_000), headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: await instructions(depth) }] }, contents: [...history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })), { role: 'user', parts: [{ text: q }] }], tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: 16000 } }),
  });
  if (!res.ok) throw await readError(res, 'Gemini');
  const data = await res.json(); const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p: any) => p.text || '').join('');
  const sources: Source[] = (cand?.groundingMetadata?.groundingChunks || []).map((c: any) => c.web).filter((w: any) => w?.uri).map((w: any) => ({ title: w.title || w.uri, url: w.uri }));
  if (!text.trim()) throw new Error('Gemini returned no report');
  return { report: text, sources: sources.filter((s, i) => sources.findIndex(x => x.url === s.url) === i), engine: 'gemini', searched: true };
}

// ------------------------------------------------------------------ own web search (no AI web tool)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
const strip = (h: string) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function webSearch(q: string, max = 8): Promise<{ title: string; url: string; snippet: string }[]> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=au-en`, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Web search failed (${res.status})`);
  return parseDuckDuckGo(await res.text(), max);
}

/** Reads DuckDuckGo's HTML results page. */
export function parseDuckDuckGo(html: string, max = 8): { title: string; url: string; snippet: string }[] {
  const out: { title: string; url: string; snippet: string }[] = [];
  const blocks = html.split(/(?=<a[^>]*class="result__a")/).slice(1);
  for (const blk of blocks) {
    if (out.length >= max) break;
    const a = blk.match(/^<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/); if (!a) continue;
    let url = decode(a[1]); const u = url.match(/[?&]uddg=([^&]+)/); if (u) url = decodeURIComponent(u[1]); if (url.startsWith('//')) url = `https:${url}`;
    if (!/^https?:\/\//.test(url) || /duckduckgo\.com\/y\.js|ad_domain|ad_provider/.test(url) || out.some(o => o.url === url)) continue;
    const sn = blk.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(a|div|td)>/);
    out.push({ title: strip(a[2]), url, snippet: sn ? strip(sn[1]) : '' });
  }
  return out;
}

async function readPage(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(12_000), redirect: 'follow' });
    if (!r.ok || !/html|text/.test(r.headers.get('content-type') || '')) return '';
    let h = (await r.text()).slice(0, 600_000);
    h = h.replace(/<(script|style|noscript|svg|nav|footer|header|form|aside)[\s\S]*?<\/\1>/gi, ' ');
    const main = h.match(/<(article|main)[\s\S]*?<\/\1>/i)?.[0] || h;
    return strip(main.replace(/<\/(p|h\d|li|div|br)>/gi, '\n')).slice(0, 6000);
  } catch { return ''; }
}

async function ownSearch(q: string, history: Turn[], depth: 'quick' | 'standard' | 'deep', ollama: boolean): Promise<ResearchResult> {
  const query = [history.filter(h => h.role === 'user').slice(-1)[0]?.content, q].filter(Boolean).join(' ').slice(0, 300);
  const results = await webSearch(query, depth === 'deep' ? 10 : 7);
  if (!results.length) return { report: `I searched the web for "${q}" but found no results. Try different words.`, sources: [], engine: 'web', searched: true };
  const pages = await Promise.all(results.slice(0, depth === 'quick' ? 3 : 5).map(async r => ({ ...r, text: await readPage(r.url) })));
  const sources = results.map(r => ({ title: r.title, url: r.url }));
  if (ollama) {
    try {
      const ctx = pages.map((p, i) => `[${i + 1}] ${p.title} — ${p.url}\n${(p.text || p.snippet).slice(0, 3500)}`).join('\n\n');
      const report = await chat('ollama', { system: await instructions(depth), messages: [...history, { role: 'user', content: `${q}\n\nUse ONLY these web pages (cite them as [n]):\n\n${ctx}` }], maxTokens: 4000, timeoutMs: 240_000 });
      return { report, sources: pages.map(p => ({ title: p.title, url: p.url })), engine: 'ollama+web', searched: true };
    } catch {}
  }
  // No AI: findings straight from the pages (sentences that mention the question's key words)
  const words = q.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !['what', 'which', 'where', 'when', 'about', 'there', 'their', 'with', 'from', 'that', 'this', 'have', 'does', 'into', 'more'].includes(w));
  const lines: string[] = [`## Summary`, `Web results for **${q}** — collected without an AI writer, so these are extracts from the pages, not an analysis. Connect ChatGPT, Claude or Gemini in Settings → AI for a written report.`, '', '## Key findings'];
  pages.forEach((p, i) => {
    const sents = (p.text || '').split(/(?<=[.!?])\s+/).filter(s => s.length > 60 && s.length < 400 && words.some(w => s.toLowerCase().includes(w)));
    const best = sents.sort((a, b) => words.filter(w => b.toLowerCase().includes(w)).length - words.filter(w => a.toLowerCase().includes(w)).length).slice(0, 2);
    const pick = best.length ? best : p.snippet ? [p.snippet] : [];
    for (const s of pick) lines.push(`- ${s} [${i + 1}]`);
  });
  lines.push('', '## Sources', ...sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`));
  return { report: lines.join('\n'), sources, engine: 'web', searched: true };
}

/** Runs one research turn with the best available engine. */
export async function research(q: string, opts: { provider?: string | null; history?: Turn[]; depth?: 'quick' | 'standard' | 'deep' } = {}): Promise<ResearchResult> {
  const st = providerStatus(); const depth = opts.depth || 'standard'; const history = (opts.history || []).slice(-6).map(h => ({ role: h.role, content: h.content.slice(0, 4000) }));
  const order: Provider[] = opts.provider && opts.provider !== 'auto' && opts.provider !== 'none' ? [opts.provider as Provider] : ['anthropic', 'openai', 'gemini'];
  const errors: string[] = [];
  if (opts.provider !== 'none') for (const p of order) {
    if (!st[p]) continue;
    try {
      if (p === 'openai') return await openaiSearch(q, history, depth);
      if (p === 'anthropic') return await claudeSearch(q, history, depth);
      if (p === 'gemini') return await geminiSearch(q, history, depth);
      if (p === 'ollama') return await ownSearch(q, history, depth, true);
    } catch (e: any) { errors.push(String(e?.message || e).slice(0, 200)); }
  }
  const r = await ownSearch(q, history, depth, false);
  if (errors.length) r.report = `_The AI search did not work (${errors[0]}), so these are plain web results._\n\n${r.report}`;
  return r;
}
