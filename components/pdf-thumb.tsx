'use client';
import React, { useEffect, useRef, useState } from 'react';

let pdfjsP: Promise<any> | null = null;
const pdfjs = () => (pdfjsP ||= import('pdfjs-dist').then((m: any) => { m.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'; return m; }));

/** First page of a PDF as a small picture; renders only when scrolled into view. */
export function PdfThumb({ url, width = 150 }: { url: string; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null); const box = useRef<HTMLDivElement>(null); const [state, setState] = useState<'wait' | 'ok' | 'err'>('wait');
  useEffect(() => {
    let dead = false;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      try {
        const p = await pdfjs(); const doc = await p.getDocument({ url }).promise; const pg = await doc.getPage(1);
        const base = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: (width * 2) / base.width });
        const c = ref.current; if (!c || dead) return; c.width = vp.width; c.height = vp.height;
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; if (!dead) setState('ok'); doc.destroy?.();
      } catch { if (!dead) setState('err'); }
    }, { rootMargin: '200px' });
    if (box.current) io.observe(box.current);
    return () => { dead = true; io.disconnect(); };
  }, [url, width]);
  return <div ref={box} style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
    <canvas ref={ref} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: state === 'ok' ? 'block' : 'none' }} />
    {state !== 'ok' && <span className="tiny muted">{state === 'err' ? 'PDF' : '…'}</span>}
  </div>;
}
