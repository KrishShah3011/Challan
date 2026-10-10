import { gstinProblem, isStateCode, normalizeGstin } from '../src/lib/gstin';
import { parseAmount } from '../src/lib/invoiceMath';
import { HSN_PATTERN } from '../src/lib/options';

export const SHEETS = {
  companies: { name: 'Companies', headers: ['Name', 'Address', 'GSTIN', 'State Code'] },
  items: { name: 'Items', headers: ['Name', 'Description', 'HSN', 'Unit', 'GST Rate', 'Default Price'] },
  charges: { name: 'Charges', headers: ['Name', 'GST Rate'] },
} as const;

export type SheetRow = Record<string, unknown>;
export interface CompanyIn {
  name: string;
  address: string;
  gstin: string | null;
  state_code: string;
}
export interface ItemIn {
  name: string;
  description: string;
  hsn: string;
  unit: string;
  gst_rate: string;
  default_price: string | null;
}
export interface ChargeIn {
  name: string;
  gst_rate: string;
}
export interface MastersResult {
  companies: CompanyIn[];
  items: ItemIn[];
  chargeTypes: ChargeIn[];
  errors: string[];
}

const cell = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());
const nameKey = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ');
const rateOf = (v: unknown): string | null => parseAmount(cell(v).replace(/%$/, ''), 'rate');

/** Checks every row (messages use Excel row numbers: header is row 1). Import nothing unless errors is empty. */
export function validateMasters(input: { companies: SheetRow[]; items: SheetRow[]; charges: SheetRow[] }): MastersResult {
  const errors: string[] = [];
  const problem = (sheet: string, index: number, msg: string) => errors.push(`${sheet} row ${index + 2}: ${msg}`);

  const seenCompanies = new Map<string, number>();
  const companies = input.companies.map((r, i): CompanyIn => {
    const name = cell(r.Name);
    const address = cell(r.Address);
    const gstin = normalizeGstin(cell(r.GSTIN));
    let state = cell(r['State Code']);
    if (state) state = state.padStart(2, '0');
    if (!name) problem('Companies', i, 'Name is empty.');
    if (!address) problem('Companies', i, 'Address is empty.');
    if (gstin) {
      const p = gstinProblem(gstin);
      if (p) problem('Companies', i, `GSTIN ${gstin}: ${p}`);
      else if (state && state !== gstin.slice(0, 2)) {
        problem('Companies', i, `State Code ${state} does not match the GSTIN, which starts with ${gstin.slice(0, 2)}.`);
      } else state = gstin.slice(0, 2);
    }
    if (!isStateCode(state)) problem('Companies', i, 'State Code is missing or not a GST state code (for example 24 for Gujarat).');
    const key = `${nameKey(name)}|${gstin}`;
    const first = seenCompanies.get(key);
    if (first !== undefined) problem('Companies', i, `Same name and GSTIN as row ${first + 2}.`);
    else seenCompanies.set(key, i);
    return { name, address, gstin: gstin || null, state_code: state };
  });

  const seenItems = new Map<string, number>();
  const items = input.items.map((r, i): ItemIn => {
    const name = cell(r.Name);
    const hsn = cell(r.HSN);
    const unit = cell(r.Unit);
    const gst = rateOf(r['GST Rate']);
    const priceText = cell(r['Default Price']).replace(/^₹\s*/, '');
    const price = priceText ? parseAmount(priceText, 'price') : null;
    if (!name) problem('Items', i, 'Name is empty.');
    if (!HSN_PATTERN.test(hsn)) {
      problem('Items', i, `HSN "${hsn}" must be 4, 6 or 8 digits. If it should start with 0, format the HSN column as Text in Excel and type it again.`);
    }
    const first = seenItems.get(nameKey(name));
    if (name && first !== undefined) problem('Items', i, `Same name as row ${first + 2}.`);
    else if (name) seenItems.set(nameKey(name), i);
    if (!unit) problem('Items', i, 'Unit is empty.');
    if (gst === null) problem('Items', i, `GST Rate "${cell(r['GST Rate'])}" must be a number from 0 to 100.`);
    if (priceText && price === null) problem('Items', i, `Default Price "${priceText}" is not a valid amount.`);
    return { name, description: cell(r.Description), hsn, unit, gst_rate: gst ?? '0', default_price: price };
  });

  const seenCharges = new Map<string, number>();
  const chargeTypes = input.charges.map((r, i): ChargeIn => {
    const name = cell(r.Name);
    const gst = rateOf(r['GST Rate']);
    if (!name) problem('Charges', i, 'Name is empty.');
    const first = seenCharges.get(nameKey(name));
    if (name && first !== undefined) problem('Charges', i, `Same name as row ${first + 2}.`);
    else if (name) seenCharges.set(nameKey(name), i);
    if (gst === null) problem('Charges', i, `GST Rate "${cell(r['GST Rate'])}" must be a number from 0 to 100.`);
    return { name, gst_rate: gst ?? '0' };
  });

  return { companies, items, chargeTypes, errors };
}
