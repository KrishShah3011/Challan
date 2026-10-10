import { Button, PasswordInput, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function PasswordForm({ onDone }: { onDone?: () => void }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function change() {
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== again) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e) return setError(e.message);
    setPassword('');
    setAgain('');
    notifications.show({ color: 'green', message: 'Password changed.' });
    onDone?.();
  }

  return (
    <Stack>
      <PasswordInput label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
      <PasswordInput label="Type it again" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.currentTarget.value)} />
      {error && <Text c="red.8">{error}</Text>}
      <Button onClick={() => void change()} disabled={busy}>
        {busy ? 'Changing…' : 'Change password'}
      </Button>
    </Stack>
  );
}
