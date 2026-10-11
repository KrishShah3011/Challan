import { Alert, Button, Card, Center, Group, Loader, Modal, Stack, Switch, Tabs, Text, TextInput, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconRestore, IconSearch, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { ChargeTypeForm } from '../components/ChargeTypeForm';
import { CompanyForm } from '../components/CompanyForm';
import { ItemForm } from '../components/ItemForm';
import { listMaster, setArchived, type MasterTable } from '../lib/db';
import { describeError, loadErrorMessage } from '../lib/errors';
import { stateName } from '../lib/gstin';
import { fmtMoney, fmtRate } from '../lib/invoiceMath';
import type { ChargeType, Company, Item } from '../lib/types';

type Row = Company | Item | ChargeType;

const TABLES: MasterTable[] = ['companies', 'items', 'charge_types'];
const META: Record<MasterTable, { tab: string; singular: string }> = {
  companies: { tab: 'Companies', singular: 'company' },
  items: { tab: 'Items', singular: 'item' },
  charge_types: { tab: 'Charges', singular: 'charge' },
};

function describeRow(table: MasterTable, row: Row): { title: string; lines: string[] } {
  if (table === 'companies') {
    const c = row as Company;
    return { title: c.name, lines: [`${c.gstin ?? 'No GSTIN'} · ${stateName(c.state_code)}`, c.address] };
  }
  if (table === 'items') {
    const i = row as Item;
    const price = i.default_price ? ` · ${fmtMoney(i.default_price)}` : '';
    return { title: i.name, lines: [`HSN ${i.hsn} · ${i.unit} · GST ${fmtRate(i.gst_rate)}${price}`, i.description].filter(Boolean) };
  }
  const t = row as ChargeType;
  return { title: t.name, lines: [`GST ${fmtRate(t.gst_rate)}`] };
}

export function Masters() {
  return (
    <Stack>
      <Title order={1}>Lists</Title>
      <Tabs defaultValue="companies" keepMounted={false}>
        <Tabs.List grow>
          {TABLES.map((t) => (
            <Tabs.Tab key={t} value={t} fz="lg">
              {META[t].tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {TABLES.map((t) => (
          <Tabs.Panel key={t} value={t} pt="md">
            <MasterList table={t} />
          </Tabs.Panel>
        ))}
      </Tabs>
    </Stack>
  );
}

function MasterList({ table }: { table: MasterTable }) {
  const phone = useMediaQuery('(max-width: 899px)');
  const [showRemoved, setShowRemoved] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const { tab, singular } = META[table];

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      setRows(await listMaster(table, showRemoved));
    } catch (e) {
      setError(loadErrorMessage(e));
    }
  }, [table, showRemoved]);
  useEffect(() => {
    void load();
  }, [load]);

  async function changeArchived(row: Row, archived: boolean) {
    try {
      await setArchived(table, row.id, archived);
      notifications.show({ color: 'green', message: archived ? 'Removed from the list.' : 'Restored.' });
      await load();
    } catch (e) {
      notifications.show({ color: 'red', title: archived ? 'Not removed' : 'Not restored', message: describeError(e).message });
    }
  }

  function confirmRemove(row: Row) {
    modals.openConfirmModal({
      title: 'Remove from list?',
      children: <Text>Remove {describeRow(table, row).title} from the list? Old invoices are not affected. You can restore it later.</Text>,
      labels: { confirm: 'Remove', cancel: 'Keep' },
      confirmProps: { color: 'red' },
      onConfirm: () => void changeArchived(row, true),
    });
  }

  function saved() {
    setEditing(null);
    notifications.show({ color: 'green', message: 'Saved.' });
    void load();
  }

  const q = search.trim().toLowerCase();
  const visible = (rows ?? []).filter((r) => {
    const d = describeRow(table, r);
    return !q || [d.title, ...d.lines].join(' ').toLowerCase().includes(q);
  });
  const initial = editing && editing !== 'new' ? editing : undefined;
  const close = () => setEditing(null);

  return (
    <Stack>
      <TextInput
        label={`Search ${tab.toLowerCase()}`}
        leftSection={<IconSearch size={20} aria-hidden />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />
      <Group justify="space-between">
        <Button onClick={() => setEditing('new')}>{`+ Add ${singular}`}</Button>
        <Switch size="lg" label="Show removed" checked={showRemoved} onChange={(e) => setShowRemoved(e.currentTarget.checked)} />
      </Group>
      {error && (
        <Alert color="red" title="Could not load">
          <Stack>
            {error}
            <Button onClick={() => void load()}>Try again</Button>
          </Stack>
        </Alert>
      )}
      {!rows && !error && (
        <Center py="xl">
          <Loader />
        </Center>
      )}
      {rows && visible.length === 0 && <Text>{showRemoved ? 'Nothing has been removed.' : 'Nothing here yet.'}</Text>}
      {visible.map((row) => {
        const d = describeRow(table, row);
        return (
          <Card key={row.id} withBorder padding="md" className="cy-row" data-testid="master-row">
            <Text fw={700} size="lg">
              {d.title}
            </Text>
            {d.lines.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
            <Group mt="sm">
              {showRemoved ? (
                <Button variant="light" leftSection={<IconRestore aria-hidden />} onClick={() => void changeArchived(row, false)}>
                  Restore
                </Button>
              ) : (
                <>
                  <Button variant="light" leftSection={<IconPencil aria-hidden />} onClick={() => setEditing(row)}>
                    Edit
                  </Button>
                  <Button variant="subtle" color="red" leftSection={<IconTrash aria-hidden />} onClick={() => confirmRemove(row)}>
                    Remove from list
                  </Button>
                </>
              )}
            </Group>
          </Card>
        );
      })}
      <Modal opened={editing !== null} onClose={close} title={`${editing === 'new' ? 'Add' : 'Edit'} ${singular}`} fullScreen={phone} size="lg">
        {table === 'companies' && <CompanyForm initial={initial as Company | undefined} onSaved={saved} onCancel={close} />}
        {table === 'items' && <ItemForm initial={initial as Item | undefined} onSaved={saved} onCancel={close} />}
        {table === 'charge_types' && <ChargeTypeForm initial={initial as ChargeType | undefined} onSaved={saved} onCancel={close} />}
      </Modal>
    </Stack>
  );
}
