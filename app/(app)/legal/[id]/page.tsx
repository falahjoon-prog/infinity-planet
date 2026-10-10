'use client';
import { SplitHandle } from '@/components/split-handle';
import { leave, useOpenWindow } from '@/lib/client/nav-history';
import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Printer, Cpu, Sparkles, FileText, Copy, Trash2, ListChecks, HelpCircle, Handshake, PenLine, AlertTriangle, ShieldAlert, Library , FileDown } from 'lucide-react';
import { api, useApi, downloadBlob } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { DocViewer } from '@/components/doc-viewer';
import { AmendContract } from '@/components/amend-contract';
import { RequestApproval, ApprovalTrail } from '@/components/workflow';
import { PageHead, Card, Loading, ErrorNote, Empty, StatusBadge, RiskBadge, AuthorityBadge, Button, Tabs, KV, Notice, useToast, useConfirm } from '@/components/ui';
import { date, label } from '@/lib/client/format';

const SEV_COLOR: Record<string, string> = { critical: '#8b1a10', high: '#c0392b', medium: '#b7791f', low: '#7a879b' };

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter();
  const { me } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const { data, error, loading, reload } = useApi<any>(`/api/legal/reviews/${id}`, [id]);
  const [tab, setTab] = useState<'summary' | 'risks' | 'missing' | 'negotiation' | 'dd' | 'library' | 'outline'>('summary');
  const win = useOpenWindow('doc'); const doc = win.value; // an open document lives in the address, so Back closes it
  const [sev, setSev] = useState(''); const [amend, setAmend] = useState(false); const [pdfBusy, setPdfBusy] = useState(false);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data) return null;
  const r = data.review; const a = r.analysis || {};
  if (!a.findings) return <><PageHead title={r.title || 'Legal review'} /><Notice tone="warn">This review was created by V3.1 and has no structured analysis. Re-run it from Legal AI to use the V4 engine.</Notice>{r.raw_analysis && <pre className="doc-text mt16">{r.raw_analysis}</pre>}</>;
  const counts = (a.findings || []).reduce((m: any, f: any) => (m[f.severity] = (m[f.severity] || 0) + 1, m), {});
  const findings = (a.findings || []).filter((f: any) => !sev || f.severity === sev);
  const remove = async () => { if (!(await confirm({ title: 'Delete this review?', confirm: 'Delete', danger: true }))) return; try { await api.del(`/api/legal/reviews/${id}`); leave(router, '/legal'); } catch (e: any) { toast(e.message, 'error'); } };
  const printPdf = async () => { const w = window.open('', '_blank'); try { const { blob } = await api.blob(`/api/legal/reviews/${id}/pdf`); const u = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })); if (w) w.location.href = u; else window.open(u, '_blank'); } catch (e: any) { w?.close(); toast(e.message, 'error'); } };
  const downloadPdf = async () => { setPdfBusy(true); try { const { blob, name } = await api.blob(`/api/legal/reviews/${id}/pdf`); downloadBlob(blob, name); } catch (e: any) { toast(e.message, 'error'); } finally { setPdfBusy(false); } };
  const copy = (t: string) => { navigator.clipboard?.writeText(t).then(() => toast('Copied', 'success')); };
  const score = a.overall_risk?.score ?? r.risk_score ?? 0;
  const dialColor = SEV_COLOR[(a.overall_risk?.rating || '').toLowerCase()] || '#2f8a57';
  return <>
    <PageHead back={{ href: '/legal', label: 'Legal AI' }} eyebrow={<>{r.project && <><Link className="link" href={`/projects/${r.project.id}`}>{r.project.name}</Link></>}</>} title={r.title}
      sub={<span className="row wrap" style={{ gap: 8 }}>{a.engine === 'rules+ai' ? <span className="badge blue"><Sparkles size={12} />Rules engine + {a.provider}</span> : <span className="badge"><Cpu size={12} />Built-in rules engine</span>}<StatusBadge value={r.status} /><span className="muted small">{date(r.created_at, true)}{r.author?.full_name ? ` · ${r.author.full_name}` : ''}</span></span>}
      actions={<><Button variant="primary" icon={<PenLine size={15} />} onClick={() => setAmend(true)}>Amend contract</Button>{r.document && <Button icon={<FileText size={15} />} onClick={() => win.open(r.document.id)}>Source document</Button>}<Button icon={<Printer size={15} />} onClick={printPdf}>Print</Button><Button icon={<FileDown size={15} />} loading={pdfBusy} onClick={downloadPdf}>PDF</Button>
        {!['approved', 'awaiting_approval'].includes(r.status) && <RequestApproval type="contract_review" id={r.id} status={r.status} onDone={reload} label="Submit for legal approval" />}
        {['admin', 'director', 'legal'].includes(me.role) && <Button variant="ghost" icon={<Trash2 size={15} />} onClick={remove} title="Delete this review">Delete</Button>}</>} />
    {r.ai_error && <div className="mb16"><Notice tone="warn">The AI step did not complete ({r.ai_error}). The built-in rules analysis below is complete.</Notice></div>}
    {data.approvals?.length > 0 && <div className="mb16"><ApprovalTrail approvals={data.approvals} /></div>}
    <div className="grid g-main"><SplitHandle id="review-side" edge="last" cssVar="--split-side" min={260} max={640} minOther={520} />
      <div className="stack">
        <div className="card" style={{ padding: 18 }}>
          <div className="row wrap" style={{ gap: 20, alignItems: 'center' }}>
            <div className="risk-dial" style={{ background: `conic-gradient(${dialColor} ${score * 3.6}deg, var(--slate-soft) 0)` }}><span style={{ color: dialColor }}>{score}</span></div>
            <div style={{ flex: 1, minWidth: 220 }}><div className="eyebrow">Overall risk to us</div><div className="row" style={{ gap: 10 }}><RiskBadge value={a.overall_risk?.rating} /><span className="small muted">{a.document_type} · {label(a.binding_status)}</span></div>
              <div className="row wrap mt8" style={{ gap: 6 }}>{['critical', 'high', 'medium', 'low'].map(s => counts[s] ? <span key={s} className="badge" style={{ background: `${SEV_COLOR[s]}18`, color: SEV_COLOR[s] }}>{counts[s]} {s}</span> : null)}<span className="badge">{a.missing_protections?.length || 0} missing protections</span></div></div>
          </div>
          <div className="divider" />
          <div className="eyebrow">Executive summary</div>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{a.executive_summary}</p>
          <Notice tone={a.authority?.document_authority === 'approved' ? 'success' : 'warn'} icon={<ShieldAlert size={16} />}><b>Document authority: <AuthorityBadge value={a.authority?.document_authority} /></b><div className="small mt8">{a.authority?.note}</div></Notice>
        </div>
        <div className="card"><div style={{ padding: '0 16px' }}><Tabs value={tab} onChange={setTab} tabs={[
          { value: 'summary', label: 'Key terms' }, { value: 'risks', label: 'Risks', count: a.findings?.length }, { value: 'missing', label: 'Missing protections', count: a.missing_protections?.length },
          { value: 'negotiation', label: 'Negotiation & amendments', count: a.recommended_amendments?.length }, { value: 'dd', label: 'Conditions & due diligence', count: (a.conditions_precedent?.length || 0) + (a.due_diligence?.length || 0) },
          { value: 'library', label: 'Clause library', count: a.clause_comparisons?.length }, { value: 'outline', label: 'Outline', count: a.outline?.length },
        ]} /></div>
        <div className="card-body" style={{ paddingTop: 0 }}>
          {tab === 'summary' && <div className="stack">
            <KV items={(a.key_terms || []).map((k: any) => [k.label, <>{k.value}{k.clause_ref && <span className="tiny muted"> ({k.clause_ref})</span>}</>])} />
            <div><div className="eyebrow">Parties</div>{(a.parties || []).length === 0 ? <p className="muted small">No parties could be identified.</p> : <div className="list">{a.parties.map((p: any, i: number) => <div key={i} className="list-item" style={{ padding: '7px 0' }}><div className="main-col"><div className="title">{p.name}{p.defined_as && <span className="muted" style={{ fontWeight: 400 }}> (“{p.defined_as}”)</span>}</div>{p.identifier && <div className="meta">{p.identifier}</div>}</div>{p.is_rhc && <span className="badge navy">Us</span>}</div>)}</div>}<p className="small muted mt8">{a.rhc?.note}</p></div>
            <div className="grid g3">
              <RiskList title="Financial risks" items={a.financial_risks} /><RiskList title="Termination risks" items={a.termination_risks} /><RiskList title="Liability risks" items={a.liability_risks} />
            </div>
          </div>}
          {tab === 'risks' && <div>
            <div className="row wrap mb12" style={{ gap: 6 }}>{['', 'critical', 'high', 'medium', 'low'].map(s => <button key={s} className={`btn xs ${sev === s ? 'primary' : ''}`} onClick={() => setSev(s)}>{s ? label(s) : 'All'}{s && counts[s] ? ` (${counts[s]})` : ''}</button>)}</div>
            {findings.length === 0 ? <Empty title="No findings at this level" /> : findings.map((f: any) => <div key={f.id} className={`finding ${f.severity}`}>
              <div className="row wrap" style={{ gap: 8 }}><span className="badge upper" style={{ background: `${SEV_COLOR[f.severity]}18`, color: SEV_COLOR[f.severity] }}>{f.severity}</span><b style={{ flex: 1 }}>{f.title}</b>{f.clause_ref && <span className="badge outline">{f.clause_ref}</span>}<span className="tiny muted">{f.source === 'ai' ? 'AI' : 'Rules'} · {label(f.category)}</span></div>
              <div className="small mt8">{f.issue}</div>
              {f.excerpt && <div className="excerpt">“{f.excerpt}”</div>}
              <div className="rec"><b>Recommendation:</b> {f.recommendation}</div>
              {f.proposed_wording && <div className="wording"><div className="row between"><b className="tiny">PROPOSED WORDING</b><button className="link tiny" onClick={() => copy(f.proposed_wording)}><Copy size={11} /> Copy</button></div>{f.proposed_wording}</div>}
            </div>)}
          </div>}
          {tab === 'missing' && ((a.missing_protections || []).length === 0 ? <Empty title="No missing protections detected" /> : a.missing_protections.map((m: any, i: number) => <div key={i} className={`finding ${m.severity}`}>
            <div className="row" style={{ gap: 8 }}><span className="badge upper" style={{ background: `${SEV_COLOR[m.severity]}18`, color: SEV_COLOR[m.severity] }}>{m.severity}</span><b style={{ flex: 1 }}>Missing: {m.label}</b><span className="tiny muted">{m.source === 'ai' ? 'AI' : 'Rules'}</span></div>
            <div className="small mt8">{m.why}</div><div className="rec"><b>Add:</b> {m.recommendation}</div>
            {m.proposed_wording && <div className="wording"><div className="row between"><b className="tiny">SUGGESTED CLAUSE</b><button className="link tiny" onClick={() => copy(m.proposed_wording)}><Copy size={11} /> Copy</button></div>{m.proposed_wording}</div>}
          </div>))}
          {tab === 'negotiation' && <div className="stack">
            <Notice icon={<PenLine size={16} />}><div className="row wrap" style={{ gap: 10, justifyContent: 'space-between', width: '100%' }}><span>Apply these amendments and the missing protections to the contract — you get a marked-up redline and a clean copy.</span><Button size="sm" variant="primary" icon={<PenLine size={13} />} onClick={() => setAmend(true)}>Amend contract</Button></div></Notice>
            <div><div className="eyebrow row" style={{ gap: 6 }}><Handshake size={13} />Negotiation points</div>{(a.negotiation_points || []).length ? <ol className="numbered">{a.negotiation_points.map((n: string, i: number) => <li key={i}>{n}</li>)}</ol> : <p className="muted small">None.</p>}</div>
            <div><div className="eyebrow row" style={{ gap: 6 }}><PenLine size={13} />Recommended amendments</div>{(a.recommended_amendments || []).length ? a.recommended_amendments.map((m: any, i: number) => <div key={i} className="mt8"><div className="small"><b>{m.clause_ref}</b> — {m.issue}</div><div className="wording">{m.proposed}</div></div>) : <p className="muted small">None.</p>}</div>
            <div><div className="eyebrow row" style={{ gap: 6 }}><HelpCircle size={13} />Questions for our solicitors</div>{(a.solicitor_questions || []).length ? <ol className="numbered">{a.solicitor_questions.map((n: string, i: number) => <li key={i}>{n}</li>)}</ol> : <p className="muted small">None.</p>}</div>
            <Button icon={<Copy size={14} />} onClick={() => copy([`NEGOTIATION POINTS — ${r.title}`, ...(a.negotiation_points || []).map((n: string, i: number) => `${i + 1}. ${n}`), '', 'QUESTIONS FOR SOLICITORS', ...(a.solicitor_questions || []).map((n: string, i: number) => `${i + 1}. ${n}`)].join('\n'))}>Copy points & questions</Button>
          </div>}
          {tab === 'dd' && <div className="grid g2">
            <div><div className="eyebrow">Conditions precedent</div>{(a.conditions_precedent || []).length ? a.conditions_precedent.map((c: any, i: number) => <div key={i} className="finding low"><span className="badge outline">{c.clause_ref}</span><div className="small mt8">{c.text}</div></div>) : <p className="muted small">No conditions precedent found.</p>}</div>
            <div><div className="eyebrow row" style={{ gap: 6 }}><ListChecks size={13} />Due-diligence checklist</div><div className="list">{(a.due_diligence || []).map((d: any, i: number) => <label key={i} className="list-item" style={{ padding: '8px 0', alignItems: 'flex-start' }}><input type="checkbox" style={{ marginTop: 3 }} /><div className="main-col"><div className="title" style={{ whiteSpace: 'normal' }}>{d.item}</div><div className="meta" style={{ whiteSpace: 'normal' }}>{d.reason}</div></div></label>)}</div></div>
          </div>}
          {tab === 'library' && ((a.clause_comparisons || []).length === 0 ? <Empty icon={<Library size={20} />} title="No clause library positions to compare" action={<Link className="btn sm" href="/legal?tab=clauses">Build the clause library</Link>}>Add your positions in the clause library and approve them — future reviews compare against them.</Empty>
            : <div className="table-wrap"><table className="table"><thead><tr><th>Our position</th><th>Authority</th><th>Result</th><th>Clause</th></tr></thead><tbody>{a.clause_comparisons.map((c: any, i: number) => <tr key={i}><td><b>{c.library_clause}</b><div className="tiny muted">{c.note}</div></td><td><AuthorityBadge value={c.authority} />{!c.is_approved_position && <div className="tiny muted mt8">not approved</div>}</td><td><span className={`badge ${c.result === 'consistent_with_preferred' ? 'green' : c.result === 'prohibited_present' ? 'red' : c.result === 'not_addressed' ? '' : 'amber'}`}>{label(c.result)}</span></td><td className="small">{c.matched_clause_ref || '—'}</td></tr>)}</tbody></table></div>)}
          {tab === 'outline' && <div className="list">{(a.outline || []).map((o: any, i: number) => <div key={i} className="list-item" style={{ padding: '7px 0' }}><span className="badge outline" style={{ minWidth: 60 }}>{o.ref}</span><div className="main-col"><div className="title" style={{ fontWeight: 500 }}>{o.heading}</div></div><div className="row wrap hide-sm" style={{ gap: 4, justifyContent: 'flex-end' }}>{o.topics.slice(0, 4).map((t: string) => <span key={t} className="badge">{label(t)}</span>)}</div></div>)}</div>}
        </div></div>
      </div>
      <div className="stack">
        <Card title={<><AlertTriangle size={15} /> Top issues</>} flush>{(a.findings || []).slice(0, 6).map((f: any) => <button key={f.id} className="list-item" onClick={() => { setTab('risks'); setSev(''); }}><i className="dot-s" style={{ background: SEV_COLOR[f.severity] }} /><div className="main-col"><div className="title">{f.title}</div><div className="meta">{f.clause_ref || 'General'}</div></div></button>)}{!(a.findings || []).length && <Empty title="No risk findings" />}</Card>
        <Card title="Rationale"><ul className="numbered" style={{ paddingLeft: 16 }}>{(a.overall_risk?.rationale || []).map((x: string, i: number) => <li key={i} className="small">{x}</li>)}</ul></Card>
        {a.ai_notes && <Card title="AI corrections to the rules baseline"><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{a.ai_notes}</p></Card>}
        <Card title="Engine"><KV items={[['Engine', a.engine === 'rules+ai' ? `Rules + ${a.provider}` : 'Built-in rules'], ['Version', a.engine_version], ['Clauses read', a.stats?.clauses], ['Words', a.stats?.words?.toLocaleString()], ['Topics found', a.stats?.topics_found?.length]]} /><p className="tiny muted mt12">{a.disclaimer}</p></Card>
      </div>
    </div>
    <DocViewer id={doc} onClose={() => win.close()} />
    <AmendContract reviewId={id} open={amend} onClose={() => setAmend(false)} />
  </>;
}

function RiskList({ title, items }: { title: string; items?: string[] }) {
  return <div className="card" style={{ padding: 12, boxShadow: 'none' }}><div className="eyebrow">{title}</div>{items?.length ? <ul style={{ margin: 0, paddingLeft: 16 }}>{items.map((x, i) => <li key={i} className="small" style={{ marginBottom: 6 }}>{x}</li>)}</ul> : <p className="small muted">None identified.</p>}</div>;
}
