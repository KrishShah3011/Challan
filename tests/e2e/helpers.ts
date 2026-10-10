import { expect, type Locator, type Page } from '@playwright/test';
import { TEST_USER } from '../helpers/localEnv';

export async function login(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill(TEST_USER.email);
  await page.getByLabel('Password', { exact: true }).fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
}

/** Types into a searchable Mantine Select (found by its label) and clicks the matching option. */
export async function pickOption(scope: Page | Locator, label: string, search: string, option: string | RegExp): Promise<void> {
  const page = 'goto' in scope ? scope : scope.page();
  const input = scope.getByLabel(label, { exact: true });
  await input.click();
  await input.fill(search);
  await page.getByRole('option', { name: option }).first().click();
}
