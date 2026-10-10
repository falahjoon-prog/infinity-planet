import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { updateTemplateFromDocuments } from '@/lib/template-learn';
import { writeAudit } from '@/lib/audit';
export const maxDuration = 300;

/** Updates a template to follow your own documents' wording and structure. Saved as a new draft version (needs approval). */
export const POST = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const b = await body(req);
  const ids: string[] = Array.isArray(b.document_ids) ? b.document_ids.filter(Boolean) : [];
  if (!ids.length) throw new HttpError(400, 'Choose at least one of your documents to learn from');
  const r = await updateTemplateFromDocuments(actor.id, id, { document_ids: ids, provider: b.provider });
  await writeAudit({ actorId: actor.id, action: 'template.learned', entityType: 'template', entityId: id, metadata: { documents: r.learned_from, engine: r.engine } });
  return ok(r);
});
