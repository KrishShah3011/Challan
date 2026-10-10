import { Alert, Button, Container, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { describeError } from '../lib/errors';
import { supabase } from '../lib/supabase';

export function Login({ embedded = false }: { embedded?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(err.message === 'Invalid login credentials' ? 'Wrong email or password.' : describeError(err).message);
  }

  async function forgot() {
    if (!email.trim()) {
      setError('Type your email above first, then press "Forgot password".');
      return;
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (err) setError(describeError(err).message);
    else notifications.show({ color: 'green', message: 'We sent a password reset link to your email.' });
  }

  return (
    <Container size={460} py="xl">
      <form onSubmit={(e) => void submit(e)}>
        <Stack>
          {!embedded && <Title order={1}>Invoices</Title>}
          <TextInput label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required />
          <PasswordInput label="Password" withAsterisk={false} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} required />
          {error && (
            <Alert color="red" icon={<IconAlertCircle />}>
              {error}
            </Alert>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </Button>
          <Button variant="subtle" onClick={() => void forgot()}>
            Forgot password
          </Button>
        </Stack>
      </form>
    </Container>
  );
}
