import { describe, expect, it } from 'vitest';
import { formatInvoiceNo, fyOf, padSerial, parseSerial, todayLocal } from './fy';

describe('fyOf', () => {
  it('starts a new financial year on 1 April', () => {
    expect(fyOf('2026-04-01')).toBe('2026-27');
  });
  it('keeps January to March in the previous year', () => {
    expect(fyOf('2027-03-31')).toBe('2026-27');
    expect(fyOf('2027-01-01')).toBe('2026-27');
  });
  it('rolls over again on the next 1 April', () => {
    expect(fyOf('2027-04-01')).toBe('2027-28');
  });
  it('wraps the century', () => {
    expect(fyOf('2099-04-01')).toBe('2099-00');
  });
});

describe('invoice numbers', () => {
  it('pads the serial to 3 digits', () => {
    expect(formatInvoiceNo('2026-27', 1)).toBe('2026-27/001');
    expect(padSerial(999)).toBe('999');
  });
  it('prints 1000 and above in full', () => {
    expect(formatInvoiceNo('2026-27', 1000)).toBe('2026-27/1000');
  });
});

describe('parseSerial', () => {
  it.each([
    ['12', 12],
    ['012', 12],
    [' 8 ', 8],
    ['99999999', 99999999],
  ])('reads %s as %s', (input, expected) => {
    expect(parseSerial(input)).toBe(expected);
  });
  it.each(['', '0', '000', '-1', '1.5', 'abc', '123456789'])('rejects %j', (input) => {
    expect(parseSerial(input)).toBeNull();
  });
});

describe('todayLocal', () => {
  it('uses the device date, not UTC (just after midnight IST is still today)', () => {
    expect(todayLocal(new Date(2026, 9, 8, 0, 30))).toBe('2026-10-08');
    expect(todayLocal(new Date(2026, 9, 8, 23, 59))).toBe('2026-10-08');
  });
  it('pads month and day', () => {
    expect(todayLocal(new Date(2027, 0, 5))).toBe('2027-01-05');
  });
});
