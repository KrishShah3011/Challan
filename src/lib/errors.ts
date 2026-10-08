import { fmtDate, fmtTime } from './format';

export type ErrorCode =
  | 'DUPLICATE_NUMBER'
  | 'EDIT_CONFLICT'
  | 'ALREADY_SAVED'
  | 'INVOICE_DELETED'
  | 'TOTALS_MISMATCH'
  | 'NO_SELLER'
  | 'CONFIRM_MISMATCH'
  | 'NOT_FOUND'
  | 'NO_ITEMS'
  | 'BAD_REQUEST'
  | 'DUPLICATE_COMPANY'
  | 'DUPLICATE_ITEM'
  | 'DUPLICATE_CHARGE'
  | 'INVALID'
  | 'NETWORK'
  | 'AUTH'
  | 'UNKNOWN';

export interface AppError {
  code: ErrorCode;
  message: string;
  details: Record<string, string>;
}

interface RawError {
  code?: string;
  message?: string;
  details?: string | null;
  status?: number;
}

function parseDetails(d: unknown): Record<string, string> {
  if (typeof d !== 'string') return {};
  try {
    const o: unknown = JSON.parse(d);
    if (!o || typeof o !== 'object') return {};
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]));
  } catch {
    return {};
  }
}

/** Turns any Supabase/PostgREST/network error into plain English (spec §5.6). */
export function describeError(err: unknown): AppError {
  const e = (err && typeof err === 'object' ? err : {}) as RawError;
  const message = typeof e.message === 'string' ? e.message : '';
  const details = parseDetails(e.details);
  const make = (code: ErrorCode, text: string): AppError => ({ code, message: text, details });

  switch (message) {
    case 'DUPLICATE_NUMBER':
      return make(
        'DUPLICATE_NUMBER',
        details.invoice_no
          ? `${details.invoice_no} is already used by ${details.buyer_name} (${fmtDate(details.invoice_date)}). Please choose another number.`
          : 'This invoice number is already used. Please choose another number.',
      );
    case 'EDIT_CONFLICT':
      return make(
        'EDIT_CONFLICT',
        details.updated_at
          ? `This invoice was changed on another device at ${fmtTime(details.updated_at)}. Reload to see the latest.`
          : 'This invoice was changed on another device. Reload to see the latest.',
      );
    case 'ALREADY_SAVED':
      return make('ALREADY_SAVED', `This invoice was already saved as ${details.invoice_no ?? 'another number'}.`);
    case 'INVOICE_DELETED':
      return make('INVOICE_DELETED', 'This invoice was deleted on another device. Save it as a new invoice?');
    case 'TOTALS_MISMATCH':
      console.error('TOTALS_MISMATCH', details);
      return make('TOTALS_MISMATCH', 'The totals could not be verified. Please try again.');
    case 'NO_SELLER':
      return make('NO_SELLER', 'Please fill your company details in Settings first.');
    case 'CONFIRM_MISMATCH':
      return make('CONFIRM_MISMATCH', 'The number you typed does not match.');
    case 'NOT_FOUND':
      return make('NOT_FOUND', 'This invoice no longer exists.');
    case 'NO_ITEMS':
      return make('NO_ITEMS', 'Please add at least one item.');
    case 'BAD_REQUEST':
      return make('BAD_REQUEST', 'Something is missing from this invoice. Please check the form and try again.');
  }

  if (e.code === '23505') {
    if (message.includes('companies_active_name_gstin')) {
      return make(
        'DUPLICATE_COMPANY',
        'A company with this name and GSTIN already exists. If it has no GSTIN, add the GSTIN or tell them apart, e.g. "ABC Traders – Surat".',
      );
    }
    if (message.includes('items_active_name')) return make('DUPLICATE_ITEM', 'An item with this name already exists.');
    if (message.includes('charge_types_active_name')) {
      return make('DUPLICATE_CHARGE', 'A charge type with this name already exists.');
    }
  }
  if (e.code === '23514' || e.code === '23502' || e.code === '22P02' || e.code === '22003') {
    return make('INVALID', 'Some values are not valid. Please check the highlighted fields.');
  }
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline || /failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return make('NETWORK', "Couldn't save — no internet. Nothing is lost, try again.");
  }
  if (e.code === 'PGRST301' || e.code === 'PGRST303' || e.status === 401 || /jwt/i.test(message)) {
    return make('AUTH', 'Please log in again.');
  }
  console.error(err);
  return make('UNKNOWN', 'Something went wrong. Please try again.');
}

/** Same as describeError, worded for loading a page instead of saving. */
export function loadErrorMessage(err: unknown): string {
  const e = describeError(err);
  return e.code === 'NETWORK' ? "Couldn't load — no internet. Please try again." : e.message;
}
