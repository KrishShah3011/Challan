-- Go-live: replace all dummy data with the real master lists, all or nothing.
-- Only the service role (the import script on the owner's machine) may run this.
create function public.go_live_reset(p_companies jsonb, p_items jsonb, p_charge_types jsonb) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  truncate public.invoice_lines, public.invoice_charges, public.invoices, public.drafts, public.audit_log,
           public.companies, public.items, public.charge_types
    restart identity;

  insert into public.companies (name, address, gstin, state_code)
  select btrim(c->>'name'), btrim(c->>'address'), nullif(btrim(c->>'gstin'), ''), c->>'state_code'
  from jsonb_array_elements(p_companies) c;

  insert into public.items (name, description, hsn, unit, gst_rate, default_price)
  select btrim(i->>'name'), coalesce(btrim(i->>'description'), ''), i->>'hsn', btrim(i->>'unit'),
         (i->>'gst_rate')::numeric, nullif(i->>'default_price', '')::numeric
  from jsonb_array_elements(p_items) i;

  insert into public.charge_types (name, gst_rate)
  select btrim(t->>'name'), (t->>'gst_rate')::numeric
  from jsonb_array_elements(p_charge_types) t;

  return jsonb_build_object(
    'companies', jsonb_array_length(p_companies),
    'items', jsonb_array_length(p_items),
    'charge_types', jsonb_array_length(p_charge_types));
end
$$;

-- Supabase grants new functions to anon/authenticated by default; take that back.
revoke execute on function public.go_live_reset(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.go_live_reset(jsonb, jsonb, jsonb) to service_role;
