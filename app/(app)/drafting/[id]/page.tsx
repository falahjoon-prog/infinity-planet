'use client';
import { SplitHandle } from '@/components/split-handle';
import { leave } from '@/lib/client/nav-history';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Save, Download, Printer, Trash2, Lock, AlertTriangle, Eye, Sparkles, CheckCircle2 } from 'lucide-react';
import { api, useApi, downloadBlob } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { RequestApproval, ApprovalTrail } from '@/components/workflow';
import { PageHead, Card, Loading, ErrorNote, StatusBadge, AuthorityBadge, Button, KV, Notice, useToast, useConfirm , Modal } from '@/components/ui';
import { date, label, personName } from '@/lib/client/format';
import { LetterheadPreview } from '@/components/doc-studio';
import { WriteChat } from '@/components/write-chat';
import { ProviderSelect } from '@/components/pickers';

const LEGAL_TYPES = ['mou', 'heads_of_agreement', 'contract', 'nda', 'agreement', 'deed', 'lease'];

export default function GeneratedPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter();
  const { can, me } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const [provider, setProvider] = useState('auto');
  const { data, error, loading, reload } = useApi<any>(`/api/generated/${id}`, [id]);
  const [body, setBody] = useState(''); const [title, setTitle] = useState(''); const [busy, setBusy] = useState<string | null>(null);
  const [pv, setPv] = useState<string | null>(null); const [view, setView] = useState<'page' | 'text'>('page'); const [pvKey, setPvKey] = useState(0);
  useEffect(() => { if (data) { setBody(data.generated.body); setTitle(data.generated.title); } }, [data]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data) return null;
  const g = data.generated; const dirty = body !== g.body || title !== g.title;
  const approved = ['approved', 'exported'].includes(g.status); const locked = g.status === 'awaiting_approval';
  const missing: string[] = g.inputs?.missing_fields || []; const clauses: any[] = g.inputs?.clauses_used || [];
  const save = async () => { setBusy('save'); try { await api.patch(`/api/generated/${id}`, { body, title }); toast(approved ? 'Saved — edits require re-approval' : 'Saved', 'success'); reload(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const preview = async () => { setBusy('pv'); try { const { blob } = await api.blob(`/api/generated/${id}/export?format=pdf&preview=1`); setPv(URL.createObjectURL(blob)); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const exp = async (format: string) => { setBusy(format); try { const { blob, name } = await api.blob(`/api/generated/${id}/export?format=${format}`); downloadBlob(blob, decodeURIComponent(name)); reload(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const finalise = async () => {
    if (!(await confirm({ title: 'Finalise this document?', body: 'It will be saved, approved by you, and filed as a final PDF in Documents. The DRAFT mark disappears and Word/PDF downloads become available.', confirm: 'Finalise' }))) return;
    setBusy('final');
    try {
      if (dirty) await api.patch(`/api/generated/${id}`, { body, title });
      const r = await api.post('/api/approvals', { entity_type: 'generated_document', entity_id: id, approvers: [me.id], summary: `Finalised by ${personName(me)}` });
      await api.patch(`/api/approvals/${r.approval.id}`, { status: 'approved', note: 'Finalised' });
      toast('Final — download it as Word or PDF. A final copy is also in Documents.', 'success'); reload(); setPvKey(k => k + 1);
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const remove = async () => { if (!(await confirm({ title: 'Delete this draft?', confirm: 'Delete', danger: true }))) return; try { await api.del(`/api/generated/${id}`); leave(router, '/drafting'); } catch (e: any) { toast(e.message, 'error'); } };
  const print = () => { const w = window.open('', '_blank'); if (!w) return; w.document.write(`<!doctype html><title>${title.replace(/</g, '&lt;')}</title><style>body{font:12pt/1.6 Georgia,serif;max-width:720px;margin:40px auto;white-space:pre-wrap;color:#111}${approved ? '' : '.wm{position:fixed;inset:0;display:grid;place-items:center;font:700 54px sans-serif;color:rgba(200,30,30,.15);transform:rotate(-30deg);pointer-events:none}'}</style>${approved ? '' : '<div class="wm">DRAFT — NOT APPROVED</div>'}<body>${body.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</body>`); w.document.close(); w.focus(); w.print(); };
  return <>
    <PageHead back={{ href: '/drafting', label: 'Drafting' }} eyebrow={<>{g.project && <><Link className="link" href={`/projects/${g.project.id}`}>{g.project.name}</Link></>}</>} title={g.title}
      sub={<span className="row wrap" style={{ gap: 8 }}><StatusBadge value={g.status} /><span className="muted small">{label(g.doc_type)} · v{g.version} · {g.engine === 'template+ai' ? `Template + ${g.provider}` : 'Template'} · {date(g.created_at, true)}</span></span>}
      actions={<>{can.write && !locked && <Button variant={dirty ? 'primary' : undefined} icon={<Save size={15} />} loading={busy === 'save'} disabled={!dirty} onClick={save}>Save</Button>}
        {approved ? <><Button variant="success" icon={<Download size={15} />} loading={busy === 'docx'} onClick={() => exp('docx')}>Word</Button><Button variant="success" icon={<Download size={15} />} loading={busy === 'pdf'} onClick={() => exp('pdf')}>PDF</Button><Button icon={<Download size={15} />} loading={busy === 'txt'} onClick={() => exp('txt')}>Text</Button></>
          : <><Button icon={<Lock size={15} />} disabled title="Approval required before export">Export</Button>{['admin', 'director'].includes(me.role) && !locked && <Button variant="primary" icon={<CheckCircle2 size={15} />} loading={busy === 'final'} onClick={finalise}>Finalise</Button>}{!dirty && !['admin', 'director'].includes(me.role) && <RequestApproval type="generated_document" id={g.id} status={g.status} onDone={reload} />}</>}
        {can.write && !approved && !locked && <Button variant="ghost" icon={<Trash2 size={15} />} onClick={remove} title="Delete" />}</>} />
    {data.approvals?.length > 0 && <div className="mb16"><ApprovalTrail approvals={data.approvals} /></div>}
    <div className="grid g-main"><SplitHandle id="draft-side" edge="last" cssVar="--split-side" min={260} max={640} minOther={520} />
      <div className="stack">
        {locked && <Notice tone="info">Awaiting approval — editing is locked until the approver decides (or the request is cancelled in Approvals).</Notice>}
        {dirty && approved && <Notice tone="warn">Saving changes to an approved document returns it to draft. It must be approved again before export.</Notice>}
        <div className="studio-out-h"><input className="input title-input" value={title} onChange={e => setTitle(e.target.value)} disabled={locked || !can.write} aria-label="Title" />
          <div className="seg-tabs sm">{([['page', 'Letterhead'], ['text', 'Edit text']] as const).map(([v, l]) => <button key={v} className={view === v ? 'on' : ''} onClick={() => { setView(v); if (v === 'page') setPvKey(k => k + 1); }}>{l}</button>)}</div></div>
        <div className="gen-doc">{view === 'page' ? <LetterheadPreview title={title} body={body || g.body} auto={pvKey} /> : <textarea className="doc-editor" value={body} onChange={e => setBody(e.target.value)} disabled={locked || !can.write} spellCheck />}</div>
      </div>
      <div className="stack">
        {can.write && <div className="draft-chat">
          <div className="draft-chat-h"><Sparkles size={15} /><b>Talk to this document</b><ProviderSelect value={provider} onChange={setProvider} auto builtin="Built-in writer" compact className="select sm" /></div>
          {locked ? <div className="lh-empty">Locked while it is awaiting approval.</div> : <WriteChat doc={body} onDoc={c => { setBody(c); setPvKey(k => k + 1); }} context="drafting"
            settings={{ project_id: g.project?.id || g.project_id || null, deal_id: g.deal_id || null, recipient: g.inputs?.recipient || null, sender_id: g.inputs?.sender_id || null, provider, kind: LEGAL_TYPES.includes(g.doc_type) ? 'legal' : ['letter', 'correspondence', 'offer'].includes(g.doc_type) ? 'letter' : g.doc_type === 'proposal' ? 'proposal' : g.doc_type === 'report' ? 'report' : 'legal' }}
            intro={<><b>Ask for any change, step by step.</b><p>For example: "make the exclusivity 60 days and mutual", "add a clause that each party pays its own legal costs", "remove clause 7", "make it more protective of us". The document on the left updates — press Save to keep it.</p></>} />}
        </div>}
        {missing.length > 0 && <Card title={<><AlertTriangle size={15} color="var(--amber)" /> Incomplete fields</>}><p className="small muted mb12">These were not supplied and appear as <b>[● field]</b> in the text. Complete them before requesting approval.</p><div className="chips">{missing.map(m => <span key={m} className="chip">{label(m)}</span>)}</div></Card>}
        <Card title="Clauses used" flush>{clauses.length === 0 ? <p className="small muted" style={{ padding: 16 }}>No clause blocks in this template.</p> : <div className="list">{clauses.map((c, i) => <div key={i} className="list-item"><div className="main-col"><div className="title">{label(c.topic)}</div><div className="meta">{c.id ? c.name : 'Starter wording — no approved approved clause yet'}</div></div><AuthorityBadge value={c.authority} /></div>)}</div>}</Card>
        <Card title="Source"><KV items={[['Template', g.template ? `${g.template.name} (v${g.template.version})` : '—'], ['Template status', g.inputs?.template_status ? <StatusBadge value={g.inputs.template_status} /> : null], ['Created by', g.author?.full_name], ['Engine', g.engine]]} /></Card>
        <Notice>Generated documents must be reviewed by your team and, where appropriate, its solicitors before use.</Notice>
      </div>
    </div>
    {pv && <Modal open onClose={() => { URL.revokeObjectURL(pv); setPv(null); }} title="Preview with letterhead" size="xl"><iframe src={pv} title="Preview" style={{ width: '100%', height: 'calc(72 * var(--vh, 1vh))', border: 0, borderRadius: 8 }} /><div className="tiny muted mt8">Exports to Word and PDF use this letterhead: your logo and business name in the header, company details (legal name, ABN, address) in the footer, and page numbers. The DRAFT mark disappears once approved.</div></Modal>}
</>;
}
