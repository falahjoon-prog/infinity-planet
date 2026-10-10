'use client';
/**
 * Writing conversation: say what you want, get a draft, then keep talking to change it step by step.
 * Works with an AI writer or the built-in writer. Every change can be undone.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Send, Undo2, Sparkles, User } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useToast } from '@/components/ui';

export type WriteSettings = { template_id?: string | null; project_id?: string | null; deal_id?: string | null; recipient?: any; sender_id?: string | null; format?: 'document' | 'letter' | 'auto'; length?: string; provider?: string; kind?: string | null; title?: string | null; doc_date?: string | null };
type Msg = { id: number; role: 'user' | 'assistant'; content: string; prev?: string | null; undone?: boolean; engine?: string };

export function WriteChat({ doc, onDoc, settings, context, onDraft, starters, placeholder, intro }: {
  doc: string; onDoc: (content: string) => void; settings: WriteSettings; context: 'marketing' | 'drafting';
  onDraft?: (r: { title: string; recipient?: any; kind?: string; warning?: string | null; engine?: string }) => void;
  starters?: { label: string; text: string }[]; placeholder?: string; intro?: React.ReactNode;
}) {
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]); const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null); const boxRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);
  const grow = () => { const el = boxRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 260)}px`; };
  useEffect(grow, [text]);

  const send = async (raw?: string) => {
    const message = (raw ?? text).trim(); if (!message || busy) return;
    const id = Date.now();
    setMsgs(m => [...m, { id, role: 'user', content: message }]); setText(''); setBusy(true);
    try {
      const history = msgs.filter(m => !m.undone).map(m => ({ role: m.role, content: m.content }));
      const r = await api.post('/api/write/turn', { ...settings, message, history, doc, context });
      const prev = doc;
      if (r.content) { onDoc(r.content); if (!doc.trim()) onDraft?.({ title: r.title, recipient: r.recipient, kind: r.kind, warning: r.warning, engine: r.engine }); }
      setMsgs(m => [...m, { id: id + 1, role: 'assistant', content: r.reply || (r.content ? 'Done.' : 'No change.'), prev: r.content ? prev : null, engine: r.engine }]);
      if (r.warning && doc.trim()) toast(r.warning, 'info');
    } catch (e: any) {
      setMsgs(m => [...m, { id: id + 1, role: 'assistant', content: `Sorry — ${e.message}` }]);
    } finally { setBusy(false); setTimeout(() => boxRef.current?.focus(), 50); }
  };
  const undo = (m: Msg) => { if (m.prev == null) return; onDoc(m.prev); setMsgs(all => all.map(x => x.id === m.id ? { ...x, undone: true } : x)); };
  const lastChange = [...msgs].reverse().find(m => m.role === 'assistant' && m.prev != null && !m.undone);
  const quick: { label: string; text: string }[] = doc.trim()
    ? (context === 'drafting' ? ['Make it more protective of us', 'Add a clause about [topic]', 'Simplify the wording', 'Check for gaps'] : ['Shorter', 'More formal', 'Friendlier', 'Add a call to action']).map(x => ({ label: x.replace(/ \[topic\]/, '…'), text: x }))
    : (starters || []);
  /** A chip with [blanks] fills the box for you to finish (first blank selected); a complete one is sent straight away. */
  const useChip = (c: { label: string; text: string }) => {
    if (!c.text.includes('[')) { send(c.text); return; }
    setText(c.text);
    setTimeout(() => { const el = boxRef.current; if (!el) return; el.focus(); const a = c.text.indexOf('['), b = c.text.indexOf(']', a); if (a >= 0 && b > a) el.setSelectionRange(a, b + 1); }, 30);
  };

  return <div className="wchat">
    <div className="wchat-list" ref={listRef}>
      {!msgs.length && <div className="wchat-intro">{intro || <><b>What do you want to write?</b><p>Type it below in your own words. Then tell me what to change.</p></>}</div>}
      {msgs.map(m => <div key={m.id} className={`wmsg ${m.role}${m.undone ? ' undone' : ''}`}>
        <span className="wmsg-ic">{m.role === 'user' ? <User size={13} /> : <Sparkles size={13} />}</span>
        <div className="wmsg-body"><div className="wmsg-text">{m.content}</div>
          {m.role === 'assistant' && m.prev != null && <div className="wmsg-foot">{m.undone ? <span className="tiny muted">Undone</span> : m === lastChange ? <button className="link small" onClick={() => undo(m)}><Undo2 size={12} /> Undo this change</button> : null}{m.engine && <span className="tiny muted">{m.engine === 'builtin' ? 'Built-in writer' : m.engine}</span>}</div>}
        </div>
      </div>)}
      {busy && <div className="wmsg assistant"><span className="wmsg-ic"><Sparkles size={13} /></span><div className="wmsg-body"><div className="wmsg-text typing"><span /><span /><span /> {doc.trim() ? 'Changing the document…' : 'Writing — this can take up to a minute…'}</div></div></div>}
    </div>
    {quick.length > 0 && <div className="wchat-quick">{!doc.trim() && <span className="wchat-quick-l">Start from an example:</span>}{quick.map(q => <button key={q.label} disabled={busy} onClick={() => useChip(q)} title={q.text}>{q.label}</button>)}</div>}
    <div className="wchat-compose">
      <textarea ref={boxRef} rows={3} value={text} onChange={e => setText(e.target.value)} placeholder={placeholder || (doc.trim() ? 'Ask for a change…' : 'Describe what to write…')}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} disabled={busy} />
      <button className="btn primary wchat-send" onClick={() => send()} disabled={busy || !text.trim()} aria-label="Send"><Send size={16} /></button>
    </div>
    <div className="wchat-hint tiny muted">Enter to send · Shift+Enter for a new line</div>
  </div>;
}
