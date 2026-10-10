// Regression tests for the built-in Legal AI rules engine.  Run: npm run test:legal
import fs from 'fs';
import path from 'path';
import { analyseAgreement } from '../lib/legal/engine';
import { renderTemplate } from '../lib/templates/render';
import { DOCUMENT_TEMPLATES } from '../lib/templates/seeds';

let pass = 0, fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.log('✗', m); } };

// 1. One-sided MOU — must be Critical with the key issues found
const mou = analyseAgreement({ text: fs.readFileSync(path.join(__dirname, 'fixtures/sample-mou.txt'), 'utf8'), homeJurisdiction: 'Queensland',
  library: [{ id: 'gl', name: 'Governing law', category: 'governing_law', preferred_position: 'This agreement is governed by the laws of Queensland and the parties submit to the courts of Queensland', status: 'approved', authority: 'approved' }] });
ok(mou.overall_risk.rating === 'Critical', 'MOU rated Critical');
ok(mou.document_type.includes('MOU'), 'MOU type detected');
ok(mou.parties.length === 2 && mou.parties[0].defined_as === 'Developer' && mou.rhc.identified, 'parties + RHC defined term');
for (const t of ['Broad indemnity given by RHC', 'Investor can terminate for convenience', 'Open-ended exclusivity binds RHC', 'Non-refundable deposit', 'Counterparty can vary the terms unilaterally', 'High default interest (18%)', 'Conditions have no sunset date'])
  ok(mou.findings.some(f => f.title === t), `finding: ${t}`);
ok(mou.findings.some(f => /Governing law is New South Wales/.test(f.title)), 'non-home governing law flagged');
ok(mou.missing_protections.some(m => m.label === 'Confidentiality'), 'missing confidentiality');
ok(mou.clause_comparisons[0].result === 'deviates' && mou.clause_comparisons[0].is_approved_position, 'approved QLD clause vs NSW → deviates');
ok(mou.findings.find(f => f.title === 'Broad indemnity given by RHC')?.clause_ref === 'cl 4', 'clause reference correct');

// 2. RHC-favourable services agreement (from RHC's own template) — must not be over-flagged
const t = DOCUMENT_TEMPLATES.find(x => x.category === 'contract')!;
const { text } = renderTemplate(t.body, { date: '1 October 2026', rhc_entity: 'RHC City Pty Ltd', rhc_abn: '12 345 678 901', counterparty: 'Apex Planning Consultants Pty Ltd', project_name: 'Fortitude Valley', scope: 'Preparation of a development application', fee: '$180,000', payment_terms: 'RHC will pay correctly rendered invoices within 30 days.', term: '12 months', governing_law: 'Queensland', signatory_name: 'F Owner', signatory_title: 'Director' }, [], { markMissing: false });
const fair = analyseAgreement({ text, rhcRole: 'RHC', homeJurisdiction: 'Queensland' });
ok(fair.overall_risk.rating === 'Low', `balanced agreement rated Low (got ${fair.overall_risk.rating} ${fair.overall_risk.score})`);
ok(!fair.findings.some(f => /exclusivity/i.test(f.title)), '"exclusive of GST" is not exclusivity');
ok(!fair.findings.some(f => /incomplete/i.test(f.title)), 'signature lines are not unresolved terms');

// 3. Authority handling
const prec = analyseAgreement({ text: fs.readFileSync(path.join(__dirname, 'fixtures/sample-mou.txt'), 'utf8'), documentAuthority: 'historical_precedent' });
ok(/HISTORICAL PRECEDENT/.test(prec.authority.note) && /NOT approved/.test(prec.authority.note), 'historical precedent never treated as approved');
const draftLib = analyseAgreement({ text: fs.readFileSync(path.join(__dirname, 'fixtures/sample-mou.txt'), 'utf8'), library: [{ id: 'x', name: 'Old clause', category: 'governing_law', preferred_position: 'laws of New South Wales', status: 'approved', authority: 'historical_precedent' }] });
ok(draftLib.clause_comparisons[0].is_approved_position === false, 'precedent clause in library is reference only even if status approved');

console.log(`Legal engine tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
