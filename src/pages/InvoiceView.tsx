import { Alert, Button, Center, Group, Loader, Modal, Paper, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { TotalsPanel } from '../components/TotalsPanel';
import { LOCAL_PREFIX } from '../lib/draftSync';
import { deleteInvoice, getInvoice, invoiceHistory } from '../lib/db';
import { describeError, loadErrorMessage } from '../lib/errors';
import { fmtDate, fmtDateTime } from '../lib/format';
import { parseSerial } from '../lib/fy';
import { stateName } from '../lib/gstin';
import { computeTotals, fmtMoney, fmtRate, plain } from '../lib/invoiceMath';
import type { AuditRow, InvoiceFull } from '../lib/types';

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text fw={700}>{label}</Text>
      <Text style={{ whiteSpace: 'pre-line' }}>{value}</Text>
    </div>
  );
}

export function InvoiceView() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState<InvoiceFull | null | undefined>(undefined);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([getInvoice(id), invoiceHistory(id)]).then(
      ([i, h]) => {
        if (!alive) return;
        setInv(i);
        setHistory(h);
      },
      (e: unknown) => alive && setError(loadErrorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) return <Alert color="red" title="Could not load">{error}</Alert>;
  if (inv === undefined) {
    return (
      <Center py="xl">
        <Loader size="xl" />
      </Center>
    );
  }
  if (inv === null) {
    return (
      <Stack>
        <Alert color="yellow">This invoice no longer exists.</Alert>
        <Button component={Link} to="/invoices">
          Back to invoices
        </Button>
      </Stack>
    );
  }

  const sameState = inv.tax_type === 'CGST_SGST';
  const totals = computeTotals(
    inv.invoice_lines.map((l) => ({ qty: l.qty, price: l.price, gstRate: l.gst_rate })),
    inv.invoice_charges.map((c) => ({ amount: c.amount, gstRate: c.gst_rate })),
    sameState,
  );
  // An id reused after "save as new" keeps older entries; show only the current life of the invoice.
  const lastDelete = history.map((h) => h.action).lastIndexOf('DELETE');
  const historyText = history
    .slice(lastDelete + 1)
    .map((h) => `${h.action === 'INSERT' ? 'Created' : 'Edited'} ${fmtDateTime(h.at)}`)
    .join(' · ');
  const confirmMatches = typed.trim() === inv.invoice_no || parseSerial(typed) === inv.serial;

  async function remove() {
    if (!inv) return;
    setBusy(true);
    try {
      const no = await deleteInvoice(inv.id, typed);
      try {
        localStorage.removeItem(LOCAL_PREFIX + inv.id);
      } catch {
        // storage disabled or restricted
      }
      notifications.show({ color: 'green', message: `Invoice ${no} deleted.` });
      navigate('/invoices');
    } catch (e) {
      notifications.show({ color: 'red', title: 'Not deleted', message: describeError(e).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack>
      <Title order={1}>Invoice {inv.invoice_no}</Title>
      <Group>
        <Button component={Link} to={`/invoices/${inv.id}/edit`} leftSection={<IconPencil aria-hidden />}>
          Edit
        </Button>
        <Button variant="outline" color="red" leftSection={<IconTrash aria-hidden />} onClick={() => setDeleting(true)}>
          Delete
        </Button>
      </Group>

      <Paper withBorder p="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Info label="Invoice date" value={fmtDate(inv.invoice_date)} />
          <Info label="Buyer" value={inv.buyer_name} />
          <Info label="Billing address" value={inv.buyer_address} />
          <Info label="Shipping address" value={inv.ship_same ? 'Same as billing' : inv.ship_address} />
          <Info label="Buyer GSTIN" value={inv.buyer_gstin ?? 'Not registered'} />
          <Info label="Buyer state" value={stateName(inv.buyer_state_code)} />
          <Info label="Place of supply" value={`${stateName(inv.place_of_supply)} · ${sameState ? 'CGST + SGST' : 'IGST'}`} />
          <Info label="Payment terms" value={inv.payment_terms} />
          <Info label="Transport" value={inv.vehicle_no ? `${inv.transport_mode} · ${inv.vehicle_no}` : inv.transport_mode} />
          <Info label="Seller" value={`${inv.seller_name}\n${inv.seller_gstin}`} />
        </SimpleGrid>
      </Paper>

      <Paper withBorder p="md">
        <Title order={2} mb="sm">
          Items
        </Title>
        <Table.ScrollContainer minWidth={760}>
          <Table striped withTableBorder fz="lg">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>Item</Table.Th>
                <Table.Th>HSN</Table.Th>
                <Table.Th>Qty</Table.Th>
                <Table.Th>Price</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>GST</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {inv.invoice_lines.map((l, i) => (
                <Table.Tr key={l.id}>
                  <Table.Td>{i + 1}</Table.Td>
                  <Table.Td>
                    <Text fw={600}>{l.item_name}</Text>
                    {l.description && <Text c="gray.7">{l.description}</Text>}
                  </Table.Td>
                  <Table.Td>{l.hsn}</Table.Td>
                  <Table.Td>{`${plain(l.qty)} ${l.unit}`}</Table.Td>
                  <Table.Td>{fmtMoney(l.price)}</Table.Td>
                  <Table.Td>{fmtMoney(totals.lines[i].amount)}</Table.Td>
                  <Table.Td>{fmtRate(l.gst_rate)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      {inv.invoice_charges.length > 0 && (
        <Paper withBorder p="md">
          <Title order={2} mb="sm">
            Charges
          </Title>
          <Table striped withTableBorder fz="lg">
            <Table.Tbody>
              {inv.invoice_charges.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>{c.name}</Table.Td>
                  <Table.Td>{fmtMoney(c.amount)}</Table.Td>
                  <Table.Td>{fmtRate(c.gst_rate)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      <TotalsPanel totals={totals} sameState={sameState} mode="static" />

      <Paper withBorder p="md">
        <Text fw={700}>History</Text>
        <Text>{historyText}</Text>
      </Paper>

      <Modal opened={deleting} onClose={() => setDeleting(false)} title="Delete invoice?">
        <Stack>
          <Text>
            Delete invoice {inv.invoice_no} for {inv.buyer_name} ({fmtMoney(inv.grand_total)})? This cannot be undone.
          </Text>
          <TextInput
            label={`Type ${inv.serial} to confirm`}
            inputMode="numeric"
            value={typed}
            onChange={(e) => setTyped(e.currentTarget.value)}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button color="red" disabled={!confirmMatches || busy} onClick={() => void remove()}>
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
