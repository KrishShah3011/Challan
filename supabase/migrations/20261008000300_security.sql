alter table public.seller enable row level security;
alter table public.companies enable row level security;
alter table public.items enable row level security;
alter table public.charge_types enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_charges enable row level security;
alter table public.drafts enable row level security;
alter table public.audit_log enable row level security;

-- Start from nothing, then grant exactly what each role needs.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select, insert, update on public.seller, public.companies, public.items, public.charge_types to authenticated;
grant select, insert, update, delete on public.drafts to authenticated;
grant select on public.invoices, public.invoice_lines, public.invoice_charges, public.audit_log to authenticated;

grant execute on function public.save_invoice(jsonb, timestamptz) to authenticated;
grant execute on function public.delete_invoice(uuid, text) to authenticated;
grant execute on function public.next_serial(text) to authenticated;
-- Evaluated as the calling user inside generated columns and the company/item name indexes.
grant execute on function public.fy_of(date) to authenticated;
grant execute on function public.format_invoice_no(text, integer) to authenticated;
grant execute on function public.normalize_name(text) to authenticated;
grant execute on function public.keep_alive() to anon, authenticated;

-- One shared login: every authenticated request sees everything. Grants above limit the operations.
create policy authenticated_all on public.seller for all to authenticated using (true) with check (true);
create policy authenticated_all on public.companies for all to authenticated using (true) with check (true);
create policy authenticated_all on public.items for all to authenticated using (true) with check (true);
create policy authenticated_all on public.charge_types for all to authenticated using (true) with check (true);
create policy authenticated_all on public.drafts for all to authenticated using (true) with check (true);
create policy authenticated_read on public.invoices for select to authenticated using (true);
create policy authenticated_read on public.invoice_lines for select to authenticated using (true);
create policy authenticated_read on public.invoice_charges for select to authenticated using (true);
create policy authenticated_read on public.audit_log for select to authenticated using (true);
