import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { partyId, FIN_BUCKET, cleanEntry } from '@/lib/finance';

const SELECT = '*, party:finance_parties(id,name,kind,abn), project:projects(id,name)';

export const GET = route(async (req: NextRequest, { params }) => {
  await getActor(req); const { id } = await params;
  const { data, error } = await getSupabaseAdmin().from('finance_entries').select(SELECT).eq('id', id).single(); if (error) throw error;
  return ok({ entry: data });
});

export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req); const { id } = await params;
  const b = await body(req); const row = cleanEntry(b);
  if (b.party_name !== undefined && !b.party_id) { row.party_id = await partyId(b.party_name, b.party_kind || 'supplier', {}, actor.id); row.party_name = b.party_name || null; }
  if (b.status === 'paid' && !b.paid_date) row.paid_date = new Date().toISOString().slice(0, 10);
  const { data, error } = await getSupabaseAdmin().from('finance_entries').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select(SELECT).single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'finance.entry.updated', entityType: 'finance_entry', entityId: id, metadata: { fields: Object.keys(row) } });
  return ok({ entry: data });
});

export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req); const { id } = await params; const db = getSupabaseAdmin();
  const { data: old } = await db.from('finance_entries').select('file_path,total_cents,party_name').eq('id', id).maybeSingle();
  const { error } = await db.from('finance_entries').delete().eq('id', id); if (error) throw error;
  if (old?.file_path) await db.storage.from(FIN_BUCKET).remove([old.file_path]).catch(() => {});
  await writeAudit({ actorId: actor.id, action: 'finance.entry.deleted', entityType: 'finance_entry', entityId: id, metadata: { total_cents: old?.total_cents, party: old?.party_name } });
  return ok({ ok: true });
});
