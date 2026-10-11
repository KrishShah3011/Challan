import { Button, Collapse, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { Fragment, useState, type ReactNode } from 'react';
import { fmtMoney, fmtRate, fmtSigned, type Totals } from '../lib/invoiceMath';
import { amountInWords } from '../lib/words';

interface Props {
  totals: Totals;
  sameState: boolean;
  /** bottom: phone (sticky above the nav bar, details collapsible); side: desktop column; static: invoice view */
  mode: 'bottom' | 'side' | 'static';
  action?: ReactNode;
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Text fw={strong ? 700 : 400}>{label}</Text>
      <Text fw={strong ? 700 : 500} className="cy-num" style={{ whiteSpace: 'nowrap' }}>
        {value}
      </Text>
    </Group>
  );
}

export function TotalsPanel({ totals, sameState, mode, action }: Props) {
  const [open, setOpen] = useState(false);

  const details = (
    <Stack gap={6}>
      <Line label="Items total" value={fmtMoney(totals.itemsTotal)} />
      <Line label="Charges total" value={fmtMoney(totals.chargesTotal)} />
      <Line label="Taxable value" value={fmtMoney(totals.taxableTotal)} strong />
      {totals.byRate.map((g) =>
        sameState ? (
          <Fragment key={g.rate.toFixed()}>
            <Line label={`CGST ${fmtRate(g.rate.dividedBy(2))} on ${fmtMoney(g.taxable)}`} value={fmtMoney(g.gst.dividedBy(2))} />
            <Line label={`SGST ${fmtRate(g.rate.dividedBy(2))} on ${fmtMoney(g.taxable)}`} value={fmtMoney(g.gst.dividedBy(2))} />
          </Fragment>
        ) : (
          <Line key={g.rate.toFixed()} label={`IGST ${fmtRate(g.rate)} on ${fmtMoney(g.taxable)}`} value={fmtMoney(g.gst)} />
        ),
      )}
      <Line label="Round off" value={fmtSigned(totals.roundOff)} />
    </Stack>
  );

  const grand = (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap">
        <Text size="xl" fw={700}>
          Grand Total
        </Text>
        <Text size="xl" fw={800} className="cy-grand" data-testid="grand-total">
          <span key={fmtMoney(totals.grandTotal)}>{fmtMoney(totals.grandTotal)}</span>
        </Text>
      </Group>
      <Text fs="italic" data-testid="amount-words">
        {amountInWords(totals.grandTotal.toFixed(0))}
      </Text>
    </Stack>
  );

  if (mode === 'bottom') {
    return (
      <Paper
        withBorder
        shadow="lg"
        p="md"
        style={{ position: 'sticky', bottom: 'calc(var(--app-shell-footer-offset, 0rem) + 0.5rem)', zIndex: 10 }}
      >
        <Stack gap="sm">
          <Collapse in={open}>
            {details}
            <Divider my="sm" />
          </Collapse>
          {grand}
          <Button variant="subtle" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide details' : 'Show details'}
          </Button>
          {action}
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper
      withBorder
      shadow={mode === 'side' ? 'md' : undefined}
      p="md"
      style={mode === 'side' ? { position: 'sticky', top: 'calc(var(--app-shell-header-offset, 0rem) + 1rem)' } : undefined}
    >
      <Stack gap="sm">
        {mode === 'side' && <Title order={2}>Totals</Title>}
        {details}
        <Divider />
        {grand}
        {action}
      </Stack>
    </Paper>
  );
}
