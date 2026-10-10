import { NextRequest } from 'next/server';
import { route, ok, body, must, pick } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

const DEAL_FIELDS = ['title', 'project_id', 'stage', 'probability', 'counterparty', 'counterparty_id', 'contact_name', 'contact_email', 'contact_phone', 'expected_value', 'next_action', 'next_action_at', 'owner_id', 'notes', 'lost_reason'];
const STAGE_PROBABILITY: Record<string, number> = { lead: 10, opportunity: 25, negotiation: 50, due_diligence: 65, contract: 85, completed: 100, lost: 0 };

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  let q = getSupabaseAdmin().from('deals').select('*, project:projects(id,name), owner:profiles!deals_owner_id_fkey(full_name)').order('updated_at', { ascending: false });
  if (sp.get('stage')) q = q.eq('stage', sp.get('stage')!);
  if (sp.get('project_id')) q = q.eq('project_id', sp.get('project_id')!);
  const { data, error } = await q;
  if (error) throw error;
  return ok({ deals: data || [] });
});

export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  const row = pick(b, DEAL_FIELDS);
  must(row.title || row.counterparty, 'A deal title or counterparty is required');
  row.stage = row.stage || 'lead';
  if (row.probability == null) row.probability = STAGE_PROBABILITY[row.stage] ?? 10;
  const db = getSupabaseAdmin();
  if (row.counterparty && !row.counterparty_id) {
    const { data: cp } = await db.from('counterparties').select('id').ilike('name', row.counterparty).maybeSingle();
    row.counterparty_id = cp?.id || (await db.from('counterparties').insert({ name: row.counterparty, created_by: actor.id }).select('id').single()).data?.id || null;
  }
  const { data, error } = await db.from('deals').insert({ ...row, owner_id: row.owner_id || actor.id }).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'deal.created', entityType: 'deal', entityId: data.id, metadata: { title: data.title, stage: data.stage, project_id: data.project_id } });
  return ok({ deal: data }, 201);
});
