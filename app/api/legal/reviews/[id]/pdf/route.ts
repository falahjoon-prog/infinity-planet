import { NextRequest, NextResponse } from 'next/server';
import { route, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getLetterhead, pdfWithLetterhead } from '@/lib/letterhead';
import { contentDisposition } from '@/lib/file-links';
export const runtime = 'nodejs';

const H = (s: string) => s.toUpperCase();
/** The Legal AI review as a PDF on the business letterhead — downloads directly, no print dialog. */
export const GET = route(async (req: NextRequest, { params }) => {
  await getActor(req);
  const { id } = await params;
  const { data: r, error } = await getSupabaseAdmin().from('contract_reviews').select('*, project:projects(name)').eq('id', id).maybeSingle();
  if (error) throw error; if (!r) throw new HttpError(404, 'Review not found');
  const a: any = r.analysis || {};
  const out: string[] = [];
  const sec = (t: string, lines: string[]) => { const l = lines.filter(Boolean); if (!l.length) return; out.push('', H(t), ...l); };
  out.push(`Project: ${(r as any).project?.name || '—'}`, `Reviewed: ${new Date(r.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`, `Overall risk: ${a.overall_risk?.rating || r.risk_rating || '—'}${a.overall_risk?.score != null ? ` (${a.overall_risk.score}/100)` : ''}`);
  sec('Summary', [a.executive_summary || r.summary || '']);
  sec('Key terms', [`Document type: ${a.document_type || '—'}`, `Binding status: ${String(a.binding_status || '—').replace(/_/g, '-')}`, ...(a.key_terms || []).map((k: any) => `${k.label}: ${k.value}${k.clause_ref ? ` (${k.clause_ref})` : ''}`)]);
  sec('Parties', (a.parties || []).map((p: any) => `• ${p.name}${p.defined_as ? ` ("${p.defined_as}")` : ''}${p.is_rhc ? ' — us' : ''}`));
  sec('Risks', (a.findings || []).flatMap((f: any, i: number) => [`${i + 1}. ${f.title} — ${String(f.severity).toUpperCase()}${f.clause_ref ? ` (${f.clause_ref})` : ''}`, `   ${f.issue}`, `   Recommendation: ${f.recommendation}`, f.proposed_wording ? `   Proposed wording: ${f.proposed_wording}` : '', '']));
  sec('Missing protections', (a.missing_protections || []).flatMap((m: any) => [`• ${m.label} — ${String(m.severity).toUpperCase()}`, `   ${m.recommendation}`]));
  sec('Negotiation points', (a.negotiation_points || []).map((x: string) => `• ${x}`));
  sec('Conditions precedent', (a.conditions_precedent || []).map((c: any) => `• ${c.text}${c.clause_ref ? ` (${c.clause_ref})` : ''}`));
  sec('Due diligence', (a.due_diligence || []).map((d: any) => `• ${d.item} — ${d.reason}`));
  sec('Questions for the solicitor', (a.solicitor_questions || []).map((x: string) => `• ${x}`));
  out.push('', a.disclaimer || 'This analysis assists the business and its solicitors. It is not legal advice.');
  const lh = await getLetterhead();
  const title = `Legal review — ${r.title}`;
  const buf = await pdfWithLetterhead(title, out.join('\n'), lh);
  const safe = String(r.title || 'Legal review').replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'Legal review';
  return new NextResponse(new Uint8Array(buf), { headers: { 'content-type': 'application/pdf', 'content-disposition': contentDisposition(`${safe} - legal review.pdf`, true) } });
});
