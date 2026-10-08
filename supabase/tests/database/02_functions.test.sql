begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- A valid payload: one line (qty x 100 @18%) + Freight 50 @18%, buyer in Maharashtra (IGST; seller is Gujarat).
create function pg_temp.payload(p_id uuid, p_date date, p_serial integer, p_qty integer default 2) returns jsonb
language plpgsql as $$
declare
  a numeric := p_qty * 100;
  g numeric := a * 18 / 100;
  t numeric := a + 50;
  tax numeric := g + 9;
begin
  return jsonb_build_object(
    'id', p_id, 'invoice_date', p_date, 'serial', p_serial, 'company_id', null,
    'buyer_name', 'ABC Traders', 'buyer_address', 'Mumbai', 'buyer_gstin', '27AABCA2222E1ZD', 'buyer_state_code', '27',
    'ship_same', true, 'ship_address', 'Mumbai', 'place_of_supply', '27',
    'payment_terms', 'Immediate', 'transport_mode', 'By Road', 'vehicle_no', null,
    'items_total', a::text, 'charges_total', '50', 'taxable_total', t::text,
    'cgst_total', '0', 'sgst_total', '0', 'igst_total', tax::text,
    'exact_total', (t + tax)::text, 'grand_total', round(t + tax, 0)::text,
    'round_off', (round(t + tax, 0) - (t + tax))::text,
    'lines', jsonb_build_array(jsonb_build_object(
      'item_id', null, 'item_name', 'MS Pipe 1 inch', 'description', '', 'hsn', '7306', 'qty', p_qty::text,
      'unit', 'Mtr', 'price', '100', 'gst_rate', '18', 'amount', a::text, 'gst_amount', g::text)),
    'charges', jsonb_build_array(jsonb_build_object(
      'charge_type_id', null, 'name', 'Freight', 'amount', '50', 'gst_rate', '18', 'gst_amount', '9')));
end $$;

-- Numbering
select is(public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a1', '2026-10-08', null), null)->>'invoice_no',
  '2026-27/001', 'first auto number of the year is 001');
select is(public.next_serial('2026-27'), 2, 'suggestion is highest + 1');
select is((public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a2', '2026-10-08', null), null)->>'serial')::int,
  2, 'auto numbers increase');
select is(public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a3', '2026-10-08', 10), null)->>'invoice_no',
  '2026-27/010', 'a typed number can jump ahead');
select is(public.next_serial('2026-27'), 11, 'gaps are not filled automatically');
select lives_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a4', '2026-10-08', 8), null) $$,
  'a typed number can fill a gap');
select throws_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a5', '2026-10-08', 8), null) $$,
  'P0001', 'DUPLICATE_NUMBER', 'a typed duplicate is refused');
select is(public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a6', '2027-04-01', 8), null)->>'invoice_no',
  '2027-28/008', 'the same serial in another year is allowed');
select is(public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a7', '2026-10-08', 1000), null)->>'invoice_no',
  '2026-27/1000', '1000 prints in full');

-- Create retry, edit, conflict, deleted-while-editing
select throws_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a1', '2026-10-08', null), null) $$,
  'P0001', 'ALREADY_SAVED', 'a retried create is detected');
select lives_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a1', '2026-10-08', 1, 3),
  (select updated_at from public.invoices where id = '00000000-0000-0000-0000-0000000000a1')) $$,
  'edit with the current version');
select is((select qty from public.invoice_lines where invoice_id = '00000000-0000-0000-0000-0000000000a1'), 3.000::numeric,
  'lines replaced on edit');
select is((select count(*)::int from public.invoice_lines where invoice_id = '00000000-0000-0000-0000-0000000000a1'), 1,
  'old lines removed on edit');
select throws_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a1', '2026-10-08', 1),
  '2000-01-01T00:00:00Z') $$,
  'P0001', 'EDIT_CONFLICT', 'a stale version is refused');
select throws_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a9', '2026-10-08', null),
  '2026-10-08T00:00:00Z') $$,
  'P0001', 'INVOICE_DELETED', 'editing an invoice that no longer exists');
select is((public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a2', '2026-10-08', null),
  (select updated_at from public.invoices where id = '00000000-0000-0000-0000-0000000000a2'))->>'serial')::int,
  2, 'editing with auto number in the same year keeps the number');
select is(public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a2', '2027-04-02', null),
  (select updated_at from public.invoices where id = '00000000-0000-0000-0000-0000000000a2'))->>'invoice_no',
  '2027-28/009', 'moving to the next year takes that year''s next number');

-- All or nothing
insert into public.drafts (id, label, data) values ('00000000-0000-0000-0000-0000000000b1', 'x', '{}');
select throws_ok($$ select public.save_invoice(jsonb_set(pg_temp.payload('00000000-0000-0000-0000-0000000000b1', '2026-10-08', null),
  '{lines,0,amount}', '"199"'), null) $$,
  '23514', null, 'a bad line amount is refused');
select is((select count(*)::int from public.invoices where id = '00000000-0000-0000-0000-0000000000b1'), 0, 'no header left behind');
select is((select count(*)::int from public.drafts where id = '00000000-0000-0000-0000-0000000000b1'), 1, 'draft kept after a failed save');
select is((select count(*)::int from public.audit_log where row_id = '00000000-0000-0000-0000-0000000000b1'), 0, 'no log row after a failed save');
select throws_ok($$ select public.save_invoice(
  jsonb_set(jsonb_set(jsonb_set(pg_temp.payload('00000000-0000-0000-0000-0000000000b2', '2026-10-08', null),
    '{lines,0,qty}', '"1"'), '{lines,0,amount}', '"100"'), '{lines,0,gst_amount}', '"18"'), null) $$,
  'P0001', 'TOTALS_MISMATCH', 'header totals must equal the lines');
select throws_ok($$ select public.save_invoice(jsonb_set(pg_temp.payload('00000000-0000-0000-0000-0000000000b3', '2026-10-08', null),
  '{lines}', '[]'), null) $$,
  'P0001', 'NO_ITEMS', 'at least one item');

-- Save removes the draft and writes one full log entry per action
insert into public.drafts (id, label, data) values ('00000000-0000-0000-0000-0000000000c1', 'ABC Traders', '{}');
select lives_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000c1', '2026-10-08', null), null) $$,
  'save with a draft');
select is((select count(*)::int from public.drafts where id = '00000000-0000-0000-0000-0000000000c1'), 0, 'save removes the draft');
select is((select count(*)::int from public.audit_log where table_name = 'invoices' and row_id = '00000000-0000-0000-0000-0000000000a1'),
  2, 'create and edit each logged once');
select ok((select new_data ? 'lines' and new_data ? 'charges' from public.audit_log
  where row_id = '00000000-0000-0000-0000-0000000000a1' order by id desc limit 1), 'log holds the full invoice');
select ok((select old_data->'lines'->0->>'qty' = '2.000' from public.audit_log
  where row_id = '00000000-0000-0000-0000-0000000000a1' and action = 'UPDATE'), 'log keeps the before copy');

-- Delete
insert into public.drafts (id, label, data) values ('00000000-0000-0000-0000-0000000000a3', 'Editing 2026-27/010', '{}');
select throws_ok($$ select public.delete_invoice('00000000-0000-0000-0000-0000000000a3', '11') $$,
  'P0001', 'CONFIRM_MISMATCH', 'wrong typed number refused');
select is(public.delete_invoice('00000000-0000-0000-0000-0000000000a3', '010'), '2026-27/010', 'padded serial accepted');
select is((select count(*)::int from public.invoices where id = '00000000-0000-0000-0000-0000000000a3'), 0, 'header deleted');
select is((select count(*)::int from public.invoice_lines where invoice_id = '00000000-0000-0000-0000-0000000000a3'), 0, 'lines deleted');
select is((select count(*)::int from public.invoice_charges where invoice_id = '00000000-0000-0000-0000-0000000000a3'), 0, 'charges deleted');
select is((select count(*)::int from public.drafts where id = '00000000-0000-0000-0000-0000000000a3'), 0, 'draft deleted');
select is((select count(*)::int from public.audit_log where row_id = '00000000-0000-0000-0000-0000000000a3'
  and action = 'DELETE' and old_data ? 'lines'), 1, 'delete logged with a full copy');
select is(public.delete_invoice('00000000-0000-0000-0000-0000000000a7', '2026-27/1000'), '2026-27/1000', 'full number accepted');
select is(public.delete_invoice('00000000-0000-0000-0000-0000000000a4', ' 8 '), '2026-27/008', 'spaces ignored');
select throws_ok($$ select public.delete_invoice('00000000-0000-0000-0000-0000000000a3', '10') $$,
  'P0001', 'NOT_FOUND', 'deleting twice');

-- Master change log
insert into public.items (name, hsn, unit, gst_rate) values ('Audit Item', '1234', 'Nos', 5);
update public.items set gst_rate = 18 where name = 'Audit Item';
update public.items set archived = true where name = 'Audit Item';
select is((select count(*)::int from public.audit_log where table_name = 'items' and new_data->>'name' = 'Audit Item'),
  3, 'insert, edit and archive of a master are logged');
select is((select old_data->>'gst_rate' from public.audit_log where table_name = 'items' and new_data->>'name' = 'Audit Item'
  and action = 'UPDATE' order by id limit 1), '5.00', 'log keeps old values');
update public.seller set phone = '000';
select is((select count(*)::int from public.audit_log where table_name = 'seller' and action = 'UPDATE'), 1, 'seller changes logged');

select is(public.keep_alive(), 1, 'keep_alive');

-- Missing seller (last, because it removes the seed seller inside this transaction)
delete from public.seller;
select throws_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000b4', '2026-10-08', null), null) $$,
  'P0001', 'NO_SELLER', 'our company must be set up first');

select * from finish();
rollback;
