import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestUser, localEnv, TEST_USER } from '../helpers/localEnv';

const env = localEnv();
const client = createClient(env.url, env.anonKey, { auth: { persistSession: false } });
const FY = '2031-32'; // a year no other test uses
const DATE = '2031-06-15';
const saved: { id: string; serial: number }[] = [];

function payload(id: string) {
  return {
    id, invoice_date: DATE, serial: null, company_id: null,
    buyer_name: 'ABC Traders', buyer_address: 'Mumbai', buyer_gstin: '27AABCA2222E1ZD', buyer_state_code: '27',
    ship_same: true, ship_address: 'Mumbai', place_of_supply: '27',
    payment_terms: 'Immediate', transport_mode: 'By Road', vehicle_no: null,
    items_total: '200', charges_total: '50', taxable_total: '250',
    cgst_total: '0', sgst_total: '0', igst_total: '45', exact_total: '295', grand_total: '295', round_off: '0',
    lines: [{ item_id: null, item_name: 'MS Pipe 1 inch', description: '', hsn: '7306', qty: '2', unit: 'Mtr',
              price: '100', gst_rate: '18', amount: '200', gst_amount: '36' }],
    charges: [{ charge_type_id: null, name: 'Freight', amount: '50', gst_rate: '18', gst_amount: '9' }],
  };
}

describe('save_invoice under concurrency', () => {
  beforeAll(async () => {
    await ensureTestUser();
    const { error } = await client.auth.signInWithPassword(TEST_USER);
    if (error) throw error;
  });

  afterAll(async () => {
    for (const s of saved) await client.rpc('delete_invoice', { p_id: s.id, p_typed: String(s.serial) });
  });

  it('gives 10 simultaneous auto-numbered saves 10 distinct consecutive numbers', async () => {
    const { data: start, error } = await client.rpc('next_serial', { p_fy: FY });
    expect(error).toBeNull();
    const ids = Array.from({ length: 10 }, () => crypto.randomUUID());
    const results = await Promise.all(
      ids.map((id) => client.rpc('save_invoice', { p: payload(id), p_expected_updated_at: null })),
    );
    for (const r of results) expect(r.error).toBeNull();
    for (const r of results) saved.push(r.data as { id: string; serial: number });
    const serials = saved.map((s) => s.serial).sort((a, b) => a - b);
    expect(serials).toEqual(Array.from({ length: 10 }, (_, i) => (start as number) + i));
  }, 30_000);
});
