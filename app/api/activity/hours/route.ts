import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { visibleUsers, weekStart, weekRange, isWeek, brisbaneDate, COUNTED, canDecideTime, signoffs, getTimeApproval, approversFor } from '@/lib/time';
export const dynamic = 'force-dynamic';

/**
 * Hours for one week (Monday–Sunday, Brisbane): actual app use (active minutes, not just signed in) plus
 * real-world time that counted (meetings, site visits, tasks…), time waiting for approval, by day and by part of the app.
 * Executives, HR and the time approver see everyone; managers see the people below them; everyone sees themself.
 */
export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const db = getSupabaseAdmin();
  const qw = req.nextUrl.searchParams.get('week');
  const week = isWeek(qw) ? weekStart(`${qw}T12:00:00+10:00`) : weekStart();
  const { from, to } = weekRange(week);
  const days = Array.from({ length: 7 }, (_, i) => new Date(new Date(`${week}T00:00:00Z`).getTime() + i * 864e5).toISOString().slice(0, 10));
  const vis = await visibleUsers(actor);

  // app minutes (paged: Supabase returns at most 1000 rows per request)
  const mins: { user_id: string; minute: string; area: string | null }[] = [];
  for (let page = 0; page < 60; page++) {
    const { data, error } = await db.from('activity_minutes').select('user_id,minute,area').in('user_id', vis.ids).gte('minute', from).lt('minute', to).order('minute').range(page * 1000, page * 1000 + 999);
    if (error) throw error; mins.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  const [{ data: logs, error: le }, { data: people }, signs, cfg] = await Promise.all([
    db.from('time_logs').select('user_id,status,counted_minutes,reported_minutes,occurred_on,kind').in('user_id', vis.ids).gte('occurred_on', days[0]).lte('occurred_on', days[6]),
    db.from('profiles').select('id,full_name,email,title,role,active,color').in('id', vis.ids),
    signoffs(), getTimeApproval(),
  ]);
  if (le) throw le;
  const name = (id: string) => { const p = (people || []).find((x: any) => x.id === id); return p ? (p.full_name || p.email) : null; };

  const members = await Promise.all((people || []).filter((p: any) => p.active !== false).map(async (p: any) => {
    const my = mins.filter(m => m.user_id === p.id);
    const myLogs = (logs || []).filter((l: any) => l.user_id === p.id);
    const byDay = days.map(d => ({ date: d, app: my.filter(m => brisbaneDate(m.minute) === d).length, real: myLogs.filter((l: any) => l.occurred_on === d && COUNTED.includes(l.status)).reduce((s: number, l: any) => s + l.counted_minutes, 0) }));
    const areas: Record<string, number> = {}; for (const m of my) { const a = m.area || 'other'; areas[a] = (areas[a] || 0) + 1; }
    const kinds: Record<string, number> = {}; for (const l of myLogs) if (COUNTED.includes(l.status)) kinds[l.kind] = (kinds[l.kind] || 0) + l.counted_minutes;
    const app = my.length, real = byDay.reduce((s, d) => s + d.real, 0);
    const pending = myLogs.filter((l: any) => l.status === 'pending_approval').reduce((s: number, l: any) => s + l.reported_minutes, 0);
    const so = signs[`${p.id}:${week}`] || null;
    const appr = await approversFor(p.id).catch(() => []);
    return { id: p.id, full_name: p.full_name, email: p.email, title: p.title, color: p.color, app_minutes: app, real_minutes: real, pending_minutes: pending, total_minutes: app + real, days: byDay, areas, kinds,
      active_days: byDay.filter(d => d.app + d.real > 0).length, first: my[0]?.minute || null, last: my[my.length - 1]?.minute || null,
      signoff: so ? { ...so, by_name: name(so.by) } : null, can_decide: await canDecideTime(actor, p.id), approver: appr[0] ? { id: appr[0], name: name(appr[0]) || null } : null };
  }));
  // approver names outside the visible list
  const missing = [...new Set(members.map(m => m.approver?.id).filter((id): id is string => !!id && !members.find(x => x.approver?.id === id && x.approver?.name)))];
  if (missing.length) { const { data } = await db.from('profiles').select('id,full_name,email').in('id', missing); for (const m of members) if (m.approver && !m.approver.name) { const p = (data || []).find((x: any) => x.id === m.approver!.id); if (p) m.approver.name = p.full_name || p.email; } }
  members.sort((a, b) => b.total_minutes - a.total_minutes);
  const { count: waiting } = await db.from('time_logs').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval').eq('approver_id', actor.id);
  return ok({ week, days, all: vis.all, members, approval: cfg, waiting_for_me: waiting || 0 });
});
