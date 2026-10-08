import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { localEnv } from '../helpers/localEnv';

describe('public sign-up', () => {
  it('is refused', async () => {
    const env = localEnv();
    const client = createClient(env.url, env.anonKey, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signUp({ email: 'intruder@example.com', password: 'x-intruder-123456' });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
    expect(data.session).toBeNull();
  });
});
