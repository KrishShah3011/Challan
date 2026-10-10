import { Alert, Button, Group, Stack, TextInput } from '@mantine/core';
import { useState } from 'react';
import { saveMaster } from '../lib/db';
import { describeError } from '../lib/errors';
import { parseAmount, plain } from '../lib/invoiceMath';
import type { ChargeType } from '../lib/types';

interface Props {
  initial?: ChargeType;
  onSaved: (t: ChargeType) => void;
  onCancel: () => void;
}

export function ChargeTypeForm({ initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [rate, setRate] = useState(initial ? plain(initial.gst_rate) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    const r = parseAmount(rate, 'rate');
    if (!name.trim()) e.name = 'Please enter the charge name.';
    if (r === null) e.rate = 'Please enter GST rate (0 to 100).';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    setFormError(null);
    try {
      onSaved(await saveMaster('charge_types', { name: name.trim(), gst_rate: r }, initial?.id));
    } catch (err) {
      setFormError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack>
      <TextInput label="Charge name" value={name} onChange={(e) => setName(e.currentTarget.value)} error={errors.name} data-autofocus />
      <TextInput label="GST rate (%)" inputMode="decimal" value={rate} onChange={(e) => setRate(e.currentTarget.value)} error={errors.rate} />
      {formError && <Alert color="red">{formError}</Alert>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </Group>
    </Stack>
  );
}
