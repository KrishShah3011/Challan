import { Button, Paper, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload } from '@tabler/icons-react';
import { useState } from 'react';
import { fetchAll } from '../lib/db';
import { describeError } from '../lib/errors';
import { buildWorkbook } from '../lib/exportXlsx';
import { todayLocal } from '../lib/fy';
import type { ExportChargeRow, ExportLineRow, InvoiceRow } from '../lib/types';
import { TILE_STYLE } from '../theme';

async function exportAllInvoices(): Promise<number> {
  const [X, invoices, lines, charges] = await Promise.all([
    import('xlsx'), // loaded only when needed, keeping the app itself small
    fetchAll<InvoiceRow>('invoices', '*', ['fy', 'serial']),
    fetchAll<ExportLineRow>(
      'invoice_lines',
      'invoice_id, position, item_name, description, hsn, qty::text, unit, price::text, amount, gst_rate::text, gst_amount',
      ['invoice_id', 'position'],
    ),
    fetchAll<ExportChargeRow>('invoice_charges', 'invoice_id, position, name, amount::text, gst_rate::text, gst_amount', [
      'invoice_id',
      'position',
    ]),
  ]);
  X.writeFile(buildWorkbook(X, { invoices, lines, charges }), `invoices-${todayLocal()}.xlsx`);
  return invoices.length;
}

export function ExportButton({ tile = false }: { tile?: boolean }) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const count = await exportAllInvoices();
      if (count === 0) notifications.show({ message: 'No invoices yet — the file has headers only.' });
    } catch (e) {
      const err = describeError(e);
      notifications.show({
        color: 'red',
        title: 'Download failed',
        message: err.code === 'NETWORK' ? "Couldn't download — no internet. Please try again." : err.message,
      });
    } finally {
      setBusy(false);
    }
  }

  const label = busy ? 'Preparing file…' : 'Download Excel';
  if (tile) {
    return (
      <Paper
        component="button"
        type="button"
        withBorder
        radius="md"
        p="lg"
        onClick={() => void run()}
        disabled={busy}
        style={{ ...TILE_STYLE, width: '100%', background: 'var(--mantine-color-white)', cursor: 'pointer', font: 'inherit' }}
      >
        <IconDownload size={44} aria-hidden />
        <Text size="lg" fw={700} ta="center">
          {label}
        </Text>
      </Paper>
    );
  }
  return (
    <Button variant="light" leftSection={<IconDownload aria-hidden />} onClick={() => void run()} disabled={busy}>
      {label}
    </Button>
  );
}
