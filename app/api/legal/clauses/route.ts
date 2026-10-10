import { NextRequest } from 'next/server';
import { route, ok, body, must, pick, HttpError } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { TOPICS } from '@/lib/legal/topics';

const CLAUSE_FIELDS = ['name', 'category', 'authority', 'clause_text', 'preferred_position', 'fallback_position', 'prohibited_position', 'keywords', 'notes', 'source_document_id'];

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  let q = getSupabaseAdmin().from('legal_clauses').select('*, approver:profiles!legal_clauses_approved_by_fkey(full_name), source:documents(id,name)').order('category').order('name');
  for (const k of ['category', 'authority', 'status']) if (sp.get(k)) q = q.eq(k, sp.get(k)!);
  const { data, error } = await q;
  if (error) throw error;
  return ok({ clauses: data || [], topics: Object.entries(TOPICS).map(([key, t]) => ({ key, label: t.label })) });
});

export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  must(b.name, 'Clause name is required'); must(b.category, 'Category is required');
  const row = pick(b, CLAUSE_FIELDS);
  if (row.authority && !['approved', 'preferred', 'fallback', 'historical_precedent', 'draft'].includes(row.authority)) throw new HttpError(400, 'Invalid authority');
  if (typeof row.keywords === 'string') row.keywords = row.keywords.split(',').map((s: string) => s.trim()).filter(Boolean);
  // New clauses always start unapproved, whatever authority they are proposed at.
  const { data, error } = await getSupabaseAdmin().from('legal_clauses').insert({ ...row, authority: row.authority || 'draft', status: 'draft', created_by: actor.id }).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'legal_clause.created', entityType: 'legal_clause', entityId: data.id, metadata: { name: data.name, authority: data.authority } });
  return ok({ clause: data }, 201);
});
