import { Button, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { applyChargeType, withCurrentOption, type ChargeForm, type FormErrors } from '../lib/invoiceForm';
import { fmtMoney, fmtRate, type Row } from '../lib/invoiceMath';
import type { ChargeType } from '../lib/types';

interface Props {
  index: number;
  charge: ChargeForm;
  chargeTypes: ChargeType[];
  row: Row;
  errors: FormErrors;
  onChange: (charge: ChargeForm) => void;
  onRemove: () => void;
}

export function ChargeRow({ index, charge, chargeTypes, row, errors, onChange, onRemove }: Props) {
  const data = withCurrentOption(
    chargeTypes.map((t) => ({ value: t.id, label: `${t.name} · GST ${fmtRate(t.gst_rate)}` })),
    charge.chargeTypeId,
    charge.name,
  );
  const err = (field: string) => errors[`charges.${index}.${field}`];
  const set = (patch: Partial<ChargeForm>) => onChange({ ...charge, ...patch });

  return (
    <Paper withBorder p="md" data-testid="charge-row">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700} size="lg">
            Charge {index + 1}
          </Text>
          <Button variant="subtle" color="red" leftSection={<IconTrash aria-hidden />} onClick={onRemove}>
            Remove
          </Button>
        </Group>
        <Select
          label="Charge type"
          placeholder="Type to search"
          searchable
          data={data}
          value={charge.chargeTypeId}
          error={err('type')}
          onChange={(id) => {
            const t = chargeTypes.find((x) => x.id === id);
            if (t) onChange(applyChargeType(charge, t));
          }}
        />
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <TextInput
            label="Amount (before GST)"
            inputMode="decimal"
            leftSection="₹"
            value={charge.amount}
            onChange={(e) => set({ amount: e.currentTarget.value })}
            error={err('amount')}
          />
          <TextInput label="GST rate (%)" inputMode="decimal" value={charge.gstRate} onChange={(e) => set({ gstRate: e.currentTarget.value })} error={err('gstRate')} />
        </SimpleGrid>
        <Text>
          GST <b>{fmtMoney(row.gstAmount)}</b>
        </Text>
      </Stack>
    </Paper>
  );
}
