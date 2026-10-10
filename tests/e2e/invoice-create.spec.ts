import { expect, test } from '@playwright/test';
import { login, pickOption } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('creates an invoice with two items and a charge', async ({ page }) => {
  await page.getByRole('link', { name: 'New Invoice' }).first().click();
  await expect(page.getByRole('heading', { name: 'New invoice', level: 1 })).toBeVisible();
  await pickOption(page, 'Company', 'Patel', /Patel Hardware Mart/);
  await expect(page.getByText('CGST + SGST (same state)')).toBeVisible();

  const first = page.getByTestId('item-card').nth(0);
  await pickOption(first, 'Item', 'MS Pipe', /MS Pipe 1 inch/);
  await first.getByLabel('Quantity').fill('2');
  await expect(first.getByText('₹240.00')).toBeVisible();

  await page.getByRole('button', { name: '+ Add item' }).click();
  const second = page.getByTestId('item-card').nth(1);
  await pickOption(second, 'Item', 'Turmeric', /Turmeric Powder/);
  await second.getByLabel('Quantity').fill('1.5');

  await page.getByRole('button', { name: '+ Add charge' }).click();
  const charge = page.getByTestId('charge-row').nth(0);
  await pickOption(charge, 'Charge type', 'Freight', /Freight/);
  await charge.getByLabel('Amount (before GST)').fill('100');

  // 480 items + 100 freight; GST 43.20 + 12.00 + 18.00 = 73.20; 653.20 rounds to 653
  await expect(page.getByTestId('grand-total')).toHaveText('₹653.00');
  await expect(page.getByTestId('amount-words')).toHaveText('Rupees Six Hundred Fifty-Three Only');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Invoice \d{4}-\d{2}\/\d{3,} saved$/ })).toBeVisible();
});

test('explains what is missing instead of saving', async ({ page }) => {
  await page.goto('/invoices/new');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Please choose a company.')).toBeVisible();
  await expect(page.getByText('Please choose an item.')).toBeVisible();
});

test('uses IGST for a buyer in another state', async ({ page }) => {
  await page.goto('/invoices/new');
  await pickOption(page, 'Company', '27AABCA2222E1ZD', /Maharashtra/);
  await expect(page.getByText('IGST (other state)')).toBeVisible();
});
