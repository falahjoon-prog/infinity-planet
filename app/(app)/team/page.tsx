'use client';
import { useOpenWindow } from '@/lib/client/nav-history';
import { SplitHandle } from '@/components/split-handle';
import { Translate } from '@/components/translate';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Hash, Plus, Send, FolderKanban, Menu, Paperclip, X, FileText, Download, Search, Sparkles, ChevronUp, CheckCircle2, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { api, apiFetch, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { PageHead, Loading, Empty, Button, Modal, Field, Avatar, Markdown, useToast } from '@/components/ui';
import { DocViewer } from '@/components/doc-viewer';
import { useBrand } from '@/lib/client/brand';
import { time, label, personName } from '@/lib/client/format';

export default function Page() { return <Suspense fallback={<Loading />}><Team /></Suspense>; }

const BOT_CHANNEL = 'ai-assistant';
const isImage = (m: string) => /^image\/(png|jpe?g|gif|webp|bmp)$/.test(m || '');
const size = (n: number) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

function Team() {
  const sp = useSearchParams(); const router = useRouter(); const { me, members, can } = useApp(); const toast = useToast(); const brand = useBrand();
  const { data: chans, reload: reloadChans } = useApi<any>('/api/team/channels');
  const [channel, setChannel] = useState(sp.get('channel') || 'general');
  const [msgs, setMsgs] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false); const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState(''); const [sending, setSending] = useState(false);
  const [files, setFiles] = useState<File[]>([]); const [dragging, setDragging] = useState(false);
  const [waitingBot, setWaitingBot] = useState<number | null>(null);
  const [newChan, setNewChan] = useState(false); const [name, setName] = useState('');
  const [showChans, setShowChans] = useState(false);
  const [searching, setSearching] = useState(false); const [q, setQ] = useState(''); const [results, setResults] = useState<any[] | null>(null);
  const docWin = useOpenWindow('doc'); const viewDoc = docWin.value; // an open document lives in the address, so Back closes it
  const box = useRef<HTMLDivElement>(null); const last = useRef<string | null>(null); const stick = useRef(true); const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (full = false) => {
    try {
      const r = await api.get(`/api/team/messages?channel=${encodeURIComponent(channel)}${!full && last.current ? `&after=${encodeURIComponent(last.current)}` : ''}`);
      if (full) { setMsgs(r.messages); setHasMore(r.has_more); stick.current = true; }
      else if (r.messages.length) setMsgs(m => [...m, ...r.messages.filter((x: any) => !m.some(y => y.id === x.id))]);
      if (r.messages.length) { last.current = r.messages[r.messages.length - 1].created_at; if (r.messages.some((x: any) => x.is_bot)) setWaitingBot(null); }
    } catch {}
  }, [channel]);
  useEffect(() => { last.current = null; setMsgs([]); setResults(null); setSearching(false); setQ(''); load(true); }, [load]);
  useEffect(() => { const t = setInterval(() => load(false), waitingBot ? 1500 : 4000); return () => clearInterval(t); }, [load, waitingBot]);
  useEffect(() => { if (waitingBot && Date.now() - waitingBot > 180_000) setWaitingBot(null); }, [msgs, waitingBot]);
  useEffect(() => { const el = box.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [msgs.length, waitingBot]);

  const older = async () => {
    if (!msgs.length) return; setLoadingOlder(true);
    const el = box.current; const before = el ? el.scrollHeight : 0; stick.current = false;
    try {
      const r = await api.get(`/api/team/messages?channel=${encodeURIComponent(channel)}&before=${encodeURIComponent(msgs[0].created_at)}&limit=60`);
      setMsgs(m => [...r.messages.filter((x: any) => !m.some(y => y.id === x.id)), ...m]); setHasMore(r.has_more);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
    } catch (e: any) { toast(e.message, 'error'); } finally { setLoadingOlder(false); }
  };
  const runSearch = async () => {
    if (!q.trim()) { setResults(null); return; }
    try { const r = await api.get(`/api/team/messages?channel=${encodeURIComponent(channel)}&q=${encodeURIComponent(q.trim())}&limit=100`); setResults(r.messages); } catch (e: any) { toast(e.message, 'error'); }
  };
  const addFiles = (list: FileList | File[] | null) => { if (!list) return; const arr = Array.from(list); const big = arr.find(f => f.size > 50 * 1024 * 1024); if (big) toast(`${big.name} is larger than 50 MB`, 'error'); setFiles(f => [...f, ...arr.filter(x => x.size <= 50 * 1024 * 1024)].slice(0, 10)); };
  const send = async () => {
    const body = text.trim(); if ((!body && !files.length) || sending) return; setSending(true); stick.current = true;
    try {
      let r: any;
      if (files.length) {
        const fd = new FormData(); fd.append('channel', channel); fd.append('body', body); files.forEach(f => fd.append('file', f));
        const res = await apiFetch('/api/team/messages', { method: 'POST', body: fd }); r = await res.json(); if (!res.ok) throw new Error(r.error || 'Upload failed');
      } else r = await api.post('/api/team/messages', { channel, body });
      setText(''); setFiles([]); setMsgs(m => [...m, r.message]); last.current = r.message.created_at;
      if (r.bot) setWaitingBot(Date.now());
    } catch (e: any) { toast(e.message, 'error'); } finally { setSending(false); }
  };
  const create = async () => { try { const r = await api.post('/api/team/channels', { name }); setNewChan(false); setName(''); reloadChans(); go(r.channel.slug); } catch (e: any) { toast(e.message, 'error'); } };
  const go = (slug: string) => { setChannel(slug); setShowChans(false); router.replace(`/team?channel=${slug}`, { scroll: false }); };
  const all = chans?.channels || [];
  const current = all.find((c: any) => c.slug === channel);
  const general = all.filter((c: any) => !c.project_id); const projects = all.filter((c: any) => c.project_id);
  const online = members.filter(m => m.presence !== 'offline');
  const isBotChannel = channel === BOT_CHANNEL;
  const shown = results ?? msgs;
  const citeOpen = (m: any, tag: string) => { const c = m.bot_meta?.citations?.find((x: any) => x.citation === tag); if (c) docWin.open(c.document_id); };

  return <>
    <PageHead eyebrow="Communicate" title="Team Chat" sub={`${online.length} of ${members.length} online · type @ai to ask ${brand.ai_name}`} />
    <div className={`card chat-layout ${showChans ? 'show-chans' : ''}`}>
      <SplitHandle id="chat" min={180} max={420} minOther={420} />
      <SplitHandle id="chatinfo" edge="last" needKids={3} min={180} max={420} minOther={420} />
      <div className="chan-col" style={{ borderRight: '1px solid var(--line)', padding: 10, overflowY: 'auto' }}>
        <div className="row between" style={{ padding: '4px 6px 8px' }}><span className="eyebrow" style={{ margin: 0 }}>Channels</span>{can.write && <button className="btn ghost xs" onClick={() => setNewChan(true)}><Plus size={13} /></button>}</div>
        {general.map((c: any) => <button key={c.slug} className={`chan ${c.slug === channel ? 'on' : ''}`} onClick={() => go(c.slug)}>{c.slug === BOT_CHANNEL ? <Sparkles size={14} color="var(--gold)" /> : <Hash size={14} />}{c.slug === BOT_CHANNEL ? `Ask ${brand.ai_name}` : c.name}</button>)}
        {projects.length > 0 && <><div className="eyebrow" style={{ padding: '14px 6px 6px', margin: 0 }}>Projects</div>{projects.map((c: any) => <button key={c.slug} className={`chan ${c.slug === channel ? 'on' : ''}`} onClick={() => go(c.slug)}><FolderKanban size={14} /><span className="ellipsis">{c.name}</span></button>)}</>}
        <p className="tiny muted" style={{ padding: 6 }}>Project channels are opened from a project&apos;s “Chat” button.</p>
      </div>
      <div className="msg-col" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}
        onDragOver={e => { if (can.write && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}>
        {dragging && <div className="drop-hint">Drop files to attach</div>}
        <div className="card-head"><h3><button className="mobile-bar icon-btn" onClick={() => setShowChans(true)}><Menu size={16} /></button>{isBotChannel ? <Sparkles size={15} color="var(--gold)" /> : current?.project_id ? <FolderKanban size={15} /> : <Hash size={15} />}{isBotChannel ? `Ask ${brand.ai_name}` : current?.name || label(channel)}<span className="sub">{current?.description}</span></h3>
          <div className="row" style={{ gap: 6 }}>{current?.project_id && <Link className="link small" href={`/projects/${current.project_id}`}>Open project</Link>}<button className="icon-btn" title="Search this channel" onClick={() => { setSearching(s => !s); setResults(null); setQ(''); }}><Search size={16} /></button></div></div>
        {searching && <form className="row" style={{ padding: '8px 14px', borderBottom: '1px solid var(--line)' }} onSubmit={e => { e.preventDefault(); runSearch(); }}><input className="input sm" autoFocus placeholder={`Search #${current?.name || channel}`} value={q} onChange={e => setQ(e.target.value)} /><Button size="sm" type="submit">Search</Button>{results && <Button size="sm" onClick={() => { setResults(null); setQ(''); }}>Clear</Button>}{results && <span className="small muted">{results.length} found</span>}</form>}
        <div className="chat-msgs" ref={box} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
          {!results && hasMore && <div style={{ textAlign: 'center', padding: 8 }}><Button size="xs" icon={<ChevronUp size={13} />} loading={loadingOlder} onClick={older}>Load earlier messages</Button></div>}
          {shown.length === 0 && (isBotChannel
            ? <Empty icon={<Sparkles size={20} />} title={`Talk to ${brand.ai_name}`}>Ask a question or give it work: “task: send the MOU for @max due Friday”, “remind everyone at 4pm to submit timesheets”, “schedule a meeting with @lena on 14/10 at 10am”, “draft an MOU for &lt;project&gt;”, “design a flyer for &lt;project&gt;”. Attach a PDF or photo and say “review this contract”. Type <b>help</b> for more.</Empty>
            : <Empty title={results ? 'No messages match' : 'No messages yet'}>{results ? 'Try other words.' : 'Start the conversation. Mention someone with @firstname, or @ai to ask the AI bot.'}</Empty>)}
          {shown.map((m, i) => { const prev = shown[i - 1]; const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString(); const cont = !results && !newDay && !m.is_bot && !prev?.is_bot && prev?.sender_id === m.sender_id && +new Date(m.created_at) - +new Date(prev.created_at) < 5 * 60_000; const who = m.is_bot ? brand.ai_name : m.sender?.full_name || m.sender?.email || 'Team member';
            return <React.Fragment key={m.id}>{newDay && <div className="day-sep">{new Date(m.created_at).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: new Date(m.created_at).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })}</div>}
              <div className={`cm ${cont ? 'cont' : ''} ${m.is_bot ? 'bot' : ''}`}>{m.is_bot ? <span className="bot-avatar"><img src="/brand/infinity-planet.svg" alt="" /></span> : <Avatar name={who} size="sm" />}<div className="body">{!cont && <div className="who">{who}{m.sender_id === me.id && <span className="muted" style={{ fontWeight: 400 }}> (you)</span>}{m.is_bot && m.bot_meta?.engine && <span className="muted" style={{ fontWeight: 400 }}> · {m.bot_meta.engine === 'rules' ? 'built-in' : m.bot_meta.engine}</span>}<time>{time(m.created_at)}</time></div>}
                {m.body && (m.is_bot ? <div className="text" dir="auto"><Markdown text={m.body} onCite={t => citeOpen(m, t)} /></div> : <div className="text" dir="auto">{m.body}</div>)}{m.body && <Translate text={m.body} />}
                {m.is_bot && !!m.bot_meta?.actions?.length && <div className="action-chips">{m.bot_meta.actions.filter((a: any) => a.href || !a.ok).map((a: any, k: number) => a.ok && a.href ? <Link key={k} href={a.href} className="action-chip ok"><CheckCircle2 size={12} />Open {String(a.type).replace(/^(create|set|add|generate|review|list)_/, '').replace(/_/g, ' ')}</Link> : <span key={k} className="action-chip fail"><AlertTriangle size={12} />{String(a.type).replace(/_/g, ' ')} not done</span>)}</div>}
                {!!m.attachments?.length && <div className="att-list">{m.attachments.map((a: any, k: number) => isImage(a.mime)
                  ? <a key={k} href={a.url} target="_blank" rel="noreferrer" title={a.name}><img className="att-img" src={a.url} alt={a.name} loading="lazy" /></a>
                  : <span key={k} className="att">{/pdf/.test(a.mime) ? <FileText size={15} color="#c0392b" /> : isImage(a.mime) ? <ImageIcon size={15} /> : <FileText size={15} />}<a className="n" href={a.url} target="_blank" rel="noreferrer">{a.name}</a><span className="tiny muted">{size(a.size || 0)}</span><a href={a.download} title="Download"><Download size={14} /></a></span>)}</div>}
              </div></div></React.Fragment>; })}
          {waitingBot && !results && <div className="typing"><span className="spin" /> {brand.ai_name} is working on it…</div>}
        </div>
        <div className="composer">
          {files.length > 0 && <div className="pending-files">{files.map((f, k) => <span key={k} className="chip">{isImage(f.type) ? <ImageIcon size={12} /> : <FileText size={12} />}{f.name} <span className="tiny muted">{size(f.size)}</span><button className="x" onClick={() => setFiles(x => x.filter((_, j) => j !== k))}><X size={12} /></button></span>)}</div>}
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <button className="icon-btn" title="Attach files" disabled={!can.write} onClick={() => fileInput.current?.click()}><Paperclip size={18} /></button>
            <input ref={fileInput} type="file" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            <textarea rows={1} placeholder={can.write ? (isBotChannel ? `Ask ${brand.ai_name} or give it a task…` : `Message #${current?.name || channel} — @ai to ask the bot`) : 'Viewers cannot post'} disabled={!can.write} value={text} onChange={e => setText(e.target.value)} onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="btn primary" style={{ height: 46, width: 46, padding: 0 }} disabled={sending || (!text.trim() && !files.length)} onClick={send}>{sending ? <span className="spin" /> : <Send size={17} />}</button>
          </div>
        </div>
      </div>
      <div className="members-col" style={{ borderLeft: '1px solid var(--line)', padding: 12, overflowY: 'auto' }}>
        <div className="eyebrow">Team</div>
        <div className="row" style={{ padding: '6px 0' }}><span className="bot-avatar"><img src="/brand/infinity-planet.svg" alt="" /></span><div style={{ minWidth: 0 }}><div className="small bold ellipsis">{brand.ai_name}</div><div className="tiny muted">AI bot · type @ai</div></div></div>
        {members.map(m => <div key={m.id} className="row" style={{ padding: '6px 0' }}><Avatar name={personName(m)} size="sm" presence={m.presence} /><div style={{ minWidth: 0 }}><div className="small bold ellipsis">{personName(m)}</div><div className="tiny muted">{label(m.presence)} · {label(m.role)}</div></div></div>)}
      </div>
    </div>
    <Modal open={newChan} onClose={() => setNewChan(false)} title="New channel" footer={<><Button onClick={() => setNewChan(false)}>Cancel</Button><Button variant="primary" onClick={create} disabled={!name.trim()}>Create</Button></>}><Field label="Channel name"><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus /></Field></Modal>
    <DocViewer id={viewDoc} onClose={() => docWin.close()} />
  </>;
}
