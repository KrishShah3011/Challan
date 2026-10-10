import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyCompany, applyItem, asNewInvoice, buildSavePayload, changeDate, draftLabel, effectiveSerial, emptyForm,
  formFromInvoice, newId, serialDisplay, setBuyerGstin, validateForm, withCurrentOption, type InvoiceForm,
} from './invoiceForm';
import type { Company, InvoiceFull, Item } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PATEL: Company = { id: 'c1', name: 'Patel Hardware Mart', address: 'Anand', gstin: '24AAKFP5678B1Z5', state_code: '24', archived: false };
const PIPE: Item = { id: 'i1', name: 'MS Pipe 1 inch', description: 'Mild steel pipe', hsn: '7306', unit: 'Mtr', gst_rate: '18.00', default_price: '120.00', archived: false };
const INVOICE: InvoiceFull = {
  id: 'inv-1', invoice_date: '2027-03-10', fy: '2026-27', serial: 12, invoice_no: '2026-27/012', company_id: 'c-gone',
  buyer_name: 'Old Buyer', buyer_address: 'Pune', buyer_gstin: '27AABCA2222E1ZD', buyer_state_code: '27',
  ship_same: false, ship_address: 'Nashik', place_of_supply: '27',
  seller_name: 'Seller', seller_address: 'Ahmedabad', seller_gstin: '24AAACS1234A1Z8', seller_state_code: '24',
  tax_type: 'IGST', payment_terms: '30 days', transport_mode: 'Courier', vehicle_no: null,
  items_total: 240, charges_total: 0, taxable_total: 240, cgst_total: 0, sgst_total: 0, igst_total: 43.2,
  exact_total: 283.2, grand_total: 283, round_off: -0.2,
  created_at: '2027-03-10T05:00:00+00:00', updated_at: '2027-03-11T06:00:00.123456+00:00',
  invoice_lines: [{ id: 'l1', position: 1, item_id: 'i-gone', item_name: 'Retired Item', description: '', hsn: '7306',
    qty: '2.000', unit: 'Mtr', price: '120.00', gst_rate: '18.00', amount: 240, gst_amount: 43.2 }],
  invoice_charges: [],
};

function filled(): InvoiceForm {
  const f = applyCompany(emptyForm('24', '2026-10-08'), PATEL);
  return { ...f, lines: [{ ...applyItem(f.lines[0], PIPE), qty: '2' }] };
}

afterEach(() => vi.unstubAllGlobals());

describe('ids', () => {
  it('makes UUID v4 ids', () => {
    expect(newId()).toMatch(UUID);
  });
  it('still works without crypto.randomUUID (plain-http phone testing)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    expect(newId()).toMatch(UUID);
  });
});

describe('building the form', () => {
  it('starts with one empty item and friendly defaults', () => {
    const f = emptyForm('24', '2026-10-08');
    expect(f.lines).toHaveLength(1);
    expect(f.paymentTerms).toBe('Immediate');
    expect(f.transportMode).toBe('By Road');
    expect(f.shipSame).toBe(true);
    expect(f.mode).toBe('new');
    expect(f.sellerStateCode).toBe('24');
  });
  it('fills an item from the list with clean numbers', () => {
    const l = applyItem(emptyForm('24').lines[0], PIPE);
    expect(l).toMatchObject({ itemName: 'MS Pipe 1 inch', hsn: '7306', unit: 'Mtr', gstRate: '18', price: '120' });
    expect(applyItem({ ...l, price: '99' }, { ...PIPE, default_price: null }).price).toBe('99');
  });
  it('moves state and place of supply with the GSTIN, but keeps a hand-picked place of supply', () => {
    const f = applyCompany(emptyForm('24'), PATEL);
    expect(f.placeOfSupply).toBe('24');
    const moved = setBuyerGstin(f, ' 27aabca2222e1zd ');
    expect(moved).toMatchObject({ buyerGstin: '27AABCA2222E1ZD', buyerStateCode: '27', placeOfSupply: '27' });
    const kept = setBuyerGstin({ ...f, placeOfSupply: '29' }, '27AABCA2222E1ZD');
    expect(kept.placeOfSupply).toBe('29');
  });
  it('loads a saved invoice for editing', () => {
    const f = formFromInvoice(INVOICE);
    expect(f).toMatchObject({ mode: 'edit', originalSerial: 12, originalFy: '2026-27', serialInput: '012', sellerStateCode: '24', shipAddress: 'Nashik' });
    expect(f.lines[0]).toMatchObject({ qty: '2', price: '120', gstRate: '18' });
  });
  it('turns an edit into a new invoice with the same id', () => {
    const f = asNewInvoice(formFromInvoice(INVOICE));
    expect(f).toMatchObject({ id: 'inv-1', mode: 'new', expectedUpdatedAt: null, originalSerial: null, serialTouched: false });
  });
});

describe('invoice number', () => {
  it('uses the suggestion until the user types', () => {
    const f = emptyForm('24', '2026-10-08');
    expect(serialDisplay(f, 7)).toBe('007');
    expect(effectiveSerial(f)).toBeNull();
    const typed = { ...f, serialInput: '012', serialTouched: true };
    expect(effectiveSerial(typed)).toBe(12);
  });
  it('keeps a typed number within the same year, drops it when the year changes', () => {
    const typed = { ...emptyForm('24', '2026-10-08'), serialInput: '50', serialTouched: true };
    expect(changeDate(typed, '2027-03-31').serialTouched).toBe(true);
    expect(effectiveSerial(changeDate(typed, '2027-04-01'))).toBeNull();
  });
  it('returns to the original number when an edit moves to another year and back', () => {
    let f = formFromInvoice(INVOICE);
    expect(serialDisplay(f, 99)).toBe('012');
    expect(effectiveSerial(f)).toBe(12);
    f = changeDate(f, '2027-04-02');
    expect(effectiveSerial(f)).toBeNull();
    expect(serialDisplay(f, 5)).toBe('005');
    f = changeDate(f, '2027-03-15');
    expect(effectiveSerial(f)).toBe(12);
    expect(serialDisplay(f, 5)).toBe('012');
  });
});

describe('validateForm', () => {
  it('lists what is missing on an empty form', () => {
    const keys = Object.keys(validateForm(emptyForm('24')));
    expect(keys).toEqual(expect.arrayContaining([
      'company', 'buyerAddress', 'buyerStateCode', 'placeOfSupply',
      'lines.0.item', 'lines.0.hsn', 'lines.0.qty', 'lines.0.price', 'lines.0.gstRate',
    ]));
  });
  it('accepts a complete form', () => {
    expect(validateForm(filled())).toEqual({});
  });
  it('accepts quantities typed the way people type them', () => {
    const f = filled();
    expect(validateForm({ ...f, lines: [{ ...f.lines[0], qty: '1,000' }] })).toEqual({});
    expect(validateForm({ ...f, lines: [{ ...f.lines[0], qty: '.5' }] })).toEqual({});
  });
  it('refuses zero, a 4th decimal and a bad typed number', () => {
    const f = filled();
    expect(validateForm({ ...f, lines: [{ ...f.lines[0], qty: '0' }] })['lines.0.qty']).toMatch(/more than 0/);
    expect(validateForm({ ...f, lines: [{ ...f.lines[0], qty: '2.3335' }] })['lines.0.qty']).toMatch(/3 decimals/);
    expect(validateForm({ ...f, serialInput: '', serialTouched: true }).serial).toMatch(/whole number/);
  });
  it('explains a mistyped GSTIN and a charge without amount', () => {
    const f = filled();
    expect(validateForm({ ...f, buyerGstin: '24AAKFP5678B1Z6' }).buyerGstin).toMatch(/last character/);
    const withCharge = { ...f, charges: [{ key: 'k', chargeTypeId: 't', name: 'Freight', amount: '0', gstRate: '18' }] };
    expect(validateForm(withCharge)['charges.0.amount']).toMatch(/more than 0/);
    const noType = { ...f, charges: [{ key: 'k', chargeTypeId: null, name: '', amount: '10', gstRate: '18' }] };
    expect(validateForm(noType)['charges.0.type']).toBe('Please choose a charge type.');
  });
  it('validates price and gst_rate on lone dot, whitespace, and 0.', () => {
    const f = filled();
    expect(validateForm({ ...f, lines: [{ ...f.lines[0], price: '.' }] })['lines.0.price']).toMatch(/enter price/);
    expect(validateForm({ ...f, lines: [{ ...f.lines[0], price: '  .  ' }] })['lines.0.price']).toMatch(/enter price/);
    expect(validateForm({ ...f, lines: [{ ...f.lines[0], gstRate: '.' }] })['lines.0.gstRate']).toMatch(/enter GST rate/);
    expect(validateForm({ ...f, lines: [{ ...f.lines[0], gstRate: '  .  ' }] })['lines.0.gstRate']).toMatch(/enter GST rate/);
    expect(validateForm({ ...f, lines: [{ ...f.lines[0], price: '0.' }] })['lines.0.price']).toBeUndefined();
    expect(validateForm({ ...f, lines: [{ ...f.lines[0], gstRate: '0.' }] })['lines.0.gstRate']).toBeUndefined();
  });
});

describe('buildSavePayload', () => {
  it('sends exact strings, the auto number and a copied shipping address', () => {
    const p = buildSavePayload({ ...filled(), vehicleNo: ' gj 01 ab 1234 ' });
    expect(p.serial).toBeNull();
    expect(p.ship_address).toBe('Anand');
    expect(p.vehicle_no).toBe('GJ01AB1234');
    expect(p.lines[0]).toMatchObject({ qty: '2', price: '120', gst_rate: '18', amount: '240', gst_amount: '43.2' });
    expect(p).toMatchObject({
      items_total: '240', charges_total: '0', taxable_total: '240',
      cgst_total: '21.6', sgst_total: '21.6', igst_total: '0',
      exact_total: '283.2', grand_total: '283', round_off: '-0.2',
    });
  });
  it('uses IGST when the place of supply is another state', () => {
    const p = buildSavePayload({ ...filled(), placeOfSupply: '27' });
    expect(p).toMatchObject({ igst_total: '43.2', cgst_total: '0', sgst_total: '0' });
  });
  it('sends null for empty GSTIN and vehicle number', () => {
    const p = buildSavePayload({ ...filled(), buyerGstin: '', vehicleNo: '  ' });
    expect(p.buyer_gstin).toBeNull();
    expect(p.vehicle_no).toBeNull();
  });
});

describe('labels and options', () => {
  it('labels drafts', () => {
    expect(draftLabel(emptyForm('24'))).toBe('No buyer yet');
    expect(draftLabel(filled())).toBe('Patel Hardware Mart');
    expect(draftLabel(formFromInvoice(INVOICE))).toBe('Editing 2026-27/012');
  });
  it('keeps a removed company or item visible in its picker', () => {
    const opts = [{ value: 'c1', label: 'Patel' }];
    expect(withCurrentOption(opts, 'c1', 'Patel')).toBe(opts);
    expect(withCurrentOption(opts, null, '')).toBe(opts);
    expect(withCurrentOption(opts, 'c-gone', 'Old Buyer')).toEqual([...opts, { value: 'c-gone', label: 'Old Buyer (removed from list)' }]);
  });
});
