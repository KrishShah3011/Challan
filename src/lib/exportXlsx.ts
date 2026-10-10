import type * as XLSX from 'xlsx';
import { stateName } from './gstin';
import { D } from './invoiceMath';
import type { ExportChargeRow, ExportLineRow, InvoiceRow } from './types';

type Lib = typeof XLSX;
type Cell = XLSX.CellObject;

const MS_PER_DAY = 86_400_000;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const IST_OFFSET_MS = 5.5 * 3_600_000;

/** 'YYYY-MM-DD' -> Excel date serial (no time zone involved). */
export function excelDate(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - EXCEL_EPOCH) / MS_PER_DAY;
}

/** timestamptz -> Excel date-time serial showing India time. */
export function excelDateTimeIst(ts: string): number {
  return (new Date(ts).getTime() + IST_OFFSET_MS - EXCEL_EPOCH) / MS_PER_DAY;
}

const text = (v: string | null | undefined): Cell => ({ t: 's', v: v ?? '' });
const money = (v: number | string): Cell => ({ t: 'n', v: Number(new D(v).toDecimalPlaces(2).toFixed(2)), z: '#,##0.00' });
const num = (v: number | string): Cell => ({ t: 'n', v: Number(v) });
const date = (iso: string): Cell => ({ t: 'n', v: excelDate(iso), z: 'dd-mmm-yyyy' });
const dateTime = (ts: string): Cell => ({ t: 'n', v: excelDateTimeIst(ts), z: 'dd-mmm-yyyy hh:mm' });

export const INVOICE_HEADERS = [
  'Invoice No', 'Date', 'Buyer', 'Buyer GSTIN', 'Buyer State', 'Place of Supply', 'Billing Address', 'Shipping Address',
  'Payment Terms', 'Transport', 'Vehicle No', 'Items Total', 'Charges Total', 'Taxable Value', 'CGST', 'SGST', 'IGST',
  'Round Off', 'Grand Total', 'Created', 'Last Edited',
];
export const ITEM_HEADERS = ['Invoice No', 'Date', 'Buyer', 'Item', 'Description', 'HSN', 'Qty', 'Unit', 'Price', 'Amount', 'GST %', 'GST Amount'];
export const CHARGE_HEADERS = ['Invoice No', 'Date', 'Buyer', 'Charge', 'Amount', 'GST %', 'GST Amount'];

export interface ExportData {
  invoices: InvoiceRow[];
  lines: ExportLineRow[];
  charges: ExportChargeRow[];
}

/** Cells are written one by one so every type and number format is exactly what we chose. */
function sheet(X: Lib, headers: string[], rows: Cell[][]): XLSX.WorkSheet {
  const all = [headers.map((h) => text(h)), ...rows];
  const ws: XLSX.WorkSheet = {};
  all.forEach((row, r) =>
    row.forEach((cell, c) => {
      ws[X.utils.encode_cell({ r, c })] = cell;
    }),
  );
  ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: all.length - 1, c: headers.length - 1 } });
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  return ws;
}

export function buildWorkbook(X: Lib, data: ExportData): XLSX.WorkBook {
  const invoices = [...data.invoices].sort((a, b) => a.fy.localeCompare(b.fy) || a.serial - b.serial);
  const order = new Map(invoices.map((inv, i) => [inv.id, i]));
  const byId = new Map(invoices.map((inv) => [inv.id, inv]));
  // A row whose invoice was saved while the export was running is skipped, never shown without its number.
  const ordered = <T extends { invoice_id: string; position: number }>(rows: T[]) =>
    rows
      .filter((r) => byId.has(r.invoice_id))
      .sort((a, b) => (order.get(a.invoice_id) ?? 0) - (order.get(b.invoice_id) ?? 0) || a.position - b.position);
  const head = (invoiceId: string): Cell[] => {
    const inv = byId.get(invoiceId) as InvoiceRow;
    return [text(inv.invoice_no), date(inv.invoice_date), text(inv.buyer_name)];
  };

  const wb = X.utils.book_new();
  X.utils.book_append_sheet(
    wb,
    sheet(
      X,
      INVOICE_HEADERS,
      invoices.map((i) => [
        text(i.invoice_no), date(i.invoice_date), text(i.buyer_name), text(i.buyer_gstin),
        text(stateName(i.buyer_state_code)), text(stateName(i.place_of_supply)), text(i.buyer_address), text(i.ship_address),
        text(i.payment_terms), text(i.transport_mode), text(i.vehicle_no),
        money(i.items_total), money(i.charges_total), money(i.taxable_total),
        money(i.cgst_total), money(i.sgst_total), money(i.igst_total), money(i.round_off), money(i.grand_total),
        dateTime(i.created_at), dateTime(i.updated_at),
      ]),
    ),
    'Invoices',
  );
  X.utils.book_append_sheet(
    wb,
    sheet(
      X,
      ITEM_HEADERS,
      ordered(data.lines).map((l) => [
        ...head(l.invoice_id), text(l.item_name), text(l.description), text(l.hsn), num(l.qty), text(l.unit),
        money(l.price), money(l.amount), num(l.gst_rate), money(l.gst_amount),
      ]),
    ),
    'Items',
  );
  X.utils.book_append_sheet(
    wb,
    sheet(
      X,
      CHARGE_HEADERS,
      ordered(data.charges).map((c) => [...head(c.invoice_id), text(c.name), money(c.amount), num(c.gst_rate), money(c.gst_amount)]),
    ),
    'Charges',
  );
  return wb;
}
