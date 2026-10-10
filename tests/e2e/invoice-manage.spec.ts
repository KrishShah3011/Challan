import { expect, test } from '@playwright/test';
import { createInvoice, login } from './helpers';

test('finds, edits and deletes an invoice', async ({ page }) => {
  await login(page);
  const no = await createInvoice(page, { companySearch: 'Mehta', company: /Mehta Engineering Works/, itemSearch: 'Cement', item: /Cement Bag 50 kg/, qty: '3' });
  const serial = String(Number(no.split('/')[1]));

  await page.goto('/invoices');
  await page.getByLabel('Search by number or company').fill(no);
  const row = page.getByTestId('invoice-row').filter({ hasText: no });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page.getByRole('heading', { name: `Invoice ${no}`, level: 1 })).toBeVisible();
  await expect(page.getByText(/^Created \d{2}-[A-Z][a-z]{2}-\d{4} \d{2}:\d{2}$/)).toBeVisible();

  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByLabel('Invoice number')).toHaveValue(no.split('/')[1]);
  await page.getByTestId('item-card').nth(0).getByLabel('Quantity').fill('4');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Invoice ${no} saved` })).toBeVisible();
  await page.getByRole('link', { name: 'View' }).click();
  await expect(page.getByText(/^Created .+ · Edited .+$/)).toBeVisible();
  await expect(page.getByText('4 Nos')).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(`Type ${serial} to confirm`).fill(String(Number(serial) + 1));
  await expect(dialog.getByRole('button', { name: 'Delete' })).toBeDisabled();
  await dialog.getByLabel(`Type ${serial} to confirm`).fill(serial);
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible();
  await page.getByLabel('Search by number or company').fill(no);
  await expect(page.getByText('No invoice matches your search.')).toBeVisible();
});

test('search copes with commas and percent signs', async ({ page }) => {
  await login(page);
  await page.goto('/invoices');
  await page.getByLabel('Search by number or company').fill('ABC, 50%_');
  await expect(page.getByText('No invoice matches your search.')).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
});
