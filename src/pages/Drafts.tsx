import { Alert, Button, Card, Center, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { deleteDraft, listDrafts } from '../lib/db';
import { describeError, loadErrorMessage } from '../lib/errors';
import { fmtDateTime } from '../lib/format';
import type { InvoiceForm } from '../lib/invoiceForm';
import type { DraftRow } from '../lib/types';

export function Drafts() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await listDrafts());
    } catch (e) {
      setError(loadErrorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function resume(d: DraftRow) {
    const f = d.data as InvoiceForm;
    navigate(f.mode === 'edit' ? `/invoices/${d.id}/edit?resume=1` : `/invoices/new?draft=${d.id}`);
  }

  function discard(d: DraftRow) {
    modals.openConfirmModal({
      title: 'Discard this draft?',
      children: <Text>“{d.label}” will be removed. This cannot be undone.</Text>,
      labels: { confirm: 'Discard', cancel: 'Keep' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        void (async () => {
          try {
            await deleteDraft(d.id);
            await load();
          } catch (e) {
            notifications.show({ color: 'red', title: 'Not discarded', message: describeError(e).message });
          }
        })(),
    });
  }

  return (
    <Stack>
      <Title order={1}>Drafts</Title>
      {error && (
        <Alert color="red" title="Could not load">
          <Stack>
            {error}
            <Button onClick={() => void load()}>Try again</Button>
          </Stack>
        </Alert>
      )}
      {rows === null && !error && (
        <Center py="xl">
          <Loader />
        </Center>
      )}
      {rows && (
        <Stack data-testid="drafts-loaded">
          {rows.length === 0 && <Text>No drafts. Unfinished invoices appear here automatically.</Text>}
          {rows.map((d) => (
            <Card key={d.id} withBorder padding="md" data-testid="draft-row">
              <Text fw={700} size="lg">
                {d.label}
              </Text>
              <Text c="gray.7">Last saved {fmtDateTime(d.updated_at)}</Text>
              <Group mt="sm">
                <Button onClick={() => resume(d)}>Resume</Button>
                <Button variant="subtle" color="red" onClick={() => discard(d)}>
                  Discard
                </Button>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
