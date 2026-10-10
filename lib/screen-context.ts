/**
 * What the person has open (sent by the app with each AI message): the page, the open item
 * (contract review, document, email, draft, project, deal, presentation) and any highlighted text.
 * Infinity AI reads it so "what does this clause mean?" is answered about the right thing.
 * Access is checked: an item is only read if the person may open that area.
 */
import { getSupabaseAdmin } from './supabase';
import type { Actor } from './auth';
import { hasArea, pageArea } from './access';
import { findTerms, whereUsed } from './legal/glossary';

export type Screen = { path: string; page: string; item: { kind: string; id: string; title?: string } | null; selection: string | null };
export type ScreenDetail = { kind: string; label: string; title: string; text: string; summary?: string };

const KIND_PATH: Record<string, string> = { legal_review: '/legal', document: '/documents', email: '/gmail', project: '/projects', deal: '/crm', draft: '/drafting', deck: '/presentations' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseScreen(x: any): Screen | null {
  if (!x || typeof x !== 'object') return null;
  const item = x.item && typeof x.item === 'object' && KIND_PATH[x.item.kind] && typeof x.item.id === 'string' && (UUID.test(x.item.id) || (x.item.kind === 'email' && /^[\w-]{6,64}$/.test(x.item.id))) ? { kind: x.item.kind, id: x.item.id, title: typeof x.item.title === 'string' ? x.item.title.slice(0, 160) : undefined } : null;
  const selection = typeof x.selection === 'string' && x.selection.trim() ? x.selection.replace(/\s+/g, ' ').trim().slice(0, 2000) : null;
  if (!item && !selection) return null;
  return { path: String(x.path || '').slice(0, 200), page: String(x.page || '').slice(0, 40), item, selection };
}

export async function describeScreen(actor: Actor, s: Screen): Promise<ScreenDetail | null> {
  if (!s.item) return null;
  const { kind, id } = s.item;
  if (!hasArea(actor.role, actor.areas, pageArea(KIND_PATH[kind]))) return null;
  const db = getSupabaseAdmin();
  try {
    if (kind === 'legal_review') {
      const { reviewSource } = await import('./legal/amend-store');
      const { review, text } = await reviewSource(id); const a: any = review.analysis || {};
      const findings = (a.findings || []).slice(0, 8).map((f: any) => `- [${String(f.severity || '').toUpperCase()}] ${f.title}${f.clause_ref ? ` (clause ${f.clause_ref})` : ''}: ${String(f.issue || '').slice(0, 160)} → ${String(f.recommendation || '').slice(0, 160)}`).join('\n');
      return { kind, label: 'contract under review', title: review.title, text, summary: [a.executive_summary ? `Review summary: ${String(a.executive_summary).slice(0, 1200)}` : '', a.overall_risk?.rating ? `Overall risk: ${a.overall_risk.rating}` : '', findings ? `Main findings:\n${findings}` : ''].filter(Boolean).join('\n') };
    }
    if (kind === 'document') { const { data } = await db.from('documents').select('name,content_text').eq('id', id).maybeSingle(); return data ? { kind, label: 'document', title: data.name, text: String(data.content_text || '') } : null; }
    if (kind === 'draft') { const { data } = await db.from('generated_documents').select('title,body,status').eq('id', id).maybeSingle(); return data ? { kind, label: `draft (${data.status})`, title: data.title, text: String(data.body || '') } : null; }
    if (kind === 'project') { const { data: p } = await db.from('projects').select('*').eq('id', id).maybeSingle(); if (!p) return null; return { kind, label: 'project', title: p.name, text: [`Project: ${p.name}`, p.description, p.status && `Status: ${p.status}`, p.risk && `Risk: ${p.risk}`, p.deal_value && `Value: $${Number(p.deal_value).toLocaleString('en-AU')}`, p.location && `Location: ${p.location}`, p.counterparty && `Counterparty: ${p.counterparty}`, p.next_action && `Next action: ${p.next_action}`, p.highlights && `Highlights: ${p.highlights}`].filter(Boolean).join('\n') }; }
    if (kind === 'deal') { const { data: d } = await db.from('deals').select('*').eq('id', id).maybeSingle(); if (!d) return null; return { kind, label: 'deal', title: d.title || d.counterparty || 'Deal', text: Object.entries(d).filter(([k, v]) => v != null && v !== '' && !/(_id|^id|created|updated)$/.test(k)).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n').slice(0, 6000) }; }
    if (kind === 'deck') { const { data } = await db.from('marketing_assets').select('title,content').eq('id', id).maybeSingle(); return data ? { kind, label: 'presentation', title: data.title, text: String(data.content || '') } : null; }
    if (kind === 'email') {
      const { googleConnected } = await import('./drive-live'); if (!(await googleConnected().catch(() => false))) return null;
      const { readMessage } = await import('./email-history'); const m: any = await readMessage(id, actor.id);
      return { kind, label: 'email', title: m.subject || '(no subject)', text: `From: ${m.from}\nTo: ${m.to || ''}\nDate: ${m.date || ''}\nSubject: ${m.subject || ''}\n\n${String(m.clean || m.body || '').slice(0, 20000)}` };
    }
  } catch { return null; }
  return null;
}

/** The block added to the AI's instructions. */
export function screenPrompt(s: Screen, d: ScreenDetail | null): string {
  const parts = [`The person is on the ${s.page || 'app'} page${d ? `, with the ${d.label} “${d.title}” open` : ''}. When they say “this”, “here”, “this clause”, “this email” or ask about a term, they mean what is on their screen — answer about it directly, quoting the exact words and clause numbers. Explain legal and financial terms in plain English and say what they mean for ${'us'} (the business), including any risk and what to ask for instead.`];
  if (s.selection) parts.push(`TEXT THEY HIGHLIGHTED:\n«${s.selection}»`);
  if (d?.summary) parts.push(d.summary);
  return parts.join('\n\n');
}

const EXPLAIN = /\b(explain|mean|meaning|means|what is|what's|what are|define|definition|plain english|understand)\b/i;
const RISK = /\b(risk|risky|dangerous|bad for us|safe|red flag|concern|problem|unfair|watch out)\b/i;
const TRANSLATE = /\b(translate|farsi|persian)\b/i;

/** Built-in answer (no AI key) about the highlighted text or the open item. Null when it can't help. */
export async function screenAnswer(message: string, s: Screen, d: ScreenDetail | null, ourName: string): Promise<string | null> {
  const focus = s.selection || '';
  const doc = d?.text || '';
  if (TRANSLATE.test(message) && focus) return 'Translating needs an AI connected (Settings → AI → add a free Gemini key, or start Ollama). Everything else here works without one.';
  if (RISK.test(message) && (focus || (doc && ['legal_review', 'document', 'draft'].includes(d?.kind || '')))) {
    const { analyseAgreement } = await import('./legal/engine');
    const text = focus && focus.length > 40 ? focus : doc;
    if (!text.trim()) return null;
    const a = analyseAgreement({ text, ourName });
    const fs = (a.findings || []).slice(0, 5);
    const terms = findTerms(focus || message, 2);
    const out = [fs.length ? `**The built-in Legal AI rules flag ${fs.length} point${fs.length === 1 ? '' : 's'} in ${focus ? 'the text you highlighted' : `“${d?.title}”`}:**\n${fs.map((f: any) => `- **${String(f.severity).toUpperCase()} — ${f.title}**${f.clause_ref ? ` (clause ${f.clause_ref})` : ''}: ${f.issue || ''}${f.recommendation ? `\n  _Ask for:_ ${f.recommendation}` : ''}`).join('\n')}` : `The built-in Legal AI rules found **no red flags** in ${focus ? 'the text you highlighted' : 'this document'}.`];
    for (const t of terms) out.push(`**${t.term}** — ${t.means}\n_What to watch for us:_ ${t.watch}`);
    out.push('_Connect an AI (Settings → AI) for a full written opinion on this exact wording._');
    return out.join('\n\n');
  }
  if (EXPLAIN.test(message) || (focus && message.length < 160)) {
    const terms = findTerms(`${focus} ${message}`, 2);
    if (terms.length) {
      return terms.map(t => { const used = whereUsed(doc, t.term).concat(...(t.also || []).map(a => whereUsed(doc, a, 1))).slice(0, 2); return `**${t.term}** — ${t.means}\n\n**What to watch for us:** ${t.watch}${used.length ? `\n\n**Where it appears in “${d?.title}”:**\n${used.map(u => `> ${u}`).join('\n')}` : ''}`; }).join('\n\n---\n\n') + (focus && focus.length > 120 ? '\n\n_That explains the key term. Connect an AI (Settings → AI) to have the whole passage explained line by line._' : '');
    }
    if (focus) {
      const used = whereUsed(doc, focus.slice(0, 60), 1);
      return `I don't have a built-in explanation for “${focus.length > 80 ? `${focus.slice(0, 77)}…` : focus}”.${used.length ? `\n\nIt appears here:\n> ${used[0]}` : ''}\n\nConnect an AI in Settings → AI (a free Gemini key works) and I'll explain any wording in plain English, with what it means for ${ourName}.`;
    }
  }
  return null;
}
