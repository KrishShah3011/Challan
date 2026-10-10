import { Select, Stack, TextInput } from '@mantine/core';
import { useState } from 'react';

interface Props {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

/** A fixed list plus "Other", which reveals a text box. Stores one plain string. */
export function SelectWithOther({ label, options, value, onChange, error }: Props) {
  const [otherMode, setOtherMode] = useState(!options.includes(value));
  const showOther = otherMode || !options.includes(value);
  return (
    <Stack gap="xs">
      <Select
        label={label}
        data={[...options, 'Other']}
        value={showOther ? 'Other' : value}
        onChange={(v) => {
          if (v === 'Other') {
            setOtherMode(true);
            onChange('');
          } else if (v) {
            setOtherMode(false);
            onChange(v);
          }
        }}
        error={showOther ? undefined : error}
      />
      {showOther && (
        <TextInput label={`${label} — type it`} value={value} onChange={(e) => onChange(e.currentTarget.value)} error={error} />
      )}
    </Stack>
  );
}
