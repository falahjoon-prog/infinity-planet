'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PdfPages } from '@/components/pdf-pages';
import { SignaturePad } from '@/components/signature-pad';

/** Public page where a client signs a document sent from Infinity Planet (no account needed). */
export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(''); const [sig, setSig] = useState<string | null>(null); const [ini, setIni] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({}); const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false); const [done, setDone] = useState<any>(null); const [pad, setPad] = useState<'sig' | 'ini' | null>(null);
  const [width, setWidth] = useState(760); const [declining, setDeclining] = useState(false); const [reason, setReason] = useState('');
  useEffect(() => { fetch(`/api/sign/${token}`).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'This link is not valid'); setD(j); setName(j.signer_name || ''); }).catch(e => setErr(e.message)); }, [token]);
  useEffect(() => { const f = () => setWidth(Math.max(320, Math.min(860, window.innerWidth - 40))); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const fields: any[] = d?.fields || [];
  const needIni = fields.some(f => f.kind === 'initials');
  const submit = async () => {
    setBusy(true); setErr(null);
    try { const r = await fetch(`/api/sign/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, signature: sig, initials: ini, values, agree }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Signing failed'); setDone(j); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const decline = async () => { setBusy(true); try { const r = await fetch(`/api/sign/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decline: true, reason }) }); if (!r.ok) throw new Error((await r.json()).error); setDone({ declined: true }); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const wrap: React.CSSProperties = { maxWidth: 920, margin: '0 auto', padding: '20px 16px 60px', fontFamily: 'Inter, Arial, sans-serif', color: '#142033' };
  if (err && !d) return <div style={wrap}><h2>Signing link</h2><p style={{ color: '#c0392b' }}>{err}</p></div>;
  if (!d) return <div style={wrap}><p>Opening document…</p></div>;
  if (done) return <div style={wrap}><Header d={d} /><div className="card" style={{ padding: 24, marginTop: 16 }}>{done.declined ? <><h2>You declined to sign</h2><p>The sender has been told.</p></> : <><h2>✓ Signed — thank you</h2><p>The signed document has been sent back to {d.business.name}.</p>{done.download_url && <p><a className="btn primary" href={done.download_url}>Download your signed copy</a></p>}</>}</div></div>;
  if (d.status === 'signed') return <div style={wrap}><Header d={d} /><p>This document has already been signed.</p></div>;
  const ready = sig && name.trim().length > 1 && agree && (!needIni || ini) && !fields.some((f, i) => f.kind === 'text' && f.required && !String(values[i] || '').trim());
  return <div style={wrap}>
    <Header d={d} />
    {d.message && <div className="card" style={{ padding: 14, marginTop: 12, whiteSpace: 'pre-wrap' }}>{d.message}</div>}
    <div className="card" style={{ padding: 16, marginTop: 12, display: 'grid', gap: 12 }}>
      <b>1. Your details</b>
      <label className="field"><span>Full name</span><input className="input" value={name} onChange={e => setName(e.target.value)} /></label>
      <b>2. Your signature</b>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {sig ? <img src={sig} alt="Your signature" style={{ maxHeight: 60, background: '#fff', border: '1px solid #e3e8ef', borderRadius: 6, padding: 4 }} /> : null}
        <button className="btn" onClick={() => setPad('sig')}>{sig ? 'Change signature' : 'Add your signature'}</button>
        {needIni && <>{ini && <img src={ini} alt="Initials" style={{ maxHeight: 40 }} />}<button className="btn" onClick={() => setPad('ini')}>{ini ? 'Change initials' : 'Add initials'}</button></>}
      </div>
      {pad && <div className="card" style={{ padding: 12 }}><SignaturePad allowUpload={false} kind={pad === 'ini' ? 'initials' : 'signature'} initialMode="draw" defaultName={pad === 'ini' ? name.split(/\s+/).map(w => w[0]).join('').toUpperCase() : name} onDone={png => { pad === 'ini' ? setIni(png) : setSig(png); setPad(null); }} /></div>}
      {fields.some(f => f.kind === 'text') && <><b>3. Complete the boxes</b>{fields.map((f, i) => f.kind === 'text' ? <label key={i} className="field"><span>{f.label || 'Text'}{f.required ? ' *' : ''} (page {f.page + 1})</span><input className="input" value={values[i] || ''} onChange={e => setValues({ ...values, [i]: e.target.value })} /></label> : null)}</>}
      <label className="check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /> I have read the document and agree to sign it electronically. My signature will be applied in the marked places.</label>
      {err && <div style={{ color: '#c0392b' }}>{err}</div>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><button className="btn primary" disabled={!ready || busy} onClick={submit}>{busy ? 'Signing…' : 'Sign document'}</button><span style={{ flex: 1 }} /><button className="btn ghost" onClick={() => setDeclining(x => !x)}>Decline</button></div>
      {declining && <div className="row" style={{ gap: 8 }}><input className="input" placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} /><button className="btn danger" disabled={busy} onClick={decline}>Decline to sign</button></div>}
    </div>
    <p style={{ fontSize: 12, color: '#7a879b', margin: '18px 0 8px' }}>Document preview — the coloured boxes show where your signature and details will go.</p>
    {d.pdf_url && <PdfPages url={d.pdf_url} width={width} overlay={(page, size) => fields.filter(f => f.page === page).map((f, i) => <div key={i} style={{ position: 'absolute', left: f.x * size.w, top: f.y * size.h, width: f.w * size.w, height: f.h * size.h, border: '1.5px solid #1f5fbf', background: '#1f5fbf1a', color: '#1f5fbf', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3, overflow: 'hidden' }}>{f.kind === 'signature' && sig ? <img src={sig} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : f.kind === 'initials' && ini ? <img src={ini} alt="" style={{ maxHeight: '100%' }} /> : f.kind === 'name' && name ? name : f.label || f.kind}</div>)} />}
    <p style={{ fontSize: 11, color: '#7a879b', marginTop: 24 }}>Secure signing by {d.business.name} · powered by Infinity Planet. A signing certificate with your name, email, time and IP address is attached to the signed copy.</p>
  </div>;
}
function Header({ d }: { d: any }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '3px solid #c8a45c', paddingBottom: 12 }}>
    {d.business.logo_url && <img src={d.business.logo_url} alt="" style={{ height: 40 }} />}
    <div><div style={{ fontSize: 12, color: '#7a879b' }}>{d.business.name} asks you to sign</div><h1 style={{ fontSize: 20, margin: 0 }}>{d.title}</h1><div style={{ fontSize: 12, color: '#7a879b' }}>For {d.signer_name} ({d.signer_email}) · link expires {new Date(d.expires_at).toLocaleDateString('en-AU')}</div></div>
  </div>;
}
