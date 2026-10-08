const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-10-07' -> '07-Oct-2026' */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
}

const istParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** timestamptz string -> '06-Oct-2026 15:30' in IST. Month comes from MONTHS, never from Intl. */
export function fmtDateTime(ts: string): string {
  const p = Object.fromEntries(istParts.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return `${p.day}-${MONTHS[Number(p.month) - 1]}-${p.year} ${p.hour}:${p.minute}`;
}

const istClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kolkata',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** timestamptz string -> '3:42 PM' in IST (used inside error messages). */
export function fmtTime(ts: string): string {
  return istClock.format(new Date(ts));
}

/** Device clock 'HH:MM' for status lines such as "Draft saved 10:42". */
export function fmtClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** ILIKE pattern for the invoice search box, or null when there is nothing to search for. */
export function searchPattern(q: string): string | null {
  const s = q.trim().toLowerCase().replace(/[\\%_]/g, '');
  return s ? `%${s}%` : null;
}
