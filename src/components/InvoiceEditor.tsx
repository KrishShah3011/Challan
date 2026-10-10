import { Badge, Button, Checkbox, Grid, Group, Modal, Paper, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate } from 'react-router';
import { deleteDraft, nextSerial, saveInvoice, upsertDraft } from '../lib/db';
import { createAutosaver, type AutosaveStatus } from '../lib/draftSync';
import { describeError } from '../lib/errors';
import { fmtClock } from '../lib/format';
import { fyOf } from '../lib/fy';
import { gstinProblem } from '../lib/gstin';
import {
  applyCompany, applyItem, asNewInvoice, buildSavePayload, changeDate, draftLabel, emptyCharge, emptyLine,
  formTotals, isSameState, serialDisplay, setBuyerGstin, setBuyerState, validateForm,
  type ChargeForm, type FormErrors, type InvoiceForm, type LineForm,
} from '../lib/invoiceForm';
import { PAYMENT_TERMS, TRANSPORT_MODES } from '../lib/options';
import type { Masters } from '../lib/types';
import { ChargeRow } from './ChargeRow';
import { CompanyForm } from './CompanyForm';
import { CompanyPicker } from './CompanyPicker';
import { ItemCard } from './ItemCard';
import { ItemForm } from './ItemForm';
import { SelectWithOther } from './SelectWithOther';
import { StateSelect } from './StateSelect';
import { TotalsPanel } from './TotalsPanel';

const WIDE = '(min-width: 900px)';

export function InvoiceEditor({ initial, masters: initialMasters }: { initial: InvoiceForm; masters: Masters }) {
  const wide = useMediaQuery(WIDE, window.matchMedia(WIDE).matches, { getInitialValueInEffect: false });
  const navigate = useNavigate();
  const [form, setForm] = useState(initial);
  const [masters, setMasters] = useState(initialMasters);
  const [errors, setErrors] = useState<FormErrors>({});
  const [suggestion, setSuggestion] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: string; invoiceNo: string; changed: boolean } | null>(null);
  const [adding, setAdding] = useState<{ kind: 'company' } | { kind: 'item'; lineKey: string } | null>(null);
  const [status, setStatus] = useState<AutosaveStatus>({ kind: 'idle' });
  const initialJson = useRef(JSON.stringify(initial));
  const allowLeave = useRef(false);

  const dirty = JSON.stringify(form) !== initialJson.current;
  const fy = form.invoiceDate ? fyOf(form.invoiceDate) : null;
  const sameState = isSameState(form);
  const totals = useMemo(() => formTotals(form), [form]);
  const gstinValid = form.buyerGstin.length === 15 && gstinProblem(form.buyerGstin) === null;

  // Suggested number for the chosen year (shown until the user types one).
  useEffect(() => {
    if (!fy) return;
    let alive = true;
    nextSerial(fy).then(
      (n) => alive && setSuggestion(n),
      () => alive && setSuggestion(null),
    );
    return () => {
      alive = false;
    };
  }, [fy]);

  // Drafts: sent to Supabase 3 s after the last change; kept on the device while offline.
  const saver = useMemo(
    () => createAutosaver({ delayMs: 3000, retryMs: 10000, save: upsertDraft, storage: window.localStorage, onStatus: setStatus }),
    [],
  );
  useEffect(() => {
    if (dirty && !saved) saver.schedule({ id: form.id, label: draftLabel(form), data: form });
  }, [form, dirty, saved, saver]);
  useEffect(() => () => void saver.flushNow(), [saver]);

  // Closing or refreshing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty || saved) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      if (allowLeave.current) return;
      saver.persistLocal();
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty, saved, saver]);

  // Navigating away inside the app with unsaved changes.
  const blocker = useBlocker(() => dirty && !saved && !allowLeave.current);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    modals.openConfirmModal({
      title: 'Leave without saving?',
      children: <Text>This invoice is not saved yet. Your work stays in Drafts, so you can finish it later.</Text>,
      labels: { confirm: 'Leave', cancel: 'Stay' },
      closeOnClickOutside: false,
      closeOnEscape: false,
      withCloseButton: false,
      onConfirm: () => {
        void saver.flushNow();
        blocker.proceed();
      },
      onCancel: () => blocker.reset(),
    });
  }, [blocker, saver]);

  const update = (fn: (f: InvoiceForm) => InvoiceForm) => setForm(fn);
  const updateLine = (l: LineForm) => update((f) => ({ ...f, lines: f.lines.map((x) => (x.key === l.key ? l : x)) }));
  const updateCharge = (c: ChargeForm) => update((f) => ({ ...f, charges: f.charges.map((x) => (x.key === c.key ? c : x)) }));

  function removeLine(key: string) {
    const index = form.lines.findIndex((l) => l.key === key);
    const removed = form.lines[index];
    setErrors({});
    update((f) => ({ ...f, lines: f.lines.filter((l) => l.key !== key) }));
    const id = `undo-${key}`;
    notifications.show({
      id,
      autoClose: 8000,
      message: (
        <Group justify="space-between">
          Item removed
          <Button
            variant="light"
            onClick={() => {
              update((f) => ({ ...f, lines: [...f.lines.slice(0, index), removed, ...f.lines.slice(index)] }));
              notifications.hide(id);
            }}
          >
            Undo
          </Button>
        </Group>
      ),
    });
  }

  function removeCharge(key: string) {
    const index = form.charges.findIndex((c) => c.key === key);
    const removed = form.charges[index];
    setErrors({});
    update((f) => ({ ...f, charges: f.charges.filter((c) => c.key !== key) }));
    const id = `undo-${key}`;
    notifications.show({
      id,
      autoClose: 8000,
      message: (
        <Group justify="space-between">
          Charge removed
          <Button
            variant="light"
            onClick={() => {
              update((f) => ({ ...f, charges: [...f.charges.slice(0, index), removed, ...f.charges.slice(index)] }));
              notifications.hide(id);
            }}
          >
            Undo
          </Button>
        </Group>
      ),
    });
  }

  async function handleSaveError(err: unknown) {
    const e = describeError(err);
    const keepEditing = () => {
      saver.resume();
      saver.schedule({ id: form.id, label: draftLabel(form), data: form });
    };
    if (e.code === 'ALREADY_SAVED') {
      notifications.show({ message: e.message });
      await deleteDraft(form.id).catch(() => undefined);
      saver.forget(form.id);
      allowLeave.current = true;
      navigate(`/invoices/${form.id}`);
      return;
    }
    keepEditing();
    if (e.code === 'DUPLICATE_NUMBER') {
      setErrors({ serial: e.message });
      document.getElementById('invoice-serial')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (e.code === 'EDIT_CONFLICT') {
      modals.openConfirmModal({
        title: 'Changed on another device',
        children: <Text>{e.message}</Text>,
        labels: { confirm: 'Reload', cancel: 'Stay here' },
        onConfirm: () =>
          void (async () => {
            await saver.stop();
            await deleteDraft(form.id).catch(() => undefined);
            saver.forget(form.id);
            allowLeave.current = true;
            window.location.reload();
          })(),
      });
      return;
    }
    if (e.code === 'INVOICE_DELETED') {
      modals.openConfirmModal({
        title: 'Invoice was deleted',
        children: <Text>{e.message}</Text>,
        labels: { confirm: 'Save as new', cancel: 'Cancel' },
        onConfirm: () => {
          setForm(asNewInvoice);
          notifications.show({ message: 'Press Save to save it as a new invoice.' });
        },
      });
      return;
    }
    notifications.show({ color: 'red', title: 'Not saved', message: e.message, autoClose: false });
  }

  async function save() {
    const errs = validateForm(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      notifications.show({ color: 'red', message: 'Please fix the highlighted fields.' });
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus({ preventScroll: true });
      });
      return;
    }
    setSaving(true);
    // No queued or in-flight draft write may land after save_invoice deletes the draft.
    await saver.stop();
    const preview = fy ? `${fy}/${serialDisplay(form, suggestion)}` : '';
    try {
      const res = await saveInvoice(buildSavePayload(form), form.expectedUpdatedAt);
      saver.forget(form.id);
      setSaved({ id: res.id, invoiceNo: res.invoice_no, changed: res.invoice_no !== preview });
    } catch (err) {
      await handleSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <Stack align="center" py="xl" gap="lg">
        <IconCircleCheck size={72} color="var(--mantine-color-green-7)" aria-hidden />
        <Title order={1} ta="center">
          Invoice {saved.invoiceNo} saved
        </Title>
        {saved.changed && <Text ta="center">The suggested number was taken, so it was saved as {saved.invoiceNo}.</Text>}
        <Group>
          <Button component={Link} to={`/invoices/${saved.id}`}>
            View
          </Button>
          <Button component={Link} to="/invoices/new" variant="light">
            New Invoice
          </Button>
        </Group>
      </Stack>
    );
  }

  const statusText =
    status.kind === 'saving'
      ? 'Saving draft…'
      : status.kind === 'saved'
        ? `Draft saved ${fmtClock(status.at)}`
        : status.kind === 'offline'
          ? 'Not saved — no internet'
          : '';

  const sections = (
    <>
      <Paper withBorder p="md">
        <Stack>
          <Title order={2}>1. Details</Title>
          <TextInput
            type="date"
            label="Invoice date"
            value={form.invoiceDate}
            onChange={(e) => {
              const v = e.currentTarget.value;
              update((f) => changeDate(f, v));
            }}
            error={errors.invoiceDate}
          />
          <TextInput
            id="invoice-serial"
            label="Invoice number"
            inputMode="numeric"
            leftSection={<Text fw={700}>{fy ?? '—'} /</Text>}
            leftSectionWidth={110}
            description={form.serialTouched ? 'Your number' : 'Suggested — you can change it'}
            value={serialDisplay(form, suggestion)}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const v = e.currentTarget.value.replace(/\D/g, '');
              update((f) => ({ ...f, serialInput: v, serialTouched: true }));
            }}
            error={errors.serial}
          />
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack>
          <Title order={2}>2. Buyer</Title>
          <CompanyPicker
            companies={masters.companies}
            value={form.companyId}
            currentName={form.buyerName}
            error={errors.company}
            onPick={(c) => update((f) => applyCompany(f, c))}
            onAddNew={() => setAdding({ kind: 'company' })}
          />
          <Textarea
            label="Billing address"
            autosize
            minRows={2}
            value={form.buyerAddress}
            onChange={(e) => {
              const v = e.currentTarget.value;
              update((f) => ({ ...f, buyerAddress: v }));
            }}
            error={errors.buyerAddress}
          />
          <TextInput
            label="GSTIN"
            description="Leave empty if the buyer is not registered"
            value={form.buyerGstin}
            onChange={(e) => {
              const v = e.currentTarget.value;
              update((f) => setBuyerGstin(f, v));
            }}
            error={errors.buyerGstin}
          />
          <StateSelect
            label="Buyer state"
            value={form.buyerStateCode || null}
            disabled={gstinValid}
            description={gstinValid ? 'Taken from the GSTIN' : undefined}
            onChange={(v) => v && update((f) => setBuyerState(f, v))}
            error={errors.buyerStateCode}
          />
          <Checkbox
            label="Shipping address same as billing"
            checked={form.shipSame}
            onChange={(e) => {
              const v = e.currentTarget.checked;
              update((f) => ({ ...f, shipSame: v }));
            }}
          />
          {!form.shipSame && (
            <Textarea
              label="Shipping address"
              autosize
              minRows={2}
              value={form.shipAddress}
              onChange={(e) => {
                const v = e.currentTarget.value;
                update((f) => ({ ...f, shipAddress: v }));
              }}
              error={errors.shipAddress}
            />
          )}
          <StateSelect
            label="Place of supply"
            value={form.placeOfSupply || null}
            onChange={(v) => v && update((f) => ({ ...f, placeOfSupply: v }))}
            error={errors.placeOfSupply}
          />
          <Badge
            size="xl"
            variant="light"
            color={sameState ? 'teal' : 'violet'}
            style={{ alignSelf: 'flex-start', textTransform: 'none', height: 'auto', padding: '8px 12px' }}
          >
            {sameState ? 'CGST + SGST (same state)' : 'IGST (other state)'}
          </Badge>
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack>
          <Title order={2}>3. Terms and transport</Title>
          <SelectWithOther
            label="Payment terms"
            options={PAYMENT_TERMS}
            value={form.paymentTerms}
            onChange={(v) => update((f) => ({ ...f, paymentTerms: v }))}
            error={errors.paymentTerms}
          />
          <SelectWithOther
            label="Mode of transport"
            options={TRANSPORT_MODES}
            value={form.transportMode}
            onChange={(v) => update((f) => ({ ...f, transportMode: v }))}
            error={errors.transportMode}
          />
          <TextInput
            label="Vehicle number (optional)"
            value={form.vehicleNo}
            onChange={(e) => {
              const v = e.currentTarget.value;
              update((f) => ({ ...f, vehicleNo: v }));
            }}
          />
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack>
          <Title order={2}>4. Items</Title>
          {errors.lines && (
            <Text c="red.8" data-invalid="true" tabIndex={-1}>
              {errors.lines}
            </Text>
          )}
          {form.lines.map((l, i) => (
            <ItemCard
              key={l.key}
              index={i}
              line={l}
              items={masters.items}
              row={totals.lines[i]}
              errors={errors}
              onChange={updateLine}
              onRemove={() => removeLine(l.key)}
              onAddNewItem={() => setAdding({ kind: 'item', lineKey: l.key })}
            />
          ))}
          <Button size="xl" variant="light" onClick={() => update((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))}>
            + Add item
          </Button>
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack>
          <Title order={2}>5. Charges</Title>
          {form.charges.length === 0 && <Text c="gray.7">No extra charges.</Text>}
          {form.charges.map((c, i) => (
            <ChargeRow
              key={c.key}
              index={i}
              charge={c}
              chargeTypes={masters.chargeTypes}
              row={totals.charges[i]}
              errors={errors}
              onChange={updateCharge}
              onRemove={() => removeCharge(c.key)}
            />
          ))}
          <Button size="xl" variant="light" onClick={() => update((f) => ({ ...f, charges: [...f.charges, emptyCharge()] }))}>
            + Add charge
          </Button>
        </Stack>
      </Paper>
    </>
  );

  const saveButton = (
    <Button size="xl" fullWidth onClick={() => void save()} disabled={saving}>
      {saving ? 'Saving…' : 'Save'}
    </Button>
  );
  const addingItemKey = adding?.kind === 'item' ? adding.lineKey : null;

  return (
    <Stack>
      <Title order={1}>{form.mode === 'edit' ? `Edit invoice ${form.originalInvoiceNo}` : 'New invoice'}</Title>
      {statusText && (
        <Text c={status.kind === 'offline' ? 'orange.9' : 'gray.7'} data-testid="draft-status">
          {statusText}
        </Text>
      )}
      {wide ? (
        <Grid gutter="lg">
          <Grid.Col span={8}>
            <Stack>{sections}</Stack>
          </Grid.Col>
          <Grid.Col span={4}>
            <TotalsPanel totals={totals} sameState={sameState} mode="side" action={saveButton} />
          </Grid.Col>
        </Grid>
      ) : (
        <Stack>
          {sections}
          <TotalsPanel totals={totals} sameState={sameState} mode="bottom" action={saveButton} />
        </Stack>
      )}

      <Modal opened={adding?.kind === 'company'} onClose={() => setAdding(null)} title="Add company" fullScreen={!wide} size="lg">
        <CompanyForm
          onCancel={() => setAdding(null)}
          onSaved={(c) => {
            setMasters((m) => ({ ...m, companies: [...m.companies, c].sort((a, b) => a.name.localeCompare(b.name)) }));
            update((f) => applyCompany(f, c));
            setAdding(null);
          }}
        />
      </Modal>
      <Modal opened={addingItemKey !== null} onClose={() => setAdding(null)} title="Add item" fullScreen={!wide} size="lg">
        <ItemForm
          onCancel={() => setAdding(null)}
          onSaved={(it) => {
            setMasters((m) => ({ ...m, items: [...m.items, it].sort((a, b) => a.name.localeCompare(b.name)) }));
            update((f) => ({ ...f, lines: f.lines.map((l) => (l.key === addingItemKey ? applyItem(l, it) : l)) }));
            setAdding(null);
          }}
        />
      </Modal>
    </Stack>
  );
}
