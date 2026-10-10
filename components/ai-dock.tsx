'use client';
import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { X, Maximize2, Eye } from 'lucide-react';
import { currentScreen, ScreenInfo } from '@/lib/client/screen';
import { AiChat } from './ai-chat';
import { InfinityMark } from '@/lib/client/brand';
import { hasArea } from '@/lib/access';
import { useApp } from './app-context';

/** Infinity AI on every page: the bot button in the bottom-right corner opens a chat that can answer and take actions. */
export function AiDock() {
  const pathname = usePathname(); const { me } = useApp();
  const [open, setOpen] = useState(false); const [conv, setConv] = useState<string | null>(null); const [ask, setAsk] = useState<{ q: string; n: number; selection?: string | null } | null>(null); const [screen, setScreen] = useState<ScreenInfo | null>(null);
  useEffect(() => { const on = (e: Event) => { const d = (e as CustomEvent).detail; const q = String(typeof d === 'string' ? d : d?.q || '').trim(); if (!q) return; const selection = typeof d === 'object' && d ? d.selection || null : null; setConv(null); setScreen(currentScreen(selection)); setAsk(a => ({ q, n: (a?.n || 0) + 1, selection })); setOpen(true); }; window.addEventListener('ip-ai-ask', on); return () => window.removeEventListener('ip-ai-ask', on); }, []);
  // what's on screen when the panel opens (and when the page changes while it's open)
  useEffect(() => { if (open) setScreen(s => ({ ...currentScreen(s?.selection), selection: s?.selection || null })); }, [open, pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const heading = typeof document !== 'undefined' ? (document.querySelector('.modal-head h2, .drawer h2, .drawer-head b, .content h1, .content .doc-title, .content h2')?.textContent || '').trim().slice(0, 80) : '';
  const kindLabel: Record<string, string> = { legal_review: 'contract review', document: 'document', email: 'email', project: 'project', deal: 'deal', draft: 'draft', deck: 'presentation', page: 'page' };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setOpen(o => !o); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  if (pathname.startsWith('/assistant') || !hasArea(me.role, me.areas, 'assistant')) return null;
  const project = pathname.match(/^\/projects\/([0-9a-f-]{36})/)?.[1];
  return <>
    {open && <div className="ai-dock-panel" role="dialog" aria-label="Infinity AI">
      <div className="ai-dock-head"><InfinityMark size={22} /><b>Infinity AI</b><span className="tiny muted">{project ? 'this project' : 'ask or give a task'}</span><span className="spacer" />
        <Link className="icon-btn" href={`/assistant${conv ? `?c=${conv}` : ''}`} title="Open full screen" onClick={() => setOpen(false)}><Maximize2 size={15} /></Link>
        <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button></div>
      {screen && (screen.item || screen.selection) && <div className="ai-screen" title="Infinity AI can see this and answers about it"><Eye size={13} /><span>Looking at</span><b>{screen.item ? `${heading || screen.page} (${kindLabel[screen.item.kind] || 'item'})` : screen.page}</b>{screen.selection && <span className="sel-q">· “{screen.selection.slice(0, 50)}{screen.selection.length > 50 ? '…' : ''}”</span>}<span className="spacer" />{screen.selection && <button className="link tiny" onClick={() => setScreen(s => s ? { ...s, selection: null } : s)}>clear</button>}</div>}
      <div className="ai-dock-body"><AiChat key={ask?.n || 0} initial={ask?.q} projectId={project} conversation={conv} onConversation={setConv} height="100%" bare screen={() => ({ ...(screen || currentScreen()), selection: screen?.selection || null })} /></div>
    </div>}
    <button className={`ai-dock-btn${open ? ' on' : ''}`} onClick={() => setOpen(o => !o)} title="Infinity AI (Ctrl + J)" aria-label="Open Infinity AI">{open ? <X size={22} /> : <InfinityMark size={30} />}</button>
  </>;
}
