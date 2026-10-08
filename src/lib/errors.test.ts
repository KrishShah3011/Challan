import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeError, loadErrorMessage } from './errors';

afterEach(() => vi.restoreAllMocks());

describe('describeError', () => {
  it('explains a duplicate invoice number with who has it', () => {
    const e = describeError({
      code: 'P0001',
      message: 'DUPLICATE_NUMBER',
      details: '{"invoice_no":"2026-27/008","buyer_name":"ABC Traders","invoice_date":"2026-10-05"}',
    });
    expect(e.code).toBe('DUPLICATE_NUMBER');
    expect(e.message).toBe('2026-27/008 is already used by ABC Traders (05-Oct-2026). Please choose another number.');
  });
  it('explains an edit conflict with the other save time in IST', () => {
    const e = describeError({ code: 'P0001', message: 'EDIT_CONFLICT', details: '{"updated_at":"2026-10-06T10:12:00+00:00"}' });
    expect(e.message).toBe('This invoice was changed on another device at 3:42 PM. Reload to see the latest.');
  });
  it('explains an already saved invoice', () => {
    expect(describeError({ code: 'P0001', message: 'ALREADY_SAVED', details: '{"invoice_no":"2026-27/012"}' }).message).toBe(
      'This invoice was already saved as 2026-27/012.',
    );
  });
  it.each([
    ['INVOICE_DELETED', 'This invoice was deleted on another device. Save it as a new invoice?'],
    ['NO_SELLER', 'Please fill your company details in Settings first.'],
    ['CONFIRM_MISMATCH', 'The number you typed does not match.'],
    ['NO_ITEMS', 'Please add at least one item.'],
  ])('maps %s', (code, text) => {
    expect(describeError({ code: 'P0001', message: code, details: null }).message).toBe(text);
  });
  it('names a duplicate company', () => {
    const e = describeError({ code: '23505', message: 'duplicate key value violates unique constraint "companies_active_name_gstin"' });
    expect(e.code).toBe('DUPLICATE_COMPANY');
    expect(e.message).toMatch(/already exists/);
  });
  it('recognises a dropped connection', () => {
    expect(describeError({ message: 'TypeError: Failed to fetch' }).message).toBe(
      "Couldn't save — no internet. Nothing is lost, try again.",
    );
    expect(loadErrorMessage({ message: 'TypeError: Failed to fetch' })).toBe("Couldn't load — no internet. Please try again.");
  });
  it('asks to log in again when the session expired', () => {
    expect(describeError({ code: 'PGRST301', message: 'JWT expired' }).message).toBe('Please log in again.');
  });
  it('never crashes on bad details or unknown errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(describeError({ code: 'P0001', message: 'DUPLICATE_NUMBER', details: 'not json' }).code).toBe('DUPLICATE_NUMBER');
    expect(describeError(new Error('boom')).message).toBe('Something went wrong. Please try again.');
    expect(describeError(undefined).code).toBe('UNKNOWN');
  });
});
