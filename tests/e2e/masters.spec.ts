import { expect, test } from '@playwright/test';
import { login, pickOption } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/lists');
});

test('adds a company, refuses a look-alike, removes and restores it', async ({ page }, info) => {
  const name = `E2E Buyer ${info.project.name}`;
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: '+ Add company' }).click();
  await dialog.getByLabel('Company name').fill(name);
  await dialog.getByLabel('Address').fill('MG Road, Bengaluru');
  await pickOption(dialog, 'State', 'Karna', /Karnataka/);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('master-row').filter({ hasText: name })).toHaveCount(1);

  await page.getByRole('button', { name: '+ Add company' }).click();
  await dialog.getByLabel('Company name').fill(name.toUpperCase());
  await dialog.getByLabel('Address').fill('Elsewhere');
  await pickOption(dialog, 'State', 'Karna', /Karnataka/);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText(/already exists/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await page.getByTestId('master-row').filter({ hasText: name }).getByRole('button', { name: 'Remove from list' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByTestId('master-row').filter({ hasText: name })).toHaveCount(0);

  await page.getByLabel('Show removed').check();
  await page.getByTestId('master-row').filter({ hasText: name }).getByRole('button', { name: 'Restore' }).click();
  await page.getByLabel('Show removed').uncheck();
  await expect(page.getByTestId('master-row').filter({ hasText: name })).toHaveCount(1);
});

test('explains a bad HSN and keeps a leading zero', async ({ page }, info) => {
  const name = `E2E Item ${info.project.name}`;
  const dialog = page.getByRole('dialog');
  await page.getByRole('tab', { name: 'Items' }).click();
  await page.getByRole('button', { name: '+ Add item' }).click();
  await dialog.getByLabel('Item name').fill(name);
  await dialog.getByLabel('HSN code').fill('12345');
  await dialog.getByLabel('GST rate (%)').fill('18');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('HSN must be 4, 6 or 8 digits.')).toBeVisible();
  await dialog.getByLabel('HSN code').fill('091030');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('master-row').filter({ hasText: name })).toContainText('HSN 091030');
});

test('adds a charge type', async ({ page }, info) => {
  const name = `E2E Charge ${info.project.name}`;
  const dialog = page.getByRole('dialog');
  await page.getByRole('tab', { name: 'Charges' }).click();
  await page.getByRole('button', { name: '+ Add charge' }).click();
  await dialog.getByLabel('Charge name').fill(name);
  await dialog.getByLabel('GST rate (%)').fill('5');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('master-row').filter({ hasText: name })).toContainText('GST 5%');
});
