import { Button, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { applyItem, withCurrentOption, type FormErrors, type LineForm } from '../lib/invoiceForm';
import { fmtMoney, type Row } from '../lib/invoiceMath';
import { UNITS } from '../lib/options';
import type { Item } from '../lib/types';
import { SelectWithOther } from './SelectWithOther';

interface Props {
  index: number;
  line: LineForm;
  items: Item[];
  row: Row;
  errors: FormErrors;
  onChange: (line: LineForm) => void;
  onRemove: () => void;
  onAddNewItem: () => void;
}

export function ItemCard({ index, line, items, row, errors, onChange, onRemove, onAddNewItem }: Props) {
  const data = withCurrentOption(
    items.map((i) => ({ value: i.id, label: `${i.name} · HSN ${i.hsn}` })),
    line.itemId,
    line.itemName,
  );
  const err = (field: string) => errors[`lines.${index}.${field}`];
  const set = (patch: Partial<LineForm>) => onChange({ ...line, ...patch });

  return (
    <Paper withBorder p="md" data-testid="item-card">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700} size="lg">
            Item {index + 1}
          </Text>
          <Button variant="subtle" color="red" leftSection={<IconTrash aria-hidden />} onClick={onRemove}>
            Remove
          </Button>
        </Group>
        <Select
          label="Item"
          placeholder="Type to search"
          searchable
          nothingFoundMessage="No item matches. Use “+ New item”."
          data={data}
          value={line.itemId}
          error={err('item')}
          onChange={(id) => {
            const it = items.find((x) => x.id === id);
            if (it) onChange(applyItem(line, it));
          }}
        />
        <Button variant="light" onClick={onAddNewItem}>
          + New item
        </Button>
        <TextInput label="Description" value={line.description} onChange={(e) => set({ description: e.currentTarget.value })} />
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <TextInput label="HSN code" inputMode="numeric" value={line.hsn} onChange={(e) => set({ hsn: e.currentTarget.value.trim() })} error={err('hsn')} />
          <TextInput label="Quantity" inputMode="decimal" value={line.qty} onChange={(e) => set({ qty: e.currentTarget.value })} error={err('qty')} />
          <SelectWithOther label="Unit" options={UNITS} value={line.unit} onChange={(unit) => set({ unit })} error={err('unit')} />
          <TextInput
            label="Price (before GST)"
            inputMode="decimal"
            leftSection="₹"
            value={line.price}
            onChange={(e) => set({ price: e.currentTarget.value })}
            error={err('price')}
          />
          <TextInput label="GST rate (%)" inputMode="decimal" value={line.gstRate} onChange={(e) => set({ gstRate: e.currentTarget.value })} error={err('gstRate')} />
        </SimpleGrid>
        <Group justify="space-between" bg="gray.0" p="sm" style={{ borderRadius: 8 }}>
          <Text>
            Amount <b>{fmtMoney(row.amount)}</b>
          </Text>
          <Text>
            GST <b>{fmtMoney(row.gstAmount)}</b>
          </Text>
        </Group>
      </Stack>
    </Paper>
  );
}
