import { Button, Select, Stack } from '@mantine/core';
import { stateName } from '../lib/gstin';
import { withCurrentOption } from '../lib/invoiceForm';
import type { Company } from '../lib/types';

interface Props {
  companies: Company[];
  value: string | null;
  currentName: string;
  error?: string;
  onPick: (c: Company) => void;
  onAddNew: () => void;
}

/** Name · GSTIN · state, so look-alike names are easy to tell apart. */
export function CompanyPicker({ companies, value, currentName, error, onPick, onAddNew }: Props) {
  const data = withCurrentOption(
    companies.map((c) => ({ value: c.id, label: `${c.name} · ${c.gstin ?? 'No GSTIN'} · ${stateName(c.state_code)}` })),
    value,
    currentName,
  );
  return (
    <Stack gap="xs">
      <Select
        label="Company"
        placeholder="Type to search"
        searchable
        nothingFoundMessage="No company matches. Use “+ Add new company”."
        data={data}
        value={value}
        error={error}
        onChange={(id) => {
          const c = companies.find((x) => x.id === id);
          if (c) onPick(c);
        }}
      />
      <Button variant="light" onClick={onAddNew}>
        + Add new company
      </Button>
    </Stack>
  );
}
