import { describe, expect, it } from 'vitest';
import { fmtClock, fmtDate, fmtDateTime, fmtTime, searchPattern } from './format';

describe('dates', () => {
  it('shows dates as dd-Mon-yyyy', () => {
    expect(fmtDate('2026-10-07')).toBe('07-Oct-2026');
    expect(fmtDate('2026-09-01')).toBe('01-Sep-2026');
  });
  it('shows timestamps in IST with a fixed month table (never "Sept")', () => {
    expect(fmtDateTime('2026-10-06T10:00:00Z')).toBe('06-Oct-2026 15:30');
    expect(fmtDateTime('2026-09-01T00:00:00+00:00')).toBe('01-Sep-2026 05:30');
    expect(fmtDateTime('2026-10-06T18:45:00Z')).toBe('07-Oct-2026 00:15');
  });
  it('shows a clock time in IST for messages', () => {
    expect(fmtTime('2026-10-06T10:12:00Z')).toBe('3:42 PM');
  });
  it('shows a short device clock', () => {
    expect(fmtClock(new Date(2026, 9, 8, 9, 5))).toBe('09:05');
  });
});

describe('searchPattern', () => {
  it('is null for blank input', () => {
    expect(searchPattern('   ')).toBeNull();
  });
  it('lower-cases and wraps in %', () => {
    expect(searchPattern(' ABC Traders ')).toBe('%abc traders%');
  });
  it('keeps commas, quotes and slashes harmlessly', () => {
    expect(searchPattern('ABC, Traders')).toBe('%abc, traders%');
    expect(searchPattern('2026-27/0')).toBe('%2026-27/0%');
    expect(searchPattern('"Mehta"')).toBe('%"mehta"%');
  });
  it('drops LIKE wildcards and backslashes the user did not mean', () => {
    expect(searchPattern('50%_off\\')).toBe('%50off%');
    expect(searchPattern('%%')).toBeNull();
  });
});
