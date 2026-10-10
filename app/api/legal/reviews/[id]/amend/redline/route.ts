import { NextRequest, NextResponse } from 'next/server';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { route, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getBrand } from '@/lib/brand';
import { contentDisposition } from '@/lib/file-links';
import { redline } from '@/lib/legal/amend';
import { reviewSource } from '@/lib/legal/amend-store';
export const runtime = 'nodejs';

/** Word document showing the changes: insertions underlined in blue, deletions struck through in red (or a clean copy). */
export const POST = route(async (req: NextRequest, { params }) => {
  await getActor(req);
  const { id } = await params;
  const b = await body(req);
  const { review, text } = await reviewSource(id);
  const original = String(b.original || text || '');
  const amended = String(b.amended || '');
  if (!amended.trim()) throw new HttpError(400, 'Nothing to export');
  const B = await getBrand();
  const clean = b.clean === true;
  const segs = clean ? [{ t: 'same' as const, s: amended }] : redline(original, amended);
  // Split into paragraphs while keeping run styles
  const paras: Paragraph[] = [];
  let runs: TextRun[] = [];
  const flush = () => { paras.push(new Paragraph({ children: runs.length ? runs : [new TextRun('')], spacing: { after: 120 } })); runs = []; };
  for (const sg of segs) {
    const lines = sg.s.split('\n');
    lines.forEach((ln, i) => {
      if (i > 0) flush();
      if (ln) runs.push(new TextRun({ text: ln.replace(/\t/g, '    '), font: 'Calibri', size: 22, ...(sg.t === 'ins' ? { color: '1F5FBF', underline: {} } : sg.t === 'del' ? { color: 'C0392B', strike: true } : {}) }));
    });
  }
  flush();
  const header = [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: clean ? `${review.title || 'Contract'} — amended (clean)` : `${review.title || 'Contract'} — amendments marked up`, bold: true, size: 28, font: 'Calibri' })] }),
    new Paragraph({ children: [new TextRun({ text: clean ? `Prepared by ${B.business_name} with Infinity Planet Legal AI. Draft for review by the parties and their solicitors — not legal advice.` : `Prepared by ${B.business_name} with Infinity Planet Legal AI. Blue underlined = added, red struck-through = removed. Draft for review by the parties and their solicitors — not legal advice.`, italics: true, size: 18, color: '666666', font: 'Calibri' })], spacing: { after: 300 } })];
  const doc = new Document({ sections: [{ children: [...header, ...paras] }] });
  const buf = await Packer.toBuffer(doc);
  const safe = (review.title || 'Contract').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'Contract';
  return new NextResponse(new Uint8Array(buf), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'content-disposition': contentDisposition(`${safe} - ${clean ? 'amended clean' : 'redline'}.docx`, true) } });
});
