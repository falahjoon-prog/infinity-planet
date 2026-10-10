import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { proposeBusinessDetails } from '@/lib/business-extract';
import { applyBusinessDetails } from '@/lib/business-apply';
export const runtime = 'nodejs';

/** Proposes business details read from your documents (incl. Google Drive files): legal name, ABN, ACN, address, phone, email, website, logo, colours. */
export const GET = route(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'director']);
  return ok(await proposeBusinessDetails());
});

/** Applies the details the admin chose. */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  return ok(await applyBusinessDetails(actor.id, await body(req)));
});
