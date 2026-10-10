'use client';
import { Translate } from '@/components/translate';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Send, Paperclip, Plus, History, X, Sparkles, Search, Upload, FileText, Database, Zap, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useBrand, InfinityMark } from '@/lib/client/brand';
import { api, useApi } from '@/lib/client/api';
import { useApp } from './app-context';
import { Markdown, Modal, Button, useToast, Loading, Empty } from './ui';
import { DocViewer } from './doc-viewer';
import { ProjectSelect } from './pickers';
import { ago } from '@/lib/client/format';
import { quickNav } from '@/lib/client/quick-nav';

type Msg = { id?: string; role: string; content: string; provider?: string; created_at?: string; metadata?: { citations?: any[]; actions?: { type: string; ok: boolean; summary: string; href?: string }[]; engine?: string } };

export function AiChat({ projectId: fixedProject, initial, height = 620, conversation, onConversation, sidebar, bare, screen }: { projectId?: string; initial?: string; height?: number | string; conversation?: string | null; onConversation?: (id: string | null) => void; sidebar?: boolean; bare?: boolean; screen?: () => any }) {
  const { status, can } = useApp();
  const brand = useBrand();
  const [actionsOn, setActionsOnState] = useState(true);
  useEffect(() => { try { if (localStorage.getItem('ip-ai-actions') === 'off') setActionsOnState(false); } catch {} }, []);
  const setActionsOn = (f: (a: boolean) => boolean) => setActionsOnState(a => { const v = f(a); try { localStorage.setItem('ip-ai-actions', v ? 'on' : 'off'); } catch {} return v; });
  const router = useRouter();
  const toast = useToast();
  const configured = (status?.providers || []).filter(p => p.configured);
  const [provider, setProvider] = useState<string>('');
  const [projectId, setProjectId] = useState<string | null>(fixedProject || null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [attached, setAttached] = useState<{ id: string; name: string }[]>([]);
  const [pickDocs, setPickDocs] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [viewDoc, setViewDoc] = useState<{ id: string; q?: string } | null>(null);
  const [useKnowledge, setUseKnowledge] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  useEffect(() => { if (!provider && status) { let saved = ''; try { saved = localStorage.getItem('rhc-ai-provider') || ''; } catch {} setProvider(configured.some(p => p.id === saved) || saved === 'search' ? saved : configured[0]?.id || 'search'); } }, [status]); // eslint-disable-line
  useEffect(() => { const el = box.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);
  useEffect(() => { if (initial && provider && !sentInitial.current) { sentInitial.current = true; send(initial); } }, [initial, provider]); // eslint-disable-line

  const choose = (p: string) => { setProvider(p); try { localStorage.setItem('rhc-ai-provider', p); } catch {} };
  async function send(q?: string) {
    const message = (q ?? text).trim(); if (!message || busy) return;
    const nav = !attached.length ? quickNav(message) : null;
    if (nav) { setText(''); setMessages(m => [...m, { role: 'user', content: message }, { role: 'assistant', content: `Opening **${nav.label}**.`, provider: 'search' }]); router.push(nav.href); return; }
    setText(''); setBusy(true);
    setMessages(m => [...m, { role: 'user', content: message }]);
    try {
      const r = await api.post('/api/ai/chat', { message, provider: provider || 'search', conversation_id: conversationId, project_id: projectId, document_ids: attached.map(a => a.id), use_knowledge: useKnowledge, allow_actions: actionsOn && !attached.length, screen: screen?.() || undefined });
      if (r.conversation_id !== conversationId) { setConversationId(r.conversation_id); onConversation?.(r.conversation_id); }
      setMessages(m => [...m, r.message]);
      const go = (r.message?.metadata?.actions || []).find((x: any) => x.ok && x.navigate && x.href); if (go) router.push(go.href);
    } catch (e: any) { setMessages(m => [...m, { role: 'system', content: e.message }]); }
    finally { setBusy(false); }
  }
  const openConversation = async (id: string) => {
    setShowHistory(false);
    try { const r = await api.get(`/api/ai/conversations/${id}`); setConversationId(id); setMessages(r.messages); if (!fixedProject) setProjectId(r.conversation.project_id); } catch (e: any) { toast(e.message, 'error'); }
  };
  const reset = () => { setConversationId(null); setMessages([]); setAttached([]); onConversation?.(null); };
  useEffect(() => { if (conversation === undefined) return; if (conversation && conversation !== conversationId) openConversation(conversation); else if (!conversation && conversationId) { setConversationId(null); setMessages([]); setAttached([]); } }, [conversation]); // eslint-disable-line
  const citeClick = (m: Msg, tag: string) => { const c = m.metadata?.citations?.find(x => x.citation === tag); if (c) setViewDoc({ id: c.document_id, q: c.excerpt }); };
  const suggestions = fixedProject
    ? ['Summarise this project and its biggest risks', 'What are the next actions and who owns them?', 'Draft an update email to the investor', 'What legal issues are open?']
    : ['What needs my attention today?', 'What are my tasks?', 'Remind me tomorrow 9am to call the bank', 'Show my approvals', 'Which deals are most at risk and why?'];

  return <section className="card ai" style={{ height }}>
    <div className="ai-head">
      {!bare && <><InfinityMark size={20} /><b style={{ fontSize: 13.5 }}>{brand.ai_name}</b></>}
      <select className="select sm" style={{ width: 'auto', maxWidth: 190 }} value={provider} onChange={e => choose(e.target.value)} title="AI provider">
        <option value="search">Built-in (no AI key)</option>
        {(status?.providers || []).map(p => <option key={p.id} value={p.id} disabled={!p.configured}>{p.label}{p.configured ? '' : ' — not connected'}</option>)}
      </select>
      {!fixedProject && !bare && <ProjectSelect value={projectId} onChange={setProjectId} noneLabel={`All of ${brand.short_name}`} className="select sm" />}
      <span className="spacer" />
      <button className={`ai-tog${actionsOn ? ' on act' : ''}`} title={actionsOn ? 'Actions on: it can open pages, approve, create and update tasks, reminders, meetings, notes, documents and emails. Click to turn off.' : 'Actions off: answers only. Click to turn on.'} onClick={() => setActionsOn(a => !a)}><Zap size={14} /><span>Actions</span></button>
      <button className={`ai-tog${useKnowledge ? ' on kn' : ''}`} title={useKnowledge ? `Using ${brand.short_name} documents. Click to turn off.` : `Not using ${brand.short_name} documents. Click to turn on.`} onClick={() => setUseKnowledge(k => !k)}><Database size={14} /><span>Files</span></button>
      {!sidebar && <button className="icon-btn" title="History" onClick={() => setShowHistory(true)}><History size={15} /></button>}
      <button className="icon-btn" title="New chat" onClick={reset}><Plus size={16} /></button>
    </div>
    <div className="ai-msgs" ref={box}>
      {messages.length === 0 && <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 520 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><InfinityMark size={46} /></div>
        <b style={{ fontSize: 15 }}>{fixedProject ? 'Ask about this project' : `How can ${brand.ai_name} help?`}</b>
        <p className="muted small mt8">Answers use {brand.short_name} records, documents and your attachments, with citations.{actionsOn ? ' With Actions on, it can also create tasks, reminders, meetings, notes, documents (MOU, offers, reports) and designs for you.' : ''} {provider === 'search' ? `${brand.search_name} mode runs without an AI key — connect a provider in Settings for written answers.` : ''}</p>
        <div className="chips mt16" style={{ justifyContent: 'center' }}>{suggestions.map(s => <button key={s} className="chip" onClick={() => send(s)} disabled={!can.write}>{s}</button>)}</div>
      </div>}
      {messages.map((m, i) => m.role === 'user'
        ? <div key={i} className="msg user" dir="auto">{m.content}</div>
        : m.role === 'system' ? <div key={i} className="msg system">⚠ {m.content}</div>
        : <div key={i} className="msg assistant"><div className="by"> {m.metadata?.engine === 'rules' ? <><Zap size={12} /> {brand.ai_name} (built-in)</> : m.provider === 'search' ? <><Search size={12} /> {brand.search_name}</> : <><Sparkles size={12} /> {(status?.providers || []).find(p => p.id === m.provider)?.label || m.provider}</>}{m.created_at && <span>· {ago(m.created_at)}</span>}</div>
          <div className="bubble" dir="auto"><Markdown text={m.content} onCite={t => citeClick(m, t)} /><Translate text={m.content} />
            {!!m.metadata?.actions?.length && <div className="action-chips">{m.metadata.actions.filter(a => a.href || !a.ok).map((a, k) => a.href && a.ok ? <Link key={k} href={a.href} className="action-chip ok"><CheckCircle2 size={12} />Open {a.type.replace(/^(create|set|add|generate|review|list)_/, '').replace(/_/g, ' ')}</Link> : <span key={k} className="action-chip fail"><AlertTriangle size={12} />{a.type.replace(/_/g, ' ')} not done</span>)}</div>}
            {!!m.metadata?.citations?.length && <div className="cites">{m.metadata.citations.filter(c => m.provider === 'search' || m.content.includes(c.citation)).slice(0, 10).map(c => <button key={c.citation} className="cite" onClick={() => setViewDoc({ id: c.document_id, q: c.excerpt })} title={c.excerpt}><b>{c.citation.slice(1, -1)}</b><span className="ellipsis">{c.document_name}</span></button>)}</div>}
          </div></div>)}
      {busy && <div className="msg assistant"><div className="bubble row"><span className="spin" /> <span className="muted small">{provider === 'search' ? `Working on it…` : `Thinking with ${brand.short_name} context…`}</span></div></div>}
    </div>
    <div className="composer">
      {attached.length > 0 && <div className="chips">{attached.map(a => <span key={a.id} className="chip"><FileText size={12} />{a.name}<button className="x" onClick={() => setAttached(x => x.filter(y => y.id !== a.id))}><X size={12} /></button></span>)}</div>}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <button className="icon-btn" title="Attach documents" onClick={() => setPickDocs(true)} disabled={!can.write}><Paperclip size={18} /></button>
        <textarea rows={1} placeholder={can.write ? (actionsOn ? `Ask anything, or give ${brand.ai_name} a task…` : `Ask anything about ${brand.short_name} projects, deals, documents…`) : 'Viewers cannot use AI chat'} value={text} disabled={!can.write} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn primary" style={{ height: 46, width: 46, padding: 0 }} onClick={() => send()} disabled={busy || !text.trim()} aria-label="Send"><Send size={17} /></button>
      </div>
    </div>
    <AttachPicker open={pickDocs} onClose={() => setPickDocs(false)} projectId={projectId} selected={attached} onDone={setAttached} />
    <Modal open={showHistory} onClose={() => setShowHistory(false)} title="Conversations"><HistoryList projectId={fixedProject} onOpen={openConversation} /></Modal>
    <DocViewer id={viewDoc?.id || null} highlight={viewDoc?.q} onClose={() => setViewDoc(null)} />
  </section>;
}

function HistoryList({ projectId, onOpen }: { projectId?: string; onOpen: (id: string) => void }) {
  const { data, loading } = useApi<any>(`/api/ai/conversations${projectId ? `?project_id=${projectId}&mine=0` : ''}`);
  if (loading) return <Loading />;
  if (!data?.conversations?.length) return <Empty title="No conversations yet" />;
  return <div className="list">{data.conversations.map((c: any) => <button key={c.id} className="list-item" onClick={() => onOpen(c.id)}><div className="main-col"><div className="title">{c.title}</div><div className="meta">{c.project?.name ? `${c.project.name} · ` : ''}{c.provider} · {ago(c.updated_at)}</div></div></button>)}</div>;
}

function AttachPicker({ open, onClose, projectId, selected, onDone }: { open: boolean; onClose: () => void; projectId: string | null; selected: { id: string; name: string }[]; onDone: (x: { id: string; name: string }[]) => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(selected);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const { data, reload } = useApi<any>(open ? `/api/documents?limit=300${projectId ? `&project_id=${projectId}` : ''}` : null, [open, projectId]);
  useEffect(() => { if (open) setSel(selected); }, [open]); // eslint-disable-line
  const docs = (data?.documents || []).filter((d: any) => !q || d.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (d: any) => setSel(s => s.some(x => x.id === d.id) ? s.filter(x => x.id !== d.id) : [...s, { id: d.id, name: d.name }].slice(0, 10));
  const upload = async (files: FileList | null) => {
    if (!files?.length) return; setUploading(true);
    const fd = new FormData(); Array.from(files).forEach(f => fd.append('file', f)); if (projectId) fd.append('project_id', projectId);
    try { const r = await api.post('/api/documents/upload', fd); const ok = r.results.filter((x: any) => x.document); setSel(s => [...s, ...ok.map((x: any) => ({ id: x.document.id, name: x.document.name }))].slice(0, 10)); reload(); toast(`${ok.length} uploaded and indexed`, 'success'); }
    catch (e: any) { toast(e.message, 'error'); } finally { setUploading(false); }
  };
  return <Modal open={open} onClose={onClose} title="Attach documents" size="wide" footer={<><span className="muted small" style={{ marginRight: 'auto' }}>{sel.length}/10 selected</span><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { onDone(sel); onClose(); }}>Attach</Button></>}>
    <div className="row mb12"><div className="search-input" style={{ flex: 1 }}><Search size={15} /><input className="input" placeholder="Filter documents" value={q} onChange={e => setQ(e.target.value)} /></div>
      <label className="btn"><Upload size={15} />{uploading ? 'Uploading…' : 'Upload new'}<input type="file" multiple hidden onChange={e => upload(e.target.files)} /></label></div>
    <div className="list card" style={{ maxHeight: 420, overflowY: 'auto' }}>
      {docs.length === 0 && <Empty title="No documents" />}
      {docs.map((d: any) => <label key={d.id} className="list-item clickable"><input type="checkbox" checked={sel.some(x => x.id === d.id)} onChange={() => toggle(d)} /><div className="main-col"><div className="title">{d.name}</div><div className="meta">{d.project?.name || 'Unassigned'} · {d.status}</div></div></label>)}
    </div>
  </Modal>;
}
