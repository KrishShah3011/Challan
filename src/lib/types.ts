export interface Seller {
  name: string;
  address: string;
  gstin: string;
  state_code: string;
  phone: string;
  updated_at: string;
}
export type SellerInput = Pick<Seller, 'name' | 'address' | 'gstin' | 'phone'>;

export interface Company {
  id: string;
  name: string;
  address: string;
  gstin: string | null;
  state_code: string;
  archived: boolean;
}
/** gst_rate and default_price are read as text (`::text`) so no digits are lost. */
export interface Item {
  id: string;
  name: string;
  description: string;
  hsn: string;
  unit: string;
  gst_rate: string;
  default_price: string | null;
  archived: boolean;
}
export interface ChargeType {
  id: string;
  name: string;
  gst_rate: string;
  archived: boolean;
}
export interface Masters {
  companies: Company[];
  items: Item[];
  chargeTypes: ChargeType[];
}

/** Totals arrive as JSON numbers; they are only displayed or exported after rounding. */
export interface InvoiceRow {
  id: string;
  invoice_date: string;
  fy: string;
  serial: number;
  invoice_no: string;
  company_id: string | null;
  buyer_name: string;
  buyer_address: string;
  buyer_gstin: string | null;
  buyer_state_code: string;
  ship_same: boolean;
  ship_address: string;
  place_of_supply: string;
  seller_name: string;
  seller_address: string;
  seller_gstin: string;
  seller_state_code: string;
  tax_type: 'CGST_SGST' | 'IGST';
  payment_terms: string;
  transport_mode: string;
  vehicle_no: string | null;
  items_total: number;
  charges_total: number;
  taxable_total: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  exact_total: number;
  grand_total: number;
  round_off: number;
  created_at: string;
  updated_at: string;
}
export interface InvoiceLineRow {
  id: string;
  position: number;
  item_id: string | null;
  item_name: string;
  description: string;
  hsn: string;
  qty: string;
  unit: string;
  price: string;
  gst_rate: string;
  amount: number;
  gst_amount: number;
}
export interface InvoiceChargeRow {
  id: string;
  position: number;
  charge_type_id: string | null;
  name: string;
  amount: string;
  gst_rate: string;
  gst_amount: number;
}
export interface InvoiceFull extends InvoiceRow {
  invoice_lines: InvoiceLineRow[];
  invoice_charges: InvoiceChargeRow[];
}
export type InvoiceListRow = Pick<InvoiceRow, 'id' | 'invoice_no' | 'invoice_date' | 'buyer_name' | 'grand_total'>;

export interface ExportLineRow {
  invoice_id: string;
  position: number;
  item_name: string;
  description: string;
  hsn: string;
  qty: string;
  unit: string;
  price: string;
  amount: number;
  gst_rate: string;
  gst_amount: number;
}
export interface ExportChargeRow {
  invoice_id: string;
  position: number;
  name: string;
  amount: string;
  gst_rate: string;
  gst_amount: number;
}

export interface DraftRow {
  id: string;
  label: string;
  data: unknown;
  updated_at: string;
}
export interface AuditRow {
  id: number;
  at: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
}

/** save_invoice payload (spec §5.1). Every money/qty/rate value is an exact decimal string. */
export interface SaveLine {
  item_id: string | null;
  item_name: string;
  description: string;
  hsn: string;
  qty: string;
  unit: string;
  price: string;
  gst_rate: string;
  amount: string;
  gst_amount: string;
}
export interface SaveCharge {
  charge_type_id: string | null;
  name: string;
  amount: string;
  gst_rate: string;
  gst_amount: string;
}
export interface SavePayload {
  id: string;
  invoice_date: string;
  serial: number | null;
  company_id: string | null;
  buyer_name: string;
  buyer_address: string;
  buyer_gstin: string | null;
  buyer_state_code: string;
  ship_same: boolean;
  ship_address: string;
  place_of_supply: string;
  payment_terms: string;
  transport_mode: string;
  vehicle_no: string | null;
  items_total: string;
  charges_total: string;
  taxable_total: string;
  cgst_total: string;
  sgst_total: string;
  igst_total: string;
  exact_total: string;
  grand_total: string;
  round_off: string;
  lines: SaveLine[];
  charges: SaveCharge[];
}
export interface SaveResult {
  id: string;
  invoice_no: string;
  serial: number;
  updated_at: string;
}
