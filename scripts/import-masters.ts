// Usage:
//   npm run import:masters -- --template [masters-template.xlsx]
//   npm run import:masters -- data.xlsx                          (check only, changes nothing)
//   npm run import:masters -- data.xlsx --apply --confirm-wipe   (needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { SHEETS, validateMasters, type SheetRow } from './masters';

const args = process.argv.slice(2);

if (args[0] === '--template') {
  const out = args[1] ?? 'masters-template.xlsx';
  const wb = XLSX.utils.book_new();
  for (const s of Object.values(SHEETS)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...s.headers]]), s.name);
  writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  console.log(`Template written to ${out}. Format the HSN and GSTIN columns as Text before typing.`);
  process.exit(0);
}

const file = args[0];
if (!file) {
  console.error('Usage: npm run import:masters -- <file.xlsx> [--apply --confirm-wipe] | --template [out.xlsx]');
  process.exit(1);
}

const wb = XLSX.read(readFileSync(file), { type: 'buffer' });
function rows(name: string): SheetRow[] {
  const ws = wb.Sheets[name];
  if (!ws) {
    console.error(`The file has no sheet called "${name}".`);
    process.exit(1);
  }
  return XLSX.utils.sheet_to_json<SheetRow>(ws, { raw: false, defval: '' });
}

const result = validateMasters({
  companies: rows(SHEETS.companies.name),
  items: rows(SHEETS.items.name),
  charges: rows(SHEETS.charges.name),
});
console.log(`Checked ${result.companies.length} companies, ${result.items.length} items, ${result.chargeTypes.length} charge types.`);

if (result.errors.length > 0) {
  console.error(`\n${result.errors.length} problem(s) found. Nothing was imported:\n`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
}
if (!args.includes('--apply')) {
  console.log('\nNo problems found. Re-run with --apply --confirm-wipe to replace the data.');
  process.exit(0);
}
if (!args.includes('--confirm-wipe')) {
  console.error('--apply also needs --confirm-wipe: it DELETES all invoices, drafts, the change log and all master lists, then loads this file.');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in this terminal only. Never put the service role key in a file.');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.rpc('go_live_reset', {
  p_companies: result.companies,
  p_items: result.items,
  p_charge_types: result.chargeTypes,
});
if (error) {
  console.error(`Import failed. Nothing was changed: ${error.message}`);
  process.exit(1);
}
console.log('Done. Loaded:', data);
