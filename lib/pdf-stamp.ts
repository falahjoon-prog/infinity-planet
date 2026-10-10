/**
 * Applies edits to a PDF: signatures/stamps (images), text, dates, ticks, highlights, white-out boxes and lines.
 * Positions come from the in-app editor as fractions of the page (0–1, top-left origin), so they are
 * independent of zoom. The result is a new PDF; the original is never changed.
 */
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb, degrees, PDFPage } from 'pdf-lib';
import { HttpError } from './http';

export type Annot = {
  page: number; type: 'image' | 'text' | 'rect' | 'highlight' | 'check' | 'cross' | 'line';
  x: number; y: number; w: number; h: number;
  text?: string; size?: number; color?: string; image?: string; bold?: boolean;
};
const hex = (c?: string, d = '#111111') => { const m = /^#?([0-9a-f]{6})$/i.exec(c || d) || /^#?([0-9a-f]{6})$/i.exec(d)!; const n = parseInt(m[1], 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const clamp = (v: number) => Math.max(0, Math.min(1, Number(v) || 0));
export const sha256 = (b: Uint8Array | Buffer) => crypto.createHash('sha256').update(b).digest('hex');

/** Maps a box given in the page as displayed (rotation applied) to unrotated PDF user space. */
function place(p: PDFPage, a: Annot) {
  const { width: W, height: H } = p.getSize();
  const rot = ((p.getRotation().angle % 360) + 360) % 360;
  const x = clamp(a.x), y = clamp(a.y), w = clamp(a.w), h = clamp(a.h);
  if (rot === 90) return { X: (y) * W, Y: (x) * H, w: h * W, h: w * H, rot: 90 };
  if (rot === 180) return { X: (1 - x) * W, Y: (y) * H, w: w * W, h: h * H, rot: 180 };
  if (rot === 270) return { X: (1 - y) * W, Y: (1 - x) * H, w: h * W, h: w * H, rot: 270 };
  return { X: x * W, Y: H - (y + h) * H, w: w * W, h: h * H, rot: 0 };
}

export async function applyAnnotations(pdfBytes: Uint8Array, annots: Annot[], opts: { certificate?: string[] } = {}): Promise<Buffer> {
  let pdf: PDFDocument;
  try { pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: false }); }
  catch (e: any) { throw new HttpError(422, /encrypt/i.test(String(e?.message)) ? 'This PDF is password-protected, so it cannot be edited.' : 'This file could not be opened as a PDF.'); }
  const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  const imgCache = new Map<string, any>();
  for (const a of annots.slice(0, 500)) {
    const p = pages[a.page]; if (!p) continue;
    const { X, Y, w, h, rot } = place(p, a);
    const r = degrees(rot);
    const color = hex(a.color);
    if (a.type === 'image' && a.image) {
      let img = imgCache.get(a.image);
      if (!img) {
        const m = a.image.match(/^data:image\/(png|jpeg);base64,(.+)$/); if (!m) continue;
        const bytes = Buffer.from(m[2], 'base64');
        img = m[1] === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        imgCache.set(a.image, img);
      }
      p.drawImage(img, { x: X, y: Y, width: w, height: h, rotate: r });
    } else if (a.type === 'text' && a.text) {
      const f = a.bold ? bold : font;
      const size = Math.max(5, Math.min(72, Number(a.size) || 11));
      const lines = String(a.text).replace(/[^\x20-\x7E -ÿ\n]/g, '?').split('\n');
      lines.forEach((ln, i) => p.drawText(ln, { x: X + 1, y: Y + h - size * (i + 1) * 1.05 + size * 0.2, size, font: f, color, rotate: r }));
    } else if (a.type === 'rect') {
      p.drawRectangle({ x: X, y: Y, width: w, height: h, color: hex(a.color, '#ffffff'), rotate: r });
    } else if (a.type === 'highlight') {
      p.drawRectangle({ x: X, y: Y, width: w, height: h, color: hex(a.color, '#ffe066'), opacity: 0.38, rotate: r });
    } else if (a.type === 'line') {
      p.drawLine({ start: { x: X, y: Y + h / 2 }, end: { x: X + w, y: Y + h / 2 }, thickness: Math.max(0.6, h * 0.15), color });
    } else if (a.type === 'check' || a.type === 'cross') {
      const t = Math.max(1, Math.min(w, h) * 0.12);
      if (a.type === 'check') { p.drawLine({ start: { x: X + w * 0.12, y: Y + h * 0.5 }, end: { x: X + w * 0.42, y: Y + h * 0.18 }, thickness: t, color }); p.drawLine({ start: { x: X + w * 0.42, y: Y + h * 0.18 }, end: { x: X + w * 0.9, y: Y + h * 0.85 }, thickness: t, color }); }
      else { p.drawLine({ start: { x: X + w * 0.15, y: Y + h * 0.15 }, end: { x: X + w * 0.85, y: Y + h * 0.85 }, thickness: t, color }); p.drawLine({ start: { x: X + w * 0.15, y: Y + h * 0.85 }, end: { x: X + w * 0.85, y: Y + h * 0.15 }, thickness: t, color }); }
    }
  }
  if (opts.certificate?.length) {
    const p = pdf.addPage([595.28, 841.89]);
    let y = 780;
    p.drawText('Signing certificate', { x: 56, y, size: 18, font: bold, color: rgb(0.08, 0.16, 0.29) }); y -= 30;
    for (const ln of opts.certificate) {
      const parts = ln.match(/.{1,95}(\s|$)|.{1,95}/g) || [ln];
      for (const part of parts) { p.drawText(part.replace(/[^\x20-\x7E -ÿ]/g, '?'), { x: 56, y, size: 10, font, color: rgb(0.15, 0.17, 0.2) }); y -= 15; }
      y -= 3; if (y < 60) break;
    }
  }
  pdf.setModificationDate(new Date());
  return Buffer.from(await pdf.save());
}
