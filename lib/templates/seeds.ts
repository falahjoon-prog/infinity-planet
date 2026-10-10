/**
 * Starter templates. Seeded with status 'under_review' and system_seed=true:
 * they are NOT approved templates until an approver approves them. {{short}} / {{business}} are filled from Settings → Business details.
 * Fields in {{ }} are filled from project, deal and form data.
 */
export type SeedTemplate = { name: string; category: string; kind: 'document' | 'marketing'; description: string; fields: string[]; body: string };

const DRAFT_BANNER = 'DRAFT — SUBJECT TO REVIEW BY {{short}} AND ITS SOLICITORS. NOT FOR EXECUTION UNTIL APPROVED.';

export const DOCUMENT_TEMPLATES: SeedTemplate[] = [
  {
    name: 'Memorandum of Understanding (non-binding)', category: 'mou', kind: 'document',
    description: 'Non-binding MOU with binding confidentiality, exclusivity, costs and governing law clauses.',
    fields: ['rhc_entity', 'rhc_abn', 'counterparty', 'counterparty_abn', 'project_name', 'project_location', 'purpose', 'key_terms', 'exclusivity_days', 'sunset_date', 'governing_law', 'signatory_name', 'signatory_title'],
    body: `${DRAFT_BANNER}

MEMORANDUM OF UNDERSTANDING

Date: {{date}}

PARTIES
1. {{rhc_entity}}{{#rhc_abn}} (ABN {{rhc_abn}}){{/rhc_abn}} ({{short}})
2. {{counterparty}}{{#counterparty_abn}} (ABN {{counterparty_abn}}){{/counterparty_abn}} (Counterparty)

BACKGROUND
A. The parties wish to explore {{purpose}} in relation to {{project_name}}{{#project_location}} at {{project_location}}{{/project_location}} (Project).
B. This memorandum records the parties' current understanding of the principal terms on which they intend to negotiate.

1. NATURE OF THIS MEMORANDUM
1.1 Except for clauses 5 (Confidentiality), 6 (Exclusivity), 7 (Costs) and 8 (Governing Law), which are legally binding, this memorandum is not intended to create legal relations and is subject to the parties entering into formal agreements on terms acceptable to each of them.
1.2 Neither party is obliged to proceed with the Project or enter into any formal agreement.

2. PROPOSED TERMS
{{key_terms}}

3. CONDITIONS
Any formal agreement will be conditional on, among other things, satisfactory due diligence by {{short}}, {{short}} board approval, and any required finance, planning and regulatory approvals.

4. TIMETABLE
The parties will use reasonable endeavours to agree formal documents by {{sunset_date}}. If formal documents are not signed by that date, either party may end discussions by written notice.

5. CONFIDENTIALITY
{{clause:confidentiality|Each party must keep confidential the existence and terms of this memorandum and all information disclosed by the other party in connection with the Project, and may only use that information for the purpose of evaluating the Project. This obligation does not apply to information that is public (other than through breach), or disclosure required by law or to professional advisers and financiers bound by confidentiality. This clause survives termination for two years.}}

6. EXCLUSIVITY
For {{exclusivity_days}} days from the date of this memorandum, the Counterparty must not negotiate with any third party in relation to the Project. Exclusivity ends automatically on that date or earlier if either party ends discussions.

7. COSTS
{{clause:costs|Each party bears its own costs in connection with this memorandum and any negotiations, whether or not the Project proceeds.}}

8. GOVERNING LAW
{{clause:governing_law|This memorandum is governed by the laws of {{governing_law}} and each party submits to the non-exclusive jurisdiction of its courts.}}

SIGNED for and on behalf of {{rhc_entity}}
Name: {{signatory_name}}
Title: {{signatory_title}}
Signature: ______________________   Date: __________

SIGNED for and on behalf of {{counterparty}}
Name: ______________________
Signature: ______________________   Date: __________`,
  },
  {
    name: 'Heads of Agreement', category: 'heads_of_agreement', kind: 'document',
    description: 'Principal commercial terms prior to a formal contract; binding only as stated.',
    fields: ['rhc_entity', 'counterparty', 'project_name', 'project_location', 'transaction', 'consideration', 'deposit', 'conditions', 'sunset_date', 'governing_law', 'signatory_name', 'signatory_title'],
    body: `${DRAFT_BANNER}

HEADS OF AGREEMENT

Date: {{date}}
Project: {{project_name}}{{#project_location}}, {{project_location}}{{/project_location}}

PARTIES: {{rhc_entity}} ({{short}}) and {{counterparty}} (Counterparty)

1. TRANSACTION
{{transaction}}

2. CONSIDERATION
{{consideration}}
{{#deposit}}Deposit: {{deposit}}, to be held in trust by {{short}}'s nominated solicitor and refundable to the paying party if any condition in item 3 is not satisfied or waived.{{/deposit}}
All amounts are exclusive of GST unless stated otherwise.

3. CONDITIONS PRECEDENT
{{conditions}}
Each condition must be satisfied or waived by {{sunset_date}} (Sunset Date). If not, either party may terminate by notice.

4. FORMAL DOCUMENTATION
{{short}}'s solicitors will prepare the formal documents. The parties will negotiate in good faith to sign them within 30 days.

5. LIABILITY
{{clause:liability_cap|Each party's aggregate liability in connection with the transaction is limited to the amount of the Consideration, and neither party is liable for consequential or indirect loss, except in the case of fraud or wilful misconduct.}}

6. CONFIDENTIALITY
{{clause:confidentiality|Each party must keep these heads of agreement and all information exchanged confidential, except as required by law or to its advisers and financiers.}}

7. BINDING EFFECT
Only items 6, 7 and 8 are legally binding. The remaining items record the parties' intentions and are subject to formal contract.

8. GOVERNING LAW
{{clause:governing_law|These heads of agreement are governed by the laws of {{governing_law}}.}}

SIGNED for {{short}}: {{signatory_name}}, {{signatory_title}}   ______________________
SIGNED for Counterparty: ______________________`,
  },
  {
    name: 'Letter of Offer', category: 'offer', kind: 'document',
    description: 'Offer letter for a property or commercial transaction, subject to contract.',
    fields: ['recipient_name', 'counterparty', 'counterparty_address', 'project_name', 'project_location', 'offer_amount', 'deposit', 'settlement_days', 'conditions', 'validity_days', 'signatory_name', 'signatory_title', 'rhc_entity'],
    body: `${DRAFT_BANNER}

{{date}}

{{recipient_name}}
{{counterparty}}
{{counterparty_address}}

Dear {{recipient_name}},

LETTER OF OFFER — {{project_name}}{{#project_location}}, {{project_location}}{{/project_location}}

{{rhc_entity}} ({{short}}) is pleased to submit the following offer, subject to contract.

Offer price: {{offer_amount}} (exclusive of GST unless stated otherwise)
{{#deposit}}Deposit: {{deposit}}, payable into the trust account of {{short}}'s solicitors on exchange of a formal contract{{/deposit}}
Settlement: {{settlement_days}} days after the contract becomes unconditional

Conditions:
{{conditions}}

This offer is not binding on either party until a formal contract is signed and exchanged by both parties. {{short}} may withdraw this offer at any time before exchange. This offer lapses if not accepted in writing within {{validity_days}} days of the date of this letter.

Yours sincerely,

{{signatory_name}}
{{signatory_title}}
{{rhc_entity}}`,
  },
  {
    name: 'Commercial Proposal', category: 'proposal', kind: 'document',
    description: 'Structured proposal to a partner, investor or client.',
    fields: ['recipient_name', 'counterparty', 'project_name', 'project_description', 'proposal', 'benefits', 'commercials', 'next_steps', 'signatory_name', 'signatory_title', 'rhc_entity'],
    body: `{{rhc_entity}}
COMMERCIAL PROPOSAL — {{project_name}}

Prepared for: {{recipient_name}}, {{counterparty}}
Date: {{date}}

1. OVERVIEW
{{project_description}}

2. PROPOSAL
{{proposal}}

3. BENEFITS
{{benefits}}

4. COMMERCIAL TERMS
{{commercials}}
All amounts are exclusive of GST. This proposal is indicative only and subject to due diligence, internal approvals and formal documentation.

5. NEXT STEPS
{{next_steps}}

{{signatory_name}}
{{signatory_title}}, {{rhc_entity}}

Confidential — prepared for the named recipient only.`,
  },
  {
    name: 'Project Correspondence', category: 'correspondence', kind: 'document',
    description: 'Formal project letter to a consultant, authority, contractor or partner.',
    fields: ['recipient_name', 'counterparty', 'counterparty_address', 'project_name', 'subject', 'body_points', 'signatory_name', 'signatory_title', 'rhc_entity'],
    body: `{{date}}

{{recipient_name}}
{{counterparty}}
{{counterparty_address}}

Dear {{recipient_name}},

RE: {{project_name}} — {{subject}}

{{body_points}}

Please contact the undersigned if you have any questions.

Yours faithfully,

{{signatory_name}}
{{signatory_title}}
{{rhc_entity}}`,
  },
  {
    name: 'General Business Letter', category: 'letter', kind: 'document',
    description: 'Plain business letter on company letterhead.',
    fields: ['recipient_name', 'counterparty', 'subject', 'body_points', 'signatory_name', 'signatory_title', 'rhc_entity'],
    body: `{{date}}

{{recipient_name}}
{{counterparty}}

Dear {{recipient_name}},

{{subject}}

{{body_points}}

Kind regards,

{{signatory_name}}
{{signatory_title}}
{{rhc_entity}}`,
  },
  {
    name: 'Services / Consultancy Agreement', category: 'contract', kind: 'document',
    description: 'Business-favourable services contract with capped liability, termination and IP clauses.',
    fields: ['rhc_entity', 'rhc_abn', 'counterparty', 'counterparty_abn', 'project_name', 'scope', 'fee', 'payment_terms', 'term', 'governing_law', 'signatory_name', 'signatory_title'],
    body: `${DRAFT_BANNER}

SERVICES AGREEMENT

Date: {{date}}

PARTIES
{{rhc_entity}}{{#rhc_abn}} (ABN {{rhc_abn}}){{/rhc_abn}} ({{short}})
{{counterparty}}{{#counterparty_abn}} (ABN {{counterparty_abn}}){{/counterparty_abn}} (Consultant)

1. SERVICES
1.1 The Consultant must provide the following services for {{project_name}} (Services): {{scope}}
1.2 The Consultant must perform the Services with due care and skill, in accordance with law and {{short}}'s reasonable directions.

2. TERM
This agreement starts on the date above and continues for {{term}} unless terminated earlier.

3. FEES AND PAYMENT
3.1 {{short}} will pay the Consultant {{fee}} (exclusive of GST).
3.2 {{payment_terms}}
3.3 {{clause:gst|If GST is payable on a supply under this agreement, the recipient must pay an additional amount equal to the GST on receipt of a valid tax invoice.}}

4. INTELLECTUAL PROPERTY
{{clause:ip|All intellectual property created in performing the Services vests in {{short}} on creation. The Consultant grants {{short}} an irrevocable licence to use any pre-existing material incorporated in the deliverables.}}

5. INSURANCE
{{clause:insurance|The Consultant must maintain public liability insurance of at least $20 million and professional indemnity insurance of at least $5 million for the term and for six years after.}}

6. LIABILITY AND INDEMNITY
6.1 {{clause:liability_cap|{{short}}'s aggregate liability under this agreement is limited to the fees paid under it. Neither party is liable for consequential or indirect loss.}}
6.2 {{clause:indemnity|The Consultant indemnifies {{short}} against loss arising from the Consultant's breach of this agreement or negligent act or omission.}}

7. TERMINATION
7.1 {{short}} may terminate this agreement for convenience on 14 days' written notice, paying only for Services properly performed to the termination date.
7.2 Either party may terminate immediately by notice if the other commits a material breach not remedied within 14 days of notice, or suffers an insolvency event.

8. CONFIDENTIALITY
{{clause:confidentiality|The Consultant must keep confidential all {{short}} information and use it only to perform the Services.}}

9. DISPUTES
{{clause:dispute|The parties must try to resolve any dispute by senior-executive negotiation for 20 business days, then mediation, before starting court proceedings (except for urgent interlocutory relief).}}

10. FORCE MAJEURE
{{clause:force_majeure|Neither party is liable for delay or failure to perform caused by events beyond its reasonable control (excluding payment obligations), provided it notifies the other party promptly and uses reasonable endeavours to resume performance. If the event continues for more than 60 days, either party may terminate by notice.}}

11. GENERAL
11.1 Variations must be in writing signed by both parties.
11.2 The Consultant may not assign or subcontract without {{short}}'s prior written consent.
11.3 This agreement is the entire agreement between the parties about its subject matter.
11.4 {{clause:governing_law|This agreement is governed by the laws of {{governing_law}}.}}

EXECUTED as an agreement.
For {{rhc_entity}}: {{signatory_name}}, {{signatory_title}}   ______________________
For {{counterparty}}: ______________________`,
  },
  {
    name: 'Mutual Confidentiality Agreement', category: 'nda', kind: 'document',
    description: 'Mutual NDA for early project or investment discussions.',
    fields: ['rhc_entity', 'counterparty', 'project_name', 'purpose', 'governing_law', 'signatory_name', 'signatory_title'],
    body: `${DRAFT_BANNER}

MUTUAL CONFIDENTIALITY AGREEMENT

Date: {{date}}
Parties: {{rhc_entity}} ({{short}}) and {{counterparty}} (Counterparty)
Purpose: evaluating {{purpose}} in connection with {{project_name}} (Purpose)

1. Each party (Recipient) must keep confidential all information disclosed by the other party (Discloser) in connection with the Purpose and use it only for the Purpose.
2. The Recipient may disclose confidential information to its officers, employees, advisers and financiers who need to know it for the Purpose and are bound by confidentiality, and where required by law.
3. Confidential information does not include information that is public other than through breach, or that the Recipient already lawfully held.
4. On request, the Recipient must return or destroy the Discloser's confidential information, except as required to be retained by law.
5. These obligations continue for three years after the date of this agreement.
6. No licence or other right is granted, and neither party is obliged to proceed with any transaction.
7. {{clause:governing_law|This agreement is governed by the laws of {{governing_law}}.}}

For {{rhc_entity}}: {{signatory_name}}, {{signatory_title}}   ______________________
For {{counterparty}}: ______________________`,
  },
  {
    name: 'Project Status Report', category: 'report', kind: 'document',
    description: 'Status report built from live project records: tasks, deals, legal reviews and risks.',
    fields: ['project_name', 'report_period', 'summary', 'next_steps'],
    body: `{{rhc_entity}}
PROJECT STATUS REPORT — {{project_name}}

Date: {{date}}{{#report_period}}
Period: {{report_period}}{{/report_period}}
Prepared by: {{prepared_by}}

1. SNAPSHOT
Status: {{status_label}}
Location: {{project_location}}
Risk rating: {{project_risk}}{{#value}}
Deal value: {{value}}{{/value}}

2. SUMMARY
{{summary}}

3. OPEN WORK ({{open_task_count}} open, {{overdue_task_count}} overdue)
{{open_tasks_list}}

4. DEALS
{{deals_list}}

5. LEGAL REVIEWS
{{legal_reviews_list}}

6. NEXT STEPS
{{#next_steps}}{{next_steps}}{{/next_steps}}{{^next_steps}}{{next_action}}{{/next_steps}}

Confidential — internal {{short}} document. Figures are drawn from {{business}} records on the date above.`,
  },
];

const MKT_DISCLAIMER = 'This material is general information only and does not constitute an offer, financial product advice or a recommendation. Figures and details are subject to change and must be independently verified. {{rhc_entity}}.';

export const MARKETING_TEMPLATES: SeedTemplate[] = [
  { name: 'Investment Opportunity', category: 'investment', kind: 'marketing', description: 'Investor-facing summary of a project opportunity.', fields: [],
    body: `INVESTMENT OPPORTUNITY
{{project_name}}{{#location}} — {{location}}{{/location}}

{{#description}}{{description}}{{/description}}

{{#highlights_list}}Why this opportunity
{{highlights_list}}{{/highlights_list}}

{{#value}}Indicative project value: {{value}}{{/value}}
{{#project_type}}Asset class: {{project_type}}{{/project_type}}

Register your interest with {{contact_name}}{{#contact_email}} · {{contact_email}}{{/contact_email}}{{#contact_phone}} · {{contact_phone}}{{/contact_phone}}

${MKT_DISCLAIMER}` },
  { name: 'Project Launch Announcement', category: 'launch', kind: 'marketing', description: 'Announce a new project.', fields: [],
    body: `Introducing {{project_name}}

{{rhc_entity}} is proud to announce {{project_name}}{{#location}} in {{location}}{{/location}}.

{{#description}}{{description}}{{/description}}

{{#highlights_list}}{{highlights_list}}{{/highlights_list}}

For more information contact {{contact_name}}{{#contact_email}} at {{contact_email}}{{/contact_email}}.` },
  { name: 'Project Fact Sheet', category: 'fact_sheet', kind: 'marketing', description: 'One-page factual summary.', fields: [],
    body: `{{project_name}} — PROJECT FACT SHEET

{{#location}}Location: {{location}}{{/location}}
{{#project_type}}Type: {{project_type}}{{/project_type}}
{{#status_label}}Stage: {{status_label}}{{/status_label}}
{{#value}}Project value: {{value}}{{/value}}

Overview
{{#description}}{{description}}{{/description}}

{{#highlights_list}}Key features
{{highlights_list}}{{/highlights_list}}

Contact: {{contact_name}}{{#contact_email}} · {{contact_email}}{{/contact_email}}

${MKT_DISCLAIMER}` },
  { name: 'Expression of Interest Invitation', category: 'eoi', kind: 'marketing', description: 'Invite EOIs from buyers, tenants or partners.', fields: [],
    body: `EXPRESSIONS OF INTEREST INVITED
{{project_name}}{{#location}}, {{location}}{{/location}}

{{rhc_entity}} invites expressions of interest for {{project_name}}.

{{#description}}{{description}}{{/description}}

{{#highlights_list}}{{highlights_list}}{{/highlights_list}}

To submit an expression of interest, contact {{contact_name}}{{#contact_email}} at {{contact_email}}{{/contact_email}}.

Submitting an expression of interest does not create a binding obligation on any party.` },
  { name: 'Investor Update', category: 'investor_update', kind: 'marketing', description: 'Periodic update to investors and partners.', fields: [],
    body: `INVESTOR UPDATE — {{project_name}}
{{date}}

Current stage: {{status_label}}

{{#description}}{{description}}{{/description}}

{{#highlights_list}}Progress this period
{{highlights_list}}{{/highlights_list}}

{{#next_action}}Next milestone: {{next_action}}{{/next_action}}

Questions: {{contact_name}}{{#contact_email}} · {{contact_email}}{{/contact_email}}

Confidential — for the intended recipient only.` },
  { name: 'Milestone / Progress Update', category: 'milestone', kind: 'marketing', description: 'Celebrate a project milestone.', fields: [],
    body: `MILESTONE ACHIEVED — {{project_name}}

{{#milestone}}{{milestone}}{{/milestone}}{{^milestone}}{{project_name}} has reached a new stage: {{status_label}}.{{/milestone}}

{{#highlights_list}}{{highlights_list}}{{/highlights_list}}

Thank you to our partners and team. Follow {{rhc_entity}} for further updates.` },
  { name: 'Joint Venture Partner Invitation', category: 'jv', kind: 'marketing', description: 'Seek a capital or development partner.', fields: [],
    body: `PARTNERSHIP OPPORTUNITY
{{project_name}}{{#location}}, {{location}}{{/location}}

{{rhc_entity}} is seeking a joint venture partner for {{project_name}}.

{{#description}}{{description}}{{/description}}

{{#highlights_list}}What {{short}} brings
{{highlights_list}}{{/highlights_list}}

{{#value}}Indicative project value: {{value}}{{/value}}

Confidential discussions: {{contact_name}}{{#contact_email}} · {{contact_email}}{{/contact_email}}

${MKT_DISCLAIMER}` },
  { name: 'Leasing Opportunity', category: 'leasing', kind: 'marketing', description: 'Attract tenants or occupiers.', fields: [],
    body: `NOW LEASING
{{project_name}}{{#location}} · {{location}}{{/location}}

{{#description}}{{description}}{{/description}}

{{#highlights_list}}{{highlights_list}}{{/highlights_list}}

Leasing enquiries: {{contact_name}}{{#contact_phone}} · {{contact_phone}}{{/contact_phone}}{{#contact_email}} · {{contact_email}}{{/contact_email}}` },
  { name: 'Social Media Post Set', category: 'social', kind: 'marketing', description: 'Three short posts for LinkedIn / Instagram / Facebook.', fields: [],
    body: `LINKEDIN
{{rhc_entity}} — {{project_name}}{{#location}}, {{location}}{{/location}}. {{#description}}{{description}}{{/description}} Enquiries: {{contact_email}}

INSTAGRAM
{{project_name}}{{#location}} · {{location}}{{/location}}
{{#highlights_list}}{{highlights_list}}{{/highlights_list}}
#{{business_tag}} #{{hashtag}}

FACEBOOK
Introducing {{project_name}} by {{rhc_entity}}. {{#description}}{{description}}{{/description}} Contact {{contact_name}} to learn more.` },
  { name: 'Email Newsletter', category: 'newsletter', kind: 'marketing', description: 'Email-ready project newsletter.', fields: [],
    body: `Subject: {{project_name}} — latest from {{rhc_entity}}

Hello,

{{#description}}{{description}}{{/description}}

{{#highlights_list}}Highlights
{{highlights_list}}{{/highlights_list}}

{{#next_action}}What's next: {{next_action}}{{/next_action}}

Reply to this email or contact {{contact_name}}{{#contact_phone}} on {{contact_phone}}{{/contact_phone}}.

{{rhc_entity}}` },
  { name: 'Media Release', category: 'media', kind: 'marketing', description: 'Press release for media distribution.', fields: [],
    body: `MEDIA RELEASE
{{date}}

{{project_name}}{{#location}} — {{location}}{{/location}}

{{rhc_entity}} today announced {{project_name}}. {{#description}}{{description}}{{/description}}

{{#highlights_list}}{{highlights_list}}{{/highlights_list}}

Media contact: {{contact_name}}{{#contact_email}} · {{contact_email}}{{/contact_email}}{{#contact_phone}} · {{contact_phone}}{{/contact_phone}}

ENDS` },
];
