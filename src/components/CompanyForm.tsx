import { Alert, Button, Group, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import { findCompaniesByGstin, saveMaster } from '../lib/db';
import { describeError } from '../lib/errors';
import { gstinProblem, isStateCode, normalizeGstin } from '../lib/gstin';
import type { Company } from '../lib/types';
import { StateSelect } from './StateSelect';

interface Props {
  initial?: Company;
  onSaved: (c: Company) => void;
  onCancel: () => void;
}

export function CompanyForm({ initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [gstin, setGstin] = useState(initial?.gstin ?? '');
  const [state, setState] = useState(initial?.state_code ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warning, setWarning] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const gstinValid = gstin.length === 15 && gstinProblem(gstin) === null;

  function changeGstin(raw: string) {
    const g = normalizeGstin(raw);
    setGstin(g);
    setWarning(null);
    if (g.length === 15 && gstinProblem(g) === null) setState(g.slice(0, 2));
  }

  /** One GSTIN can have several branches, so a shared GSTIN only warns. */
  async function checkSharedGstin() {
    if (!gstinValid) return;
    try {
      const others = (await findCompaniesByGstin(gstin)).filter((c) => c.id !== initial?.id);
      setWarning(others.length ? `Another company uses this GSTIN: ${others.map((c) => c.name).join(', ')}` : null);
    } catch {
      setWarning(null);
    }
  }

  async function save() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Please enter the company name.';
    if (!address.trim()) e.address = 'Please enter the address.';
    if (gstin) {
      const p = gstinProblem(gstin);
      if (p) e.gstin = p;
    }
    if (!isStateCode(state)) e.state = 'Please choose the state.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    setFormError(null);
    try {
      const saved = await saveMaster(
        'companies',
        { name: name.trim(), address: address.trim(), gstin: gstin || null, state_code: state },
        initial?.id,
      );
      onSaved(saved);
    } catch (err) {
      setFormError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack>
      <TextInput label="Company name" value={name} onChange={(e) => setName(e.currentTarget.value)} error={errors.name} data-autofocus />
      <Textarea label="Address" autosize minRows={2} value={address} onChange={(e) => setAddress(e.currentTarget.value)} error={errors.address} />
      <TextInput
        label="GSTIN"
        description="Leave empty if the company is not registered"
        value={gstin}
        onChange={(e) => changeGstin(e.currentTarget.value)}
        onBlur={() => void checkSharedGstin()}
        error={errors.gstin}
      />
      {warning && <Text c="orange.9">{warning}</Text>}
      <StateSelect
        label="State"
        value={state || null}
        onChange={(v) => setState(v ?? '')}
        disabled={gstinValid}
        description={gstinValid ? 'Taken from the GSTIN' : undefined}
        error={errors.state}
      />
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
