'use client';
import { ExportExcel } from '@/components/export-button';
import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, FolderKanban, LayoutGrid, List, MapPin } from 'lucide-react';
import { useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { PageHead, Loading, ErrorNote, Empty, StatusBadge, RiskBadge, Button, Segmented } from '@/components/ui';
import { ProjectForm, PROJECT_STATUSES, RISKS } from '@/components/forms';
import { money, date, label } from '@/lib/client/format';

export default function Page() { return <Suspense fallback={<Loading />}><Projects /></Suspense>; }

function Projects() {
  const sp = useSearchParams(); const router = useRouter(); const { can } = useApp();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [risk, setRisk] = useState(sp.get('risk') === 'high' ? 'high+' : '');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(sp.get('new') === '1');
  const { data, error, loading, reload } = useApi<any>(`/api/projects${archived ? '?include_archived=1' : ''}`, [archived]);
  useEffect(() => { try { const v = localStorage.getItem('rhc-projects-view'); if (v === 'table' || v === 'grid') setView(v); } catch {} }, []);
  const list = (data?.projects || []).filter((p: any) =>
    (!q || `${p.name} ${p.location || ''} ${p.counterparty || ''}`.toLowerCase().includes(q.toLowerCase())) && (!status || p.status === status) &&
    (!risk || (risk === 'high+' ? ['high', 'critical'].includes(p.risk) : p.risk === risk)));
  return <>
    <PageHead eyebrow="Operate" title="Projects" sub="Every project with its deals, documents, work, legal reviews and activity." actions={<><ExportExcel kind="projects" />{can.write && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>New project</Button>}</>} />
    <div className="filters">
      <div className="search-input"><Search size={15} /><input className="input" placeholder="Search projects" value={q} onChange={e => setQ(e.target.value)} /></div>
      <select className="select" value={status} onChange={e => setStatus(e.target.value)}><option value="">All stages</option>{PROJECT_STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}</select>
      <select className="select" value={risk} onChange={e => setRisk(e.target.value)}><option value="">Any risk</option><option value="high+">High or critical</option>{RISKS.map(s => <option key={s} value={s}>{label(s)}</option>)}</select>
      <label className="check small"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} /> Show archived</label>
      <span className="spacer" />
      <Segmented value={view} onChange={v => { setView(v); try { localStorage.setItem('rhc-projects-view', v); } catch {} }} options={[{ value: 'grid', label: <LayoutGrid size={14} /> }, { value: 'table', label: <List size={14} /> }]} />
    </div>
    {error && <ErrorNote error={error} onRetry={reload} />}
    {loading ? <Loading /> : list.length === 0 ? <div className="card"><Empty icon={<FolderKanban size={20} />} title={data?.projects?.length ? 'No projects match these filters' : 'No projects yet'} action={can.write && !data?.projects?.length && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>Create the first project</Button>}>Projects connect deals, documents, tasks, legal reviews, marketing, email and meetings.</Empty></div>
      : view === 'grid' ? <div className="grid g3">{list.map((p: any) => <Link key={p.id} href={`/projects/${p.id}`} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row between"><StatusBadge value={p.status} /><RiskBadge value={p.risk} /></div>
        <div><div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div><div className="muted small row" style={{ gap: 4, marginTop: 3 }}>{p.location && <><MapPin size={12} />{p.location}</>}{p.project_type && <> · {p.project_type}</>}</div></div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{p.deal_value ? money(p.deal_value, true) : <span className="muted small">No value set</span>}</div>
        <div className="small muted ellipsis">{p.next_action ? `Next: ${p.next_action}` : 'No next action'}</div>
        <div className="row small muted" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 10 }}><span>{p.counts.tasks} open tasks</span>{p.counts.overdue > 0 && <span style={{ color: 'var(--red)' }}>{p.counts.overdue} overdue</span>}<span className="spacer" /><span>{p.counts.docs} docs</span></div>
      </Link>)}</div>
      : <div className="card table-wrap"><table className="table"><thead><tr><th>Project</th><th>Stage</th><th>Risk</th><th>Value</th><th className="hide-sm">Next action</th><th className="hide-sm">Tasks</th><th className="hide-sm">Updated</th></tr></thead><tbody>
        {list.map((p: any) => <tr key={p.id} className="clickable" onClick={() => router.push(`/projects/${p.id}`)}><td><b>{p.name}</b><div className="tiny muted">{p.location}</div></td><td><StatusBadge value={p.status} /></td><td><RiskBadge value={p.risk} /></td><td className="nowrap">{money(p.deal_value, true)}</td><td className="hide-sm small">{p.next_action || '—'}{p.next_action_at && <div className="tiny muted">{date(p.next_action_at)}</div>}</td><td className="hide-sm">{p.counts.tasks}{p.counts.overdue > 0 && <span className="badge red" style={{ marginLeft: 6 }}>{p.counts.overdue} overdue</span>}</td><td className="hide-sm small muted">{date(p.updated_at)}</td></tr>)}
      </tbody></table></div>}
    <ProjectForm open={creating} onClose={() => setCreating(false)} onSaved={p => router.push(`/projects/${p.id}`)} />
  </>;
}
