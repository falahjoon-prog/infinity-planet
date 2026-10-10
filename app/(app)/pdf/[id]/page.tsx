'use client';
import React, { Suspense, useState } from 'react';
import { replaceWith } from '@/lib/client/nav-history';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Copy, Send, PenTool, X } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { PdfEditor, Ann } from '@/components/pdf-editor';
import { PageHead, Loading, ErrorNote, Modal, Button, Field, Notice, Tabs, StatusBadge, useToast } from '@/components/ui';
import { ago } from '@/lib/client/format';

export default function Page() { return <Suspense fallback={<Loading />}><PdfPage /></Suspense>; }

function PdfPage() {
  const { id } = useParams<{ id: string }>(); const sp = useSearchParams(); const router = useRouter(); const toast = useToast();
  const [mode, setMode] = useState<'edit' | 'send'>(sp.get('mode') === 'send' ? 'send' : 'edit');
  const { data, error, loading } = useApi<any>(`/api/documents/${id}/pdf`, [id]);
  const { data: reqs, reload: reloadReqs } = useApi<any>(`/api/sign-requests?document_id=${id}`, [id]);
  const [saving, setSaving] = useState(false); const [fields, setFields] = useState<Ann[] | null>(null);
  const [f, setF] = useState<any>({ signer_name: '', signer_email: '', message: '', expires_days: 30, email: true }); const [sent, setSent] = useState<any>(null);
  if (loading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const save = async (anns: Ann[]) => {
    setSaving(true);
    try { const r = await api.post(`/api/documents/${id}/pdf`, { annotations: anns.filter(a => a.type !== 'field').map(({ id: _i, ...a }) => a) }); toast(`Saved “${r.document.name}” to Documents`, 'success'); replaceWith(router, `/documents?open=${r.document.id}`); }
    catch (e: any) { toast(e.message, 'error'); } finally { setSaving(false); }
  };
  const send = async () => {
    setSaving(true);
    try { const r = await api.post('/api/sign-requests', { document_id: id, ...f, fields: (fields || []).map(a => ({ page: a.page, x: a.x, y: a.y, w: a.w, h: a.h, kind: a.kind, label: a.label, required: a.required })) }); setSent(r); setFields(null); reloadReqs(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setSaving(false); }
  };
  return <>
    <PageHead back={{ href: '/documents', label: 'Documents' }} title={data.document.name} sub={mode === 'edit' ? 'Sign, stamp, add text or dates, tick boxes, highlight or white-out wording. Saving makes a new signed copy — the original is kept.' : 'Place the boxes the client must complete, then send them a secure signing link.'} actions={<button className="icon-btn" title="Close" aria-label="Close" onClick={() => (window.history.length > 1 ? router.back() : router.push('/documents'))}><X size={18} /></button>} />
    <Tabs value={mode} onChange={setMode} tabs={[{ value: 'edit', label: 'Sign / edit myself' }, { value: 'send', label: 'Send for signature', count: (reqs?.requests || []).filter((r: any) => ['sent', 'viewed'].includes(r.status)).length }]} />
    {mode === 'send' && (reqs?.requests || []).length > 0 && <div className="card mb12" style={{ padding: 10 }}><b className="small">Signature requests</b>{reqs.requests.map((r: any) => <div key={r.id} className="row small mt8" style={{ gap: 8 }}><StatusBadge value={r.status} /><span>{r.signer_name} &lt;{r.signer_email}&gt;</span><span className="tiny muted">{ago(r.created_at)}{r.signed_at ? ` · signed ${ago(r.signed_at)}` : r.viewed_at ? ` · opened ${ago(r.viewed_at)}` : ''}{r.declined_reason ? ` · “${r.declined_reason}”` : ''}</span><span className="spacer" />{r.signed_document_id && <Link className="link tiny" href={`/documents?open=${r.signed_document_id}`}>Open signed copy</Link>}{['sent', 'viewed'].includes(r.status) && <button className="link tiny" onClick={async () => { await api.del(`/api/sign-requests/${r.id}`); reloadReqs(); }}>Cancel</button>}</div>)}</div>}
    <PdfEditor key={mode} url={data.url} mode={mode} saving={saving} onSave={anns => mode === 'edit' ? save(anns) : setFields(anns)} />
    {fields && <Modal open onClose={() => setFields(null)} title={<><Send size={15} /> Who signs?</>} footer={<><Button onClick={() => setFields(null)}>Back</Button><Button variant="primary" loading={saving} onClick={send}>Create signing link</Button></>}>
      <div className="form-grid">
        <Field label="Signer's full name"><input className="input" value={f.signer_name} onChange={e => setF({ ...f, signer_name: e.target.value })} /></Field>
        <Field label="Signer's email"><input className="input" type="email" value={f.signer_email} onChange={e => setF({ ...f, signer_email: e.target.value })} /></Field>
        <Field label="Message (optional)" className="full"><textarea className="textarea" value={f.message} onChange={e => setF({ ...f, message: e.target.value })} placeholder="Please sign the MOU by Friday." /></Field>
        <Field label="Link expires after"><select className="select" value={f.expires_days} onChange={e => setF({ ...f, expires_days: Number(e.target.value) })}>{[3, 7, 14, 30, 60].map(d => <option key={d} value={d}>{d} days</option>)}</select></Field>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.email} onChange={e => setF({ ...f, email: e.target.checked })} /> Prepare the email to the signer (Gmail → Drafts, sent after approval)</label>
        <div className="full tiny muted">{(fields || []).length} box(es) placed. The signed PDF gets a signing certificate page (name, email, time, IP address and a fingerprint of the original) and is saved to Documents.</div>
      </div>
    </Modal>}
    {sent && <Modal open onClose={() => setSent(null)} title="Signing link created" footer={<Button variant="primary" onClick={() => setSent(null)}>Done</Button>}>
      <div className="stack" style={{ gap: 10 }}>
        <Field label="Secure link (only shown now — copy it if you'll send it yourself)"><div className="row"><input className="input mono" readOnly value={sent.link} /><Button icon={<Copy size={13} />} onClick={() => { navigator.clipboard?.writeText(sent.link); toast('Link copied', 'success'); }} /></div></Field>
        {sent.email_draft_id ? <Notice>An email with this link is waiting in <Link className="link" href="/gmail?tab=drafts">Gmail → Drafts</Link>. Open it and press Send.</Notice> : null}
        <div className="tiny muted">You'll get a notification when it's signed or declined.</div>
      </div>
    </Modal>}
  </>;
}
