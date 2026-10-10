import { Alert, Button, Center, Group, Loader, Stack, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { InvoiceEditor } from '../components/InvoiceEditor';
import { deleteDraft, getDraft, getInvoice, getSeller, loadMasters } from '../lib/db';
import { describeError, loadErrorMessage } from '../lib/errors';
import { fmtDateTime } from '../lib/format';
import { asNewInvoice, emptyForm, formFromInvoice, type InvoiceForm } from '../lib/invoiceForm';
import type { DraftRow, InvoiceFull, Masters } from '../lib/types';

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'no-seller' }
  | { status: 'ask'; invoice: InvoiceFull; draft: DraftRow; masters: Masters }
  | { status: 'ready'; form: InvoiceForm; masters: Masters; notice?: string };

async function load(id: string | undefined, draftId: string | null, resume: boolean): Promise<Load> {
  if (!id) {
    const [seller, masters, draft] = await Promise.all([getSeller(), loadMasters(), draftId ? getDraft(draftId) : null]);
    if (draft) return { status: 'ready', form: draft.data as InvoiceForm, masters };
    if (!seller) return { status: 'no-seller' };
    return { status: 'ready', form: emptyForm(seller.state_code), masters };
  }
  const [invoice, draft, masters] = await Promise.all([getInvoice(id), getDraft(id), loadMasters()]);
  if (!invoice) {
    if (!draft) return { status: 'error', message: 'This invoice no longer exists.' };
    return {
      status: 'ready',
      form: asNewInvoice(draft.data as InvoiceForm),
      masters,
      notice: 'This invoice was deleted on another device. Your changes will be saved as a new invoice.',
    };
  }
  if (draft && !resume) return { status: 'ask', invoice, draft, masters };
  return { status: 'ready', form: draft ? (draft.data as InvoiceForm) : formFromInvoice(invoice), masters };
}

export function InvoiceFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const draftId = params.get('draft');
  const resume = params.get('resume') === '1';
  const [state, setState] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    load(id, draftId, resume).then(
      (s) => {
        if (!alive) return;
        if (s.status === 'ready' && s.notice) notifications.show({ message: s.notice, autoClose: false });
        setState(s);
      },
      (e: unknown) => {
        if (alive) setState({ status: 'error', message: loadErrorMessage(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, draftId, resume, location.key, attempt]);

  if (state.status === 'loading') {
    return (
      <Center py="xl">
        <Loader size="xl" />
      </Center>
    );
  }
  if (state.status === 'error') {
    return (
      <Alert color="red" title="Could not open the invoice">
        <Stack>
          {state.message}
          <Group>
            <Button onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
            <Button component={Link} to="/invoices" variant="default">
              Back to invoices
            </Button>
          </Group>
        </Stack>
      </Alert>
    );
  }
  if (state.status === 'no-seller') {
    return (
      <Alert color="blue" title="One step first">
        <Stack>
          Please fill your company details in Settings first.
          <Button component={Link} to="/settings">
            Go to Settings
          </Button>
        </Stack>
      </Alert>
    );
  }
  if (state.status === 'ask') {
    const { invoice, draft, masters } = state;
    const discard = async () => {
      try {
        await deleteDraft(draft.id);
        setState({ status: 'ready', form: formFromInvoice(invoice), masters });
      } catch (e) {
        notifications.show({ color: 'red', title: 'Not discarded', message: describeError(e).message });
      }
    };
    return (
      <Stack>
        <Title order={1}>Edit invoice {invoice.invoice_no}</Title>
        <Alert color="blue" title="Unsaved changes found">
          You have unsaved changes from {fmtDateTime(draft.updated_at)}.
        </Alert>
        <Group>
          <Button onClick={() => setState({ status: 'ready', form: draft.data as InvoiceForm, masters })}>Continue them</Button>
          <Button variant="light" color="red" onClick={() => void discard()}>
            Discard
          </Button>
        </Group>
      </Stack>
    );
  }
  return <InvoiceEditor key={state.form.id} initial={state.form} masters={state.masters} />;
}
