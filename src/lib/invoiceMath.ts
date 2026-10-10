import Decimal from 'decimal.js-light';

/** Exact decimal arithmetic. precision 50: the default of 20 significant digits would round large amounts. */
export const D = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });
export type Dec = Decimal;

const LIMITS = {
  qty: { int: 11, dp: 3 },
  price: { int: 12, dp: 2 },
  amount: { int: 12, dp: 2 },
  rate: { int: 3, dp: 2 },
} as const;
export type NumberKind = keyof typeof LIMITS;

/** Accept what people type: '1,000' -> '1000', '.5' -> '0.5', '5.' -> '5', ' 2 ' -> '2'. A lone '.' has no digits -> ''. */
export function cleanNumber(raw: string): string {
  let s = raw.replace(/[\s,]/g, '');
  if (s === '.') return '';
  if (s.startsWith('.')) s = `0${s}`;
  if (s.endsWith('.')) s = s.slice(0, -1);
  return s;
}

/** Exact decimal string for a field of this kind, or null when it is not valid. */
export function parseAmount(raw: string, kind: NumberKind): string | null {
  const s = cleanNumber(raw);
  const { int, dp } = LIMITS[kind];
  if (!new RegExp(`^\\d{1,${int}}(\\.\\d{1,${dp}})?$`).test(s)) return null;
  if (kind === 'rate' && new D(s).gt(100)) return null;
  return s;
}

/** '18.00' -> '18' (for filling form fields from database values). */
export function plain(value: string | number | Dec): string {
  return new D(value).toFixed();
}

function num(raw: string, kind: NumberKind): Dec {
  return new D(parseAmount(raw, kind) ?? 0);
}

export interface LineInput {
  qty: string;
  price: string;
  gstRate: string;
}
export interface ChargeInput {
  amount: string;
  gstRate: string;
}
export interface Row {
  amount: Dec;
  gstAmount: Dec;
}
export interface RateGroup {
  rate: Dec;
  taxable: Dec;
  gst: Dec;
}
export interface Totals {
  lines: Row[];
  charges: Row[];
  itemsTotal: Dec;
  chargesTotal: Dec;
  taxableTotal: Dec;
  cgstTotal: Dec;
  sgstTotal: Dec;
  igstTotal: Dec;
  exactTotal: Dec;
  grandTotal: Dec;
  roundOff: Dec;
  byRate: RateGroup[];
}

const sum = (xs: Dec[]): Dec => xs.reduce((a, b) => a.plus(b), new D(0));

/** Spec §8.1. Invalid or half-typed inputs count as 0 so the live total never crashes. */
export function computeTotals(lines: LineInput[], charges: ChargeInput[], sameState: boolean): Totals {
  const lineRates = lines.map((l) => num(l.gstRate, 'rate'));
  const chargeRates = charges.map((c) => num(c.gstRate, 'rate'));
  const lineRows = lines.map((l, i) => {
    const amount = num(l.qty, 'qty').times(num(l.price, 'price'));
    return { amount, gstAmount: amount.times(lineRates[i]).dividedBy(100) };
  });
  const chargeRows = charges.map((c, i) => {
    const amount = num(c.amount, 'amount');
    return { amount, gstAmount: amount.times(chargeRates[i]).dividedBy(100) };
  });

  const itemsTotal = sum(lineRows.map((r) => r.amount));
  const chargesTotal = sum(chargeRows.map((r) => r.amount));
  const taxableTotal = itemsTotal.plus(chargesTotal);
  const gstTotal = sum([...lineRows, ...chargeRows].map((r) => r.gstAmount));
  const half = gstTotal.dividedBy(2);
  const exactTotal = taxableTotal.plus(gstTotal);
  const grandTotal = exactTotal.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  const groups = new Map<string, RateGroup>();
  const add = (rate: Dec, r: Row) => {
    const key = rate.toFixed();
    const g = groups.get(key) ?? { rate, taxable: new D(0), gst: new D(0) };
    groups.set(key, { rate, taxable: g.taxable.plus(r.amount), gst: g.gst.plus(r.gstAmount) });
  };
  lineRows.forEach((r, i) => add(lineRates[i], r));
  chargeRows.forEach((r, i) => add(chargeRates[i], r));

  return {
    lines: lineRows,
    charges: chargeRows,
    itemsTotal,
    chargesTotal,
    taxableTotal,
    cgstTotal: sameState ? half : new D(0),
    sgstTotal: sameState ? half : new D(0),
    igstTotal: sameState ? new D(0) : gstTotal,
    exactTotal,
    grandTotal,
    roundOff: grandTotal.minus(exactTotal),
    byRate: [...groups.values()].sort((a, b) => a.rate.toNumber() - b.rate.toNumber()),
  };
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const plain2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** '₹1,12,345.00'. Rounds half-up with decimals first; Intl only sees a 2-decimal value. */
export function fmtMoney(x: Dec | string | number): string {
  return inr.format(Number(new D(x).toDecimalPlaces(2).toFixed(2)));
}

/** Round-off display: '+0.30', '−0.40', and '0.00' instead of '-0.00'. */
export function fmtSigned(x: Dec | string): string {
  const r = new D(x).toDecimalPlaces(2);
  if (r.isZero()) return '0.00';
  return (r.isNegative() ? '−' : '+') + plain2.format(Number(r.abs().toFixed(2)));
}

/** '18%', '0.125%' */
export function fmtRate(x: Dec | string): string {
  return `${new D(x).toFixed()}%`;
}
