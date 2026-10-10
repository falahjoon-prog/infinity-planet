'use client';
/**
 * Finance: overview, money in (investors and other income), money out (expenses), invoices received
 * (uploaded or found in email attachments, read and sorted automatically), and weekly payroll.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, FileText, Mail, Plus, Printer, Search, Settings2, Trash2, Upload, Users, AlertTriangle, Wallet } from 'lucide-react';
import { api, apiFetch, useApi } from '@/lib/client/api';
import { useOpenWindow } from '@/lib/client/nav-history';
import { useApp } from '@/components/app-context';
import { ProjectSelect } from '@/components/pickers';
import { Button, Card, Drawer, Empty, ErrorNote, Field, Loading, Modal, Notice, PageHead, useConfirm, useToast } from '@/components/ui';
import { date as fmtDate } from '@/lib/client/format';
import { calcPay, CATEGORY_LABEL, EXPENSE_CATEGORIES, INCOME_CATEGORIES, SUPER_RATE, TAX_SCALES, type PaySetting } from '@/lib/payroll';

// ------------------------------------------------------------------ helpers
export const aud = (cents: number | null | undefined, compact = false) => {
  const v = Number(cents || 0) / 100;
  if (compact && Math.abs(v) >= 10000) return v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', notation: 'compact', maximumFractionDigits: 1 });
  return v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
};
const toCents = (s: string) => { const v = parseFloat(String(s).replace(/[$,\s]/g, '')); return Number.isFinite(v) ? Math.round(v * 100) : 0; };
const dollars = (c: any) => (c === null || c === undefined || c === '' ? '' : (Number(c) / 100).toFixed(2));
const cat = (c: string) => CATEGORY_LABEL[c] || c;
const today = () => new Date(Date.now() + 10 * 3600e3).toISOString().slice(0, 10);
const STATUS_LABEL: Record<string, string> = { unpaid: 'To pay', paid: 'Paid', received: 'Received', expected: 'Expected', draft: 'Draft', cancelled: 'Cancelled' };
function Status({ e }: { e: any }) {
  const overdue = e.kind === 'expense' && e.status === 'unpaid' && e.due_date && e.due_date < today();
  const tone = overdue ? 'red' : e.status === 'paid' || e.status === 'received' ? 'green' : e.status === 'expected' ? 'blue' : e.status === 'unpaid' ? 'amber' : 'gray';
  return <span className={`badge ${tone}`}>{overdue ? 'Overdue' : STATUS_LABEL[e.status] || e.status}</span>;
}

// ------------------------------------------------------------------ overview
export function FinanceOverview() {
  const { data, error, loading, reload } = useApi<any>('/api/finance/summary');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  const d = data; const max = Math.max(1, ...d.months.map((m: any) => Math.max(m.income, m.expense)));
  const fyLabel = `1 Jul ${d.fy} – 30 Jun ${d.fy + 1}`;
  return <>
    <PageHead title="Finance" sub={`Financial year ${fyLabel}`} />
    {d.review > 0 && <div className="mb12"><Notice tone="warn" icon={<AlertTriangle size={16} />}><b>{d.review} invoice{d.review === 1 ? '' : 's'} to check</b> — read automatically from email or uploads. Open <a className="link" href="/finance/invoices">Invoices</a> and confirm the amounts.</Notice></div>}
    <div className="kpis fin-kpis">
      <div className="kpi"><div className="label"><ArrowDownLeft size={14} /> Money in</div><div className="value fin-in">{aud(d.income, true)}</div><div className="hint">{d.expected ? `${aud(d.expected, true)} expected` : 'received this year'}</div></div>
      <div className="kpi"><div className="label"><ArrowUpRight size={14} /> Money out</div><div className="value">{aud(d.expense, true)}</div><div className="hint">{aud(d.paid, true)} paid</div></div>
      <div className="kpi"><div className="label"><Wallet size={14} /> Net</div><div className={`value ${d.income - d.expense < 0 ? 'fin-neg' : 'fin-in'}`}>{aud(d.income - d.expense, true)}</div><div className="hint">in minus out</div></div>
      <div className={`kpi ${d.overdue ? 'alert' : d.unpaid ? 'warn' : ''}`}><div className="label"><FileText size={14} /> Bills to pay</div><div className="value">{aud(d.unpaid, true)}</div><div className="hint">{d.overdue ? `${aud(d.overdue, true)} overdue` : 'nothing overdue'}</div></div>
      <div className="kpi"><div className="label"><Users size={14} /> Payroll</div><div className="value">{aud(d.payroll.gross, true)}</div><div className="hint">{d.payroll.runs} pay run{d.payroll.runs === 1 ? '' : 's'} · super {aud(d.payroll.super, true)}</div></div>
    </div>
    <div className="grid g-main mt16">
      <Card title="Month by month" sub="Money in and out this financial year">
        <div className="fin-bars" role="img" aria-label="Money in and out by month">
          {d.months.map((m: any) => <div key={m.month} className="fin-bar" title={`${m.month}: in ${aud(m.income)} · out ${aud(m.expense)}`}>
            <div className="fin-bar-pair"><i className="in" style={{ height: `${(m.income / max) * 100}%` }} /><i className="out" style={{ height: `${(m.expense / max) * 100}%` }} /></div>
            <span>{new Date(`${m.month}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'short' })}</span></div>)}
        </div>
        <div className="fin-legend"><span><i className="in" /> Money in</span><span><i className="out" /> Money out</span></div>
      </Card>
      <Card title="Bills to pay" flush actions={<a className="link small" href="/finance/invoices">All invoices</a>}>
        {!d.bills.length ? <Empty title="Nothing to pay" /> : <div className="list">{d.bills.map((b: any) => <a key={b.id} className="list-item" href={`/finance/invoices?open=${b.id}`}><div className="main-col"><div className="title">{b.party_name || b.description || 'Bill'}</div><div className="meta">{cat(b.category)}{b.due_date ? ` · due ${fmtDate(b.due_date)}` : ''}</div></div><b className={b.due_date && b.due_date < today() ? 'fin-neg' : ''}>{aud(b.total_cents)}</b></a>)}</div>}
      </Card>
    </div>
    <div className="grid g2 mt16">
      <Card title="Where money came from">{!d.income_by_category.length ? <p className="muted small">Nothing yet.</p> : <CatBars rows={d.income_by_category} tone="in" />}</Card>
      <Card title="Where money went">{!d.expense_by_category.length ? <p className="muted small">Nothing yet.</p> : <CatBars rows={d.expense_by_category} tone="out" />}</Card>
    </div>
  </>;
}
function CatBars({ rows, tone }: { rows: { category: string; cents: number }[]; tone: 'in' | 'out' }) {
  const max = Math.max(1, ...rows.map(r => r.cents));
  return <div className="fin-cats">{rows.map(r => <div key={r.category} className="fin-cat"><span>{cat(r.category)}</span><div><i className={tone} style={{ width: `${(r.cents / max) * 100}%` }} /></div><b>{aud(r.cents)}</b></div>)}</div>;
}

// ------------------------------------------------------------------ income / expenses / invoices lists
export function FinanceList({ mode }: { mode: 'income' | 'expenses' | 'invoices' }) {
  const toast = useToast(); const win = useOpenWindow();
  const [q, setQ] = useState(''); const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [category, setCategory] = useState('');
  const [adding, setAdding] = useState(false); const [busy, setBusy] = useState<string | null>(null); const [days, setDays] = useState('90');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const kind = mode === 'income' ? 'income' : 'expense';
  const qs = new URLSearchParams({ kind, ...(mode === 'invoices' ? { invoices: '1' } : {}), ...(search ? { q: search } : {}), ...(status === 'review' ? { review: '1' } : status ? { status } : {}), ...(category ? { category } : {}) }).toString();
  const { data, error, loading, reload } = useApi<any>(`/api/finance/entries?${qs}`, [qs]);
  const parties = useApi<any>(mode === 'income' ? '/api/finance/parties?kind=investor' : null);
  const entries: any[] = data?.entries || [];
  const total = entries.filter(e => e.status !== 'cancelled').reduce((s, e) => s + Number(e.total_cents || 0), 0);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return; setBusy('upload');
    try { const fd = new FormData(); Array.from(files).forEach(f => fd.append('file', f)); fd.append('kind', kind); const r = await apiFetch('/api/finance/upload', { method: 'POST', body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Upload failed'); toast(`${j.entries.length} file${j.entries.length === 1 ? '' : 's'} read — check the amounts`, 'success'); reload(); if (j.entries.length === 1) win.open(j.entries[0].id); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };
  const scan = async () => {
    setBusy('scan');
    try { const r = await api.post('/api/finance/inbox', { days: Number(days) }); toast(r.added ? `${r.added} new invoice${r.added === 1 ? '' : 's'} found in ${r.emails} email${r.emails === 1 ? '' : 's'}` : `No new invoices (${r.emails} email${r.emails === 1 ? '' : 's'} checked${r.skipped ? `, ${r.skipped} already here or not invoices` : ''})`, r.added ? 'success' : 'info'); reload(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const cats = mode === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const title = mode === 'income' ? 'Money in' : mode === 'expenses' ? 'Expenses' : 'Invoices received';
  return <>
    <PageHead title={title} actions={<>
      {mode !== 'income' && <><input ref={fileRef} type="file" hidden multiple accept=".pdf,.docx,image/*" onChange={e => upload(e.target.files)} /><Button icon={<Upload size={15} />} loading={busy === 'upload'} onClick={() => fileRef.current?.click()}>Upload invoice</Button></>}
      <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>{mode === 'income' ? 'Add money in' : mode === 'invoices' ? 'Add invoice' : 'Add expense'}</Button></>} />
    {mode === 'invoices' && <div className="card fin-scan">
      <Mail size={18} /><div className="fin-scan-text"><b>Invoices from email</b><span className="small muted">Looks through your mailbox for emails with an invoice, bill or receipt attached, reads each one, sorts it into a category and files it here to check.</span></div>
      <select className="select sm" value={days} onChange={e => setDays(e.target.value)} aria-label="How far back"><option value="30">Last 30 days</option><option value="90">Last 3 months</option><option value="180">Last 6 months</option><option value="365">Last 12 months</option></select>
      <Button variant="primary" loading={busy === 'scan'} onClick={scan}>Find invoices in email</Button>
    </div>}
    {mode === 'income' && parties.data?.parties?.length > 0 && <div className="fin-investors">{parties.data.parties.map((p: any) => <div key={p.id} className="fin-investor"><b>{p.name}</b><span>{aud(p.received_cents)}</span><small>{p.entries} payment{p.entries === 1 ? '' : 's'}</small></div>)}</div>}
    <div className="filters">
      <div className="search-input" style={{ flex: '1 1 240px' }}><Search size={15} /><input className="input" placeholder={mode === 'income' ? 'Search investor, reference…' : 'Search supplier, invoice number…'} value={q} onChange={e => setQ(e.target.value)} /></div>
      <select className="select" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
        <option value="">Any status</option>{mode === 'income' ? <><option value="received">Received</option><option value="expected">Expected</option></> : <><option value="unpaid">To pay</option><option value="paid">Paid</option><option value="review">To check</option></>}<option value="cancelled">Cancelled</option></select>
      <select className="select" value={category} onChange={e => setCategory(e.target.value)} aria-label="Category"><option value="">All categories</option>{cats.map(c => <option key={c} value={c}>{cat(c)}</option>)}</select>
      <span className="fin-total">{entries.length} · <b>{aud(total)}</b></span>
    </div>
    {error && <ErrorNote error={error} onRetry={reload} />}
    {loading && !data ? <Loading /> : !entries.length ? <div className="card"><Empty icon={<Wallet size={20} />} title={mode === 'income' ? 'No money in recorded yet' : mode === 'invoices' ? 'No invoices yet' : 'No expenses yet'}>{mode === 'invoices' ? 'Upload an invoice, or find the ones sent to you by email.' : mode === 'income' ? 'Record investor funds and other income with "Add money in".' : 'Add an expense, or upload an invoice or receipt.'}</Empty></div> :
      <div className="card table-wrap"><table className="table fin-table"><thead><tr><th>Date</th><th>{mode === 'income' ? 'From' : 'Supplier'}</th><th className="hide-sm">Category</th><th className="hide-sm">Reference</th><th className="num">Amount</th><th>Status</th></tr></thead>
        <tbody>{entries.map(e => <tr key={e.id} className="clickable" onClick={() => win.open(e.id)}>
          <td className="nowrap">{fmtDate(e.entry_date)}</td>
          <td><b>{e.party?.name || e.party_name || '—'}</b><div className="tiny muted ellipsis" style={{ maxWidth: 360 }}>{e.description}{e.needs_review && <span className="badge amber fin-check">Check</span>}{e.source === 'email' && <span className="tiny muted"> · from email</span>}</div></td>
          <td className="hide-sm small">{cat(e.category)}</td><td className="hide-sm small">{e.reference || '—'}</td>
          <td className="num nowrap"><b>{aud(e.total_cents)}</b>{e.gst_cents > 0 && <div className="tiny muted">GST {aud(e.gst_cents)}</div>}</td>
          <td><Status e={e} /></td></tr>)}</tbody></table></div>}
    <EntryForm open={adding} kind={kind} invoice={mode === 'invoices'} onClose={() => setAdding(false)} onSaved={e => { setAdding(false); reload(); if (e?.id) win.open(e.id); }} />
    <EntryDrawer id={win.value} onClose={() => win.close()} onChanged={reload} />
  </>;
}

// ------------------------------------------------------------------ add / edit an entry
function EntryFields({ f, set, kind }: { f: any; set: (p: any) => void; kind: 'income' | 'expense' }) {
  const parties = useApi<any>('/api/finance/parties');
  const cats = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return <div className="form-grid">
    <Field label={kind === 'income' ? 'From (investor or payer)' : 'Supplier / consultant'}><input className="input" list="fin-parties" value={f.party_name || ''} onChange={e => set({ party_name: e.target.value, party_id: null })} placeholder={kind === 'income' ? 'e.g. investor name' : 'e.g. company name'} /><datalist id="fin-parties">{(parties.data?.parties || []).map((p: any) => <option key={p.id} value={p.name} />)}</datalist></Field>
    <Field label="Category"><select className="select" value={f.category} onChange={e => set({ category: e.target.value })}>{cats.map(c => <option key={c} value={c}>{cat(c)}</option>)}</select></Field>
    <Field label="Total (incl. GST)"><input className="input" inputMode="decimal" value={f.total} onChange={e => set({ total: e.target.value })} placeholder="0.00" /></Field>
    <Field label="GST included" hint={kind === 'expense' ? <button type="button" className="link small" onClick={() => set({ gst: (toCents(f.total) / 11 / 100).toFixed(2) })}>Work out 1/11</button> : undefined}><input className="input" inputMode="decimal" value={f.gst} onChange={e => set({ gst: e.target.value })} placeholder="0.00" /></Field>
    <Field label={kind === 'income' ? 'Date received' : 'Invoice date'}><input className="input" type="date" value={f.entry_date || ''} onChange={e => set({ entry_date: e.target.value })} /></Field>
    {kind === 'expense' ? <Field label="Due date"><input className="input" type="date" value={f.due_date || ''} onChange={e => set({ due_date: e.target.value })} /></Field> : <Field label="Status"><select className="select" value={f.status} onChange={e => set({ status: e.target.value })}><option value="received">Received</option><option value="expected">Expected (not yet in the bank)</option><option value="cancelled">Cancelled</option></select></Field>}
    <Field label={kind === 'income' ? 'Reference' : 'Invoice number'}><input className="input" value={f.reference || ''} onChange={e => set({ reference: e.target.value })} /></Field>
    {kind === 'expense' && <Field label="Status"><select className="select" value={f.status} onChange={e => set({ status: e.target.value })}><option value="unpaid">To pay</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select></Field>}
    <Field label="Project"><ProjectSelect value={f.project_id} onChange={v => set({ project_id: v })} /></Field>
    <Field label="Description" className="span2"><input className="input" value={f.description || ''} onChange={e => set({ description: e.target.value })} /></Field>
    <Field label="Notes" className="span2"><textarea className="textarea" rows={2} value={f.notes || ''} onChange={e => set({ notes: e.target.value })} /></Field>
  </div>;
}
const blankForm = (kind: 'income' | 'expense') => ({ party_name: '', category: kind === 'income' ? 'investor_capital' : 'consultancy', total: '', gst: '', entry_date: today(), due_date: '', status: kind === 'income' ? 'received' : 'unpaid', reference: '', project_id: null, description: '', notes: '' });
const toBody = (f: any, kind: string, invoice?: boolean) => ({ kind, party_name: f.party_name || null, party_id: f.party_id || undefined, category: f.category, total_cents: toCents(f.total), gst_cents: toCents(f.gst), amount_cents: toCents(f.total) - toCents(f.gst), entry_date: f.entry_date || today(), due_date: f.due_date || null, status: f.status, reference: f.reference || null, project_id: f.project_id || null, description: f.description || null, notes: f.notes || null, ...(invoice !== undefined ? { is_invoice: invoice } : {}), party_kind: kind === 'income' ? 'investor' : f.category === 'consultancy' ? 'consultant' : 'supplier' });

function EntryForm({ open, kind, invoice, onClose, onSaved }: { open: boolean; kind: 'income' | 'expense'; invoice?: boolean; onClose: () => void; onSaved: (e: any) => void }) {
  const toast = useToast(); const [f, setF] = useState<any>(blankForm(kind)); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(blankForm(kind)); }, [open, kind]);
  const save = async () => { setBusy(true); try { const r = await api.post('/api/finance/entries', toBody(f, kind, kind === 'expense' ? !!invoice : false)); toast('Saved', 'success'); onSaved(r.entry); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  return <Modal open={open} onClose={onClose} size="wide" title={kind === 'income' ? 'Money in' : invoice ? 'Invoice received' : 'Expense'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
    <EntryFields f={f} set={p => setF((x: any) => ({ ...x, ...p }))} kind={kind} />
  </Modal>;
}

function EntryDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast(); const confirm = useConfirm();
  const { data, loading, reload } = useApi<any>(id ? `/api/finance/entries/${id}` : null, [id]);
  const e = data?.entry; const [f, setF] = useState<any>(null); const [busy, setBusy] = useState<string | null>(null); const [fileUrl, setFileUrl] = useState<string | null>(null);
  useEffect(() => { if (!e) { setF(null); return; } setF({ party_name: e.party?.name || e.party_name || '', party_id: e.party_id, category: e.category, total: dollars(e.total_cents), gst: dollars(e.gst_cents), entry_date: e.entry_date, due_date: e.due_date || '', status: e.status, reference: e.reference || '', project_id: e.project_id, description: e.description || '', notes: e.notes || '' }); }, [e]);
  useEffect(() => { let url: string | null = null; setFileUrl(null); if (e?.file_path && /pdf|image/.test(e.file_mime || '')) apiFetch(`/api/finance/entries/${e.id}/file?inline=1`).then(r => r.blob()).then(b => { url = URL.createObjectURL(b); setFileUrl(url); }).catch(() => {}); return () => { if (url) URL.revokeObjectURL(url); }; }, [e?.id, e?.file_path]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = async (extra: any = {}, msg = 'Saved') => { if (!e) return; setBusy(Object.keys(extra)[0] || 'save'); try { const body = { ...toBody(f, e.kind), ...(f.party_id && f.party_name === (e.party?.name || e.party_name) ? { party_id: f.party_id, party_name: undefined } : {}), needs_review: false, ...extra }; await api.patch(`/api/finance/entries/${e.id}`, body); toast(msg, 'success'); reload(); onChanged(); } catch (x: any) { toast(x.message, 'error'); } finally { setBusy(null); } };
  const del = async () => { if (!(await confirm({ title: 'Delete this entry?', body: e?.file_name ? 'The attached file is deleted too.' : undefined, confirm: 'Delete', danger: true }))) return; try { await api.del(`/api/finance/entries/${e.id}`); toast('Deleted', 'success'); onChanged(); onClose(); } catch (x: any) { toast(x.message, 'error'); } };
  const download = async () => { const r = await apiFetch(`/api/finance/entries/${e.id}/file`); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = e.file_name || 'invoice'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  return <Drawer open={!!id} onClose={onClose} className="fin-drawer" title={e ? (e.party?.name || e.party_name || (e.kind === 'income' ? 'Money in' : 'Expense')) : 'Loading…'}
    footer={e && f && <><Button variant="ghost" icon={<Trash2 size={14} />} onClick={del}>Delete</Button><span className="spacer" />
      {e.kind === 'expense' && e.status === 'unpaid' && <Button icon={<CheckCircle2 size={14} />} loading={busy === 'status'} onClick={() => patch({ status: 'paid' }, 'Marked as paid')}>Mark paid</Button>}
      <Button variant="primary" loading={busy === 'save'} onClick={() => patch()}>{e.needs_review ? 'Confirm & save' : 'Save'}</Button></>}>
    {loading && !e ? <Loading /> : !e || !f ? null : <div className="stack">
      {e.needs_review && <Notice tone="warn">Read automatically{e.source === 'email' ? ' from an email' : ' from the file'} — check the supplier, amounts and dates against the invoice, then <b>Confirm & save</b>.{e.extracted?.confidence ? ` (Confidence: ${e.extracted.confidence}.)` : ''}</Notice>}
      {e.source === 'email' && <div className="small muted"><Mail size={12} /> {e.email_from} · “{e.email_subject}”</div>}
      {e.source === 'payroll' && <Notice>Recorded by payroll (finalised pay run).</Notice>}
      <EntryFields f={f} set={p => setF((x: any) => ({ ...x, ...p }))} kind={e.kind} />
      {e.file_name && <div className="fin-file"><div className="row"><FileText size={15} /><b className="ellipsis">{e.file_name}</b><span className="spacer" /><button className="link small" onClick={download}>Download</button></div>
        {fileUrl && (/pdf/.test(e.file_mime) ? <iframe src={fileUrl} title={e.file_name} className="fin-preview" /> : <img src={fileUrl} alt={e.file_name} className="fin-preview" />)}</div>}
    </div>}
  </Drawer>;
}

// ------------------------------------------------------------------ payroll
const DAY = 864e5;
const mondayOf = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); const w = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - w * DAY).toISOString().slice(0, 10); };
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
const weekLabel = (ws: string) => `${new Date(`${ws}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${new Date(`${addDays(ws, 6)}T12:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;

export function Payroll() {
  const toast = useToast(); const confirm = useConfirm(); const { me } = useApp();
  const [week, setWeek] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi<any>(`/api/finance/payroll${week ? `?week=${week}` : ''}`, [week]);
  const [hours, setHours] = useState<Record<string, string>>({}); const [payDate, setPayDate] = useState(''); const [busy, setBusy] = useState<string | null>(null);
  const [slip, setSlip] = useState<any>(null); const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = useApi<any>('/api/finance/pay-settings');
  useEffect(() => { if (!data) return; setHours(Object.fromEntries(data.lines.map((l: any) => [l.profile_id, String(l.hours)]))); setPayDate(data.run?.pay_date || addDays(data.week, 7)); if (!week) setWeek(data.week); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const locked = data?.run && data.run.status !== 'draft';
  const setOf = (id: string) => (settings.data?.members || []).find((m: any) => m.id === id)?.pay as PaySetting | undefined;
  const lines = useMemo(() => (data?.lines || []).map((l: any) => { if (locked) return l; const s = setOf(l.profile_id); const h = Number(hours[l.profile_id] ?? l.hours) || 0; return s ? { ...l, hours: h, ...calcPay(s, h) } : l; }), [data, hours, settings.data, locked]); // eslint-disable-line react-hooks/exhaustive-deps
  const tot = (k: string) => lines.reduce((s: number, l: any) => s + Number(l[k] || 0), 0);
  const canRun = ['admin', 'director'].includes(me.role);
  const save = async (finalise: boolean) => {
    if (finalise && !(await confirm({ title: `Finalise pay for ${weekLabel(data.week)}?`, body: `Gross ${aud(tot('gross_cents'))} · PAYG ${aud(tot('tax_cents'))} · super ${aud(tot('super_cents'))} · net ${aud(tot('net_cents'))}. The figures are locked and recorded under Finance as bills to pay (wages, PAYG to the ATO, super).`, confirm: 'Finalise' }))) return;
    setBusy(finalise ? 'fin' : 'save');
    try { await api.post('/api/finance/payroll', { week: data.week, pay_date: payDate, finalise, lines: lines.map((l: any) => ({ profile_id: l.profile_id, hours: Number(hours[l.profile_id] ?? l.hours) || 0, note: l.note })) }); toast(finalise ? 'Pay run finalised' : 'Draft saved', 'success'); reload(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const markPaid = async () => { setBusy('paid'); try { await api.patch(`/api/finance/payroll/${data.run.id}`, { status: 'paid' }); toast('Marked as paid', 'success'); reload(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  return <>
    <PageHead title="Payroll" actions={<Button icon={<Settings2 size={15} />} onClick={() => setSettingsOpen(true)}>Pay rates</Button>} />
    <div className="fin-week card">
      <button className="icon-btn" onClick={() => setWeek(addDays(data.week, -7))} aria-label="Previous week"><ChevronLeft size={18} /></button>
      <div className="fin-week-label"><b>Week {weekLabel(data.week)}</b><span className="small muted">{data.run ? `${data.run.status === 'draft' ? 'Draft' : data.run.status === 'finalised' ? 'Finalised' : 'Paid'}${data.run.finalised_at ? ` · ${fmtDate(data.run.finalised_at)}` : ''}` : 'Not run yet'}</span></div>
      <button className="icon-btn" onClick={() => setWeek(addDays(data.week, 7))} disabled={data.week >= mondayOf(today())} aria-label="Next week"><ChevronRight size={18} /></button>
      <span className="spacer" />
      <label className="small muted fin-paydate">Pay date <input className="input sm" type="date" value={payDate} disabled={!!locked} onChange={e => setPayDate(e.target.value)} /></label>
    </div>
    {data.missing.length > 0 && <div className="mt12"><Notice>No pay rate set for {data.missing.map((m: any) => m.name).join(', ')} — {canRun ? <button className="link" onClick={() => setSettingsOpen(true)}>set pay rates</button> : 'an admin sets pay rates'} to include them.</Notice></div>}
    {!lines.length ? <div className="card mt12"><Empty icon={<Users size={20} />} title="Nobody to pay yet">{canRun ? <>Set each person&apos;s hourly rate or salary in <button className="link" onClick={() => setSettingsOpen(true)}>Pay rates</button>.</> : 'An admin sets pay rates first.'}</Empty></div> : <>
      <div className="card table-wrap mt12"><table className="table fin-table"><thead><tr><th>Person</th><th className="num">Hours</th><th className="num hide-sm">Rate</th><th className="num">Gross</th><th className="num">Tax (PAYG)</th><th className="num">Super</th><th className="num">Pay</th><th /></tr></thead>
        <tbody>{lines.map((l: any) => <tr key={l.profile_id}>
          <td><b>{l.name}</b><div className="tiny muted">{l.pay_type === 'contractor' ? `Contractor${l.abn ? ` · ABN ${l.abn}` : ''}` : `Employee · ${l.rate_type === 'salary' ? 'salary' : 'hourly'}`} · <span title="Where the hours came from">{l.hours_source}</span></div></td>
          <td className="num">{locked ? Number(l.hours).toFixed(2) : <input className="input sm fin-hours" inputMode="decimal" value={hours[l.profile_id] ?? ''} onChange={e => setHours(h => ({ ...h, [l.profile_id]: e.target.value }))} aria-label={`Hours for ${l.name}`} />}{!locked && Math.abs((Number(hours[l.profile_id]) || 0) - l.recorded_hours) > 0.01 && <div className="tiny muted">recorded {l.recorded_hours}</div>}</td>
          <td className="num hide-sm">{aud(l.rate_cents)}</td><td className="num">{aud(l.gross_cents)}</td><td className="num">{l.pay_type === 'contractor' ? '—' : aud(l.tax_cents)}</td>
          <td className="num">{l.pay_type === 'contractor' ? '—' : aud(l.super_cents)}</td><td className="num"><b>{aud(l.net_cents)}</b>{l.gst_cents > 0 && <div className="tiny muted">incl. GST {aud(l.gst_cents)}</div>}</td>
          <td><button className="icon-btn" title="Payslip" onClick={() => setSlip({ ...l, week: data.week, pay_date: payDate })}><Printer size={15} /></button></td></tr>)}</tbody>
        <tfoot><tr><td><b>Total</b></td><td className="num">{tot('hours').toFixed(2)}</td><td className="hide-sm" /><td className="num"><b>{aud(tot('gross_cents'))}</b></td><td className="num"><b>{aud(tot('tax_cents'))}</b></td><td className="num"><b>{aud(tot('super_cents'))}</b></td><td className="num"><b>{aud(tot('net_cents'))}</b></td><td /></tr></tfoot></table></div>
      <div className="row mt12 fin-run-actions">
        <span className="tiny muted" style={{ flex: 1 }}>{data.note} Payday super: from 1 July 2026 super must reach the fund within 7 days of each payday.</span>
        {canRun && !locked && <><Button loading={busy === 'save'} onClick={() => save(false)}>Save draft</Button><Button variant="primary" loading={busy === 'fin'} onClick={() => save(true)}>Finalise pay run</Button></>}
        {canRun && data.run?.status === 'finalised' && <Button variant="primary" icon={<CheckCircle2 size={15} />} loading={busy === 'paid'} onClick={markPaid}>Mark as paid</Button>}
      </div></>}
    {data.runs.length > 0 && <Card title="Pay runs" className="mt16" flush><table className="table"><thead><tr><th>Week</th><th>Status</th><th className="num">Gross</th><th className="num">PAYG</th><th className="num">Super</th><th className="num">Net</th></tr></thead>
      <tbody>{data.runs.map((r: any) => <tr key={r.id} className="clickable" onClick={() => setWeek(r.week_start)}><td>{weekLabel(r.week_start)}</td><td><span className={`badge ${r.status === 'paid' ? 'green' : r.status === 'finalised' ? 'blue' : 'gray'}`}>{r.status === 'draft' ? 'Draft' : r.status === 'finalised' ? 'Finalised' : 'Paid'}</span></td><td className="num">{aud(r.gross_cents)}</td><td className="num">{aud(r.tax_cents)}</td><td className="num">{aud(r.super_cents)}</td><td className="num">{aud(r.net_cents)}</td></tr>)}</tbody></table></Card>}
    <PaySettings open={settingsOpen} onClose={() => { setSettingsOpen(false); settings.reload(); reload(); }} data={settings.data} reload={settings.reload} canEdit={canRun} />
    <Payslip line={slip} onClose={() => setSlip(null)} />
  </>;
}

function PaySettings({ open, onClose, data, reload, canEdit }: { open: boolean; onClose: () => void; data: any; reload: () => void; canEdit: boolean }) {
  const toast = useToast(); const [edit, setEdit] = useState<any>(null); const [busy, setBusy] = useState(false);
  const start = (m: any) => setEdit({ id: m.id, name: m.full_name || m.email, ...m.pay, hourly: dollars(m.pay.hourly_rate_cents), salary: dollars(m.pay.annual_salary_cents) });
  const save = async () => { setBusy(true); try { await api.put('/api/finance/pay-settings', { ...edit, profile_id: edit.id, hourly_rate_cents: toCents(edit.hourly), annual_salary_cents: toCents(edit.salary) }); toast('Pay rate saved', 'success'); setEdit(null); reload(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  const preview = edit ? calcPay({ ...edit, hourly_rate_cents: toCents(edit.hourly), annual_salary_cents: toCents(edit.salary) }, Number(edit.salary_hours) || 38) : null;
  return <Modal open={open} onClose={onClose} size="wide" title={edit ? `Pay — ${edit.name}` : 'Pay rates'} footer={edit ? <><Button onClick={() => setEdit(null)}>Back</Button>{canEdit && <Button variant="primary" loading={busy} onClick={save}>Save</Button>}</> : <Button onClick={onClose}>Done</Button>}>
    {!data ? <Loading /> : !edit ? <table className="table"><thead><tr><th>Person</th><th>Type</th><th className="num">Rate</th><th>Tax</th><th /></tr></thead><tbody>
      {data.members.map((m: any) => <tr key={m.id} className="clickable" onClick={() => start(m)}><td><b>{m.full_name || m.email}</b><div className="tiny muted">{m.title || m.role}</div></td>
        <td className="small">{m.pay.saved ? (m.pay.pay_type === 'contractor' ? 'Contractor' : 'Employee') : <span className="muted">Not set</span>}</td>
        <td className="num small">{!m.pay.saved ? '—' : m.pay.rate_type === 'salary' ? `${aud(m.pay.annual_salary_cents)} / yr` : `${aud(m.pay.hourly_rate_cents)} / hr`}</td>
        <td className="small">{m.pay.pay_type === 'contractor' ? (m.pay.gst_registered ? 'GST registered' : 'No GST') : m.pay.tax_scale === '2' ? 'Tax-free threshold' : `Scale ${m.pay.tax_scale}`}</td><td className="small link">{canEdit ? 'Edit' : 'View'}</td></tr>)}
    </tbody></table> : <div className="stack">
      <div className="form-grid">
        <Field label="Paid as"><select className="select" disabled={!canEdit} value={edit.pay_type} onChange={e => setEdit({ ...edit, pay_type: e.target.value })}><option value="employee">Employee (tax withheld + super)</option><option value="contractor">Contractor (invoices, no tax withheld)</option></select></Field>
        <Field label="Pay by"><select className="select" disabled={!canEdit} value={edit.rate_type} onChange={e => setEdit({ ...edit, rate_type: e.target.value })}><option value="hourly">Hourly rate × hours worked</option><option value="salary">Annual salary</option></select></Field>
        {edit.rate_type === 'hourly' ? <Field label="Hourly rate ($)"><input className="input" inputMode="decimal" disabled={!canEdit} value={edit.hourly} onChange={e => setEdit({ ...edit, hourly: e.target.value })} placeholder="0.00" /></Field>
          : <><Field label="Annual salary ($)"><input className="input" inputMode="decimal" disabled={!canEdit} value={edit.salary} onChange={e => setEdit({ ...edit, salary: e.target.value })} /></Field><Field label="Standard hours a week"><input className="input" inputMode="decimal" disabled={!canEdit} value={edit.salary_hours} onChange={e => setEdit({ ...edit, salary_hours: e.target.value })} /></Field></>}
        {edit.pay_type === 'employee' ? <>
          <Field label="Tax (from their TFN declaration)" className="span2"><select className="select" disabled={!canEdit} value={edit.tax_scale} onChange={e => setEdit({ ...edit, tax_scale: e.target.value })}>{TAX_SCALES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
          <Field label="Super (%)" hint={`Super guarantee is ${SUPER_RATE}%`}><input className="input" inputMode="decimal" disabled={!canEdit} value={edit.super_rate} onChange={e => setEdit({ ...edit, super_rate: e.target.value })} /></Field>
          <Field label="Super fund"><input className="input" disabled={!canEdit} value={edit.super_fund || ''} onChange={e => setEdit({ ...edit, super_fund: e.target.value })} /></Field>
        </> : <>
          <Field label="ABN"><input className="input" disabled={!canEdit} value={edit.abn || ''} onChange={e => setEdit({ ...edit, abn: e.target.value })} /></Field>
          <Field label="GST"><label className="check"><input type="checkbox" disabled={!canEdit} checked={!!edit.gst_registered} onChange={e => setEdit({ ...edit, gst_registered: e.target.checked })} /> Registered for GST (adds 10%)</label></Field>
        </>}
        <Field label="Include in pay runs"><label className="check"><input type="checkbox" disabled={!canEdit} checked={edit.active !== false} onChange={e => setEdit({ ...edit, active: e.target.checked })} /> Yes</label></Field>
      </div>
      {preview && preview.gross_cents > 0 && <Notice>A standard week ({Number(edit.salary_hours) || 38} h): gross {aud(preview.gross_cents)}{edit.pay_type === 'employee' ? ` · tax ${aud(preview.tax_cents)} · super ${aud(preview.super_cents)}` : preview.gst_cents ? ` · GST ${aud(preview.gst_cents)}` : ''} · pay <b>{aud(preview.net_cents)}</b></Notice>}
      {edit.study_loan && <Notice tone="warn">Study/training loan (HELP) repayments are not added automatically yet — add them to the tax by hand.</Notice>}
    </div>}
  </Modal>;
}

function Payslip({ line, onClose }: { line: any; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const print = () => { const w = window.open('', '_blank', 'width=720,height=900'); if (!w || !ref.current) return; w.document.write(`<html><head><title>Payslip — ${line.name}</title><style>body{font:14px system-ui,sans-serif;padding:32px;color:#102030}h2{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:7px 4px;border-bottom:1px solid #ddd}td.n{text-align:right}tr.t td{font-weight:700;border-top:2px solid #102030}.m{color:#667}</style></head><body>${ref.current.innerHTML}</body></html>`); w.document.close(); w.focus(); w.print(); };
  if (!line) return null;
  return <Modal open onClose={onClose} title="Payslip" footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" icon={<Printer size={15} />} onClick={print}>Print</Button></>}>
    <div ref={ref} className="fin-slip">
      <h2>{line.name}</h2><div className="m muted small">Week {weekLabel(line.week)} · paid {fmtDate(line.pay_date)} · {line.pay_type === 'contractor' ? 'Contractor' : 'Employee'}</div>
      <table><tbody>
        <tr><td>Hours</td><td className="n">{Number(line.hours).toFixed(2)}</td></tr>
        <tr><td>Rate</td><td className="n">{aud(line.rate_cents)} / hr</td></tr>
        <tr><td>Gross pay</td><td className="n">{aud(line.gross_cents)}</td></tr>
        {line.pay_type === 'employee' && <tr><td>Tax withheld (PAYG)</td><td className="n">− {aud(line.tax_cents)}</td></tr>}
        {line.gst_cents > 0 && <tr><td>GST</td><td className="n">+ {aud(line.gst_cents)}</td></tr>}
        <tr className="t"><td>Paid to you</td><td className="n">{aud(line.net_cents)}</td></tr>
        {line.pay_type === 'employee' && <tr><td className="m">Super paid to {line.super_fund || 'your fund'} ({line.super_rate}%)</td><td className="n m">{aud(line.super_cents)}</td></tr>}
      </tbody></table>
    </div>
  </Modal>;
}
