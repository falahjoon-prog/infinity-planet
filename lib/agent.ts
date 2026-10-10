/**
 * Infinity AI bot — talks to the team and takes actions.
 *
 * Two engines:
 *  - rules (always available, no AI key): understands plain commands such as
 *    "remind me tomorrow 3pm to call John", "task: send the MOU to Harbourline for @max due friday",
 *    "schedule a meeting with the investor on 14/10 at 10am", "note: …", "draft an MOU for Fortitude Valley",
 *    "what are my tasks?", and answers other questions from the knowledge base with citations.
 *  - AI (when a provider is configured): the model reads the request, the team list, projects and
 *    retrieved knowledge, replies in plain English and returns structured actions.
 * Either way the same validated action executor runs, with the requesting user's permissions.
 */
import { getSupabaseAdmin } from './supabase';
import { displayName } from './people';
import { writeAudit } from './audit';
import { chat, extractJson, isProvider, providerStatus, probeOllama, Provider, PROVIDER_LABEL, ChatMessage } from './providers';

let ollamaCheck: { at: number; ok: boolean } | null = null;
async function ollamaUp() {
  if (ollamaCheck && Date.now() - ollamaCheck.at < 60_000) return ollamaCheck.ok;
  const r = await probeOllama().catch(() => ({ ok: false }));
  ollamaCheck = { at: Date.now(), ok: !!r.ok };
  return ollamaCheck.ok;
}
import { retrieveChunks, formatSources, Source } from './retrieval';
import { parseWhen, stripWhen, formatWhen } from './when';
import { getBrand, aiInstructions, AI_NAME, SEARCH_NAME } from './brand';
import { getSetting } from './settings';
import { generateFromTemplate } from './generate';
import { brandBookExcerpt } from './brand-book';
import type { Actor } from './auth';
import { guideFor, GUIDE_TEXT } from './app-guide';
import { LAYOUTS, LayoutId, defaultDesign, contentFromProject } from './designer';
import { getBrandStyle } from './brand';
import { runContractReview } from './legal/review';
import { proposeBusinessDetails, bestOf } from './business-extract';
import { applyBusinessDetails } from './business-apply';
import { templateFromDocument, updateTemplateFromDocuments, guessCategory } from './template-learn';
import { composeEmail } from './email-compose';
import { cleanAddressList } from './google';
import { liveDriveSearch, kickDriveSync, driveHint, googleConnected } from './drive-live';
import { parseRule, parseForget, isListRules, addRule, removeRule, findRule, listRules, formatRules, ruleDefaults, shortcutFor, RuleScope } from './ai-rules';

/** Knowledge search that falls back to searching Google Drive directly when nothing is found. */
async function retrieveWithDrive(q: string, opts: { projectId?: string | null; limit: number; prefix: string }) {
  let sources = await retrieveChunks(q, opts).catch(() => [] as Source[]);
  let drive: { id: string; name: string }[] = [];
  if (sources.length < 2) {
    drive = await liveDriveSearch(q).catch(() => []);
    if (drive.length) { const more = await retrieveChunks(q, { ...opts, projectId: null, documentIds: drive.map(d => d.id) }).catch(() => [] as Source[]); sources = [...sources, ...more.filter(m => !sources.some(x => x.chunk_id === m.chunk_id))].slice(0, opts.limit).map((x, i) => ({ ...x, citation: `[${opts.prefix}-${i + 1}]` })); }
  }
  return { sources, drive };
}

const BNE = 10 * 3600_000;
function dayBounds(now: Date, offsetDays = 0) { const local = new Date(now.getTime() + BNE); local.setUTCHours(0, 0, 0, 0); const start = new Date(local.getTime() - BNE + offsetDays * 86400_000); return { start, end: new Date(start.getTime() + 86400_000) }; }
/** "What needs my attention today?" — overdue and due work, meetings, reminders, approvals, email and Drive. */
async function buildBriefing(ctx: Ctx): Promise<string> {
  const db = getSupabaseAdmin();
  const { start, end } = dayBounds(ctx.now); const tomorrowEnd = new Date(end.getTime() + 86400_000);
  const me = ctx.actor.id; const exec = ['admin', 'director'].includes(ctx.actor.role);
  const [overdue, dueSoon, teamOverdue, meetings, rems, approvals, drafts, pending] = await Promise.all([
    db.from('tasks').select('title,due_at,priority, project:projects(name)').eq('assigned_to', me).neq('status', 'done').lt('due_at', ctx.now.toISOString()).order('due_at').limit(8),
    db.from('tasks').select('title,due_at,priority, project:projects(name)').eq('assigned_to', me).neq('status', 'done').gte('due_at', ctx.now.toISOString()).lt('due_at', tomorrowEnd.toISOString()).order('due_at').limit(8),
    exec ? db.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'done').lt('due_at', ctx.now.toISOString()) : Promise.resolve({ count: 0 } as any),
    db.from('calendar_events').select('title,starts_at,location').gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at').limit(8),
    db.from('reminders').select('title,remind_at').eq('status', 'pending').or(`recipient_id.eq.${me},recipient_id.is.null`).gte('remind_at', start.toISOString()).lt('remind_at', end.toISOString()).order('remind_at').limit(8),
    db.from('approvals').select('id,entity_type,reviewer_id').eq('status', 'pending').limit(50),
    db.from('email_drafts').select('id', { count: 'exact', head: true }).eq('created_by', ctx.actor.id).in('status', ['draft', 'approved', 'awaiting_approval', 'changes_requested', 'failed']).is('scheduled_at', null),
    exec ? db.from('profiles').select('id', { count: 'exact', head: true }).eq('active', false) : Promise.resolve({ count: 0 } as any),
  ]);
  const t = (x: any) => `• ${x.title}${x.due_at ? ` — ${formatWhen(new Date(x.due_at))}` : ''}${x.priority === 'urgent' || x.priority === 'high' ? ` (${x.priority})` : ''}${x.project?.name ? ` · ${x.project.name}` : ''}`;
  const out: string[] = [`**Your day — ${ctx.now.toLocaleDateString('en-AU', { timeZone: 'Australia/Brisbane', weekday: 'long', day: 'numeric', month: 'long' })}**`];
  if (overdue.data?.length) out.push(`\n🔴 **Overdue (${overdue.data.length})**\n${overdue.data.map(t).join('\n')}`);
  if (dueSoon.data?.length) out.push(`\n🟠 **Due today / tomorrow**\n${dueSoon.data.map(t).join('\n')}`);
  if (meetings.data?.length) out.push(`\n📅 **Meetings today**\n${meetings.data.map((m: any) => `• ${new Date(m.starts_at).toLocaleTimeString('en-AU', { timeZone: 'Australia/Brisbane', hour: 'numeric', minute: '2-digit' })} ${m.title}${m.location ? ` · ${m.location}` : ''}`).join('\n')}`);
  if (rems.data?.length) out.push(`\n⏰ **Reminders today**\n${rems.data.map((r: any) => `• ${new Date(r.remind_at).toLocaleTimeString('en-AU', { timeZone: 'Australia/Brisbane', hour: 'numeric', minute: '2-digit' })} ${r.title}`).join('\n')}`);
  const myApprovals = (approvals.data || []).filter((a: any) => a.reviewer_id === me || (!a.reviewer_id && (exec || ['manager', 'legal', 'marketing'].includes(ctx.actor.role))));
  const extra: string[] = [];
  if (myApprovals.length) extra.push(`${myApprovals.length} approval${myApprovals.length > 1 ? 's' : ''} waiting (Approvals)`);
  if (drafts.count) extra.push(`${drafts.count} email draft${drafts.count > 1 ? 's' : ''} not sent yet (Gmail → Drafts)`);
  if (exec && teamOverdue.count) extra.push(`${teamOverdue.count} overdue task${teamOverdue.count > 1 ? 's' : ''} across the team`);
  if (exec && pending.count) extra.push(`${pending.count} inactive or pending team account${pending.count > 1 ? 's' : ''} (Settings → Team)`);
  if (await googleConnected().catch(() => false)) {
    try {
      const { gmailApi } = await import('./email-history');
      const { gmail } = await gmailApi(ctx.actor.id);
      const l = await gmail.users.messages.list({ userId: 'me', q: 'is:unread in:inbox newer_than:3d', maxResults: 25 });
      const n = l.data.messages?.length || 0;
      if (n) {
        const top = await Promise.all((l.data.messages || []).slice(0, 3).map(m => gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'metadata', metadataHeaders: ['From', 'Subject'] }).then(r => r.data).catch(() => null)));
        out.push(`\n📧 **Unread email (${n}${n === 25 ? '+' : ''} in 3 days)**\n${top.filter(Boolean).map((m: any) => { const h = m.payload?.headers || []; const g = (k: string) => h.find((x: any) => x.name === k)?.value || ''; return `• ${g('From').replace(/<.*>/, '').trim()} — ${g('Subject') || '(no subject)'}`; }).join('\n')}\nSay "reply to the latest email from <name>" and I'll draft it.`);
      }
    } catch {}
  }
  if (extra.length) out.push(`\n✅ **Also waiting**\n${extra.map(x => `• ${x}`).join('\n')}`);
  if (out.length === 1) out.push('\nNothing overdue, no meetings or reminders today. 🎉');
  return out.join('\n');
}

async function resolveRecipient(who: string, ctx: Ctx): Promise<{ email: string; name: string } | null> {
  const w = String(who || '').trim().replace(/^@/, '');
  const em = w.match(/[^\s<>,;"]+@[^\s<>,;"]+\.[a-z]{2,}/i)?.[0];
  if (em) return { email: em.toLowerCase(), name: w.replace(em, '').replace(/[<>"]/g, '').trim() };
  const id = resolvePerson(w, ctx);
  const mem = id && id !== 'everyone' ? ctx.members.find(m => m.id === id) : null;
  if (mem?.email) return { email: mem.email, name: mem.full_name || mem.email };
  const db = getSupabaseAdmin();
  const { data: c } = await db.from('contacts').select('full_name,email, counterparty:counterparties(name)').not('email', 'is', null).ilike('full_name', `%${w}%`).limit(2);
  if (c?.length === 1) return { email: c[0].email, name: c[0].full_name };
  const { data: cp } = await db.from('counterparties').select('id,name').ilike('name', `%${w}%`).limit(1);
  if (cp?.[0]) { const { data: cc } = await db.from('contacts').select('full_name,email').eq('counterparty_id', cp[0].id).not('email', 'is', null).limit(1); if (cc?.[0]) return { email: cc[0].email, name: cc[0].full_name }; }
  return null;
}
const PERSONA_WORDS: [RegExp, string][] = [[/\b(ceo|chief executive|managing director|director)\b/i, 'ceo'], [/\b(project )?manager\b|\bpm\b/i, 'manager'], [/\b(project )?co-?ordinator\b/i, 'coordinator'], [/\b(admin|administrator|administration|reception)\b/i, 'admin']];
export function personaFrom(text: string): { persona?: string; rest: string } {
  const m = text.match(/\b(?:as|from)\s+(?:the\s+)?(?:project\s+)?(ceo|chief executive(?: officer)?|managing director|manager|project manager|pm|co-?ordinator|project co-?ordinator|admin|administrator|administration)\b(?:\s+of\s+the\s+project)?/i);
  if (!m) return { rest: text };
  return { persona: PERSONA_WORDS.find(([re]) => re.test(m[1]))?.[1], rest: text.replace(m[0], ' ').replace(/\s{2,}/g, ' ').trim() };
}

export type AgentAction =
  | { type: 'create_task'; title: string; description?: string; assignee?: string; due?: string; priority?: string; project?: string; remind_minutes_before?: number }
  | { type: 'set_reminder'; title: string; when: string; for?: string; project?: string }
  | { type: 'create_meeting'; title: string; starts_at: string; duration_minutes?: number; location?: string; attendees?: string[]; reminder_minutes?: number; project?: string; description?: string }
  | { type: 'add_note'; title?: string; body: string; project?: string; important?: boolean }
  | { type: 'generate_document'; template: string; project?: string; counterparty?: string; instructions?: string }
  | { type: 'list_tasks'; who?: string; project?: string }
  | { type: 'create_design'; layout?: string; project?: string; headline?: string; title?: string }
  | { type: 'review_contract'; attachment?: string; role?: string; project?: string }
  | { type: 'autofill_business' }
  | { type: 'template_from_document'; document: string; name?: string }
  | { type: 'update_template'; template: string; documents?: string[] }
  | { type: 'draft_email'; to: string; subject?: string; intent?: string; project?: string; persona?: string; tone?: string }
  | { type: 'reply_email'; from: string; intent?: string; persona?: string; tone?: string }
  | { type: 'read_email'; from: string }
  | { type: 'briefing' }
  | { type: 'open_page'; page: string }
  | { type: 'open_item'; kind: 'project' | 'task' | 'deal' | 'document'; name: string }
  | { type: 'list_approvals'; scope?: 'mine' | 'all' }
  | { type: 'save_rule'; text: string; scope?: RuleScope }
  | { type: 'list_rules' }
  | { type: 'forget_rule'; rule: string }
  | { type: 'decide_approval'; decision: 'approved' | 'rejected' | 'changes_requested'; title?: string; note?: string }
  | { type: 'update_task'; title: string; status: 'done' | 'in_progress' | 'todo' | 'blocked' };

export type ActionResult = { type: string; ok: boolean; summary: string; href?: string; id?: string; error?: string; navigate?: boolean };
export type AgentReply = { reply: string; actions: ActionResult[]; engine: string; citations?: any[]; note?: string };

type Member = { id: string; full_name: string | null; email: string | null; role: string };
type Project = { id: string; name: string };
export type Attachment = { name: string; text: string; document_id?: string | null };
type Ctx = { actor: Actor; members: Member[]; projects: Project[]; projectId: string | null; now: Date; canWrite: boolean; attachments: Attachment[]; provider?: Provider | null };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9@. ]+/g, ' ').replace(/\s+/g, ' ').trim();

async function loadCtx(actor: Actor, projectId: string | null): Promise<Ctx> {
  // (attachments are added by runAgent)
  const db = getSupabaseAdmin();
  const [m, p] = await Promise.all([
    db.from('profiles').select('id,full_name,email,role,active').order('full_name'),
    db.from('projects').select('id,name').neq('status', 'archived').order('updated_at', { ascending: false }).limit(200),
  ]);
  return { actor, members: (m.data || []).filter((x: any) => x.active !== false), projects: p.data || [], projectId, now: new Date(), canWrite: actor.role !== 'viewer', attachments: [] };
}

/** "me", "@max", "Max", "max@rhc.test", "Max Member" → member id. "everyone"/"team"/"all" → 'everyone'. */
export function resolvePerson(who: string | undefined | null, ctx: Pick<Ctx, 'actor' | 'members'>): string | 'everyone' | null {
  if (!who) return null;
  const w = norm(String(who)).replace(/^@/, '');
  if (!w) return null;
  if (/^(me|myself|i)$/.test(w)) return ctx.actor.id;
  if (/^(everyone|everybody|all|team|the team|us|all of us)$/.test(w)) return 'everyone';
  const byEmail = ctx.members.find(x => x.email && norm(x.email) === w);
  if (byEmail) return byEmail.id;
  const full = ctx.members.find(x => x.full_name && norm(x.full_name) === w);
  if (full) return full.id;
  const first = ctx.members.filter(x => (x.full_name && norm(x.full_name).split(' ')[0] === w) || (x.email && norm(x.email).split('@')[0] === w));
  if (first.length === 1) return first[0].id;
  const partial = ctx.members.filter(x => x.full_name && norm(x.full_name).includes(w));
  return partial.length === 1 ? partial[0].id : null;
}
const nameOf = (id: string | null, ctx: Ctx) => id === ctx.actor.id ? 'you' : ctx.members.find(m => m.id === id)?.full_name || ctx.members.find(m => m.id === id)?.email || 'them';

export function resolveProject(name: string | undefined | null, ctx: Pick<Ctx, 'projects'>): Project | null {
  if (!name) return null;
  const w = norm(name);
  if (!w) return null;
  return ctx.projects.find(p => norm(p.name) === w) || ctx.projects.filter(p => norm(p.name).includes(w) || w.includes(norm(p.name))).sort((a, b) => b.name.length - a.name.length)[0] || null;
}
/** Finds a project mentioned anywhere in free text (longest name wins). */
function projectInText(text: string, ctx: Ctx): Project | null {
  const t = ` ${norm(text)} `;
  return ctx.projects.filter(p => p.name.length >= 3 && t.includes(` ${norm(p.name)} `)).sort((a, b) => b.name.length - a.name.length)[0] || null;
}
function toDate(v: string | undefined | null, ctx: Ctx): Date | null {
  if (!v) return null;
  const iso = new Date(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(v) && !isNaN(iso.getTime())) return /T|\d:\d/.test(v) ? iso : new Date(`${v.slice(0, 10)}T09:00:00+10:00`);
  return parseWhen(v, ctx.now)?.at || null;
}

// ------------------------------------------------------------------ lookups for documents & templates
async function findDocument(q: string): Promise<{ id: string; name: string } | null> {
  const db = getSupabaseAdmin();
  const words = String(q || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['the', 'our', 'file', 'document', 'from', 'drive', 'google'].includes(w));
  if (!words.length) return null;
  let qb = db.from('documents').select('id,name').not('content_text', 'is', null).order('updated_at', { ascending: false }).limit(5);
  for (const w of words.slice(0, 4)) qb = qb.ilike('name', `%${w}%`);
  const { data } = await qb;
  return data?.[0] || null;
}
async function findTemplate(q: string): Promise<any | null> {
  const { data } = await getSupabaseAdmin().from('document_templates').select('id,name,category,body,version').neq('status', 'archived').neq('kind', 'marketing');
  const want = String(q || '').toLowerCase();
  const alias = TEMPLATE_WORDS.find(([re]) => re.test(want))?.[1]?.toLowerCase();
  return (data || []).find(t => t.name.toLowerCase() === want) || (alias && (data || []).find(t => t.name.toLowerCase().startsWith(alias))) || (data || []).find(t => t.name.toLowerCase().includes(want) || want.includes(t.category)) || null;
}
async function documentsLike(category: string, name: string) {
  const { data } = await getSupabaseAdmin().from('documents').select('id,name,content_text').not('content_text', 'is', null).order('updated_at', { ascending: false }).limit(300);
  return (data || []).filter(d => guessCategory(String(d.content_text || ''), d.name).category === category).slice(0, 3).map(d => ({ id: d.id, name: d.name }));
}

// ------------------------------------------------------------------ executor
export async function executeActions(actions: AgentAction[], ctx: Ctx): Promise<ActionResult[]> {
  const db = getSupabaseAdmin();
  const out: ActionResult[] = [];
  const rd = actions.some(a => ['create_task', 'create_meeting', 'draft_email', 'reply_email'].includes(a.type)) ? await ruleDefaults(ctx.actor.id).catch(() => ({} as Awaited<ReturnType<typeof ruleDefaults>>)) : {};
  for (const a of actions.slice(0, 8)) {
    try {
      if (a.type === 'save_rule') {
        const scope: RuleScope = a.scope === 'team' ? 'team' : 'me';
        const { rule, duplicate } = await addRule(ctx.actor, a.text, scope);
        out.push({ type: a.type, ok: true, id: rule.id, href: '/system?tab=airules', summary: duplicate ? `I already have this rule and I'm following it: “${rule.text}”` : `Saved${rule.scope === 'team' ? ' for the whole team' : ''} — I'll follow this from now on:\n> ${rule.text}\n\nSee or change your rules in Settings → AI rules, or say “show my rules”.` });
        continue;
      }
      if (a.type === 'list_rules') { out.push({ type: a.type, ok: true, href: '/system?tab=airules', summary: formatRules(await listRules(ctx.actor.id), ctx.actor.id) }); continue; }
      if (a.type === 'forget_rule') {
        const r = await findRule(ctx.actor.id, a.rule || 'last');
        if (!r) throw new Error(`I couldn't find a rule matching “${a.rule}”. Say “show my rules” to see them with numbers`);
        await removeRule(ctx.actor, r.id);
        out.push({ type: a.type, ok: true, href: '/system?tab=airules', summary: `Removed the rule “${r.text}”. I won't follow it any more.` });
        continue;
      }
      if (!['list_tasks', 'briefing', 'read_email', 'open_page', 'open_item', 'list_approvals', 'decide_approval'].includes(a.type) && !ctx.canWrite) { out.push({ type: a.type, ok: false, summary: 'Viewers cannot create or change records', error: 'read-only role' }); continue; }
      const project = resolveProject((a as any).project, ctx) || (ctx.projectId ? ctx.projects.find(p => p.id === ctx.projectId) || null : null);
      if (a.type === 'create_task') {
        const title = String(a.title || '').trim().slice(0, 300); if (!title) throw new Error('A task needs a title');
        const who = a.assignee ? resolvePerson(a.assignee, ctx) : ctx.actor.id;
        if (a.assignee && (!who || who === 'everyone')) throw new Error(`I couldn't find a team member called "${a.assignee}"`);
        const due = toDate(a.due, ctx);
        const priority = ['low', 'normal', 'high', 'urgent'].includes(String(a.priority)) ? a.priority : rd.task_priority || 'normal';
        const { data, error } = await db.from('tasks').insert({ title, description: a.description || null, project_id: project?.id || null, assigned_to: who, priority, status: 'todo', due_at: due?.toISOString() || null, created_by: ctx.actor.id }).select('id,title').single();
        if (error) throw error;
        if (due) {
          const before = a.remind_minutes_before !== undefined && Number.isFinite(Number(a.remind_minutes_before)) ? Number(a.remind_minutes_before) : rd.task_reminder ?? 60;
          const at = new Date(Math.max(Date.now() + 60_000, due.getTime() - before * 60_000));
          await db.from('reminders').insert({ title: `Task: ${title}`, remind_at: at.toISOString(), task_id: data.id, project_id: project?.id || null, recipient_id: who });
        }
        await writeAudit({ actorId: ctx.actor.id, action: 'task.created', entityType: 'task', entityId: data.id, metadata: { title, via: 'ai_bot', assigned_to: who } });
        out.push({ type: a.type, ok: true, id: data.id, href: `/tasks?open=${data.id}`, summary: `Task created: “${title}” for ${nameOf(who as string, ctx)}${due ? `, due ${formatWhen(due)}` : ''}${project ? ` · ${project.name}` : ''}` });
      } else if (a.type === 'set_reminder') {
        const at = toDate(a.when, ctx); if (!at) throw new Error('I need a time for the reminder, e.g. "tomorrow 9am" or "in 2 hours"');
        if (at.getTime() < Date.now() - 60_000) throw new Error(`That time (${formatWhen(at)}) has already passed`);
        const who = a.for ? resolvePerson(a.for, ctx) : ctx.actor.id;
        if (a.for && !who) throw new Error(`I couldn't find a team member called "${a.for}"`);
        const title = String(a.title || 'Reminder').trim().slice(0, 300);
        const { data, error } = await db.from('reminders').insert({ title, remind_at: at.toISOString(), project_id: project?.id || null, recipient_id: who === 'everyone' ? null : who }).select('id').single();
        if (error) throw error;
        await writeAudit({ actorId: ctx.actor.id, action: 'reminder.created', entityType: 'reminder', entityId: data.id, metadata: { title, via: 'ai_bot' } });
        out.push({ type: a.type, ok: true, id: data.id, href: '/calendar', summary: `Reminder set for ${who === 'everyone' ? 'everyone' : nameOf(who as string, ctx)}: “${title}” — ${formatWhen(at)}` });
      } else if (a.type === 'create_meeting') {
        const start = toDate(a.starts_at, ctx); if (!start) throw new Error('I need a date and time for the meeting');
        const title = String(a.title || 'Meeting').trim().slice(0, 300);
        const end = new Date(start.getTime() + Math.min(Math.max(Number(a.duration_minutes) || rd.meeting_minutes || 60, 5), 24 * 60) * 60_000);
        const attendees = (a.attendees || []).map(x => { const id = resolvePerson(x, ctx); const m = id && id !== 'everyone' ? ctx.members.find(y => y.id === id) : null; return m?.email || (/@/.test(x) ? x : null); }).filter(Boolean) as string[];
        const reminder = a.reminder_minutes === undefined || a.reminder_minutes === null ? rd.meeting_reminder ?? 30 : Number(a.reminder_minutes);
        const { data, error } = await db.from('calendar_events').insert({ title, starts_at: start.toISOString(), ends_at: end.toISOString(), location: a.location || null, description: a.description || null, project_id: project?.id || null, attendees, reminder_minutes: Number.isFinite(reminder) ? reminder : 30, provider: 'internal', created_by: ctx.actor.id }).select('id').single();
        if (error) throw error;
        if (Number.isFinite(reminder)) await db.from('reminders').insert({ title: `Meeting: ${title}`, remind_at: new Date(start.getTime() - reminder * 60_000).toISOString(), project_id: project?.id || null, event_id: data.id, recipient_id: null });
        await writeAudit({ actorId: ctx.actor.id, action: 'event.created', entityType: 'calendar_event', entityId: data.id, metadata: { title, via: 'ai_bot' } });
        out.push({ type: a.type, ok: true, id: data.id, href: '/calendar', summary: `Meeting booked: “${title}” — ${formatWhen(start)} to ${end.toLocaleTimeString('en-AU', { timeZone: 'Australia/Brisbane', hour: 'numeric', minute: '2-digit' })}${attendees.length ? ` with ${attendees.join(', ')}` : ''}${a.location ? ` at ${a.location}` : ''} (reminder ${reminder} min before)` });
      } else if (a.type === 'add_note') {
        const body = String(a.body || '').trim(); if (!body) throw new Error('The note is empty');
        const title = String(a.title || body.split(/[.\n]/)[0]).trim().slice(0, 120);
        const { data, error } = await db.from('notes').insert({ title, body, important: !!a.important, project_id: project?.id || null, created_by: ctx.actor.id }).select('id').single();
        if (error) throw error;
        await writeAudit({ actorId: ctx.actor.id, action: 'note.created', entityType: 'note', entityId: data.id, metadata: { via: 'ai_bot' } });
        out.push({ type: a.type, ok: true, id: data.id, href: '/notes', summary: `Note saved: “${title}”${project ? ` · ${project.name}` : ''}` });
      } else if (a.type === 'generate_document') {
        const deal = project && a.counterparty ? (await db.from('deals').select('id').eq('project_id', project.id).ilike('counterparty', `%${a.counterparty}%`).limit(1)).data?.[0] : null;
        const r = await generateFromTemplate(ctx.actor.id, { template_name: a.template, project_id: project?.id || null, deal_id: deal?.id || null, inputs: a.counterparty ? { counterparty: a.counterparty } : {}, instructions: a.instructions || null });
        const missing = r.missing_fields.filter((f: string) => !['date'].includes(f));
        out.push({ type: a.type, ok: true, id: r.generated.id, href: `/drafting/${r.generated.id}`, summary: `${r.template_name} drafted: “${r.generated.title}”${missing.length ? ` — still needs: ${missing.slice(0, 6).map((f: string) => f.replace(/_/g, ' ')).join(', ')}` : ''}. It is a DRAFT until approved.` });
      } else if (a.type === 'create_design') {
        const layout = (Object.keys(LAYOUTS).find(k => k === a.layout) || Object.keys(LAYOUTS).find(k => a.layout && (k.includes(String(a.layout).toLowerCase().replace(/\s+/g, '_')) || LAYOUTS[k as LayoutId].label.toLowerCase().includes(String(a.layout).toLowerCase()))) || 'flyer_a4') as LayoutId;
        const [brand, style, p, entity] = await Promise.all([getBrand(), getBrandStyle(), project ? db.from('projects').select('*').eq('id', project.id).single().then(r => r.data) : null, getSetting<any>('rhc_entity_details')]);
        const base = defaultDesign(layout, brand.business_name);
        const content = { ...base.content, ...(p ? contentFromProject(p, { name: entity?.signatory_name, email: entity?.email, phone: entity?.phone }, brand.business_name) : {}), ...(a.headline ? { headline: a.headline } : {}), ...(brand.logo_url ? { logo_image: brand.logo_url } : {}) };
        const design = { layout, theme: { ...base.theme, ...(style.primary ? { primary: style.primary } : {}), ...(style.accent ? { accent: style.accent } : {}), ...(style.font ? { font: style.font } : {}) }, content };
        const title = String(a.title || `${LAYOUTS[layout].label.replace(/\s*\(.*\)/, '')}${p ? ` — ${p.name}` : ''}`).slice(0, 200);
        const { data, error } = await db.from('marketing_assets').insert({ title, content: content.headline || title, kind: 'design', layout, design, project_id: project?.id || null, engine: 'rules', status: 'draft', created_by: ctx.actor.id }).select('id').single();
        if (error) throw error;
        await writeAudit({ actorId: ctx.actor.id, action: 'design.created', entityType: 'marketing_asset', entityId: data.id, metadata: { title, via: 'ai_bot' } });
        out.push({ type: a.type, ok: true, id: data.id, href: `/designer?id=${data.id}`, summary: `Design created: “${title}” (${LAYOUTS[layout].label}) in your brand colours${brand.logo_url ? ' with your logo' : ''}. Open it in Designer to adjust, then request approval to export PNG/PDF.` });
      } else if (a.type === 'review_contract') {
        const att = ctx.attachments.find(x => !a.attachment || x.name.toLowerCase().includes(String(a.attachment).toLowerCase())) || ctx.attachments[0];
        if (!att?.text) throw new Error('Attach the agreement (PDF, Word or photo) to the same message, then ask me to review it');
        const r = await runContractReview(ctx.actor.id, { text: att.text, title: `Review — ${att.name}`, project_id: project?.id || null, rhc_role: a.role || null, document_id: att.document_id || null });
        const A = r.analysis;
        out.push({ type: a.type, ok: true, id: r.review?.id, href: r.review ? `/legal/${r.review.id}` : '/legal', summary: `Legal review of “${att.name}”: ${A.overall_risk.rating.toUpperCase()} risk (${A.overall_risk.score}/100), ${A.findings.length} issues, ${A.missing_protections.length} missing protections.${A.findings.length ? `\nTop issues: ${A.findings.slice(0, 3).map(f => `${f.title}${f.clause_ref ? ` (${f.clause_ref})` : ''}`).join('; ')}.` : ''}` });
      } else if (a.type === 'autofill_business') {
        if (!['admin', 'director'].includes(ctx.actor.role)) throw new Error('only an admin or director can change the business details');
        const p = await proposeBusinessDetails();
        const best = bestOf(p.proposal);
        const logo = p.logos.find(l => /^image\/(png|jpeg)$/.test(l.mime)) || p.logos[0];
        const r = await applyBusinessDetails(ctx.actor.id, { details: best, logo_document_id: logo?.id || null, primary: p.style.primary, accent: p.style.accent });
        const shown = Object.entries(best).filter(([, v]) => v).map(([k, v]) => `${k === 'name' ? 'legal name' : k.toUpperCase().length <= 3 ? k.toUpperCase() : k}: ${v}`);
        out.push({ type: a.type, ok: true, href: '/system?tab=business', summary: r.changed.length ? `Business details updated from ${p.documents_scanned} documents — ${shown.join(' · ')}${logo ? ` · logo: ${logo.name}` : ''}${p.style.primary ? ` · colours ${p.style.primary}/${p.style.accent || ''}` : ''}. Check them in Settings → Business details.` : `I read ${p.documents_scanned} documents but found nothing new to change${!p.logos.length ? ' (no image named “logo” found — upload one or add it to Drive)' : ''}.` });
      } else if (a.type === 'template_from_document') {
        const doc = await findDocument(a.document);
        if (!doc) throw new Error(`I couldn't find a document matching “${a.document}”. Sync your Drive or upload it first.`);
        const r = await templateFromDocument(ctx.actor.id, { document_id: doc.id, name: a.name, provider: ctx.provider || null });
        out.push({ type: a.type, ok: true, id: r.template.id, href: '/drafting?tab=templates', summary: `New template “${r.template.name}” built from “${doc.name}” (${r.engine === 'rules' ? 'built-in engine' : r.engine}) with placeholders: ${r.placeholders.join(', ') || 'none found'}${r.amounts_to_check?.length ? `. Check these amounts: ${r.amounts_to_check.join(', ')}` : ''}. It is a draft until approved.` });
      } else if (a.type === 'update_template') {
        const tpl = await findTemplate(a.template);
        if (!tpl) throw new Error(`I couldn't find a template called “${a.template}”`);
        const docs = a.documents?.length ? (await Promise.all(a.documents.map(findDocument))).filter(Boolean) as { id: string; name: string }[] : await documentsLike(tpl.category, tpl.name);
        if (!docs.length) throw new Error(`I couldn't find any of your ${tpl.name} documents to learn from. Sync your Google Drive or upload an example first.`);
        const r = await updateTemplateFromDocuments(ctx.actor.id, tpl.id, { document_ids: docs.map(d => d.id), provider: ctx.provider || null });
        out.push({ type: a.type, ok: true, id: tpl.id, href: '/drafting?tab=templates', summary: `Template “${tpl.name}” updated to follow ${r.learned_from.map(n => `“${n}”`).join(', ')} (${r.engine === 'rules' ? 'built-in engine: adopted the document wording with placeholders' : r.engine}). Saved as version ${r.template.version} — it needs approval before use.` });
      } else if (a.type === 'draft_email') {
        const rcp = await resolveRecipient(a.to, ctx);
        if (!rcp) throw new Error(`I couldn't find an email address for “${a.to}”. Use their email address, or add them to Contacts`);
        const r = await composeEmail(ctx.actor, { provider: ctx.provider || null, intent: a.intent, to: rcp.name ? `${rcp.name} <${rcp.email}>` : rcp.email, subject: a.subject, project_id: project?.id || null, persona: (a.persona as any) || rd.persona || undefined, tone: (a.tone as any) || undefined });
        const { data, error } = await db.from('email_drafts').insert({ to_addresses: cleanAddressList(rcp.email), subject: r.subject || a.subject || 'Follow-up', body: r.body, project_id: r.project?.id || project?.id || null, engine: r.engine, status: 'draft', created_by: ctx.actor.id }).select('id,subject').single();
        if (error) throw error;
        out.push({ type: a.type, ok: true, id: data.id, href: '/gmail?tab=drafts', summary: `Email to ${rcp.name || rcp.email} drafted — “${data.subject}”${r.persona ? ` (as ${r.persona === 'ceo' ? 'CEO' : r.persona})` : ''}. Review it in Gmail → Drafts, request approval, then send.\n\n${r.body.slice(0, 900)}${r.body.length > 900 ? '…' : ''}` });
      } else if (a.type === 'reply_email' || a.type === 'read_email') {
        const { latestFrom } = await import('./email-history');
        const m = await latestFrom(a.from, ctx.actor.id);
        if (!m) throw new Error(`I couldn't find a recent email from “${a.from}” in the connected mailbox`);
        const r = await composeEmail(ctx.actor, { provider: ctx.provider || null, thread_id: m.threadId, intent: (a as any).intent, persona: ((a as any).persona as any) || rd.persona || undefined, tone: ((a as any).tone as any) || undefined, project_id: project?.id || null });
        if (a.type === 'read_email') { out.push({ type: a.type, ok: true, href: `/gmail?open=${m.id}`, summary: `📧 ${r.insights.join('\n')}` }); continue; }
        const rt = r.reply_to!;
        const { data, error } = await db.from('email_drafts').insert({ to_addresses: cleanAddressList(rt.to), cc_addresses: rt.cc ? cleanAddressList(rt.cc) : null, subject: r.subject, body: r.body, in_reply_to: rt.in_reply_to || null, gmail_thread_id: rt.thread_id || null, project_id: r.project?.id || null, engine: r.engine, status: 'draft', created_by: ctx.actor.id }).select('id').single();
        if (error) throw error;
        out.push({ type: a.type, ok: true, id: data.id, href: '/gmail?tab=drafts', summary: `I read “${m.subject}” from ${m.from}${r.related.length ? ` and ${r.related.length} earlier related email${r.related.length > 1 ? 's' : ''}` : ''} and drafted a reply${r.persona ? ` as ${r.persona === 'ceo' ? 'CEO' : r.persona}` : ''}. Review it in Gmail → Drafts, request approval, then send.\n${r.insights.map(i => `• ${i}`).join('\n')}\n\n${r.body.slice(0, 900)}${r.body.length > 900 ? '…' : ''}` });
      } else if (a.type === 'briefing') {
        out.push({ type: a.type, ok: true, href: '/', summary: await buildBriefing(ctx) });
      } else if (a.type === 'open_page') {
        const pg = PAGES.find(p => p.key === a.page) || PAGES.find(p => p.re.test(a.page));
        if (!pg) throw new Error(`I don't know a page called "${a.page}"`);
        out.push({ type: a.type, ok: true, href: pg.href, navigate: true, summary: `Opening ${pg.label}.` });
      } else if (a.type === 'open_item') {
        const q = String(a.name || '').trim(); if (!q) throw new Error('Tell me which one to open');
        const T: Record<string, [string, string, (id: string) => string]> = { project: ['projects', 'name', id => `/projects/${id}`], task: ['tasks', 'title', id => `/tasks?open=${id}`], deal: ['deals', 'title', id => `/crm/${id}`], document: ['documents', 'name', id => `/documents?open=${id}`] };
        const [table, col, href] = T[a.kind] || T.project;
        const { data } = await db.from(table).select(`id,${col}`).ilike(col, `%${q.replace(/[%_]/g, '')}%`).limit(5);
        const rows = (data || []) as any[];
        if (!rows.length) throw new Error(`I couldn't find a ${a.kind} matching "${q}"`);
        if (rows.length > 1 && !rows.some(r => String(r[col]).toLowerCase() === q.toLowerCase())) out.push({ type: a.type, ok: true, summary: `Which ${a.kind}?\n${rows.map(r => `• [${r[col]}](${href(r.id)})`).join('\n')}` });
        else { const r = rows.find(x => String(x[col]).toLowerCase() === q.toLowerCase()) || rows[0]; out.push({ type: a.type, ok: true, href: href(r.id), navigate: true, summary: `Opening ${a.kind} “${r[col]}”.` }); }
      } else if (a.type === 'list_approvals') {
        const { data } = await db.from('approvals').select('id,title,category,status,approvers,reviewer_id,requested_by,created_at, requester:profiles!approvals_requested_by_fkey(full_name)').eq('status', 'pending').order('created_at', { ascending: false }).limit(40);
        const { mayDecide } = await import('./approvals');
        const all = (data || []) as any[]; const mine = all.filter(x => mayDecide(ctx.actor, x));
        const list = a.scope === 'all' ? all : mine;
        out.push({ type: a.type, ok: true, href: '/approvals', summary: list.length
          ? `${a.scope === 'all' ? 'Waiting for approval' : 'Waiting for **your** approval'} (${list.length}):\n${list.slice(0, 12).map((x, i) => `${i + 1}. [${x.title}](/approvals?open=${x.id}) — ${x.requester?.full_name || 'someone'}, ${formatWhen(new Date(x.created_at))}`).join('\n')}\n\nSay **approve 1**, **reject 2 because …** or **approve “title”**.`
          : `Nothing is waiting for ${a.scope === 'all' ? 'approval' : 'your approval'}.${a.scope !== 'all' && all.length ? ` (${all.length} item${all.length > 1 ? 's are' : ' is'} waiting for other people.)` : ''}` });
      } else if (a.type === 'decide_approval') {
        const { mayDecide, decideApproval } = await import('./approvals');
        const { data } = await db.from('approvals').select('id,title,category,status,approvers,reviewer_id,requested_by,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(40);
        const mine = ((data || []) as any[]).filter(x => mayDecide(ctx.actor, x));
        if (!mine.length) throw new Error('Nothing is waiting for your approval');
        const t = String(a.title || '').trim();
        const num = /^#?\d+$/.test(t) ? Number(t.replace('#', '')) : null;
        let pick = num ? mine[num - 1] : t ? mine.filter(x => String(x.title).toLowerCase().includes(t.toLowerCase())) : mine.length === 1 ? mine : null;
        if (Array.isArray(pick)) { if (pick.length > 1) { out.push({ type: a.type, ok: false, summary: `More than one matches — which one?\n${pick.map((x: any) => `• ${x.title}`).join('\n')}` }); continue; } pick = pick[0]; }
        if (!pick) throw new Error(t ? `Nothing waiting for your approval matches "${t}"` : `Which one? You have ${mine.length} waiting — say "show my approvals"`);
        if (a.decision !== 'approved' && !String(a.note || '').trim()) { out.push({ type: a.type, ok: false, summary: `Please add a reason, e.g. "${a.decision === 'rejected' ? 'reject' : 'request changes on'} ${pick.title} because …"` }); continue; }
        await decideApproval(ctx.actor, pick.id, a.decision, a.note || 'Approved via Infinity AI');
        out.push({ type: a.type, ok: true, href: `/approvals?open=${pick.id}`, summary: `${a.decision === 'approved' ? 'Approved' : a.decision === 'rejected' ? 'Rejected' : 'Changes requested on'} “${pick.title}”.` });
      } else if (a.type === 'update_task') {
        const q = String(a.title || '').trim(); if (!q) throw new Error('Which task?');
        let qq = db.from('tasks').select('id,title,assigned_to,created_by').neq('status', a.status).ilike('title', `%${q.replace(/[%_]/g, '')}%`).limit(5);
        const { data } = await qq; const rows = (data || []) as any[];
        if (!rows.length) throw new Error(`I couldn't find an open task matching "${q}"`);
        if (rows.length > 1 && !rows.some(r => r.title.toLowerCase() === q.toLowerCase())) { out.push({ type: a.type, ok: false, summary: `Which task?\n${rows.map(r => `• [${r.title}](/tasks?open=${r.id})`).join('\n')}` }); continue; }
        const r = rows.find(x => x.title.toLowerCase() === q.toLowerCase()) || rows[0];
        const { error } = await db.from('tasks').update({ status: a.status, completed_at: a.status === 'done' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', r.id);
        if (error) throw error;
        out.push({ type: a.type, ok: true, href: `/tasks?open=${r.id}`, id: r.id, summary: `${a.status === 'done' ? 'Marked done' : a.status === 'in_progress' ? 'Started' : a.status === 'blocked' ? 'Marked blocked' : 'Reopened'}: “${r.title}”.` });
      } else if (a.type === 'list_tasks') {
        const who = a.who ? resolvePerson(a.who, ctx) : ctx.actor.id;
        let q = db.from('tasks').select('id,title,due_at,priority,status, project:projects(name)').neq('status', 'done').order('due_at', { ascending: true, nullsFirst: false }).limit(15);
        if (who && who !== 'everyone') q = q.eq('assigned_to', who);
        if (project) q = q.eq('project_id', project.id);
        const { data } = await q;
        const list = (data || []).map((t: any) => `• ${t.title}${t.due_at ? ` — due ${formatWhen(new Date(t.due_at))}${new Date(t.due_at) < new Date() ? ' (OVERDUE)' : ''}` : ''}${t.project?.name ? ` · ${t.project.name}` : ''}`);
        out.push({ type: a.type, ok: true, href: '/tasks', summary: list.length ? `Open tasks for ${who === 'everyone' ? 'the team' : nameOf(who as string, ctx)}${project ? ` on ${project.name}` : ''}:\n${list.join('\n')}` : `No open tasks for ${who === 'everyone' ? 'the team' : nameOf(who as string, ctx)}${project ? ` on ${project.name}` : ''}.` });
      }
    } catch (e: any) {
      out.push({ type: a.type, ok: false, summary: `Couldn't ${a.type.replace(/_/g, ' ')}: ${e?.message || 'failed'}`, error: e?.message || 'failed' });
    }
  }
  return out;
}

// ------------------------------------------------------------------ rules engine (no AI key)
const TEMPLATE_WORDS: [RegExp, string][] = [
  [/\b(mou|memorandum of understanding)\b/i, 'Memorandum of Understanding'], [/\b(hoa|heads of agreement)\b/i, 'Heads of Agreement'],
  [/\b(letter of offer|offer letter|offer)\b/i, 'Letter of Offer'], [/\b(nda|confidentiality agreement)\b/i, 'Mutual Confidentiality Agreement'],
  [/\b(services agreement|consultancy agreement|contract)\b/i, 'Services / Consultancy Agreement'], [/\b(proposal)\b/i, 'Commercial Proposal'],
  [/\b(status report|project report|report)\b/i, 'Project Status Report'], [/\b(letter)\b/i, 'General Business Letter'],
];

/** Turns a plain-English command into actions. Returns null when the text is a question rather than a command. */
const PAGES: { key: string; re: RegExp; href: string; label: string }[] = [
  { key: 'approvals', re: /approv/i, href: '/approvals', label: 'Approvals' },
  { key: 'tasks', re: /\btasks?\b|to-?dos?/i, href: '/tasks', label: 'Tasks' },
  { key: 'gmail', re: /gmail|e-?mails?|inbox|\bmail\b/i, href: '/gmail', label: 'Gmail' },
  { key: 'calendar', re: /calendar|meetings?|schedule/i, href: '/calendar', label: 'Calendar' },
  { key: 'drive', re: /google drive|\bdrive\b/i, href: '/documents?tab=drive', label: 'Google Drive' },
  { key: 'documents', re: /documents?|files?|knowledge/i, href: '/documents', label: 'Documents' },
  { key: 'legal', re: /legal|contracts?|reviews?/i, href: '/legal', label: 'Legal AI' },
  { key: 'drafting', re: /drafting|templates?/i, href: '/drafting', label: 'Drafting' },
  { key: 'notes', re: /notes?/i, href: '/notes', label: 'Notes' },
  { key: 'projects', re: /projects?/i, href: '/projects', label: 'Projects' },
  { key: 'crm', re: /crm|deals?|pipeline/i, href: '/crm', label: 'CRM / Deals' },
  { key: 'marketing', re: /marketing|campaigns?/i, href: '/marketing', label: 'Marketing' },
  { key: 'designer', re: /design(er|s)?|flyers?/i, href: '/designer', label: 'Designer' },
  { key: 'presentations', re: /presentations?|decks?|slides|power ?points?/i, href: '/presentations', label: 'Presentations' },
  { key: 'research', re: /\bresearch\b/i, href: '/presentations?tab=research', label: 'Research' },
  { key: 'chat', re: /team chat|\bchat\b|channels?/i, href: '/team', label: 'Team Chat' },
  { key: 'settings', re: /settings|system|admin|team members?|roles?/i, href: '/system', label: 'Settings' },
  { key: 'home', re: /home|dashboard|command cent(re|er)/i, href: '/', label: 'Home' },
];

export function parseCommand(raw: string, ctx: Pick<Ctx, 'actor' | 'members' | 'projects' | 'now'>): AgentAction[] | null {
  const text = raw.replace(/^\s*(@?(ai|infinity|infinity ai|bot)\b[,:]?\s*)/i, '').replace(/^\s*(hey|hi|please|pls|can you|could you)\b[,\s]*/i, '').replace(/^\s*(please|pls)\s+/i, '').trim();
  const lower = text.toLowerCase();
  const projectFrom = (s: string) => { const m = s.match(/\b(?:for|on|re|in)\s+(?:the\s+)?(?:project\s+)?["“]?([^"”,]+?)["”]?\s+project\b/i) || s.match(/\bproject\s+["“]?([^"”,.]+)["”]?/i); return m?.[1]?.trim(); };
  const ctxP = ctx as Ctx;
  const autoProject = (s: string) => projectFrom(s) || projectInText(s, ctxP)?.name;

  // standing rules: "from now on…", "always…", "never…", "whenever…", "remember…", "rule: …"; list and forget them
  if (isListRules(raw)) return [{ type: 'list_rules' }];
  { const f = parseForget(raw); if (f) return [{ type: 'forget_rule', rule: f }]; }
  { const r = parseRule(raw); if (r) return [{ type: 'save_rule', text: r.text, scope: r.scope }]; }
  // daily briefing
  if (/\b(what needs my attention|needs? my attention|what('?s| is) (on )?(for )?today|my day\b|daily (brief|briefing|summary)|morning (brief|briefing)|brief me|catch me up|what should i (do|focus on|work on)|anything urgent|what'?s urgent|what'?s on my plate today)\b/i.test(text)) return [{ type: 'briefing' }];
  // how-to questions about the app
  if (/^(how (do|can|to|would|should) (i|we|you)|how to|where (do|can|is) (i|we)?|can i|is there a way|show me how|teach me|explain how)\b/i.test(text) && !/\b(task|remind|meeting|note)\s*:/i.test(text)) return [];
  // open a page / an item
  {
    const op = text.match(/^(?:open|go to|goto|take me to|switch to|navigate to|bring up|load|show(?: me)?(?= .*\b(?:page|tab|screen)\b))\s+(?:the\s+|my\s+)?(.+?)\s*(?:page|tab|screen|section|list)?\s*[.!?]*$/i);
    if (op && !/\b(from|latest|last|recent)\b/i.test(op[1])) {
      const target = op[1].trim();
      const item = target.match(/^(project|task|deal|document|doc|file)\s+["“]?(.+?)["”]?$/i);
      if (item) return [{ type: 'open_item', kind: (/doc|file/i.test(item[1]) ? 'document' : item[1].toLowerCase()) as any, name: item[2] }];
      const pending = /^(?:pending\s+|my\s+|waiting\s+)?approvals?(?:\s+(?:for me|waiting|pending))?$/i.test(target) && /^(show|list)/i.test(text);
      if (pending) return [{ type: 'list_approvals', scope: 'mine' }];
      const pg = PAGES.find(p => p.re.test(target));
      if (pg && target.split(/\s+/).length <= 4) return [{ type: 'open_page', page: pg.key }];
    }
  }
  // approvals
  if (/\b(what|which|any|list|show|pending|waiting)\b.*\bapprov/i.test(text) || /^(my )?approvals\??$/i.test(text)) return [{ type: 'list_approvals', scope: /\b(all|everyone|team|everything)\b/i.test(text) ? 'all' : 'mine' }];
  {
    const ap = text.match(/^(approve|accept|sign off|reject|decline|request changes(?: on| to| for)?)\s+(?:the\s+)?(?:approval\s+)?(?:for\s+)?["“]?(.*?)["”]?(?:\s+(?:because|as|since|reason|:)\s+([\s\S]+))?\s*$/i);
    if (ap && (/approv/i.test(text) || /^(reject|decline|request changes)/i.test(ap[1]) || /^#?\d+$/.test(ap[2] || '') || /^(it|this|that|all)$/i.test(ap[2] || ''))) {
      const decision = /^(reject|decline)/i.test(ap[1]) ? 'rejected' : /^request/i.test(ap[1]) ? 'changes_requested' : 'approved';
      const title = (ap[2] || '').replace(/^(it|this|that)$/i, '').replace(/\bapproval\b/i, '').trim();
      return [{ type: 'decide_approval', decision, title: title || undefined, note: ap[3]?.trim() }];
    }
  }
  // task status
  {
    const ts = text.match(/^(?:mark|set)\s+(?:the\s+)?(?:task\s+)?["“]?(.+?)["”]?\s+(?:as\s+)?(done|complete|completed|finished|in progress|started|blocked|to ?do|open)\s*\.?$/i);
    if (ts) { const w = ts[2].toLowerCase(); return [{ type: 'update_task', title: ts[1], status: /done|complete|finish/.test(w) ? 'done' : /progress|start/.test(w) ? 'in_progress' : /block/.test(w) ? 'blocked' : 'todo' }]; }
    const tc = text.match(/^(close|complete|finish|tick off|done with|start|reopen|block)\s+(?:the\s+)?task\s+["“]?(.+?)["”]?\s*\.?$/i);
    if (tc) { const w = tc[1].toLowerCase(); return [{ type: 'update_task', title: tc[2], status: /start/.test(w) ? 'in_progress' : /reopen/.test(w) ? 'todo' : /block/.test(w) ? 'blocked' : 'done' }]; }
  }
  // documents attached to the message
  const atts = (ctx as Ctx).attachments || [];
  if (atts.length && /\b(review|check|risk|legal|analy[sz]e)\b/i.test(text) && /\b(contract|agreement|mou|lease|offer|deed|nda|heads|this|it|attached)\b/i.test(text)) {
    const role = text.match(/\b(?:we are|we're|as|our role is)\s+(?:the\s+)?([A-Z][a-z]+)\b/)?.[1];
    return [{ type: 'review_contract', role, project: autoProject(text) }];
  }
  // business details & templates from the business's own documents
  if (/\b(fill|set ?up|update|complete|extract|find|read|get)\b.*\b(business|company)\b.*\b(details|info|information|settings|profile)\b|\b(logo|abn|letterhead)\b.*\b(from|using|in)\b.*\b(drive|documents?|files?)\b/i.test(text)) return [{ type: 'autofill_business' }];
  let tm = text.match(/\b(?:make|create|build|turn|convert)\b.*\btemplate\b.*\bfrom\b\s+(?:the\s+|our\s+|my\s+)?(?:document\s+|file\s+)?["“]?(.+?)["”]?\s*$/i) || text.match(/\bturn\s+["“]?(.+?)["”]?\s+into\s+a\s+template\b/i);
  if (tm) return [{ type: 'template_from_document', document: tm[1] }];
  if (/\b(update|change|adjust|fix|align|match|improve|redo)\b.*\btemplates?\b/i.test(text) && /\b(from|using|according|match|like|based|our|rhc|drive|documents?|files?)\b/i.test(text)) {
    const which = TEMPLATE_WORDS.filter(([re]) => re.test(text)).map(([, n]) => n);
    const docName = text.match(/\b(?:from|using|like)\s+["“](.+?)["”]/i)?.[1];
    const targets = which.length ? which : ['Memorandum of Understanding'];
    return targets.slice(0, 3).map(t => ({ type: 'update_template' as const, template: t, documents: docName ? [docName] : undefined }));
  }
  // email
  {
    const { persona, rest } = personaFrom(text);
    let em = rest.match(/^(?:draft\s+(?:a\s+)?|write\s+(?:a\s+)?)?(?:reply|respond|answer)\s+(?:to\s+)?(?:the\s+)?(?:latest\s+|last\s+|recent\s+|new\s+)?(?:e-?mail|message|mail)?\s*(?:from\s+)?["“]?(.+?)["”]?(?:\s*(?:,|:|;|\bsaying\b|\band say\b|\bto say\b|\btelling (?:them|him|her)\b|\band tell (?:them|him|her)\b|\bthat\b|\band\b)\s*([\s\S]+))?$/i);
    if (em && /\b(reply|respond|answer)\b/i.test(rest) && em[1] && !/^(this|it|that)$/i.test(em[1].trim())) return [{ type: 'reply_email', from: em[1].replace(/'s$/, '').trim(), intent: em[2]?.trim(), persona }];
    em = rest.match(/^(?:read|summari[sz]e|check|open|show(?: me)?)\s+(?:the\s+|my\s+)?(?:latest\s+|last\s+|recent\s+|new\s+)?(?:e-?mails?|messages?|mail)\s+from\s+["“]?(.+?)["”]?\s*\??$/i) || rest.match(/^what did\s+(.+?)\s+(?:say|send|write|email)\b/i);
    if (em) return [{ type: 'read_email', from: em[1].trim() }];
    em = rest.match(/^(?:draft|write|compose|prepare|send|create)\s+(?:an?\s+)?(?:new\s+)?(?:e-?mail|message|letter by email)\s+to\s+(.+?)\s+(?:about|regarding|re|saying|to say|asking|telling|that|on|for)\s+([\s\S]+)$/i) || rest.match(/^e-?mail\s+(.+?)\s+(?:about|regarding|re|saying|to say|asking|telling|that)\s+([\s\S]+)$/i);
    if (em) { const proj = autoProject(rest); return [{ type: 'draft_email', to: em[1].trim(), intent: em[2].trim(), project: proj, persona }]; }
  }
  // designs
  if (/^(design|create|make|generate|prepare)\b.*\b(design|flyer|brochure|poster|fact ?sheet|one[- ]?pager|social( media)? post|story|banner|signage|hoarding|email header)\b/i.test(text)) {
    const L: [RegExp, string][] = [[/flyer/i, 'flyer_a4'], [/brochure/i, 'brochure_a4'], [/fact ?sheet/i, 'fact_sheet_a4'], [/one[- ]?pager|investor/i, 'investor_onepager'], [/poster|eoi/i, 'eoi_poster_a3'], [/hoarding|signage|\bsign\b/i, 'site_hoarding'], [/story/i, 'social_story'], [/social|instagram|post/i, 'social_square'], [/linkedin|banner/i, 'linkedin_banner'], [/email header/i, 'email_header'], [/newsletter/i, 'newsletter_email'], [/flyer/i, 'flyer_a4']];
    return [{ type: 'create_design', layout: L.find(([re]) => re.test(text))?.[1] || 'flyer_a4', project: autoProject(text) }];
  }
  // list tasks
  if (/^(what('?s| is| are)|show( me)?|list|any)\b.*\b(tasks?|to-?dos?|due|overdue|on my plate)\b/i.test(text) || /^my tasks\b/i.test(text)) {
    const who = text.match(/\b(?:for|does)\s+@?([a-z][\w.@-]*)\b/i)?.[1];
    return [{ type: 'list_tasks', who: /\b(my|me|i)\b/i.test(text) && !who ? 'me' : /\b(team|everyone|all)\b/i.test(text) ? 'everyone' : who || 'me', project: autoProject(text) }];
  }
  // reminders
  let m = text.match(/^remind\s+(me|us|everyone|everybody|the team|team|all|@?[\w.@-]+)\s+(?:(?:to|about|that|of)\b\s*)?([\s\S]+)$/i);
  if (m || /^(set|create|add)\s+(a\s+)?reminder\b/i.test(text)) {
    const who = m ? m[1] : 'me'; let rest = m ? m[2] : text.replace(/^(set|create|add)\s+(a\s+)?reminder\s*(for\s+(me|everyone|team|@?\w+))?\s*(to|about|:)?\s*/i, '');
    const forWho = !m ? text.match(/reminder\s+for\s+(me|everyone|team|@?\w+)/i)?.[1] : null;
    const w = parseWhen(rest, ctx.now);
    rest = stripWhen(rest, w);
    return [{ type: 'set_reminder', title: rest.replace(/^(to|about)\s+/i, '') || 'Reminder', when: w ? w.at.toISOString() : '', for: forWho || who, project: autoProject(text) }];
  }
  // meetings
  if (/^(schedule|book|set up|setup|organise|organize|arrange|create|add|plan)\s+(a\s+|an\s+)?(meeting|call|catch[- ]?up|zoom|teams call|site visit|inspection)\b/i.test(text) || /^meeting\s*[:-]/i.test(text)) {
    const w = parseWhen(text, ctx.now);
    let rest = stripWhen(text, w).replace(/^(schedule|book|set up|setup|organise|organize|arrange|create|add|plan)\s+(a\s+|an\s+)?/i, '').replace(/^meeting\s*[:-]\s*/i, '');
    const dur = rest.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(min(?:ute)?s?|hours?|hrs?)\b/i);
    if (dur) rest = rest.replace(dur[0], ' ');
    const loc = rest.match(/\b(?:at|in)\s+(?:the\s+)?((?:office|boardroom|site|room|zoom|teams|google meet|cafe|[A-Z][\w']+(?:\s+[A-Z][\w']+)*\s+(?:office|street|st|road|rd|cafe|room)))\b/i);
    if (loc) rest = rest.replace(loc[0], ' ');
    const withPeople = [...rest.matchAll(/@([\w.@-]+)/g)].map(x => x[1]);
    const withNames = (rest.match(/\bwith\s+([^,.]+?)(?:\s+(?:about|re|regarding|on|to)\b|$)/i)?.[1] || '').split(/\s*(?:,|and|&)\s*/).map(s => s.replace(/^@/, '').trim()).filter(Boolean);
    const attendees = [...new Set([...withPeople, ...withNames.filter(n => resolvePerson(n, ctxP) || /@/.test(n))])];
    const title = rest.replace(/\s{2,}/g, ' ').trim().replace(/^(meeting|call)\s+/i, (x) => x).replace(/^./, c => c.toUpperCase()) || 'Meeting';
    return [{ type: 'create_meeting', title: title.slice(0, 200), starts_at: w ? w.at.toISOString() : '', duration_minutes: dur ? Math.round(Number(dur[1]) * (/^h/i.test(dur[2]) ? 60 : 1)) : undefined, location: loc?.[1], attendees, project: autoProject(text) }];
  }
  // notes
  m = text.match(/^(?:note|add (?:a )?note|save (?:a )?note|make a note|remember that)\s*[:-]?\s*([\s\S]+)$/i);
  if (m) return [{ type: 'add_note', body: m[1].trim(), project: autoProject(text), important: /\b(important|urgent)\b/i.test(text) }];
  // documents
  if (/^(draft|prepare|generate|create|write|make|produce)\b/i.test(text) && TEMPLATE_WORDS.some(([re]) => re.test(text))) {
    const tpl = TEMPLATE_WORDS.find(([re]) => re.test(text))![1];
    const cp = text.match(/\b(?:with|to|for)\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,5})/)?.[1];
    const proj = autoProject(text);
    return [{ type: 'generate_document', template: tpl, project: proj, counterparty: cp && !(proj && cp.toLowerCase().includes(String(proj).toLowerCase())) && !resolveProject(cp, ctxP) ? cp : undefined }];
  }
  // tasks
  m = text.match(/^(?:create|add|new|make|log)\s+(?:a\s+)?(?:task|to-?do)\s*[:-]?\s*([\s\S]+)$/i) || text.match(/^(?:task|to-?do)\s*[:-]\s*([\s\S]+)$/i);
  let assignee: string | undefined;
  if (!m) { const a = text.match(/^(?:ask|tell|get|assign)\s+@?([\w.@-]+)\s+(?:to\s+)?([\s\S]+)$/i); if (a && resolvePerson(a[1], ctxP)) { assignee = a[1]; m = [a[0], a[2]] as any; } }
  if (m) {
    let rest = m[1];
    const as = rest.match(/\b(?:for|to|assign(?:ed)? to)\s+@([\w.@-]+)/i) || rest.match(/\bassign(?:ed)? to\s+([\w.@-]+)/i) || rest.match(/@([\w.@-]+)/);
    if (as) { assignee = as[1]; rest = rest.replace(as[0], ' '); }
    const pr = rest.match(/\b(urgent|high priority|low priority|asap)\b/i);
    if (pr) rest = rest.replace(pr[0], ' ');
    const dueMatch = rest.match(/\b(?:due|by|before|on)\b([\s\S]*)$/i);
    const w = parseWhen(dueMatch ? dueMatch[1] : rest, ctx.now);
    rest = stripWhen(dueMatch && w ? rest.replace(dueMatch[0], ' ') : rest, dueMatch ? null : w);
    const priority = pr ? (/urgent|asap/i.test(pr[1]) ? 'urgent' : /high/i.test(pr[1]) ? 'high' : 'low') : undefined;
    return [{ type: 'create_task', title: rest.replace(/\s{2,}/g, ' ').trim().replace(/^./, c => c.toUpperCase()), assignee, due: w ? w.at.toISOString() : undefined, priority, project: autoProject(text) }];
  }
  return null;
}

const HELP = (b: { short_name: string }) => `I'm ${AI_NAME}. Talk to me in plain English — for example:
• **Tasks:** "task: send the MOU to Harbourline for @max due Friday 3pm" · "ask Lena to review the lease by tomorrow"
• **Reminders:** "remind me tomorrow 9am to call the bank" · "remind everyone at 4pm to submit timesheets"
• **Meetings:** "schedule a meeting with @lena about the JV on 14/10 at 10am for 30 minutes"
• **Your rules:** "from now on, remind me 15 minutes before meetings" · "always write my emails as project manager" · "rule for the team: always cc Ramin on Harbourline emails" · "whenever I say morning, show what needs my attention today" · "show my rules" · "forget rule 2"
• **Notes:** "note: investor prefers quarterly updates"
• **Documents:** "draft an MOU for the Fortitude Valley project with Harbourline Capital" · "prepare a status report for Fortitude Valley"
• **Your day:** "what needs my attention today?" (overdue and due tasks, meetings, reminders, approvals, unread email)
• **Your work:** "what are my tasks?" · "what's overdue for the team?"
• **Designs:** "design a flyer for <project>" · "make a social post for <project>"
• **Business setup:** "fill in our business details from our documents" (logo, ABN, address…) · "update the MOU template from our RHC documents" · "make a template from Harbourline MOU"
• **Email:** "reply to the latest email from Harbourline saying we accept Tuesday 10am, as project manager" · "draft an email to sarah@harbourline.com.au about the revised deposit" · "read the latest email from Harbourline" (drafts only — sending needs approval)
• **Read files:** attach a PDF, Word, Excel or photo and ask "review this contract"
• **How-to:** "how do I export to Excel?"
• **Questions:** ask anything about ${b.short_name} projects and documents — I answer from your files with citations.`;

// ------------------------------------------------------------------ main entry
export async function runAgent(opts: { actor: Actor; text: string; projectId?: string | null; history?: ChatMessage[]; provider?: string | null; channelContext?: string; attachments?: Attachment[]; screen?: string }): Promise<AgentReply> {
  kickDriveSync();
  const ctx = await loadCtx(opts.actor, opts.projectId || null);
  ctx.attachments = opts.attachments || [];
  const brand = await getBrand();
  const text = opts.text.trim();
  const clean = text.replace(/^\s*@?(ai|infinity|infinity ai|bot)\b[,:]?\s*/i, '').trim();
  if (/^(help|\?|what can you do\??|commands)$/i.test(clean)) return { reply: HELP(brand), actions: [], engine: 'rules' };

  // Choose the engine
  let provider: Provider | null = null;
  const pref = String(opts.provider || (await getSetting<string>('bot_provider')) || 'auto');
  const status = providerStatus();
  const explicit = isProvider(pref);
  if (explicit && status[pref as Provider]) provider = pref as Provider;
  else if (pref === 'auto') {
    provider = (['anthropic', 'openai', 'gemini'] as Provider[]).find(p => status[p]) || null;
    // Local Ollama is only used automatically when it is actually running (checked at most once a minute).
    if (!provider && status.ollama && await ollamaUp()) provider = 'ollama';
  }

  ctx.provider = provider;
  let note: string | undefined;
  if (provider) {
    // Clear, exact commands (open a page, approve, mark a task done, list…) run instantly — no AI round trip, no chance of it only talking.
    const shortcut = await shortcutFor(clean, ctx.actor.id).catch(() => null);
    const quick = parseCommand(shortcut || text, ctx);
    if (quick && quick.length && quick.every(a => INSTANT.includes(a.type)) && !ctx.attachments.length) {
      const results = await executeActions(quick, ctx);
      return { reply: results.map(r => `${r.ok ? '✅' : '⚠️'} ${r.summary}`).join('\n'), actions: results, engine: 'rules' };
    }
    try { return await aiAgent(provider, shortcut ? `${clean}\n\n(Saved rule: this means “${shortcut}”.)` : clean, ctx, brand, opts); }
    catch (e: any) { if (explicit) note = `${PROVIDER_LABEL[provider]} is unavailable (${String(e?.message || e).slice(0, 140)}), so I used the built-in rules instead.`; }
  }
  // Rules engine — a saved shortcut ("whenever I say X, do Y") runs Y
  const short = await shortcutFor(clean, ctx.actor.id).catch(() => null);
  const actions = parseCommand(short || text, ctx);
  if (actions && actions.length === 0) {
    const hits = guideFor(clean);
    return { reply: hits.length ? hits.map(h => `**${h.topic}** — ${h.text}`).join('\n\n') : HELP(brand), actions: [], engine: 'rules', note };
  }
  if (!actions && ctx.attachments.length) {
    const reply = ctx.attachments.map(a => `📄 **${a.name}** — ${a.text ? `${a.text.length.toLocaleString()} characters read.\n> ${a.text.replace(/\s+/g, ' ').slice(0, 600)}${a.text.length > 600 ? '…' : ''}` : 'I could not read text from this file.'}`).join('\n\n') + `\n\nAsk me to **review this contract**, or connect an AI provider for summaries and Q&A on attachments.`;
    return { reply, actions: [], engine: 'rules', note };
  }
  if (actions) {
    const results = await executeActions(actions, ctx);
    const ok = results.filter(r => r.ok);
    const reply = results.map(r => `${r.ok ? '✅' : '⚠️'} ${r.summary}`).join('\n') + (ok.some(r => r.type !== 'list_tasks') ? '' : '');
    return { reply, actions: results, engine: 'rules', note };
  }
  // Question → knowledge search
  const { sources, drive } = await retrieveWithDrive(clean, { projectId: ctx.projectId, limit: 5, prefix: 'KB' });
  const citations = sources.map(s => ({ citation: s.citation, document_id: s.document_id, document_name: s.document_name, authority: s.authority, excerpt: s.content.slice(0, 280) }));
  const reply = sources.length
    ? `Here is what I found in ${brand.short_name} documents${drive.length ? ` (including ${drive.map(d => `“${d.name}”`).join(', ')}, just read from Google Drive)` : ''} — ${SEARCH_NAME}; connect an AI provider for written answers:\n\n${sources.slice(0, 4).map(s => `${s.citation} **${s.document_name}**\n> ${s.content.replace(/\s+/g, ' ').slice(0, 300)}${s.content.length > 300 ? '…' : ''}`).join('\n\n')}`
    : `I couldn't find that in ${brand.short_name} documents. ${await driveHint().catch(() => '')}\n\nTry naming the document or project, ask **what needs my attention today?**, or type **help**. Connect an AI provider in Settings for open questions.`;
  return { reply, actions: [], engine: 'rules', citations, note };
}

/** Every action the assistant can carry out (AI and rules). */
const AGENT_ACTION_TYPES = ['create_task', 'set_reminder', 'create_meeting', 'add_note', 'generate_document', 'list_tasks', 'create_design', 'review_contract', 'autofill_business', 'template_from_document', 'update_template', 'draft_email', 'reply_email', 'read_email', 'briefing', 'open_page', 'open_item', 'list_approvals', 'decide_approval', 'update_task', 'save_rule', 'list_rules', 'forget_rule'];
/** Commands the rules understand exactly — done straight away, without waiting for the AI. */
const INSTANT = ['open_page', 'open_item', 'list_approvals', 'decide_approval', 'update_task', 'list_tasks', 'briefing', 'save_rule', 'list_rules', 'forget_rule'];

async function aiAgent(provider: Provider, text: string, ctx: Ctx, brand: Awaited<ReturnType<typeof getBrand>>, opts: { history?: ChatMessage[]; channelContext?: string; screen?: string }): Promise<AgentReply> {
  const [instructions, sources, brandBook] = await Promise.all([
    aiInstructions(ctx.actor.id),
    retrieveWithDrive(text, { projectId: ctx.projectId, limit: 6, prefix: 'KB' }).then(r => r.sources),
    brandBookExcerpt(2500).catch(() => ''),
  ]);
  const nowLocal = ctx.now.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const lang = /[\u0600-\u06FF]/.test(text) ? 'fa' : await (await import('./user-lang')).userLanguage(ctx.actor.id).catch(() => 'en');
  const system = `${instructions}${lang === 'fa' ? `\n${(await import('./user-lang')).LANGUAGE_RULE} The "reply" field must be in Farsi; action fields (titles, names) may stay in the language the user used.` : ''}

You are ${AI_NAME}, the team bot inside ${brand.business_name}'s workspace. Team members talk to you in chat. You can answer questions and TAKE ACTIONS for the person asking (${displayName(ctx.actor)}, role ${ctx.actor.role}${ctx.canWrite ? '' : ' — READ-ONLY: never return actions except list_tasks'}).
Now: ${nowLocal} (Queensland time, UTC+10). Write all times as ISO 8601 with +10:00.
TEAM: ${JSON.stringify(ctx.members.map(m => ({ name: m.full_name, email: m.email, role: m.role })))}
PROJECTS: ${JSON.stringify(ctx.projects.slice(0, 80).map(p => p.name))}${ctx.projectId ? `\nCURRENT PROJECT: ${ctx.projects.find(p => p.id === ctx.projectId)?.name}` : ''}
APP GUIDE (use it to teach people how to use the app):\n${GUIDE_TEXT}\nDESIGN LAYOUTS: ${Object.entries(LAYOUTS).map(([k, v]) => `${k} (${v.label})`).join(', ')}\n${ctx.attachments.length ? `ATTACHED FILES (read them to answer):\n${ctx.attachments.map(a => `--- ${a.name} ---\n${a.text.slice(0, 20_000)}`).join('\n')}\n` : ''}DOCUMENT TEMPLATES: Memorandum of Understanding, Heads of Agreement, Letter of Offer, Commercial Proposal, Project Correspondence, General Business Letter, Services / Consultancy Agreement, Mutual Confidentiality Agreement, Project Status Report.
${brandBook ? `BRAND BOOK (follow for tone and naming):\n${brandBook}\n` : ''}${sources.length ? `KNOWLEDGE (cite as [KB-n] when used):\n${formatSources(sources)}\n` : 'No matching knowledge was found for this message.\n'}${opts.channelContext ? `RECENT CHAT:\n${opts.channelContext}\n` : ''}${opts.screen ? `ON THE PERSON'S SCREEN RIGHT NOW (the file marked “open on screen” above is it):\n${opts.screen}\n` : ''}
Reply with ONLY a JSON object:
{"reply": "short, friendly answer in plain English (markdown allowed). Confirm what you did, or ask ONE question if something essential is missing",
 "actions": [ one or more of:
  {"type":"create_task","title":"…","description":"…","assignee":"team member name or email, or me","due":"ISO time","priority":"low|normal|high|urgent","project":"project name"},
  {"type":"set_reminder","title":"…","when":"ISO time","for":"me | everyone | team member name","project":"…"},
  {"type":"create_meeting","title":"…","starts_at":"ISO time","duration_minutes":60,"location":"…","attendees":["name or email"],"reminder_minutes":30,"project":"…"},
  {"type":"add_note","title":"…","body":"…","project":"…","important":false},
  {"type":"generate_document","template":"one of the DOCUMENT TEMPLATES","project":"…","counterparty":"…","instructions":"…"},
  {"type":"list_tasks","who":"me | everyone | name","project":"…"},
  {"type":"create_design","layout":"one of DESIGN LAYOUTS","project":"…","headline":"…"},
  {"type":"review_contract","attachment":"file name","role":"the defined term for us, e.g. Purchaser","project":"…"},
  {"type":"autofill_business"}  (admins: read the business's documents/Drive and fill legal name, ABN, ACN, address, phone, email, website, logo and colours),
  {"type":"template_from_document","document":"document name","name":"template name"},
  {"type":"update_template","template":"template name","documents":["document names to follow (optional)"]},
  {"type":"draft_email","to":"email address, team member or contact name","subject":"…","intent":"what the email must say","project":"…","persona":"admin|coordinator|manager|ceo (optional)","tone":"professional|warm|formal|brief"},
  {"type":"reply_email","from":"sender name, company or email whose latest email to answer","intent":"what the reply must say","persona":"admin|coordinator|manager|ceo (optional)"},
  {"type":"briefing"}  (what needs attention today: overdue/due tasks, meetings, reminders, approvals, unread email),
  {"type":"read_email","from":"sender name, company or email"}  (emails are only ever saved as drafts for the person to check and send themselves — you never send email),
  {"type":"open_page","page":"approvals|tasks|gmail|calendar|drive|documents|legal|drafting|notes|projects|crm|marketing|designer|chat|settings|home"}  (when asked to open/go to a page or tab — the app navigates there),
  {"type":"open_item","kind":"project|task|deal|document","name":"…"},
  {"type":"list_approvals","scope":"mine|all"},
  {"type":"decide_approval","decision":"approved|rejected|changes_requested","title":"part of the item's title, or its number from the last list","note":"reason (required to reject or request changes)"},
  {"type":"update_task","title":"part of the task title","status":"done|in_progress|todo|blocked"},
  {"type":"save_rule","text":"the standing instruction, written clearly in one sentence","scope":"me|team"}  (when the person gives a standing command or rule to follow from now on: "from now on…", "always…", "never…", "whenever…", "remember…", "every time…". scope "team" only when they say it is for everyone/the team),
  {"type":"list_rules"},
  {"type":"forget_rule","rule":"its number or words from it"} ] }
Always prefer doing the thing (an action) over describing how to do it. Follow the STANDING RULES in your instructions for every answer and every action (for example the people to copy, the tone, the persona, reminders, durations, language).
Only include actions the user clearly asked for. Never invent people, projects, amounts or dates. If a required time or person is missing, ask instead of guessing. Use "actions": [] for plain questions.`;
  const messages: ChatMessage[] = [...(opts.history || []).slice(-8), { role: 'user', content: text }];
  const raw = await chat(provider, { system, messages, maxTokens: 3000, timeoutMs: 90_000 });
  const j = extractJson<any>(raw);
  const citations = sources.map(s => ({ citation: s.citation, document_id: s.document_id, document_name: s.document_name, authority: s.authority, excerpt: s.content.slice(0, 280) }));
  // Safety net: if the AI only talked but the message is a clear command the rules understand, do it.
  const ruleActions = () => { const a = parseCommand(text, ctx); return a && a.length ? a : null; };
  if (!j || typeof j !== 'object') {
    const ra = ruleActions();
    if (ra) { const results = await executeActions(ra, ctx); return { reply: results.map(r => `${r.ok ? '✅' : '⚠️'} ${r.summary}`).join('\n'), actions: results, engine: provider, citations }; }
    return { reply: raw.trim(), actions: [], engine: provider, citations };
  }
  let actions: AgentAction[] = (Array.isArray(j.actions) ? j.actions : []).filter((a: any) => a && typeof a.type === 'string' && AGENT_ACTION_TYPES.includes(a.type));
  if (!actions.length && ctx.canWrite) { const ra = ruleActions(); if (ra && ra.some(a => a.type !== 'list_tasks' && a.type !== 'briefing')) actions = ra; }
  const results = await executeActions(actions, ctx);
  const tail = results.length ? `\n\n${results.map(r => `${r.ok ? '✅' : '⚠️'} ${r.summary}`).join('\n')}` : '';
  return { reply: `${String(j.reply || '').trim()}${tail}`.trim() || 'Done.', actions: results, engine: provider, citations };
}
