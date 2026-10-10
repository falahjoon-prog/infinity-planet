'use client';
/** Legal AI → Company records: RHC's constitution, trust deeds, agreements and structure, and what the AI takes from them. */
import React, { useState } from 'react';
import { Building2, FileText, Users, ShieldCheck, AlertTriangle, Download, Sparkles, GitBranch } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { useApp } from './app-context';
import { Card, Loading, ErrorNote, Empty, Button, Markdown, Notice, Segmented, useToast, AuthorityBadge } from './ui';
import { DocViewer } from './doc-viewer';
import { askAi } from './selection-ask';

type View = 'summary' | 'people' | 'rules' | 'structure' | 'documents' | 'open';
const src = (s?: string) => s ? <span className="tiny muted"> — {s}</span> : null;

export function CompanyRecords() {
  const { can, me } = useApp(); const toast = useToast();
  const { data, error, loading, reload } = useApi<any>('/api/company-records');
  const org = useApi<any>('/api/team/org');
  const [view, setView] = useState<View>('summary'); const [busy, setBusy] = useState(false); const [doc, setDoc] = useState<string | null>(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  const p = data?.profile?.json || null; const md: string = data?.profile?.summary_md || '';
  const waiting = (data?.folder?.files || []).filter((f: any) => !f.loaded);
  const canLoad = ['admin', 'director'].includes(me.role);
  const load = async () => { setBusy(true); try { const r = await api.post('/api/company-records', {}); toast(`Loaded ${r.results.filter((x: any) => !/failed/.test(x.status)).length} company records${r.profile ? ' and the company profile' : ''}`, 'success'); reload(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  const asks = ['Who can sign contracts for RHC City?', 'What decisions need unitholder approval?', 'Who owns the Rose Heritage City Unit Trust?', 'Does a $2m loan need Board approval?'];
  return <div className="stack">
    {waiting.length > 0 && <Notice tone="info"><b>{waiting.length} company record{waiting.length === 1 ? '' : 's'} ready to load</b> — {waiting.map((f: any) => f.name).join(', ')}.{canLoad ? <> <Button size="sm" variant="primary" loading={busy} onClick={load} style={{ marginLeft: 8 }}>Load company records</Button></> : ' Ask an admin or director to load them.'}</Notice>}
    {!p && !waiting.length && <Card><Empty icon={<Building2 size={20} />} title="No company records yet">Put your constitution, trust deeds and shareholder/unitholder agreements in the app folder's “company-records” folder, or upload them to Documents.</Empty></Card>}
    {p && <>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Segmented tabs value={view} onChange={setView} options={[{ value: 'summary', label: 'Summary' }, { value: 'people', label: 'Who’s who' }, { value: 'rules', label: 'Approvals & signing' }, { value: 'structure', label: 'Structure' }, { value: 'documents', label: `Documents (${data.documents.length})` }, { value: 'open', label: `Open points (${(p.uncertain || []).length})` }]} />
        <span className="spacer" />
        {canLoad && data?.folder?.available && <Button size="sm" loading={busy} onClick={load}>Reload from folder</Button>}
      </div>
      <div className="cr-ask"><Sparkles size={14} /><span className="small">Infinity AI and Legal AI follow these records. Ask:</span>{asks.map(q => <button key={q} className="chip" onClick={() => askAi(q)}>{q}</button>)}</div>
      {view === 'summary' && <Card><div className="cr-md"><Markdown text={md || 'No summary.'} /></div></Card>}
      {view === 'people' && <div className="grid g2">
        <Card title={<><Building2 size={15} /> Entities</>} flush><div className="list">{(p.entities || []).map((e: any, i: number) => <div key={i} className="list-item" style={{ alignItems: 'flex-start' }}><div className="main-col"><div className="title" style={{ whiteSpace: 'normal' }}>{e.name}{e.acn ? <span className="muted small"> · ACN {e.acn}</span> : null}</div><div className="meta" style={{ whiteSpace: 'normal' }}>{e.role || e.type}{e.officeholders?.length ? ` · ${e.officeholders.map((o: any) => `${o.name} (${o.office})`).join(', ')}` : ''}{src(e.source)}</div></div></div>)}</div></Card>
        <Card title={<><Users size={15} /> People</>} flush><div className="list">{(p.people || []).map((x: any, i: number) => <div key={i} className="list-item" style={{ alignItems: 'flex-start' }}><div className="main-col"><div className="title">{x.name}</div><div className="meta" style={{ whiteSpace: 'normal' }}>{(x.roles || []).join(' · ')}</div></div></div>)}</div></Card>
        {(p.trusts || []).length > 0 && <Card title="Trusts and unitholders" className="span2" flush><div className="list">{p.trusts.map((t: any, i: number) => <div key={i} className="list-item" style={{ alignItems: 'flex-start' }}><div className="main-col"><div className="title" style={{ whiteSpace: 'normal' }}>{t.name} <span className="muted small">({t.type}) · trustee {t.trustee}</span></div>{t.unitholders?.length > 0 && <div className="meta" style={{ whiteSpace: 'normal' }}>{t.unitholders.map((u: any) => `${u.name}${u.units ? ` — ${u.units}` : ''}${u.percent ? ` (${u.percent})` : ''}`).join(' · ')}</div>}{(t.key_terms || []).slice(0, 6).map((k: string, j: number) => <div key={j} className="tiny muted" style={{ whiteSpace: 'normal' }}>• {k}</div>)}</div></div>)}</div></Card>}
      </div>}
      {view === 'rules' && <div className="stack">
        <Card title={<><ShieldCheck size={15} /> Signing documents</>} flush><div className="list">{(p.signing_authority || []).map((s: any, i: number) => <div key={i} className="list-item" style={{ alignItems: 'flex-start' }}><div className="main-col"><div className="title">{s.entity}</div><div className="meta" style={{ whiteSpace: 'normal' }}>{s.rule}{src(s.source)}</div></div></div>)}</div></Card>
        <Card title="Decisions that need special approval" flush><div className="table-wrap"><table className="table"><thead><tr><th>Decision</th><th>Approval needed</th><th className="hide-sm">Source</th></tr></thead><tbody>{(p.reserved_matters || []).map((r: any, i: number) => <tr key={i}><td style={{ whiteSpace: 'normal' }}>{r.matter}</td><td style={{ whiteSpace: 'normal' }}><b>{r.approval_needed}</b></td><td className="hide-sm tiny muted" style={{ whiteSpace: 'normal' }}>{r.source}</td></tr>)}</tbody></table></div></Card>
        <Card title="Governance rules" flush><div className="list">{(p.governance || []).map((g: any, i: number) => <div key={i} className="list-item" style={{ alignItems: 'flex-start' }}><div className="main-col"><div className="title" style={{ whiteSpace: 'normal' }}>{g.topic}{g.applies_to ? <span className="muted small"> · {g.applies_to}</span> : null}</div><div className="meta" style={{ whiteSpace: 'normal' }}>{g.rule}{src(g.source)}</div></div></div>)}</div></Card>
      </div>}
      {view === 'structure' && <OrgView org={org.data?.org} />}
      {view === 'documents' && <Card flush><div className="list">{data.documents.map((d: any) => <button key={d.id} className="list-item" onClick={() => setDoc(d.id)} style={{ textAlign: 'left' }}><FileText size={16} className="muted" /><div className="main-col"><div className="title">{d.name}</div><div className="meta">{d.metadata?.record_note || d.category || ''}{d.metadata?.extraction?.includes('ocr') ? ' · scanned, text read by OCR' : ''}</div></div><AuthorityBadge value={d.authority} /></button>)}</div></Card>}
      {view === 'open' && <Card title={<><AlertTriangle size={15} /> Open points and conflicts between the documents</>}><p className="small muted" style={{ marginTop: 0 }}>Infinity AI flags these instead of treating them as settled. Resolve them with your lawyer and the Board.</p><ul className="cr-open">{(p.uncertain || []).map((u: any, i: number) => <li key={i}>{typeof u === 'string' ? u : JSON.stringify(u)}</li>)}</ul></Card>}
    </>}
    <DocViewer id={doc} onClose={() => setDoc(null)} />
  </div>;
}

/** The company structure as a tree (positions, who holds them). Edited in Settings → Team & access. */
export function OrgView({ org }: { org: any }) {
  const { members } = useApp();
  if (!org) return <Loading />;
  const name = (id: string) => (members || []).find((m: any) => m.id === id)?.full_name || 'Team member';
  const kids = (id: string | null) => org.positions.filter((p: any) => p.reports_to === id);
  const node = (p: any): React.ReactNode => <li key={p.id}><div className={`org-node${p.holders.length ? '' : ' vacant'}`}><b>{p.title}</b><span>{p.holders.length ? p.holders.map(name).join(', ') : 'Vacant'}</span></div>{kids(p.id).length > 0 && <ul>{kids(p.id).map(node)}</ul>}</li>;
  return <Card title={<><GitBranch size={15} /> Reporting lines</>} sub={org.routing === 'copy' ? 'a skipped manager is copied' : 'approvals go up one level at a time'}><div className="org-tree"><ul>{kids(null).map(node)}</ul></div><p className="tiny muted">Change who holds each position in Settings → Team &amp; access → Company structure.</p></Card>;
}
