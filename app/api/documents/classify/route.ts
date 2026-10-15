import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { classifyDocument } from '@/lib/doc-classify';
export const dynamic = 'force-dynamic';

// Sort every document that has no category yet, using its name and text. Never overwrites a category someone set.
export const POST = route(async (req: NextRequest) => {
  await requireWriter(req);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('documents').select('id,name,content_text,metadata').is('category', null).limit(500);
  if (error) throw error;
  let sorted = 0;
  for (const d of data || []) {
    const r = classifyDocument(d.name, d.content_text);
    if (!r.category) continue;
    const metadata = { ...(d.metadata || {}), auto_category: { category: r.category, confidence: r.confidence, reason: r.reason } };
    const u = await db.from('documents').update({ category: r.category, metadata }).eq('id', d.id).is('category', null);
    if (!u.error) sorted++;
  }
  return ok({ checked: (data || []).length, sorted });
});
