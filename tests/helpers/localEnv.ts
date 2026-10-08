import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

export const TEST_USER = { email: 'owner@example.com', password: 'test-password-123' };

/** Reads URL and keys of the running local Supabase stack (`npx supabase start`). */
export function localEnv(): { url: string; anonKey: string; serviceKey: string } {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8' });
  const vars: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) vars[m[1]] = m[2];
  }
  const url = vars.API_URL;
  const anonKey = vars.ANON_KEY ?? vars.PUBLISHABLE_KEY;
  const serviceKey = vars.SERVICE_ROLE_KEY ?? vars.SECRET_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error('Local Supabase is not running. Run: npx supabase start');
  return { url, anonKey, serviceKey };
}

/** Creates the shared test login (sign-ups are disabled, so this uses the admin API). */
export async function ensureTestUser(): Promise<void> {
  const env = localEnv();
  const admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.createUser({
    email: TEST_USER.email,
    password: TEST_USER.password,
    email_confirm: true,
  });
  if (error && !/already/i.test(error.message)) throw error;
}
