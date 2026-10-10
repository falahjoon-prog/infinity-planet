import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { generateFromTemplate } from '@/lib/generate';
export const maxDuration = 300;

/** Generate a document from a template (see lib/generate.ts). */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  return ok(await generateFromTemplate(actor.id, b), 201);
});
