/**
 * English ⇄ Farsi (Persian) translation for documents, emails, chat and AI answers.
 * Uses the best AI available (a cloud key or local Ollama). There is no offline translation engine,
 * so without an AI the caller gets a clear message instead of a bad translation.
 */
import { chat, PROVIDER_LABEL, Provider, resolveProvider, providerReady } from './providers';
import { HttpError } from './http';
import { getBrand } from './brand';

export const LANGS: Record<string, string> = { en: 'English', fa: 'Farsi (Persian)' };
export const hasFarsi = (t: string) => /[؀-ۿ]/.test(t);

export async function translate(text: string, to?: string, provider?: string | null): Promise<{ text: string; to: string; from: string; engine: string }> {
  const src = String(text || '').trim().slice(0, 30_000);
  if (!src) throw new HttpError(400, 'Nothing to translate');
  const target = to && LANGS[to] ? to : hasFarsi(src) ? 'en' : 'fa';
  const p = provider && provider !== 'auto' && providerReady(provider) ? provider as Provider : await resolveProvider('auto');
  if (!p) throw new HttpError(409, 'Translation needs an AI connected — add a free Gemini key, or start Ollama on the server PC (Settings → AI → Add key).');
  const B = await getBrand();
  const out = await chat(p, {
    system: `You are a professional English–Farsi business translator for ${B.business_name}, a property and development company in Australia. Translate faithfully and naturally; keep names, company names, numbers, dates, amounts, clause numbers, email addresses and URLs exactly as written. Keep line breaks and lists. For legal text, keep the defined terms in English in brackets after the Farsi the first time they appear. Return ONLY the translation.`,
    messages: [{ role: 'user', content: `Translate into ${LANGS[target]}:\n\n${src}` }], maxTokens: 6000, timeoutMs: 120_000,
  });
  return { text: out.replace(/^```[a-z]*\n?|```\s*$/g, '').trim(), to: target, from: target === 'en' ? 'fa' : 'en', engine: PROVIDER_LABEL[p] };
}
