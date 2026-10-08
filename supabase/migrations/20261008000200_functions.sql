-- Full invoice (header + lines + charges) as JSON, for the change log. Internal only.
create function public.invoice_json(p_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select to_jsonb(i) || jsonb_build_object(
    'lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.position)
                       from public.invoice_lines l where l.invoice_id = i.id), '[]'::jsonb),
    'charges', coalesce((select jsonb_agg(to_jsonb(c) order by c.position)
                         from public.invoice_charges c where c.invoice_id = i.id), '[]'::jsonb))
  from public.invoices i
  where i.id = p_id
$$;

create function public.next_serial(p_fy text) returns integer
language sql stable security definer
set search_path = ''
as $$
  select coalesce(max(serial), 0) + 1 from public.invoices where fy = p_fy
$$;

create function public.keep_alive() returns integer
language sql stable
set search_path = ''
as $$
  select 1
$$;

-- Change log for master lists and our company. Runs inside the same transaction as the change.
create function public.audit_row() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (table_name, row_id, action, old_data, new_data)
    values (tg_table_name, new.id::text, tg_op, null, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (table_name, row_id, action, old_data, new_data)
    values (tg_table_name, new.id::text, tg_op, to_jsonb(old), to_jsonb(new));
  else
    insert into public.audit_log (table_name, row_id, action, old_data, new_data)
    values (tg_table_name, old.id::text, tg_op, to_jsonb(old), null);
  end if;
  return null;
end
$$;

create trigger audit after insert or update or delete on public.seller for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.companies for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.items for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.charge_types for each row execute function public.audit_row();

-- Spec §5.1. One transaction: header + lines + charges + log + draft removal, or nothing.
create function public.save_invoice(p jsonb, p_expected_updated_at timestamptz default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := (p->>'id')::uuid;
  v_date date := (p->>'invoice_date')::date;
  v_serial integer := nullif(p->>'serial', '')::integer;
  v_ship_same boolean := coalesce((p->>'ship_same')::boolean, true);
  v_now timestamptz := clock_timestamp();
  v_fy text;
  v_seller public.seller;
  v_existing public.invoices;
  v_is_new boolean;
  v_dup public.invoices;
  v_old jsonb;
  v_saved public.invoices;
  v_items numeric;
  v_charges numeric;
  v_gst numeric;
begin
  if v_id is null or v_date is null then
    raise exception using message = 'BAD_REQUEST', detail = '{"reason": "id and invoice_date are required"}';
  end if;
  if jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') = 0 then
    raise exception using message = 'NO_ITEMS';
  end if;

  v_fy := public.fy_of(v_date);
  -- Serialize saves within one financial year so the next number is never handed out twice.
  perform pg_advisory_xact_lock(hashtext('invoice_fy:' || v_fy));

  select * into v_seller from public.seller where id = 1;
  if not found then
    raise exception using message = 'NO_SELLER';
  end if;

  select * into v_existing from public.invoices where id = v_id for update;
  v_is_new := not found;

  if v_is_new and p_expected_updated_at is not null then
    raise exception using message = 'INVOICE_DELETED';
  end if;
  if not v_is_new and p_expected_updated_at is null then
    raise exception using message = 'ALREADY_SAVED',
      detail = jsonb_build_object('invoice_no', v_existing.invoice_no)::text;
  end if;
  if not v_is_new and v_existing.updated_at <> p_expected_updated_at then
    raise exception using message = 'EDIT_CONFLICT',
      detail = jsonb_build_object('updated_at', v_existing.updated_at)::text;
  end if;

  if v_serial is null then
    if not v_is_new and v_existing.fy = v_fy then
      v_serial := v_existing.serial;           -- editing within the same year keeps the number
    else
      v_serial := public.next_serial(v_fy);    -- safe: this transaction holds the year's lock
    end if;
  else
    select * into v_dup from public.invoices where fy = v_fy and serial = v_serial and id <> v_id;
    if found then
      raise exception using message = 'DUPLICATE_NUMBER',
        detail = jsonb_build_object('invoice_no', v_dup.invoice_no, 'buyer_name', v_dup.buyer_name,
                                    'invoice_date', v_dup.invoice_date)::text;
    end if;
  end if;

  if v_is_new then
    insert into public.invoices (
      id, invoice_date, serial, company_id, buyer_name, buyer_address, buyer_gstin, buyer_state_code,
      ship_same, ship_address, place_of_supply, seller_name, seller_address, seller_gstin, seller_state_code,
      payment_terms, transport_mode, vehicle_no,
      items_total, charges_total, taxable_total, cgst_total, sgst_total, igst_total,
      exact_total, grand_total, round_off, created_at, updated_at)
    values (
      v_id, v_date, v_serial, nullif(p->>'company_id', '')::uuid, p->>'buyer_name', p->>'buyer_address',
      nullif(p->>'buyer_gstin', ''), p->>'buyer_state_code',
      v_ship_same, case when v_ship_same then p->>'buyer_address' else p->>'ship_address' end, p->>'place_of_supply',
      v_seller.name, v_seller.address, v_seller.gstin, v_seller.state_code,
      p->>'payment_terms', p->>'transport_mode', nullif(btrim(p->>'vehicle_no'), ''),
      (p->>'items_total')::numeric, (p->>'charges_total')::numeric, (p->>'taxable_total')::numeric,
      (p->>'cgst_total')::numeric, (p->>'sgst_total')::numeric, (p->>'igst_total')::numeric,
      (p->>'exact_total')::numeric, (p->>'grand_total')::numeric, (p->>'round_off')::numeric,
      v_now, v_now);
  else
    v_old := public.invoice_json(v_id);
    -- The seller snapshot is deliberately left unchanged on edit.
    update public.invoices set
      invoice_date = v_date,
      serial = v_serial,
      company_id = nullif(p->>'company_id', '')::uuid,
      buyer_name = p->>'buyer_name',
      buyer_address = p->>'buyer_address',
      buyer_gstin = nullif(p->>'buyer_gstin', ''),
      buyer_state_code = p->>'buyer_state_code',
      ship_same = v_ship_same,
      ship_address = case when v_ship_same then p->>'buyer_address' else p->>'ship_address' end,
      place_of_supply = p->>'place_of_supply',
      payment_terms = p->>'payment_terms',
      transport_mode = p->>'transport_mode',
      vehicle_no = nullif(btrim(p->>'vehicle_no'), ''),
      items_total = (p->>'items_total')::numeric,
      charges_total = (p->>'charges_total')::numeric,
      taxable_total = (p->>'taxable_total')::numeric,
      cgst_total = (p->>'cgst_total')::numeric,
      sgst_total = (p->>'sgst_total')::numeric,
      igst_total = (p->>'igst_total')::numeric,
      exact_total = (p->>'exact_total')::numeric,
      grand_total = (p->>'grand_total')::numeric,
      round_off = (p->>'round_off')::numeric,
      updated_at = v_now
    where id = v_id;
    delete from public.invoice_lines where invoice_id = v_id;
    delete from public.invoice_charges where invoice_id = v_id;
  end if;

  insert into public.invoice_lines (invoice_id, position, item_id, item_name, description, hsn, qty, unit, price,
                                    gst_rate, amount, gst_amount)
  select v_id, e.ord, nullif(e.v->>'item_id', '')::uuid, e.v->>'item_name', coalesce(e.v->>'description', ''),
         e.v->>'hsn', (e.v->>'qty')::numeric, e.v->>'unit', (e.v->>'price')::numeric, (e.v->>'gst_rate')::numeric,
         (e.v->>'amount')::numeric, (e.v->>'gst_amount')::numeric
  from jsonb_array_elements(p->'lines') with ordinality as e(v, ord);

  insert into public.invoice_charges (invoice_id, position, charge_type_id, name, amount, gst_rate, gst_amount)
  select v_id, e.ord, nullif(e.v->>'charge_type_id', '')::uuid, e.v->>'name',
         (e.v->>'amount')::numeric, (e.v->>'gst_rate')::numeric, (e.v->>'gst_amount')::numeric
  from jsonb_array_elements(coalesce(p->'charges', '[]'::jsonb)) with ordinality as e(v, ord);

  -- Header totals must equal what was actually stored line by line.
  select coalesce(sum(amount), 0), coalesce(sum(gst_amount), 0) into v_items, v_gst
  from public.invoice_lines where invoice_id = v_id;
  select coalesce(sum(amount), 0), v_gst + coalesce(sum(gst_amount), 0) into v_charges, v_gst
  from public.invoice_charges where invoice_id = v_id;
  select * into v_saved from public.invoices where id = v_id;
  if v_saved.items_total <> v_items or v_saved.charges_total <> v_charges
     or v_saved.cgst_total + v_saved.sgst_total + v_saved.igst_total <> v_gst then
    raise exception using message = 'TOTALS_MISMATCH',
      detail = jsonb_build_object('items', v_items, 'charges', v_charges, 'gst', v_gst)::text;
  end if;

  insert into public.audit_log (table_name, row_id, action, old_data, new_data)
  values ('invoices', v_id::text, case when v_is_new then 'INSERT' else 'UPDATE' end, v_old, public.invoice_json(v_id));

  delete from public.drafts where id = v_id;

  return jsonb_build_object('id', v_saved.id, 'invoice_no', v_saved.invoice_no, 'serial', v_saved.serial,
                            'updated_at', v_saved.updated_at);
end
$$;

-- Spec §5.2. The typed confirmation may be the full number or the serial with/without leading zeros.
create function public.delete_invoice(p_id uuid, p_typed text) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_typed text := btrim(coalesce(p_typed, ''));
begin
  select * into v_inv from public.invoices where id = p_id for update;
  if not found then
    raise exception using message = 'NOT_FOUND';
  end if;
  if not (v_typed = v_inv.invoice_no or (v_typed ~ '^[0-9]{1,9}$' and v_typed::bigint = v_inv.serial)) then
    raise exception using message = 'CONFIRM_MISMATCH';
  end if;

  insert into public.audit_log (table_name, row_id, action, old_data, new_data)
  values ('invoices', p_id::text, 'DELETE', public.invoice_json(p_id), null);

  delete from public.invoices where id = p_id;   -- lines and charges cascade
  delete from public.drafts where id = p_id;
  return v_inv.invoice_no;
end
$$;
