import { getSupabaseAdmin } from '../supabase';
import { HttpError } from '../http';
import { isProvider, providerStatus, Provider } from '../providers';
import { getSetting } from '../settings';
import { aiInstructions, getBrand } from '../brand';
import { writeAudit } from '../audit';
import { analyseAgreement, Authority, LegalAnalysis } from './engine';
import { enhanceWithAI } from './ai';

export type ReviewRequest = {
  document_id?: string | null; text?: string | null; title?: string | null; project_id?: string | null;
  provider?: string | null; rhc_role?: string | null; save?: boolean;
};

/** Runs the built-in rules engine, optionally deepened by AI, and persists a contract review. */
export async function runContractReview(actorId: string | null, req: ReviewRequest) {
  const db = getSupabaseAdmin();
  let text = String(req.text || '').trim();
  let title = req.title || null;
  let projectId = req.project_id || null;
  let authority: Authority = 'draft';
  if (req.document_id) {
    const { data, error } = await db.from('documents').select('id,name,content_text,project_id,authority,status').eq('id', req.document_id).single();
    if (error || !data) throw new HttpError(404, 'Document not found');
    if (!text) text = String(data.content_text || '').trim();
    title = title || data.name; projectId = projectId || data.project_id; authority = (data.authority || 'draft') as Authority;
    if (!text) throw new HttpError(400, data.status === 'needs_ocr' ? 'This document is scanned and has no text yet. Run OCR on it first (Documents → OCR).' : 'This document has no extracted text to review.');
  }
  if (!text) throw new HttpError(400, 'Paste agreement text or choose an indexed document');
  if (text.length < 80) throw new HttpError(400, 'The text is too short to be an agreement');

  const [rhcNames, home, instructions, brand] = await Promise.all([
    getSetting<string[]>('rhc_entity_names'), getSetting<string>('home_jurisdiction'), aiInstructions(), getBrand(),
  ]);
  const { data: library } = await db.from('legal_clauses').select('id,name,category,preferred_position,fallback_position,prohibited_position,status,authority,keywords');
  let analysis: LegalAnalysis = analyseAgreement({ text, rhcNames, rhcRole: req.rhc_role || null, homeJurisdiction: home, documentAuthority: authority, library: library || [], ourName: brand.short_name });
  let aiError: string | null = null;
  const provider = isProvider(req.provider) ? req.provider as Provider : null;
  if (provider) {
    const status = providerStatus();
    if (!status[provider]) aiError = `${provider} is not configured on the Infinity Planet server — built-in rules analysis only.`;
    else {
      try { analysis = await enhanceWithAI(provider, text, analysis, { rhcNames, rhcRole: req.rhc_role, home, library: library || [], instructions, ourName: brand.short_name, businessName: brand.business_name }); }
      catch (e: any) { aiError = e?.message || 'AI enhancement failed'; }
    }
  }
  if (req.save === false) return { review: null, analysis, ai_error: aiError };

  const row = {
    project_id: projectId, document_id: req.document_id || null, title: title || `${analysis.document_type} review`, provider: analysis.provider || null,
    engine: analysis.engine, status: 'under_review', risk_rating: analysis.overall_risk.rating, risk_score: analysis.overall_risk.score,
    analysis, ai_error: aiError,
    extracted_facts: { summary: analysis.executive_summary, parties: analysis.parties, key_terms: analysis.key_terms, source_text: req.document_id ? undefined : text.slice(0, 400_000) },
    risks: analysis.findings, recommendations: analysis.missing_protections, negotiation_points: analysis.negotiation_points,
    counsel_questions: analysis.solicitor_questions, raw_analysis: null, created_by: actorId,
  };
  const { data: review, error } = await db.from('contract_reviews').insert(row).select().single();
  if (error) throw new HttpError(500, error.message);
  if (req.document_id) await db.from('documents').update({ review_status: 'reviewed' }).eq('id', req.document_id).eq('review_status', 'unreviewed');
  if (projectId && ['High', 'Critical'].includes(analysis.overall_risk.rating)) {
    const { data: p } = await db.from('projects').select('risk').eq('id', projectId).single();
    const order = ['low', 'medium', 'high', 'critical'];
    const want = analysis.overall_risk.rating.toLowerCase();
    if (p && order.indexOf(want) > order.indexOf(p.risk)) await db.from('projects').update({ risk: want, updated_at: new Date().toISOString() }).eq('id', projectId);
  }
  await writeAudit({ actorId, action: 'contract_review.created', entityType: 'contract_review', entityId: review.id, metadata: { engine: analysis.engine, provider: analysis.provider, rating: analysis.overall_risk.rating, document_id: req.document_id || null } });
  return { review, analysis, ai_error: aiError };
}
