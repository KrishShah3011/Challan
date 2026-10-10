import { Alert, Button, Group, Stack, TextInput } from '@mantine/core';
import { useState } from 'react';
import { saveMaster } from '../lib/db';
import { describeError } from '../lib/errors';
import { parseAmount, plain } from '../lib/invoiceMath';
import { HSN_PATTERN, UNITS } from '../lib/options';
import type { Item } from '../lib/types';
import { SelectWithOther } from './SelectWithOther';

interface Props {
  initial?: Item;
  onSaved: (item: Item) => void;
  onCancel: () => void;
}

export function ItemForm({ initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [hsn, setHsn] = useState(initial?.hsn ?? '');
  const [unit, setUnit] = useState(initial?.unit ?? 'Nos');
  const [rate, setRate] = useState(initial ? plain(initial.gst_rate) : '');
  const [price, setPrice] = useState(initial?.default_price ? plain(initial.default_price) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    const r = parseAmount(rate, 'rate');
    const p = price.trim() ? parseAmount(price, 'price') : null;
    if (!name.trim()) e.name = 'Please enter the item name.';
    if (!HSN_PATTERN.test(hsn.trim())) e.hsn = 'HSN must be 4, 6 or 8 digits.';
    if (!unit.trim()) e.unit = 'Please choose a unit.';
    if (r === null) e.rate = 'Please enter GST rate (0 to 100).';
    if (price.trim() && p === null) e.price = 'Please enter a price (0 or more, up to 2 decimals), or leave it empty.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    setFormError(null);
    try {
      const saved = await saveMaster(
        'items',
        { name: name.trim(), description: description.trim(), hsn: hsn.trim(), unit: unit.trim(), gst_rate: r, default_price: p },
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
      <TextInput label="Item name" value={name} onChange={(e) => setName(e.currentTarget.value)} error={errors.name} data-autofocus />
      <TextInput label="Description" value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
      <TextInput label="HSN code" inputMode="numeric" value={hsn} onChange={(e) => setHsn(e.currentTarget.value.trim())} error={errors.hsn} />
      <SelectWithOther label="Unit" options={UNITS} value={unit} onChange={setUnit} error={errors.unit} />
      <TextInput label="GST rate (%)" inputMode="decimal" value={rate} onChange={(e) => setRate(e.currentTarget.value)} error={errors.rate} />
      <TextInput
        label="Default price (optional)"
        inputMode="decimal"
        leftSection="₹"
        value={price}
        onChange={(e) => setPrice(e.currentTarget.value)}
        error={errors.price}
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
