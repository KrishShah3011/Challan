import { expect, test } from '@playwright/test';
import { TEST_USER } from '../helpers/localEnv';
import { login } from './helpers';

test('a wrong password shows a plain message', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(TEST_USER.email);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Wrong email or password.')).toBeVisible();
});

test('logging in shows Home with every destination', async ({ page }) => {
  await login(page);
  for (const tile of ['New Invoice', 'Invoices', 'Drafts', 'Lists', 'Settings']) {
    await expect(page.getByRole('main').getByRole('link', { name: tile, exact: true })).toBeVisible();
  }
});

test('our company details are saved', async ({ page }, info) => {
  await login(page);
  await page.getByRole('main').getByRole('link', { name: 'Settings', exact: true }).click();
  const phone = info.project.name === 'phone' ? '+91 90000 00001' : '+91 90000 00002';
  await page.getByLabel('Phone').fill(phone);
  await page.getByRole('button', { name: 'Save company details' }).click();
  await expect(page.getByText('Company details saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Phone')).toHaveValue(phone);
});

test('a mistyped GSTIN is explained in Settings', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await page.getByLabel('GSTIN').fill('24AAACS1234A1Z9');
  await page.getByRole('button', { name: 'Save company details' }).click();
  await expect(page.getByText(/last character does not match/)).toBeVisible();
});
