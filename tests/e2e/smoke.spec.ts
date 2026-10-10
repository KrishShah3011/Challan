import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { login, pickOption } from './helpers';

test('full journey: create, check, edit, history, export, delete', async ({ page }) => {
  await login(page);
  await page.goto('/invoices/new');
  await pickOption(page, 'Company', 'ABC', /ABC Traders · 24AABCA1111D1ZR/);

  const first = page.getByTestId('item-card').nth(0);
  await pickOption(first, 'Item', 'GI Wire', /GI Wire 12 gauge/);
  await first.getByLabel('Quantity').fill('10');
  await page.getByRole('button', { name: '+ Add item' }).click();
  const second = page.getByTestId('item-card').nth(1);
  await pickOption(second, 'Item', 'Rough', /Rough Diamond/);
  await second.getByLabel('Quantity').fill('1');
  await page.getByRole('button', { name: '+ Add charge' }).click();
  const charge = page.getByTestId('charge-row').nth(0);
  await pickOption(charge, 'Charge type', 'Loading', /Loading/);
  await charge.getByLabel('Amount (before GST)').fill('50');

  // 855.00 @18% = 153.90; 5000 @0.25% = 12.50; 50 @5% = 2.50 → 5905 + 168.90 = 6073.90 → 6074
  await expect(page.getByTestId('grand-total')).toHaveText('₹6,074.00');
  await expect(page.getByTestId('amount-words')).toHaveText('Rupees Six Thousand Seventy-Four Only');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const heading = page.getByRole('heading', { name: /^Invoice .+ saved$/ });
  await expect(heading).toBeVisible();
  const no = ((await heading.textContent()) ?? '').replace(/^Invoice /, '').replace(/ saved$/, '');

  await page.getByRole('link', { name: 'View' }).click();
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByTestId('item-card').nth(0).getByLabel('Quantity').fill('20');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Invoice ${no} saved` })).toBeVisible();
  await page.getByRole('link', { name: 'View' }).click();
  await expect(page.getByText(/^Created .+ · Edited .+$/)).toBeVisible();
  await expect(page.getByTestId('grand-total')).toHaveText('₹7,083.00'); // 1710 + 307.80 + 5000 + 12.50 + 50 + 2.50 = 7082.80

  await page.goto('/invoices');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Excel' }).click()]);
  const wb = XLSX.read(readFileSync(await download.path()), { type: 'buffer' });
  expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Invoices).map((r) => r['Invoice No'])).toContain(no);

  await page.getByLabel('Search by number or company').fill(no);
  await page.getByTestId('invoice-row').filter({ hasText: no }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  const serial = String(Number(no.split('/')[1]));
  await page.getByRole('dialog').getByLabel(`Type ${serial} to confirm`).fill(serial);
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible();
});
