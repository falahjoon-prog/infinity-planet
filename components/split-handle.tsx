'use client';
/**
 * Drag handle between two panes of a split screen (Gmail, Presentations, Writer, Assistant, Designer, Team Chat…).
 * Place it inside the grid container; it resizes the first (or last) column, remembers the size on this
 * device, double-click resets, and it hides itself when the screen is too narrow and the panes stack.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function SplitHandle({ id, edge = 'first', min = 240, max = 900, minOther = 360, cssVar: varName, needKids = 2, fold, foldLabel = 'list', rail }: { id: string; edge?: 'first' | 'last'; min?: number; max?: number; minOther?: number; cssVar?: string; needKids?: number; fold?: boolean; foldLabel?: string; rail?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<number | null>(null); const [drag, setDrag] = useState(false);
  const key = `ip-split-${id}`; const cssVar = varName || `--split-${id}`;
  const [folded, setFolded] = useState(false);
  // rail: instead of hiding, the pane shrinks to a slim strip of icons (e.g. the email list shows one avatar per email)
  const foldCls = (edge === 'first' ? 'split-folded-first' : 'split-folded-last');
  const railCls = (edge === 'first' ? 'split-rail-first' : 'split-rail-last');
  const applyFold = (f: boolean, save = true) => {
    const box = ref.current?.parentElement as HTMLElement | null; if (!box) return;
    box.classList.toggle(rail ? railCls : foldCls, f);
    if (f) box.style.setProperty(cssVar, `${rail || 0}px`);
    else { box.style.removeProperty(cssVar); try { const v = Number(localStorage.getItem(key)); if (v > 0) box.style.setProperty(cssVar, `${v}px`); } catch {} }
    setFolded(f); if (save) try { localStorage.setItem(`${key}-folded`, f ? '1' : '0'); } catch {}
    window.dispatchEvent(new Event('resize'));
  };
  const foldedRef = useRef(false); foldedRef.current = folded;
  // other parts of the page can fold / open the pane: window.dispatchEvent(new CustomEvent('ip-split-<id>', { detail: 'fold' | 'open' | 'toggle' }))
  useEffect(() => {
    if (!fold) return;
    const h = (e: Event) => { const d = (e as CustomEvent).detail; applyFold(d === 'toggle' ? !foldedRef.current : d === 'fold'); };
    window.addEventListener(`ip-split-${id}`, h); return () => window.removeEventListener(`ip-split-${id}`, h);
  }, [fold, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!fold) return; try { if (localStorage.getItem(`${key}-folded`) === '1') applyFold(true, false); } catch {} }, [fold, key]); // eslint-disable-line react-hooks/exhaustive-deps
  // restore and keep the handle on the column edge
  useEffect(() => {
    const h = ref.current; const box = h?.parentElement as HTMLElement | null; if (!h || !box) return;
    try { const v = Number(localStorage.getItem(key)); if (v > 0) box.style.setProperty(cssVar, `${v}px`); } catch {}
    const place = () => {
      const kids = Array.from(box.children).filter(c => c !== h && (c as HTMLElement).offsetParent !== null && getComputedStyle(c).position !== 'absolute' && getComputedStyle(c).position !== 'fixed') as HTMLElement[];
      if (kids.length < needKids) { setPos(null); return; }
      const b = box.getBoundingClientRect(); const z = b.width / (box.offsetWidth || b.width) || 1;
      const a = (edge === 'first' ? kids[0] : kids[kids.length - 1]).getBoundingClientRect();
      if (Math.abs(a.top - kids[edge === 'first' ? 1 : kids.length - 2].getBoundingClientRect().top) > 40 || a.width > b.width * 0.92) { setPos(null); return; } // stacked
      const nb = (edge === 'first' ? kids[1] : kids[kids.length - 2]).getBoundingClientRect();
      const mid = edge === 'first' ? (a.right + nb.left) / 2 : (nb.right + a.left) / 2;
      setPos((mid - b.left) / z);
    };
    place();
    const ro = new ResizeObserver(place); ro.observe(box); Array.from(box.children).forEach(c => ro.observe(c));
    window.addEventListener('resize', place);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); };
  }, [key, cssVar, edge, needKids]);
  const start = (e: React.PointerEvent) => {
    const h = ref.current; const box = h?.parentElement as HTMLElement | null; if (!h || !box || e.button !== 0) return;
    e.preventDefault();
    const b = box.getBoundingClientRect(); const z = b.width / (box.offsetWidth || b.width) || 1; const W = box.offsetWidth;
    const x0 = e.clientX; let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) < 5) return; // a click, not a drag (yet)
      if (!moved) { moved = true; setDrag(true); document.documentElement.classList.add('split-dragging'); }
      const x = (ev.clientX - b.left) / z;
      const px = Math.round(edge === 'first' ? x : W - x);
      // dragged well past the smallest size → snap down to the icon strip (or hide); drag back out to open it again
      if (fold && px < (rail ? (min + rail) / 2 : min / 2)) { if (!foldedRef.current) { applyFold(true, true); foldedRef.current = true; } return; }
      if (foldedRef.current) { box.classList.remove(railCls, foldCls); setFolded(false); foldedRef.current = false; try { localStorage.setItem(`${key}-folded`, '0'); } catch {} }
      const v = Math.max(min, Math.min(max, px, W - minOther));
      box.style.setProperty(cssVar, `${v}px`);
    };
    const up = () => {
      setDrag(false); document.documentElement.classList.remove('split-dragging'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (!moved) { if (fold) applyFold(!folded); return; }
      if (!foldedRef.current) try { const v = parseInt(box.style.getPropertyValue(cssVar)); if (v) localStorage.setItem(key, String(v)); } catch {} window.dispatchEvent(new Event('resize'));
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const reset = () => { if (fold) return; const box = ref.current?.parentElement as HTMLElement | null; box?.style.removeProperty(cssVar); try { localStorage.removeItem(key); } catch {} window.dispatchEvent(new Event('resize')); };
  const nudge = (e: React.KeyboardEvent) => { if (fold && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); applyFold(!folded); return; } if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; const box = ref.current?.parentElement as HTMLElement | null; if (!box) return; e.preventDefault(); const cur = parseInt(box.style.getPropertyValue(cssVar)) || (edge === 'first' ? (box.children[0] as HTMLElement).offsetWidth : (box.children[box.children.length - 2] as HTMLElement).offsetWidth); const d = (e.key === 'ArrowRight' ? 24 : -24) * (edge === 'first' ? 1 : -1); const v = Math.max(min, Math.min(max, cur + d)); box.style.setProperty(cssVar, `${v}px`); try { localStorage.setItem(key, String(v)); } catch {} };
  return <div ref={ref} className={`split-handle${drag ? ' on' : ''}${fold ? ' foldable' : ''}`} style={{ left: pos ?? 0, display: pos == null ? 'none' : undefined }} onPointerDown={start} onDoubleClick={reset} onKeyDown={nudge}
    role="separator" aria-orientation="vertical" aria-label="Drag to resize. Double-click to reset." title={fold ? (folded ? `Click to open the ${foldLabel} · drag to resize` : `Click to ${rail ? 'shrink' : 'hide'} the ${foldLabel}${rail ? ' to icons' : ''} · drag to resize`) : 'Drag to resize · double-click to reset'} tabIndex={0}><span />
    {fold && <span className="edge-arrow split-fold" aria-hidden="true">{(edge === 'first') !== folded ? <ChevronLeft size={16} strokeWidth={2.6} /> : <ChevronRight size={16} strokeWidth={2.6} />}</span>}</div>;
}
