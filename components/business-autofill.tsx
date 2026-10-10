'use client';
import React, { useState } from 'react';
import { ScanSearch, Check } from 'lucide-react';
import { api } from '@/lib/client/api';
import { Card, Button, Empty, Notice, useToast } from './ui';
import { refreshBrand } from '@/lib/client/brand';

const FIELDS: [string, string][] = [['legal_name', 'Legal name'], ['abn', 'ABN'], ['acn', 'ACN'], ['address', 'Address'], ['phone', 'Phone'], ['email', 'Email'], ['website', 'Website']];
const KEY: Record<string, string> = { legal_name: 'name', abn: 'abn', acn: 'acn', address: 'address', phone: 'phone', email: 'email', website: 'website' };

/** Reads the business's documents (uploads + Google Drive) and proposes logo, ABN, address etc. Nothing is saved until Apply. */
export function BusinessAutofill({ onApplied }: { onApplied: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<any>(null); const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({}); const [logo, setLogo] = useState<string | null>(null); const [colours, setColours] = useState(true);
  const scan = async () => {
    setBusy('scan');
    try { const r = await api.get('/api/brand/autofill'); setData(r); const p: Record<string, string> = {}; for (const [k] of FIELDS) if (r.proposal[k]?.[0]) p[k] = r.proposal[k][0].value; setPick(p); setLogo(r.logos[0]?.id || null); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const apply = async () => {
    setBusy('apply');
    try {
      const details: Record<string, string> = {}; for (const [k, v] of Object.entries(pick)) if (v) details[KEY[k]] = v;
      const r = await api.post('/api/brand/autofill', { details, logo_document_id: logo, ...(colours && data.style.primary ? { primary: data.style.primary, accent: data.style.accent } : {}) });
      await refreshBrand(); toast(r.changed.length ? `Updated: ${r.changed.join(', ')}` : 'Nothing new to change', 'success'); onApplied();
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const found = data && FIELDS.some(([k]) => data.proposal[k]?.length);
  return <Card title={<><ScanSearch size={15} /> Fill from your documents</>} sub="reads uploads and synced Google Drive files" actions={<Button size="xs" variant="primary" loading={busy === 'scan'} onClick={scan}>{data ? 'Scan again' : 'Scan documents'}</Button>}>
    {!data ? <p className="small muted">Finds your legal name, ABN, ACN, address, phone, email, website, logo (an image with “logo” in its file name) and brand-book colours in your own documents — including files synced from Google Drive. You choose what to keep; nothing changes until you apply. Sync your Drive first (Documents → Google Drive → Add link).</p>
      : !found && !data.logos.length ? <Empty title="Nothing found yet">{data.documents_scanned} documents scanned. Sync your Google Drive or upload a signed agreement, invoice or letterhead, then scan again.</Empty>
      : <div className="stack" style={{ gap: 12 }}>
        <div className="small muted">{data.documents_scanned} documents scanned · looking for {data.business_names.join(' / ')}</div>
        {FIELDS.map(([k, l]) => { const list = data.proposal[k] || []; if (!list.length) return null; return <div key={k}>
          <div className="small bold mb8">{l}</div>
          <div className="stack" style={{ gap: 4 }}>{list.map((c: any) => <label key={c.value} className="check small" title={c.excerpt}><input type="radio" name={k} checked={pick[k] === c.value} onChange={() => setPick({ ...pick, [k]: c.value })} /> <b>{c.value}</b> <span className="muted">· in {c.count} place{c.count === 1 ? '' : 's'} — {c.sources.map((x: any) => x.name).slice(0, 2).join(', ')}</span></label>)}
            <label className="check small muted"><input type="radio" name={k} checked={!pick[k]} onChange={() => setPick({ ...pick, [k]: '' })} /> Keep current</label></div></div>; })}
        {data.logos.length > 0 && <div><div className="small bold mb8">Logo</div><div className="row wrap" style={{ gap: 8 }}>{data.logos.map((l: any) => <button key={l.id} className={`logo-preview ${logo === l.id ? 'on' : ''}`} style={{ width: 120, height: 70, outline: logo === l.id ? '2px solid var(--blue)' : undefined, cursor: 'pointer' }} onClick={() => setLogo(logo === l.id ? null : l.id)} title={l.name}><img src={l.url} alt={l.name} /></button>)}</div></div>}
        {data.style.primary && <label className="check small"><input type="checkbox" checked={colours} onChange={e => setColours(e.target.checked)} /> Use brand-book colours <span className="swatch-pick" style={{ background: data.style.primary, width: 18, height: 18, display: 'inline-block', verticalAlign: 'middle' }} /> <span className="swatch-pick" style={{ background: data.style.accent || '#fff', width: 18, height: 18, display: 'inline-block', verticalAlign: 'middle' }} /></label>}
        <Notice>Hover a value to see where it was found. ABN and ACN numbers are checked with the official checksum.</Notice>
        <div className="row"><span className="spacer" /><Button variant="primary" icon={<Check size={14} />} loading={busy === 'apply'} onClick={apply}>Apply selected</Button></div>
      </div>}
  </Card>;
}
