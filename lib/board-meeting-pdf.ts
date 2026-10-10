/**
 * Draws the WEEKLY BOARD MEETING RECORD as a branded A4 PDF (pdf-lib), laid out like the business's own paper minutes:
 * Meeting Information table, Agenda table, Decisions, New Action Items, Approval of Previous Minutes, Other Notes & Information
 * and Signatures — on the business letterhead (Settings → Business details / letterhead artwork).
 *
 * - Real bordered tables; long text wraps and rows grow. Content flows over as many pages as needed: a row that is too tall
 *   is split across pages, and the table's header row is repeated on the next page. Pages are numbered "Page x of y".
 * - Signatures: one block per signer with a blank signature line, "Name:" and "Date:". No names are printed — e-signing adds
 *   each person's signature, typed name and the date into their own block. The positions of those boxes are returned in
 *   `layout` (fractions of the page, top-left origin: the units the e-signing fields use).
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage, RGB } from 'pdf-lib';
import type { Letterhead } from './letterhead';
import { BOARD_TITLE, BoardRecord, BoardLayout, SignatureBlock, Box, formatMeetingDate, formatMeetingTime, boardRecordTitle } from './board-meeting';

const W = 595.28, H = 841.89, M = 50, CW = W - 2 * M;
const SIZE = 9.5, LEAD = 12.2, PADX = 5, PADT = 4.6, PADB = 4.6;

type C3 = { r: number; g: number; b: number };
const hex = (h: string | undefined, d: string): C3 => { const m = /^#?([0-9a-f]{6})$/i.exec(h || '') || /^#?([0-9a-f]{6})$/i.exec(d)!; const n = parseInt(m[1], 16); return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }; };
const solid = (c: C3) => rgb(c.r, c.g, c.b);
/** The colour mixed with white: t = 1 is the colour itself, t = 0.1 a pale tint. */
const tint = (c: C3, t: number) => rgb(1 - (1 - c.r) * t, 1 - (1 - c.g) * t, 1 - (1 - c.b) * t);
/** Keeps a brand colour readable as text on white (very light colours such as yellow are darkened). */
const readable = (c: C3) => { const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; if (l < 0.5) return c; const k = 0.45 / l; return { r: c.r * k, g: c.g * k, b: c.b * k }; };

/** Standard PDF fonts only cover Latin-1 (plus a few typographic characters) — anything else becomes "?". */
const clean = (s: string) => String(s || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/[‐‑−]/g, '-').replace(/[   ]/g, ' ').replace(/[●▪◦]/g, '•')
  .replace(/[^\n\x20-\x7e\xa1-\xff–—‘’“”•…€™]/g, '?');

/** Wraps text (paragraphs kept) to a width; words longer than the width are broken. */
export function wrapText(s: string, f: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of clean(s).split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) <= max) { line = next; continue; }
      if (line) out.push(line);
      let w = word;
      while (w.length > 1 && f.widthOfTextAtSize(w, size) > max) { let k = w.length - 1; while (k > 1 && f.widthOfTextAtSize(w.slice(0, k), size) > max) k--; out.push(w.slice(0, k)); w = w.slice(k); }
      line = w;
    }
    if (line) out.push(line);
  }
  while (out.length && !out[out.length - 1]) out.pop();
  while (out.length && !out[0]) out.shift();
  return out;
}

type Cell = { text?: string; bold?: boolean; italic?: boolean; color?: RGB; fill?: RGB; align?: 'left' | 'center'; span?: number; joinTop?: boolean; repeat?: boolean };
type Prepared = Cell & { x: number; w: number; f: PDFFont; lines: string[] };
type Table = { widths: number[]; header?: Cell[] };
const textH = (n: number) => SIZE * 1.02 + Math.max(0, n - 1) * LEAD;
const rowHeight = (n: number, minH = 0) => Math.max(minH, PADT + textH(Math.max(1, n)) + PADB);
const round = (v: number) => Math.round(v * 100000) / 100000;
/** A box given in PDF points (x from the left, yTop from the bottom of the page) → page fractions with a top-left origin. */
const frac = (x: number, yTop: number, w: number, h: number): Box => ({ x: round(x / W), y: round((H - yTop) / H), w: round(w / W), h: round(h / H) });

export async function renderBoardRecordPdf(rec: BoardRecord, lh: Letterhead): Promise<{ bytes: Buffer; layout: BoardLayout }> {
  const pdf = await PDFDocument.create();
  const docTitle = boardRecordTitle(rec);
  pdf.setTitle(docTitle); pdf.setAuthor(lh.businessName); pdf.setCreator('Infinity Planet'); pdf.setSubject(BOARD_TITLE);
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), ital = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const primaryC = hex(lh.primary, '#1148a5'), accentC = hex(lh.accent, '#f6cd00');
  const primary = solid(readable(primaryC)), accent = solid(accentC);
  const ink = rgb(0.1, 0.12, 0.16), grey = rgb(0.42, 0.45, 0.5), border = rgb(0.36, 0.39, 0.45), light = rgb(0.72, 0.75, 0.8);
  const headFill = tint(primaryC, 0.12), labelFill = rgb(0.955, 0.963, 0.976);

  // Letterhead: the business's own header/footer artwork when it has one, otherwise logo + name and a text footer.
  const art = lh.enabled ? lh.art : null;
  const embed = async (b: Buffer, mime = 'image/png'): Promise<PDFImage | null> => { try { return mime === 'image/jpeg' ? await pdf.embedJpg(b) : await pdf.embedPng(b); } catch { return null; } };
  const hdrImg = art?.header ? await embed(art.header.bytes) : null; const hdrH = hdrImg && art?.header ? W * art.header.height / art.header.width : 0;
  const ftrImg = art?.footer ? await embed(art.footer.bytes) : null; const ftrH = ftrImg && art?.footer ? W * art.footer.height / art.footer.width : 0;
  const logo = lh.enabled && !hdrImg && lh.logo && ['image/png', 'image/jpeg'].includes(lh.logo.mime) ? await embed(lh.logo.bytes, lh.logo.mime) : null;
  const headTop = hdrImg ? H - hdrH : lh.enabled ? H - 98 : H - 44;
  const bottom = ftrImg ? ftrH + 30 : lh.enabled ? 84 : 46;
  const contTop = headTop - 30; // where content starts on pages 2+ (below the running title)

  const pages: PDFPage[] = [];
  let page!: PDFPage; let y = 0;
  const meetingBits = [rec.meeting_no ? `Meeting No. ${rec.meeting_no}` : '', rec.date ? formatMeetingDate(rec.date) : ''].filter(Boolean).map(clean);
  const newPage = () => {
    page = pdf.addPage([W, H]); pages.push(page);
    if (pages.length === 1) { y = headTop; return; }
    // Running title on continuation pages
    const ty = headTop - 15; const t1 = BOARD_TITLE; page.drawText(t1, { x: M, y: ty, size: 8, font: bold, color: primary });
    if (meetingBits.length) page.drawText(`  ·  ${meetingBits.join('  ·  ')}`, { x: M + bold.widthOfTextAtSize(t1, 8), y: ty, size: 8, font, color: grey });
    page.drawLine({ start: { x: M, y: ty - 6 }, end: { x: W - M, y: ty - 6 }, thickness: 0.5, color: light });
    y = contTop;
  };
  newPage();

  // ---------------------------------------------------------------- title
  y -= 16;
  const ts = 18; page.drawText(BOARD_TITLE, { x: M, y: y - ts * 0.74, size: ts, font: bold, color: primary });
  y -= ts * 0.74 + 8;
  page.drawRectangle({ x: M, y: y - 2.4, width: 52, height: 2.4, color: accent });
  y -= 2.4 + 8;
  const sub = clean(['Board of Directors', ...meetingBits].join('   ·   '));
  page.drawText(sub, { x: M, y: y - 9 * 0.74, size: 9, font, color: grey });
  y -= 9 * 0.74 + 8;

  // ---------------------------------------------------------------- tables
  const prep = (t: Table, cells: Cell[]): Prepared[] => {
    const out: Prepared[] = []; let x = M; let ci = 0;
    for (const c of cells) {
      const span = Math.max(1, c.span || 1); const w = t.widths.slice(ci, ci + span).reduce((a, b) => a + b, 0); ci += span;
      const f = c.bold ? bold : c.italic ? ital : font;
      out.push({ ...c, x, w, f, lines: c.text ? wrapText(c.text, f, SIZE, w - 2 * PADX) : [] }); x += w;
    }
    return out;
  };
  let tableOpen: { t: Table; bottomY: number | null; firstOnPage: boolean } | null = null;
  const closeTable = () => {
    if (tableOpen?.bottomY != null) { const tw = tableOpen.t.widths.reduce((a, b) => a + b, 0); page.drawLine({ start: { x: M, y: tableOpen.bottomY }, end: { x: M + tw, y: tableOpen.bottomY }, thickness: 0.6, color: border }); }
    if (tableOpen) tableOpen.bottomY = null;
  };
  /** Draws lines [from, to) of a row's cells as one bordered row at y. */
  const drawSlice = (cells: Prepared[], from: number, to: number, h: number, cont: boolean) => {
    const top = y;
    for (const c of cells) if (c.fill) page.drawRectangle({ x: c.x, y: top - h, width: c.w, height: h, color: c.fill });
    for (const c of cells) {
      const ls = cont && c.repeat && from > 0 ? c.lines : c.lines.slice(from, to);
      const color = cont && c.repeat && from > 0 ? light : c.color || ink;
      ls.forEach((ln, i) => {
        if (!ln) return;
        const tw = c.f.widthOfTextAtSize(ln, SIZE);
        const x = c.align === 'center' ? c.x + (c.w - tw) / 2 : c.x + PADX;
        page.drawText(ln, { x, y: top - PADT - SIZE * 0.8 - i * LEAD, size: SIZE, font: c.f, color });
      });
    }
    const first = !!tableOpen?.firstOnPage;
    for (const c of cells) {
      if (!c.joinTop || first) page.drawLine({ start: { x: c.x, y: top }, end: { x: c.x + c.w, y: top }, thickness: 0.6, color: border });
      page.drawLine({ start: { x: c.x, y: top }, end: { x: c.x, y: top - h }, thickness: 0.6, color: border });
    }
    const last = cells[cells.length - 1];
    page.drawLine({ start: { x: last.x + last.w, y: top }, end: { x: last.x + last.w, y: top - h }, thickness: 0.6, color: border });
    y -= h;
    if (tableOpen) { tableOpen.bottomY = y; tableOpen.firstOnPage = false; }
  };
  const headerRow = (t: Table) => t.header ? prep(t, t.header.map(c => ({ bold: true, color: primary, fill: headFill, ...c }))) : null;
  const headerH = (t: Table) => { const hr = headerRow(t); return hr ? rowHeight(Math.max(...hr.map(c => c.lines.length))) : 0; };
  const startTable = (t: Table) => { tableOpen = { t, bottomY: null, firstOnPage: true }; const hr = headerRow(t); if (hr) drawSlice(hr, 0, 99, rowHeight(Math.max(...hr.map(c => c.lines.length))), false); };
  const breakPage = () => { const t = tableOpen!.t; closeTable(); newPage(); tableOpen = { t, bottomY: null, firstOnPage: true }; const hr = headerRow(t); if (hr) drawSlice(hr, 0, 99, rowHeight(Math.max(...hr.map(c => c.lines.length))), false); };
  const endTable = () => { closeTable(); tableOpen = null; };
  /** One table row; moves to the next page if it does not fit, or splits a tall row across pages. */
  const drawRow = (cells: Prepared[], minH = 0) => {
    const total = Math.max(1, ...cells.map(c => c.lines.length));
    let from = 0;
    for (let guard = 0; guard < 500; guard++) {
      const n = total - from; const need = rowHeight(n, from ? 0 : minH); const avail = y - bottom;
      if (need <= avail) { drawSlice(cells, from, total, need, from > 0); return; }
      const fresh = contTop - bottom - headerH(tableOpen!.t); // room on a new page, below the repeated header row
      const atTop = avail >= fresh - 0.5; // nothing above it on this page: moving on would not help
      // A row of normal height moves to the next page whole; a very tall one is split so it uses the space left here.
      if (!atTop && need <= fresh && need <= 150) { breakPage(); continue; }
      const k = Math.floor((avail - PADT - PADB - SIZE * 1.02) / LEAD) + 1; // lines that fit here
      if (k >= n) { if (!atTop) { breakPage(); continue; } drawSlice(cells, from, total, Math.min(need, avail), from > 0); return; }
      if (k < 3 && !atTop) { breakPage(); continue; }
      const kk = Math.max(1, k);
      drawSlice(cells, from, from + kk, rowHeight(kk), from > 0); from += kk;
      while (from < total && cells.every(c => !c.lines[from])) from++; // a paragraph gap does not start the next page
      if (from >= total) return;
      breakPage();
    }
  };
  /** Room for a heading plus the start of what follows; otherwise start a new page. */
  const heading = (t: string, keep: number) => {
    if (y - 30 - keep < bottom) newPage();
    y -= 13;
    page.drawRectangle({ x: M, y: y - 11, width: 3.2, height: 11.5, color: accent });
    page.drawText(clean(t), { x: M + 9, y: y - 9.4, size: 11, font: bold, color: primary });
    y -= 11 + 6;
  };
  const firstRowKeep = (t: Table, cells: Prepared[], minH = 0) => headerH(t) + rowHeight(Math.min(3, Math.max(1, ...cells.map(c => c.lines.length))), minH);

  // ---------------------------------------------------------------- Meeting Information
  {
    const t: Table = { widths: [86, 161.64, 86, 161.64] };
    const L = (text: string, extra: Partial<Cell> = {}): Cell => ({ text, bold: true, fill: labelFill, ...extra });
    const rows: Cell[][] = [
      [L('Date'), { text: rec.date ? formatMeetingDate(rec.date) : '' }, L('No of Meeting'), { text: rec.meeting_no, bold: true }],
      [L('Time'), { text: rec.time ? formatMeetingTime(rec.time) : '' }, L('Called By'), { text: rec.called_by }],
      [L('Location'), { text: rec.location }, L('Note Taker'), { text: rec.note_taker }],
    ];
    const att = rec.attendees.length ? rec.attendees : [''];
    for (let i = 0; i < att.length; i += 2) rows.push([L(i === 0 ? 'Attendees' : '', { joinTop: i > 0 }), { text: att[i] }, { text: att[i + 1] || '', span: 2 }]);
    rows.push([L('Guests'), { text: rec.guests }, L('Absents'), { text: rec.absents }]);
    const prepared = rows.map(r => prep(t, r));
    heading('Meeting Information', rowHeight(1) * 3);
    startTable(t);
    for (const r of prepared) drawRow(r);
    endTable();
  }

  // ---------------------------------------------------------------- Agenda
  {
    const t: Table = { widths: [26, CW - 26 - 92 - 82, 92, 82], header: [{ text: 'No', align: 'center' }, { text: 'Agenda Items' }, { text: 'Presenter' }, { text: 'Attachment' }] };
    const items = rec.agenda.length ? rec.agenda : Array.from({ length: 5 }, () => ({ text: '', presenter: '', attachment: '' }));
    const prepared = items.map((a, i) => prep(t, [{ text: String(i + 1), bold: true, align: 'center', repeat: true }, { text: a.text }, { text: a.presenter, bold: true }, { text: a.attachment }]));
    const minH = rec.agenda.length ? 0 : 28;
    heading('Agenda', firstRowKeep(t, prepared[0], minH));
    startTable(t);
    for (const r of prepared) drawRow(r, minH);
    endTable();
  }

  // ---------------------------------------------------------------- Decisions
  {
    const t: Table = { widths: [26, CW - 26], header: [{ text: 'No', align: 'center' }, { text: 'Decisions' }] };
    const items = rec.decisions.length ? rec.decisions : ['', '', ''];
    const prepared = items.map((d, i) => prep(t, [{ text: String(i + 1), bold: true, align: 'center', repeat: true }, { text: d }]));
    const minH = rec.decisions.length ? 0 : 22;
    heading('Decisions', firstRowKeep(t, prepared[0], minH));
    startTable(t);
    for (const r of prepared) drawRow(r, minH);
    endTable();
  }

  // ---------------------------------------------------------------- New Action Items
  {
    const t: Table = { widths: [26, CW - 26 - 104 - 80, 104, 80], header: [{ text: 'No', align: 'center' }, { text: 'New Action Items' }, { text: 'Responsible' }, { text: 'Due Date' }] };
    const items = rec.actions.length ? rec.actions : [{ action: '', responsible: '', due: '' }, { action: '', responsible: '', due: '' }, { action: '', responsible: '', due: '' }];
    const prepared = items.map((a, i) => prep(t, [{ text: String(i + 1), bold: true, align: 'center', repeat: true }, { text: a.action }, { text: a.responsible, bold: true }, { text: a.due ? formatMeetingDate(a.due, true) : '' }]));
    const minH = rec.actions.length ? 0 : 22;
    heading('New Action Items', firstRowKeep(t, prepared[0], minH));
    startTable(t);
    for (const r of prepared) drawRow(r, minH);
    endTable();
  }

  // ---------------------------------------------------------------- free-text sections
  for (const [title, body] of [['Approval of Previous Minutes', rec.previous_minutes], ['Other Notes & Information', rec.other_notes]] as const) {
    const t: Table = { widths: [CW] };
    const cells = prep(t, [{ text: body }]);
    const minH = body ? 0 : 40;
    heading(title, firstRowKeep(t, cells, minH));
    startTable(t);
    drawRow(cells, minH);
    endTable();
  }

  // ---------------------------------------------------------------- Signatures
  const blocks: SignatureBlock[] = [];
  {
    const n = Math.max(1, rec.signature_blocks || 1);
    const GAP = 16, BW = (CW - GAP) / 2, BH = 108, ROWGAP = 12;
    const statement = 'By signing below, each member confirms that this is a true and accurate record of the meeting.';
    heading('Signatures', 16 + BH);
    page.drawText(statement, { x: M, y: y - 8.5 * 0.74 - 1, size: 8.5, font: ital, color: grey });
    y -= 18;
    const block = (bx: number, top: number, idx: number) => {
      page.drawRectangle({ x: bx, y: top - BH, width: BW, height: BH, borderColor: light, borderWidth: 0.8 });
      page.drawRectangle({ x: bx, y: top - 2.2, width: BW, height: 2.2, color: tint(primaryC, 0.85) });
      page.drawText(`Signatory ${idx + 1}`, { x: bx + 12, y: top - 14, size: 7.5, font: bold, color: grey });
      const lx = bx + 12, rx = bx + BW - 12, fx = lx + 32;
      const sigY = top - 53, nameY = top - 78, dateY = top - 98;
      page.drawLine({ start: { x: lx, y: sigY }, end: { x: rx, y: sigY }, thickness: 0.8, color: ink });
      page.drawText('Signature', { x: lx, y: sigY - 9.5, size: 7.5, font, color: grey });
      page.drawText('Name:', { x: lx, y: nameY + 2.5, size: 9, font: bold, color: ink });
      page.drawLine({ start: { x: fx, y: nameY }, end: { x: rx, y: nameY }, thickness: 0.6, color: border });
      page.drawText('Date:', { x: lx, y: dateY + 2.5, size: 9, font: bold, color: ink });
      page.drawLine({ start: { x: fx, y: dateY }, end: { x: rx, y: dateY }, thickness: 0.6, color: border });
      // Where e-signing puts this person's signature (sits on the line), typed name and the date (on their lines).
      blocks[idx] = { page: pages.length - 1, signature: frac(lx, sigY + 36, 156, 39), name: frac(fx, nameY + 11, rx - fx, 14), date: frac(fx, dateY + 11, rx - fx, 14) };
    };
    for (let i = 0; i < n; i += 2) {
      if (y - BH < bottom) newPage();
      block(M, y, i);
      if (i + 1 < n) block(M + BW + GAP, y, i + 1);
      y -= BH + ROWGAP;
    }
  }

  // ---------------------------------------------------------------- letterhead, footer and page numbers on every page
  const footerLines = lh.enabled && !ftrImg && lh.footer ? lh.footer.split('\n').flatMap(l => wrapText(l, font, 7.5, CW)).slice(0, 3) : [];
  const footLabel = clean(docTitle);
  pages.forEach((p, i) => {
    if (hdrImg) p.drawImage(hdrImg, { x: 0, y: H - hdrH, width: W, height: hdrH });
    if (ftrImg) p.drawImage(ftrImg, { x: 0, y: 0, width: W, height: ftrH });
    if (lh.enabled && !hdrImg) {
      let x = M;
      if (logo) { const hh = 40; const ww = Math.min(170, logo.width * (hh / logo.height)); p.drawImage(logo, { x, y: H - 40 - hh, width: ww, height: hh }); x += ww + 14; }
      const name = clean(lh.businessName); const ns = 14;
      p.drawText(name, { x: logo ? W - M - bold.widthOfTextAtSize(name, ns) : x, y: H - 62, size: ns, font: bold, color: primary });
      const contact = clean([lh.phone, lh.email, lh.website].filter(Boolean).join('   |   '));
      if (contact) p.drawText(contact, { x: logo ? W - M - font.widthOfTextAtSize(contact, 7.8) : x, y: H - 77, size: 7.8, font, color: grey });
      p.drawRectangle({ x: M, y: H - 92, width: CW, height: 1.6, color: accent });
    }
    if (lh.enabled && !ftrImg) {
      p.drawRectangle({ x: M, y: 62, width: CW, height: 0.8, color: accent });
      footerLines.forEach((l, k) => p.drawText(l, { x: (W - font.widthOfTextAtSize(l, 7.5)) / 2, y: 50 - k * 10, size: 7.5, font, color: grey }));
    }
    const pn = `Page ${i + 1} of ${pages.length}`; const fy = ftrImg ? ftrH + 10 : lh.enabled ? 20 : 24;
    p.drawText(pn, { x: W - M - font.widthOfTextAtSize(pn, 8), y: fy, size: 8, font, color: grey });
    p.drawText(footLabel, { x: M, y: fy, size: 8, font, color: grey });
  });

  return { bytes: Buffer.from(await pdf.save()), layout: { pages: pages.length, blocks } };
}
