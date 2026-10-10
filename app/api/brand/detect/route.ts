import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { brandBookDocs, extractBrandHints } from '@/lib/brand-book';

/** Reads brand colours and fonts from documents tagged as the brand book (rules only, no AI key). */
export const GET = route(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'director', 'marketing']);
  const docs = await brandBookDocs();
  const hints = extractBrandHints(docs.map(d => d.content_text || '').join('\n'));
  return ok({ documents: docs.map(d => ({ id: d.id, name: d.name })), ...hints });
});
