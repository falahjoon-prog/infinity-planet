'use client';
/** Highlight words anywhere (a contract term, a sentence in an email) and ask Infinity AI about them straight away. */
import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Sparkles, BookOpen, ShieldAlert, Languages, MessageSquare } from 'lucide-react';

export function askAi(q: string, selection?: string | null) { window.dispatchEvent(new CustomEvent('ip-ai-ask', { detail: { q, selection: selection || null } })); }

export function SelectionAsk() {
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  const [typing, setTyping] = useState(false); const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  // moving to another page or tab closes it
  const pathname = usePathname(); const sp = useSearchParams(); const where = `${pathname}?${sp?.toString() || ''}`;
  useEffect(() => { setSel(null); setTyping(false); }, [where]);
  useEffect(() => {
    let t: any;
    const check = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const s = window.getSelection(); const text = s && !s.isCollapsed ? s.toString().replace(/\s+/g, ' ').trim() : '';
        if (!s || !text || text.length < 2 || text.length > 2000 || !s.rangeCount) { if (!ref.current?.contains(document.activeElement)) { setSel(null); setTyping(false); } return; }
        const node = s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement;
        if (!node || node.closest('input, textarea, [contenteditable="true"], .ai-dock-panel, .sel-ask, .wchat, .ai, .sidebar, .topbar, nav, button, .arr-bar, .arr-layer, .dk-tools, .dk-strip, [data-no-ask]')) return;
        if (!node.closest('.content, .modal, .drawer')) return;
        const r = s.getRangeAt(0).getBoundingClientRect(); if (!r.width && !r.height) return;
        const z = Number(getComputedStyle(document.documentElement).zoom) || 1;
        setSel({ text, x: Math.min(window.innerWidth / z - 330, Math.max(8, (r.left + r.width / 2) / z - 150)), y: (r.bottom / z) + 8 > window.innerHeight / z - 60 ? (r.top / z) - 52 : (r.bottom / z) + 8 });
        setTyping(false); setQ('');
      }, 220);
    };
    // a click anywhere else closes it (a new selection opens it again)
    const hide = (e: MouseEvent) => { if (ref.current && ref.current.contains(e.target as Node)) return; clearTimeout(t); setSel(null); setTyping(false); };
    const scrolled = (e: Event) => { if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return; setSel(null); };
    document.addEventListener('selectionchange', check); document.addEventListener('mousedown', hide);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null); };
    window.addEventListener('keydown', esc); window.addEventListener('scroll', scrolled, true);
    return () => { document.removeEventListener('selectionchange', check); document.removeEventListener('mousedown', hide); window.removeEventListener('keydown', esc); window.removeEventListener('scroll', scrolled, true); clearTimeout(t); };
  }, []);
  if (!sel) return null;
  const short = sel.text.length > 60 ? `${sel.text.slice(0, 57)}…` : sel.text;
  const go = (question: string) => { askAi(question, sel.text); setSel(null); window.getSelection()?.removeAllRanges(); };
  return <div ref={ref} className="sel-ask" style={{ left: sel.x, top: sel.y }} role="toolbar" aria-label="Ask Infinity AI about the selected text" onMouseDown={e => { if (!(e.target as HTMLElement).closest('input')) e.preventDefault(); }}>
    {!typing ? <>
      <span className="sel-ask-mark"><Sparkles size={13} /></span>
      <button onClick={() => go(`Explain “${short}” in plain English${sel.text.length > 80 ? '' : ' — what it means here and why it matters to us'}.`)}><BookOpen size={13} />Explain</button>
      <button onClick={() => go(`Is this risky for us? “${short}”`)}><ShieldAlert size={13} />Risky for us?</button>
      <button onClick={() => go('Translate the selected text into Farsi.')}><Languages size={13} />Farsi</button>
      <button onClick={() => setTyping(true)}><MessageSquare size={13} />Ask…</button>
    </> : <form onSubmit={e => { e.preventDefault(); if (q.trim()) go(q.trim()); }} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span className="sel-ask-mark"><Sparkles size={13} /></span>
      <input autoFocus className="input sm" value={q} onChange={e => setQ(e.target.value)} placeholder={`Ask about “${short.slice(0, 28)}”…`} style={{ width: 230 }} />
      <button type="submit">Ask</button>
    </form>}
  </div>;
}
