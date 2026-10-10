import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { retrieveChunks } from '@/lib/retrieval';

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim();
  if (!q) return ok({ query: q, results: [] });
  const results = await retrieveChunks(q, { projectId: sp.get('project_id'), limit: Math.min(Number(sp.get('limit') || 15), 40) });
  return ok({ query: q, results });
});
