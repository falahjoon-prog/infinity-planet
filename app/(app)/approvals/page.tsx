'use client';
import React, { Suspense, useState } from 'react';
import { useOpenWindow } from '@/lib/client/nav-history';
import Link from 'next/link';
import { ApproverPicker } from '@/components/workflow';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Check, X, RotateCcw, MessageSquare, ExternalLink } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { PageHead, Loading, ErrorNote, Empty, StatusBadge, RiskBadge, AuthorityBadge, Button, Drawer, Segmented, KV, Notice, Avatar, useToast } from '@/components/ui';
import { ago, date, label, personName } from '@/lib/client/format';

const HREF: Record<string, (id: string) => string> = {
  contract_review: id => `/legal/${id}`, generated_document: id => `/drafting/${id}`, marketing_asset: id => `/marketing?open=${id}`,
  email_draft: () => '/gmail?tab=drafts', document: id => `/documents?open=${id}`, template: () => '/drafting?tab=templates', legal_clause: () => '/legal?tab=clauses',
};

export default function Page() { return <Suspense fallback={<Loading />}><Approvals /></Suspense>; }

function Approvals() {
  const sp = useSearchParams(); const router = useRouter();
  const [filter, setFilter] = useState<'mine' | 'pending' | 'all'>('pending');
  const win = useOpenWindow(); const open = win.value; // the open approval lives in the address, so Back closes it
  const { data, error, loading, reload } = useApi<any>(`/api/approvals${filter === 'all' ? '' : '?status=pending'}`, [filter]);
  const list = (data?.approvals || []).filter((a: any) => filter !== 'mine' || a.can_decide);
  return <>
    <PageHead eyebrow="Govern" title="Approvals" sub="Contracts, legal reviews, marketing, designs, important documents, templates, clause positions and outgoing emails." />
    <div className="filters"><Segmented value={filter} onChange={setFilter} options={[{ value: 'pending', label: 'Pending' }, { value: 'mine', label: 'Awaiting my decision' }, { value: 'all', label: 'All history' }]} /></div>
    {error && <ErrorNote error={error} onRetry={reload} />}
    {loading ? <Loading /> : list.length === 0 ? <div className="card"><Empty icon={<ShieldCheck size={20} />} title={filter === 'all' ? 'No approvals yet' : 'Nothing waiting'} /></div>
      : <div className="card table-wrap"><table className="table"><thead><tr><th>Item</th><th>Type</th><th>Requested by</th><th className="hide-sm">Reviewer</th><th>Status</th><th className="hide-sm">Decision</th></tr></thead><tbody>
        {list.map((a: any) => <tr key={a.id} className="clickable" onClick={() => win.open(a.id)}><td><b>{a.title}</b>{a.project?.name && <div className="tiny muted">{a.project.name}</div>}</td><td><span className="badge purple">{label(a.category || a.entity_type)}</span></td><td className="small">{a.requester?.full_name || '—'}<div className="tiny muted">{ago(a.created_at)}</div></td><td className="hide-sm small">{a.assigned_to_me ? <b>You</b> : Array.isArray(a.approvers) && a.approvers.length ? `${a.approvers.length} named` : a.reviewer?.full_name || <span className="muted">Any approver</span>}</td><td><StatusBadge value={a.status} />{a.can_decide && <div className="tiny" style={{ color: 'var(--amber)', marginTop: 3 }}>Your decision</div>}</td><td className="hide-sm small">{a.decider?.full_name ? `${a.decider.full_name} · ${date(a.decided_at)}` : '—'}</td></tr>)}
      </tbody></table></div>}
    <ApprovalDrawer id={open} onClose={() => win.close()} onChanged={reload} />
  </>;
}

function ApprovalDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast(); const { me } = useApp();
  const { data, loading, error, reload } = useApi<any>(id ? `/api/approvals/${id}` : null, [id]);
  const [note, setNote] = useState(''); const [comment, setComment] = useState(''); const [busy, setBusy] = useState<string | null>(null);
  const a = data?.approval; const e = data?.entity;
  const decide = async (status: string) => {
    if (status !== 'approved' && !note.trim()) return toast('Add a comment explaining the decision', 'error');
    setBusy(status); try { await api.patch(`/api/approvals/${id}`, { status, note }); toast(`Marked ${label(status)}`, 'success'); setNote(''); reload(); onChanged(); } catch (x: any) { toast(x.message, 'error'); } finally { setBusy(null); }
  };
  const cancel = async () => { setBusy('cancel'); try { await api.patch(`/api/approvals/${id}`, { status: 'cancelled' }); toast('Request cancelled', 'success'); reload(); onChanged(); } catch (x: any) { toast(x.message, 'error'); } finally { setBusy(null); } };
  const addComment = async () => { if (!comment.trim()) return; try { await api.post(`/api/approvals/${id}/comments`, { body: comment }); setComment(''); reload(); } catch (x: any) { toast(x.message, 'error'); } };
  return <Drawer open={!!id} onClose={onClose} className="doc-drawer" title={a?.title || 'Approval'} actions={a && <StatusBadge value={a.status} />}
    footer={a?.can_decide ? <div className="stack" style={{ width: '100%', gap: 8 }}><div className="ap-decide-note"><label className="tiny muted">Note to {a.requester?.full_name || 'the requester'} — sent with your decision (needed to reject or ask for changes)</label><input className="input" placeholder={`e.g. Looks good / Please change clause 4`} value={note} onChange={x => setNote(x.target.value)} /></div><div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}><Button icon={<RotateCcw size={14} />} loading={busy === 'changes_requested'} onClick={() => decide('changes_requested')}>Ask for changes</Button><Button variant="danger" icon={<X size={14} />} loading={busy === 'rejected'} onClick={() => decide('rejected')}>Reject</Button><Button variant="success" icon={<Check size={14} />} loading={busy === 'approved'} onClick={() => decide('approved')}>Approve</Button></div></div>
      : a?.status === 'pending' && a.requested_by === me.id ? <Button loading={busy === 'cancel'} onClick={cancel}>Cancel request</Button> : null}>
    {loading && <Loading />}{error && <ErrorNote error={error} />}
    {a && <div className="stack">
      <div className="ap-meta">
        <span className="badge">{label(a.entity_type)}</span>
        <span>From <b>{a.requester?.full_name || '—'}</b> · {date(a.created_at, true)}</span>
        <span>Approver: <b>{a.approver_people?.length ? a.approver_people.map((p: any) => personName(p)).join(', ') : a.reviewer?.full_name || 'anyone allowed'}</b></span>
        {a.project?.name && <span>Project: <b>{a.project.name}</b></span>}
        {a.decided_at && <span>{label(a.status)} by <b>{a.decider?.full_name || '—'}</b> · {date(a.decided_at, true)}</span>}
      </div>
      {a.summary && <div className="ap-note">“{a.summary}”</div>}
      {a.status === 'pending' && !a.can_decide && <Notice>{a.approver_people?.length ? `Only ${a.approver_people.map((p: any) => personName(p)).join(' or ')} can approve or change this. You can view it and comment.` : a.requested_by === me.id ? 'Waiting for an authorised approver.' : `Your role (${label(me.role)}) can't decide ${label(a.category)} approvals${a.reviewer_id ? ', or it is assigned to someone else' : ''}.`}</Notice>}
      {a.can_reassign && <Reassign approval={a} onDone={() => { reload(); onChanged(); }} />}
      <div className="ap-item">{HREF[a.entity_type] && <Link className="btn sm ghost ap-open" href={HREF[a.entity_type](a.entity_id)}>Open in full <ExternalLink size={12} /></Link>}<EntityPreview type={a.entity_type} e={e} /></div>
      <div><div className="eyebrow row" style={{ gap: 6 }}><MessageSquare size={13} />Discussion <span className="tiny muted" style={{ fontWeight: 400 }}>— everyone on this approval sees these</span></div>
        {(data.comments || []).length === 0 && <p className="small muted">No comments yet.</p>}
        {(data.comments || []).map((c: any) => <div key={c.id} className="cm"><Avatar name={c.author?.full_name} size="sm" /><div className="body"><div className="who">{c.author?.full_name}<time>{ago(c.created_at)}</time></div><div className="text">{c.body}</div></div></div>)}
        <div className="row mt8"><input className="input" placeholder="Add a comment" value={comment} onChange={x => setComment(x.target.value)} onKeyDown={x => x.key === 'Enter' && addComment()} /><Button onClick={addComment}>Post</Button></div></div>
    </div>}
  </Drawer>;
}

function EntityPreview({ type, e }: { type: string; e: any }) {
  if (!e) return <p className="muted small">The item no longer exists.</p>;
  if (type === 'contract_review') { const an = e.analysis || {}; return <div className="stack" style={{ gap: 10 }}><div className="row"><RiskBadge value={e.risk_rating} /><span className="small muted">{e.risk_score}/100 · {an.findings?.length || 0} risks · {an.missing_protections?.length || 0} missing protections</span></div><p className="small">{an.executive_summary}</p>{(an.findings || []).slice(0, 5).map((f: any) => <div key={f.id} className="small">• <b>{f.severity.toUpperCase()}</b> {f.title}{f.clause_ref ? ` (${f.clause_ref})` : ''}</div>)}</div>; }
  if (type === 'email_draft') return <div className="small"><div><b>To:</b> {e.to_addresses}</div>{e.cc_addresses && <div><b>Cc:</b> {e.cc_addresses}</div>}<div><b>Subject:</b> {e.subject}</div><div className="doc-text mt8" style={{ fontFamily: 'var(--font)', maxHeight: 360 }}>{e.body}</div></div>;
  if (type === 'marketing_asset') return e.kind === 'design' ? <div className="small"><p>Design — <b>{e.layout}</b>. Open it to view the full layout.</p><p className="mt8"><b>{e.design?.content?.headline}</b></p><p>{e.design?.content?.body}</p></div> : <div className="doc-text" style={{ fontFamily: 'var(--font)', maxHeight: 400 }}>{e.content}</div>;
  if (type === 'generated_document') return <div className="doc-text" style={{ maxHeight: 420 }}>{e.body}</div>;
  if (type === 'template') return <div><p className="small muted mb12">{e.description} · v{e.version}</p><div className="doc-text" style={{ maxHeight: 420 }}>{e.body}</div></div>;
  if (type === 'legal_clause') return <div className="stack small" style={{ gap: 8 }}><div className="row"><AuthorityBadge value={e.authority} /><b>{e.name}</b></div>{e.clause_text && <div><b className="tiny muted">CLAUSE</b><div style={{ whiteSpace: 'pre-wrap' }}>{e.clause_text}</div></div>}{e.preferred_position && <div><b className="tiny muted">PREFERRED</b><div>{e.preferred_position}</div></div>}{e.fallback_position && <div><b className="tiny muted">FALLBACK</b><div>{e.fallback_position}</div></div>}{e.prohibited_position && <div style={{ color: 'var(--red)' }}><b className="tiny">PROHIBITED</b><div>{e.prohibited_position}</div></div>}</div>;
  if (type === 'document') return <div><div className="row mb12"><AuthorityBadge value={e.authority} /><b className="small">{e.name}</b></div>{e.content_text ? <div className="doc-text" style={{ maxHeight: 380 }}>{e.content_text}</div> : <p className="small muted">No extracted text.</p>}</div>;
  return <pre className="small">{JSON.stringify(e, null, 2).slice(0, 2000)}</pre>;
}

function Reassign({ approval, onDone }: { approval: any; onDone: () => void }) {
  const toast = useToast(); const [open, setOpen] = useState(false); const [v, setV] = useState<string[]>(approval.approvers || []);
  const save = async () => { try { await api.patch(`/api/approvals/${approval.id}`, { approvers: v }); toast('Approvers updated', 'success'); setOpen(false); onDone(); } catch (e: any) { toast(e.message, 'error'); } };
  return open ? <div className="card" style={{ padding: 10 }}><b className="small">Change who approves</b><div className="mt8"><ApproverPicker value={v} onChange={setV} type={approval.entity_type} /></div><div className="row mt8" style={{ gap: 6 }}><Button size="sm" variant="primary" disabled={!v.length} onClick={save}>Save</Button><Button size="sm" onClick={() => setOpen(false)}>Cancel</Button></div></div>
    : <div><button className="link small" onClick={() => setOpen(true)}>Change approvers…</button></div>;
}
