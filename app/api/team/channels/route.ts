import { NextRequest } from 'next/server';
import { route, ok, body, must } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('team_channels').select('id,slug,name,description,project_id,created_at').order('project_id', { nullsFirst: true }).order('name');
  if (error) throw error;
  const { data: last } = await db.from('team_messages').select('channel,created_at').order('created_at', { ascending: false }).limit(300);
  const latest: Record<string, string> = {};
  for (const m of last || []) if (!latest[m.channel]) latest[m.channel] = m.created_at;
  return ok({ channels: (data || []).map(c => ({ ...c, last_message_at: latest[c.slug] || null })) });
});

export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  const db = getSupabaseAdmin();
  if (b.project_id) {
    const { data: p } = await db.from('projects').select('id,name').eq('id', b.project_id).single();
    const slug = `project-${b.project_id}`;
    const { data, error } = await db.from('team_channels').upsert({ slug, name: p?.name || 'Project', description: 'Project channel', project_id: b.project_id, created_by: actor.id }, { onConflict: 'slug' }).select().single();
    if (error) throw error; return ok({ channel: data }, 201);
  }
  const name = must<string>(b.name, 'Channel name is required').trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `channel-${Date.now()}`;
  const { data, error } = await db.from('team_channels').insert({ slug, name, description: b.description || null, created_by: actor.id }).select().single();
  if (error) throw error;
  return ok({ channel: data }, 201);
});
