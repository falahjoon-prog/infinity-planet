import { NextRequest } from 'next/server';
import { route, ok, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { ingestDocument } from '@/lib/documents';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX = 50 * 1024 * 1024;
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const form = await req.formData();
  const files = form.getAll('file').filter((f): f is File => f instanceof File);
  if (!files.length) throw new HttpError(400, 'Choose at least one file');
  const projectId = String(form.get('project_id') || '').trim() || null;
  const dealId = String(form.get('deal_id') || '').trim() || null;
  const authority = String(form.get('authority') || 'draft');
  if (!['approved', 'preferred', 'fallback', 'historical_precedent', 'draft'].includes(authority)) throw new HttpError(400, 'Invalid authority');
  if (authority === 'approved' && !['admin', 'director', 'legal'].includes(actor.role)) throw new HttpError(403, 'Only admin, director or legal can upload a document as APPROVED');
  const category = String(form.get('category') || '').trim() || null;
  const results = [];
  for (const file of files) {
    if (file.size > MAX) { results.push({ name: file.name, error: 'File is larger than 50 MB' }); continue; }
    try {
      const r = await ingestDocument({ bytes: Buffer.from(await file.arrayBuffer()), name: file.name, mimeType: file.type || 'application/octet-stream', projectId, dealId, source: 'upload', authority, category, actorId: actor.id });
      await writeAudit({ actorId: actor.id, action: 'document.uploaded', entityType: 'document', entityId: r.document.id, metadata: { name: file.name, project_id: projectId, status: r.extraction.status, chunks: r.extraction.chunks } });
      results.push({ name: file.name, document: r.document, extraction: r.extraction });
    } catch (e: any) { results.push({ name: file.name, error: e?.message || 'Upload failed' }); }
  }
  const failed = results.filter(r => 'error' in r);
  return ok({ results, uploaded: results.length - failed.length, failed: failed.length }, failed.length === results.length ? 500 : 201);
});
