import { Select, type SelectProps } from '@mantine/core';
import { STATES } from '../lib/gstin';

const DATA = STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }));

export function StateSelect(props: Omit<SelectProps, 'data' | 'searchable'>) {
  return <Select searchable nothingFoundMessage="No state matches" data={DATA} {...props} />;
}
