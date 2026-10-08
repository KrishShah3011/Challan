/** Indian financial year (April–March) of an ISO date 'YYYY-MM-DD', e.g. '2026-27'. */
export function fyOf(isoDate: string): string {
  const [year, month] = isoDate.split('-').map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** 1 -> '001', 999 -> '999', 1000 -> '1000' (never truncated). */
export function padSerial(serial: number): string {
  return serial < 1000 ? String(serial).padStart(3, '0') : String(serial);
}

export function formatInvoiceNo(fy: string, serial: number): string {
  return `${fy}/${padSerial(serial)}`;
}

/** '012' -> 12. Blank, zero, decimals, signs or more than 8 digits -> null. */
export function parseSerial(input: string): number | null {
  const s = input.trim();
  if (!/^\d{1,8}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 ? n : null;
}

/** Today's date on this device as 'YYYY-MM-DD'. Not toISOString(): that is UTC and gives yesterday before 05:30 IST. */
export function todayLocal(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}
