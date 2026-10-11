import { SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconFilePlus, IconFileText, IconList, IconNotes, IconSettings } from '@tabler/icons-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { ExportButton } from '../components/ExportButton';

const TILES = [
  { to: '/invoices/new', label: 'New Invoice', icon: IconFilePlus },
  { to: '/invoices', label: 'Invoices', icon: IconFileText },
  { to: '/drafts', label: 'Drafts', icon: IconNotes },
  { to: '/lists', label: 'Lists', icon: IconList },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

export function Home() {
  return (
    <Stack>
      <Title order={1}>Home</Title>
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
        {TILES.map(({ to, label, icon: Icon }, i) => (
          <Link key={to} to={to} className="cy-tile" style={{ '--i': i } as CSSProperties}>
            <Icon size={44} aria-hidden />
            <Text size="lg" fw={700} ta="center">
              {label}
            </Text>
          </Link>
        ))}
        <ExportButton tile />
      </SimpleGrid>
    </Stack>
  );
}
