// Document types shared by the Documents page (client) and the upload sorter (server). No server imports here.
export const DOC_CATEGORIES: [string, string][] = [
  ['brand_book', '★ Brand book'],
  ['sales_contract', 'Sales contract'], ['listing_agreement', 'Listing / appointment of agent'], ['offer', 'Offer'],
  ['tenancy', 'Tenancy agreement'], ['condition_report', 'Condition report'], ['inspection', 'Building & pest inspection'],
  ['disclosure', 'Disclosure / warning statement'], ['identity', 'Identification'], ['finance', 'Finance & invoices'],
  ['council_strata', 'Council / rates / body corporate'], ['marketing', 'Marketing & brochures'],
  ['agreement', 'Agreement'], ['mou', 'MOU'], ['contract', 'Contract'], ['correspondence', 'Correspondence'],
  ['financial', 'Financial'], ['planning', 'Planning'], ['design', 'Design'], ['due_diligence', 'Due diligence'],
  ['report', 'Report'], ['template', 'Template'], ['board_minutes', 'Board meeting record'],
];
// "form_2" -> "Form 2", "form_30c" -> "Form 30C"
export function categoryLabel(v?: string | null) {
  if (!v) return '';
  const m = /^form_(\d+[a-z]?)$/.exec(v);
  if (m) return `Form ${m[1].toUpperCase()}`;
  return DOC_CATEGORIES.find(([k]) => k === v)?.[1] || v.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}
