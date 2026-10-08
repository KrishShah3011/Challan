import { describe, expect, it } from 'vitest';
import { computeTotals, fmtMoney, fmtRate, fmtSigned, parseAmount, plain, D } from './invoiceMath';

const s = (d: { toFixed(): string }) => d.toFixed();

describe('parseAmount', () => {
  it.each([
    ['1,000', 'qty', '1000'],
    ['.5', 'qty', '0.5'],
    ['5.', 'qty', '5'],
    [' 2 ', 'qty', '2'],
    ['2.333', 'qty', '2.333'],
    ['10.25', 'price', '10.25'],
    ['0', 'price', '0'],
    ['100', 'rate', '100'],
    ['0.25', 'rate', '0.25'],
  ] as const)('accepts %j as %s → %s', (raw, kind, expected) => {
    expect(parseAmount(raw, kind)).toBe(expected);
  });
  it.each([
    ['2.3335', 'qty'],
    ['12.345', 'price'],
    ['1e3', 'qty'],
    ['-1', 'price'],
    ['abc', 'qty'],
    ['', 'amount'],
    ['100.01', 'rate'],
    ['123456789012', 'qty'],
  ] as const)('rejects %j as %s', (raw, kind) => {
    expect(parseAmount(raw, kind)).toBeNull();
  });
});

describe('computeTotals', () => {
  it('multiplies exactly with no rounding', () => {
    const t = computeTotals([{ qty: '2.333', price: '10.25', gstRate: '18' }], [], true);
    expect(s(t.lines[0].amount)).toBe('23.91325');
    expect(s(t.lines[0].gstAmount)).toBe('4.304385');
  });
  it('rounds .50 up and .49 down only at the end', () => {
    const up = computeTotals([{ qty: '1', price: '10.50', gstRate: '0' }], [], true);
    expect(s(up.grandTotal)).toBe('11');
    expect(s(up.roundOff)).toBe('0.5');
    const down = computeTotals([{ qty: '1', price: '10.49', gstRate: '0' }], [], true);
    expect(s(down.grandTotal)).toBe('10');
    expect(s(down.roundOff)).toBe('-0.49');
  });
  it('splits GST into CGST and SGST in the same state, grouped by rate', () => {
    const t = computeTotals(
      [
        { qty: '2', price: '100', gstRate: '5' },
        { qty: '1', price: '50', gstRate: '18' },
      ],
      [{ amount: '100', gstRate: '18' }],
      true,
    );
    expect(s(t.itemsTotal)).toBe('250');
    expect(s(t.chargesTotal)).toBe('100');
    expect(s(t.taxableTotal)).toBe('350');
    expect(s(t.cgstTotal)).toBe('18.5');
    expect(s(t.sgstTotal)).toBe('18.5');
    expect(s(t.igstTotal)).toBe('0');
    expect(s(t.exactTotal)).toBe('387');
    expect(s(t.grandTotal)).toBe('387');
    expect(t.byRate.map((g) => [s(g.rate), s(g.taxable), s(g.gst)])).toEqual([
      ['5', '200', '10'],
      ['18', '150', '27'],
    ]);
  });
  it('uses IGST for another state', () => {
    const t = computeTotals([{ qty: '2', price: '100', gstRate: '5' }], [{ amount: '100', gstRate: '18' }], false);
    expect(s(t.igstTotal)).toBe('28');
    expect(s(t.cgstTotal)).toBe('0');
    expect(s(t.sgstTotal)).toBe('0');
  });
  it('halves fractional rates exactly', () => {
    const t = computeTotals([{ qty: '1', price: '1000', gstRate: '0.25' }], [], true);
    expect(s(t.cgstTotal)).toBe('1.25');
    expect(fmtRate(t.byRate[0].rate.dividedBy(2))).toBe('0.125%');
  });
  it('allows a zero-price line', () => {
    const t = computeTotals([{ qty: '5', price: '0', gstRate: '18' }], [], true);
    expect(s(t.grandTotal)).toBe('0');
  });
  it('treats half-typed or invalid inputs as 0 for the live total', () => {
    const t = computeTotals([{ qty: 'abc', price: '10', gstRate: '' }], [{ amount: '', gstRate: '18' }], true);
    expect(s(t.grandTotal)).toBe('0');
  });
  it('keeps the matching e2e example consistent (480 + 100 charges → 653)', () => {
    const t = computeTotals(
      [
        { qty: '2', price: '120', gstRate: '18' },
        { qty: '1.5', price: '160', gstRate: '5' },
      ],
      [{ amount: '100', gstRate: '18' }],
      true,
    );
    expect(s(t.exactTotal)).toBe('653.2');
    expect(s(t.grandTotal)).toBe('653');
    expect(s(t.roundOff)).toBe('-0.2');
  });
});

describe('display helpers', () => {
  it('formats money Indian style, rounding half-up via decimals', () => {
    expect(fmtMoney('112345')).toBe('₹1,12,345.00');
    expect(fmtMoney('1.005')).toBe('₹1.01');
    expect(fmtMoney(new D('23.91325'))).toBe('₹23.91');
  });
  it('shows round off with a sign and never "-0.00"', () => {
    expect(fmtSigned('0.3')).toBe('+0.30');
    expect(fmtSigned('-0.4')).toBe('−0.40');
    expect(fmtSigned('-0.004')).toBe('0.00');
  });
  it('drops trailing zeros for form fields', () => {
    expect(plain('18.00')).toBe('18');
    expect(plain('120.50')).toBe('120.5');
    expect(plain('2.000')).toBe('2');
  });
});
