'use client';
import React, { useEffect, useRef, useState } from 'react';

let pdfjsP: Promise<any> | null = null;
function pdfjs() {
  if (!pdfjsP) pdfjsP = import('pdfjs-dist').then((m: any) => { m.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'; return m; });
  return pdfjsP;
}

/**
 * Renders every page of a PDF (from a URL) at the given width, with an overlay slot per page.
 * Overlay coordinates are page-relative fractions, so the same annotations work at any zoom.
 */
export function PdfPages({ url, width, overlay, onLoaded, onPageClick }: { url: string; width: number; overlay?: (page: number, size: { w: number; h: number; pw: number; ph: number }) => React.ReactNode; onLoaded?: (pages: number) => void; onPageClick?: (page: number, x: number, y: number, e: React.MouseEvent) => void }) {
  const [doc, setDoc] = useState<any>(null); const [err, setErr] = useState<string | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  useEffect(() => {
    let dead = false; setDoc(null); setErr(null);
    pdfjs().then(p => p.getDocument({ url, withCredentials: false }).promise).then(async (d: any) => {
      if (dead) return;
      const s: { w: number; h: number }[] = [];
      for (let i = 1; i <= d.numPages; i++) { const pg = await d.getPage(i); const v = pg.getViewport({ scale: 1 }); s.push({ w: v.width, h: v.height }); }
      setSizes(s); setDoc(d); onLoaded?.(d.numPages);
    }).catch((e: any) => !dead && setErr(e?.message || 'Could not open the PDF'));
    return () => { dead = true; };
  }, [url]);
  if (err) return <div className="notice error">{err}</div>;
  if (!doc) return <div className="muted small" style={{ padding: 30, textAlign: 'center' }}>Opening PDF…</div>;
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
    {sizes.map((s, i) => { const h = Math.round(width * s.h / s.w); return <div key={i} style={{ position: 'relative', width, height: h, boxShadow: '0 2px 10px rgba(0,0,0,.15)', background: '#fff' }}
      onClick={e => { if (!onPageClick) return; const b = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); onPageClick(i, (e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height, e); }}>
      <PageCanvas doc={doc} n={i + 1} width={width} height={h} />
      <div style={{ position: 'absolute', inset: 0 }}>{overlay?.(i, { w: width, h, pw: s.w, ph: s.h })}</div>
      <div className="tiny muted" style={{ position: 'absolute', bottom: -16, right: 0 }}>Page {i + 1} of {sizes.length}</div>
    </div>; })}
  </div>;
}

function PageCanvas({ doc, n, width, height }: { doc: any; n: number; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let task: any; let dead = false;
    doc.getPage(n).then((pg: any) => {
      if (dead || !ref.current) return;
      const base = pg.getViewport({ scale: 1 }); const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vp = pg.getViewport({ scale: (width / base.width) * dpr });
      const c = ref.current; c.width = vp.width; c.height = vp.height;
      task = pg.render({ canvasContext: c.getContext('2d'), viewport: vp }); task.promise.catch(() => {});
    });
    return () => { dead = true; try { task?.cancel(); } catch {} };
  }, [doc, n, width]);
  return <canvas ref={ref} style={{ width, height, display: 'block' }} />;
}
