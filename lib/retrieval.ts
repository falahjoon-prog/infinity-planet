import { getSupabaseAdmin } from './supabase';

export type Source = {
  citation: string;
  document_id: string;
  document_name: string;
  authority: string | null;
  chunk_id: string;
  ordinal: number;
  content: string;
  score: number;
};

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'what', 'are', 'was', 'from', 'have', 'has', 'which', 'about', 'into', 'our', 'their', 'there', 'please', 'tell', 'show', 'give', 'does', 'can', 'will', 'would', 'should', 'could']);
export function terms(q: string) {
  return [...new Set(q.toLowerCase().split(/[^a-z0-9$%.]+/i).map(x => x.replace(/^\.+|\.+$/g, '')).filter(x => x.length > 2 && !STOP.has(x)))].slice(0, 12);
}

/**
 * Retrieve the most relevant document chunks. Uses Postgres full-text search
 * (search_chunks RPC from migration 004) and falls back to keyword ILIKE so it
 * still works if the RPC is missing.
 */
export async function retrieveChunks(query: string, opts: { projectId?: string | null; documentIds?: string[]; limit?: number; prefix?: string } = {}): Promise<Source[]> {
  const db = getSupabaseAdmin();
  const limit = opts.limit || 8;
  const words = terms(query);
  if (!words.length && !opts.documentIds?.length) return [];
  let rows: any[] = [];
  const args = { q: words.join(' ') || query, p_project: opts.projectId || null, p_documents: opts.documentIds?.length ? opts.documentIds : null, lim: limit };
  if (words.length) {
    const strict = await db.rpc('search_chunks', args);
    if (!strict.error) {
      rows = strict.data || [];
      if (rows.length < limit) {
        const loose = await db.rpc('search_chunks_any', args);
        if (!loose.error) for (const r of loose.data || []) if (!rows.find(x => x.id === r.id)) rows.push(r);
      }
      rows = rows.map(r => ({ ...r, score: Number(r.rank) || 0 }));
    } else {
      // Fallback: keyword ILIKE scoring
      let q = db.from('document_chunks').select('id,document_id,project_id,ordinal,content').limit(200);
      if (opts.projectId) q = q.eq('project_id', opts.projectId);
      if (opts.documentIds?.length) q = q.in('document_id', opts.documentIds);
      q = q.or(words.slice(0, 6).map(w => `content.ilike.%${w.replace(/[%_,()]/g, ' ')}%`).join(','));
      const { data } = await q;
      rows = (data || []).map((c: any) => ({ ...c, score: words.reduce((n, w) => n + (c.content.toLowerCase().includes(w) ? 1 : 0), 0) })).filter((c: any) => c.score > 0);
    }
  }
  // When specific documents are attached but the query doesn't match, include their opening chunks.
  if (opts.documentIds?.length) {
    const missing = opts.documentIds.filter(id => !rows.some(r => r.document_id === id));
    if (missing.length) {
      const { data } = await db.from('document_chunks').select('id,document_id,project_id,ordinal,content').in('document_id', missing).lte('ordinal', 2).order('ordinal');
      rows.push(...(data || []).map((c: any) => ({ ...c, score: 0.01 })));
    }
  }
  rows.sort((a, b) => b.score - a.score);
  rows = rows.slice(0, limit + (opts.documentIds?.length || 0) * 2);
  const ids = [...new Set(rows.map(r => r.document_id))];
  const { data: docs } = ids.length ? await db.from('documents').select('id,name,authority').in('id', ids) : { data: [] as any[] };
  const map = new Map<string, any>((docs || []).map((d: any) => [d.id, d]));
  const prefix = opts.prefix || 'KB';
  return rows.map((c, i) => ({
    citation: `[${prefix}-${i + 1}]`, document_id: c.document_id, document_name: map.get(c.document_id)?.name || 'Unknown document',
    authority: map.get(c.document_id)?.authority || null, chunk_id: c.id, ordinal: c.ordinal, content: c.content, score: c.score,
  }));
}

export const AUTHORITY_LABEL: Record<string, string> = {
  approved: 'APPROVED', preferred: 'PREFERRED', fallback: 'FALLBACK', historical_precedent: 'HISTORICAL PRECEDENT', draft: 'DRAFT',
};

export function formatSources(sources: Source[]) {
  return sources.map(s => `${s.citation} ${s.document_name} — authority: ${AUTHORITY_LABEL[s.authority || 'draft'] || 'DRAFT'} (excerpt ${s.ordinal + 1})\n${s.content}`).join('\n\n');
}
