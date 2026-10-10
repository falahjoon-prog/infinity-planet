'use client';
/** Shared pieces for writing professional documents: recipient (To), sender (From), project readiness and the letterhead preview. */
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, Eye, RefreshCw } from 'lucide-react';
import { apiFetch, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { MemberSelect } from '@/components/pickers';
import { Field } from '@/components/ui';

export type Recipient = { name?: string; title?: string; company?: string; address?: string; email?: string; phone?: string; abn?: string };

/** "To" — pick a saved contact or type the details. */
export function RecipientFields({ value, onChange, projectId, withAbn }: { value: Recipient; onChange: (r: Recipient) => void; projectId?: string | null; withAbn?: boolean }) {
  const { data } = useApi<any>('/api/contacts');
  const contacts: any[] = (data?.contacts || []).slice().sort((a: any, b: any) => (b.project_id === projectId ? 1 : 0) - (a.project_id === projectId ? 1 : 0));
  const set = (k: keyof Recipient) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value });
  const pick = (id: string) => { const c = contacts.find(x => x.id === id); if (c) onChange({ ...value, name: c.full_name || '', title: c.position || '', company: c.counterparty?.name || '', email: c.email || '', phone: c.phone || '' }); };
  return <div className="to-grid">
    {contacts.length > 0 && <Field label="Saved contact" className="full"><select className="select" value="" onChange={e => pick(e.target.value)}><option value="">Choose from your contacts…</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.position ? `, ${c.position}` : ''}{c.counterparty?.name ? ` — ${c.counterparty.name}` : ''}{c.project_id === projectId ? ' ★' : ''}</option>)}</select></Field>}
    <Field label="Name"><input className="input" value={value.name || ''} onChange={set('name')} placeholder="e.g. Mr John Smith" /></Field>
    <Field label="Position"><input className="input" value={value.title || ''} onChange={set('title')} placeholder="e.g. Managing Director" /></Field>
    <Field label="Company" className="full"><input className="input" value={value.company || ''} onChange={set('company')} placeholder="e.g. Smith Property Group Pty Ltd" /></Field>
    {withAbn && <Field label="ABN / ACN"><input className="input" value={value.abn || ''} onChange={set('abn')} /></Field>}
    <Field label="Email"><input className="input" value={value.email || ''} onChange={set('email')} type="email" /></Field>
    <Field label="Address" className="full"><textarea className="textarea" rows={2} value={value.address || ''} onChange={set('address')} placeholder="Street, suburb, state, postcode" /></Field>
  </div>;
}

/** "From" — who signs. Defaults to the signed-in person. */
export function SenderSelect({ value, onChange, className = 'select' }: { value: string | null; onChange: (v: string | null) => void; className?: string }) {
  const { me } = useApp();
  return <MemberSelect value={value === 'company' ? '' : (value || me.id)} onChange={v => onChange(v || 'company')} noneLabel="Company signatory (Business details)" className={className} />;
}

/** How much the AI has to work with on this project. */
export function ProjectReadiness({ projectId }: { projectId: string | null }) {
  const { data } = useApi<any>(projectId ? `/api/projects/${projectId}` : null, [projectId]);
  if (!projectId) return <div className="ready-box warn"><b>No project chosen.</b> The document will be general, with gaps marked [●]. Choose a project so the facts are filled in.</div>;
  if (!data) return null;
  const p = data.project || {};
  const docs = (data.documents || []).filter((d: any) => d.status === 'indexed').length;
  const checks: [string, boolean][] = [
    ['Description', !!String(p.description || '').trim()], ['Location', !!String(p.location || '').trim()], ['Value', !!p.deal_value],
    ['Highlights', !!String(p.highlights || '').trim()], ['Documents', docs > 0], ['Deals or contacts', (data.deals || []).length + (data.contacts || []).length > 0],
  ];
  const n = checks.filter(c => c[1]).length;
  const tone = n >= 4 ? 'good' : n >= 2 ? 'mid' : 'warn';
  return <div className={`ready-box ${tone}`}>
    <div className="ready-head"><b>{n >= 4 ? 'Good information' : n >= 2 ? 'Some information' : 'Almost empty project'}</b><span>{n} of {checks.length}</span></div>
    <div className="ready-list">{checks.map(([l, okv]) => <span key={l} className={okv ? 'on' : ''}>{okv ? <CheckCircle2 size={13} /> : <Circle size={13} />}{l}</span>)}</div>
    {n < 4 && <div className="tiny">The AI only uses what's recorded. <Link className="link" href={`/projects/${projectId}`}>Add details to the project</Link> for a stronger document.</div>}
  </div>;
}

/** Live PDF of the text on the business letterhead (marked DRAFT). */
export function LetterheadPreview({ title, body, auto }: { title: string; body: string; auto?: number }) {
  const [url, setUrl] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  const run = async () => {
    if (!body.trim()) return; setBusy(true); setErr(null);
    try {
      const r = await apiFetch('/api/letterhead/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, body }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Preview failed');
      const u = URL.createObjectURL(await r.blob()); if (last.current) URL.revokeObjectURL(last.current); last.current = u; setUrl(u);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  useEffect(() => { run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [auto]);
  useEffect(() => () => { if (last.current) URL.revokeObjectURL(last.current); }, []);
  return <div className="lh-preview">
    <div className="lh-bar"><Eye size={14} /><b>On your letterhead</b><span className="spacer" /><button className="btn sm ghost" onClick={run} disabled={busy}><RefreshCw size={13} className={busy ? 'spinning' : ''} /> Update preview</button></div>
    {err ? <div className="lh-empty">{err}</div> : url ? <iframe src={`${url}#toolbar=0&navpanes=0&view=FitH`} title="Letterhead preview" /> : <div className="lh-empty">{busy ? 'Preparing preview…' : 'Preview appears here.'}</div>}
  </div>;
}
