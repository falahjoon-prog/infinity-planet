import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

/** Cancel a signature request (the link stops working). */
export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  await getSupabaseAdmin().from('sign_requests').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id).in('status', ['sent', 'viewed']);
  await writeAudit({ actorId: actor.id, action: 'sign_request.cancelled', entityType: 'sign_request', entityId: id });
  return ok({ cancelled: true });
});
