import { fyOf, padSerial, parseSerial, todayLocal } from './fy';
import { gstinProblem, isStateCode, normalizeGstin } from './gstin';
import { computeTotals, D, parseAmount, plain, type Totals } from './invoiceMath';
import { HSN_PATTERN } from './options';
import type { ChargeType, Company, InvoiceFull, Item, SavePayload } from './types';

export interface LineForm {
  key: string;
  itemId: string | null;
  itemName: string;
  description: string;
  hsn: string;
  qty: string;
  unit: string;
  price: string;
  gstRate: string;
}

export interface ChargeForm {
  key: string;
  chargeTypeId: string | null;
  name: string;
  amount: string;
  gstRate: string;
}

/** Everything on the invoice screen. Stored as-is in drafts.data. */
export interface InvoiceForm {
  id: string;
  mode: 'new' | 'edit';
  expectedUpdatedAt: string | null;
  originalFy: string | null;
  originalSerial: number | null;
  originalInvoiceNo: string | null;
  sellerStateCode: string;
  invoiceDate: string;
  serialInput: string;
  serialTouched: boolean;
  companyId: string | null;
  buyerName: string;
  buyerAddress: string;
  buyerGstin: string;
  buyerStateCode: string;
  shipSame: boolean;
  shipAddress: string;
  placeOfSupply: string;
  paymentTerms: string;
  transportMode: string;
  vehicleNo: string;
  lines: LineForm[];
  charges: ChargeForm[];
}

export type FormErrors = Record<string, string>;

/** UUID v4. crypto.randomUUID only exists on https/localhost; plain-http LAN testing falls back to getRandomValues. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function emptyLine(): LineForm {
  return { key: newId(), itemId: null, itemName: '', description: '', hsn: '', qty: '', unit: 'Nos', price: '', gstRate: '' };
}

export function emptyCharge(): ChargeForm {
  return { key: newId(), chargeTypeId: null, name: '', amount: '', gstRate: '' };
}

export function emptyForm(sellerStateCode: string, today: string = todayLocal()): InvoiceForm {
  return {
    id: newId(),
    mode: 'new',
    expectedUpdatedAt: null,
    originalFy: null,
    originalSerial: null,
    originalInvoiceNo: null,
    sellerStateCode,
    invoiceDate: today,
    serialInput: '',
    serialTouched: false,
    companyId: null,
    buyerName: '',
    buyerAddress: '',
    buyerGstin: '',
    buyerStateCode: '',
    shipSame: true,
    shipAddress: '',
    placeOfSupply: '',
    paymentTerms: 'Immediate',
    transportMode: 'By Road',
    vehicleNo: '',
    lines: [emptyLine()],
    charges: [],
  };
}

export function formFromInvoice(inv: InvoiceFull): InvoiceForm {
  return {
    id: inv.id,
    mode: 'edit',
    expectedUpdatedAt: inv.updated_at,
    originalFy: inv.fy,
    originalSerial: inv.serial,
    originalInvoiceNo: inv.invoice_no,
    sellerStateCode: inv.seller_state_code,
    invoiceDate: inv.invoice_date,
    serialInput: padSerial(inv.serial),
    serialTouched: false,
    companyId: inv.company_id,
    buyerName: inv.buyer_name,
    buyerAddress: inv.buyer_address,
    buyerGstin: inv.buyer_gstin ?? '',
    buyerStateCode: inv.buyer_state_code,
    shipSame: inv.ship_same,
    shipAddress: inv.ship_same ? '' : inv.ship_address,
    placeOfSupply: inv.place_of_supply,
    paymentTerms: inv.payment_terms,
    transportMode: inv.transport_mode,
    vehicleNo: inv.vehicle_no ?? '',
    lines: inv.invoice_lines.map((l) => ({
      key: newId(),
      itemId: l.item_id,
      itemName: l.item_name,
      description: l.description,
      hsn: l.hsn,
      qty: plain(l.qty),
      unit: l.unit,
      price: plain(l.price),
      gstRate: plain(l.gst_rate),
    })),
    charges: inv.invoice_charges.map((c) => ({
      key: newId(),
      chargeTypeId: c.charge_type_id,
      name: c.name,
      amount: plain(c.amount),
      gstRate: plain(c.gst_rate),
    })),
  };
}

/** Same id (the old invoice no longer exists), so the existing draft keeps working. */
export function asNewInvoice(f: InvoiceForm): InvoiceForm {
  return {
    ...f,
    mode: 'new',
    expectedUpdatedAt: null,
    originalFy: null,
    originalSerial: null,
    originalInvoiceNo: null,
    serialTouched: false,
    serialInput: '',
  };
}

export function applyCompany(f: InvoiceForm, c: Company): InvoiceForm {
  return {
    ...f,
    companyId: c.id,
    buyerName: c.name,
    buyerAddress: c.address,
    buyerGstin: c.gstin ?? '',
    buyerStateCode: c.state_code,
    placeOfSupply: c.state_code,
  };
}

/** Place of supply follows the buyer state unless the user picked a different one. */
export function setBuyerState(f: InvoiceForm, code: string): InvoiceForm {
  return { ...f, buyerStateCode: code, placeOfSupply: f.placeOfSupply === f.buyerStateCode ? code : f.placeOfSupply };
}

export function setBuyerGstin(f: InvoiceForm, raw: string): InvoiceForm {
  const g = normalizeGstin(raw);
  const next = { ...f, buyerGstin: g };
  return g.length === 15 && gstinProblem(g) === null ? setBuyerState(next, g.slice(0, 2)) : next;
}

export function applyItem(l: LineForm, it: Item): LineForm {
  return {
    ...l,
    itemId: it.id,
    itemName: it.name,
    description: it.description,
    hsn: it.hsn,
    unit: it.unit,
    gstRate: plain(it.gst_rate),
    price: it.default_price !== null ? plain(it.default_price) : l.price,
  };
}

export function applyChargeType(c: ChargeForm, t: ChargeType): ChargeForm {
  return { ...c, chargeTypeId: t.id, name: t.name, gstRate: plain(t.gst_rate) };
}

/** A typed number belongs to its financial year: moving to another year goes back to "auto". */
export function changeDate(f: InvoiceForm, date: string): InvoiceForm {
  if (!date) return { ...f, invoiceDate: '' };
  if (f.invoiceDate && fyOf(date) === fyOf(f.invoiceDate)) return { ...f, invoiceDate: date };
  return { ...f, invoiceDate: date, serialTouched: false, serialInput: '' };
}

function keepsOriginalNumber(f: InvoiceForm): boolean {
  return f.mode === 'edit' && f.originalSerial !== null && f.invoiceDate !== '' && fyOf(f.invoiceDate) === f.originalFy;
}

/** What the number box shows. */
export function serialDisplay(f: InvoiceForm, suggestion: number | null): string {
  if (f.serialTouched) return f.serialInput;
  if (keepsOriginalNumber(f)) return padSerial(f.originalSerial as number);
  return suggestion === null ? '' : padSerial(suggestion);
}

/** What save_invoice receives: a typed number, the invoice's own number, or null = database picks the next one. */
export function effectiveSerial(f: InvoiceForm): number | null {
  if (f.serialTouched) return parseSerial(f.serialInput);
  return keepsOriginalNumber(f) ? f.originalSerial : null;
}

export function isSameState(f: InvoiceForm): boolean {
  return f.sellerStateCode === (f.placeOfSupply || f.sellerStateCode);
}

export function formTotals(f: InvoiceForm): Totals {
  return computeTotals(f.lines, f.charges, isSameState(f));
}

export function validateForm(f: InvoiceForm): FormErrors {
  const e: FormErrors = {};
  if (!f.invoiceDate) e.invoiceDate = 'Please choose a date.';
  if (f.serialTouched && parseSerial(f.serialInput) === null) e.serial = 'Please enter a whole number, like 12.';
  if (!f.buyerName.trim()) e.company = 'Please choose a company.';
  if (!f.buyerAddress.trim()) e.buyerAddress = 'Please enter the billing address.';
  if (f.buyerGstin) {
    const problem = gstinProblem(f.buyerGstin);
    if (problem) e.buyerGstin = problem;
    else if (f.buyerStateCode !== f.buyerGstin.slice(0, 2)) e.buyerStateCode = 'The state must match the GSTIN (its first two digits).';
  }
  if (!isStateCode(f.buyerStateCode)) e.buyerStateCode = 'Please choose the buyer state.';
  if (!f.shipSame && !f.shipAddress.trim()) e.shipAddress = 'Please enter the shipping address.';
  if (!isStateCode(f.placeOfSupply)) e.placeOfSupply = 'Please choose the place of supply.';
  if (!f.paymentTerms.trim()) e.paymentTerms = 'Please choose payment terms.';
  if (!f.transportMode.trim()) e.transportMode = 'Please choose the mode of transport.';
  if (f.lines.length === 0) e.lines = 'Please add at least one item.';
  f.lines.forEach((l, i) => {
    const qty = parseAmount(l.qty, 'qty');
    if (!l.itemName.trim()) e[`lines.${i}.item`] = 'Please choose an item.';
    if (!HSN_PATTERN.test(l.hsn.trim())) e[`lines.${i}.hsn`] = 'HSN must be 4, 6 or 8 digits.';
    if (qty === null || new D(qty).isZero()) e[`lines.${i}.qty`] = 'Please enter quantity (more than 0, up to 3 decimals).';
    if (!l.unit.trim()) e[`lines.${i}.unit`] = 'Please choose a unit.';
    if (parseAmount(l.price, 'price') === null) e[`lines.${i}.price`] = 'Please enter price (0 or more, up to 2 decimals).';
    if (parseAmount(l.gstRate, 'rate') === null) e[`lines.${i}.gstRate`] = 'Please enter GST rate (0 to 100).';
  });
  f.charges.forEach((c, i) => {
    const amount = parseAmount(c.amount, 'amount');
    if (!c.name.trim()) e[`charges.${i}.type`] = 'Please choose a charge type.';
    if (amount === null || new D(amount).isZero()) e[`charges.${i}.amount`] = 'Please enter an amount more than 0 (up to 2 decimals).';
    if (parseAmount(c.gstRate, 'rate') === null) e[`charges.${i}.gstRate`] = 'Please enter GST rate (0 to 100).';
  });
  return e;
}

/** Exact decimal strings only (Decimal#toFixed() never uses exponent notation). Call after validateForm passes. */
export function buildSavePayload(f: InvoiceForm): SavePayload {
  const t = formTotals(f);
  const s = (d: { toFixed(): string }) => d.toFixed();
  const buyerAddress = f.buyerAddress.trim();
  return {
    id: f.id,
    invoice_date: f.invoiceDate,
    serial: effectiveSerial(f),
    company_id: f.companyId,
    buyer_name: f.buyerName.trim(),
    buyer_address: buyerAddress,
    buyer_gstin: f.buyerGstin || null,
    buyer_state_code: f.buyerStateCode,
    ship_same: f.shipSame,
    ship_address: f.shipSame ? buyerAddress : f.shipAddress.trim(),
    place_of_supply: f.placeOfSupply,
    payment_terms: f.paymentTerms.trim(),
    transport_mode: f.transportMode.trim(),
    vehicle_no: f.vehicleNo.replace(/\s+/g, '').toUpperCase() || null,
    items_total: s(t.itemsTotal),
    charges_total: s(t.chargesTotal),
    taxable_total: s(t.taxableTotal),
    cgst_total: s(t.cgstTotal),
    sgst_total: s(t.sgstTotal),
    igst_total: s(t.igstTotal),
    exact_total: s(t.exactTotal),
    grand_total: s(t.grandTotal),
    round_off: s(t.roundOff),
    lines: f.lines.map((l, i) => ({
      item_id: l.itemId,
      item_name: l.itemName.trim(),
      description: l.description.trim(),
      hsn: l.hsn.trim(),
      qty: parseAmount(l.qty, 'qty') ?? '0',
      unit: l.unit.trim(),
      price: parseAmount(l.price, 'price') ?? '0',
      gst_rate: parseAmount(l.gstRate, 'rate') ?? '0',
      amount: s(t.lines[i].amount),
      gst_amount: s(t.lines[i].gstAmount),
    })),
    charges: f.charges.map((c, i) => ({
      charge_type_id: c.chargeTypeId,
      name: c.name.trim(),
      amount: parseAmount(c.amount, 'amount') ?? '0',
      gst_rate: parseAmount(c.gstRate, 'rate') ?? '0',
      gst_amount: s(t.charges[i].gstAmount),
    })),
  };
}

export function draftLabel(f: InvoiceForm): string {
  if (f.mode === 'edit') return `Editing ${f.originalInvoiceNo}`;
  return f.buyerName.trim() || 'No buyer yet';
}

/** Keeps a company/item that was removed from the list selectable on an old invoice. */
export function withCurrentOption(
  options: { value: string; label: string }[],
  id: string | null,
  label: string,
): { value: string; label: string }[] {
  if (!id || options.some((o) => o.value === id)) return options;
  return [...options, { value: id, label: `${label} (removed from list)` }];
}
