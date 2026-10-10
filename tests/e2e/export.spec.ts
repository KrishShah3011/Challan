import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { createInvoice, login } from './helpers';

test('downloads every invoice as one Excel file', async ({ page }) => {
  await login(page);
  const no = await createInvoice(page, { companySearch: 'Patel', company: /Patel Hardware Mart/, itemSearch: 'Corrugated', item: /Corrugated Box/, qty: '10' });

  await page.goto('/invoices');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Excel' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^invoices-\d{4}-\d{2}-\d{2}\.xlsx$/);

  const wb = XLSX.read(readFileSync(await download.path()), { type: 'buffer', cellNF: true });
  expect(wb.SheetNames).toEqual(['Invoices', 'Items', 'Charges']);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Invoices);
  expect(rows.map((r) => r['Invoice No'])).toContain(no);
  expect(wb.Sheets.Invoices.A2.t).toBe('s');
  expect(wb.Sheets.Invoices.B2.z).toBe('dd-mmm-yyyy');
});

test('Home has a Download Excel tile', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('main').getByRole('button', { name: 'Download Excel' })).toBeVisible();
});
