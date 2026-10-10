import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { signFileLink } from '@/lib/file-links';
import { ingestDocument } from '@/lib/documents';
import { writeAudit } from '@/lib/audit';
import { applyAnnotations, Annot } from '@/lib/pdf-stamp';
import { loadPdf, derivedName } from '@/lib/pdf-docs';
export const runtime = 'nodejs';

/** The PDF to open in the editor (short-lived link). */
export const GET = route(async (req: NextRequest, { params }) => {
  await getActor(req);
  const { id } = await params;
  const { doc } = await loadPdf(id);
  return ok({ document: { id: doc.id, name: doc.name, project_id: doc.project_id }, url: signFileLink({ k: 'storage', p: doc.storage_path, n: doc.name, m: 'application/pdf' }, 7200) });
});

/** Saves the edits (signatures, stamps, text, white-out…) as a NEW document; the original is kept. */
export const POST = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const b = await body(req);
  const annots: Annot[] = Array.isArray(b.annotations) ? b.annotations : [];
  if (!annots.length) throw new HttpError(400, 'Add a signature, text or another change first');
  const { doc, bytes } = await loadPdf(id);
  const out = await applyAnnotations(bytes, annots);
  const signed = annots.some(a => a.type === 'image');
  const name = String(b.name || derivedName(doc.name, signed ? 'signed' : 'edited')).slice(0, 180);
  const r = await ingestDocument({ bytes: out, name: /\.pdf$/i.test(name) ? name : `${name}.pdf`, mimeType: 'application/pdf', projectId: doc.project_id, dealId: doc.deal_id, source: 'upload', category: doc.category, actorId: actor.id, extraMeta: { edited_from: doc.id, edits: annots.length, signed } });
  await writeAudit({ actorId: actor.id, action: signed ? 'document.signed' : 'document.pdf_edited', entityType: 'document', entityId: r.document.id, metadata: { from: doc.id, edits: annots.length } });
  return ok({ document: r.document }, 201);
});
