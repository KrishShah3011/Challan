import { execSync } from 'node:child_process';
import { ensureTestUser } from '../helpers/localEnv';

/** Fresh database (migrations + dummy seed) and the shared login before every e2e run. */
export default async function globalSetup(): Promise<void> {
  execSync('npx supabase db reset', { stdio: 'inherit' });
  await ensureTestUser();
}
