/**
 * Real-world time (meetings, site visits, agenda items, tasks) and app activity hours.
 * - The app estimates how long a piece of work should take (built-in rules, no AI key needed).
 * - The member says how long it took. Within reason → counted. Much longer → the app asks why.
 *   A reasonable reason → counted. Otherwise it is recorded but waits for the time approver
 *   (their manager in the company structure, the HR person, or a person chosen in Settings).
 * Weeks run Monday–Sunday in Brisbane time (UTC+10, no daylight saving).
 */
import { getSupabaseAdmin } from './supabase';
import { getSetting } from './settings';
import { getOrg, lineAbove } from './org';
import { Actor, canApprove } from './auth';

export type Kind = 'task' | 'meeting' | 'online_meeting' | 'site_visit' | 'agenda' | 'travel' | 'other';
export const KINDS: Kind[] = ['task', 'meeting', 'online_meeting', 'site_visit', 'agenda', 'travel', 'other'];
export const KIND_LABEL: Record<Kind, string> = { task: 'Task', meeting: 'Meeting (in person)', online_meeting: 'Online meeting', site_visit: 'Site visit', agenda: 'Agenda / errand', travel: 'Travel', other: 'Other' };

// ------------------------------------------------------------------ estimate
const ONLINE = /\b(zoom|teams|google meet|meet\.google|online|video|webex|skype|whatsapp call|phone call|call)\b/i;
/** First match wins: more specific work first. Minutes. */
const RULES: [RegExp, number, string][] = [
  [/\b(workshop|training|induction)\b/i, 180, 'workshop or training'],
  [/\b(site visit|site inspection|inspection|on site|onsite|walkthrough|walk-through|survey|measure up)\b/i, 150, 'site visit'],
  [/\b(draft|write|prepare)\b.*\b(contract|agreement|deed|lease|proposal|tender)\b|\b(contract|agreement|deed|lease)\b.*\b(draft|drafting)\b/i, 120, 'drafting an agreement'],
  [/\b(review|check|read)\b.*\b(contract|agreement|deed|lease|terms)\b|\b(contract|legal) review\b/i, 90, 'reviewing an agreement'],
  [/\b(presentation|deck|slides|pitch)\b/i, 120, 'preparing a presentation'],
  [/\b(design|flyer|brochure|poster|logo|banner|artwork|render|social post|post for)\b/i, 120, 'design work'],
  [/\b(report|business plan|feasibility|budget|forecast|financial model)\b/i, 120, 'writing a report'],
  [/\b(research|investigate|compare|find out)\b/i, 90, 'research'],
  [/\b(council|permit|da\b|development application|application|lodge|lodgement|submission)\b/i, 90, 'an application or submission'],
  [/\b(interview|recruit)\b/i, 60, 'an interview'],
  [/\b(meeting|meet with|catch up|catch-up|appointment|negotiat)\b/i, 60, 'a meeting'],
  [/\b(quote|quotation|estimate|pricing)\b/i, 60, 'a quote'],
  [/\b(delivery|pick up|pickup|collect|drop off|courier)\b/i, 60, 'a pick-up or delivery'],
  [/\b(bank|accountant|solicitor|lawyer|asic|ato)\b/i, 45, 'a visit or call to an adviser'],
  [/\b(minutes|agenda|notes)\b/i, 45, 'agenda or minutes'],
  [/\b(invoice|receipt|payment|pay)\b/i, 20, 'a payment or invoice'],
  [/\b(call|phone|ring)\b/i, 20, 'a phone call'],
  [/\b(email|reply|respond|send|forward)\b/i, 15, 'an email'],
  [/\b(print|scan|sign|file)\b/i, 15, 'printing, signing or filing'],
  [/\b(follow up|follow-up|remind|chase)\b/i, 15, 'a follow-up'],
];
const KIND_DEFAULT: Record<Kind, number> = { task: 45, meeting: 60, online_meeting: 45, site_visit: 150, agenda: 60, travel: 60, other: 45 };
/** Travel added to an in-person meeting (there and back) when its location is outside the office. */
const TRAVEL = 40;

export function detectKind(title: string, description?: string | null, location?: string | null, fallback: Kind = 'task'): Kind {
  const t = `${title} ${description || ''} ${location || ''}`;
  if (/\b(site visit|inspection|on site|onsite)\b/i.test(t)) return 'site_visit';
  if (fallback === 'meeting' || fallback === 'online_meeting') return ONLINE.test(t) || /https?:\/\//.test(location || '') ? 'online_meeting' : 'meeting';
  return fallback;
}

/** How long the work should reasonably take, and why. */
export function estimate(input: { kind: Kind; title: string; description?: string | null; location?: string | null; scheduled_minutes?: number | null }): { minutes: number; basis: string } {
  const text = `${input.title} ${input.description || ''}`;
  // "2 hours", "90 min", "half day" written in the item itself
  const h = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i.exec(text), m = /(\d+)\s*(?:m|min|mins|minutes)\b/i.exec(text);
  if (/\bhalf[- ]day\b/i.test(text)) return { minutes: 240, basis: 'marked as a half day' };
  if (/\b(full|whole)[- ]day\b/i.test(text)) return { minutes: 480, basis: 'marked as a full day' };
  if (h || m) { const mins = Math.round((h ? parseFloat(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0)); if (mins >= 5 && mins <= 960) return { minutes: mins, basis: 'the time written in it' }; }
  const sched = input.scheduled_minutes && input.scheduled_minutes > 0 && input.scheduled_minutes < 960 ? Math.round(input.scheduled_minutes) : null;
  if (input.kind === 'meeting') {
    const away = !!(input.location && input.location.trim() && !/\b(office|boardroom|board room|our office|eagle st|head office)\b/i.test(input.location));
    const base = sched || 60;
    return { minutes: base + (away ? TRAVEL : 10), basis: `${sched ? `the ${sched}-minute booking` : 'a usual meeting'}${away ? ` + ${TRAVEL} min travel` : ' + 10 min preparation'}` };
  }
  if (input.kind === 'online_meeting') { const base = sched || 45; return { minutes: base + 10, basis: `${sched ? `the ${sched}-minute booking` : 'a usual online meeting'} + 10 min preparation` }; }
  if (input.kind === 'site_visit') return { minutes: Math.max(sched || 0, 150), basis: 'a site visit including travel' };
  if (sched) return { minutes: sched, basis: `the ${sched}-minute booking` };
  for (const [re, mins, what] of RULES) if (re.test(text)) return { minutes: mins, basis: `usual time for ${what}` };
  return { minutes: KIND_DEFAULT[input.kind] || 45, basis: `usual time for ${KIND_LABEL[input.kind].toLowerCase()}` };
}

export type Verdict = 'ok' | 'long' | 'very_long';
/** Within 1.5× (or +20 min) is fine. Beyond 3× (or +2 h) is very long. */
export function verdict(estimated: number, reported: number): Verdict {
  if (reported <= Math.max(estimated * 1.5, estimated + 20)) return 'ok';
  if (reported <= Math.max(estimated * 3, estimated + 120)) return 'long';
  return 'very_long';
}

// ------------------------------------------------------------------ is the reason reasonable?
const REASONS: [RegExp, string][] = [
  [/traffic|travel|drive|drove|driving|parking|park\b|distance|far away|road|accident|train|bus|flight|ترافیک|رانندگی|مسیر|پارکینگ/i, 'travel'],
  [/wait|waited|waiting|late|delay|delayed|queue|held up|on hold|منتظر|انتظار|تاخیر|معطل/i, 'waiting or delays'],
  [/client|customer|buyer|tenant|investor|owner|council|supplier|contractor|builder|architect|solicitor|lawyer|bank|مشتری|خریدار|سرمایه|پیمانکار|شهرداری|بانک/i, 'other people involved'],
  [/extra|additional|more than|scope|changes?|changed|revision|revised|redo|rework|again|second|اضافه|بیشتر|تغییر|دوباره|اصلاح/i, 'extra or changed work'],
  [/issue|problem|fault|broke|broken|error|mistake|wrong|missing|not working|system|internet|computer|printer|مشکل|خراب|اشتباه|خطا/i, 'a problem'],
  [/unexpected|unplanned|urgent|emergency|sick|weather|rain|storm|flood|غیرمنتظره|فوری|اضطراری|باران/i, 'something unexpected'],
  [/complex|complicated|detailed|long document|many|several|multiple|lots of|pages|clauses|units|lots\b|پیچیده|مفصل|چندین|زیاد/i, 'more complex than usual'],
  [/meeting ran|ran over|overran|went over|discussion|negotiat|questions|explain|presented|site walk|walked|inspect|measure|جلسه|مذاکره|توضیح|بازدید/i, 'longer discussion or inspection'],
  [/document|sign|signed|signature|print|copies|forms?|paperwork|approval|مدارک|امضا|فرم/i, 'paperwork'],
];
const JUNK = /^(no reason|none|nothing|idk|i don'?t know|just because|because|busy|ok|okay|n\/?a|-+|\.+|na)$/i;

export type Judgement = { reasonable: boolean; reasons: string[]; note: string };
/** Built-in check: a real explanation with at least one concrete cause (two for very long times). English and Farsi. */
export function judgeReason(text: string, v: Verdict): Judgement {
  const t = (text || '').trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  if (!t || JUNK.test(t) || /^(.)\1{3,}$/.test(t)) return { reasonable: false, reasons: [], note: 'No explanation given.' };
  const reasons = REASONS.filter(([re]) => re.test(t)).map(([, why]) => why);
  const farsi = /[؀-ۿ]/.test(t);
  const needed = v === 'very_long' ? 2 : 1;
  const longEnough = farsi ? t.length >= 25 : words >= 5;
  const detailed = farsi ? t.length >= 80 : words >= 18;
  const reasonable = longEnough && (reasons.length >= needed || (detailed && reasons.length >= 1));
  return { reasonable, reasons, note: reasonable ? `Reason accepted: ${reasons.join(', ')}.` : reasons.length ? `Reason given (${reasons.join(', ')}) doesn't explain ${v === 'very_long' ? 'this much' : 'the'} extra time.` : 'The explanation doesn\'t say what took the extra time.' };
}

/** When an AI provider is connected, it gets a second look at reasons the built-in check found weak (it can only accept, never refuse). */
export async function aiSecondLook(input: { title: string; kind: Kind; estimated: number; reported: number; reason: string }): Promise<{ reasonable: boolean; note: string } | null> {
  try {
    const { resolveProvider, chat } = await import('./providers');
    const p = await resolveProvider((await getSetting<string>('bot_provider')) || 'auto'); if (!p) return null;
    const prompt = `A team member logged time for real-world work. Decide if their explanation reasonably justifies the extra time. Be fair but not gullible: vague answers are not reasonable; specific causes (travel, waiting, extra scope, problems, other people) are.\nWork: ${input.title} (${KIND_LABEL[input.kind]})\nExpected: about ${input.estimated} minutes\nThey reported: ${input.reported} minutes\nTheir explanation: """${input.reason.slice(0, 800)}"""\nReply with JSON only: {"reasonable": true|false, "note": "one short sentence"}`;
    const out = await chat(p, { messages: [{ role: 'user', content: prompt }], maxTokens: 300, timeoutMs: 15000, reasoning: 'minimal' });
    const j = JSON.parse(/\{[\s\S]*\}/.exec(out)?.[0] || '{}');
    return typeof j.reasonable === 'boolean' ? { reasonable: j.reasonable, note: String(j.note || '').slice(0, 200) } : null;
  } catch { return null; }
}

// ------------------------------------------------------------------ who approves
export type TimeApproval = { mode: 'manager' | 'hr' | 'person'; person_id?: string | null };
export async function getTimeApproval(): Promise<TimeApproval> {
  const v = await getSetting<TimeApproval>('time_approval').catch(() => null);
  return v && ['manager', 'hr', 'person'].includes(v.mode) ? v : { mode: 'manager' };
}
async function activePeople() {
  const db = getSupabaseAdmin();
  let r: any = await db.from('profiles').select('id,full_name,email,role,active,duties,extra_approves');
  if (r.error) r = await db.from('profiles').select('id,full_name,email,role,active');
  return ((r.data || []) as any[]).filter(p => p.active !== false);
}
/** HR: the HR position holder(s), plus anyone given the HR duty or the "approve weekly hours" right. */
async function hrPeople(people?: any[]): Promise<string[]> {
  const ps = people || await activePeople();
  const org = await getOrg().catch(() => null);
  const pos = org?.positions.find(p => p.id === 'hr' || /human resources|\bhr\b/i.test(p.title))?.holders || [];
  const tagged = ps.filter(p => (p.duties || []).includes('hr') || (p.extra_approves || []).includes('hours')).map(p => p.id);
  return [...new Set([...pos, ...tagged])].filter(id => ps.some(p => p.id === id));
}
/** Who approves this member's time, in order (the first one is named to them). Never the member themself. */
export async function approversFor(userId: string): Promise<string[]> {
  const people = await activePeople();
  const cfg = await getTimeApproval();
  const not = (ids: string[]) => ids.filter(id => id && id !== userId && people.some(p => p.id === id));
  const manager = async () => { const org = await getOrg().catch(() => null); if (!org) return []; for (const pos of lineAbove(org, userId)) { const h = not(pos.holders); if (h.length) return h; } return []; };
  const execs = not(people.filter(p => ['admin', 'director'].includes(p.role)).map(p => p.id));
  const order: string[][] = cfg.mode === 'person' ? [not([cfg.person_id || '']), await manager(), not(await hrPeople(people))]
    : cfg.mode === 'hr' ? [not(await hrPeople(people)), await manager()]
    : [await manager(), not(await hrPeople(people))];
  for (const o of order) if (o.length) return o;
  return execs;
}
/** Can this person decide a time log / sign off the week of `userId`? */
export async function canDecideTime(actor: Actor, userId: string): Promise<boolean> {
  if (actor.id === userId) return false;
  if (['admin', 'director'].includes(actor.role) || canApprove(actor, 'hours')) return true;
  return (await approversFor(userId)).includes(actor.id);
}
/** Whose hours this person can see: everyone (executives, HR, the chosen approver), the people below them in the company structure, and themself. */
export async function visibleUsers(actor: Actor): Promise<{ all: boolean; ids: string[] }> {
  const people = await activePeople();
  if (['admin', 'director'].includes(actor.role) || canApprove(actor, 'hours') || (actor.duties || []).includes('hr')) return { all: true, ids: people.map(p => p.id) };
  const cfg = await getTimeApproval();
  if (cfg.mode === 'person' && cfg.person_id === actor.id) return { all: true, ids: people.map(p => p.id) };
  if ((await hrPeople(people)).includes(actor.id)) return { all: true, ids: people.map(p => p.id) };
  const org = await getOrg().catch(() => null);
  const ids = new Set([actor.id]);
  if (org) for (const p of people) if (lineAbove(org, p.id).some(pos => pos.holders.includes(actor.id))) ids.add(p.id);
  return { all: false, ids: [...ids] };
}

// ------------------------------------------------------------------ weeks (Brisbane, UTC+10)
const OFFSET = 10 * 3600_000;
/** Monday of the week containing `d`, as YYYY-MM-DD (Brisbane). */
export function weekStart(d: Date | string = new Date()): string {
  const local = new Date(new Date(d).getTime() + OFFSET);
  const day = (local.getUTCDay() + 6) % 7; // Monday = 0
  local.setUTCDate(local.getUTCDate() - day);
  return local.toISOString().slice(0, 10);
}
/** UTC instants for Monday 00:00 → next Monday 00:00 Brisbane. */
export function weekRange(ws: string) {
  const from = new Date(new Date(`${ws}T00:00:00Z`).getTime() - OFFSET);
  return { from: from.toISOString(), to: new Date(from.getTime() + 7 * 864e5).toISOString() };
}
export const brisbaneDate = (d: Date | string = new Date()) => new Date(new Date(d).getTime() + OFFSET).toISOString().slice(0, 10);
export const isWeek = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const fmtMins = (m: number) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? `${h} h${r ? ` ${r} min` : ''}` : `${r} min`; };
export const COUNTED = ['accepted', 'justified', 'approved', 'adjusted'];

export type Signoff = { by: string; at: string; minutes: number; note?: string | null };
/** Weekly sign-offs, keyed "<user id>:<monday>". */
export async function signoffs(): Promise<Record<string, Signoff>> { return (await getSetting<Record<string, Signoff>>('time_week_signoffs').catch(() => null)) || {}; }
