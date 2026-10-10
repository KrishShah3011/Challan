import { expect, type Page } from '@playwright/test';
import { TEST_USER } from '../helpers/localEnv';

export async function login(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill(TEST_USER.email);
  await page.getByLabel('Password', { exact: true }).fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
}
