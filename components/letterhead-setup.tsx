'use client';
/**
 * "Your letterhead" — takes the real letterhead from one of the business's own documents (a PDF in the Library,
 * including files from Google Drive, or a PDF from the computer): the top band (logo, pattern) and the bottom band
 * (address, colour blocks) of page 1. Every exported PDF and Word file then carries exactly that letterhead.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Upload, Search, Trash2, Check, ImageIcon } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { Button, Card, Modal, Notice, useToast, useConfirm } from '@/components/ui';

let pdfjsP: Promise<any> | null = null;
function pdfjs() {
  if (!pdfjsP) pdfjsP = import('pdfjs-dist').then((m: any) => { m.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'; return m; });
  return pdfjsP;
}

/** Finds where the top band ends and the bottom band starts (fractions of the page height). */
export function detectBands(cv: HTMLCanvasElement): { top: number; bottom: number } {
  const w = cv.width, h = cv.height; const ctx = cv.getContext('2d')!; const d = ctx.getImageData(0, 0, w, h).data;
  const step = 3; const inkRow: boolean[] = new Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x += step) { const i = (y * w + x) * 4; const r = d[i], g = d[i + 1], b = d[i + 2]; const mn = Math.min(r, g, b), mx = Math.max(r, g, b); if (mn < 235 || mx - mn > 40) n++; }
    inkRow[y] = n / (w / step) > 0.002;
  }
  const gap = Math.round(h * 0.012);
  let top = 0;
  const first = inkRow.findIndex((v, y) => v && y < h * 0.25);
  if (first >= 0) { let y = first, blank = 0; while (y < h * 0.32) { if (inkRow[y]) blank = 0; else if (++blank >= gap) break; y++; } top = Math.min(h * 0.32, y - blank + h * 0.01); }
  let bottom = h;
  let last = -1; for (let y = h - 1; y > h * 0.75; y--) if (inkRow[y]) { last = y; break; }
  if (last >= 0) { let y = last, blank = 0; while (y > h * 0.72) { if (inkRow[y]) blank = 0; else if (++blank >= gap) break; y--; } bottom = Math.max(h * 0.72, y + blank - h * 0.008); }
  return { top: top / h, bottom: bottom / h };
}

/** The first group of marks at the top-left of the band — usually the logo. */
function findLogo(cv: HTMLCanvasElement, bandBottom: number): { x: number; y: number; w: number; h: number } | null {
  const w = cv.width, hb = Math.round(cv.height * bandBottom); if (hb < 20) return null;
  const d = cv.getContext('2d')!.getImageData(0, 0, w, hb).data;
  const ink = (x: number, y: number) => { const i = (y * w + x) * 4; const r = d[i], g = d[i + 1], b = d[i + 2]; const mn = Math.min(r, g, b), mx = Math.max(r, g, b); return mn < 225 || mx - mn > 50; };
  const colInk = (x: number) => { for (let y = 0; y < hb; y += 2) if (ink(x, y)) return true; return false; };
  let x0 = -1; for (let x = 0; x < w * 0.45; x++) if (colInk(x)) { x0 = x; break; }
  if (x0 < 0) return null;
  let x = x0, blank = 0; const gap = Math.round(w * 0.015);
  while (x < w * 0.6) { if (colInk(x)) blank = 0; else if (++blank >= gap) break; x++; }
  const x1 = x - blank;
  let y0 = -1, y1 = -1;
  for (let y = 0; y < hb; y++) { let any = false; for (let xx = x0; xx <= x1; xx += 2) if (ink(xx, y)) { any = true; break; } if (any) { if (y0 < 0) y0 = y; y1 = y; } }
  if (y0 < 0 || x1 - x0 < 20 || y1 - y0 < 12) return null;
  const pad = 6;
  return { x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad), w: Math.min(w, x1 + pad) - Math.max(0, x0 - pad), h: Math.min(hb, y1 + pad) - Math.max(0, y0 - pad) };
}

const crop = (cv: HTMLCanvasElement, x: number, y: number, w: number, h: number) => new Promise<Blob>((ok, bad) => {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(cv, x, y, w, h, 0, 0, c.width, c.height);
  c.toBlob(b => b ? ok(b) : bad(new Error('Could not cut the image')), 'image/png');
});

export function LetterheadCard({ onLogoChanged }: { onLogoChanged?: () => void }) {
  const toast = useToast(); const confirm = useConfirm();
  const { data, reload } = useApi<any>('/api/brand/letterhead');
  const [open, setOpen] = useState(false);
  const art = data?.art;
  const remove = async () => { if (!(await confirm({ title: 'Go back to the RHC letterhead?', body: 'Documents will use the built-in RHC letterhead again.', confirm: 'Use the RHC letterhead' }))) return; try { await api.del('/api/brand/letterhead'); reload(); toast('Back to the RHC letterhead', 'success'); } catch (e: any) { toast(e.message, 'error'); } };
  return <Card title={<><FileText size={15} /> Your letterhead</>} actions={art && !art.builtin && <Button size="xs" variant="ghost" icon={<Trash2 size={13} />} onClick={remove}>Use the RHC letterhead</Button>}>
    {art ? <div className="lhs-current">
      <div className="lhs-page">{art.header_url && <img src={art.header_url} alt="Top of letterhead" />}<div className="lhs-body"><span /><span /><span /><span /></div>{art.footer_url && <img src={art.footer_url} alt="Bottom of letterhead" />}</div>
      <div className="lhs-side"><b>In use on every PDF and Word file</b><p className="small muted">{art.builtin ? <>The RHC letterhead is built into the app — logo and pattern at the top, Eagle St address and colour band at the bottom.</> : <>Taken from <i>{art.source_name || 'one of your documents'}</i>.</>} Drafts, agreements, letters, presentations and marketing documents all carry it.</p><Button icon={<FileText size={14} />} onClick={() => setOpen(true)}>Use a different document</Button></div>
    </div> : <div className="lhs-empty">
      <p>Use the real letterhead from one of your own documents — your logo and pattern at the top, your address and colour band at the bottom — exactly as it looks today.</p>
      <Button variant="primary" icon={<FileText size={15} />} onClick={() => setOpen(true)}>Take it from a document</Button>
      <p className="tiny muted">Pick any PDF on your letterhead from Documents (including files from Google Drive), or a PDF from your computer.</p>
    </div>}
    {open && <LetterheadFromDocument onClose={() => setOpen(false)} onSaved={(logo) => { setOpen(false); reload(); if (logo) onLogoChanged?.(); }} />}
  </Card>;
}

function LetterheadFromDocument({ onClose, onSaved }: { onClose: () => void; onSaved: (logoChanged: boolean) => void }) {
  const toast = useToast();
  const { data } = useApi<any>('/api/documents?limit=300');
  const [q, setQ] = useState('');
  const [src, setSrc] = useState<{ name: string; url?: string; bytes?: ArrayBuffer } | null>(null);
  const [cv, setCv] = useState<HTMLCanvasElement | null>(null); const [img, setImg] = useState<string | null>(null);
  const [top, setTop] = useState(0.14); const [bottom, setBottom] = useState(0.92);
  const [useTop, setUseTop] = useState(true); const [useBottom, setUseBottom] = useState(true);
  const [logo, setLogo] = useState<{ x: number; y: number; w: number; h: number } | null>(null); const [logoPv, setLogoPv] = useState<string | null>(null); const [takeLogo, setTakeLogo] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfs = useMemo(() => (data?.documents || []).filter((d: any) => (d.mime_type === 'application/pdf' || /\.pdf$/i.test(d.name)) && d.storage_path).filter((d: any) => !q || d.name.toLowerCase().includes(q.toLowerCase())), [data, q]);

  useEffect(() => {
    if (!src) return; let dead = false; setBusy('render'); setImg(null); setCv(null);
    (async () => {
      try {
        const p = await pdfjs();
        const doc = await p.getDocument(src.bytes ? { data: new Uint8Array(src.bytes) } : { url: src.url }).promise;
        const page = await doc.getPage(1); const v1 = page.getViewport({ scale: 1 });
        const scale = 1800 / v1.width; const vp = page.getViewport({ scale });
        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: g, viewport: vp }).promise;
        if (dead) return;
        const b = detectBands(c); setTop(b.top); setBottom(b.bottom); setUseTop(b.top > 0.02); setUseBottom(b.bottom < 0.98);
        setCv(c); setImg(c.toDataURL('image/jpeg', 0.85));
      } catch (e: any) { toast(e?.message || 'Could not open this PDF', 'error'); setSrc(null); } finally { if (!dead) setBusy(null); }
    })();
    return () => { dead = true; };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!cv || !useTop) { setLogo(null); setLogoPv(null); return; } const l = findLogo(cv, top); setLogo(l); if (l) crop(cv, l.x, l.y, l.w, l.h).then(b => setLogoPv(URL.createObjectURL(b))); else setLogoPv(null); }, [cv, top, useTop]);

  const pickDoc = async (d: any) => { try { const r = await api.get(`/api/documents/${d.id}/download`); if (r.external) throw new Error('This file is only a link — open it in Documents first so a copy is stored.'); setSrc({ name: d.name, url: r.url }); } catch (e: any) { toast(e.message, 'error'); } };
  const pickFile = async (f?: File | null) => { if (!f) return; if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { toast('Choose a PDF file', 'error'); return; } setSrc({ name: f.name, bytes: await f.arrayBuffer() }); };

  const save = async () => {
    if (!cv) return; setBusy('save');
    try {
      const fd = new FormData();
      if (useTop) fd.append('header', new File([await crop(cv, 0, 0, cv.width, cv.height * top)], 'header.png', { type: 'image/png' }));
      if (useBottom) fd.append('footer', new File([await crop(cv, 0, cv.height * bottom, cv.width, cv.height * (1 - bottom))], 'footer.png', { type: 'image/png' }));
      fd.append('source', src?.name || '');
      await api.post('/api/brand/letterhead', fd);
      let logoChanged = false;
      if (takeLogo && logo && useTop) {
        const lf = new FormData(); lf.append('file', new File([await crop(cv, logo.x, logo.y, logo.w, logo.h)], 'logo.png', { type: 'image/png' }));
        await api.post('/api/brand/logo', lf).then(() => { logoChanged = true; }).catch((e: any) => toast(`Letterhead saved, but the logo was not: ${e.message}`, 'error'));
      }
      toast('Letterhead saved — every PDF and Word file now uses it', 'success'); onSaved(logoChanged);
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };

  return <Modal open onClose={onClose} size="xl" title={src ? `Letterhead from “${src.name}”` : 'Take the letterhead from a document'}
    footer={src ? <><Button onClick={() => { setSrc(null); setCv(null); setImg(null); }}>Choose another</Button><span className="spacer" /><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Check size={15} />} loading={busy === 'save'} disabled={!cv || (!useTop && !useBottom)} onClick={save}>Use this letterhead</Button></> : <Button onClick={onClose}>Cancel</Button>}>
    {!src ? <div className="lhs-pick">
      <div className="lhs-pick-bar">
        <div className="input-icon"><Search size={15} /><input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search your PDFs — e.g. agreement, MOU, letter" autoComplete="off" /></div>
        <Button icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>PDF from this computer</Button>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => pickFile(e.target.files?.[0])} />
      </div>
      <p className="small muted">Choose any document that is printed on your letterhead. Only the top and bottom of its first page are used.</p>
      {!data ? <div className="muted small" style={{ padding: 20 }}>Loading your documents…</div> : !pdfs.length ? <Notice>No PDFs found{q ? ' for that search' : ' in Documents'}. Use “PDF from this computer”, or import the file from Google Drive first.</Notice>
        : <div className="lhs-list">{pdfs.slice(0, 80).map((d: any) => <button key={d.id} className="lhs-item" onClick={() => pickDoc(d)}><FileText size={16} /><span className="nm">{d.name}</span><span className="src">{d.source === 'google_drive' ? 'Google Drive' : d.project?.name || ''}</span></button>)}</div>}
    </div>
      : busy === 'render' || !img ? <div className="muted" style={{ padding: 40, textAlign: 'center' }}>Opening the first page…</div>
      : <div className="lhs-setup">
        <div className="lhs-shot">
          <img src={img} alt="First page" />
          {useTop && <div className="band top" style={{ height: `${top * 100}%` }}><span>Top of letterhead</span></div>}
          <div className="band body" style={{ top: `${useTop ? top * 100 : 0}%`, bottom: `${useBottom ? (1 - bottom) * 100 : 0}%` }}><span>Your document's text goes here</span></div>
          {useBottom && <div className="band bottom" style={{ height: `${(1 - bottom) * 100}%` }}><span>Bottom of letterhead</span></div>}
        </div>
        <div className="lhs-controls">
          <label className="check"><input type="checkbox" checked={useTop} onChange={e => setUseTop(e.target.checked)} /> Use the top</label>
          {useTop && <div className="lhs-range"><span>Top ends at</span><input type="range" min={0.03} max={0.4} step={0.002} value={top} onChange={e => setTop(Number(e.target.value))} /><b>{Math.round(top * 100)}%</b></div>}
          <label className="check"><input type="checkbox" checked={useBottom} onChange={e => setUseBottom(e.target.checked)} /> Use the bottom</label>
          {useBottom && <div className="lhs-range"><span>Bottom starts at</span><input type="range" min={0.6} max={0.98} step={0.002} value={bottom} onChange={e => setBottom(Number(e.target.value))} /><b>{Math.round(bottom * 100)}%</b></div>}
          <p className="tiny muted">The coloured bands show what will be copied. Move the sliders if part of the page's own text is inside them.</p>
          {useTop && <div className="lhs-logo"><div className="lhs-logo-h"><ImageIcon size={14} /> Company logo</div>
            {logoPv ? <><img src={logoPv} alt="Logo found on the letterhead" /><label className="check"><input type="checkbox" checked={takeLogo} onChange={e => setTakeLogo(e.target.checked)} /> Also use this as the company logo (menu, emails, designs)</label></> : <p className="tiny muted">No separate logo found at the top-left.</p>}
          </div>}
        </div>
      </div>}
  </Modal>;
}

/** "Writing style" — what the writer has learned about how the business writes. */
export function WritingStyleCard() {
  const toast = useToast();
  const { data, reload } = useApi<any>('/api/brand/style');
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const add = async () => { if (!text.trim()) return; setBusy(true); try { await api.post('/api/brand/style', { text }); setText(''); reload(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  const del = async (id: string) => { try { await api.del(`/api/brand/style?id=${id}`); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  const s = data?.samples || {}; const rules: any[] = data?.rules || [];
  return <Card title={<><FileText size={15} /> Writing style</>}>
    <p className="small muted" style={{ marginTop: 0 }}>The writer learns how you write: it studies your approved documents ({s.legal ?? 0} agreements, {s.letters ?? 0} letters, {s.marketing ?? 0} marketing pieces so far) and turns changes you ask for twice — or anything you say with “always” or “never” — into standing rules.</p>
    {rules.length ? <div className="style-rules">{rules.map(r => <div key={r.id} className="style-rule"><span>{r.text}</span><small>{r.source === 'learned' ? 'learned' : r.source === 'explicit' ? 'you said' : 'added'}</small><button className="icon-btn" aria-label="Remove rule" title="Remove" onClick={() => del(r.id)}><Trash2 size={14} /></button></div>)}</div>
      : <p className="small">No rules yet. They appear here as you draft.</p>}
    <div className="row mt12" style={{ gap: 8 }}><input className="input" style={{ flex: 1 }} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder='Add a rule — e.g. "Always sign letters as Managing Director"' /><Button loading={busy} onClick={add}>Add</Button></div>
  </Card>;
}
