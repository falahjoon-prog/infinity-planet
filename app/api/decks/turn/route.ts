import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { providerReady, resolveProvider, PROVIDER_LABEL, Provider } from '@/lib/providers';
import { factSheet, senderParty, ourBusiness } from '@/lib/doc-writer';
import { normalizeDeck, builtinDeck, builtinDeckEdit, DECK_HELP, Deck } from '@/lib/deck';
import { autoPhotos } from '@/lib/deck-photos';
import { aiDeck } from '@/lib/deck-writer';
import { noteRequest } from '@/lib/house-style';
export const maxDuration = 300;

/** One turn of the presentation conversation: no deck yet → make one; deck given → change it as asked. */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  const asked = String(b.message || '').trim(); if (!asked) throw new HttpError(400, 'Say what the presentation is about or what to change');
  const deck = b.deck && Array.isArray(b.deck.slides) && b.deck.slides.length ? normalizeDeck(b.deck) : null;
  // The slide the person is looking at / editing: "this slide", "here", "it" mean that slide.
  const focus = deck && Number.isInteger(b.current_slide) && b.current_slide >= 0 && b.current_slide < deck.slides.length ? Number(b.current_slide) : null;
  const message = focus === null ? asked : asked.replace(/\b(this|the current|current|the open) slide\b/gi, `slide ${focus + 1}`);
  const history = (Array.isArray(b.history) ? b.history : []).filter((h: any) => h && ['user', 'assistant'].includes(h.role) && typeof h.content === 'string').slice(-8);
  const research = typeof b.research === 'string' && b.research.trim() ? b.research.slice(0, 30000) : null;
  const project = b.project_id ? (await getSupabaseAdmin().from('projects').select('*').eq('id', b.project_id).maybeSingle()).data : null;
  const want: Provider | null = b.provider && b.provider !== 'none' ? (b.provider === 'auto' ? await resolveProvider('auto') : b.provider) : null;
  const useAi = want && providerReady(want) ? want : null;
  const notice = want && !useAi ? `${PROVIDER_LABEL[want as Provider] || want} isn't connected, so I used the built-in writer. ` : '';
  const learned = deck ? await noteRequest(message, actor.id) : null;
  const length = ['brief', 'standard', 'comprehensive'].includes(b.length) ? b.length : 'standard';
  // the chosen template travels with the deck; "use the Executive Navy template" switches it without the AI
  const { customThemes, houseDeck } = await import('@/lib/deck-theme-store'); const { themeFromRequest } = await import('@/lib/deck');
  const [custom, house] = await Promise.all([customThemes().catch(() => []), houseDeck().catch(() => null)]);
  const theme: string | undefined = deck?.theme || (typeof b.theme === 'string' && /^[a-z0-9-]{3,40}$/.test(b.theme) ? b.theme : undefined) || house?.theme_id || undefined;
  const T = <D extends Deck | null>(d: D): D => (d ? autoPhotos({ ...d, theme: d.theme || theme }) as D : d);
  if (deck) { const sw = themeFromRequest(message, custom); if (sw) return ok({ deck: { ...deck, theme: sw.id }, reply: `Switched to the “${sw.name}” template. Every slide, the PowerPoint and the PDF use it now.`, engine: 'builtin' }); }
  const structure = house?.structure || [];
  if (useAi) {
    try {
      const facts = await factSheet({ project });
      const r = await aiDeck({ provider: useAi, request: focus === null ? message : `${message}\n\n(I'm looking at slide ${focus + 1}${deck!.slides[focus].title ? ` — “${deck!.slides[focus].title}”` : ''}. If I say "this slide", "here" or "it" I mean slide ${focus + 1}. Change only what I ask; keep everything else as it is.)`, history, facts: facts.text, research, deck, length });
      return ok({ deck: T(r.deck), reply: learned ? `${r.reply}\n\n${learned}` : r.reply, engine: useAi });
    } catch (e: any) {
      if (deck) { const r = builtinDeckEdit(deck, message); return ok({ deck: T(r?.deck || null), reply: `${PROVIDER_LABEL[useAi]} didn't answer (${String(e?.message || e).slice(0, 120)}). ${r ? `Built-in: ${r.reply}` : DECK_HELP}`, engine: 'builtin' }); }
      const biz = await ourBusiness(); const me = await senderParty(actor.id);
      return ok({ deck: T(builtinDeck({ request: message, project, research, business: biz.company || biz.short, contact: me, structure })), reply: `${PROVIDER_LABEL[useAi]} didn't answer (${String(e?.message || e).slice(0, 120)}), so the built-in writer made a starting deck — gaps are marked [●].`, engine: 'builtin' });
    }
  }
  if (deck) {
    const r = builtinDeckEdit(deck, message);
    if (!r) return ok({ deck: null, reply: learned || `${notice}${DECK_HELP}`, engine: 'builtin' });
    return ok({ deck: T(r.deck), reply: `${notice}${r.reply}${learned ? `\n\n${learned}` : ''}`, engine: 'builtin' });
  }
  const biz = await ourBusiness(); const me = await senderParty(actor.id);
  const d = T(builtinDeck({ request: message, project, research, business: biz.company || biz.short, contact: me, structure }));
  return ok({ deck: d, reply: `${notice}I made a ${d.slides.length}-slide starting deck${research ? ' from the research' : project ? ` from "${project.name}"` : ''}. Gaps are marked [●] — click a slide to edit it, or tell me what to add. For a fully written deck, connect ChatGPT, Claude or Gemini in Settings → AI.`, engine: 'builtin' });
});
