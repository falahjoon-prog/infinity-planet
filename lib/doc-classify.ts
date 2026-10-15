// Offline document sorter: reads the file name and the start of its text. No AI key needed.
const RULES: [string, RegExp[]][] = [
  ['sales_contract', [/contract of sale/i, /property sale contract/i, /\breiq\b/i, /\bpurchaser\b/i, /\bvendor\b/i, /settlement date/i, /deposit/i]],
  ['listing_agreement', [/appointment of (real estate )?agent/i, /agency agreement/i, /sales? authority/i, /listing agreement/i, /exclusive agency/i, /\bcommission\b/i]],
  ['offer', [/offer to purchase/i, /letter of offer/i, /expression of interest/i, /\boffer\b/i]],
  ['tenancy', [/tenancy agreement/i, /residential tenancy/i, /\blessor\b/i, /\blessee\b/i, /\bbond\b/i, /\btenant\b/i]],
  ['condition_report', [/condition report/i, /entry condition/i, /exit condition/i]],
  ['inspection', [/building (and|&) pest/i, /pest inspection/i, /building inspection/i, /termite/i]],
  ['disclosure', [/disclosure statement/i, /warning statement/i, /seller disclosure/i]],
  ['identity', [/driver'?s? licen[cs]e/i, /passport/i, /100 points?/i, /proof of identity/i, /\bmedicare\b/i]],
  ['finance', [/pre-?approval/i, /bank statement/i, /\binvoice\b/i, /\breceipt\b/i, /\bloan\b/i, /\bmortgage\b/i]],
  ['council_strata', [/council rates/i, /rates notice/i, /body corporate/i, /\bstrata\b/i, /town planning/i]],
  ['marketing', [/brochure/i, /floor ?plan/i, /listing sheet/i, /open home/i, /\bflyer\b/i]],
];
export function classifyDocument(name: string, text?: string | null): { category: string | null; confidence: 'high' | 'medium' | 'low'; reason: string } {
  const head = String(text || '').slice(0, 4000);
  // 1) an explicit form number in the file name or the heading: "Form 2", "Form 6", "Form 30c"
  const fm = /\bform[\s_-]*0?(\d{1,3}[a-z]?)\b/i.exec(name) || /\bform[\s_-]*0?(\d{1,3}[a-z]?)\b/i.exec(head.slice(0, 1500));
  if (fm) return { category: `form_${fm[1].toLowerCase()}`, confidence: 'high', reason: `Found "Form ${fm[1].toUpperCase()}"` };
  // 2) keyword score; the file name counts triple
  let best: [string, number] | null = null;
  for (const [cat, pats] of RULES) {
    let s = 0;
    for (const p of pats) { if (p.test(name)) s += 3; if (p.test(head)) s += 1; }
    if (s > 0 && (!best || s > best[1])) best = [cat, s];
  }
  if (!best || best[1] < 2) return { category: null, confidence: 'low', reason: 'No clear match' };
  return { category: best[0], confidence: best[1] >= 4 ? 'high' : 'medium', reason: 'Matched keywords' };
}
