begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Not logged in
set local role anon;
select throws_ok($$ select * from public.companies $$, '42501', null, 'anon cannot read companies');
select throws_ok($$ select * from public.invoices $$, '42501', null, 'anon cannot read invoices');
select throws_ok($$ select * from public.seller $$, '42501', null, 'anon cannot read seller');
select throws_ok($$ select * from public.drafts $$, '42501', null, 'anon cannot read drafts');
select throws_ok($$ select * from public.audit_log $$, '42501', null, 'anon cannot read the log');
select throws_ok($$ select public.next_serial('2026-27') $$, '42501', null, 'anon cannot call next_serial');
select throws_ok($$ select public.delete_invoice(gen_random_uuid(), '1') $$, '42501', null, 'anon cannot delete invoices');
select is(public.keep_alive(), 1, 'anon can call keep_alive');
reset role;

-- Logged in
set local role authenticated;
set local request.jwt.claims to '{"role": "authenticated"}';
select isnt_empty($$ select * from public.companies $$, 'authenticated reads companies');
select lives_ok($$ insert into public.companies (name, address, state_code) values ('RLS Test Co', 'Pune', '27') $$,
  'authenticated adds a company');
select lives_ok($$ update public.companies set archived = true where name = 'RLS Test Co' $$,
  'authenticated archives a company');
select throws_ok($$ delete from public.companies where name = 'RLS Test Co' $$, '42501', null, 'no hard delete of companies');
select throws_ok($$ delete from public.items $$, '42501', null, 'no hard delete of items');
select throws_ok($$ delete from public.seller $$, '42501', null, 'no delete of seller');
select throws_ok($$ insert into public.invoices (id) values (gen_random_uuid()) $$, '42501', null, 'no direct invoice insert');
select throws_ok($$ update public.invoices set buyer_name = 'X' $$, '42501', null, 'no direct invoice update');
select throws_ok($$ delete from public.invoice_lines $$, '42501', null, 'no direct line delete');
select throws_ok($$ insert into public.audit_log (table_name, row_id, action) values ('x', 'y', 'INSERT') $$,
  '42501', null, 'the log cannot be written directly');
select throws_ok($$ delete from public.audit_log $$, '42501', null, 'the log cannot be erased');
select lives_ok($$ insert into public.drafts (id, label, data) values (gen_random_uuid(), 'x', '{}') $$, 'drafts writable');
select lives_ok($$ select public.next_serial('2026-27') $$, 'next_serial callable');
select lives_ok($$ select public.save_invoice('{"id":"00000000-0000-0000-0000-0000000000d1","invoice_date":"2026-10-08","serial":null,"company_id":null,"buyer_name":"ABC Traders","buyer_address":"Mumbai","buyer_gstin":"27AABCA2222E1ZD","buyer_state_code":"27","ship_same":true,"ship_address":"Mumbai","place_of_supply":"27","payment_terms":"Immediate","transport_mode":"By Road","vehicle_no":null,"items_total":"200","charges_total":"50","taxable_total":"250","cgst_total":"0","sgst_total":"0","igst_total":"45","exact_total":"295","grand_total":"295","round_off":"0","lines":[{"item_id":null,"item_name":"MS Pipe 1 inch","description":"","hsn":"7306","qty":"2","unit":"Mtr","price":"100","gst_rate":"18","amount":"200","gst_amount":"36"}],"charges":[{"charge_type_id":null,"name":"Freight","amount":"50","gst_rate":"18","gst_amount":"9"}]}'::jsonb, null) $$,
  'authenticated saves through the function');
select is((select count(*)::int from public.audit_log where row_id = '00000000-0000-0000-0000-0000000000d1'), 1,
  'the function writes the log on the user''s behalf');
select throws_ok($$ select public.invoice_json(gen_random_uuid()) $$, '42501', null, 'internal helper is not exposed');
reset role;

-- Catalog check: every table, function and sequence in public needs an explicit decision here.
-- A new object that is not listed (or carries an unexpected grant) fails this section.
create temp table want_table (tbl text, priv text);
insert into want_table values
  ('seller','select'),('seller','insert'),('seller','update'),
  ('companies','select'),('companies','insert'),('companies','update'),
  ('items','select'),('items','insert'),('items','update'),
  ('charge_types','select'),('charge_types','insert'),('charge_types','update'),
  ('drafts','select'),('drafts','insert'),('drafts','update'),('drafts','delete'),
  ('invoices','select'),('invoice_lines','select'),('invoice_charges','select'),('audit_log','select');
-- Decided tables with no grants at all would also need to be listed in want_table_names.
create temp table want_table_names (tbl text);
insert into want_table_names
  values ('seller'),('companies'),('items'),('charge_types'),('drafts'),
         ('invoices'),('invoice_lines'),('invoice_charges'),('audit_log');
create temp table want_fn (fn text, grantee text);
insert into want_fn values
  ('save_invoice','authenticated'),('delete_invoice','authenticated'),('next_serial','authenticated'),
  ('fy_of','authenticated'),('format_invoice_no','authenticated'),('normalize_name','authenticated'),
  ('keep_alive','authenticated'),('keep_alive','anon');
-- Functions that exist but nobody may call directly.
create temp table internal_fn (fn text);
insert into internal_fn values ('invoice_json'),('set_updated_at'),('audit_row');

select is((select coalesce(string_agg(c.relname, ', '), '') from pg_class c
           where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f')
             and c.relname not in (select tbl from want_table_names)),
  '', 'every table in public has a security decision');

select is((select coalesce(string_agg(c.relname || ':' || p, ', '), '') from pg_class c
           cross join unnest(array['select','insert','update','delete','truncate','references','trigger']) p
           where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f')
             and has_table_privilege('anon', c.oid, p)),
  '', 'anon holds no table privilege');

select is((select coalesce(string_agg(c.relname || ':' || p, ', '), '') from pg_class c
           cross join unnest(array['select','insert','update','references']) p
           where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f')
             and has_any_column_privilege('anon', c.oid, p)),
  '', 'anon holds no column privilege');

select is((select coalesce(string_agg(c.relname || ':' || p, ', '), '') from pg_class c
           cross join unnest(array['select','insert','update','delete','truncate','references','trigger']) p
           where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f')
             and has_table_privilege('authenticated', c.oid, p)
                 is distinct from exists (select 1 from want_table w where w.tbl = c.relname and w.priv = p)),
  '', 'authenticated holds exactly the intended table privileges');

select is((select coalesce(string_agg(c.relname || ':' || p, ', '), '') from pg_class c
           cross join unnest(array['select','insert','update','references']) p
           where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f')
             and has_any_column_privilege('authenticated', c.oid, p)
                 is distinct from exists (select 1 from want_table w where w.tbl = c.relname and w.priv = p)),
  '', 'authenticated holds no extra column-level privilege');

select is((select coalesce(string_agg(c.relname || ':' || r, ', '), '') from pg_class c
           cross join unnest(array['anon','authenticated']) r
           cross join unnest(array['usage','select','update']) p
           where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
             and has_sequence_privilege(r, c.oid, p)),
  '', 'neither role has any sequence privilege');

select is((select coalesce(string_agg(f.oid::regprocedure::text, ', '), '') from pg_proc f
           where f.pronamespace = 'public'::regnamespace
             and f.proname not in (select fn from want_fn union select fn from internal_fn)),
  '', 'every function in public has a security decision');

select is((select coalesce(string_agg(f.oid::regprocedure::text, ', '), '') from pg_proc f
           where f.pronamespace = 'public'::regnamespace and f.proname <> 'keep_alive'
             and has_function_privilege('anon', f.oid, 'execute')),
  '', 'anon can execute no function except keep_alive');

select is(has_function_privilege('anon', 'public.keep_alive()', 'execute'), true, 'anon can execute keep_alive');

select is((select coalesce(string_agg(f.oid::regprocedure::text, ', '), '') from pg_proc f
           where f.pronamespace = 'public'::regnamespace
             and has_function_privilege('authenticated', f.oid, 'execute')
                 is distinct from exists (select 1 from want_fn w where w.fn = f.proname and w.grantee = 'authenticated')),
  '', 'authenticated can execute exactly the intended functions');

select * from finish();
rollback;
