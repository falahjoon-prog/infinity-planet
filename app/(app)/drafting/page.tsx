'use client';
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileSignature, Plus, Pencil, LayoutTemplate, Wand2 } from 'lucide-react';
import { api, useApi, apiFetch } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { ProjectSelect, ProviderSelect } from '@/components/pickers';
import { RequestApproval } from '@/components/workflow';
import { PageHead, Loading, ErrorNote, Empty, StatusBadge, Button, Tabs, Modal, Field, useToast, Notice } from '@/components/ui';
import { TemplateFromDocument, LearnTemplate } from '@/components/template-learn';
import { RecipientFields, SenderSelect, ProjectReadiness, Recipient } from '@/components/doc-studio';
import { ago, label } from '@/lib/client/format';

const FIELD_LABEL: Record<string, string> = { rhc_entity: 'Our legal entity', rhc_abn: 'Our ABN', counterparty: 'Counterparty', counterparty_abn: 'Counterparty ABN', counterparty_address: 'Counterparty address', project_name: 'Project name', project_location: 'Project location', project_description: 'Project description', purpose: 'Purpose', key_terms: 'Key terms (one per line)', exclusivity_days: 'Exclusivity (days)', sunset_date: 'Formal documents by (date)', governing_law: 'Governing law', signatory_name: 'RHC signatory', signatory_title: 'Signatory title', transaction: 'Transaction', consideration: 'Consideration / price', deposit: 'Deposit', conditions: 'Conditions (one per line)', recipient_name: 'Recipient name', offer_amount: 'Offer amount', settlement_days: 'Settlement (days)', validity_days: 'Offer valid for (days)', proposal: 'Proposal', benefits: 'Benefits to the recipient', commercials: 'Commercial terms', next_steps: 'Next steps', subject: 'Subject', body_points: 'Letter body', scope: 'Scope of services', fee: 'Fee', payment_terms: 'Payment terms', term: 'Term' };
const LONG = ['key_terms', 'conditions', 'proposal', 'benefits', 'commercials', 'next_steps', 'body_points', 'scope', 'transaction', 'project_description', 'payment_terms'];

export default function Page() { return <Suspense fallback={<Loading />}><Drafting /></Suspense>; }

function Drafting() {
  const sp = useSearchParams(); const router = useRouter(); const { can } = useApp();
  const [tab, setTab] = useState<'documents' | 'templates'>(sp.get('tab') === 'templates' ? 'templates' : 'documents');
  const [wizard, setWizard] = useState(sp.get('new') === '1');
  const { data, error, loading, reload } = useApi<any>('/api/generated');
  return <>
    <PageHead eyebrow="Knowledge & Legal" title="Drafting" sub="Generate MOUs, Heads of Agreement, offers, letters, contracts and proposals from your templates and approved clauses. Review is required before export."
      actions={can.write && <Button variant="primary" icon={<FileSignature size={15} />} onClick={() => setWizard(true)}>New document</Button>} />
    <Tabs value={tab} onChange={setTab} tabs={[{ value: 'documents', label: 'Generated documents', count: data?.generated?.length }, { value: 'templates', label: 'Templates' }]} />
    {tab === 'documents' && <>{error && <ErrorNote error={error} onRetry={reload} />}
      {loading ? <Loading /> : !data?.generated?.length ? <div className="card"><Empty icon={<FileSignature size={20} />} title="No documents yet" action={can.write && <Button variant="primary" onClick={() => setWizard(true)}>Draft the first document</Button>} /></div>
        : <div className="card table-wrap"><table className="table"><thead><tr><th>Document</th><th>Type</th><th>Status</th><th className="hide-sm">Project</th><th className="hide-sm">Updated</th></tr></thead><tbody>{data.generated.map((g: any) => <tr key={g.id} className="clickable" onClick={() => router.push(`/drafting/${g.id}`)}><td><b>{g.title}</b><div className="tiny muted">{g.engine === 'template+ai' ? `Template + ${g.provider}` : 'Template'}{g.author?.full_name ? ` · ${g.author.full_name}` : ''}</div></td><td>{label(g.doc_type)}</td><td><StatusBadge value={g.status} /></td><td className="hide-sm small">{g.project?.name || '—'}</td><td className="hide-sm small muted">{ago(g.updated_at)}</td></tr>)}</tbody></table></div>}</>}
    {tab === 'templates' && <Templates />}
    <Wizard open={wizard} onClose={() => setWizard(false)} initialProject={sp.get('project')} initialDeal={sp.get('deal')} onDone={id => router.push(`/drafting/${id}`)} />
  </>;
}

function Wizard({ open, onClose, initialProject, initialDeal, onDone }: { open: boolean; onClose: () => void; initialProject: string | null; initialDeal: string | null; onDone: (id: string) => void }) {
  const toast = useToast();
  const { data } = useApi<any>(open ? '/api/templates?kind=document' : null, [open]);
  const { data: deals } = useApi<any>(open ? '/api/deals' : null, [open]);
  const [tpl, setTpl] = useState<any>(null);
  const [project, setProject] = useState<string | null>(initialProject);
  const [deal, setDeal] = useState<string | null>(initialDeal);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const { me } = useApp();
  const [provider, setProvider] = useState('auto'); const [instructions, setInstructions] = useState('');
  const [to, setTo] = useState<Recipient>({}); const [from, setFrom] = useState<string | null>(me.id); const [length, setLength] = useState<'brief' | 'standard' | 'comprehensive'>('standard');
  const today = () => new Date(Date.now() + 10 * 3600_000).toISOString().slice(0, 10);
  const [docDate, setDocDate] = useState<string>(today);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTpl(null); setInputs({}); setTo({}); setDocDate(today()); setProject(initialProject); setDeal(initialDeal); } }, [open, initialProject, initialDeal]);
  const PARTY_FIELDS = ['recipient_name', 'counterparty', 'counterparty_abn', 'counterparty_address', 'signatory_name', 'signatory_title', 'rhc_entity', 'rhc_abn'];
  const fields: string[] = useMemo(() => (tpl?.metadata?.fields || (tpl?.body.match(/\{\{([a-z_]+)\}\}/g) || []).map((x: string) => x.slice(2, -2))).filter((f: string, i: number, a: string[]) => a.indexOf(f) === i && !['date', 'short', 'business', 'business_tag'].includes(f)), [tpl]);
  const go = async () => {
    setBusy(true);
    try { const r = await api.post('/api/generate', { template_id: tpl.id, project_id: project, deal_id: deal, inputs, provider, instructions, recipient: to, sender_id: from, length, doc_date: docDate }); if (r.ai_error) toast(r.ai_error, 'error'); else if (r.warning) toast(r.warning, 'info'); onClose(); onDone(r.generated.id); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title={tpl ? tpl.name : 'Choose a template'} size="wide" footer={tpl && <><Button onClick={() => setTpl(null)}>Back</Button><Button variant="primary" loading={busy} onClick={go}>{busy ? (provider === 'none' ? 'Filling in…' : 'Writing — up to 2 minutes…') : 'Write the document'}</Button></>}>
    {!tpl ? (!data ? <Loading /> : <div className="grid g3">{data.templates.map((t: any) => <button key={t.id} className="template-card" onClick={() => setTpl(t)}><div className="tc-top"><small>{label(t.category)}</small><StatusBadge value={t.status} /></div><div className="tc-body"><b>{t.name}</b><p>{t.description}</p></div></button>)}</div>)
      : <div className="stack" style={{ gap: 12 }}>
        {tpl.status !== 'approved' && <Notice tone="warn">This is a <b>starter template</b> ({label(tpl.status)}), not yet approved. The generated draft is clearly marked and must be approved before export. Approve the template itself in Drafting → Templates.</Notice>}
        <div className="form-grid">
          <Field label="Project" hint="Fills project name, location and description"><ProjectSelect value={project} onChange={setProject} /></Field>
          <Field label="Deal" hint="Fills counterparty, contact and value"><select className="select" value={deal || ''} onChange={e => setDeal(e.target.value || null)}><option value="">No deal</option>{(deals?.deals || []).filter((d: any) => !project || d.project_id === project).map((d: any) => <option key={d.id} value={d.id}>{d.title || d.counterparty}</option>)}</select></Field>
        </div>
        <div className="draft-parties">
          <div className="dp-col"><h4>To — the other party</h4><RecipientFields value={to} onChange={setTo} projectId={project} withAbn /></div>
          <div className="dp-col"><h4>From — signing for us</h4><SenderSelect value={from} onChange={setFrom} /><p className="tiny muted">Our legal name, ABN and address come from Settings → Business details.</p>
            <h4 className="mt12">Length</h4><div className="pick-chips">{([['brief', 'Short form'], ['standard', 'Full'], ['comprehensive', 'Comprehensive']] as const).map(([v, l]) => <button key={v} className={length === v ? 'on' : ''} onClick={() => setLength(v)}>{l}</button>)}</div>
            <h4 className="mt12">Document date</h4><input className="input" type="date" value={docDate} onChange={e => setDocDate(e.target.value || today())} /><p className="tiny muted">Printed wherever the document is dated. Today unless you change it.</p>
            <h4 className="mt12">Project information</h4><ProjectReadiness projectId={project} /></div>
        </div>
        <div className="form-grid">
          {fields.filter(f => !PARTY_FIELDS.includes(f)).map(f => <Field key={f} label={FIELD_LABEL[f] || label(f)} className={LONG.includes(f) ? 'full' : ''} hint={['rhc_entity', 'rhc_abn', 'signatory_name', 'signatory_title', 'governing_law', 'project_name', 'project_location', 'counterparty', 'recipient_name', 'offer_amount', 'consideration'].includes(f) ? 'Leave blank to use Business settings / project / deal data' : undefined}>
            {LONG.includes(f) ? <textarea className="textarea" value={inputs[f] || ''} onChange={e => setInputs({ ...inputs, [f]: e.target.value })} /> : <input className="input" value={inputs[f] || ''} onChange={e => setInputs({ ...inputs, [f]: e.target.value })} />}
          </Field>)}
          <Field label="Writer" className="full" hint="The AI drafts the complete document from the template, your approved clauses (word for word) and the facts above. It never invents facts — gaps are marked [●]."><ProviderSelect value={provider} onChange={setProvider} auto builtin="Template and clause library only (no AI)" /></Field>
          {provider !== 'none' && <Field label="Instructions for the AI" className="full"><textarea className="textarea" value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="e.g. 90-day exclusivity, mutual; deposit 10% held in trust; we are the buyer; include a sunset date of 30 June." /></Field>}
        </div>
      </div>}
  </Modal>;
}

function Templates() {
  const { can } = useApp(); const toast = useToast();
  const [fromDoc, setFromDoc] = useState(false); const [learn, setLearn] = useState<any>(null);
  const { data, loading, error, reload } = useApi<any>('/api/templates');
  const [editing, setEditing] = useState<any>(null);
  const [tplPv, setTplPv] = useState<string | null>(null);
  const previewTpl = async () => { try { const r = await apiFetch('/api/templates/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: editing.name, body: editing.body }) }); if (!r.ok) throw new Error('Preview failed'); setTplPv(URL.createObjectURL(await r.blob())); } catch (e: any) { toast(e.message, 'error'); } };
  const save = async () => { try { if (editing.id) await api.patch(`/api/templates/${editing.id}`, { name: editing.name, description: editing.description, body: editing.body }); else await api.post('/api/templates', editing); toast('Template saved — approval required before it is treated as approved', 'success'); setEditing(null); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  return <>
    <div className="filters"><Notice icon={<LayoutTemplate size={16} />}>Templates use <code>{'{{field}}'}</code> placeholders and <code>{'{{clause:topic|starter text}}'}</code> blocks that insert approved clause wording. Build templates from your own documents (incl. Google Drive) with <b>From a document</b>, or make a template follow your documents with <b>Update from documents</b>. Editing a template creates a new version that must be approved again.</Notice></div>
    {can.write && <div className="row mb12"><span className="spacer" /><Button icon={<Wand2 size={15} />} onClick={() => setFromDoc(true)}>From a document</Button><Button icon={<Plus size={15} />} onClick={() => setEditing({ name: '', category: 'letter', kind: 'document', description: '', body: '' })}>New template</Button></div>}
    {error && <ErrorNote error={error} onRetry={reload} />}
    {loading ? <Loading /> : <div className="card table-wrap"><table className="table"><thead><tr><th>Template</th><th>Kind</th><th>Status</th><th>Version</th><th /></tr></thead><tbody>{(data?.templates || []).map((t: any) => <tr key={t.id}><td><b>{t.name}</b><div className="tiny muted">{t.description}{t.system_seed ? ' · Starter' : ''}{t.approver?.full_name ? ` · approved by ${t.approver.full_name}` : ''}</div></td><td>{label(t.kind)}</td><td><StatusBadge value={t.status} /></td><td>v{t.version}</td><td><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>{can.write && <Button size="xs" icon={<Pencil size={12} />} onClick={() => setEditing(t)}>Edit</Button>}{can.write && t.kind === 'document' && <Button size="xs" icon={<Wand2 size={12} />} onClick={() => setLearn(t)}>Update from documents</Button>}{t.status !== 'approved' && <RequestApproval type="template" id={t.id} status={t.status} size="xs" onDone={reload} />}</div></td></tr>)}</tbody></table></div>}
    <TemplateFromDocument open={fromDoc} onClose={() => setFromDoc(false)} onDone={reload} />
    <LearnTemplate template={learn} onClose={() => setLearn(null)} onDone={reload} />
    <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit template' : 'New template'} size="xl" footer={<><Button variant="ghost" onClick={previewTpl}>Preview with letterhead</Button><span className="spacer" /><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      {editing && <div className="form-grid"><Field label="Name"><input className="input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></Field>
        {!editing.id ? <Field label="Kind"><select className="select" value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value })}><option value="document">Document</option><option value="marketing">Marketing</option></select></Field> : <Field label="Category"><input className="input" value={editing.category} disabled /></Field>}
        <Field label="Description" className="full"><input className="input" value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} /></Field>
        <Field label="Body" className="full" hint="Documents made from this template get your letterhead automatically when exported to Word or PDF: logo and business name in the header, legal name, ABN, address and contact details in the footer, plus page numbers (Settings → Business details)."><textarea className="doc-editor" style={{ minHeight: 420 }} value={editing.body} onChange={e => setEditing({ ...editing, body: e.target.value })} /></Field></div>}
    </Modal>
    {tplPv && <Modal open onClose={() => { URL.revokeObjectURL(tplPv); setTplPv(null); }} title="Template with letterhead (sample)" size="xl"><iframe src={tplPv} title="Preview" style={{ width: '100%', height: 'calc(72 * var(--vh, 1vh))', border: 0, borderRadius: 8 }} /></Modal>}
  </>;
}
