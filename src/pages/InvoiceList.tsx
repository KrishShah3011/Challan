import { Alert, Button, Card, Center, Group, Loader, Stack, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ExportButton } from '../components/ExportButton';
import { listInvoices, PAGE_SIZE } from '../lib/db';
import { loadErrorMessage } from '../lib/errors';
import { fmtDate } from '../lib/format';
import { fmtMoney } from '../lib/invoiceMath';
import type { InvoiceListRow } from '../lib/types';

export function InvoiceList() {
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const [query, setQuery] = useState({ q: '', page: 0 });
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuery({ q: debounced, page: 0 });
  }, [debounced]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    listInvoices(query.q, query.page)
      .then(
        (r) => {
          if (!alive) return;
          setRows((prev) => (query.page === 0 ? r : [...prev, ...r]));
          setHasMore(r.length === PAGE_SIZE);
        },
        (e: unknown) => alive && setError(loadErrorMessage(e)),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [query]);

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={1}>Invoices</Title>
        <ExportButton />
      </Group>
      <TextInput
        label="Search by number or company"
        leftSection={<IconSearch size={20} aria-hidden />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />
      {error && <Alert color="red">{error}</Alert>}
      {rows.map((r) => (
        <Card
          key={r.id}
          withBorder
          padding="md"
          component={Link}
          to={`/invoices/${r.id}`}
          data-testid="invoice-row"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <Group justify="space-between" wrap="nowrap">
            <Text fw={800} size="lg">
              {r.invoice_no}
            </Text>
            <Text fw={700} size="lg">
              {fmtMoney(r.grand_total)}
            </Text>
          </Group>
          <Text>{r.buyer_name}</Text>
          <Text c="gray.7">{fmtDate(r.invoice_date)}</Text>
        </Card>
      ))}
      {loading && (
        <Center py="md">
          <Loader />
        </Center>
      )}
      {!loading && !error && rows.length === 0 && (
        <Stack align="center">
          <Text>{query.q ? 'No invoice matches your search.' : 'No invoices yet.'}</Text>
          <Button component={Link} to="/invoices/new">
            New Invoice
          </Button>
        </Stack>
      )}
      {!loading && hasMore && (
        <Button variant="light" onClick={() => setQuery((s) => ({ ...s, page: s.page + 1 }))}>
          Show more
        </Button>
      )}
    </Stack>
  );
}
