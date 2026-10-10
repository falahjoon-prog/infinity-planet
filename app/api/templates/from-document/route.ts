import { NextRequest } from 'next/server';
import { route, ok, body, must } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { templateFromDocument } from '@/lib/template-learn';
import { writeAudit } from '@/lib/audit';
export const maxDuration = 300;

/** Creates a draft template from one of your documents (e.g. an RHC MOU from Google Drive). */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  const r = await templateFromDocument(actor.id, { document_id: must(b.document_id, 'Choose a document'), name: b.name, provider: b.provider });
  await writeAudit({ actorId: actor.id, action: 'template.created_from_document', entityType: 'template', entityId: r.template.id, metadata: { document_id: b.document_id, engine: r.engine } });
  return ok(r, 201);
});
