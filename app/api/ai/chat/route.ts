import { aiInstructions, getBrand, possessive, AI_NAME, SEARCH_NAME, APP_NAME } from '@/lib/brand';
import { NextRequest } from 'next/server';
import { route, ok, body, must, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { chat, isProvider, providerStatus, ChatMessage, PROVIDER_LABEL } from '@/lib/providers';
import { retrieveChunks, formatSources, Source, AUTHORITY_LABEL } from '@/lib/retrieval';
import { getSetting } from '@/lib/settings';
import { writeAudit } from '@/lib/audit';
import { runAgent } from '@/lib/agent';
import { brandBookExcerpt } from '@/lib/brand-book';
export const maxDuration = 300;

async function projectContext(projectId: string) {
  const db = getSupabaseAdmin();
  const [p, deals, tasks, notes, reviews, events] = await Promise.all([
    db.from('projects').select('name,description,project_type,status,risk,deal_value,location,counterparty,next_action,next_action_at,highlights').eq('id', projectId).single(),
    db.from('deals').select('title,stage,probability,counterparty,expected_value,next_action,next_action_at').eq('project_id', projectId).limit(20),
    db.from('tasks').select('title,status,priority,due_at').eq('project_id', projectId).neq('status', 'done').order('due_at', { ascending: true, nullsFirst: false }).limit(30),
    db.from('notes').select('title,body,important,created_at').eq('project_id', projectId).order('important', { ascending: false }).order('created_at', { ascending: false }).limit(15),
    db.from('contract_reviews').select('title,status,risk_rating,analysis->executive_summary,created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(5),
    db.from('calendar_events').select('title,starts_at,location').eq('project_id', projectId).gte('starts_at', new Date().toISOString()).order('starts_at').limit(10),
  ]);
  if (p.error) return '';
  const lines = [`PROJECT: ${p.data.name} — status ${p.data.status}, risk ${p.data.risk}${p.data.deal_value ? `, value $${Number(p.data.deal_value).toLocaleString('en-AU')}` : ''}${p.data.location ? `, ${p.data.location}` : ''}`];
  if (p.data.description) lines.push(`Description: ${p.data.description}`);
  if (p.data.counterparty) lines.push(`Counterparty: ${p.data.counterparty}`);
  if (p.data.next_action) lines.push(`Next action: ${p.data.next_action}${p.data.next_action_at ? ` (by ${p.data.next_action_at.slice(0, 10)})` : ''}`);
  if (p.data.highlights) lines.push(`Highlights: ${p.data.highlights}`);
  if (deals.data?.length) lines.push('Deals:\n' + deals.data.map(d => `- ${d.title || d.counterparty}: ${d.stage}, ${d.probability}%${d.expected_value ? `, $${Number(d.expected_value).toLocaleString('en-AU')}` : ''}${d.next_action ? `, next: ${d.next_action}` : ''}`).join('\n'));
  if (tasks.data?.length) lines.push('Open tasks:\n' + tasks.data.map(t => `- ${t.title} [${t.status}, ${t.priority}${t.due_at ? `, due ${t.due_at.slice(0, 10)}` : ''}]`).join('\n'));
  if (notes.data?.length) lines.push('Notes:\n' + notes.data.map(n => `- ${n.important ? '(IMPORTANT) ' : ''}${n.title}: ${String(n.body).slice(0, 400)}`).join('\n'));
  if (reviews.data?.length) lines.push('Legal reviews:\n' + reviews.data.map((r: any) => `- ${r.title}: ${r.risk_rating || 'unrated'} risk, ${r.status}`).join('\n'));
  if (events.data?.length) lines.push('Upcoming meetings:\n' + events.data.map(e => `- ${e.starts_at.slice(0, 16).replace('T', ' ')} ${e.title}`).join('\n'));
  return lines.join('\n');
}

export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  const message = must<string>(String(b.message || '').trim(), 'Type a message');
  const mode = String(b.provider || 'search');
  const projectId: string | null = b.project_id || null;
  const documentIds: string[] = Array.isArray(b.document_ids) ? b.document_ids.slice(0, 10) : [];
  const db = getSupabaseAdmin();
  if (mode !== 'search' && !isProvider(mode)) throw new HttpError(400, 'Unknown provider');
  if (isProvider(mode) && !providerStatus()[mode]) throw new HttpError(409, `${PROVIDER_LABEL[mode]} is not configured on the Infinity Planet server. Choose another provider or "${SEARCH_NAME} (no AI)".`);

  let conversationId: string | null = b.conversation_id || null;
  if (conversationId) {
    const { data } = await db.from('ai_conversations').select('id').eq('id', conversationId).maybeSingle();
    if (!data) conversationId = null;
  }
  if (!conversationId) {
    const { data, error } = await db.from('ai_conversations').insert({ title: message.slice(0, 90), provider: mode, project_id: projectId, created_by: actor.id }).select('id').single();
    if (error) throw error; conversationId = data.id;
  }
  const { data: history } = await db.from('ai_messages').select('role,content').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(12);
  await db.from('ai_messages').insert({ conversation_id: conversationId, role: 'user', content: message, provider: mode, metadata: { document_ids: documentIds, project_id: projectId, by: actor.id } });

  // What's on the person's screen (open contract, document, email…, highlighted text)
  const { parseScreen, describeScreen, screenPrompt, screenAnswer } = await import('@/lib/screen-context');
  const screen = parseScreen(b.screen); const shown = screen ? await describeScreen(actor, screen) : null;
  if (screen && mode === 'search') {
    const brandS = await getBrand();
    const built = await screenAnswer(message, screen, shown, brandS.short_name).catch(() => null);
    if (built) {
      const { data: saved } = await db.from('ai_messages').insert({ conversation_id: conversationId, role: 'assistant', content: built, provider: 'search', metadata: { citations: [], engine: 'rules', screen: { item: screen.item, selection: !!screen.selection } } }).select('id,created_at').single();
      await db.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
      return ok({ conversation_id: conversationId, message: { id: saved?.id, role: 'assistant', content: built, provider: 'search', created_at: saved?.created_at, metadata: { citations: [], engine: 'rules' } } });
    }
  }
  // Standing rules ("from now on…", "always…", "show my rules", "forget rule 2") are saved from any chat.
  const { parseRule, parseForget, isListRules } = await import('@/lib/ai-rules');
  if (b.allow_actions || parseRule(message) || parseForget(message) || isListRules(message)) {
    // Assistant mode: the AI bot can also create tasks, reminders, meetings, notes and documents.
    const r = await runAgent({ actor, text: message, projectId, provider: mode === 'search' ? 'rules' : mode, screen: screen ? screenPrompt(screen, shown) : undefined, attachments: shown?.text ? [{ name: `${shown.title} (open on screen)`, text: shown.text }] : undefined, history: (history || []).reverse().filter(h => h.role !== 'system').map(h => ({ role: h.role === 'assistant' ? 'assistant' as const : 'user' as const, content: h.content })) });
    const content = `${r.note ? `_${r.note}_\n\n` : ''}${r.reply}`;
    const { data: saved } = await db.from('ai_messages').insert({ conversation_id: conversationId, role: 'assistant', content, provider: r.engine === 'rules' ? 'search' : r.engine, metadata: { citations: r.citations || [], actions: r.actions, engine: r.engine } }).select('id,created_at').single();
    await db.from('ai_conversations').update({ updated_at: new Date().toISOString(), project_id: projectId }).eq('id', conversationId);
    await writeAudit({ actorId: actor.id, action: 'ai.message', entityType: 'ai_conversation', entityId: conversationId, metadata: { provider: r.engine, actions: r.actions.length, project_id: projectId } });
    return ok({ conversation_id: conversationId, message: { id: saved?.id, role: 'assistant', content, provider: r.engine === 'rules' ? 'search' : r.engine, created_at: saved?.created_at, metadata: { citations: r.citations || [], actions: r.actions, engine: r.engine } } });
  }
  const [attached, knowledge] = await Promise.all([
    documentIds.length ? retrieveChunks(message, { documentIds, limit: 8, prefix: 'DOC' }) : Promise.resolve([] as Source[]),
    b.use_knowledge === false ? Promise.resolve([] as Source[]) : retrieveChunks(message, { projectId: b.knowledge_scope === 'project' ? projectId : null, limit: 8, prefix: 'KB' }).then(async found => {
      if (found.length >= 2 || documentIds.length) return found;
      // Nothing in the knowledge base yet: search the linked Google Drive directly and read the best matches.
      const { liveDriveSearch, kickDriveSync } = await import('@/lib/drive-live');
      kickDriveSync();
      const drive = await liveDriveSearch(message).catch(() => []);
      if (!drive.length) return found;
      const more = await retrieveChunks(message, { documentIds: drive.map(d => d.id), limit: 8, prefix: 'KB' }).catch(() => [] as Source[]);
      return [...found, ...more.filter(m => !found.some(f => f.chunk_id === m.chunk_id))].slice(0, 8).map((x, i) => ({ ...x, citation: `[KB-${i + 1}]` }));
    }),
  ]);
  const knowledgeFiltered = knowledge.filter(k => !attached.some(a => a.chunk_id === k.chunk_id));
  const sources = [...attached, ...knowledgeFiltered];
  const citations = sources.map(s => ({ citation: s.citation, document_id: s.document_id, document_name: s.document_name, authority: s.authority, chunk_id: s.chunk_id, ordinal: s.ordinal, excerpt: s.content.slice(0, 280) }));

  let answer: string;
  const brand = await getBrand();
  if (mode === 'search') {
    answer = sources.length
      ? `**${SEARCH_NAME}** (built-in, no AI model) found ${sources.length} relevant passage${sources.length === 1 ? '' : 's'}:\n\n` + sources.slice(0, 8).map(s => `${s.citation} **${s.document_name}** · ${AUTHORITY_LABEL[s.authority || 'draft']}\n> ${s.content.replace(/\s+/g, ' ').slice(0, 420)}${s.content.length > 420 ? '…' : ''}`).join('\n\n') + '\n\nConnect an AI provider in Settings to get written answers with these citations.'
      : `${SEARCH_NAME} found no matching passages in ${brand.short_name} documents. Try different keywords, upload the relevant documents, or connect an AI provider in Settings.`;
  } else {
    const instructions = await aiInstructions(actor.id);
    const brandBook = await brandBookExcerpt(1500).catch(() => '');
    const ctx = projectId ? await projectContext(projectId) : '';
    const { userLanguage, LANGUAGE_RULE } = await import('@/lib/user-lang');
    const lang = /[\u0600-\u06FF]/.test(message) ? 'fa' : await userLanguage(actor.id).catch(() => 'en');
    const system = [
      instructions,
      lang === 'fa' ? LANGUAGE_RULE : '',
      `Today is ${new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' })}. The user is ${actor.full_name || actor.email} (${actor.role}).`,
      `Authority labels on sources: APPROVED = approved ${brand.short_name} position; PREFERRED/FALLBACK = negotiation positions; HISTORICAL PRECEDENT = reference only, never treat as approved; DRAFT = unapproved.`,
      brandBook ? `\nBRAND BOOK (follow for tone and naming):\n${brandBook}` : '',
      ctx ? `\nPROJECT CONTEXT (from ${brand.business_name} records):\n${ctx}` : '',
      screen ? `\nON THE PERSON'S SCREEN RIGHT NOW:\n${screenPrompt(screen, shown)}${shown?.text ? `\n<<${shown.title}>>\n${shown.text.slice(0, 40000)}\n<</${shown.title}>>` : ''}` : '',
      attached.length ? `\nATTACHED DOCUMENT EXCERPTS (cite as [DOC-n]):\n${formatSources(attached)}` : '',
      knowledgeFiltered.length ? `\nRETRIEVED ${brand.short_name.toUpperCase()} KNOWLEDGE (cite as [KB-n]):\n${formatSources(knowledgeFiltered)}` : `\nNo matching ${brand.short_name} knowledge was retrieved for this question.`,
      '\nCite sources inline with their tags when you use them. If the records do not contain the answer, say so plainly.',
    ].filter(Boolean).join('\n');
    const msgs: ChatMessage[] = [...(history || []).reverse().map(h => ({ role: h.role === 'assistant' ? 'assistant' as const : 'user' as const, content: h.content })), { role: 'user', content: message }];
    try { answer = await chat(mode as any, { system, messages: msgs, maxTokens: 2500 }); }
    catch (e: any) {
      await db.from('ai_messages').insert({ conversation_id: conversationId, role: 'system', content: `Provider error: ${e?.message}`, provider: mode });
      throw new HttpError(502, e?.message || 'AI provider failed');
    }
  }
  const usedDocs = [...new Set(citations.filter(c => answer.includes(c.citation) || mode === 'search').map(c => c.document_id))];
  const { data: saved } = await db.from('ai_messages').insert({ conversation_id: conversationId, role: 'assistant', content: answer, provider: mode, source_ids: usedDocs, metadata: { citations } }).select('id,created_at').single();
  await db.from('ai_conversations').update({ provider: mode, updated_at: new Date().toISOString(), project_id: projectId }).eq('id', conversationId);
  await writeAudit({ actorId: actor.id, action: 'ai.message', entityType: 'ai_conversation', entityId: conversationId, metadata: { provider: mode, sources: citations.length, project_id: projectId } });
  return ok({ conversation_id: conversationId, message: { id: saved?.id, role: 'assistant', content: answer, provider: mode, created_at: saved?.created_at, metadata: { citations } } });
});
