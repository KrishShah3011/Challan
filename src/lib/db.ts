import type { PostgrestError } from '@supabase/supabase-js';
import { searchPattern } from './format';
import { supabase } from './supabase';
import type {
  AuditRow, ChargeType, Company, DraftRow, InvoiceFull, InvoiceListRow, Item, Masters,
  SavePayload, SaveResult, Seller, SellerInput,
} from './types';

function check<T>(res: { data: T; error: PostgrestError | null }): T {
  if (res.error) throw res.error;
  return res.data;
}

// Our company -------------------------------------------------------------------

const SELLER_COLUMNS = 'name, address, gstin, state_code, phone, updated_at';

export async function getSeller(): Promise<Seller | null> {
  return check(await supabase.from('seller').select(SELLER_COLUMNS).maybeSingle()) as Seller | null;
}

export async function saveSeller(s: SellerInput): Promise<Seller> {
  return check(await supabase.from('seller').upsert({ id: 1, ...s }).select(SELLER_COLUMNS).single()) as Seller;
}

// Master lists ------------------------------------------------------------------

const MASTER_COLUMNS = {
  companies: 'id, name, address, gstin, state_code, archived',
  items: 'id, name, description, hsn, unit, gst_rate::text, default_price::text, archived',
  charge_types: 'id, name, gst_rate::text, archived',
} as const;
export type MasterTable = keyof typeof MASTER_COLUMNS;
interface MasterRowOf {
  companies: Company;
  items: Item;
  charge_types: ChargeType;
}

export async function listMaster<T extends MasterTable>(table: T, archived = false): Promise<MasterRowOf[T][]> {
  const res = await supabase.from(table).select(MASTER_COLUMNS[table]).eq('archived', archived).order('name');
  return check(res) as unknown as MasterRowOf[T][];
}

/** Insert (no id) or update (id) one master row. One call, one row, one log entry. */
export async function saveMaster<T extends MasterTable>(
  table: T,
  fields: Record<string, unknown>,
  id?: string,
): Promise<MasterRowOf[T]> {
  const res = id
    ? await supabase.from(table).update(fields).eq('id', id).select(MASTER_COLUMNS[table]).single()
    : await supabase.from(table).insert(fields).select(MASTER_COLUMNS[table]).single();
  return check(res) as unknown as MasterRowOf[T];
}

export async function setArchived(table: MasterTable, id: string, archived: boolean): Promise<void> {
  check(await supabase.from(table).update({ archived }).eq('id', id));
}

export async function findCompaniesByGstin(gstin: string): Promise<Company[]> {
  const res = await supabase.from('companies').select(MASTER_COLUMNS.companies).eq('gstin', gstin).eq('archived', false);
  return check(res) as unknown as Company[];
}

export async function loadMasters(): Promise<Masters> {
  const [companies, items, chargeTypes] = await Promise.all([
    listMaster('companies'),
    listMaster('items'),
    listMaster('charge_types'),
  ]);
  return { companies, items, chargeTypes };
}

// Invoices ----------------------------------------------------------------------

export async function nextSerial(fy: string): Promise<number> {
  return check(await supabase.rpc('next_serial', { p_fy: fy })) as number;
}

export async function saveInvoice(p: SavePayload, expectedUpdatedAt: string | null): Promise<SaveResult> {
  return check(await supabase.rpc('save_invoice', { p, p_expected_updated_at: expectedUpdatedAt })) as SaveResult;
}

export async function deleteInvoice(id: string, typed: string): Promise<string> {
  return check(await supabase.rpc('delete_invoice', { p_id: id, p_typed: typed })) as string;
}

const INVOICE_FULL =
  '*, invoice_lines(id, position, item_id, item_name, description, hsn, qty::text, unit, price::text, gst_rate::text, amount, gst_amount),' +
  ' invoice_charges(id, position, charge_type_id, name, amount::text, gst_rate::text, gst_amount)';

export async function getInvoice(id: string): Promise<InvoiceFull | null> {
  const inv = check(await supabase.from('invoices').select(INVOICE_FULL).eq('id', id).maybeSingle()) as InvoiceFull | null;
  if (inv) {
    inv.invoice_lines.sort((a, b) => a.position - b.position);
    inv.invoice_charges.sort((a, b) => a.position - b.position);
  }
  return inv;
}

export const PAGE_SIZE = 50;

export async function listInvoices(search: string, page: number): Promise<InvoiceListRow[]> {
  // Filters must come before order/range (those return a builder without filter methods).
  let q = supabase.from('invoices').select('id, invoice_no, invoice_date, buyer_name, grand_total');
  const pattern = searchPattern(search);
  if (pattern) q = q.ilike('search_text', pattern);
  const res = await q
    .order('invoice_date', { ascending: false })
    .order('fy', { ascending: false })
    .order('serial', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  return check(res) as InvoiceListRow[];
}

export async function invoiceHistory(id: string): Promise<AuditRow[]> {
  const res = await supabase
    .from('audit_log')
    .select('id, at, action')
    .eq('table_name', 'invoices')
    .eq('row_id', id)
    .order('id');
  return check(res) as AuditRow[];
}

// Drafts ------------------------------------------------------------------------

export async function upsertDraft(d: { id: string; label: string; data: unknown }): Promise<void> {
  check(await supabase.from('drafts').upsert(d));
}

export async function listDrafts(): Promise<DraftRow[]> {
  const res = await supabase.from('drafts').select('id, label, data, updated_at').order('updated_at', { ascending: false });
  return check(res) as DraftRow[];
}

export async function getDraft(id: string): Promise<DraftRow | null> {
  return check(await supabase.from('drafts').select('id, label, data, updated_at').eq('id', id).maybeSingle()) as DraftRow | null;
}

export async function deleteDraft(id: string): Promise<void> {
  check(await supabase.from('drafts').delete().eq('id', id));
}

// Export ------------------------------------------------------------------------

/**
 * Every row of a table, page by page. Stops on an empty page rather than a short one,
 * so it stays correct even if the server caps pages below 1000 rows.
 */
export async function fetchAll<T>(
  table: 'invoices' | 'invoice_lines' | 'invoice_charges',
  columns: string,
  orderBy: string[],
): Promise<T[]> {
  const out: T[] = [];
  for (;;) {
    let q = supabase.from(table).select(columns);
    for (const c of orderBy) q = q.order(c);
    const rows = check(await q.range(out.length, out.length + 999)) as T[];
    if (rows.length === 0) return out;
    out.push(...rows);
  }
}
