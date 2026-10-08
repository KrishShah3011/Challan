begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Financial year and number formatting
select is(public.fy_of('2026-04-01'), '2026-27', 'April starts the financial year');
select is(public.fy_of('2027-03-31'), '2026-27', 'March ends it');
select is(public.fy_of('2027-04-01'), '2027-28', 'next April starts the next one');
select is(public.fy_of('2099-04-01'), '2099-00', 'century wraps');
select is(public.format_invoice_no('2026-27', 1), '2026-27/001', 'serial padded to 3 digits');
select is(public.format_invoice_no('2026-27', 1000), '2026-27/1000', '1000 is not truncated');
select is(public.normalize_name('  ABC   Traders '), 'abc traders', 'names normalised');

-- Seed data
select is((select count(*)::int from public.companies), 5, 'seed: 5 companies');
select is((select count(*)::int from public.items), 10, 'seed: 10 items');
select is((select count(*)::int from public.charge_types), 3, 'seed: 3 charge types');
select is((select state_code from public.seller), '24', 'seller state comes from its GSTIN');

-- Company rules
select lives_ok(
  $$ insert into public.companies (name, address, gstin, state_code) values ('ABC Traders', 'Delhi', '07AAACD1234F1Z9', '07') $$,
  'same name with a different GSTIN is allowed');
select throws_ok(
  $$ insert into public.companies (name, address, gstin, state_code) values ('abc  traders', 'Surat', '24AABCA1111D1ZR', '24') $$,
  '23505', null, 'same normalised name and same GSTIN is refused');
select lives_ok(
  $$ insert into public.companies (name, address, state_code) values ('No GST Co', 'Jaipur', '08') $$,
  'company without GSTIN');
select throws_ok(
  $$ insert into public.companies (name, address, state_code) values ('no gst co', 'Ajmer', '08') $$,
  '23505', null, 'same name with both GSTINs empty is refused');
select lives_ok(
  $$ update public.companies set archived = true where name = 'No GST Co' $$,
  'archive');
select lives_ok(
  $$ insert into public.companies (name, address, state_code) values ('No GST Co', 'Ajmer', '08') $$,
  'an archived duplicate does not block');
select throws_ok(
  $$ insert into public.companies (name, address, gstin, state_code) values ('X', 'Y', '24AABCA1111D1ZR', '27') $$,
  '23514', null, 'state must match the GSTIN');
select throws_ok(
  $$ insert into public.companies (name, address, gstin, state_code) values ('X', 'Y', '24aabca1111d1zr', '24') $$,
  '23514', null, 'lower-case GSTIN refused');
select throws_ok(
  $$ insert into public.companies (name, address, state_code) values ('X', 'Y', '39') $$,
  '23514', null, 'unknown state code refused');
select throws_ok(
  $$ insert into public.companies (name, address, state_code) values ('   ', 'Y', '24') $$,
  '23514', null, 'blank name refused');

-- Item rules
select throws_ok(
  $$ insert into public.items (name, hsn, unit, gst_rate) values ('Bad HSN', '12345', 'Nos', 18) $$,
  '23514', null, '5-digit HSN refused');
select lives_ok(
  $$ insert into public.items (name, hsn, unit, gst_rate) values ('Leading Zero', '0910', 'Kg', 5) $$,
  'HSN with a leading zero');
select is((select hsn from public.items where name = 'Leading Zero'), '0910', 'leading zero kept');
select throws_ok(
  $$ insert into public.items (name, hsn, unit, gst_rate) values ('Too High', '1234', 'Nos', 100.01) $$,
  '23514', null, 'GST rate above 100 refused');
select throws_ok(
  $$ insert into public.items (name, hsn, unit, gst_rate) values ('cement bag 50 KG', '2523', 'Nos', 18) $$,
  '23505', null, 'duplicate item name refused');

-- Invoice header: generated columns and arithmetic checks
insert into public.invoices (
  id, invoice_date, serial, buyer_name, buyer_address, buyer_state_code, ship_same, ship_address, place_of_supply,
  seller_name, seller_address, seller_gstin, seller_state_code, payment_terms, transport_mode,
  items_total, charges_total, taxable_total, cgst_total, sgst_total, igst_total, exact_total, grand_total, round_off)
values (
  '00000000-0000-0000-0000-0000000000f1', '2027-03-31', 1000, 'ABC Traders', 'Mumbai', '27', true, 'Mumbai', '27',
  'Seller', 'Ahmedabad', '24AAACS1234A1Z8', '24', 'Immediate', 'By Road',
  100, 0, 100, 0, 0, 18, 118, 118, 0);
select is((select invoice_no from public.invoices where id = '00000000-0000-0000-0000-0000000000f1'), '2026-27/1000', 'invoice_no generated');
select is((select fy from public.invoices where id = '00000000-0000-0000-0000-0000000000f1'), '2026-27', 'fy generated from date');
select is((select tax_type from public.invoices where id = '00000000-0000-0000-0000-0000000000f1'), 'IGST', 'other state is IGST');
select is((select search_text from public.invoices where id = '00000000-0000-0000-0000-0000000000f1'), '2026-27/1000 abc traders', 'search text');
select throws_ok(
  $$ update public.invoices set grand_total = 117 where id = '00000000-0000-0000-0000-0000000000f1' $$,
  '23514', null, 'grand total must be the rounded exact total');
select throws_ok(
  $$ update public.invoices set igst_total = 0, cgst_total = 9, sgst_total = 9 where id = '00000000-0000-0000-0000-0000000000f1' $$,
  '23514', null, 'CGST/SGST not allowed for another state');
select throws_ok(
  $$ update public.invoices set ship_same = true, ship_address = 'Elsewhere' where id = '00000000-0000-0000-0000-0000000000f1' $$,
  '23514', null, 'same-as-billing must copy the billing address');

-- Line arithmetic
select lives_ok(
  $$ insert into public.invoice_lines (invoice_id, position, item_name, hsn, qty, unit, price, gst_rate, amount, gst_amount)
     values ('00000000-0000-0000-0000-0000000000f1', 1, 'Pipe', '7306', 2.333, 'Mtr', 10.25, 18, 23.91325, 4.304385) $$,
  'exact line accepted');
select throws_ok(
  $$ insert into public.invoice_lines (invoice_id, position, item_name, hsn, qty, unit, price, gst_rate, amount, gst_amount)
     values ('00000000-0000-0000-0000-0000000000f1', 2, 'Pipe', '7306', 2.333, 'Mtr', 10.25, 18, 23.91, 4.3038) $$,
  '23514', null, 'rounded line amount refused');
select throws_ok(
  $$ insert into public.invoice_lines (invoice_id, position, item_name, hsn, qty, unit, price, gst_rate, amount, gst_amount)
     values ('00000000-0000-0000-0000-0000000000f1', 3, 'Pipe', '7306', 2.3335, 'Mtr', 10, 0, 23.335, 0) $$,
  '23514', null, 'a 4th quantity decimal is caught (column rounds it, amount check fails)');

select * from finish();
rollback;
