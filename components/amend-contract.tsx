'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { PenLine, Download, Save, ArrowLeft, Wand2 } from 'lucide-react';
import { api, apiFetch } from '@/lib/client/api';
import { ProviderSelect } from '@/components/pickers';
import { Modal, Button, Loading, Notice, Tabs, Field, useToast } from '@/components/ui';

const SEV: Record<string, string> = { critical: '#8b1a10', high: '#c0392b', medium: '#b7791f', low: '#7a879b' };

/** Legal AI → Amend contract: choose amendments, build the amended contract, see the redline, download or save it. */
export function AmendContract({ reviewId, open, onClose }: { reviewId: string; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [info, setInfo] = useState<any>(null); const [items, setItems] = useState<any[]>([]);
  const [paste, setPaste] = useState(''); const [provider, setProvider] = useState('none'); const [instr, setInstr] = useState('');
  const [busy, setBusy] = useState<string | null>(null); const [res, setRes] = useState<any>(null); const [view, setView] = useState<'redline' | 'text' | 'changes'>('redline');
  const [text, setText] = useState(''); const [saved, setSaved] = useState<any>(null);
  useEffect(() => { if (!open) return; setRes(null); setSaved(null); setInfo(null); api.get(`/api/legal/reviews/${reviewId}/amend`).then(r => { setInfo(r); setItems(r.items); }).catch(e => toast(e.message, 'error')); }, [open, reviewId]);
  const build = async () => {
    setBusy('build');
    try { const r = await api.post(`/api/legal/reviews/${reviewId}/amend`, { items: items.map(i => ({ key: i.key, include: i.include, wording: i.wording })), provider, instructions: instr, text: info?.source_available ? undefined : paste }); setRes(r); setText(r.amended); setView('redline'); if (r.note) toast(r.note, 'info'); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const download = async (clean: boolean) => {
    setBusy(clean ? 'clean' : 'red');
    try {
      const r = await apiFetch(`/api/legal/reviews/${reviewId}/amend/redline`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ original: res.original, amended: text, clean }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Download failed');
      const blob = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(r.headers.get('content-disposition') || '')?.[1] ? decodeURIComponent(/filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(r.headers.get('content-disposition') || '')![1]) : 'contract.docx';
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const save = async () => { setBusy('save'); try { const r = await api.post(`/api/legal/reviews/${reviewId}/amend/save`, { text, changes: res.changes, engine: res.engine, title: `Amended — ${info?.title || 'contract'}` }); setSaved(r.document); toast('Saved as a draft document — request approval to export with letterhead', 'success'); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const set = (k: string, patch: any) => setItems(xs => xs.map(x => x.key === k ? { ...x, ...patch } : x));
  const n = items.filter(i => i.include).length;
  const edited = res && text !== res.amended;
  return <Modal open={open} onClose={onClose} size="xl" title={<><PenLine size={16} /> Amend contract</>} footer={!res ? <><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Wand2 size={15} />} loading={busy === 'build'} disabled={!info || !n} onClick={build}>Build amended contract ({n})</Button></>
    : <><Button icon={<ArrowLeft size={15} />} onClick={() => setRes(null)}>Back to amendments</Button><span className="spacer" /><Button icon={<Download size={15} />} loading={busy === 'red'} onClick={() => download(false)}>Redline (Word)</Button><Button icon={<Download size={15} />} loading={busy === 'clean'} onClick={() => download(true)}>Clean copy (Word)</Button><Button variant="primary" icon={<Save size={15} />} loading={busy === 'save'} onClick={save}>Save as draft document</Button></>}>
    {!info ? <Loading /> : !res ? <div className="stack" style={{ gap: 12 }}>
      <div className="small muted">Tick the changes to make. You can edit the proposed wording before it goes into the contract. Each one is placed in the clause it relates to, or added as a new clause before the signing block.</div>
      <div className="card list" style={{ maxHeight: 'calc(55 * var(--vh, 1vh))', overflowY: 'auto' }}>{items.map(it => <div key={it.key} className="list-item" style={{ alignItems: 'flex-start' }}>
        <input type="checkbox" checked={it.include} onChange={e => set(it.key, { include: e.target.checked })} style={{ marginTop: 4 }} />
        <div className="main-col"><div className="row wrap" style={{ gap: 6 }}><span className="badge" style={{ background: `${SEV[it.severity] || '#777'}18`, color: SEV[it.severity] }}>{it.severity}</span><b className="small">{it.kind === 'missing' ? 'Add: ' : ''}{it.title}</b>{it.clause_ref && <span className="tiny muted">{it.clause_ref}</span>}{!it.has_wording && <span className="tiny" style={{ color: 'var(--amber)' }}>placeholder — complete the wording</span>}</div>
          {it.include && <textarea className="textarea mt8" style={{ minHeight: 64, fontSize: 13 }} value={it.wording} onChange={e => set(it.key, { wording: e.target.value })} />}</div>
      </div>)}</div>
      {!info.source_available && <Field label="Contract text" hint="The original text isn't stored for this review — paste the full contract here."><textarea className="textarea" style={{ minHeight: 160 }} value={paste} onChange={e => setPaste(e.target.value)} /></Field>}
      <div className="form-grid">
        <Field label="Engine" hint="Built-in: places each change in the right clause. AI: rewrites the clauses so the changes read naturally."><ProviderSelect value={provider} onChange={setProvider} builtin="Built-in (no AI key)" /></Field>
        <Field label="Extra instructions (AI only)"><input className="input" value={instr} onChange={e => setInstr(e.target.value)} placeholder="e.g. keep the deposit at 5%, make RHC the Developer" disabled={provider === 'none'} /></Field>
      </div>
      <Notice>The amended contract is a draft for you and your solicitors to review — it is not legal advice.</Notice>
    </div> : <div className="stack" style={{ gap: 10 }}>
      <div className="row wrap" style={{ gap: 8 }}><span className="badge green">+{res.stats.inserted_words} words added</span><span className="badge red">−{res.stats.deleted_words} words removed</span><span className="badge">{res.changes.length} amendments · {res.engine === 'rules' ? 'built-in engine' : res.engine}</span>{edited && <span className="badge amber">edited by you</span>}{saved && <Link className="link small" href={`/drafting/${saved.id}`}>Open saved draft →</Link>}</div>
      <Tabs value={view} onChange={setView} tabs={[{ value: 'redline', label: 'Redline' }, { value: 'text', label: 'Edit amended text' }, { value: 'changes', label: 'Changes', count: res.changes.length }]} />
      {view === 'redline' && <div className="doc-text redline" style={{ maxHeight: 'calc(58 * var(--vh, 1vh))' }}>{(edited ? null : res.segments)?.map((s: any, i: number) => s.t === 'same' ? <span key={i}>{s.s}</span> : s.t === 'ins' ? <ins key={i} style={{ color: '#1f5fbf', background: '#e8f0fd', textDecoration: 'underline' }}>{s.s}</ins> : <del key={i} style={{ color: '#c0392b', background: '#fdecea' }}>{s.s}</del>) || <span className="muted">You edited the text — download the redline to see all changes against the original.</span>}</div>}
      {view === 'text' && <textarea className="doc-editor" style={{ minHeight: 'calc(55 * var(--vh, 1vh))' }} value={text} onChange={e => setText(e.target.value)} />}
      {view === 'changes' && <div className="card list">{res.changes.map((c: any) => <div key={c.key} className="list-item" style={{ alignItems: 'flex-start' }}><div className="main-col"><div className="title small">{c.title} <span className="tiny muted">· {c.type === 'replace' ? `replaced wording in ${c.ref}` : c.type === 'insert' ? `inserted as ${c.ref}` : `added as ${c.ref}`}</span></div>{c.before && <div className="tiny" style={{ color: '#c0392b', textDecoration: 'line-through' }}>{c.before.slice(0, 300)}</div>}<div className="tiny" style={{ color: '#1f5fbf' }}>{c.after.slice(0, 400)}</div></div></div>)}</div>}
    </div>}
  </Modal>;
}
