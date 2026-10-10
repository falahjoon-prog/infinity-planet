import { getSupabaseAdmin } from './supabase';

/** Writes an audit event. Never throws — an audit failure must not break the business action, but it is logged. */
export async function writeAudit(input: { actorId?: string | null; action: string; entityType?: string; entityId?: string | null; metadata?: Record<string, unknown> }) {
  try {
    const { error } = await getSupabaseAdmin().from('audit_events').insert({
      actor_id: input.actorId || null,
      action: input.action,
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      metadata: input.metadata || {},
    });
    if (error) console.error('[audit] write failed:', error.message);
  } catch (e: any) { console.error('[audit] write failed:', e?.message); }
}
