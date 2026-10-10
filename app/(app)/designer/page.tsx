'use client';
import { SplitHandle } from '@/components/split-handle';
import { leave } from '@/lib/client/nav-history';
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Palette, Plus, Save, Wand2, ImagePlus, Printer, Download, X, Lock, Database, Image as ImageIcon } from 'lucide-react';
import { api, useApi, downloadBlob } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { ProjectSelect, ProviderSelect } from '@/components/pickers';
import { RequestApproval, ApprovalTrail } from '@/components/workflow';
import { PageHead, Card, Loading, Empty, StatusBadge, Button, Field, useToast, Notice } from '@/components/ui';
import { useBrand } from '@/lib/client/brand';
import { LAYOUTS, THEMES, renderDesign, defaultDesign, Design, LayoutId } from '@/lib/designer';
import { PhotoPicker } from '@/components/photo-picker';
import { ago } from '@/lib/client/format';

export default function Page() { return <Suspense fallback={<Loading />}><DesignerRouter /></Suspense>; }

function DesignerRouter() {
  const sp = useSearchParams();
  if (sp.get('id') || sp.get('new') === '1') return <Editor key={sp.get('id') || `new-${sp.get('layout') || ''}`} id={sp.get('id')} projectId={sp.get('project')} layout={sp.get('layout')} />;
  return <Gallery />;
}

function Gallery() {
  const router = useRouter(); const { can } = useApp();
  const { data, loading } = useApi<any>('/api/marketing/assets?kind=design');
  const shape = (k: LayoutId) => { const L = LAYOUTS[k]; const n = (v: string) => parseFloat(v) || 1; const w = n(L.width), h = n(L.height); const max = 64; return w >= h ? { width: max, height: Math.max(18, Math.round(max * h / w)) } : { width: Math.max(18, Math.round(max * w / h)), height: max }; };
  return <>
    {can.write && <section className="dz-start">
      <div className="dz-start-head"><b>Start a new design</b><span className="small muted">Pick a format — you can fill it from a project in one click.</span></div>
      <div className="dz-formats">{(Object.keys(LAYOUTS) as LayoutId[]).map(k => <button key={k} className="dz-format" onClick={() => router.push(`/designer?new=1&layout=${k}`)} title={LAYOUTS[k].description}>
        <span className="dz-thumb"><i style={shape(k)}>{LAYOUTS[k].pages > 1 && <i className="dz-page2" style={shape(k)} />}</i></span>
        <b>{LAYOUTS[k].label.replace(/\s*\(.*\)$/, '')}</b><span className="tiny muted">{LAYOUTS[k].label.match(/\((.*)\)/)?.[1] || LAYOUTS[k].page}</span>
      </button>)}</div>
    </section>}
    <div className="dz-start-head" style={{ marginTop: 18 }}><b>Your designs</b></div>
    {loading ? <Loading /> : !data?.assets?.length ? <div className="card"><Empty icon={<Palette size={20} />} title="No designs yet">Pick a format above to start.</Empty></div>
      : <div className="grid g4">{data.assets.map((a: any) => <button key={a.id} className="template-card" onClick={() => router.push(`/designer?id=${a.id}`)}><div className="tc-top"><small>{(LAYOUTS as any)[a.layout]?.label || 'Design'}</small><StatusBadge value={a.status} /></div><div className="tc-body"><b>{a.title}</b><p>{a.project?.name || 'No project'} · {ago(a.updated_at)}</p></div></button>)}</div>}
  </>;
}

function Editor({ id, projectId, layout }: { id: string | null; projectId: string | null; layout?: string | null }) {
  const router = useRouter(); const toast = useToast(); const { can } = useApp();
  const existing = useApi<any>(id ? `/api/marketing/assets/${id}` : null, [id]);
  const [title, setTitle] = useState('Untitled design');
  const [project, setProject] = useState<string | null>(projectId);
  const [design, setDesign] = useState<Design>(defaultDesign(layout && layout in LAYOUTS ? layout as LayoutId : 'flyer_a4'));
  const [status, setStatus] = useState('draft');
  const [dirty, setDirty] = useState(false);
  const close = () => { if (dirty && !window.confirm('Close without saving your changes?')) return; leave(router, '/designer', u => u.split('?')[0] === '/designer' && /[?&](id|new)=/.test(u)); }; // back to where it was opened from (the designs list, Marketing, Approvals…)
  const [busy, setBusy] = useState<string | null>(null);
  const [provider, setProvider] = useState('none');
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null); const [scale, setScale] = useState(0.6);
  const brand = useBrand(); const settings = useApi<any>('/api/settings'); const branded = useRef(false);
  useEffect(() => {
    // New designs start in the business identity: brand colours, font, name and logo (Settings → Business details).
    if (id || branded.current || !settings.data) return; branded.current = true;
    const st = settings.data.settings?.brand_style || {};
    // (the newsletter keeps its website look and the Infinity Planet logo)
    if (layout === 'newsletter_email') return;
    setDesign(d => ({ ...d, theme: { ...d.theme, ...(st.primary ? { primary: st.primary } : {}), ...(st.accent ? { accent: st.accent } : {}), ...(st.font ? { font: st.font } : {}) }, content: { ...d.content, eyebrow: d.content.eyebrow === 'RHC CITY' ? brand.business_name.toUpperCase() : d.content.eyebrow, logo_text: brand.business_name.toUpperCase(), ...(brand.logo_url ? { logo_image: brand.logo_url } : {}) } }));
  }, [settings.data, brand, id]);

  useEffect(() => {
    const a = existing.data?.asset; if (!a) return;
    setTitle(a.title); setProject(a.project_id); setStatus(a.status);
    const d = { ...defaultDesign(a.layout || 'flyer_a4'), ...(a.design || {}) } as Design; d.layout = (a.layout || d.layout) as LayoutId; setDesign(d); setDirty(false);
    if (d.content.image_path) api.get(`/api/marketing/image?path=${encodeURIComponent(d.content.image_path)}`).then(r => setImgUrl(r.url)).catch(() => {});
  }, [existing.data]);
  useEffect(() => { if (!id && projectId) fill('none'); }, []); // eslint-disable-line

  const L = LAYOUTS[design.layout];
  const px = (v: string) => v.endsWith('mm') ? parseFloat(v) * 3.7795 : parseFloat(v);
  const w = px(L.width), h = px(L.height) * L.pages + (L.pages - 1) * 24 + 48;
  useEffect(() => { const fit = () => { const el = stage.current; if (!el) return; setScale(Math.min(1, (el.clientWidth - 36) / w)); }; fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, [w]);
  const html = useMemo(() => renderDesign({ ...design, content: { ...design.content, image_url: imgUrl || undefined } }, { watermark: status === 'approved' ? null : 'DRAFT — NOT APPROVED' }), [design, imgUrl, status]);

  const upd = (patch: Partial<Design['content']>) => { setDesign(d => ({ ...d, content: { ...d.content, ...patch } })); setDirty(true); };
  const fill = async (p = provider) => {
    if (!project && !projectId) return toast('Choose a project first', 'error');
    setBusy('fill');
    try { const r = await api.post('/api/marketing/copy', { project_id: project || projectId, provider: p, layout: L.label }); setDesign(d => ({ ...d, content: { ...d.content, ...r.content, image_path: d.content.image_path } })); setDirty(true);
      if (title === 'Untitled design' && r.content.headline) setTitle(`${r.content.headline} — ${L.label.replace(/ \(.*\)/, '')}`); toast(r.engine === 'rules' ? 'Filled from project data' : `Copy written by ${r.engine}`, 'success'); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const uploadImage = async (f: File | undefined) => {
    if (!f) return; setBusy('img');
    const fd = new FormData(); fd.append('file', f);
    try { const r = await api.post('/api/marketing/image', fd); setImgUrl(r.url); upd({ image_path: r.path }); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const save = async () => {
    setBusy('save');
    const content = { ...design.content }; delete content.image_url;
    const body = { title, project_id: project, layout: design.layout, design: { ...design, content }, kind: 'design', content: design.content.headline || title };
    try {
      if (id) { const r = await api.patch(`/api/marketing/assets/${id}`, body); setStatus(r.asset.status); toast(r.asset.status === 'draft' && status === 'approved' ? 'Saved — changes need re-approval' : 'Saved', 'success'); existing.reload(); }
      else { const r = await api.post('/api/marketing/assets', body); toast('Design saved', 'success'); router.replace(`/designer?id=${r.asset.id}`); }
      setDirty(false);
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const exportDesign = async (mode: 'print' | 'html' | 'png') => {
    if (!id) return; setBusy(mode);
    try {
      const out = await api.text(`/api/marketing/assets/${id}/render?export=1`);
      if (mode === 'png') {
        // Render the approved HTML off-screen and rasterise each page at its exact size.
        const frame = document.createElement('iframe');
        frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${Math.ceil(w)}px;height:${Math.ceil(h)}px;border:0`;
        document.body.appendChild(frame);
        try {
          const loaded = new Promise(r => { frame.onload = r; });
          frame.srcdoc = out;
          await loaded;
          const doc = frame.contentDocument!;
          await (doc as any).fonts?.ready; await new Promise(r => setTimeout(r, 400));
          const { toPng } = await import('html-to-image');
          const pages = Array.from(doc.querySelectorAll('.page')) as HTMLElement[];
          for (let i = 0; i < pages.length; i++) {
            const url = await toPng(pages[i], { pixelRatio: L.screen ? 1 : 2, cacheBust: true, skipFonts: false }).catch(() => toPng(pages[i], { pixelRatio: L.screen ? 1 : 2, skipFonts: true }));
            const blob = await (await fetch(url)).blob();
            downloadBlob(blob, `${title.replace(/[^\w\- ]+/g, '').trim() || 'design'}${pages.length > 1 ? `-p${i + 1}` : ''}.png`);
          }
        } finally { frame.remove(); }
      } else if (mode === 'html') downloadBlob(new Blob([out], { type: 'text/html' }), `${title.replace(/[^\w\- ]+/g, '').trim() || 'design'}.html`);
      else { const win = window.open('', '_blank'); if (!win) return toast('Allow pop-ups to print', 'error'); win.document.write(out); win.document.close(); setTimeout(() => { win.focus(); win.print(); }, 900); }
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const locked = status === 'awaiting_approval';
  if (id && existing.loading && !existing.data) return <Loading />;
  const c = design.content;
  return <>
    <PageHead eyebrow={<><a className="link" href="/designer">Designer</a> / {L.label}</>} title={<input className="input" value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} disabled={locked || !can.write} style={{ fontSize: 20, fontWeight: 700, height: 44, maxWidth: 520 }} />}
      actions={<><StatusBadge value={status} />
        {can.write && !locked && <Button variant={dirty || !id ? 'primary' : undefined} icon={<Save size={15} />} loading={busy === 'save'} onClick={save} disabled={!dirty && !!id}>Save</Button>}
        {id && !dirty && status !== 'approved' && <RequestApproval type="marketing_asset" id={id} status={status} onDone={() => existing.reload()} />}
        {status === 'approved' ? <><Button variant="success" icon={<Printer size={15} />} loading={busy === 'print'} onClick={() => exportDesign('print')}>Export PDF</Button><Button icon={<ImageIcon size={15} />} loading={busy === 'png'} onClick={() => exportDesign('png')}>PNG</Button><Button icon={<Download size={15} />} loading={busy === 'html'} onClick={() => exportDesign('html')}>HTML</Button></> : <Button icon={<Lock size={15} />} disabled title="Approval required before export">Export</Button>}<button className="icon-btn" title="Close" aria-label="Close" onClick={close}><X size={18} /></button></>} />
    {existing.data?.approvals?.length > 0 && <div className="mb16"><ApprovalTrail approvals={existing.data.approvals} /></div>}
    {locked && <div className="mb16"><Notice>Awaiting approval — editing is locked.</Notice></div>}
    <div className="designer">
      <SplitHandle id="designer" min={280} max={640} minOther={420} />
      <div className="panel stack">
        <Card title="Format"><select className="select" value={design.layout} disabled={locked} onChange={e => { const k = e.target.value as LayoutId; setDesign(d => ({ ...d, layout: k })); setDirty(true); }}>{(Object.keys(LAYOUTS) as LayoutId[]).map(k => <option key={k} value={k}>{LAYOUTS[k].label}</option>)}</select><div className="tiny muted" style={{ marginTop: 6 }}>{LAYOUTS[design.layout].description}</div></Card>
        <Card title="Theme"><div className="swatches">{Object.entries(THEMES).map(([name, t]) => <button key={name} className={`swatch ${design.theme.primary === t.primary && design.theme.accent === t.accent ? 'on' : ''}`} disabled={locked} onClick={() => { setDesign(d => ({ ...d, theme: t })); setDirty(true); }}><i style={{ background: t.primary }} /><i style={{ background: t.accent }} />{name}</button>)}</div>
          <div className="form-grid mt12"><Field label="Primary"><input type="color" className="input" value={design.theme.primary} onChange={e => { setDesign(d => ({ ...d, theme: { ...d.theme, primary: e.target.value } })); setDirty(true); }} /></Field><Field label="Accent"><input type="color" className="input" value={design.theme.accent} onChange={e => { setDesign(d => ({ ...d, theme: { ...d.theme, accent: e.target.value } })); setDirty(true); }} /></Field>
          <Field label="Typography" className="full"><select className="select" value={design.theme.font} onChange={e => { setDesign(d => ({ ...d, theme: { ...d.theme, font: e.target.value as any } })); setDirty(true); }}><option value="serif">Classic serif</option><option value="sans">Clean sans</option><option value="modern">Modern grotesk</option><option value="brand">Infinity Planet (Gabarito / DM Sans)</option></select></Field></div></Card>
        <Card title="Content source">
          <div className="stack" style={{ gap: 10 }}>
            <Field label="Project"><ProjectSelect value={project} onChange={v => { setProject(v); setDirty(true); }} /></Field>
            <Button icon={<Database size={14} />} loading={busy === 'fill' && provider === 'none'} disabled={locked || !project} onClick={() => fill('none')}>Fill from project data</Button>
            <Field label="AI copywriter"><ProviderSelect value={provider} onChange={setProvider} builtin="— choose a provider —" /></Field>
            <Button variant="gold" icon={<Wand2 size={14} />} loading={busy === 'fill' && provider !== 'none'} disabled={locked || !project || provider === 'none'} onClick={() => fill(provider)}>Write copy with AI</Button>
            <small className="muted">Only facts recorded on the project are used. Review every word before requesting approval.</small>
          </div>
        </Card>
        <Card title="Content">
          <div className="stack" style={{ gap: 10 }}>
            <Field label="Image">{imgUrl ? <div className="row"><img src={imgUrl} alt="" style={{ width: 88, height: 56, objectFit: 'cover', borderRadius: 6 }} /><Button size="xs" icon={<X size={12} />} disabled={locked} onClick={() => { setImgUrl(null); upd({ image_path: undefined }); }}>Remove</Button></div> : <label className="btn sm" style={{ alignSelf: 'flex-start' }}>{busy === 'img' ? <span className="spin" /> : <ImagePlus size={14} />}Upload image<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={locked} onChange={e => uploadImage(e.target.files?.[0])} /></label>}</Field>
            {design.layout === 'newsletter_email' && !imgUrl && <Field label="Or one of our photos"><PhotoPicker value={c.image_lib?.startsWith('/brand/deck/') ? `asset:${c.image_lib.slice(12)}` : c.image_lib} onChange={v => upd({ image_lib: v === 'none' ? undefined : v.startsWith('asset:') ? `/brand/deck/${v.slice(6)}` : v })} /></Field>}
            <Field label="Brand line"><input className="input" value={c.logo_text || ''} disabled={locked} onChange={e => upd({ logo_text: e.target.value })} /></Field>
            {brand.logo_url && <label className="check small"><input type="checkbox" disabled={locked} checked={!!c.logo_image} onChange={e => upd({ logo_image: e.target.checked ? brand.logo_url! : undefined })} /> Use business logo</label>}
            <Field label="Eyebrow"><input className="input" value={c.eyebrow || ''} disabled={locked} onChange={e => upd({ eyebrow: e.target.value })} /></Field>
            <Field label="Headline"><input className="input" value={c.headline || ''} disabled={locked} onChange={e => upd({ headline: e.target.value })} /></Field>
            <Field label="Sub-headline"><input className="input" value={c.subheadline || ''} disabled={locked} onChange={e => upd({ subheadline: e.target.value })} /></Field>
            <Field label="Body"><textarea className="textarea" value={c.body || ''} disabled={locked} onChange={e => upd({ body: e.target.value })} /></Field>
            {design.layout === 'newsletter_email' && <Field label="News stories">{(c.items || []).map((s, i) => <div key={i} className="stack" style={{ gap: 6, padding: 10, border: '1px solid var(--line)', borderRadius: 10 }}>
              <div className="row" style={{ gap: 6 }}><input className="input sm" placeholder="Date" value={s.date || ''} disabled={locked} onChange={e => upd({ items: (c.items || []).map((x, j) => j === i ? { ...x, date: e.target.value } : x) })} /><input className="input sm" placeholder="Label (e.g. News)" value={s.tag || ''} disabled={locked} onChange={e => upd({ items: (c.items || []).map((x, j) => j === i ? { ...x, tag: e.target.value } : x) })} /><button className="btn ghost xs" title="Remove story" disabled={locked} onClick={() => upd({ items: (c.items || []).filter((_, j) => j !== i) })}><X size={12} /></button></div>
              <input className="input sm" placeholder="Title" value={s.title} disabled={locked} onChange={e => upd({ items: (c.items || []).map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
              <textarea className="textarea" style={{ minHeight: 56 }} placeholder="Two or three lines" value={s.text || ''} disabled={locked} onChange={e => upd({ items: (c.items || []).map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} />
              <input className="input sm" placeholder="Link (https://…)" value={s.url || ''} disabled={locked} onChange={e => upd({ items: (c.items || []).map((x, j) => j === i ? { ...x, url: e.target.value } : x) })} /></div>)}
              {(c.items || []).length < 6 && <button className="link small" style={{ alignSelf: 'flex-start' }} disabled={locked} onClick={() => upd({ items: [...(c.items || []), { title: '', date: '', text: '', url: '', tag: 'News' }] })}>+ Add story</button>}</Field>}
            <Field label="Highlights" hint="One per line"><textarea className="textarea" value={(c.bullets || []).join('\n')} disabled={locked} onChange={e => upd({ bullets: e.target.value.split('\n') })} /></Field>
            <Field label="Key figures">{(c.stats || []).map((s, i) => <div key={i} className="row" style={{ gap: 6 }}><input className="input sm" placeholder="Value" value={s.value} disabled={locked} onChange={e => upd({ stats: (c.stats || []).map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} /><input className="input sm" placeholder="Label" value={s.label} disabled={locked} onChange={e => upd({ stats: (c.stats || []).map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} /><button className="btn ghost xs" disabled={locked} onClick={() => upd({ stats: (c.stats || []).filter((_, j) => j !== i) })}><X size={12} /></button></div>)}
              {(c.stats || []).length < 4 && <button className="link small" style={{ alignSelf: 'flex-start' }} disabled={locked} onClick={() => upd({ stats: [...(c.stats || []), { label: '', value: '' }] })}>+ Add figure</button>}</Field>
            <Field label="Call to action"><input className="input" value={c.cta || ''} disabled={locked} onChange={e => upd({ cta: e.target.value })} /></Field>
            <Field label="Contact"><textarea className="textarea" style={{ minHeight: 60 }} value={c.contact || ''} disabled={locked} onChange={e => upd({ contact: e.target.value })} /></Field>
            <Field label="Disclaimer"><textarea className="textarea" style={{ minHeight: 60 }} value={c.disclaimer || ''} disabled={locked} onChange={e => upd({ disclaimer: e.target.value })} /></Field>
          </div>
        </Card>
      </div>
      <div ref={stage} className="preview-stage">
        <div style={{ width: w * scale, height: h * scale, overflow: 'hidden' }}>
          <iframe title="Design preview" className="preview-frame" srcDoc={html} sandbox="allow-same-origin" style={{ width: w + 48, height: h, transform: `scale(${scale})`, transformOrigin: 'top left', marginLeft: -24 * scale }} />
        </div>
      </div>
    </div>
  </>;
}
