import * as X from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildWorkbook, excelDate, excelDateTimeIst } from './exportXlsx';
import type { ExportChargeRow, ExportLineRow, InvoiceRow } from './types';

const base: InvoiceRow = {
  id: 'a', invoice_date: '2026-10-07', fy: '2026-27', serial: 1, invoice_no: '2026-27/001', company_id: null,
  buyer_name: 'Patel Hardware Mart', buyer_address: 'Anand', buyer_gstin: '24AAKFP5678B1Z5', buyer_state_code: '24',
  ship_same: true, ship_address: 'Anand', place_of_supply: '24',
  seller_name: 'S', seller_address: 'A', seller_gstin: '24AAACS1234A1Z8', seller_state_code: '24',
  tax_type: 'CGST_SGST', payment_terms: 'Immediate', transport_mode: 'By Road', vehicle_no: null,
  items_total: 23.91325, charges_total: 0, taxable_total: 23.91325, cgst_total: 2.1521925, sgst_total: 2.1521925, igst_total: 0,
  exact_total: 28.217635, grand_total: 28, round_off: -0.217635,
  created_at: '2026-10-07T04:30:00Z', updated_at: '2026-10-07T04:30:00Z',
};
const later: InvoiceRow = { ...base, id: 'b', serial: 2, invoice_no: '2026-27/002' };
const lastYear: InvoiceRow = { ...base, id: 'c', fy: '2025-26', serial: 9, invoice_no: '2025-26/009', invoice_date: '2026-03-30' };
const line: ExportLineRow = {
  invoice_id: 'a', position: 1, item_name: 'Turmeric Powder', description: 'Ground', hsn: '091030',
  qty: '2.333', unit: 'Kg', price: '10.25', amount: 23.91325, gst_rate: '18.00', gst_amount: 4.304385,
};
const charge: ExportChargeRow = { invoice_id: 'a', position: 1, name: 'Freight', amount: '100.00', gst_rate: '18.00', gst_amount: 18 };

function roundTrip(data: Parameters<typeof buildWorkbook>[1]) {
  return X.read(X.write(buildWorkbook(X, data), { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true });
}

describe('excel dates', () => {
  it('converts ISO dates and IST timestamps to Excel serials', () => {
    expect(excelDate('2026-10-07')).toBe(46302);
    expect(excelDateTimeIst('2026-10-06T10:00:00Z')).toBeCloseTo(46301.6458333, 6);
  });
});

describe('buildWorkbook', () => {
  it('writes real numbers, real dates and text codes', () => {
    const wb = roundTrip({ invoices: [base], lines: [line], charges: [charge] });
    expect(wb.SheetNames).toEqual(['Invoices', 'Items', 'Charges']);
    const inv = wb.Sheets.Invoices;
    expect(inv.A1.v).toBe('Invoice No');
    expect(inv.A2).toMatchObject({ t: 's', v: '2026-27/001' });
    expect(inv.B2).toMatchObject({ t: 'n', v: 46302, z: 'dd-mmm-yyyy' });
    expect(inv.E2).toMatchObject({ t: 's', v: 'Gujarat' });
    expect(inv.L2).toMatchObject({ t: 'n', v: 23.91 });
    expect(inv.S2).toMatchObject({ t: 'n', v: 28 });
    const items = wb.Sheets.Items;
    expect(items.F2).toMatchObject({ t: 's', v: '091030' });
    expect(items.G2).toMatchObject({ t: 'n', v: 2.333 });
    expect(items.J2).toMatchObject({ t: 'n', v: 23.91 });
    expect(items.K2).toMatchObject({ t: 'n', v: 18 });
    expect(wb.Sheets.Charges.D2).toMatchObject({ t: 's', v: 'Freight' });
  });

  it('sorts by year then number and skips rows whose invoice is missing', () => {
    const wb = roundTrip({ invoices: [later, base, lastYear], lines: [{ ...line, invoice_id: 'zzz' }, line], charges: [] });
    const inv = wb.Sheets.Invoices;
    expect([inv.A2.v, inv.A3.v, inv.A4.v]).toEqual(['2025-26/009', '2026-27/001', '2026-27/002']);
    expect(wb.Sheets.Items['!ref']).toBe('A1:L2');
  });

  it('writes header-only sheets when there are no invoices', () => {
    const wb = roundTrip({ invoices: [], lines: [], charges: [] });
    expect(wb.Sheets.Invoices['!ref']).toBe('A1:U1');
    expect(wb.Sheets.Items['!ref']).toBe('A1:L1');
    expect(wb.Sheets.Charges['!ref']).toBe('A1:G1');
  });

  it('protects against formula injection: string starting with = stays type "s"', () => {
    const malicious: InvoiceRow = { ...base, buyer_name: '=1+1' };
    const wb = roundTrip({ invoices: [malicious], lines: [], charges: [] });
    expect(wb.Sheets.Invoices.C2).toMatchObject({ t: 's', v: '=1+1' });
  });
});
