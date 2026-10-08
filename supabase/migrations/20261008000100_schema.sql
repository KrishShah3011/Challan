-- Helpers ---------------------------------------------------------------------------

-- Indian financial year of a date: 2026-04-01 .. 2027-03-31 -> '2026-27'.
create function public.fy_of(d date) returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select case
    when extract(month from d) >= 4 then
      extract(year from d)::int::text || '-' || lpad(((extract(year from d)::int + 1) % 100)::text, 2, '0')
    else
      (extract(year from d)::int - 1)::text || '-' || lpad((extract(year from d)::int % 100)::text, 2, '0')
  end
$$;

-- '2026-27/001'. lpad would truncate 1000 to '100', so 1000 and above print in full.
create function public.format_invoice_no(p_fy text, p_serial integer) returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select p_fy || '/' || case when p_serial < 1000 then lpad(p_serial::text, 3, '0') else p_serial::text end
$$;

create function public.normalize_name(t text) returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select lower(regexp_replace(btrim(t), '\s+', ' ', 'g'))
$$;

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end
$$;

-- Domains ---------------------------------------------------------------------------

create domain public.gstin_t as text
  check (value ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
create domain public.state_code_t as text
  check (value ~ '^(0[1-9]|[12][0-9]|3[0-8]|97)$');
create domain public.hsn_t as text
  check (value ~ '^[0-9]{4}([0-9]{2}){0,2}$');
create domain public.gst_rate_t as numeric(5,2)
  check (value >= 0 and value <= 100);

-- Our company (exactly one row) -----------------------------------------------------

create table public.seller (
  id smallint primary key default 1 check (id = 1),
  name text not null check (btrim(name) <> ''),
  address text not null check (btrim(address) <> ''),
  gstin public.gstin_t not null check (left(gstin, 2) ~ '^(0[1-9]|[12][0-9]|3[0-8]|97)$'),
  state_code text generated always as (left(gstin, 2)) stored,
  phone text not null default '',
  updated_at timestamptz not null default now()
);

-- Master lists ----------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  address text not null check (btrim(address) <> ''),
  gstin public.gstin_t,
  state_code public.state_code_t not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_state_matches_gstin check (gstin is null or state_code = left(gstin, 2))
);
-- Same name is fine with a different GSTIN; same name with both GSTINs empty is not.
create unique index companies_active_name_gstin
  on public.companies (public.normalize_name(name), coalesce(gstin, ''))
  where not archived;

create table public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  hsn public.hsn_t not null,
  unit text not null check (btrim(unit) <> ''),
  gst_rate public.gst_rate_t not null,
  default_price numeric(14,2) check (default_price >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index items_active_name on public.items (public.normalize_name(name)) where not archived;

create table public.charge_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  gst_rate public.gst_rate_t not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index charge_types_active_name on public.charge_types (public.normalize_name(name)) where not archived;

-- Invoices (snapshots: nothing here changes when master lists change) ----------------

create table public.invoices (
  id uuid primary key,
  invoice_date date not null,
  fy text generated always as (public.fy_of(invoice_date)) stored,
  serial integer not null check (serial > 0 and serial < 100000000),
  invoice_no text generated always as (public.format_invoice_no(public.fy_of(invoice_date), serial)) stored,
  company_id uuid references public.companies (id),
  buyer_name text not null check (btrim(buyer_name) <> ''),
  buyer_address text not null check (btrim(buyer_address) <> ''),
  buyer_gstin public.gstin_t,
  buyer_state_code public.state_code_t not null,
  ship_same boolean not null,
  ship_address text not null check (btrim(ship_address) <> ''),
  place_of_supply public.state_code_t not null,
  seller_name text not null,
  seller_address text not null,
  seller_gstin public.gstin_t not null,
  seller_state_code public.state_code_t not null,
  tax_type text generated always as (
    case when seller_state_code = place_of_supply then 'CGST_SGST' else 'IGST' end) stored,
  payment_terms text not null check (btrim(payment_terms) <> ''),
  transport_mode text not null check (btrim(transport_mode) <> ''),
  vehicle_no text,
  items_total numeric not null,
  charges_total numeric not null,
  taxable_total numeric not null,
  cgst_total numeric not null,
  sgst_total numeric not null,
  igst_total numeric not null,
  exact_total numeric not null,
  grand_total numeric not null,
  round_off numeric not null,
  search_text text generated always as (
    lower(public.format_invoice_no(public.fy_of(invoice_date), serial) || ' ' || buyer_name)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_fy_serial_key unique (fy, serial),
  constraint invoices_ship_same check (not ship_same or ship_address = buyer_address),
  constraint invoices_taxable check (taxable_total = items_total + charges_total),
  constraint invoices_exact check (exact_total = taxable_total + cgst_total + sgst_total + igst_total),
  constraint invoices_grand check (grand_total = round(exact_total, 0)),
  constraint invoices_round_off check (round_off = grand_total - exact_total),
  constraint invoices_tax_split check (
    case when seller_state_code = place_of_supply
      then igst_total = 0 and cgst_total = sgst_total
      else cgst_total = 0 and sgst_total = 0
    end)
);
create index invoices_list_order on public.invoices (invoice_date desc, fy desc, serial desc);

-- Checks use multiplication only (never division), so they are exact at any size.
create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position smallint not null check (position > 0),
  item_id uuid references public.items (id),
  item_name text not null check (btrim(item_name) <> ''),
  description text not null default '',
  hsn public.hsn_t not null,
  qty numeric(14,3) not null check (qty > 0),
  unit text not null check (btrim(unit) <> ''),
  price numeric(14,2) not null check (price >= 0),
  gst_rate public.gst_rate_t not null,
  amount numeric not null,
  gst_amount numeric not null,
  constraint invoice_lines_position_key unique (invoice_id, position),
  constraint invoice_lines_amount check (amount = qty * price),
  constraint invoice_lines_gst check (gst_amount * 100 = amount * gst_rate)
);

create table public.invoice_charges (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position smallint not null check (position > 0),
  charge_type_id uuid references public.charge_types (id),
  name text not null check (btrim(name) <> ''),
  amount numeric(14,2) not null check (amount > 0),
  gst_rate public.gst_rate_t not null,
  gst_amount numeric not null,
  constraint invoice_charges_position_key unique (invoice_id, position),
  constraint invoice_charges_gst check (gst_amount * 100 = amount * gst_rate)
);

-- Drafts and change log -------------------------------------------------------------

create table public.drafts (
  id uuid primary key,
  label text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb
);
create index audit_log_row on public.audit_log (table_name, row_id, at);

-- updated_at maintenance (invoices are stamped by save_invoice instead) ---------------

create trigger set_updated_at before update on public.seller for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.items for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.charge_types for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.drafts for each row execute function public.set_updated_at();
