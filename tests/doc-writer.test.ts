/** Document writer + letterhead layout (no network, no database). Run: npm run test:docs */
import { parseDoc, inline, pdfWithLetterhead, docxWithLetterhead, Letterhead } from '../lib/letterhead';
import { badOutput, tidyOutput, letterFrame, kindFor, salutation, preparedHeader } from '../lib/doc-writer';
import { readFileSync, writeFileSync } from 'fs';

let pass = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };

// --- parsing
const doc = parseDoc(`DRAFT — SUBJECT TO REVIEW BY RHC AND ITS SOLICITORS. NOT FOR EXECUTION UNTIL APPROVED.

# Services Agreement

## 1. DEFINITIONS AND INTERPRETATION
1.1 In this agreement:
(a) **Business Day** means a day that is not a Saturday;
(i) first roman item
- a bullet with **bold** words
A. The parties wish to proceed.
---
PARTIES
Plain paragraph.`);
const types = doc.map(b => b.t);
t('banner first', types[0] === 'banner');
t('title', types.includes('title'));
t('h2 markdown', doc.some(b => b.t === 'h2' && (b as any).segs[0].text.startsWith('1. DEFINITIONS')));
t('clause 1.1 item', doc.some(b => b.t === 'item' && (b as any).label === '1.1' && (b as any).level === 1));
t('(a) level 2', doc.some(b => b.t === 'item' && (b as any).label === '(a)' && (b as any).level === 2));
t('(i) level 3', doc.some(b => b.t === 'item' && (b as any).label === '(i)' && (b as any).level === 3));
t('bullet', doc.some(b => b.t === 'item' && (b as any).label === '•'));
t('recital A.', doc.some(b => b.t === 'item' && (b as any).label === 'A.'));
t('rule', types.includes('rule'));
t('caps heading', doc.some(b => b.t === 'h2' && (b as any).segs[0].text === 'PARTIES'));
t('inline bold', JSON.stringify(inline('a **b** c')) === JSON.stringify([{ text: 'a ' }, { text: 'b', bold: true }, { text: ' c' }]));
t('(h) then (i) stays a letter', (() => { const d = parseDoc('(h) eight\n(i) nine'); return (d[1] as any).level === 2; })());

// --- output checks
t('echo detected', badOutput('TEMPLATE STRUCTURE (filled with known facts): x'.repeat(50), 'marketing') === 'echoed the instructions');
t('short detected', badOutput('Hello world', 'marketing') === 'far too short');
t('good passes', badOutput('word '.repeat(400), 'marketing') === null);
t('json detected', badOutput('{"title": "x", "body": "y"}', 'letter') === 'returned data instead of a document');
t('tidy removes preamble', tidyOutput('Sure! Here is the document:\n\n# Title\nBody') === '# Title\nBody');
t('tidy fences', tidyOutput('```markdown\n# T\n```') === '# T');
t('tidy bullets', tidyOutput('* one\n• two') === '- one\n- two');

// --- kinds
t('kind legal', kindFor({ kind: 'document', category: 'mou', name: 'Memorandum' }) === 'legal');
t('kind letter', kindFor({ kind: 'document', category: 'letter', name: 'General Business Letter' }) === 'letter');
t('kind proposal', kindFor({ kind: 'document', category: 'proposal', name: 'Commercial Proposal' }) === 'proposal');
t('kind marketing', kindFor({ kind: 'marketing', category: 'investment', name: 'Investment Opportunity' }) === 'marketing');
t('kind social', kindFor({ kind: 'marketing', category: 'social', name: 'Social Media Post Set' }) === 'social');

// --- letters
t('salutation first name', salutation({ name: 'John Smith' }) === 'Dear John,');
t('salutation title', salutation({ name: 'Mr John Smith' }) === 'Dear Mr Smith,');
t('salutation none', salutation({}) === 'Dear Sir or Madam,');
const letter = letterFrame({ recipient: { name: 'John Smith', title: 'Director', company: 'Smith Group Pty Ltd', address: '1 Queen St, Brisbane QLD 4000' }, sender: { name: 'Falah Joon', title: 'Managing Director', company: 'RHC City Pty Ltd', email: 'falah@rhccity.com.au' }, subject: 'Riverside site', body: 'Thank you for meeting with us.', date: '9 October 2026' });
t('letter has recipient block', letter.includes('John Smith\nDirector\nSmith Group Pty Ltd\n1 Queen St'));
t('letter has Re line', letter.includes('**Re: Riverside site**'));
t('letter signs off with sender', /Yours sincerely,[\s\S]*Falah Joon\nManaging Director\nRHC City Pty Ltd/.test(letter));
t('prepared header', preparedHeader('Investment Opportunity', { name: 'Jane Doe', company: 'Acme' }, { name: 'Falah' }).includes('Prepared for: Jane Doe, Acme'));

// --- layout renders (written to OUT for a visual check)
(async () => {
  const OUT = process.env.DOC_OUT;
  let logo: Letterhead['logo'] = null;
  try { const b = readFileSync('public/icons/icon-256.png'); logo = { bytes: b, mime: 'image/png', width: 256, height: 256 }; } catch {}
  const lh: Letterhead = { businessName: 'RHC City', legalName: 'RHC City Pty Ltd', abn: '12 345 678 901', address: '1 Eagle St, Brisbane QLD 4000', phone: '07 3000 0000', email: 'info@rhccity.com.au', website: 'rhccity.com.au', footer: 'RHC City Pty Ltd  ·  ABN 12 345 678 901  ·  1 Eagle St, Brisbane QLD 4000', primary: '#13294b', accent: '#c8a45c', logo, enabled: true };
  const sample = readFileSync('tests/fixtures/sample-agreement.txt', 'utf8');
  const pdf = await pdfWithLetterhead('Services Agreement', sample, lh, { watermark: 'DRAFT' });
  t('pdf renders', pdf.length > 3000 && pdf.subarray(0, 5).toString() === '%PDF-');
  const pdf2 = await pdfWithLetterhead('Letter', letter, lh);
  t('letter pdf renders', pdf2.length > 2000);
  const docx = await docxWithLetterhead('Services Agreement', sample, lh);
  t('docx renders', docx.length > 3000 && docx.subarray(0, 2).toString() === 'PK');
  if (OUT) { writeFileSync(`${OUT}/agreement.pdf`, pdf); writeFileSync(`${OUT}/letter.pdf`, pdf2); writeFileSync(`${OUT}/agreement.docx`, docx); }
  console.log(`doc-writer: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
