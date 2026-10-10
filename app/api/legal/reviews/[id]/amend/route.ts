import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { chat, providerReady, Provider, PROVIDER_LABEL, resolveProvider } from '@/lib/providers';
import { aiInstructions, getBrand } from '@/lib/brand';
import { amendmentItems, applyAmendments, redline, redlineStats, AmendItem } from '@/lib/legal/amend';
import { reviewSource } from '@/lib/legal/amend-store';

/** Amendments available for this review, and whether the original text is on file. */
export const GET = route(async (req: NextRequest, { params }) => {
  await getActor(req);
  const { id } = await params;
  const { review, text } = await reviewSource(id);
  return ok({ items: amendmentItems(review.analysis as any), source_available: !!text, source_length: text.length, title: review.title });
});

/** Builds the amended contract and the redline. Body: items (chosen amendments), provider, instructions, text (original, if not on file). */
export const POST = route(async (req: NextRequest, { params }) => {
  await requireWriter(req);
  const { id } = await params;
  const b = await body(req);
  const { review, text: stored } = await reviewSource(id);
  const original = String(b.text || stored || '').trim();
  if (original.length < 80) throw new HttpError(400, 'The original contract text is not on file for this review — paste the contract text to amend it.');
  const all = amendmentItems(review.analysis as any);
  const chosen: AmendItem[] = Array.isArray(b.items) ? all.map(it => { const u = b.items.find((x: any) => x.key === it.key); return u ? { ...it, include: !!u.include, wording: typeof u.wording === 'string' ? u.wording.slice(0, 8000) : it.wording } : { ...it, include: false }; }) : all;
  const rules = applyAmendments(original, chosen);
  let amended = rules.text, engine = 'rules', note: string | undefined;
  const provider = b.provider && b.provider !== 'none' ? (b.provider === 'auto' ? await resolveProvider('auto') : String(b.provider)) : null;
  if (provider) {
    if (!providerReady(provider)) note = `${provider} is not configured, so the built-in engine applied the amendments.`;
    else {
      try {
        const B = await getBrand();
        const list = chosen.filter(c => c.include && c.wording.trim()).map((c, i) => `${i + 1}. ${c.title}${c.clause_ref ? ` (${c.clause_ref})` : ''}: ${c.wording.trim()}`).join('\n');
        const out = await chat(provider as Provider, { system: await aiInstructions(), maxTokens: 16000, timeoutMs: 180_000, messages: [{ role: 'user', content: `You are amending a contract for ${B.business_name} (${B.short_name}). Apply ONLY the amendments listed below to the contract. Keep everything else exactly as written (same clause numbering, headings, defined terms and formatting). Put each amendment in the most appropriate clause, adjusting cross-references and defined terms so it fits; add new clauses where needed, numbered consistently, before the execution/signing block. Do not add commentary, notes or markdown. Return ONLY the full amended contract text.${b.instructions ? `\nAdditional instructions: ${String(b.instructions).slice(0, 1000)}` : ''}\n\nAMENDMENTS:\n${list || '(none)'}\n\nCONTRACT:\n${original.slice(0, 120_000)}` }] });
        const t = out.replace(/^```[a-z]*\n?|```\s*$/g, '').trim();
        if (t.length > original.length * 0.5) { amended = t; engine = provider; } else note = `${PROVIDER_LABEL[provider as Provider]} returned an incomplete contract, so the built-in engine was used.`;
      } catch (e: any) { note = `${PROVIDER_LABEL[provider as Provider] || provider} failed (${String(e?.message || e).slice(0, 120)}), so the built-in engine applied the amendments.`; }
    }
  }
  const segments = redline(original, amended);
  return ok({ original, amended, changes: rules.changes, segments, stats: redlineStats(segments), engine, note, items: chosen });
});
