'use client';
import React, { useEffect, useState } from 'react';
import { Search, FileText, Wand2 } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { Modal, Button, Field, Empty, Notice, useToast } from './ui';
import { ProviderSelect } from './pickers';

function DocPicker({ multi, selected, onChange }: { multi?: boolean; selected: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const { data } = useApi<any>('/api/documents?limit=500&status=indexed');
  const docs = (data?.documents || []).filter((d: any) => !q || d.name.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  return <div className="stack" style={{ gap: 8 }}>
    <div className="search-input"><Search size={15} /><input className="input" placeholder="Search your documents (uploads and Google Drive)" value={q} onChange={e => setQ(e.target.value)} autoFocus /></div>
    <div className="list card" style={{ maxHeight: 300, overflowY: 'auto' }}>
      {docs.length === 0 && <Empty title="No readable documents">Sync your Google Drive (Documents → Google Drive → Add link) or upload an example.</Empty>}
      {docs.map((d: any) => <label key={d.id} className="list-item clickable"><input type={multi ? 'checkbox' : 'radio'} name="docpick" checked={selected.includes(d.id)} onChange={() => onChange(multi ? (selected.includes(d.id) ? selected.filter(x => x !== d.id) : [...selected, d.id].slice(0, 5)) : [d.id])} /><FileText size={15} className="muted" /><div className="main-col"><div className="title">{d.name}</div><div className="meta">{d.source === 'google_drive' ? 'Google Drive' : 'Uploaded'}{d.project?.name ? ` · ${d.project.name}` : ''}</div></div></label>)}
    </div>
  </div>;
}

/** New template from one of the business's documents (e.g. an RHC MOU from Google Drive). */
export function TemplateFromDocument({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [sel, setSel] = useState<string[]>([]); const [name, setName] = useState(''); const [provider, setProvider] = useState('none'); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setSel([]); setName(''); } }, [open]);
  const go = async () => {
    setBusy(true);
    try { const r = await api.post('/api/templates/from-document', { document_id: sel[0], name: name || undefined, provider: provider === 'none' ? null : provider }); toast(`Template created with ${r.placeholders.length} placeholders${r.ai_error ? ` (AI failed: ${r.ai_error} — built-in engine used)` : ''}. Review it, then request approval.`, r.ai_error ? 'error' : 'success'); onDone(); onClose(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title="New template from your document" size="wide" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Wand2 size={14} />} loading={busy} disabled={!sel.length} onClick={go}>Create template</Button></>}>
    <div className="stack" style={{ gap: 12 }}>
      <DocPicker selected={sel} onChange={setSel} />
      <div className="form-grid"><Field label="Template name (optional)"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. RHC standard MOU" /></Field>
        <Field label="Engine"><ProviderSelect value={provider} onChange={setProvider} builtin="Built-in engine (no AI key)" /></Field></div>
      <Notice>Your business name, ABN and address and the other party&apos;s name become placeholders such as {'{{rhc_entity}}'} and {'{{counterparty}}'}. With an AI provider every deal-specific fact is replaced and your wording is kept. The template is saved as a draft and must be approved before use.</Notice>
    </div>
  </Modal>;
}

/** Update an existing template so it follows the business's own documents. */
export function LearnTemplate({ template, onClose, onDone }: { template: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [sel, setSel] = useState<string[]>([]); const [provider, setProvider] = useState('none'); const [busy, setBusy] = useState(false);
  useEffect(() => { setSel([]); }, [template]);
  const go = async () => {
    setBusy(true);
    try { const r = await api.post(`/api/templates/${template.id}/learn`, { document_ids: sel, provider: provider === 'none' ? null : provider }); toast(`“${template.name}” updated to version ${r.template.version} from ${r.learned_from.join(', ')} — approval required`, 'success'); onDone(); onClose(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <Modal open={!!template} onClose={onClose} title={`Update “${template?.name || ''}” from your documents`} size="wide" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Wand2 size={14} />} loading={busy} disabled={!sel.length} onClick={go}>Update template</Button></>}>
    <div className="stack" style={{ gap: 12 }}>
      <DocPicker multi selected={sel} onChange={setSel} />
      <Field label="Engine"><ProviderSelect value={provider} onChange={setProvider} builtin="Built-in engine (adopts the first document's wording)" /></Field>
      <Notice>With an AI provider, the template is rewritten to follow the structure, headings and standard wording of the documents you pick (up to 5), keeping placeholders and approved-clause blocks. Without one, it adopts the first document&apos;s wording with placeholders inserted. A new draft version is saved — the previous wording is kept in its history — and it needs approval.</Notice>
    </div>
  </Modal>;
}
