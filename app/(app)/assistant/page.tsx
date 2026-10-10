'use client';
import { SplitHandle } from '@/components/split-handle';
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, Pin, PinOff, Pencil, Trash2, MessagesSquare } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { AiChat } from '@/components/ai-chat';
import { PageHead, Loading, Empty, Button, Modal, Field, useToast, useConfirm } from '@/components/ui';
import { useBrand } from '@/lib/client/brand';
import { ago } from '@/lib/client/format';

export default function Page() { return <Suspense fallback={<Loading />}><Assistant /></Suspense>; }

function Assistant() {
  const sp = useSearchParams(); const router = useRouter(); const brand = useBrand(); const toast = useToast(); const confirm = useConfirm();
  const [current, setCurrent] = useState<string | null>(sp.get('c'));
  const [q, setQ] = useState(''); const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<any>(null); const [title, setTitle] = useState('');
  const { data, loading, reload } = useApi<any>(`/api/ai/conversations?limit=200${query ? `&q=${encodeURIComponent(query)}` : ''}`, [query]);
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const pick = (id: string | null) => { setCurrent(id); router.replace(id ? `/assistant?c=${id}` : '/assistant', { scroll: false }); };
  const onConversation = (id: string | null) => { setCurrent(id); if (id) { router.replace(`/assistant?c=${id}`, { scroll: false }); reload(); } };
  const pin = async (c: any) => { await api.patch(`/api/ai/conversations/${c.id}`, { pinned: !c.pinned }).catch(e => toast(e.message, 'error')); reload(); };
  const rename = async () => { try { await api.patch(`/api/ai/conversations/${renaming.id}`, { title }); setRenaming(null); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  const remove = async (c: any) => { if (!(await confirm({ title: 'Remove this conversation from your history?', confirm: 'Remove', danger: true }))) return; await api.del(`/api/ai/conversations/${c.id}`).catch(e => toast(e.message, 'error')); if (current === c.id) pick(null); reload(); };
  const list = data?.conversations || [];
  return <>
    <PageHead eyebrow="AI" title={brand.ai_name} sub={`Ask questions about ${brand.short_name}, or give it work: tasks, reminders, meetings, notes, MOUs, reports and designs. Your conversations are saved.`} actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => pick(null)}>New chat</Button>} />
    <div className="assistant-layout">
      <SplitHandle id="assistant" min={200} max={520} minOther={420} fold foldLabel="chat history" />
      <div className="card hist" style={{ padding: 0 }}>
        <div style={{ padding: 10, borderBottom: '1px solid var(--line)' }}><div className="search-input"><Search size={15} /><input className="input" placeholder="Search chat history" value={q} onChange={e => setQ(e.target.value)} /></div></div>
        {loading && !data ? <Loading /> : list.length === 0 ? <Empty icon={<MessagesSquare size={18} />} title={query ? 'No matches' : 'No conversations yet'}>{query ? 'Try other words.' : 'Your chats will appear here.'}</Empty>
          : list.map((c: any) => <div key={c.id} className={`hist-item ${c.id === current ? 'on' : ''}`} onClick={() => pick(c.id)} role="button">
            {c.pinned && <Pin size={13} color="var(--gold)" />}
            <div className="t"><b>{c.title}</b><small>{c.project?.name ? `${c.project.name} · ` : ''}{ago(c.updated_at)}</small></div>
            <button className="icon-btn" title={c.pinned ? 'Unpin' : 'Pin'} onClick={e => { e.stopPropagation(); pin(c); }}>{c.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
            <button className="icon-btn" title="Rename" onClick={e => { e.stopPropagation(); setRenaming(c); setTitle(c.title); }}><Pencil size={14} /></button>
            <button className="icon-btn" title="Remove" onClick={e => { e.stopPropagation(); remove(c); }}><Trash2 size={14} /></button>
          </div>)}
      </div>
      <AiChat sidebar height="calc(100 * var(--vh, 1vh) - 180px)" conversation={current} onConversation={onConversation} initial={sp.get('ask') || undefined} />
    </div>
    <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename conversation" footer={<><Button onClick={() => setRenaming(null)}>Cancel</Button><Button variant="primary" onClick={rename} disabled={!title.trim()}>Save</Button></>}>
      <Field label="Title"><input className="input" value={title} onChange={e => setTitle(e.target.value)} autoFocus /></Field>
    </Modal>
  </>;
}
