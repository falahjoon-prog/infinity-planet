/**
 * AI rules — standing commands people give Infinity AI ("from now on…", "always…", "never…", "whenever…", "remember…").
 * Saved in app_settings ('ai_rules'), so no database change is needed.
 *  - "me" rules are followed only for the person who saved them.
 *  - "team" rules are followed for everyone (admins, directors and managers can set them).
 * The AI reads every rule that applies before it answers, drafts an email or writes a document.
 * Without an AI key, the built-in engine still follows the rules it can understand exactly
 * (meeting length and reminder, task reminder, task priority, who emails are written as).
 */
import { getSupabaseAdmin } from './supabase';
import { getSetting } from './settings';

export type RuleScope = 'me' | 'team';
export type RuleDefaults = { meeting_minutes?: number; meeting_reminder?: number; task_reminder?: number; task_priority?: 'low' | 'normal' | 'high' | 'urgent'; persona?: 'admin' | 'coordinator' | 'manager' | 'ceo' };
export type AiRule = { id: string; text: string; scope: RuleScope; owner_id: string; owner_name?: string | null; created_at: string; defaults?: RuleDefaults | null };

const KEY = 'ai_rules';
const MAX = 150;
const TEAM_ROLES = ['admin', 'director', 'manager'];
export const canSetTeamRules = (role: string) => TEAM_ROLES.includes(role);

async function load(): Promise<AiRule[]> {
  const v = await getSetting<{ rules?: AiRule[] }>(KEY).catch(() => null);
  return v && Array.isArray(v.rules) ? v.rules.filter(r => r && typeof r.text === 'string' && r.id) : [];
}
async function save(rules: AiRule[], actorId?: string | null) {
  const { error } = await getSupabaseAdmin().from('app_settings').upsert({ key: KEY, value: { rules: rules.slice(-MAX) }, updated_by: actorId || null, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
const rid = () => Math.random().toString(36).slice(2, 10);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();

/** Rules that apply to this person: the team's, then their own (newest last, so later rules win). */
export async function rulesFor(actorId?: string | null): Promise<AiRule[]> {
  const all = await load();
  return all.filter(r => r.scope === 'team' || (actorId && r.owner_id === actorId));
}
/** Every rule a person can see in Settings: team rules and their own. */
export async function listRules(actorId: string): Promise<AiRule[]> { const r = await rulesFor(actorId); return [...r.filter(x => x.scope === 'team'), ...r.filter(x => x.scope !== 'team')]; }

const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, 'forty five': 45, 'forty-five': 45, half: 30 };
function minutesIn(s: string): number | null {
  const m = s.match(/\b(\d+(?:\.\d+)?|an?|one|two|three|four|five|ten|fifteen|twenty|thirty|forty[- ]five|half)\s*(?:an?\s+)?(min(?:ute)?s?|hours?|hrs?|days?)\b/i);
  if (!m) return null;
  const n = /^\d/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1].toLowerCase()] ?? NaN;
  if (!Number.isFinite(n)) return null;
  if (m[1].toLowerCase() === 'half') return 30;
  return Math.round(n * (/^h/i.test(m[2]) ? 60 : /^d/i.test(m[2]) ? 1440 : 1));
}

/** The parts of a rule the built-in engine can follow exactly. */
export function defaultsFrom(text: string): RuleDefaults | null {
  const t = text.toLowerCase(); const d: RuleDefaults = {};
  if (/\b(meeting|meetings|calls?|catch[- ]?ups?)\b/.test(t)) {
    if (/\b(remind|reminder|alert|notify)\b/.test(t) && /\bbefore\b/.test(t)) { const n = minutesIn(t); if (n !== null) d.meeting_reminder = n; }
    else if (/\b(last|long|length|be|are|should be|for|duration|book)\b/.test(t) && !/\bbefore\b/.test(t)) { const n = minutesIn(t); if (n !== null && n >= 5 && n <= 600) d.meeting_minutes = n; }
  }
  if (/\b(tasks?|deadlines?|due)\b/.test(t) && /\b(remind|reminder|alert|notify)\b/.test(t) && /\bbefore\b/.test(t)) { const n = minutesIn(t); if (n !== null) d.task_reminder = n; }
  if (/\btasks?\b/.test(t) && /\b(priority|urgent)\b/.test(t) && !/\bremind/.test(t)) {
    const p = t.match(/\b(low|normal|high|urgent)\b/); if (p) d.task_priority = p[1] as RuleDefaults['task_priority'];
  }
  if (/\b(e-?mails?|replies|reply|letters?)\b/.test(t) && /\b(as|from|sign)\b/.test(t)) {
    if (/\b(ceo|chief executive|managing director|director)\b/.test(t)) d.persona = 'ceo';
    else if (/\bco-?ordinator\b/.test(t)) d.persona = 'coordinator';
    else if (/\b(project )?manager\b|\bpm\b/.test(t)) d.persona = 'manager';
    else if (/\b(admin|administrator|reception)\b/.test(t)) d.persona = 'admin';
  }
  return Object.keys(d).length ? d : null;
}

/** The latest exact defaults that apply to this person (personal rules beat team rules). */
export async function ruleDefaults(actorId?: string | null): Promise<RuleDefaults> {
  const rules = await rulesFor(actorId).catch(() => [] as AiRule[]);
  const ordered = [...rules.filter(r => r.scope === 'team'), ...rules.filter(r => r.scope === 'me')];
  return ordered.reduce<RuleDefaults>((acc, r) => ({ ...acc, ...(r.defaults || {}) }), {});
}

const TEAM_WORDS = /\b(for (?:the )?(?:whole )?(?:team|everyone|everybody|all of us|all staff|the company|the business)|team rule|company rule|everyone (?:must|should)|(?:all|the) team (?:must|should))\b/i;

/**
 * Recognises a standing command in a chat message. Returns the rule to save, or null.
 * "rule: …", "new rule …", "remember …", "from now on …", "always …", "never …", "whenever …", "every time …", "in future …".
 */
export function parseRule(message: string): { text: string; scope: RuleScope } | null {
  let q = message.trim().replace(/^\s*@?(ai|infinity|infinity ai|bot)\b[,:]?\s*/i, '').replace(/\s+/g, ' ').trim();
  if (q.length < 6 || q.length > 1000) return null;
  if (/\?\s*$/.test(q) && !/^(rule|new rule)\b/i.test(q)) return null;
  if (/^(never ?mind|nevermind|always welcome|remember me\b)/i.test(q)) return null;
  const lead = /^(?:please\s+)?(?:(?:(?:save|add|make|create|set)\s+(?:this\s+|a\s+|as\s+a\s+|as\s+)?(?:new\s+)?(?:team\s+|company\s+|my\s+|standing\s+)?(?:rule|instruction|command)s?)|(?:(?:new|my|team|company|standing)\s+(?:rule|instruction|command))|rule|remember(?:\s+(?:this|that|to))?|(?:from now on|going forward|in (?:the )?future|from today)|(?:always|never|whenever|every ?time|each time|any ?time|don'?t ever|do not ever|make sure (?:you )?(?:always|never)))\b\s*[:,\-–]?\s*/i;
  const m = q.match(lead);
  if (!m) return null;
  // "always…", "never…", "whenever…", "from now on…" read best as they were said; "rule: …" and "remember …" keep what follows.
  const asSaid = /^(always|never|whenever|every ?time|each time|any ?time|don'?t ever|do not ever|make sure|from now on|going forward|in (?:the )?future|from today)/i.test(m[0]);
  let body = asSaid ? q.replace(/^please\s+/i, '') : q.slice(m[0].length).trim();
  if (/^remember\s+to\b/i.test(m[0])) body = `Always ${body}`;
  body = body.replace(/^(?:that|this)\s*[:,]?\s+/i, '').trim();
  if (!body || body.split(' ').length < 2) return null;
  const scope: RuleScope = TEAM_WORDS.test(q) ? 'team' : 'me';
  body = body.replace(TEAM_WORDS, ' ').replace(/\s{2,}/g, ' ').replace(/^[,:\-–\s]+|[,\s]+$/g, '').trim();
  if (!body) return null;
  return { text: cap(body.replace(/[.!]+$/, '')) + '.', scope };
}

/** "forget rule 2", "delete the rule about meetings", "stop following the rule about Kind regards". */
export function parseForget(message: string): string | null {
  const q = message.trim().replace(/^\s*@?(ai|infinity|infinity ai|bot)\b[,:]?\s*/i, '').trim();
  const m = q.match(/^(?:please\s+)?(?:forget|delete|remove|drop|cancel|stop following|turn off)\s+(?:my\s+|the\s+|our\s+|team\s+|that\s+)?(?:standing\s+)?(?:rule|instruction|command)s?\s*(?:#|number|no\.?)?\s*(.*)$/i);
  return m ? (m[1] || '').replace(/^(about|on|for|that says|saying)\s+/i, '').replace(/[."”]+$/, '').trim() || 'last' : null;
}
export const isListRules = (message: string) => /^(?:please\s+)?(?:what are|what're|show(?: me)?|list|see|view)\s+(?:all\s+)?(?:my\s+|the\s+|our\s+|team\s+|your\s+)?(?:ai\s+)?(?:standing\s+)?(?:rules|instructions|commands)\b|^(?:my|our|team|ai)\s+rules\??$|^rules\??$/i.test(message.trim().replace(/^\s*@?(ai|infinity|infinity ai|bot)\b[,:]?\s*/i, ''));

export async function addRule(actor: { id: string; role: string; full_name?: string | null; email?: string | null }, text: string, scope: RuleScope = 'me'): Promise<{ rule: AiRule; duplicate: boolean }> {
  const clean = cap(String(text || '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '')).slice(0, 600);
  if (clean.length < 3) throw new Error('Write the rule in a few words');
  if (scope === 'team' && !canSetTeamRules(actor.role)) throw new Error('Only admins, directors and managers can set rules for the whole team. I can save it as your own rule instead.');
  const all = await load();
  const same = all.find(r => squash(r.text) === squash(clean) && (r.scope === 'team' || r.owner_id === actor.id));
  if (same) return { rule: same, duplicate: true };
  const rule: AiRule = { id: rid(), text: clean + '.', scope, owner_id: actor.id, owner_name: actor.full_name || actor.email || null, created_at: new Date().toISOString(), defaults: defaultsFrom(clean) };
  all.push(rule); await save(all, actor.id);
  return { rule, duplicate: false };
}

export async function updateRule(actor: { id: string; role: string }, id: string, patch: { text?: string; scope?: RuleScope }): Promise<AiRule> {
  const all = await load(); const r = all.find(x => x.id === id);
  if (!r) throw new Error('Rule not found');
  if (!mayChange(actor, r)) throw new Error('Only the person who saved this rule, or an admin, can change it');
  if (patch.scope === 'team' && !canSetTeamRules(actor.role)) throw new Error('Only admins, directors and managers can set rules for the whole team');
  if (typeof patch.text === 'string' && patch.text.trim().length >= 3) { r.text = cap(patch.text.replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '')).slice(0, 600) + '.'; r.defaults = defaultsFrom(r.text); }
  if (patch.scope === 'me' || patch.scope === 'team') r.scope = patch.scope;
  await save(all, actor.id); return r;
}

const mayChange = (actor: { id: string; role: string }, r: AiRule) => r.owner_id === actor.id || actor.role === 'admin' || (r.scope === 'team' && actor.role === 'director');

export async function removeRule(actor: { id: string; role: string }, id: string): Promise<AiRule> {
  const all = await load(); const r = all.find(x => x.id === id);
  if (!r) throw new Error('Rule not found');
  if (!mayChange(actor, r)) throw new Error('Only the person who saved this rule, or an admin, can remove it');
  await save(all.filter(x => x.id !== id), actor.id); return r;
}

/** Finds the rule someone means: "2" (its number in the list), "last", or words from it. */
export async function findRule(actorId: string, q: string): Promise<AiRule | null> {
  const mine = await listRules(actorId);
  if (!mine.length) return null;
  const s = q.trim().toLowerCase();
  if (!s || s === 'last' || s === 'that' || s === 'it') return [...mine].reverse().find(r => r.owner_id === actorId) || mine[mine.length - 1];
  const n = s.match(/^#?(\d{1,3})$/); if (n) return mine[Number(n[1]) - 1] || null;
  const words = squash(s).split(' ').filter(w => w.length > 2 && !['the', 'about', 'rule', 'that', 'with'].includes(w));
  if (!words.length) return null;
  const scored = mine.map(r => ({ r, n: words.filter(w => squash(r.text).includes(w)).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  return scored[0]?.r || null;
}

export function formatRules(rules: AiRule[], actorId: string): string {
  if (!rules.length) return 'You have no rules yet. Tell me one, for example: **"from now on, remind me 15 minutes before meetings"**, **"always write my emails as project manager"** or **"rule for the team: always cc Ramin on Harbourline emails"**.';
  return `**Rules I follow for you** (Settings → AI rules):\n${rules.map((r, i) => `${i + 1}. ${r.text}${r.scope === 'team' ? ' _(whole team)_' : ''}${r.scope === 'team' && r.owner_id !== actorId && r.owner_name ? ` — set by ${r.owner_name}` : ''}`).join('\n')}\n\nSay **"forget rule 2"** to remove one.`;
}

/** The block every AI prompt gets, so the rules are followed in chat, emails, documents and reviews. */
export async function rulesBlock(actorId?: string | null): Promise<string> {
  const rules = await rulesFor(actorId).catch(() => [] as AiRule[]);
  if (!rules.length) return '';
  const team = rules.filter(r => r.scope === 'team'); const mine = rules.filter(r => r.scope === 'me');
  return `STANDING RULES — the team told you to follow these every time. Follow them unless the person's current message clearly asks for something different this time; if two rules clash, the person's own rule wins over a team rule, and a newer rule wins over an older one. When a rule says to do something whenever a situation happens and this message is that situation, do it (return the action).
${team.length ? `Team rules:\n${team.map(r => `- ${r.text}`).join('\n')}\n` : ''}${mine.length ? `This person's own rules:\n${mine.map(r => `- ${r.text}`).join('\n')}` : ''}`.trim();
}

/**
 * Shortcut rules — "Whenever I say morning, show what needs my attention today."
 * When the message is (or starts with) the trigger words, returns the command to run instead.
 * Used by the built-in engine; with an AI key the AI reads the rule itself.
 */
export async function shortcutFor(message: string, actorId: string): Promise<string | null> {
  const msg = squash(message.replace(/^\s*@?(ai|infinity|infinity ai|bot)\b[,:]?\s*/i, ''));
  if (!msg) return null;
  for (const r of [...(await rulesFor(actorId).catch(() => [] as AiRule[]))].reverse()) {
    const m = r.text.match(/^(?:whenever|every ?time|each time|any ?time|when|if)\s+(?:i|we|someone|anyone|people)\s+(?:say|says|type|types|write|writes|send|sends|ask(?:s)?(?:\s+for)?)\s+["“'‘]?(.+?)["”'’]?\s*(?:,|:|;|\bthen\b|\byou should\b|\bplease\b)\s*(?:then\s+|you should\s+|please\s+)?(.+?)\.?$/i);
    if (!m) continue;
    const trig = squash(m[1]); if (!trig) continue;
    if (msg === trig || msg.startsWith(trig + ' ')) { const rest = msg.slice(trig.length).trim(); return rest ? `${m[2].trim()} ${rest}` : m[2].trim(); }
  }
  return null;
}
