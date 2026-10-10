import { expect, test } from '@playwright/test';
import { login, pickOption } from './helpers';

test('keeps unfinished work in Drafts and resumes it', async ({ page }) => {
  await login(page);
  await page.goto('/invoices/new');
  await pickOption(page, 'Company', 'Ramesh', /Ramesh Kumar & Sons/);
  await expect(page.getByTestId('draft-status')).toHaveText(/^Draft saved \d{2}:\d{2}$/, { timeout: 10_000 });

  await page.getByRole('link', { name: 'Drafts' }).first().click();
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByRole('heading', { name: 'Drafts', level: 1 })).toBeVisible();

  await page.getByTestId('draft-row').filter({ hasText: 'Ramesh Kumar & Sons' }).first().getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByLabel('Billing address')).toHaveValue(/Johari Bazar/);
  await expect(page.getByText('IGST (other state)')).toBeVisible();
});

test('a saved invoice leaves no draft behind, even with a change queued just before Save', async ({ page }) => {
  await login(page);
  await page.goto('/drafts');
  await expect(page.getByTestId('drafts-loaded')).toBeVisible();
  const before = await page.getByTestId('draft-row').count();

  await page.goto('/invoices/new');
  await pickOption(page, 'Company', 'Patel', /Patel Hardware Mart/);
  const card = page.getByTestId('item-card').nth(0);
  await pickOption(card, 'Item', 'Wooden', /Wooden Pallet/);
  await card.getByLabel('Quantity').fill('1');
  await expect(page.getByTestId('draft-status')).toHaveText(/^Draft saved/, { timeout: 10_000 });
  await card.getByLabel('Quantity').fill('2');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: /saved$/ })).toBeVisible();
  await page.waitForTimeout(4000); // longer than the 3-second autosave delay

  await page.goto('/drafts');
  await expect(page.getByTestId('drafts-loaded')).toBeVisible();
  await expect(page.getByTestId('draft-row')).toHaveCount(before);
});

test('says when there is no internet and catches up afterwards', async ({ page, context }) => {
  await login(page);
  await page.goto('/invoices/new');
  await expect(page.getByRole('heading', { name: 'New invoice', level: 1 })).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel('Vehicle number (optional)').fill('GJ01AB1234');
  await expect(page.getByText('No internet — your work is safe on this screen')).toBeVisible();
  await expect(page.getByTestId('draft-status')).toHaveText('Not saved — no internet', { timeout: 10_000 });
  await context.setOffline(false);
  await expect(page.getByTestId('draft-status')).toHaveText(/^Draft saved/, { timeout: 20_000 });
});

test('discarding a draft removes it', async ({ page }) => {
  await login(page);
  await page.goto('/invoices/new');
  await pickOption(page, 'Company', 'Mehta', /Mehta Engineering Works/);
  await expect(page.getByTestId('draft-status')).toHaveText(/^Draft saved/, { timeout: 10_000 });
  await page.getByRole('link', { name: 'Drafts' }).first().click();
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByTestId('drafts-loaded')).toBeVisible();
  const rows = page.getByTestId('draft-row').filter({ hasText: 'Mehta Engineering Works' });
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  await rows.first().getByRole('button', { name: 'Discard' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Discard' }).click();
  await expect(rows).toHaveCount(count - 1);
});
