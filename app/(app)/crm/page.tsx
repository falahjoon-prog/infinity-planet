'use client';
import { ExportExcel } from '@/components/export-button';
import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, Columns3, List, Users, Building2 } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { PageHead, Loading, ErrorNote, Empty, StatusBadge, Button, Tabs, useToast } from '@/components/ui';
import { DealForm, ContactForm, STAGES } from '@/components/forms';
import { money, date, label, dueLabel } from '@/lib/client/format';

const COLOR: Record<string, string> = { lead: '#a6b0bf', opportunity: '#7fa6e0', negotiation: '#d9a441', due_diligence: '#8a6fd1', contract: '#1c3a63', completed: '#2f8a57', lost: '#d36b5f' };
export default function Page() { return <Suspense fallback={<Loading />}><CRM /></Suspense>; }

function CRM() {
  const sp = useSearchParams(); const router = useRouter(); const { can } = useApp(); const toast = useToast();
  const [tab, setTab] = useState<'pipeline' | 'table' | 'contacts'>(sp.get('tab') === 'contacts' ? 'contacts' : sp.get('stage') ? 'table' : 'pipeline');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState(sp.get('stage') || '');
  const [creating, setCreating] = useState(sp.get('new') === '1');
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const { data, error, loading, reload, setData } = useApi<any>('/api/deals');
  const deals = (data?.deals || []).filter((d: any) => (!q || `${d.title} ${d.counterparty} ${d.project?.name || ''}`.toLowerCase().includes(q.toLowerCase())) && (!stage || d.stage === stage));
  const move = async (id: string, to: string) => {
    const deal = data.deals.find((x: any) => x.id === id); if (!deal || deal.stage === to) return;
    setData({ deals: data.deals.map((x: any) => x.id === id ? { ...x, stage: to } : x) });
    try { const r = await api.patch(`/api/deals/${id}`, { stage: to }); setData((cur: any) => ({ deals: cur.deals.map((x: any) => x.id === id ? { ...x, ...r.deal } : x) })); toast(`Moved to ${label(to)}`, 'success'); }
    catch (e: any) { toast(e.message, 'error'); reload(); }
  };
  const open = deals.filter((d: any) => !['completed', 'lost'].includes(d.stage));
  return <>
    <PageHead eyebrow="Operate" title="Deals" sub={`${open.length} open deals · ${money(open.reduce((n: number, d: any) => n + (Number(d.expected_value) || 0), 0), true)} pipeline · ${money(open.reduce((n: number, d: any) => n + (Number(d.expected_value) || 0) * (Number(d.probability) || 0) / 100, 0), true)} weighted`}
      actions={<><ExportExcel kind="deals" />{can.write && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>New deal</Button>}</>} />
    <Tabs value={tab} onChange={setTab} tabs={[{ value: 'pipeline', label: <><Columns3 size={14} />Pipeline</> as any }, { value: 'table', label: <><List size={14} />Table</> as any }, { value: 'contacts', label: <><Users size={14} />Contacts</> as any }]} />
    {tab !== 'contacts' && <div className="filters"><div className="search-input"><Search size={15} /><input className="input" placeholder="Search deals" value={q} onChange={e => setQ(e.target.value)} /></div>
      {tab === 'table' && <select className="select" value={stage} onChange={e => setStage(e.target.value)}><option value="">All stages</option>{STAGES.map(s => <option key={s} value={s}>{label(s)}</option>)}</select>}</div>}
    {error && <ErrorNote error={error} onRetry={reload} />}
    {tab === 'contacts' ? <Contacts /> : loading ? <Loading /> : tab === 'pipeline' ? <div className="kanban">{STAGES.map(s => { const col = deals.filter((d: any) => d.stage === s); return <div key={s} className={`k-col ${over === s ? 'drop' : ''}`} onDragOver={e => { if (!can.write) return; e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)} onDrop={e => { e.preventDefault(); setOver(null); if (drag) move(drag, s); setDrag(null); }}>
      <div className="k-head"><b className="row" style={{ gap: 6 }}><i className="dot-s" style={{ background: COLOR[s] }} />{label(s)}</b><small>{col.length} · {money(col.reduce((n: number, d: any) => n + (Number(d.expected_value) || 0), 0), true)}</small></div>
      {col.map((d: any) => { const due = dueLabel(d.next_action_at); return <Link key={d.id} href={`/crm/${d.id}`} className="k-card" draggable={can.write} onDragStart={() => setDrag(d.id)} onDragEnd={() => setDrag(null)} style={drag === d.id ? { opacity: .5 } : undefined}>
        <div className="t">{d.title || d.counterparty}</div><div className="m">{d.counterparty}{d.project?.name ? ` · ${d.project.name}` : ''}</div>
        <div className="row between mt8"><b style={{ fontSize: 13 }}>{money(d.expected_value, true)}</b><span className="tiny muted">{d.probability}%</span></div>
        {d.next_action && <div className="m ellipsis" style={{ marginTop: 6 }}>→ {d.next_action}</div>}{due && <span className={`badge ${due.tone}`} style={{ marginTop: 6 }}>{due.text}</span>}
        <select className="select sm mt8 mobile-bar" value={d.stage} onClick={e => { e.preventDefault(); e.stopPropagation(); }} onChange={e => move(d.id, e.target.value)} disabled={!can.write}>{STAGES.map(x => <option key={x} value={x}>{label(x)}</option>)}</select>
      </Link>; })}
      {col.length === 0 && <div className="tiny muted" style={{ textAlign: 'center', padding: 12 }}>Drop deals here</div>}
    </div>; })}</div>
    : deals.length === 0 ? <div className="card"><Empty title="No deals" /></div> : <div className="card table-wrap"><table className="table"><thead><tr><th>Deal</th><th>Stage</th><th>Value</th><th>Prob.</th><th className="hide-sm">Owner</th><th className="hide-sm">Next action</th><th className="hide-sm">Updated</th></tr></thead><tbody>
      {deals.map((d: any) => <tr key={d.id} className="clickable" onClick={() => router.push(`/crm/${d.id}`)}><td><b>{d.title || d.counterparty}</b><div className="tiny muted">{d.counterparty}{d.project?.name ? ` · ${d.project.name}` : ''}</div></td><td><StatusBadge value={d.stage} /></td><td className="nowrap">{money(d.expected_value, true)}</td><td>{d.probability}%</td><td className="hide-sm small">{d.owner?.full_name || '—'}</td><td className="hide-sm small">{d.next_action || '—'}{d.next_action_at && <div className="tiny muted">{date(d.next_action_at)}</div>}</td><td className="hide-sm small muted">{date(d.updated_at)}</td></tr>)}
    </tbody></table></div>}
    <DealForm open={creating} onClose={() => setCreating(false)} initial={sp.get('project') ? { project_id: sp.get('project') } : undefined} onSaved={d => router.push(`/crm/${d.id}`)} />
  </>;
}

function Contacts() {
  const { can } = useApp();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const { data, loading, reload } = useApi<any>('/api/contacts');
  const { data: cps } = useApi<any>('/api/counterparties');
  const list = (data?.contacts || []).filter((c: any) => !q || `${c.full_name} ${c.email} ${c.counterparty?.name || ''}`.toLowerCase().includes(q.toLowerCase()));
  return <div className="grid g-main">
    <div className="card"><div className="card-head"><div className="search-input" style={{ flex: 1 }}><Search size={15} /><input className="input" placeholder="Search contacts" value={q} onChange={e => setQ(e.target.value)} /></div>{can.write && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setEditing({})}>Contact</Button>}</div>
      {loading ? <Loading /> : list.length === 0 ? <Empty icon={<Users size={20} />} title="No contacts yet" /> : <div className="list">{list.map((c: any) => <button key={c.id} className="list-item" onClick={() => setEditing(c)}><div className="main-col"><div className="title">{c.full_name}{c.position ? <span className="muted" style={{ fontWeight: 400 }}> · {c.position}</span> : ''}</div><div className="meta">{[c.counterparty?.name, c.email, c.phone, c.project?.name].filter(Boolean).join(' · ')}</div></div></button>)}</div>}
    </div>
    <div className="card"><div className="card-head"><h3><Building2 size={15} /> Counterparties</h3></div>{!(cps?.counterparties || []).length ? <Empty title="No counterparties yet">They are created automatically from deals and contacts.</Empty> : <div className="list">{cps.counterparties.map((c: any) => <div key={c.id} className="list-item"><div className="main-col"><div className="title">{c.name}</div><div className="meta">{c.contacts?.length || 0} contact(s){c.abn ? ` · ABN ${c.abn}` : ''}</div></div></div>)}</div>}</div>
    <ContactForm open={!!editing} onClose={() => setEditing(null)} initial={editing?.id ? editing : undefined} onSaved={() => reload()} />
  </div>;
}
