/**
 * Pay and category helpers shared by the server and the browser (no server-only imports here).
 * PAYG withholding uses the ATO's "Schedule 1 – Statement of formulas for calculating amounts to be withheld"
 * (NAT 1004) for payments made from 1 July 2026, weekly coefficients:
 *   x = weekly earnings, ignoring cents, plus 99 cents;  y = a·x − b, rounded to the nearest dollar.
 * Super guarantee: 12% of ordinary-time earnings (from 1 July 2025). From 1 July 2026 super is paid with each pay ("payday super").
 */
// ------------------------------------------------------------------ PAYG withholding (weekly, from 1 July 2026)
type Row = [number, number, number]; // weekly earnings less than, a, b   (Infinity = "& over")
const SCALES: Record<string, Row[]> = {
  // Scale 1 — tax-free threshold not claimed
  '1': [[188, 0.15, 0.15], [371, 0.2084, 11.0185], [515, 0.179, 0.1066], [932, 0.3227, 74.1674], [2246, 0.32, 71.6508], [3303, 0.39, 228.8816], [Infinity, 0.47, 493.1893]],
  // Scale 2 — tax-free threshold claimed
  '2': [[362, 0, 0], [538, 0.15, 54.3462], [673, 0.25, 108.2135], [721, 0.17, 54.3473], [865, 0.179, 60.8377], [1282, 0.3227, 185.1935], [2596, 0.32, 181.7319], [3653, 0.39, 363.4627], [Infinity, 0.47, 655.7704]],
  // Scale 3 — foreign residents
  '3': [[2596, 0.3, 0.3], [3653, 0.37, 181.7308], [Infinity, 0.45, 474.0385]],
  // Scale 5 — full Medicare levy exemption
  '5': [[362, 0, 0], [721, 0.15, 54.3462], [865, 0.159, 60.8365], [1282, 0.3027, 185.1923], [2596, 0.3, 181.7308], [3653, 0.37, 363.4615], [Infinity, 0.45, 655.7692]],
  // Scale 6 — half Medicare levy exemption
  '6': [[362, 0, 0], [721, 0.15, 54.3462], [865, 0.159, 60.8365], [908, 0.3027, 185.1923], [1135, 0.3527, 230.6135], [1282, 0.3127, 185.1923], [2596, 0.31, 181.7308], [3653, 0.38, 363.4615], [Infinity, 0.46, 655.7692]],
};
export const TAX_SCALES: { value: string; label: string }[] = [
  { value: '2', label: 'Claims the tax-free threshold (most people, main job)' },
  { value: '1', label: 'Does not claim the tax-free threshold (second job)' },
  { value: '3', label: 'Foreign resident' },
  { value: '4', label: 'No tax file number given (47%)' },
  { value: '5', label: 'Full Medicare levy exemption' },
  { value: '6', label: 'Half Medicare levy exemption' },
];
export const SUPER_RATE = 12;
export const SCHEDULE_NOTE = 'PAYG: ATO Schedule 1 (NAT 1004), weekly formulas for payments from 1 July 2026. Super guarantee 12%.';

/** Tax to withhold from one week's pay, in whole dollars → cents. */
export function weeklyWithholdingCents(grossCents: number, scale: string): number {
  const dollars = Math.floor(Math.max(0, grossCents) / 100);
  if (dollars <= 0) return 0;
  if (scale === '4') return Math.floor(dollars * 0.47) * 100;
  const rows = SCALES[scale] || SCALES['2'];
  const x = dollars + 0.99;
  const row = rows.find(r => dollars < r[0]) || rows[rows.length - 1];
  const y = row[1] * x - row[2];
  return Math.max(0, Math.round(y)) * 100;
}

export type PaySetting = { profile_id: string; pay_type: 'employee' | 'contractor'; rate_type: 'hourly' | 'salary'; hourly_rate_cents: number; annual_salary_cents: number; salary_hours: number; tax_scale: string; super_rate: number; gst_registered: boolean; active: boolean };
export type PayCalc = { rate_cents: number; gross_cents: number; tax_cents: number; super_cents: number; gst_cents: number; net_cents: number };

/** One person's week: gross from hours × rate (or the weekly share of a salary), tax, super, GST and what they are paid. */
export function calcPay(s: PaySetting, hours: number): PayCalc {
  const h = Math.max(0, Number(hours) || 0);
  let rate = Number(s.hourly_rate_cents) || 0, gross = 0;
  if (s.rate_type === 'salary') {
    const weekly = Math.round((Number(s.annual_salary_cents) || 0) / 52);
    const std = Number(s.salary_hours) || 38;
    rate = Math.round(weekly / std);
    gross = h >= std || h === 0 ? weekly : Math.round(weekly * (h / std)); // salary: the full week unless fewer hours were worked
  } else gross = Math.round(rate * h);
  if (s.pay_type === 'contractor') {
    const gst = s.gst_registered ? Math.round(gross * 0.1) : 0;
    return { rate_cents: rate, gross_cents: gross, tax_cents: 0, super_cents: 0, gst_cents: gst, net_cents: gross + gst };
  }
  const tax = weeklyWithholdingCents(gross, s.tax_scale || '2');
  const sup = Math.round(gross * (Number(s.super_rate ?? SUPER_RATE) / 100));
  return { rate_cents: rate, gross_cents: gross, tax_cents: tax, super_cents: sup, gst_cents: 0, net_cents: gross - tax };
}

// ------------------------------------------------------------------ categories
export const INCOME_CATEGORIES = ['investor_capital', 'investor_loan', 'grant', 'sales', 'interest', 'refund', 'other_income'];
export const EXPENSE_CATEGORIES = ['consultancy', 'legal', 'accounting', 'engineering', 'architecture_design', 'planning_approvals', 'marketing', 'software', 'office_rent', 'utilities', 'travel', 'insurance', 'government_fees', 'wages', 'super', 'payg_withheld', 'bank_fees', 'other'];
export const CATEGORY_LABEL: Record<string, string> = {
  investor_capital: 'Investor capital', investor_loan: 'Investor loan', grant: 'Grant', sales: 'Sales', interest: 'Interest', refund: 'Refund', other_income: 'Other income',
  consultancy: 'Consultancy', legal: 'Legal', accounting: 'Accounting & tax', engineering: 'Engineering', architecture_design: 'Architecture & design', planning_approvals: 'Planning & approvals',
  marketing: 'Marketing', software: 'Software & IT', office_rent: 'Office & rent', utilities: 'Utilities & phone', travel: 'Travel', insurance: 'Insurance', government_fees: 'Government fees',
  wages: 'Wages', super: 'Superannuation', payg_withheld: 'PAYG withheld (to ATO)', bank_fees: 'Bank fees', other: 'Other',
};
