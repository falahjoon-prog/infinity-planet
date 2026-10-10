'use client';
import { shrinkImage } from '@/lib/client/image';
import React, { useEffect, useRef, useState } from 'react';
import { Building2, Upload, Trash2, Wand2, Palette, FileText } from 'lucide-react';
import { api, apiFetch, useApi } from '@/lib/client/api';
import { Card, Loading, Button, Field, Notice, useToast } from './ui';
import { refreshBrand, useBrand } from '@/lib/client/brand';
import { LetterheadCard, WritingStyleCard } from '@/components/letterhead-setup';
import { BusinessAutofill } from './business-autofill';

/** Reads the main colours of an image in the browser (no upload, no AI). */
async function coloursFromImage(url: string): Promise<string[]> {
  const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url;
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
  const c = document.createElement('canvas'); const w = 96; const h = Math.max(1, Math.round(img.height * (w / img.width)));
  c.width = w; c.height = h; const x = c.getContext('2d')!; x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data; const counts = new Map<string, number>();
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]; if (a < 128) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b); if (max > 240 && min > 240) continue; if (max < 18) continue;
    const q = (v: number) => Math.min(255, Math.round(v / 24) * 24);
    const k = `#${[q(r), q(g), q(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`; counts.set(k, (counts.get(k) || 0) + 1 + (max - min) / 60);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 6);
}
const lum = (h: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

export function BusinessSettings() {
  const toast = useToast(); const brand = useBrand();
  const { data, loading, reload } = useApi<any>('/api/settings');
  const [s, setS] = useState<any>(null); const [busy, setBusy] = useState<string | null>(null);
  const [found, setFound] = useState<{ colours: string[]; fonts?: string[]; source: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (data) setS({ business_name: data.settings.business_name || '', business_short_name: data.settings.business_short_name || '', style: { letterhead: true, ...(data.settings.brand_style || {}) }, entity: data.settings.rhc_entity_details || {} }); }, [data]);
  if (loading || !s) return <Loading />;
  const st = s.style; const setSt = (k: string, v: any) => setS({ ...s, style: { ...st, [k]: v } });
  const save = async () => {
    setBusy('save');
    try { await api.patch('/api/settings', { business_name: s.business_name, business_short_name: s.business_short_name, brand_style: st, rhc_entity_details: s.entity }); await refreshBrand(); toast('Business settings saved', 'success'); reload(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const upload = async (f: File | undefined) => {
    if (!f) return; setBusy('logo');
    try { f = await shrinkImage(f); const fd = new FormData(); fd.append('file', f); const r = await apiFetch('/api/brand/logo', { method: 'POST', body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Upload failed'); await refreshBrand(); toast('Logo updated', 'success'); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); if (file.current) file.current.value = ''; }
  };
  const removeLogo = async () => { setBusy('logo'); try { await api.del('/api/brand/logo'); await refreshBrand(); toast('Logo removed', 'success'); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const fromLogo = async () => { if (!brand.logo_url) return toast('Upload a logo first', 'error'); try { const c = await coloursFromImage(brand.logo_url); setFound({ colours: c, source: 'your logo' }); if (c.length) { const dark = c.filter(x => lum(x) < 0.4), light = c.filter(x => lum(x) >= 0.4); setS((p: any) => ({ ...p, style: { ...p.style, primary: dark[0] || c[0], accent: light[0] || c[1] || p.style.accent } })); } } catch { toast('Could not read colours from this logo', 'error'); } };
  const fromBook = async () => { setBusy('book'); try { const r = await api.get('/api/brand/detect'); if (!r.documents.length) toast('No brand book yet — in Documents, set a document’s category to “Brand book”, or add a Drive link as Brand book.', 'error'); else { setFound({ colours: r.colours, fonts: r.fonts, source: r.documents.map((d: any) => d.name).join(', ') }); setS((p: any) => ({ ...p, style: { ...p.style, ...(r.primary ? { primary: r.primary } : {}), ...(r.accent ? { accent: r.accent } : {}), ...(r.fonts?.some((f: string) => /playfair|garamond|georgia|times|baskerville|cormorant|bodoni|didot|merriweather/i.test(f)) ? { font: 'serif' } : r.fonts?.some((f: string) => /grotesk|futura|gotham|montserrat|poppins|avenir/i.test(f)) ? { font: 'modern' } : r.fonts?.length ? { font: 'sans' } : {}) } })); if (!r.colours.length) toast('The brand book text has no colour codes (e.g. #13294B) — pick colours manually or read them from the logo.', 'error'); } } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const e = s.entity; const setE = (k: string, v: string) => setS({ ...s, entity: { ...e, [k]: v } });
  const primary = st.primary || '#13294b', accent = st.accent || '#c8a45c';
  const footer = [st.footer_text, [e.name, e.abn ? `ABN ${e.abn}` : '', e.acn ? `ACN ${e.acn}` : '', e.address, e.phone, e.email, st.website].filter(Boolean).join('  ·  ')].filter(Boolean).join('\n');
  return <div className="grid g2">
    <div className="stack">
      <BusinessAutofill onApplied={reload} />
      <Card title={<><Building2 size={15} /> Business</>}><div className="form-grid">
        <Field label="Business name" className="full" hint="Shown in the sidebar, sign-in page, documents and exports. The AI and Legal AI act for this business."><input className="input" value={s.business_name} onChange={x => setS({ ...s, business_name: x.target.value })} placeholder="e.g. RHC City" /></Field>
        <Field label="Short name" hint='How reports refer to you, e.g. "RHC"'><input className="input" value={s.business_short_name} onChange={x => setS({ ...s, business_short_name: x.target.value })} /></Field>
        <Field label="Website"><input className="input" value={st.website || ''} onChange={x => setSt('website', x.target.value)} placeholder="www.example.com.au" /></Field>
        <Field label="Legal entity name" className="full"><input className="input" value={e.name || ''} onChange={x => setE('name', x.target.value)} placeholder="e.g. RHC City Pty Ltd" /></Field>
        <Field label="ABN"><input className="input" value={e.abn || ''} onChange={x => setE('abn', x.target.value)} /></Field>
        <Field label="ACN"><input className="input" value={e.acn || ''} onChange={x => setE('acn', x.target.value)} /></Field>
        <Field label="Phone"><input className="input" value={e.phone || ''} onChange={x => setE('phone', x.target.value)} /></Field>
        <Field label="Address" className="full"><input className="input" value={e.address || ''} onChange={x => setE('address', x.target.value)} /></Field>
        <Field label="Email" className="full"><input className="input" value={e.email || ''} onChange={x => setE('email', x.target.value)} /></Field>
      </div></Card>
      <Card title={<><Upload size={15} /> Logo</>}>
        <div className="row" style={{ gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="logo-preview">{brand.logo_url ? <img src={brand.logo_url} alt="Logo" /> : <span className="small muted">No logo</span>}</div>
          <div className="stack" style={{ gap: 8 }}>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden onChange={x => upload(x.target.files?.[0])} />
            <Button icon={<Upload size={14} />} loading={busy === 'logo'} onClick={() => file.current?.click()}>{brand.logo_url ? 'Replace logo' : 'Upload logo'}</Button>
            {brand.logo_url && !brand.logo_url.startsWith('/brand/') && <Button variant="ghost" icon={<Trash2 size={14} />} onClick={removeLogo}>Use the RHC logo</Button>}
            <span className="tiny muted">PNG or JPG works everywhere (Word, PDF, designs). SVG/WebP show in the app and designs only. Large images are resized automatically.</span>
          </div>
        </div>
      </Card>
    </div>
    <div className="stack">
      <LetterheadCard onLogoChanged={() => refreshBrand()} />
      <WritingStyleCard />
      <Card title={<><Palette size={15} /> Brand colours & letterhead</>} actions={<div className="row" style={{ gap: 6 }}><Button size="xs" icon={<Wand2 size={13} />} loading={busy === 'book'} onClick={fromBook}>From brand book</Button><Button size="xs" icon={<Wand2 size={13} />} onClick={fromLogo}>From logo</Button></div>}>
        <div className="form-grid">
          <Field label="Primary colour"><input type="color" className="input" value={primary} onChange={x => setSt('primary', x.target.value)} /></Field>
          <Field label="Accent colour"><input type="color" className="input" value={accent} onChange={x => setSt('accent', x.target.value)} /></Field>
          <Field label="Typography" className="full"><select className="select" value={st.font || 'serif'} onChange={x => setSt('font', x.target.value)}><option value="serif">Classic serif</option><option value="sans">Clean sans</option><option value="modern">Modern grotesk</option></select></Field>
          {found && <div className="full small"><div className="muted mb8">Found in {found.source}{found.fonts?.length ? ` · fonts: ${found.fonts.join(', ')}` : ''} — click a colour to use it:</div><div className="swatch-row">{found.colours.map(c => <span key={c} className="row" style={{ gap: 4 }}><button className="swatch-pick" style={{ background: c }} title={`${c} as primary`} onClick={() => setSt('primary', c)} /><button className="btn ghost xs" onClick={() => setSt('accent', c)}>accent</button></span>)}</div></div>}
          <Field label="Footer line" className="full" hint="Appears above your company details on every exported page"><input className="input" value={st.footer_text || ''} onChange={x => setSt('footer_text', x.target.value)} placeholder="e.g. Building better communities since 2010" /></Field>
          <label className="check full"><input type="checkbox" checked={st.letterhead !== false} onChange={x => setSt('letterhead', x.target.checked)} /> Add letterhead (logo, name, footer and page numbers) to Word and PDF exports</label>
        </div>
      </Card>
      <Card title={<><FileText size={15} /> Preview</>}>
        <div className="letterhead-preview">
          <div className="lh-top" style={{ borderColor: accent }}>{brand.logo_url ? <img src={brand.logo_url} alt="" /> : <span />}<b style={{ color: primary, fontSize: 15 }}>{s.business_name || 'Business name'}</b></div>
          <div style={{ color: primary, fontWeight: 700, marginBottom: 6 }}>MEMORANDUM OF UNDERSTANDING</div>
          <div className="muted">1. PARTIES … The parties record their understanding of the proposed transaction …</div>
          <div className="lh-foot" style={{ borderColor: accent }}>{footer || 'Company details appear here'}{'\n'}Page 1 of 1</div>
        </div>
        <Notice>New designs, documents and exports use these settings by default. Mark your brand book in Documents (category “Brand book”) so the AI and marketing writer follow its tone.</Notice>
      </Card>
      <div className="row"><span className="spacer" /><Button variant="primary" loading={busy === 'save'} onClick={save}>Save business settings</Button></div>
    </div>
  </div>;
}
