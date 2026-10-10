/** Writes and changes presentations with an AI writer (JSON slides), using the business's facts and research. */
import { chat, extractJson, Provider } from './providers';
import { getBrand, aiInstructions } from './brand';
import { Deck, normalizeDeck } from './deck';
import { styleBlock } from './house-style';
import { photoCatalogue, libId, cleanPhoto } from './deck-photos';

const SIZE = { brief: '6–8 slides', standard: '10–14 slides', comprehensive: '16–22 slides' } as const;

async function system(length: keyof typeof SIZE) {
  const b = await getBrand();
  const [instr, house, structure] = await Promise.all([aiInstructions().catch(() => ''), styleBlock('marketing', b.short_name).catch(() => ''), import('./deck-learn').then(m => m.houseDeckBlock()).catch(() => '')]);
  return `You are a senior strategy consultant and presentation designer preparing decks for ${b.business_name} (${b.short_name}), an Australian property, development and investment business. Your decks are board- and investor-grade: one clear idea per slide, an action title on every content slide (a full sentence that states the takeaway), tight bullets (max 6, each under 20 words), numbers shown as stats or charts, and a logical storyline (situation → insight → proposal → numbers → risks → next steps).

Return ONLY a JSON object, no prose before or after:
{"note": "<one or two sentences for the user about what you made or changed>",
 "deck": {"title": "...", "subtitle": "...", "slides": [ SLIDE, ... ]}}
SLIDE is one of:
 {"layout":"title","title":"...","subtitle":"..."}                                  (first slide)
 {"layout":"section","title":"...","subtitle":"..."}                                (divider)
 {"layout":"bullets","title":"...","bullets":["...", "..."]}
 {"layout":"two_column","title":"...","left":{"heading":"...","bullets":[...]},"right":{"heading":"...","bullets":[...]}}
 {"layout":"stats","title":"...","stats":[{"value":"$120m","label":"Project value"}, ... up to 4]}
 {"layout":"quote","quote":"...","by":"..."}
 {"layout":"chart","title":"...","chart":{"type":"bar|line|pie|doughnut","title":"...","labels":["2024","2025"],"series":[{"name":"Revenue ($m)","values":[12,18]}]}}
 {"layout":"closing","title":"Thank you","subtitle":"contact details"}             (last slide)
Every slide may also have "notes" (speaker notes, 2–4 sentences) and "sources" (list of "Title — URL" it relies on).
"bullets" and "quote" slides may have "photo": "<photo id>" from OUR PHOTOS below — the photo shows on the right of the slide. Give a photo to roughly one content slide in three where one clearly fits the subject (location → coast/map, hotels → hotel, theme park → rides…); use each photo once; keep bullet slides with a photo to 5 bullets or fewer. When the user asks for a picture/photo on a slide, set it; when they ask to remove one, set "photo": "none". "uploaded" means the user's own picture — keep it. Never describe photos you did not set.

Rules:
- Use only facts from the FACT SHEET, the RESEARCH and the user's messages. Never invent figures, dates, names, approvals or quotes. Charts and stats only with real numbers from those sources; otherwise use bullets. Mark anything the team must fill in as [●].
- Australian English. ${SIZE[length]} unless the user asks otherwise.
\nOUR PHOTOS (id: what it shows — subjects):\n${photoCatalogue()}\n${instr ? `\nBUSINESS INSTRUCTIONS:\n${instr}` : ''}${house ? `\n\n${house}` : ''}${structure ? `\n\n${structure}` : ''}`;
}

export async function aiDeck(o: { provider: Provider; request: string; history?: { role: 'user' | 'assistant'; content: string }[]; facts: string; research?: string | null; deck?: Deck | null; length?: keyof typeof SIZE }): Promise<{ deck: Deck; reply: string }> {
  const length = o.length || 'standard';
  const ctx = `<<FACT SHEET>>\n${o.facts || '(none)'}\n<</FACT SHEET>>${o.research ? `\n\n<<RESEARCH>>\n${o.research.slice(0, 24000)}\n<</RESEARCH>>` : ''}`;
  const user = o.deck
    ? `${ctx}\n\n<<CURRENT DECK (JSON)>>\n${JSON.stringify({ ...o.deck, slides: o.deck.slides.map(({ extras, photo, ...sl }) => ({ ...sl, ...(photo ? { photo: libId(photo) || (photo === 'none' ? 'none' : 'uploaded') } : {}), ...(extras?.length ? { hand_placed_items: extras.length } : {}) })) })}\n<</CURRENT DECK>>\n\nChange the deck exactly as I ask and keep everything else the same (same slide order, wording and ids unless the change needs otherwise). Return the COMPLETE deck.\n\nMY REQUEST: ${o.request}`
    : `${ctx}\n\nCreate the presentation.\n\nMY REQUEST: ${o.request}`;
  const msgs = [...(o.history || []).slice(-6).map(h => ({ role: h.role, content: h.content.slice(0, 1500) })), { role: 'user' as const, content: user }];
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  const merged: typeof msgs = []; for (const m of msgs) { const l = merged[merged.length - 1]; if (l && l.role === m.role) l.content += `\n\n${m.content}`; else merged.push({ ...m }); }
  const sys = await system(length);
  const ask = async (extra?: string) => chat(o.provider, { system: sys, messages: extra ? [...merged, { role: 'assistant', content: '(invalid)' }, { role: 'user', content: extra }] : merged, maxTokens: 16000, timeoutMs: 280_000, reasoning: 'low' });
  let j = extractJson<any>(await ask());
  if (!j?.deck?.slides?.length) j = extractJson<any>(await ask('That was not valid. Reply with ONLY the JSON object {"note": "...", "deck": {...}} — nothing else.'));
  if (!j?.deck?.slides?.length) throw new Error('The AI did not return slides. Try again or choose another AI writer.');
  const deck = normalizeDeck({ ...(j.deck || {}), slides: (j.deck?.slides || []).map((x: any) => x && typeof x === 'object' ? { ...x, extras: undefined } : x) }, o.deck?.title || 'Presentation');
  // Photos, lines and boxes placed by hand stay on their slides (the AI never sees or changes them)
  if (o.deck) { const keep = new Map(o.deck.slides.filter(x => x.extras?.length).map(x => [x.id, x.extras])); for (const sl of deck.slides) if (keep.has(sl.id)) sl.extras = keep.get(sl.id); }
  // photos: the AI answers with ids; an uploaded picture ("uploaded") or a photo the AI left out stays as it was
  const rawSlides: any[] = j.deck?.slides || [];
  const before = new Map((o.deck?.slides || []).map(x => [x.id, x.photo]));
  deck.slides.forEach((sl, i) => { const r = rawSlides[i]?.photo; const prev = before.get(sl.id);
    if (r === 'uploaded' || (r === undefined && prev)) { if (prev) sl.photo = prev; else delete sl.photo; }
    else { const c = cleanPhoto(r); if (c && !c.startsWith('data:')) sl.photo = c; else delete sl.photo; } });
  if (o.deck && deck.slides.length < Math.min(3, o.deck.slides.length) && !/\b(remove|delete|shorter|cut)\b/i.test(o.request)) throw new Error('The AI returned an incomplete deck, so nothing was changed. Try again.');
  return { deck, reply: String(j.note || (o.deck ? 'Done — the deck is updated.' : `Here's a ${deck.slides.length}-slide deck. Tell me what to change.`)).slice(0, 800) };
}
