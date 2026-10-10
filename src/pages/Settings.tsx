import { Alert, Button, Center, Loader, Paper, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconLogout } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { PasswordForm } from '../components/PasswordForm';
import { getSeller, saveSeller } from '../lib/db';
import { describeError, loadErrorMessage } from '../lib/errors';
import { gstinProblem, normalizeGstin, stateName } from '../lib/gstin';
import { supabase } from '../lib/supabase';

export function Settings() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const s = await getSeller();
      setIsNew(!s);
      if (s) {
        setName(s.name);
        setAddress(s.address);
        setGstin(s.gstin);
        setPhone(s.phone);
      }
    } catch (e) {
      setLoadError(loadErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function save() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Please enter your company name.';
    if (!address.trim()) e.address = 'Please enter your company address.';
    const problem = gstinProblem(gstin);
    if (problem) e.gstin = problem;
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    try {
      await saveSeller({ name: name.trim(), address: address.trim(), gstin, phone: phone.trim() });
      setIsNew(false);
      notifications.show({ color: 'green', message: 'Company details saved.' });
    } catch (err) {
      notifications.show({ color: 'red', title: 'Not saved', message: describeError(err).message });
    } finally {
      setBusy(false);
    }
  }

  async function logOut() {
    await supabase.auth.signOut();
    window.location.assign('/');
  }

  const gstinOk = gstinProblem(gstin) === null;

  return (
    <Stack>
      <Title order={1}>Settings</Title>
      {loadError && (
        <Alert color="red" title="Could not load">
          <Stack>
            {loadError}
            <Button onClick={() => void load()}>Try again</Button>
          </Stack>
        </Alert>
      )}
      {loading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : (
        <Paper withBorder p="md">
          <Stack>
            <Title order={2}>Our company</Title>
            {isNew && <Alert color="blue">Please fill your company details. They appear on every invoice.</Alert>}
            <TextInput label="Company name" value={name} onChange={(e) => setName(e.currentTarget.value)} error={errors.name} />
            <Textarea label="Address" autosize minRows={2} value={address} onChange={(e) => setAddress(e.currentTarget.value)} error={errors.address} />
            <TextInput label="GSTIN" value={gstin} onChange={(e) => setGstin(normalizeGstin(e.currentTarget.value))} error={errors.gstin} />
            <Text>State: {gstinOk ? stateName(gstin.slice(0, 2)) : '—'}</Text>
            <TextInput label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save company details'}
            </Button>
          </Stack>
        </Paper>
      )}
      <Paper withBorder p="md">
        <Stack>
          <Title order={2}>Password</Title>
          <PasswordForm />
        </Stack>
      </Paper>
      <Button variant="outline" color="red" leftSection={<IconLogout aria-hidden />} onClick={() => void logOut()}>
        Log out
      </Button>
    </Stack>
  );
}
