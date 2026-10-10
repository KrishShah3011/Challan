begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Something to wipe
select public.save_invoice('{"id":"00000000-0000-0000-0000-0000000000e1","invoice_date":"2026-10-08","serial":null,"company_id":null,"buyer_name":"ABC Traders","buyer_address":"Mumbai","buyer_gstin":"27AABCA2222E1ZD","buyer_state_code":"27","ship_same":true,"ship_address":"Mumbai","place_of_supply":"27","payment_terms":"Immediate","transport_mode":"By Road","vehicle_no":null,"items_total":"200","charges_total":"50","taxable_total":"250","cgst_total":"0","sgst_total":"0","igst_total":"45","exact_total":"295","grand_total":"295","round_off":"0","lines":[{"item_id":null,"item_name":"MS Pipe 1 inch","description":"","hsn":"7306","qty":"2","unit":"Mtr","price":"100","gst_rate":"18","amount":"200","gst_amount":"36"}],"charges":[{"charge_type_id":null,"name":"Freight","amount":"50","gst_rate":"18","gst_amount":"9"}]}'::jsonb, null);
insert into public.drafts (id, label, data) values (gen_random_uuid(), 'x', '{}');

select throws_ok(
  $$ select public.go_live_reset('[{"name":"Bad","address":"X","gstin":"24bad","state_code":"24"}]', '[]', '[]') $$,
  '23514', null, 'invalid data is refused');
select is((select count(*)::int from public.invoices), 1, 'nothing wiped after a refused import');
select is((select count(*)::int from public.companies), 5, 'companies untouched after a refused import');

select is(
  public.go_live_reset(
    '[{"name":"Real Buyer","address":"Vadodara","gstin":"24AABCA1111D1ZR","state_code":"24"},{"name":"Cash Buyer","address":"Jaipur","gstin":null,"state_code":"08"}]',
    '[{"name":"Real Item","description":"","hsn":"091030","unit":"Kg","gst_rate":"5","default_price":null}]',
    '[{"name":"Freight","gst_rate":"18"}]'),
  '{"companies": 2, "items": 1, "charge_types": 1}'::jsonb,
  'reports what was loaded');
select is((select count(*)::int from public.invoices), 0, 'invoices wiped');
select is((select count(*)::int from public.invoice_lines), 0, 'lines wiped');
select is((select count(*)::int from public.drafts), 0, 'drafts wiped');
select is((select count(*)::int from public.companies), 2, 'companies replaced');
select is((select hsn from public.items), '091030', 'HSN leading zero kept');
select is((select count(*)::int from public.audit_log), 4, 'log restarts with only the loaded rows');
select is((select name from public.seller), 'Shree Demo Industries', 'our company details are kept');

set local role authenticated;
select throws_ok($$ select public.go_live_reset('[]', '[]', '[]') $$, '42501', null, 'the app itself cannot run the reset');
reset role;

select * from finish();
rollback;
