import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { route, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBrand, getBrandStyle } from '@/lib/brand';
import { writeAudit } from '@/lib/audit';
import { contentDisposition } from '@/lib/file-links';
export const runtime = 'nodejs';

type Col = { header: string; key: string; width?: number; fmt?: 'date' | 'datetime' | 'money' | 'pct' };
const d = (v: any) => (v ? new Date(v) : null);

const KINDS: Record<string, { title: string; cols: Col[]; load: (sp: URLSearchParams) => Promise<any[]> }> = {
  tasks: {
    title: 'Tasks',
    cols: [{ header: 'Task', key: 'title', width: 46 }, { header: 'Status', key: 'status', width: 14 }, { header: 'Priority', key: 'priority', width: 11 }, { header: 'Assigned to', key: 'assignee', width: 22 }, { header: 'Project', key: 'project', width: 28 }, { header: 'Due', key: 'due_at', width: 18, fmt: 'datetime' }, { header: 'Completed', key: 'completed_at', width: 18, fmt: 'datetime' }, { header: 'Description', key: 'description', width: 50 }],
    load: async sp => {
      let q = getSupabaseAdmin().from('tasks').select('title,status,priority,due_at,completed_at,description, project:projects(name), assignee:profiles!tasks_assigned_to_fkey(full_name)').order('due_at', { ascending: true, nullsFirst: false }).limit(5000);
      if (sp.get('project_id')) q = q.eq('project_id', sp.get('project_id')!);
      if (sp.get('open') === '1') q = q.neq('status', 'done');
      const { data, error } = await q; if (error) throw error;
      return (data || []).map((t: any) => ({ ...t, project: t.project?.name || '', assignee: t.assignee?.full_name || '', due_at: d(t.due_at), completed_at: d(t.completed_at) }));
    },
  },
  projects: {
    title: 'Projects',
    cols: [{ header: 'Project', key: 'name', width: 34 }, { header: 'Status', key: 'status', width: 15 }, { header: 'Risk', key: 'risk', width: 10 }, { header: 'Type', key: 'project_type', width: 16 }, { header: 'Location', key: 'location', width: 24 }, { header: 'Counterparty', key: 'counterparty', width: 24 }, { header: 'Value (AUD)', key: 'deal_value', width: 16, fmt: 'money' }, { header: 'Owner', key: 'owner', width: 20 }, { header: 'Next action', key: 'next_action', width: 40 }, { header: 'Updated', key: 'updated_at', width: 18, fmt: 'datetime' }],
    load: async () => {
      const { data, error } = await getSupabaseAdmin().from('projects').select('*, owner:profiles!projects_owner_id_fkey(full_name)').order('updated_at', { ascending: false }).limit(5000); if (error) throw error;
      return (data || []).map((p: any) => ({ ...p, owner: p.owner?.full_name || '', deal_value: p.deal_value != null ? Number(p.deal_value) : null, updated_at: d(p.updated_at) }));
    },
  },
  deals: {
    title: 'Deals',
    cols: [{ header: 'Deal', key: 'title', width: 32 }, { header: 'Counterparty', key: 'counterparty', width: 26 }, { header: 'Stage', key: 'stage', width: 15 }, { header: 'Value (AUD)', key: 'expected_value', width: 16, fmt: 'money' }, { header: 'Probability', key: 'probability', width: 12, fmt: 'pct' }, { header: 'Weighted (AUD)', key: 'weighted', width: 16, fmt: 'money' }, { header: 'Project', key: 'project', width: 26 }, { header: 'Contact', key: 'contact_name', width: 20 }, { header: 'Email', key: 'contact_email', width: 26 }, { header: 'Owner', key: 'owner', width: 20 }, { header: 'Updated', key: 'updated_at', width: 18, fmt: 'datetime' }],
    load: async () => {
      const { data, error } = await getSupabaseAdmin().from('deals').select('*, project:projects(name), owner:profiles!deals_owner_id_fkey(full_name)').order('updated_at', { ascending: false }).limit(5000); if (error) throw error;
      return (data || []).map((x: any) => { const v = x.expected_value != null ? Number(x.expected_value) : null; const p = x.probability != null ? Number(x.probability) / 100 : null; return { ...x, title: x.title || x.counterparty, project: x.project?.name || '', owner: x.owner?.full_name || '', expected_value: v, probability: p, weighted: v != null && p != null ? v * p : null, updated_at: d(x.updated_at) }; });
    },
  },
  contacts: {
    title: 'Contacts',
    cols: [{ header: 'Name', key: 'full_name', width: 26 }, { header: 'Position', key: 'position', width: 22 }, { header: 'Company', key: 'company', width: 26 }, { header: 'Email', key: 'email', width: 30 }, { header: 'Phone', key: 'phone', width: 18 }, { header: 'Project', key: 'project', width: 26 }, { header: 'Notes', key: 'notes', width: 40 }],
    load: async () => {
      const { data, error } = await getSupabaseAdmin().from('contacts').select('*, counterparty:counterparties(name), project:projects(name)').order('full_name').limit(5000); if (error) throw error;
      return (data || []).map((c: any) => ({ ...c, company: c.counterparty?.name || '', project: c.project?.name || '' }));
    },
  },
  legal: {
    title: 'Legal reviews',
    cols: [{ header: 'Review', key: 'title', width: 40 }, { header: 'Risk', key: 'risk_rating', width: 11 }, { header: 'Score', key: 'risk_score', width: 8 }, { header: 'Status', key: 'status', width: 18 }, { header: 'Engine', key: 'engine', width: 12 }, { header: 'Project', key: 'project', width: 26 }, { header: 'Created', key: 'created_at', width: 18, fmt: 'datetime' }],
    load: async () => {
      const { data, error } = await getSupabaseAdmin().from('contract_reviews').select('title,risk_rating,risk_score,status,engine,created_at, project:projects(name)').order('created_at', { ascending: false }).limit(5000); if (error) throw error;
      return (data || []).map((r: any) => ({ ...r, project: r.project?.name || '', created_at: d(r.created_at) }));
    },
  },
};

/** Excel (.xlsx) export of a list, styled in the business colours. GET /api/export/tasks|projects|deals|contacts|legal */
export const GET = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { kind } = await params;
  const def = KINDS[kind];
  if (!def) throw new HttpError(404, 'Unknown export');
  const [rows, brand, style] = await Promise.all([def.load(req.nextUrl.searchParams), getBrand(), getBrandStyle()]);
  const wb = new ExcelJS.Workbook();
  wb.creator = brand.business_name; wb.created = new Date();
  const ws = wb.addWorksheet(def.title, { views: [{ state: 'frozen', ySplit: 3 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const primary = (style.primary || '#13294b').replace('#', 'FF');
  ws.mergeCells(1, 1, 1, def.cols.length);
  ws.getCell(1, 1).value = `${brand.business_name} — ${def.title}`;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: primary } };
  ws.mergeCells(2, 1, 2, def.cols.length);
  ws.getCell(2, 1).value = `Exported ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} by ${actor.full_name || actor.email} · ${rows.length} row${rows.length === 1 ? '' : 's'}`;
  ws.getCell(2, 1).font = { size: 9, color: { argb: 'FF666666' } };
  const header = ws.getRow(3);
  def.cols.forEach((c, i) => {
    const cell = header.getCell(i + 1); cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
    cell.alignment = { vertical: 'middle' }; ws.getColumn(i + 1).width = c.width || 16;
    if (c.fmt === 'money') ws.getColumn(i + 1).numFmt = '"$"#,##0';
    if (c.fmt === 'pct') ws.getColumn(i + 1).numFmt = '0%';
    if (c.fmt === 'datetime') ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy hh:mm';
    if (c.fmt === 'date') ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy';
  });
  header.height = 20;
  for (const r of rows) ws.addRow(def.cols.map(c => { const v = r[c.key]; return v instanceof Date ? new Date(v.getTime() + 10 * 3600_000) : v ?? ''; }));
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: def.cols.length } };
  const buf = await wb.xlsx.writeBuffer();
  await writeAudit({ actorId: actor.id, action: 'export.excel', metadata: { kind, rows: rows.length } });
  const name = `${brand.short_name} ${def.title} ${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': contentDisposition(name, true) } });
});
