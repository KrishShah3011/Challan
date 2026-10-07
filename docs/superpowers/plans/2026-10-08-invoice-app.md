# GST Invoice App (Milestone 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a phone-and-desktop web app where an elderly-friendly form creates, edits, deletes and exports GST invoices stored in Supabase, with master lists, drafts and a tamper-proof change log.

**Architecture:** A Vite + React + TypeScript single-page app (Mantine UI) talks directly to Supabase with the user's login token. Postgres enforces every rule that must never break: unique invoice numbers per financial year, all-or-nothing saves and deletes through `security definer` functions, the change log, and row-level security. Live totals come from one exact-decimal TypeScript module, and the database re-checks them.

**Tech Stack:** Node 24, React 19.3, react-router 7.18, Mantine 8.3, @supabase/supabase-js 2.117, decimal.js-light 2.5, SheetJS 0.20.3 (from the SheetJS CDN), Vite 7.3, TypeScript 5.9, Vitest 3.2, Playwright 1.63, Supabase CLI 2.120 (run with `npx supabase`), pgTAP.

**Spec:** `docs/superpowers/specs/2026-10-08-invoice-app-design.md`. Read it before starting any task. Section numbers below (§) refer to it.

## Global Constraints

- **Dependency versions:** pinned exactly as in Task 1's `package.json`. Do not upgrade majors. Newer majors (Mantine 9, react-router 8, Vite 8, TypeScript 7, Vitest 5) exist, but this plan's code targets the pinned versions.
- **SheetJS:** install only from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, never from the npm registry `xlsx` package.
- **Money, quantity and rate values:** strings in form state and in every payload sent to the database.
  - Arithmetic only through `D` from `src/lib/invoiceMath.ts` (a decimal.js-light clone with `precision: 50`, `rounding: ROUND_HALF_UP`).
  - Never `parseFloat` or `Number()` a money value except when handing an already-rounded 2-decimal value to `Intl` or to an Excel cell.
- **Rounding:** none until the grand total, which is rounded once to whole rupees, half-up (§8.1). Display values are rounded to 2 decimals only when shown.
- **Formats:**
  - Money: `en-IN` INR, e.g. `₹1,12,345.00`.
  - Dates: `07-Oct-2026`.
  - Timestamps: Asia/Kolkata time.
  - Month names come from a fixed English table, never from `Intl` month names (ICU prints "Sept").
- **Invoice number:** `YYYY-YY/NNN` with a forward slash. The serial is padded to 3 digits, and 1000 and above print in full.
- **UI:**
  - English only.
  - Every Mantine input and button uses size `lg` (set once in the theme).
  - Text is at least 18 px (`1.125rem`); inputs and buttons are at least 48 px tall.
  - Labels are always visible above fields.
  - No hover-only or swipe-only actions.
  - The invoice editor has no `<form>` element, so Enter never submits it.
- **Atomic writes:** every user action is exactly one database call (§2 #18). Never chain two writes for one action in the client.
- **Error copy:** user-facing error messages are copied verbatim from spec §5.6 through `src/lib/errors.ts`.
- **Secrets:** never commit `.env.local`, `.env`, or any service-role key. Only `.env.example` is tracked.
- **Dev machine:** Windows 11 with Git Bash. Docker Desktop must be running for every `npx supabase` command except `init`.
- **User-only steps:** steps marked **(user)** need the account owner. The implementer stops and reports back instead of doing them.
- **Commits:** one commit per task with the message given in the task. Append the attribution trailer your harness requires.

## Review Focus

1. **A draft that comes back after Save.** An auto-save that is still queued or in flight when Save is pressed can re-create the draft that `save_invoice` just deleted, leaving a ghost entry in Drafts.
   - Expected: no draft remains after a successful save.
   - Pinned by the Task 12 `createAutosaver` unit test ("stop cancels the queued save and waits for the one in flight") and the Task 15 e2e check that the Drafts count does not grow after saving.
2. **Numbers typed the way people type them.**
   - `1,000`, `.5`, `5.` and ` 2 ` must be accepted as 1000, 0.5, 5 and 2.
   - `2.3335` (quantity), `12.345` (price), `1e3`, `-1` and `abs` must be refused with a plain message, not crash or silently round.
   - Pinned by Task 4 `parseAmount` tests and the Task 11 `validateForm` test.
3. **Editing an old invoice whose company or item was removed from the list.**
   - Expected: the picker still shows the saved name, marked "(removed from list)", and saving keeps the snapshot.
   - Pinned by the Task 11 `withCurrentOption` tests.
4. **Moving an invoice's date into another financial year and back while editing.**
   - Expected: the number returns to the invoice's original number, and a number typed for the old year is not carried into the new year.
   - Pinned by the Task 11 `changeDate` / `effectiveSerial` tests.
5. **Search text with commas, `%`, `_`, quotes or `/`** (`ABC, Traders`, `50%`, `2026-27/0`).
   - Expected: no error and sensible matches.
   - Pinned by the Task 3 `searchPattern` tests and the Task 14 e2e search test.

---

## File Map

```
package.json, tsconfig.json, vite.config.ts, index.html, vercel.json, .gitignore, .env.example   (Task 1)
playwright.config.ts                                     (Task 9)
.github/workflows/keep-alive.yml, README.md              (Task 18)

supabase/config.toml                                     (Task 5, generated by `supabase init`)
supabase/migrations/20261008000100_schema.sql            (Task 5)  tables, domains, generated columns, checks
supabase/migrations/20261008000200_functions.sql         (Task 6)  save_invoice, delete_invoice, next_serial, keep_alive, audit trigger
supabase/migrations/20261008000300_security.sql          (Task 7)  RLS + grants
supabase/migrations/20261008000400_go_live.sql           (Task 17) go_live_reset (service role only)
supabase/seed.sql                                        (Task 5)  dummy data
supabase/tests/database/0[1-4]_*.test.sql                (Tasks 5, 6, 7, 17) pgTAP

src/main.tsx, src/theme.ts, src/router.tsx, src/auth.tsx (Task 9; routes added in 10, 13, 14, 15)
src/vite-env.d.ts                                        (Task 1)
src/lib/fy.ts                 FY, invoice number, local today, serial parsing       (Task 1)
src/lib/gstin.ts              GSTIN rules + state list                               (Task 2)
src/lib/words.ts              amount in words (Indian system)                        (Task 3)
src/lib/format.ts             date/time display + search pattern                     (Task 3)
src/lib/invoiceMath.ts        exact totals, number parsing, money display            (Task 4)
src/lib/options.ts            units, payment terms, transport modes, HSN pattern     (Task 8)
src/lib/types.ts              row and payload types                                  (Task 8)
src/lib/errors.ts             error code → plain English (§5.6)                      (Task 8)
src/lib/supabase.ts, src/lib/db.ts   client + every query/RPC                        (Task 8)
src/lib/invoiceForm.ts        form state, validation, payload, serial rules          (Task 11)
src/lib/draftSync.ts          autosave controller + offline copies                   (Task 12)
src/lib/exportXlsx.ts         pure workbook builder                                  (Task 16)
src/components/AppLayout.tsx, PasswordForm.tsx                                       (Task 9; AppLayout edited in 15)
src/components/StateSelect.tsx, SelectWithOther.tsx, CompanyForm.tsx, ItemForm.tsx, ChargeTypeForm.tsx  (Task 10)
src/components/CompanyPicker.tsx, ItemCard.tsx, ChargeRow.tsx, TotalsPanel.tsx, InvoiceEditor.tsx       (Task 13)
src/components/ExportButton.tsx                                                      (Task 16)
src/pages/Login.tsx, Home.tsx, Settings.tsx              (Task 9; Home edited in 16)
src/pages/Masters.tsx                                    (Task 10)
src/pages/InvoiceForm.tsx                                (Task 13, final version: new, edit, resume)
src/pages/InvoiceList.tsx, InvoiceView.tsx               (Task 14; InvoiceList edited in 16)
src/pages/Drafts.tsx                                     (Task 15)
scripts/local-env.ts                                     (Task 8)
scripts/masters.ts, scripts/import-masters.ts            (Task 17)
tests/helpers/localEnv.ts                                (Task 7)
tests/integration/concurrency.test.ts                    (Task 7)
tests/e2e/global-setup.ts, helpers.ts                    (Task 9; helpers extended in 10, 14)
tests/e2e/*.spec.ts                                      (Tasks 9, 10, 13, 14, 15, 16, 18)
```

Deviations from spec §11, all cosmetic:
- Migrations use the Supabase CLI timestamp naming (`20261008000100_schema.sql`, not `0001_schema.sql`).
- The editor UI lives in `components/InvoiceEditor.tsx` so the page file only loads data.
- The phone bottom bar shows Home, New Invoice, Invoices and Drafts. Five 18 px labels don't fit a 360 px screen. Lists and Settings stay one tap away on the Home tiles, and the desktop top bar shows all of them.

---

### Task 1: Project scaffold and financial-year helpers

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `vercel.json`, `.gitignore`, `.env.example`, `src/vite-env.d.ts`, `src/main.tsx` (temporary placeholder, replaced in Task 9)
- Create: `src/lib/fy.ts`
- Test: `src/lib/fy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `fyOf(isoDate: string): string`
  - `formatInvoiceNo(fy: string, serial: number): string`
  - `padSerial(serial: number): string`
  - `parseSerial(input: string): number | null`
  - `todayLocal(now?: Date): string`
  - npm scripts: `dev`, `build`, `typecheck`, `test`, `test:int`, `test:db`, `test:e2e`, `env:local`, `import:masters`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "challan",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc",
    "test": "vitest run src scripts",
    "test:int": "vitest run tests/integration",
    "test:db": "supabase test db",
    "test:e2e": "playwright test",
    "env:local": "tsx scripts/local-env.ts",
    "import:masters": "tsx scripts/import-masters.ts"
  },
  "dependencies": {
    "@mantine/core": "8.3.18",
    "@mantine/hooks": "8.3.18",
    "@mantine/modals": "8.3.18",
    "@mantine/notifications": "8.3.18",
    "@supabase/supabase-js": "2.117.3",
    "@tabler/icons-react": "3.49.0",
    "decimal.js-light": "2.5.1",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "react-router": "7.18.4",
    "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
  },
  "devDependencies": {
    "@playwright/test": "1.63.0",
    "@types/node": "22.20.5",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "5.2.0",
    "supabase": "2.120.0",
    "tsx": "4.23.15",
    "typescript": "5.9.3",
    "vite": "7.3.7",
    "vitest": "3.2.7"
  }
}
```

Run: `npm install`
Expected: completes without errors and creates `package-lock.json`. The `supabase` package downloads its binary during install, which takes a minute.

- [ ] **Step 2: Write the config files**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests", "scripts", "vite.config.ts", "playwright.config.ts"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
  },
});
```

`index.html` (no `maximum-scale`: users must be able to zoom):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Invoices</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

`.gitignore`:

```
node_modules/
dist/
.env
.env.*
!.env.example
*.local
supabase/.temp/
supabase/.branches/
playwright-report/
test-results/
masters-template.xlsx
.claude/settings.local.json
.claude/.headroom_wrap_marker.json
```

`.env.example`:

```
# Supabase project URL and anon/publishable key (Project Settings -> API).
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

`src/main.tsx` (placeholder; Task 9 replaces it):

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <h1>Invoices</h1>
  </StrictMode>,
);
```

- [ ] **Step 3: Write the failing test** `src/lib/fy.test.ts`

```ts
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/lib/fy.test.ts`
Expected: FAIL. The import of `./fy` doesn't resolve ("Failed to resolve import" / "Cannot find module").

- [ ] **Step 5: Implement** `src/lib/fy.ts`

```ts
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
```

- [ ] **Step 6: Run the tests and the build**

Run: `npx vitest run src/lib/fy.test.ts`
Expected: PASS (all tests green).

Run: `npm run build`
Expected: `tsc` reports no errors, and Vite writes `dist/`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html vercel.json .gitignore .env.example src
git commit -m "chore: scaffold Vite React app and add financial-year helpers"
```

---

### Task 2: GSTIN validation and state list

**Files:**
- Create: `src/lib/gstin.ts`
- Test: `src/lib/gstin.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `STATES: ReadonlyArray<{ code: string; name: string }>`
  - `isStateCode(code: string): boolean`
  - `stateName(code: string): string`
  - `normalizeGstin(raw: string): string`
  - `gstinCheckChar(first14: string): string`
  - `gstinProblem(gstin: string): string | null` (expects an already normalized value; returns a plain-English problem or null)

- [ ] **Step 1: Write the failing test** `src/lib/gstin.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { gstinCheckChar, gstinProblem, isStateCode, normalizeGstin, stateName } from './gstin';

describe('gstinProblem', () => {
  it('accepts real GSTINs', () => {
    for (const g of ['27AAPFU0939F1ZV', '29AAGCB7383J1Z4', '24AAACS1234A1Z8', '27AABCA2222E1ZD']) {
      expect(gstinProblem(g)).toBeNull();
    }
  });
  it('computes the mod-36 check character', () => {
    expect(gstinCheckChar('27AAPFU0939F1Z')).toBe('V');
    expect(gstinCheckChar('24AABCA1111D1Z')).toBe('R');
  });
  it('catches a single typing mistake through the check character', () => {
    expect(gstinProblem('27AAPFU0939F1ZW')).toMatch(/last character/);
    expect(gstinProblem('27AAPFU0938F1ZV')).toMatch(/last character/);
  });
  it('rejects the wrong length', () => {
    expect(gstinProblem('27AAPFU0939F1Z')).toMatch(/15 characters/);
  });
  it('rejects the wrong shape', () => {
    expect(gstinProblem('27AAPFU0939F1XV')).toMatch(/does not look like a GSTIN/);
  });
  it('rejects an unknown state code even when the check character fits', () => {
    expect(gstinProblem('39AAPFU0939F1ZQ')).toMatch(/state code/);
  });
});

describe('normalizeGstin', () => {
  it('removes spaces and upper-cases', () => {
    expect(normalizeGstin(' 27aapfu 0939f1zv ')).toBe('27AAPFU0939F1ZV');
  });
});

describe('states', () => {
  it('knows GST state codes', () => {
    expect(stateName('24')).toBe('Gujarat');
    expect(stateName('27')).toBe('Maharashtra');
    expect(isStateCode('97')).toBe(true);
    expect(isStateCode('38')).toBe(true);
    expect(isStateCode('39')).toBe(false);
    expect(isStateCode('00')).toBe(false);
    expect(isStateCode('99')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/gstin.test.ts`
Expected: FAIL (cannot resolve `./gstin`).

- [ ] **Step 3: Implement** `src/lib/gstin.ts`

```ts
export const STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '25', name: 'Daman and Diu (old code)' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh (old code)' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
];

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isStateCode(code: string): boolean {
  return STATES.some((s) => s.code === code);
}

export function stateName(code: string): string {
  return STATES.find((s) => s.code === code)?.name ?? code;
}

export function normalizeGstin(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/** GSTIN check character (mod 36, alternate weights 1 and 2) for the first 14 characters. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

/** Plain-English problem with an already normalized GSTIN, or null when it is valid. */
export function gstinProblem(gstin: string): string | null {
  if (gstin.length !== 15) return 'GSTIN must be exactly 15 characters.';
  if (!PATTERN.test(gstin)) return 'This does not look like a GSTIN. Please check each character.';
  if (!isStateCode(gstin.slice(0, 2))) return 'The first two digits are not a valid state code.';
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) {
    return 'The last character does not match. Please re-check the GSTIN for a typing mistake.';
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/gstin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gstin.ts src/lib/gstin.test.ts
git commit -m "feat: add GSTIN validation with check digit and GST state list"
```

---

### Task 3: Amount in words, date display and search pattern

**Files:**
- Create: `src/lib/words.ts`, `src/lib/format.ts`
- Test: `src/lib/words.test.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `amountInWords(rupees: string | number | bigint): string` (whole rupees only)
  - `fmtDate(iso: string): string` (`'2026-10-07'` → `'07-Oct-2026'`)
  - `fmtDateTime(ts: string): string` (timestamptz → `'06-Oct-2026 15:30'` IST)
  - `fmtTime(ts: string): string` (→ `'3:42 PM'` IST)
  - `fmtClock(d: Date): string` (→ `'10:42'` device time, for "Draft saved 10:42")
  - `searchPattern(q: string): string | null` (ILIKE pattern or null for a blank search)

- [ ] **Step 1: Write the failing tests**

`src/lib/words.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { amountInWords } from './words';

describe('amountInWords', () => {
  it.each([
    [0, 'Rupees Zero Only'],
    [1, 'Rupees One Only'],
    [15, 'Rupees Fifteen Only'],
    [21, 'Rupees Twenty-One Only'],
    [100, 'Rupees One Hundred Only'],
    [105, 'Rupees One Hundred Five Only'],
    [1000, 'Rupees One Thousand Only'],
    [100000, 'Rupees One Lakh Only'],
    [112345, 'Rupees One Lakh Twelve Thousand Three Hundred Forty-Five Only'],
    [100000000, 'Rupees Ten Crore Only'],
    ['1000000000000', 'Rupees One Lakh Crore Only'],
  ])('%s', (amount, words) => {
    expect(amountInWords(amount)).toBe(words);
  });
  it('accepts the grand total as a string', () => {
    expect(amountInWords('653')).toBe('Rupees Six Hundred Fifty-Three Only');
  });
});
```

`src/lib/format.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/words.test.ts src/lib/format.test.ts`
Expected: FAIL (cannot resolve `./words` / `./format`).

- [ ] **Step 3: Implement** `src/lib/words.ts`

```ts
const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below100(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
}

function below1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? below100(rest) : ''].filter(Boolean).join(' ');
}

/** Indian system: crore (10^7), lakh (10^5), thousand, hundred. Crores recurse, e.g. "One Lakh Crore". */
function indian(n: bigint): string {
  if (n === 0n) return '';
  const crore = n / 10000000n;
  const rest = n % 10000000n;
  const lakh = Number(rest / 100000n);
  const thousand = Number((rest % 100000n) / 1000n);
  const hundreds = Number(rest % 1000n);
  return [
    crore ? `${indian(crore)} Crore` : '',
    lakh ? `${below100(lakh)} Lakh` : '',
    thousand ? `${below100(thousand)} Thousand` : '',
    hundreds ? below1000(hundreds) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Whole rupees -> "Rupees One Lakh Twelve Thousand Three Hundred Forty-Five Only". */
export function amountInWords(rupees: string | number | bigint): string {
  const n = BigInt(rupees);
  if (n < 0n) throw new Error('amountInWords: negative amount');
  return `Rupees ${n === 0n ? 'Zero' : indian(n)} Only`;
}
```

- [ ] **Step 4: Implement** `src/lib/format.ts`

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/words.test.ts src/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/words.ts src/lib/words.test.ts src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: add Indian amount-in-words, IST date formatting and search pattern"
```

---

### Task 4: Exact invoice arithmetic

**Files:**
- Create: `src/lib/invoiceMath.ts`
- Test: `src/lib/invoiceMath.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `D` (decimal constructor) and `type Dec`
  - `type NumberKind = 'qty' | 'price' | 'amount' | 'rate'`
  - `cleanNumber(raw: string): string`
  - `parseAmount(raw: string, kind: NumberKind): string | null` (exact decimal string or null)
  - `plain(value: string | number | Dec): string` (drops trailing zeros: `'18.00'` → `'18'`)
  - `interface LineInput { qty: string; price: string; gstRate: string }`
  - `interface ChargeInput { amount: string; gstRate: string }`
  - `interface Row { amount: Dec; gstAmount: Dec }`
  - `interface RateGroup { rate: Dec; taxable: Dec; gst: Dec }`
  - `interface Totals { lines: Row[]; charges: Row[]; itemsTotal; chargesTotal; taxableTotal; cgstTotal; sgstTotal; igstTotal; exactTotal; grandTotal; roundOff: Dec; byRate: RateGroup[] }`
  - `computeTotals(lines: LineInput[], charges: ChargeInput[], sameState: boolean): Totals`
  - `fmtMoney(x: Dec | string | number): string`, `fmtSigned(x: Dec | string): string`, `fmtRate(x: Dec | string): string`

- [ ] **Step 1: Write the failing test** `src/lib/invoiceMath.test.ts`

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/invoiceMath.test.ts`
Expected: FAIL (cannot resolve `./invoiceMath`).

- [ ] **Step 3: Implement** `src/lib/invoiceMath.ts`

```ts
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

/** Accept what people type: '1,000' -> '1000', '.5' -> '0.5', '5.' -> '5', ' 2 ' -> '2'. */
export function cleanNumber(raw: string): string {
  let s = raw.replace(/[\s,]/g, '');
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/invoiceMath.test.ts`
Expected: PASS.

Run: `npm test`
Expected: all unit test files pass (fy, gstin, words, format, invoiceMath).

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoiceMath.ts src/lib/invoiceMath.test.ts
git commit -m "feat: add exact-decimal invoice totals and number parsing"
```

---

### Task 5: Local Supabase, schema and dummy data

**Files:**
- Create: `supabase/config.toml` (generated, then edited)
- Create: `supabase/migrations/20261008000100_schema.sql`
- Create: `supabase/seed.sql`
- Test: `supabase/tests/database/01_schema.test.sql`

**Interfaces:**
- Consumes: nothing.
- Produces (spec §4):
  - **Tables:** `seller`, `companies`, `items`, `charge_types`, `invoices`, `invoice_lines`, `invoice_charges`, `drafts`, `audit_log`
  - **SQL functions:** `fy_of(date)`, `format_invoice_no(text, integer)`, `normalize_name(text)`, `set_updated_at()`
  - **Domains:** `gstin_t`, `state_code_t`, `hsn_t`, `gst_rate_t`
  - **Constraint names used by `errors.ts` later:** `companies_active_name_gstin`, `items_active_name`, `charge_types_active_name`, `invoices_fy_serial_key`
  - **Generated columns:** `invoices.fy`, `invoices.invoice_no`, `invoices.tax_type`, `invoices.search_text`, `seller.state_code`

- [ ] **Step 1: Check Docker and initialise Supabase**

Run: `docker info`
Expected: prints server information. If it errors, start Docker Desktop and wait until it reports "running".

Run: `npx supabase init`
Expected: creates `supabase/config.toml`. If asked about VS Code or IntelliJ settings, answer `N`.

- [ ] **Step 2: Edit `supabase/config.toml`**

Change these keys. Leave everything else as generated.
- In the `[auth]` section:
  - `site_url = "http://localhost:5173"`
  - `additional_redirect_urls = ["http://localhost:5173"]`
  - `enable_signup = false`
- In the `[auth.email]` section: `enable_signup = false`

- [ ] **Step 3: Write the failing test** `supabase/tests/database/01_schema.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Financial year and number formatting
select is(public.fy_of('2026-04-01'), '2026-27', 'April starts the financial year');
select is(public.fy_of('2027-03-31'), '2026-27', 'March ends it');
select is(public.fy_of('2027-04-01'), '2027-28', 'next April starts the next one');
select is(public.fy_of('2099-04-01'), '2099-00', 'century wraps');
select is(public.format_invoice_no('2026-27', 1), '2026-27/001', 'serial padded to 3 digits');
select is(public.format_invoice_no('2026-27', 1000), '2026-27/1000', '1000 is not truncated');
select is(public.normalize_name('  ABC   Traders '), 'abc traders', 'names normalised');

-- Seed data
select is((select count(*)::int from public.companies), 5, 'seed: 5 companies');
select is((select count(*)::int from public.items), 10, 'seed: 10 items');
select is((select count(*)::int from public.charge_types), 3, 'seed: 3 charge types');
select is((select state_code from public.seller), '24', 'seller state comes from its GSTIN');

-- Company rules
select lives_ok(
  $$ insert into public.companies (name, address, gstin, state_code) values ('ABC Traders', 'Delhi', '07AAACD1234F1Z9', '07') $$,
  'same name with a different GSTIN is allowed');
select throws_ok(
  $$ insert into public.companies (name, address, gstin, state_code) values ('abc  traders', 'Surat', '24AABCA1111D1ZR', '24') $$,
  '23505', null, 'same normalised name and same GSTIN is refused');
select lives_ok(
  $$ insert into public.companies (name, address, state_code) values ('No GST Co', 'Jaipur', '08') $$,
  'company without GSTIN');
select throws_ok(
  $$ insert into public.companies (name, address, state_code) values ('no gst co', 'Ajmer', '08') $$,
  '23505', null, 'same name with both GSTINs empty is refused');
select lives_ok(
  $$ update public.companies set archived = true where name = 'No GST Co' $$,
  'archive');
select lives_ok(
  $$ insert into public.companies (name, address, state_code) values ('No GST Co', 'Ajmer', '08') $$,
  'an archived duplicate does not block');
select throws_ok(
  $$ insert into public.companies (name, address, gstin, state_code) values ('X', 'Y', '24AABCA1111D1ZR', '27') $$,
  '23514', null, 'state must match the GSTIN');
select throws_ok(
  $$ insert into public.companies (name, address, gstin, state_code) values ('X', 'Y', '24aabca1111d1zr', '24') $$,
  '23514', null, 'lower-case GSTIN refused');
select throws_ok(
  $$ insert into public.companies (name, address, state_code) values ('X', 'Y', '39') $$,
  '23514', null, 'unknown state code refused');
select throws_ok(
  $$ insert into public.companies (name, address, state_code) values ('   ', 'Y', '24') $$,
  '23514', null, 'blank name refused');

-- Item rules
select throws_ok(
  $$ insert into public.items (name, hsn, unit, gst_rate) values ('Bad HSN', '12345', 'Nos', 18) $$,
  '23514', null, '5-digit HSN refused');
select lives_ok(
  $$ insert into public.items (name, hsn, unit, gst_rate) values ('Leading Zero', '0910', 'Kg', 5) $$,
  'HSN with a leading zero');
select is((select hsn from public.items where name = 'Leading Zero'), '0910', 'leading zero kept');
select throws_ok(
  $$ insert into public.items (name, hsn, unit, gst_rate) values ('Too High', '1234', 'Nos', 100.01) $$,
  '23514', null, 'GST rate above 100 refused');
select throws_ok(
  $$ insert into public.items (name, hsn, unit, gst_rate) values ('cement bag 50 KG', '2523', 'Nos', 18) $$,
  '23505', null, 'duplicate item name refused');

-- Invoice header: generated columns and arithmetic checks
insert into public.invoices (
  id, invoice_date, serial, buyer_name, buyer_address, buyer_state_code, ship_same, ship_address, place_of_supply,
  seller_name, seller_address, seller_gstin, seller_state_code, payment_terms, transport_mode,
  items_total, charges_total, taxable_total, cgst_total, sgst_total, igst_total, exact_total, grand_total, round_off)
values (
  '00000000-0000-0000-0000-0000000000f1', '2027-03-31', 1000, 'ABC Traders', 'Mumbai', '27', true, 'Mumbai', '27',
  'Seller', 'Ahmedabad', '24AAACS1234A1Z8', '24', 'Immediate', 'By Road',
  100, 0, 100, 0, 0, 18, 118, 118, 0);
select is((select invoice_no from public.invoices where id = '00000000-0000-0000-0000-0000000000f1'), '2026-27/1000', 'invoice_no generated');
select is((select fy from public.invoices where id = '00000000-0000-0000-0000-0000000000f1'), '2026-27', 'fy generated from date');
select is((select tax_type from public.invoices where id = '00000000-0000-0000-0000-0000000000f1'), 'IGST', 'other state is IGST');
select is((select search_text from public.invoices where id = '00000000-0000-0000-0000-0000000000f1'), '2026-27/1000 abc traders', 'search text');
select throws_ok(
  $$ update public.invoices set grand_total = 117 where id = '00000000-0000-0000-0000-0000000000f1' $$,
  '23514', null, 'grand total must be the rounded exact total');
select throws_ok(
  $$ update public.invoices set igst_total = 0, cgst_total = 9, sgst_total = 9 where id = '00000000-0000-0000-0000-0000000000f1' $$,
  '23514', null, 'CGST/SGST not allowed for another state');
select throws_ok(
  $$ update public.invoices set ship_same = true, ship_address = 'Elsewhere' where id = '00000000-0000-0000-0000-0000000000f1' $$,
  '23514', null, 'same-as-billing must copy the billing address');

-- Line arithmetic
select lives_ok(
  $$ insert into public.invoice_lines (invoice_id, position, item_name, hsn, qty, unit, price, gst_rate, amount, gst_amount)
     values ('00000000-0000-0000-0000-0000000000f1', 1, 'Pipe', '7306', 2.333, 'Mtr', 10.25, 18, 23.91325, 4.304385) $$,
  'exact line accepted');
select throws_ok(
  $$ insert into public.invoice_lines (invoice_id, position, item_name, hsn, qty, unit, price, gst_rate, amount, gst_amount)
     values ('00000000-0000-0000-0000-0000000000f1', 2, 'Pipe', '7306', 2.333, 'Mtr', 10.25, 18, 23.91, 4.3038) $$,
  '23514', null, 'rounded line amount refused');
select throws_ok(
  $$ insert into public.invoice_lines (invoice_id, position, item_name, hsn, qty, unit, price, gst_rate, amount, gst_amount)
     values ('00000000-0000-0000-0000-0000000000f1', 3, 'Pipe', '7306', 2.3335, 'Mtr', 10, 0, 23.335, 0) $$,
  '23514', null, 'a 4th quantity decimal is caught (column rounds it, amount check fails)');

select * from finish();
rollback;
```

- [ ] **Step 4: Start Supabase and run the test to verify it fails**

Run: `npx supabase start`
Expected: the first run downloads Docker images (several minutes), then prints the API URL and keys.

Run: `npx supabase test db`
Expected: FAIL. Errors such as `function public.fy_of(unknown) does not exist`.

- [ ] **Step 5: Write the migration** `supabase/migrations/20261008000100_schema.sql`

```sql
-- Helpers ---------------------------------------------------------------------------

-- Indian financial year of a date: 2026-04-01 .. 2027-03-31 -> '2026-27'.
create function public.fy_of(d date) returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select case
    when extract(month from d) >= 4 then
      extract(year from d)::int::text || '-' || lpad(((extract(year from d)::int + 1) % 100)::text, 2, '0')
    else
      (extract(year from d)::int - 1)::text || '-' || lpad((extract(year from d)::int % 100)::text, 2, '0')
  end
$$;

-- '2026-27/001'. lpad would truncate 1000 to '100', so 1000 and above print in full.
create function public.format_invoice_no(p_fy text, p_serial integer) returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select p_fy || '/' || case when p_serial < 1000 then lpad(p_serial::text, 3, '0') else p_serial::text end
$$;

create function public.normalize_name(t text) returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select lower(regexp_replace(btrim(t), '\s+', ' ', 'g'))
$$;

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end
$$;

-- Domains ---------------------------------------------------------------------------

create domain public.gstin_t as text
  check (value ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
create domain public.state_code_t as text
  check (value ~ '^(0[1-9]|[12][0-9]|3[0-8]|97)$');
create domain public.hsn_t as text
  check (value ~ '^[0-9]{4}([0-9]{2}){0,2}$');
create domain public.gst_rate_t as numeric(5,2)
  check (value >= 0 and value <= 100);

-- Our company (exactly one row) -----------------------------------------------------

create table public.seller (
  id smallint primary key default 1 check (id = 1),
  name text not null check (btrim(name) <> ''),
  address text not null check (btrim(address) <> ''),
  gstin public.gstin_t not null check (left(gstin, 2) ~ '^(0[1-9]|[12][0-9]|3[0-8]|97)$'),
  state_code text generated always as (left(gstin, 2)) stored,
  phone text not null default '',
  updated_at timestamptz not null default now()
);

-- Master lists ----------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  address text not null check (btrim(address) <> ''),
  gstin public.gstin_t,
  state_code public.state_code_t not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_state_matches_gstin check (gstin is null or state_code = left(gstin, 2))
);
-- Same name is fine with a different GSTIN; same name with both GSTINs empty is not.
create unique index companies_active_name_gstin
  on public.companies (public.normalize_name(name), coalesce(gstin, ''))
  where not archived;

create table public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  hsn public.hsn_t not null,
  unit text not null check (btrim(unit) <> ''),
  gst_rate public.gst_rate_t not null,
  default_price numeric(14,2) check (default_price >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index items_active_name on public.items (public.normalize_name(name)) where not archived;

create table public.charge_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  gst_rate public.gst_rate_t not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index charge_types_active_name on public.charge_types (public.normalize_name(name)) where not archived;

-- Invoices (snapshots: nothing here changes when master lists change) ----------------

create table public.invoices (
  id uuid primary key,
  invoice_date date not null,
  fy text generated always as (public.fy_of(invoice_date)) stored,
  serial integer not null check (serial > 0 and serial < 100000000),
  invoice_no text generated always as (public.format_invoice_no(public.fy_of(invoice_date), serial)) stored,
  company_id uuid references public.companies (id),
  buyer_name text not null check (btrim(buyer_name) <> ''),
  buyer_address text not null check (btrim(buyer_address) <> ''),
  buyer_gstin public.gstin_t,
  buyer_state_code public.state_code_t not null,
  ship_same boolean not null,
  ship_address text not null check (btrim(ship_address) <> ''),
  place_of_supply public.state_code_t not null,
  seller_name text not null,
  seller_address text not null,
  seller_gstin public.gstin_t not null,
  seller_state_code public.state_code_t not null,
  tax_type text generated always as (
    case when seller_state_code = place_of_supply then 'CGST_SGST' else 'IGST' end) stored,
  payment_terms text not null check (btrim(payment_terms) <> ''),
  transport_mode text not null check (btrim(transport_mode) <> ''),
  vehicle_no text,
  items_total numeric not null,
  charges_total numeric not null,
  taxable_total numeric not null,
  cgst_total numeric not null,
  sgst_total numeric not null,
  igst_total numeric not null,
  exact_total numeric not null,
  grand_total numeric not null,
  round_off numeric not null,
  search_text text generated always as (
    lower(public.format_invoice_no(public.fy_of(invoice_date), serial) || ' ' || buyer_name)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_fy_serial_key unique (fy, serial),
  constraint invoices_ship_same check (not ship_same or ship_address = buyer_address),
  constraint invoices_taxable check (taxable_total = items_total + charges_total),
  constraint invoices_exact check (exact_total = taxable_total + cgst_total + sgst_total + igst_total),
  constraint invoices_grand check (grand_total = round(exact_total, 0)),
  constraint invoices_round_off check (round_off = grand_total - exact_total),
  constraint invoices_tax_split check (
    case when seller_state_code = place_of_supply
      then igst_total = 0 and cgst_total = sgst_total
      else cgst_total = 0 and sgst_total = 0
    end)
);
create index invoices_list_order on public.invoices (invoice_date desc, fy desc, serial desc);

-- Checks use multiplication only (never division), so they are exact at any size.
create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position smallint not null check (position > 0),
  item_id uuid references public.items (id),
  item_name text not null check (btrim(item_name) <> ''),
  description text not null default '',
  hsn public.hsn_t not null,
  qty numeric(14,3) not null check (qty > 0),
  unit text not null check (btrim(unit) <> ''),
  price numeric(14,2) not null check (price >= 0),
  gst_rate public.gst_rate_t not null,
  amount numeric not null,
  gst_amount numeric not null,
  constraint invoice_lines_position_key unique (invoice_id, position),
  constraint invoice_lines_amount check (amount = qty * price),
  constraint invoice_lines_gst check (gst_amount * 100 = amount * gst_rate)
);

create table public.invoice_charges (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position smallint not null check (position > 0),
  charge_type_id uuid references public.charge_types (id),
  name text not null check (btrim(name) <> ''),
  amount numeric(14,2) not null check (amount > 0),
  gst_rate public.gst_rate_t not null,
  gst_amount numeric not null,
  constraint invoice_charges_position_key unique (invoice_id, position),
  constraint invoice_charges_gst check (gst_amount * 100 = amount * gst_rate)
);

-- Drafts and change log -------------------------------------------------------------

create table public.drafts (
  id uuid primary key,
  label text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb
);
create index audit_log_row on public.audit_log (table_name, row_id, at);

-- updated_at maintenance (invoices are stamped by save_invoice instead) ---------------

create trigger set_updated_at before update on public.seller for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.items for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.charge_types for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.drafts for each row execute function public.set_updated_at();
```

- [ ] **Step 6: Write the dummy data** `supabase/seed.sql`

All GSTINs below have valid check characters. Item 6 has an HSN with a leading zero; item 8 is taxed at 0.25%.

```sql
insert into public.seller (name, address, gstin, phone) values
  ('Shree Demo Industries', 'Plot 12, GIDC Estate, Naroda, Ahmedabad, Gujarat 382330', '24AAACS1234A1Z8', '+91 98765 43210');

insert into public.companies (name, address, gstin, state_code) values
  ('Patel Hardware Mart', '14 Station Road, Anand, Gujarat 388001', '24AAKFP5678B1Z5', '24'),
  ('Mehta Engineering Works', 'B-7 Udhyog Nagar, Rajkot, Gujarat 360002', '24ABCPM4321C1ZD', '24'),
  ('ABC Traders', '22 Ring Road, Surat, Gujarat 395002', '24AABCA1111D1ZR', '24'),
  ('ABC Traders', '5 Lamington Road, Mumbai, Maharashtra 400007', '27AABCA2222E1ZD', '27'),
  ('Ramesh Kumar & Sons', 'Johari Bazar, Jaipur, Rajasthan 302003', null, '08');

insert into public.items (name, description, hsn, unit, gst_rate, default_price) values
  ('MS Pipe 1 inch', 'Mild steel pipe, 1 inch', '7306', 'Mtr', 18, 120.00),
  ('GI Wire 12 gauge', 'Galvanised iron wire', '72172010', 'Kg', 18, 85.50),
  ('PVC Bend 2 inch', 'PVC pipe bend, 2 inch', '391740', 'Pcs', 18, 35.00),
  ('Cement Bag 50 kg', 'OPC 53 grade cement', '2523', 'Nos', 18, 380.00),
  ('Copper Wire 1.5 sqmm', 'Insulated copper wire', '85444999', 'Mtr', 18, 22.75),
  ('Turmeric Powder', 'Ground turmeric', '091030', 'Kg', 5, 160.00),
  ('Paddy Seeds', 'Certified paddy seeds', '1006', 'Kg', 0, null),
  ('Rough Diamond', 'Industrial rough diamond', '7102', 'Nos', 0.25, 5000.00),
  ('Wooden Pallet', 'Pinewood pallet', '441520', 'Nos', 18, 650.00),
  ('Corrugated Box', 'Packing box, 5 ply', '4819', 'Box', 5, 45.00);

insert into public.charge_types (name, gst_rate) values
  ('Freight', 18),
  ('Packing', 18),
  ('Loading', 5);
```

- [ ] **Step 7: Apply and run the tests**

Run: `npx supabase db reset`
Expected: "Applying migration 20261008000100_schema.sql…", then "Seeding data from supabase/seed.sql…", and it finishes without errors.

Run: `npx supabase test db`
Expected: PASS. `01_schema.test.sql .. ok` and "All tests successful."

- [ ] **Step 8: Commit**

```bash
git add supabase/config.toml supabase/migrations supabase/seed.sql supabase/tests
git commit -m "feat(db): add schema with domains, snapshot invoices, checks and dummy seed"
```

---

### Task 6: Save, delete, numbering and change-log functions

**Files:**
- Create: `supabase/migrations/20261008000200_functions.sql`
- Test: `supabase/tests/database/02_functions.test.sql`

**Interfaces:**
- Consumes: Task 5 tables and helpers.
- Produces (spec §5):
  - `save_invoice(p jsonb, p_expected_updated_at timestamptz default null) returns jsonb` → `{ id, invoice_no, serial, updated_at }`
  - `delete_invoice(p_id uuid, p_typed text) returns text` (deleted `invoice_no`)
  - `next_serial(p_fy text) returns integer`
  - `keep_alive() returns integer`
  - `invoice_json(p_id uuid) returns jsonb` (internal)
  - Trigger function `audit_row()` attached to `seller`, `companies`, `items`, `charge_types`
  - Errors are raised with `message` = one of `BAD_REQUEST`, `NO_ITEMS`, `NO_SELLER`, `INVOICE_DELETED`, `ALREADY_SAVED`, `EDIT_CONFLICT`, `DUPLICATE_NUMBER`, `TOTALS_MISMATCH`, `NOT_FOUND`, `CONFIRM_MISMATCH`, and `detail` = a JSON object as text where noted (§5.6).
- `p` JSON keys (all money/qty/rate values are decimal **strings**):
  - **Header:** `id`, `invoice_date`, `serial` (number or null = auto), `company_id`, `buyer_name`, `buyer_address`, `buyer_gstin`, `buyer_state_code`, `ship_same`, `ship_address`, `place_of_supply`, `payment_terms`, `transport_mode`, `vehicle_no`
  - **Totals:** `items_total`, `charges_total`, `taxable_total`, `cgst_total`, `sgst_total`, `igst_total`, `exact_total`, `grand_total`, `round_off`
  - **`lines[]`:** `{ item_id, item_name, description, hsn, qty, unit, price, gst_rate, amount, gst_amount }`
  - **`charges[]`:** `{ charge_type_id, name, amount, gst_rate, gst_amount }`

- [ ] **Step 1: Write the failing test** `supabase/tests/database/02_functions.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- A valid payload: one line (qty x 100 @18%) + Freight 50 @18%, buyer in Maharashtra (IGST; seller is Gujarat).
create function pg_temp.payload(p_id uuid, p_date date, p_serial integer, p_qty integer default 2) returns jsonb
language plpgsql as $$
declare
  a numeric := p_qty * 100;
  g numeric := a * 18 / 100;
  t numeric := a + 50;
  tax numeric := g + 9;
begin
  return jsonb_build_object(
    'id', p_id, 'invoice_date', p_date, 'serial', p_serial, 'company_id', null,
    'buyer_name', 'ABC Traders', 'buyer_address', 'Mumbai', 'buyer_gstin', '27AABCA2222E1ZD', 'buyer_state_code', '27',
    'ship_same', true, 'ship_address', 'Mumbai', 'place_of_supply', '27',
    'payment_terms', 'Immediate', 'transport_mode', 'By Road', 'vehicle_no', null,
    'items_total', a::text, 'charges_total', '50', 'taxable_total', t::text,
    'cgst_total', '0', 'sgst_total', '0', 'igst_total', tax::text,
    'exact_total', (t + tax)::text, 'grand_total', round(t + tax, 0)::text,
    'round_off', (round(t + tax, 0) - (t + tax))::text,
    'lines', jsonb_build_array(jsonb_build_object(
      'item_id', null, 'item_name', 'MS Pipe 1 inch', 'description', '', 'hsn', '7306', 'qty', p_qty::text,
      'unit', 'Mtr', 'price', '100', 'gst_rate', '18', 'amount', a::text, 'gst_amount', g::text)),
    'charges', jsonb_build_array(jsonb_build_object(
      'charge_type_id', null, 'name', 'Freight', 'amount', '50', 'gst_rate', '18', 'gst_amount', '9')));
end $$;

-- Numbering
select is(public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a1', '2026-10-08', null), null)->>'invoice_no',
  '2026-27/001', 'first auto number of the year is 001');
select is(public.next_serial('2026-27'), 2, 'suggestion is highest + 1');
select is((public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a2', '2026-10-08', null), null)->>'serial')::int,
  2, 'auto numbers increase');
select is(public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a3', '2026-10-08', 10), null)->>'invoice_no',
  '2026-27/010', 'a typed number can jump ahead');
select is(public.next_serial('2026-27'), 11, 'gaps are not filled automatically');
select lives_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a4', '2026-10-08', 8), null) $$,
  'a typed number can fill a gap');
select throws_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a5', '2026-10-08', 8), null) $$,
  'P0001', 'DUPLICATE_NUMBER', 'a typed duplicate is refused');
select is(public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a6', '2027-04-01', 8), null)->>'invoice_no',
  '2027-28/008', 'the same serial in another year is allowed');
select is(public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a7', '2026-10-08', 1000), null)->>'invoice_no',
  '2026-27/1000', '1000 prints in full');

-- Create retry, edit, conflict, deleted-while-editing
select throws_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a1', '2026-10-08', null), null) $$,
  'P0001', 'ALREADY_SAVED', 'a retried create is detected');
select lives_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a1', '2026-10-08', 1, 3),
  (select updated_at from public.invoices where id = '00000000-0000-0000-0000-0000000000a1')) $$,
  'edit with the current version');
select is((select qty from public.invoice_lines where invoice_id = '00000000-0000-0000-0000-0000000000a1'), 3.000::numeric,
  'lines replaced on edit');
select is((select count(*)::int from public.invoice_lines where invoice_id = '00000000-0000-0000-0000-0000000000a1'), 1,
  'old lines removed on edit');
select throws_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a1', '2026-10-08', 1),
  '2000-01-01T00:00:00Z') $$,
  'P0001', 'EDIT_CONFLICT', 'a stale version is refused');
select throws_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a9', '2026-10-08', null),
  '2026-10-08T00:00:00Z') $$,
  'P0001', 'INVOICE_DELETED', 'editing an invoice that no longer exists');
select is((public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a2', '2026-10-08', null),
  (select updated_at from public.invoices where id = '00000000-0000-0000-0000-0000000000a2'))->>'serial')::int,
  2, 'editing with auto number in the same year keeps the number');
select is(public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000a2', '2027-04-02', null),
  (select updated_at from public.invoices where id = '00000000-0000-0000-0000-0000000000a2'))->>'invoice_no',
  '2027-28/009', 'moving to the next year takes that year''s next number');

-- All or nothing
insert into public.drafts (id, label, data) values ('00000000-0000-0000-0000-0000000000b1', 'x', '{}');
select throws_ok($$ select public.save_invoice(jsonb_set(pg_temp.payload('00000000-0000-0000-0000-0000000000b1', '2026-10-08', null),
  '{lines,0,amount}', '"199"'), null) $$,
  '23514', null, 'a bad line amount is refused');
select is((select count(*)::int from public.invoices where id = '00000000-0000-0000-0000-0000000000b1'), 0, 'no header left behind');
select is((select count(*)::int from public.drafts where id = '00000000-0000-0000-0000-0000000000b1'), 1, 'draft kept after a failed save');
select is((select count(*)::int from public.audit_log where row_id = '00000000-0000-0000-0000-0000000000b1'), 0, 'no log row after a failed save');
select throws_ok($$ select public.save_invoice(
  jsonb_set(jsonb_set(jsonb_set(pg_temp.payload('00000000-0000-0000-0000-0000000000b2', '2026-10-08', null),
    '{lines,0,qty}', '"1"'), '{lines,0,amount}', '"100"'), '{lines,0,gst_amount}', '"18"'), null) $$,
  'P0001', 'TOTALS_MISMATCH', 'header totals must equal the lines');
select throws_ok($$ select public.save_invoice(jsonb_set(pg_temp.payload('00000000-0000-0000-0000-0000000000b3', '2026-10-08', null),
  '{lines}', '[]'), null) $$,
  'P0001', 'NO_ITEMS', 'at least one item');

-- Save removes the draft and writes one full log entry per action
insert into public.drafts (id, label, data) values ('00000000-0000-0000-0000-0000000000c1', 'ABC Traders', '{}');
select lives_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000c1', '2026-10-08', null), null) $$,
  'save with a draft');
select is((select count(*)::int from public.drafts where id = '00000000-0000-0000-0000-0000000000c1'), 0, 'save removes the draft');
select is((select count(*)::int from public.audit_log where table_name = 'invoices' and row_id = '00000000-0000-0000-0000-0000000000a1'),
  2, 'create and edit each logged once');
select ok((select new_data ? 'lines' and new_data ? 'charges' from public.audit_log
  where row_id = '00000000-0000-0000-0000-0000000000a1' order by id desc limit 1), 'log holds the full invoice');
select ok((select old_data->'lines'->0->>'qty' = '2.000' from public.audit_log
  where row_id = '00000000-0000-0000-0000-0000000000a1' and action = 'UPDATE'), 'log keeps the before copy');

-- Delete
insert into public.drafts (id, label, data) values ('00000000-0000-0000-0000-0000000000a3', 'Editing 2026-27/010', '{}');
select throws_ok($$ select public.delete_invoice('00000000-0000-0000-0000-0000000000a3', '11') $$,
  'P0001', 'CONFIRM_MISMATCH', 'wrong typed number refused');
select is(public.delete_invoice('00000000-0000-0000-0000-0000000000a3', '010'), '2026-27/010', 'padded serial accepted');
select is((select count(*)::int from public.invoices where id = '00000000-0000-0000-0000-0000000000a3'), 0, 'header deleted');
select is((select count(*)::int from public.invoice_lines where invoice_id = '00000000-0000-0000-0000-0000000000a3'), 0, 'lines deleted');
select is((select count(*)::int from public.invoice_charges where invoice_id = '00000000-0000-0000-0000-0000000000a3'), 0, 'charges deleted');
select is((select count(*)::int from public.drafts where id = '00000000-0000-0000-0000-0000000000a3'), 0, 'draft deleted');
select is((select count(*)::int from public.audit_log where row_id = '00000000-0000-0000-0000-0000000000a3'
  and action = 'DELETE' and old_data ? 'lines'), 1, 'delete logged with a full copy');
select is(public.delete_invoice('00000000-0000-0000-0000-0000000000a7', '2026-27/1000'), '2026-27/1000', 'full number accepted');
select is(public.delete_invoice('00000000-0000-0000-0000-0000000000a4', ' 8 '), '2026-27/008', 'spaces ignored');
select throws_ok($$ select public.delete_invoice('00000000-0000-0000-0000-0000000000a3', '10') $$,
  'P0001', 'NOT_FOUND', 'deleting twice');

-- Master change log
insert into public.items (name, hsn, unit, gst_rate) values ('Audit Item', '1234', 'Nos', 5);
update public.items set gst_rate = 18 where name = 'Audit Item';
update public.items set archived = true where name = 'Audit Item';
select is((select count(*)::int from public.audit_log where table_name = 'items' and new_data->>'name' = 'Audit Item'),
  3, 'insert, edit and archive of a master are logged');
select is((select old_data->>'gst_rate' from public.audit_log where table_name = 'items' and new_data->>'name' = 'Audit Item'
  and action = 'UPDATE' order by id limit 1), '5.00', 'log keeps old values');
update public.seller set phone = '000';
select is((select count(*)::int from public.audit_log where table_name = 'seller' and action = 'UPDATE'), 1, 'seller changes logged');

select is(public.keep_alive(), 1, 'keep_alive');

-- Missing seller (last, because it removes the seed seller inside this transaction)
delete from public.seller;
select throws_ok($$ select public.save_invoice(pg_temp.payload('00000000-0000-0000-0000-0000000000b4', '2026-10-08', null), null) $$,
  'P0001', 'NO_SELLER', 'our company must be set up first');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: `02_functions.test.sql` fails (`function public.save_invoice(jsonb, unknown) does not exist`). `01_schema.test.sql` still passes.

- [ ] **Step 3: Write the migration** `supabase/migrations/20261008000200_functions.sql`

```sql
-- Full invoice (header + lines + charges) as JSON, for the change log. Internal only.
create function public.invoice_json(p_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select to_jsonb(i) || jsonb_build_object(
    'lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.position)
                       from public.invoice_lines l where l.invoice_id = i.id), '[]'::jsonb),
    'charges', coalesce((select jsonb_agg(to_jsonb(c) order by c.position)
                         from public.invoice_charges c where c.invoice_id = i.id), '[]'::jsonb))
  from public.invoices i
  where i.id = p_id
$$;

create function public.next_serial(p_fy text) returns integer
language sql stable security definer
set search_path = ''
as $$
  select coalesce(max(serial), 0) + 1 from public.invoices where fy = p_fy
$$;

create function public.keep_alive() returns integer
language sql stable
set search_path = ''
as $$
  select 1
$$;

-- Change log for master lists and our company. Runs inside the same transaction as the change.
create function public.audit_row() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (table_name, row_id, action, old_data, new_data)
    values (tg_table_name, new.id::text, tg_op, null, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (table_name, row_id, action, old_data, new_data)
    values (tg_table_name, new.id::text, tg_op, to_jsonb(old), to_jsonb(new));
  else
    insert into public.audit_log (table_name, row_id, action, old_data, new_data)
    values (tg_table_name, old.id::text, tg_op, to_jsonb(old), null);
  end if;
  return null;
end
$$;

create trigger audit after insert or update or delete on public.seller for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.companies for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.items for each row execute function public.audit_row();
create trigger audit after insert or update or delete on public.charge_types for each row execute function public.audit_row();

-- Spec §5.1. One transaction: header + lines + charges + log + draft removal, or nothing.
create function public.save_invoice(p jsonb, p_expected_updated_at timestamptz default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := (p->>'id')::uuid;
  v_date date := (p->>'invoice_date')::date;
  v_serial integer := nullif(p->>'serial', '')::integer;
  v_ship_same boolean := coalesce((p->>'ship_same')::boolean, true);
  v_now timestamptz := clock_timestamp();
  v_fy text;
  v_seller public.seller;
  v_existing public.invoices;
  v_is_new boolean;
  v_dup public.invoices;
  v_old jsonb;
  v_saved public.invoices;
  v_items numeric;
  v_charges numeric;
  v_gst numeric;
begin
  if v_id is null or v_date is null then
    raise exception using message = 'BAD_REQUEST', detail = '{"reason": "id and invoice_date are required"}';
  end if;
  if jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') = 0 then
    raise exception using message = 'NO_ITEMS';
  end if;

  v_fy := public.fy_of(v_date);
  -- Serialize saves within one financial year so the next number is never handed out twice.
  perform pg_advisory_xact_lock(hashtext('invoice_fy:' || v_fy));

  select * into v_seller from public.seller where id = 1;
  if not found then
    raise exception using message = 'NO_SELLER';
  end if;

  select * into v_existing from public.invoices where id = v_id for update;
  v_is_new := not found;

  if v_is_new and p_expected_updated_at is not null then
    raise exception using message = 'INVOICE_DELETED';
  end if;
  if not v_is_new and p_expected_updated_at is null then
    raise exception using message = 'ALREADY_SAVED',
      detail = jsonb_build_object('invoice_no', v_existing.invoice_no)::text;
  end if;
  if not v_is_new and v_existing.updated_at <> p_expected_updated_at then
    raise exception using message = 'EDIT_CONFLICT',
      detail = jsonb_build_object('updated_at', v_existing.updated_at)::text;
  end if;

  if v_serial is null then
    if not v_is_new and v_existing.fy = v_fy then
      v_serial := v_existing.serial;           -- editing within the same year keeps the number
    else
      v_serial := public.next_serial(v_fy);    -- safe: this transaction holds the year's lock
    end if;
  else
    select * into v_dup from public.invoices where fy = v_fy and serial = v_serial and id <> v_id;
    if found then
      raise exception using message = 'DUPLICATE_NUMBER',
        detail = jsonb_build_object('invoice_no', v_dup.invoice_no, 'buyer_name', v_dup.buyer_name,
                                    'invoice_date', v_dup.invoice_date)::text;
    end if;
  end if;

  if v_is_new then
    insert into public.invoices (
      id, invoice_date, serial, company_id, buyer_name, buyer_address, buyer_gstin, buyer_state_code,
      ship_same, ship_address, place_of_supply, seller_name, seller_address, seller_gstin, seller_state_code,
      payment_terms, transport_mode, vehicle_no,
      items_total, charges_total, taxable_total, cgst_total, sgst_total, igst_total,
      exact_total, grand_total, round_off, created_at, updated_at)
    values (
      v_id, v_date, v_serial, nullif(p->>'company_id', '')::uuid, p->>'buyer_name', p->>'buyer_address',
      nullif(p->>'buyer_gstin', ''), p->>'buyer_state_code',
      v_ship_same, case when v_ship_same then p->>'buyer_address' else p->>'ship_address' end, p->>'place_of_supply',
      v_seller.name, v_seller.address, v_seller.gstin, v_seller.state_code,
      p->>'payment_terms', p->>'transport_mode', nullif(btrim(p->>'vehicle_no'), ''),
      (p->>'items_total')::numeric, (p->>'charges_total')::numeric, (p->>'taxable_total')::numeric,
      (p->>'cgst_total')::numeric, (p->>'sgst_total')::numeric, (p->>'igst_total')::numeric,
      (p->>'exact_total')::numeric, (p->>'grand_total')::numeric, (p->>'round_off')::numeric,
      v_now, v_now);
  else
    v_old := public.invoice_json(v_id);
    -- The seller snapshot is deliberately left unchanged on edit.
    update public.invoices set
      invoice_date = v_date,
      serial = v_serial,
      company_id = nullif(p->>'company_id', '')::uuid,
      buyer_name = p->>'buyer_name',
      buyer_address = p->>'buyer_address',
      buyer_gstin = nullif(p->>'buyer_gstin', ''),
      buyer_state_code = p->>'buyer_state_code',
      ship_same = v_ship_same,
      ship_address = case when v_ship_same then p->>'buyer_address' else p->>'ship_address' end,
      place_of_supply = p->>'place_of_supply',
      payment_terms = p->>'payment_terms',
      transport_mode = p->>'transport_mode',
      vehicle_no = nullif(btrim(p->>'vehicle_no'), ''),
      items_total = (p->>'items_total')::numeric,
      charges_total = (p->>'charges_total')::numeric,
      taxable_total = (p->>'taxable_total')::numeric,
      cgst_total = (p->>'cgst_total')::numeric,
      sgst_total = (p->>'sgst_total')::numeric,
      igst_total = (p->>'igst_total')::numeric,
      exact_total = (p->>'exact_total')::numeric,
      grand_total = (p->>'grand_total')::numeric,
      round_off = (p->>'round_off')::numeric,
      updated_at = v_now
    where id = v_id;
    delete from public.invoice_lines where invoice_id = v_id;
    delete from public.invoice_charges where invoice_id = v_id;
  end if;

  insert into public.invoice_lines (invoice_id, position, item_id, item_name, description, hsn, qty, unit, price,
                                    gst_rate, amount, gst_amount)
  select v_id, e.ord, nullif(e.v->>'item_id', '')::uuid, e.v->>'item_name', coalesce(e.v->>'description', ''),
         e.v->>'hsn', (e.v->>'qty')::numeric, e.v->>'unit', (e.v->>'price')::numeric, (e.v->>'gst_rate')::numeric,
         (e.v->>'amount')::numeric, (e.v->>'gst_amount')::numeric
  from jsonb_array_elements(p->'lines') with ordinality as e(v, ord);

  insert into public.invoice_charges (invoice_id, position, charge_type_id, name, amount, gst_rate, gst_amount)
  select v_id, e.ord, nullif(e.v->>'charge_type_id', '')::uuid, e.v->>'name',
         (e.v->>'amount')::numeric, (e.v->>'gst_rate')::numeric, (e.v->>'gst_amount')::numeric
  from jsonb_array_elements(coalesce(p->'charges', '[]'::jsonb)) with ordinality as e(v, ord);

  -- Header totals must equal what was actually stored line by line.
  select coalesce(sum(amount), 0), coalesce(sum(gst_amount), 0) into v_items, v_gst
  from public.invoice_lines where invoice_id = v_id;
  select coalesce(sum(amount), 0), v_gst + coalesce(sum(gst_amount), 0) into v_charges, v_gst
  from public.invoice_charges where invoice_id = v_id;
  select * into v_saved from public.invoices where id = v_id;
  if v_saved.items_total <> v_items or v_saved.charges_total <> v_charges
     or v_saved.cgst_total + v_saved.sgst_total + v_saved.igst_total <> v_gst then
    raise exception using message = 'TOTALS_MISMATCH',
      detail = jsonb_build_object('items', v_items, 'charges', v_charges, 'gst', v_gst)::text;
  end if;

  insert into public.audit_log (table_name, row_id, action, old_data, new_data)
  values ('invoices', v_id::text, case when v_is_new then 'INSERT' else 'UPDATE' end, v_old, public.invoice_json(v_id));

  delete from public.drafts where id = v_id;

  return jsonb_build_object('id', v_saved.id, 'invoice_no', v_saved.invoice_no, 'serial', v_saved.serial,
                            'updated_at', v_saved.updated_at);
end
$$;

-- Spec §5.2. The typed confirmation may be the full number or the serial with/without leading zeros.
create function public.delete_invoice(p_id uuid, p_typed text) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_typed text := btrim(coalesce(p_typed, ''));
begin
  select * into v_inv from public.invoices where id = p_id for update;
  if not found then
    raise exception using message = 'NOT_FOUND';
  end if;
  if not (v_typed = v_inv.invoice_no or (v_typed ~ '^[0-9]{1,9}$' and v_typed::bigint = v_inv.serial)) then
    raise exception using message = 'CONFIRM_MISMATCH';
  end if;

  insert into public.audit_log (table_name, row_id, action, old_data, new_data)
  values ('invoices', p_id::text, 'DELETE', public.invoice_json(p_id), null);

  delete from public.invoices where id = p_id;   -- lines and charges cascade
  delete from public.drafts where id = p_id;
  return v_inv.invoice_no;
end
$$;
```

- [ ] **Step 4: Apply and run the tests**

Run: `npx supabase db reset`
Expected: both migrations and the seed apply without errors.

Run: `npx supabase test db`
Expected: PASS for `01_schema.test.sql` and `02_functions.test.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261008000200_functions.sql supabase/tests/database/02_functions.test.sql
git commit -m "feat(db): add atomic save/delete invoice functions, numbering and change log"
```

---

### Task 7: Row-level security, grants and the concurrency check

**Files:**
- Create: `supabase/migrations/20261008000300_security.sql`
- Create: `tests/helpers/localEnv.ts`
- Test: `supabase/tests/database/03_security.test.sql`, `tests/integration/concurrency.test.ts`

**Interfaces:**
- Consumes: Task 5 and Task 6 objects.
- Produces:
  - **Security model (spec §6):**
    - `anon` can only call `keep_alive()`.
    - `authenticated` can:
      - read everything;
      - insert/update `seller`, `companies`, `items`, `charge_types`;
      - do everything on `drafts`;
      - call `save_invoice`, `delete_invoice`, `next_serial`.
  - **`tests/helpers/localEnv.ts`:**
    - `TEST_USER: { email: string; password: string }`
    - `localEnv(): { url: string; anonKey: string; serviceKey: string }`
    - `ensureTestUser(): Promise<void>`

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/database/03_security.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Not logged in
set local role anon;
select throws_ok($$ select * from public.companies $$, '42501', null, 'anon cannot read companies');
select throws_ok($$ select * from public.invoices $$, '42501', null, 'anon cannot read invoices');
select throws_ok($$ select * from public.seller $$, '42501', null, 'anon cannot read seller');
select throws_ok($$ select * from public.drafts $$, '42501', null, 'anon cannot read drafts');
select throws_ok($$ select * from public.audit_log $$, '42501', null, 'anon cannot read the log');
select throws_ok($$ select public.next_serial('2026-27') $$, '42501', null, 'anon cannot call next_serial');
select throws_ok($$ select public.delete_invoice(gen_random_uuid(), '1') $$, '42501', null, 'anon cannot delete invoices');
select is(public.keep_alive(), 1, 'anon can call keep_alive');
reset role;

-- Logged in
set local role authenticated;
set local request.jwt.claims to '{"role": "authenticated"}';
select isnt_empty($$ select * from public.companies $$, 'authenticated reads companies');
select lives_ok($$ insert into public.companies (name, address, state_code) values ('RLS Test Co', 'Pune', '27') $$,
  'authenticated adds a company');
select lives_ok($$ update public.companies set archived = true where name = 'RLS Test Co' $$,
  'authenticated archives a company');
select throws_ok($$ delete from public.companies where name = 'RLS Test Co' $$, '42501', null, 'no hard delete of companies');
select throws_ok($$ delete from public.items $$, '42501', null, 'no hard delete of items');
select throws_ok($$ delete from public.seller $$, '42501', null, 'no delete of seller');
select throws_ok($$ insert into public.invoices (id) values (gen_random_uuid()) $$, '42501', null, 'no direct invoice insert');
select throws_ok($$ update public.invoices set buyer_name = 'X' $$, '42501', null, 'no direct invoice update');
select throws_ok($$ delete from public.invoice_lines $$, '42501', null, 'no direct line delete');
select throws_ok($$ insert into public.audit_log (table_name, row_id, action) values ('x', 'y', 'INSERT') $$,
  '42501', null, 'the log cannot be written directly');
select throws_ok($$ delete from public.audit_log $$, '42501', null, 'the log cannot be erased');
select lives_ok($$ insert into public.drafts (id, label, data) values (gen_random_uuid(), 'x', '{}') $$, 'drafts writable');
select lives_ok($$ select public.next_serial('2026-27') $$, 'next_serial callable');
select lives_ok($$ select public.save_invoice('{"id":"00000000-0000-0000-0000-0000000000d1","invoice_date":"2026-10-08","serial":null,"company_id":null,"buyer_name":"ABC Traders","buyer_address":"Mumbai","buyer_gstin":"27AABCA2222E1ZD","buyer_state_code":"27","ship_same":true,"ship_address":"Mumbai","place_of_supply":"27","payment_terms":"Immediate","transport_mode":"By Road","vehicle_no":null,"items_total":"200","charges_total":"50","taxable_total":"250","cgst_total":"0","sgst_total":"0","igst_total":"45","exact_total":"295","grand_total":"295","round_off":"0","lines":[{"item_id":null,"item_name":"MS Pipe 1 inch","description":"","hsn":"7306","qty":"2","unit":"Mtr","price":"100","gst_rate":"18","amount":"200","gst_amount":"36"}],"charges":[{"charge_type_id":null,"name":"Freight","amount":"50","gst_rate":"18","gst_amount":"9"}]}'::jsonb, null) $$,
  'authenticated saves through the function');
select is((select count(*)::int from public.audit_log where row_id = '00000000-0000-0000-0000-0000000000d1'), 1,
  'the function writes the log on the user''s behalf');
select throws_ok($$ select public.invoice_json(gen_random_uuid()) $$, '42501', null, 'internal helper is not exposed');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: `03_security.test.sql` fails (anon can still read tables because no RLS exists yet).

- [ ] **Step 3: Write the migration** `supabase/migrations/20261008000300_security.sql`

```sql
alter table public.seller enable row level security;
alter table public.companies enable row level security;
alter table public.items enable row level security;
alter table public.charge_types enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_charges enable row level security;
alter table public.drafts enable row level security;
alter table public.audit_log enable row level security;

-- Start from nothing, then grant exactly what each role needs.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select, insert, update on public.seller, public.companies, public.items, public.charge_types to authenticated;
grant select, insert, update, delete on public.drafts to authenticated;
grant select on public.invoices, public.invoice_lines, public.invoice_charges, public.audit_log to authenticated;

grant execute on function public.save_invoice(jsonb, timestamptz) to authenticated;
grant execute on function public.delete_invoice(uuid, text) to authenticated;
grant execute on function public.next_serial(text) to authenticated;
-- Evaluated as the calling user inside generated columns and the company/item name indexes.
grant execute on function public.fy_of(date) to authenticated;
grant execute on function public.format_invoice_no(text, integer) to authenticated;
grant execute on function public.normalize_name(text) to authenticated;
grant execute on function public.keep_alive() to anon, authenticated;

-- One shared login: every authenticated request sees everything. Grants above limit the operations.
create policy authenticated_all on public.seller for all to authenticated using (true) with check (true);
create policy authenticated_all on public.companies for all to authenticated using (true) with check (true);
create policy authenticated_all on public.items for all to authenticated using (true) with check (true);
create policy authenticated_all on public.charge_types for all to authenticated using (true) with check (true);
create policy authenticated_all on public.drafts for all to authenticated using (true) with check (true);
create policy authenticated_read on public.invoices for select to authenticated using (true);
create policy authenticated_read on public.invoice_lines for select to authenticated using (true);
create policy authenticated_read on public.invoice_charges for select to authenticated using (true);
create policy authenticated_read on public.audit_log for select to authenticated using (true);
```

- [ ] **Step 4: Apply and run the pgTAP tests**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS for all three test files.

- [ ] **Step 5: Write the local environment helper** `tests/helpers/localEnv.ts`

```ts
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

export const TEST_USER = { email: 'owner@example.com', password: 'test-password-123' };

/** Reads URL and keys of the running local Supabase stack (`npx supabase start`). */
export function localEnv(): { url: string; anonKey: string; serviceKey: string } {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8' });
  const vars: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) vars[m[1]] = m[2];
  }
  const url = vars.API_URL;
  const anonKey = vars.ANON_KEY ?? vars.PUBLISHABLE_KEY;
  const serviceKey = vars.SERVICE_ROLE_KEY ?? vars.SECRET_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error('Local Supabase is not running. Run: npx supabase start');
  return { url, anonKey, serviceKey };
}

/** Creates the shared test login (sign-ups are disabled, so this uses the admin API). */
export async function ensureTestUser(): Promise<void> {
  const env = localEnv();
  const admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.createUser({
    email: TEST_USER.email,
    password: TEST_USER.password,
    email_confirm: true,
  });
  if (error && !/already/i.test(error.message)) throw error;
}
```

- [ ] **Step 6: Write the concurrency test** `tests/integration/concurrency.test.ts`

```ts
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestUser, localEnv, TEST_USER } from '../helpers/localEnv';

const env = localEnv();
const client = createClient(env.url, env.anonKey, { auth: { persistSession: false } });
const FY = '2031-32'; // a year no other test uses
const DATE = '2031-06-15';
const saved: { id: string; serial: number }[] = [];

function payload(id: string) {
  return {
    id, invoice_date: DATE, serial: null, company_id: null,
    buyer_name: 'ABC Traders', buyer_address: 'Mumbai', buyer_gstin: '27AABCA2222E1ZD', buyer_state_code: '27',
    ship_same: true, ship_address: 'Mumbai', place_of_supply: '27',
    payment_terms: 'Immediate', transport_mode: 'By Road', vehicle_no: null,
    items_total: '200', charges_total: '50', taxable_total: '250',
    cgst_total: '0', sgst_total: '0', igst_total: '45', exact_total: '295', grand_total: '295', round_off: '0',
    lines: [{ item_id: null, item_name: 'MS Pipe 1 inch', description: '', hsn: '7306', qty: '2', unit: 'Mtr',
              price: '100', gst_rate: '18', amount: '200', gst_amount: '36' }],
    charges: [{ charge_type_id: null, name: 'Freight', amount: '50', gst_rate: '18', gst_amount: '9' }],
  };
}

describe('save_invoice under concurrency', () => {
  beforeAll(async () => {
    await ensureTestUser();
    const { error } = await client.auth.signInWithPassword(TEST_USER);
    if (error) throw error;
  });

  afterAll(async () => {
    for (const s of saved) await client.rpc('delete_invoice', { p_id: s.id, p_typed: String(s.serial) });
  });

  it('gives 10 simultaneous auto-numbered saves 10 distinct consecutive numbers', async () => {
    const { data: start, error } = await client.rpc('next_serial', { p_fy: FY });
    expect(error).toBeNull();
    const ids = Array.from({ length: 10 }, () => crypto.randomUUID());
    const results = await Promise.all(
      ids.map((id) => client.rpc('save_invoice', { p: payload(id), p_expected_updated_at: null })),
    );
    for (const r of results) expect(r.error).toBeNull();
    for (const r of results) saved.push(r.data as { id: string; serial: number });
    const serials = saved.map((s) => s.serial).sort((a, b) => a - b);
    expect(serials).toEqual(Array.from({ length: 10 }, (_, i) => (start as number) + i));
  }, 30_000);
});
```

- [ ] **Step 7: Run the integration test**

Run: `npm run test:int`
Expected: PASS (1 test). If it fails with "Local Supabase is not running", run `npx supabase start` first.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261008000300_security.sql supabase/tests/database/03_security.test.sql tests
git commit -m "feat(db): lock down tables with RLS and grants; add concurrency test"
```

---

### Task 8: Data layer, shared types and error messages

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/types.ts`, `src/lib/options.ts`, `src/lib/errors.ts`, `src/lib/db.ts`, `scripts/local-env.ts`
- Test: `src/lib/errors.test.ts`

**Interfaces:**
- Consumes:
  - `fmtDate`, `fmtTime`, `searchPattern` (Task 3)
  - RPCs and tables (Tasks 5–7)
- Produces:
  - **`types.ts`:** `Seller`, `SellerInput`, `Company`, `Item`, `ChargeType`, `Masters`, `InvoiceRow`, `InvoiceLineRow`, `InvoiceChargeRow`, `InvoiceFull`, `InvoiceListRow`, `ExportLineRow`, `ExportChargeRow`, `DraftRow`, `AuditRow`, `SaveLine`, `SaveCharge`, `SavePayload`, `SaveResult` (exact shapes below)
  - **`options.ts`:** `UNITS`, `PAYMENT_TERMS`, `TRANSPORT_MODES` (readonly string arrays), `HSN_PATTERN: RegExp`
  - **`errors.ts`:**
    - `type ErrorCode`, `interface AppError { code: ErrorCode; message: string; details: Record<string, string> }`
    - `describeError(err: unknown): AppError`
    - `loadErrorMessage(err: unknown): string`
  - **`db.ts`:**
    - Seller: `getSeller`, `saveSeller`
    - Master lists: `type MasterTable`, `listMaster`, `saveMaster`, `setArchived`, `findCompaniesByGstin`, `loadMasters`
    - Invoices: `nextSerial`, `saveInvoice`, `deleteInvoice`, `getInvoice`, `PAGE_SIZE`, `listInvoices`, `invoiceHistory`
    - Drafts: `upsertDraft`, `listDrafts`, `getDraft`, `deleteDraft`
    - Export: `fetchAll`
  - **`scripts/local-env.ts`:** writes `.env.local` for the local stack (`npm run env:local`)

- [ ] **Step 1: Write the failing test** `src/lib/errors.test.ts`

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/errors.test.ts`
Expected: FAIL (cannot resolve `./errors`).

- [ ] **Step 3: Implement** `src/lib/errors.ts`

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Write** `src/lib/types.ts`

```ts
export interface Seller {
  name: string;
  address: string;
  gstin: string;
  state_code: string;
  phone: string;
  updated_at: string;
}
export type SellerInput = Pick<Seller, 'name' | 'address' | 'gstin' | 'phone'>;

export interface Company {
  id: string;
  name: string;
  address: string;
  gstin: string | null;
  state_code: string;
  archived: boolean;
}
/** gst_rate and default_price are read as text (`::text`) so no digits are lost. */
export interface Item {
  id: string;
  name: string;
  description: string;
  hsn: string;
  unit: string;
  gst_rate: string;
  default_price: string | null;
  archived: boolean;
}
export interface ChargeType {
  id: string;
  name: string;
  gst_rate: string;
  archived: boolean;
}
export interface Masters {
  companies: Company[];
  items: Item[];
  chargeTypes: ChargeType[];
}

/** Totals arrive as JSON numbers; they are only displayed or exported after rounding. */
export interface InvoiceRow {
  id: string;
  invoice_date: string;
  fy: string;
  serial: number;
  invoice_no: string;
  company_id: string | null;
  buyer_name: string;
  buyer_address: string;
  buyer_gstin: string | null;
  buyer_state_code: string;
  ship_same: boolean;
  ship_address: string;
  place_of_supply: string;
  seller_name: string;
  seller_address: string;
  seller_gstin: string;
  seller_state_code: string;
  tax_type: 'CGST_SGST' | 'IGST';
  payment_terms: string;
  transport_mode: string;
  vehicle_no: string | null;
  items_total: number;
  charges_total: number;
  taxable_total: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  exact_total: number;
  grand_total: number;
  round_off: number;
  created_at: string;
  updated_at: string;
}
export interface InvoiceLineRow {
  id: string;
  position: number;
  item_id: string | null;
  item_name: string;
  description: string;
  hsn: string;
  qty: string;
  unit: string;
  price: string;
  gst_rate: string;
  amount: number;
  gst_amount: number;
}
export interface InvoiceChargeRow {
  id: string;
  position: number;
  charge_type_id: string | null;
  name: string;
  amount: string;
  gst_rate: string;
  gst_amount: number;
}
export interface InvoiceFull extends InvoiceRow {
  invoice_lines: InvoiceLineRow[];
  invoice_charges: InvoiceChargeRow[];
}
export type InvoiceListRow = Pick<InvoiceRow, 'id' | 'invoice_no' | 'invoice_date' | 'buyer_name' | 'grand_total'>;

export interface ExportLineRow {
  invoice_id: string;
  position: number;
  item_name: string;
  description: string;
  hsn: string;
  qty: string;
  unit: string;
  price: string;
  amount: number;
  gst_rate: string;
  gst_amount: number;
}
export interface ExportChargeRow {
  invoice_id: string;
  position: number;
  name: string;
  amount: string;
  gst_rate: string;
  gst_amount: number;
}

export interface DraftRow {
  id: string;
  label: string;
  data: unknown;
  updated_at: string;
}
export interface AuditRow {
  id: number;
  at: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
}

/** save_invoice payload (spec §5.1). Every money/qty/rate value is an exact decimal string. */
export interface SaveLine {
  item_id: string | null;
  item_name: string;
  description: string;
  hsn: string;
  qty: string;
  unit: string;
  price: string;
  gst_rate: string;
  amount: string;
  gst_amount: string;
}
export interface SaveCharge {
  charge_type_id: string | null;
  name: string;
  amount: string;
  gst_rate: string;
  gst_amount: string;
}
export interface SavePayload {
  id: string;
  invoice_date: string;
  serial: number | null;
  company_id: string | null;
  buyer_name: string;
  buyer_address: string;
  buyer_gstin: string | null;
  buyer_state_code: string;
  ship_same: boolean;
  ship_address: string;
  place_of_supply: string;
  payment_terms: string;
  transport_mode: string;
  vehicle_no: string | null;
  items_total: string;
  charges_total: string;
  taxable_total: string;
  cgst_total: string;
  sgst_total: string;
  igst_total: string;
  exact_total: string;
  grand_total: string;
  round_off: string;
  lines: SaveLine[];
  charges: SaveCharge[];
}
export interface SaveResult {
  id: string;
  invoice_no: string;
  serial: number;
  updated_at: string;
}
```

- [ ] **Step 6: Write** `src/lib/options.ts`

```ts
export const UNITS: readonly string[] = ['Nos', 'Pcs', 'Kg', 'Mtr', 'Ltr', 'Box', 'Set'];
export const PAYMENT_TERMS: readonly string[] = ['Immediate', '7 days', '15 days', '30 days', '45 days', '60 days', '90 days'];
export const TRANSPORT_MODES: readonly string[] = ['By Road', 'By Hand', 'Courier', 'Rail', 'Air'];
/** HSN codes are 4, 6 or 8 digits; stored as text so leading zeros survive. */
export const HSN_PATTERN = /^\d{4}(\d{2}){0,2}$/;
```

- [ ] **Step 7: Write** `src/lib/supabase.ts`

```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
```

- [ ] **Step 8: Write** `src/lib/db.ts`

```ts
import type { PostgrestError } from '@supabase/supabase-js';
import { searchPattern } from './format';
import { supabase } from './supabase';
import type {
  AuditRow, ChargeType, Company, DraftRow, InvoiceFull, InvoiceListRow, Item, Masters,
  SavePayload, SaveResult, Seller, SellerInput,
} from './types';

function check<T>(res: { data: T; error: PostgrestError | null }): T {
  if (res.error) throw res.error;
  return res.data;
}

// Our company -------------------------------------------------------------------

const SELLER_COLUMNS = 'name, address, gstin, state_code, phone, updated_at';

export async function getSeller(): Promise<Seller | null> {
  return check(await supabase.from('seller').select(SELLER_COLUMNS).maybeSingle()) as Seller | null;
}

export async function saveSeller(s: SellerInput): Promise<Seller> {
  return check(await supabase.from('seller').upsert({ id: 1, ...s }).select(SELLER_COLUMNS).single()) as Seller;
}

// Master lists ------------------------------------------------------------------

const MASTER_COLUMNS = {
  companies: 'id, name, address, gstin, state_code, archived',
  items: 'id, name, description, hsn, unit, gst_rate::text, default_price::text, archived',
  charge_types: 'id, name, gst_rate::text, archived',
} as const;
export type MasterTable = keyof typeof MASTER_COLUMNS;
interface MasterRowOf {
  companies: Company;
  items: Item;
  charge_types: ChargeType;
}

export async function listMaster<T extends MasterTable>(table: T, archived = false): Promise<MasterRowOf[T][]> {
  const res = await supabase.from(table).select(MASTER_COLUMNS[table]).eq('archived', archived).order('name');
  return check(res) as unknown as MasterRowOf[T][];
}

/** Insert (no id) or update (id) one master row. One call, one row, one log entry. */
export async function saveMaster<T extends MasterTable>(
  table: T,
  fields: Record<string, unknown>,
  id?: string,
): Promise<MasterRowOf[T]> {
  const res = id
    ? await supabase.from(table).update(fields).eq('id', id).select(MASTER_COLUMNS[table]).single()
    : await supabase.from(table).insert(fields).select(MASTER_COLUMNS[table]).single();
  return check(res) as unknown as MasterRowOf[T];
}

export async function setArchived(table: MasterTable, id: string, archived: boolean): Promise<void> {
  check(await supabase.from(table).update({ archived }).eq('id', id));
}

export async function findCompaniesByGstin(gstin: string): Promise<Company[]> {
  const res = await supabase.from('companies').select(MASTER_COLUMNS.companies).eq('gstin', gstin).eq('archived', false);
  return check(res) as unknown as Company[];
}

export async function loadMasters(): Promise<Masters> {
  const [companies, items, chargeTypes] = await Promise.all([
    listMaster('companies'),
    listMaster('items'),
    listMaster('charge_types'),
  ]);
  return { companies, items, chargeTypes };
}

// Invoices ----------------------------------------------------------------------

export async function nextSerial(fy: string): Promise<number> {
  return check(await supabase.rpc('next_serial', { p_fy: fy })) as number;
}

export async function saveInvoice(p: SavePayload, expectedUpdatedAt: string | null): Promise<SaveResult> {
  return check(await supabase.rpc('save_invoice', { p, p_expected_updated_at: expectedUpdatedAt })) as SaveResult;
}

export async function deleteInvoice(id: string, typed: string): Promise<string> {
  return check(await supabase.rpc('delete_invoice', { p_id: id, p_typed: typed })) as string;
}

const INVOICE_FULL =
  '*, invoice_lines(id, position, item_id, item_name, description, hsn, qty::text, unit, price::text, gst_rate::text, amount, gst_amount),' +
  ' invoice_charges(id, position, charge_type_id, name, amount::text, gst_rate::text, gst_amount)';

export async function getInvoice(id: string): Promise<InvoiceFull | null> {
  const inv = check(await supabase.from('invoices').select(INVOICE_FULL).eq('id', id).maybeSingle()) as InvoiceFull | null;
  if (inv) {
    inv.invoice_lines.sort((a, b) => a.position - b.position);
    inv.invoice_charges.sort((a, b) => a.position - b.position);
  }
  return inv;
}

export const PAGE_SIZE = 50;

export async function listInvoices(search: string, page: number): Promise<InvoiceListRow[]> {
  // Filters must come before order/range (those return a builder without filter methods).
  let q = supabase.from('invoices').select('id, invoice_no, invoice_date, buyer_name, grand_total');
  const pattern = searchPattern(search);
  if (pattern) q = q.ilike('search_text', pattern);
  const res = await q
    .order('invoice_date', { ascending: false })
    .order('fy', { ascending: false })
    .order('serial', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  return check(res) as InvoiceListRow[];
}

export async function invoiceHistory(id: string): Promise<AuditRow[]> {
  const res = await supabase
    .from('audit_log')
    .select('id, at, action')
    .eq('table_name', 'invoices')
    .eq('row_id', id)
    .order('id');
  return check(res) as AuditRow[];
}

// Drafts ------------------------------------------------------------------------

export async function upsertDraft(d: { id: string; label: string; data: unknown }): Promise<void> {
  check(await supabase.from('drafts').upsert(d));
}

export async function listDrafts(): Promise<DraftRow[]> {
  const res = await supabase.from('drafts').select('id, label, data, updated_at').order('updated_at', { ascending: false });
  return check(res) as DraftRow[];
}

export async function getDraft(id: string): Promise<DraftRow | null> {
  return check(await supabase.from('drafts').select('id, label, data, updated_at').eq('id', id).maybeSingle()) as DraftRow | null;
}

export async function deleteDraft(id: string): Promise<void> {
  check(await supabase.from('drafts').delete().eq('id', id));
}

// Export ------------------------------------------------------------------------

/**
 * Every row of a table, page by page. Stops on an empty page rather than a short one,
 * so it stays correct even if the server caps pages below 1000 rows.
 */
export async function fetchAll<T>(
  table: 'invoices' | 'invoice_lines' | 'invoice_charges',
  columns: string,
  orderBy: string[],
): Promise<T[]> {
  const out: T[] = [];
  for (;;) {
    let q = supabase.from(table).select(columns);
    for (const c of orderBy) q = q.order(c);
    const rows = check(await q.range(out.length, out.length + 999)) as T[];
    if (rows.length === 0) return out;
    out.push(...rows);
  }
}
```

- [ ] **Step 9: Write** `scripts/local-env.ts`

```ts
import { writeFileSync } from 'node:fs';
import { localEnv } from '../tests/helpers/localEnv';

const env = localEnv();
writeFileSync('.env.local', `VITE_SUPABASE_URL=${env.url}\nVITE_SUPABASE_ANON_KEY=${env.anonKey}\n`);
console.log('Wrote .env.local for the local Supabase stack.');
```

- [ ] **Step 10: Verify**

Run: `npm test && npm run typecheck`
Expected: all unit tests pass; `tsc` reports no errors.

Run: `npm run env:local`
Expected: prints "Wrote .env.local…". `git status` does **not** list `.env.local`, because it is ignored.

- [ ] **Step 11: Commit**

```bash
git add src/lib/supabase.ts src/lib/types.ts src/lib/options.ts src/lib/errors.ts src/lib/errors.test.ts src/lib/db.ts scripts/local-env.ts
git commit -m "feat: add Supabase data layer, shared types and plain-English errors"
```

---

### Task 9: App shell, login, Home and Settings

**Files:**
- Create: `src/theme.ts`, `src/auth.tsx`, `src/router.tsx`, `src/components/AppLayout.tsx`, `src/components/PasswordForm.tsx`, `src/pages/Login.tsx`, `src/pages/Home.tsx`, `src/pages/Settings.tsx`
- Modify: `src/main.tsx` (replace the placeholder)
- Create: `playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/helpers.ts`
- Test: `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes:
  - `supabase`, `getSeller`, `saveSeller`, `describeError`, `loadErrorMessage` (Task 8)
  - `gstinProblem`, `normalizeGstin`, `stateName` (Task 2)
  - `TEST_USER`, `ensureTestUser`, `localEnv` (Task 7)
- Produces:
  - `router` (later tasks add routes to its `children` array)
  - `AppLayout` (renders `<main>` via `AppShell.Main`)
  - `Login({ embedded?: boolean })`
  - `PasswordForm({ onDone?: () => void })`
  - **e2e helper:** `login(page: Page): Promise<void>`
  - **Visible text later tests rely on:**
    - Home heading `Home`.
    - Home tiles are links named `New Invoice`, `Invoices`, `Drafts`, `Lists`, `Settings`.
    - Nav links:
      - Phone: Home, New Invoice, Invoices, Drafts.
      - Desktop: all six.

- [ ] **Step 1: Install the Playwright browser**

Run: `npx playwright install chromium`
Expected: downloads Chromium (one-off).

- [ ] **Step 2: Write the Playwright setup**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';
import { localEnv } from './tests/helpers/localEnv';

const env = localEnv();

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    env: { VITE_SUPABASE_URL: env.url, VITE_SUPABASE_ANON_KEY: env.anonKey },
  },
});
```

`tests/e2e/global-setup.ts`:

```ts
import { execSync } from 'node:child_process';
import { ensureTestUser } from '../helpers/localEnv';

/** Fresh database (migrations + dummy seed) and the shared login before every e2e run. */
export default async function globalSetup(): Promise<void> {
  execSync('npx supabase db reset', { stdio: 'inherit' });
  await ensureTestUser();
}
```

`tests/e2e/helpers.ts`:

```ts
import { expect, type Page } from '@playwright/test';
import { TEST_USER } from '../helpers/localEnv';

export async function login(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill(TEST_USER.email);
  await page.getByLabel('Password', { exact: true }).fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
}
```

- [ ] **Step 3: Write the failing e2e test** `tests/e2e/auth.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { TEST_USER } from '../helpers/localEnv';
import { login } from './helpers';

test('a wrong password shows a plain message', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(TEST_USER.email);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Wrong email or password.')).toBeVisible();
});

test('logging in shows Home with every destination', async ({ page }) => {
  await login(page);
  for (const tile of ['New Invoice', 'Invoices', 'Drafts', 'Lists', 'Settings']) {
    await expect(page.getByRole('main').getByRole('link', { name: tile, exact: true })).toBeVisible();
  }
});

test('our company details are saved', async ({ page }, info) => {
  await login(page);
  await page.getByRole('main').getByRole('link', { name: 'Settings', exact: true }).click();
  const phone = info.project.name === 'phone' ? '+91 90000 00001' : '+91 90000 00002';
  await page.getByLabel('Phone').fill(phone);
  await page.getByRole('button', { name: 'Save company details' }).click();
  await expect(page.getByText('Company details saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Phone')).toHaveValue(phone);
});

test('a mistyped GSTIN is explained in Settings', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await page.getByLabel('GSTIN').fill('24AAACS1234A1Z9');
  await page.getByRole('button', { name: 'Save company details' }).click();
  await expect(page.getByText(/last character does not match/)).toBeVisible();
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx playwright test tests/e2e/auth.spec.ts --project=desktop`
Expected: FAIL. The placeholder page has no "Email" field.

- [ ] **Step 5: Write the theme, auth gate, router and entry point**

`src/theme.ts`:

```ts
import { Button, Checkbox, createTheme, PasswordInput, Select, Textarea, TextInput } from '@mantine/core';

/** Large by default: 18px+ text, 50px inputs and buttons (size "lg"). */
export const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontSizes: { xs: '1.125rem', sm: '1.125rem', md: '1.125rem', lg: '1.25rem', xl: '1.5rem' },
  components: {
    Button: Button.extend({ defaultProps: { size: 'lg' } }),
    TextInput: TextInput.extend({ defaultProps: { size: 'lg' } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { size: 'lg' } }),
    Textarea: Textarea.extend({ defaultProps: { size: 'lg' } }),
    Select: Select.extend({ defaultProps: { size: 'lg', allowDeselect: false, maxDropdownHeight: 320 } }),
    Checkbox: Checkbox.extend({ defaultProps: { size: 'lg' } }),
  },
});

/** Big square tiles on Home (links and the Excel button share this look). */
export const TILE_STYLE = {
  textDecoration: 'none',
  color: 'inherit',
  minHeight: 120,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
} as const;
```

`src/auth.tsx`:

```tsx
import { Center, Loader, Modal } from '@mantine/core';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PasswordForm } from './components/PasswordForm';
import { supabase } from './lib/supabase';
import { Login } from './pages/Login';

/**
 * Shows Login until there is a session. If the session ends while working, the login appears
 * on top of the page instead of replacing it, so nothing on screen is lost.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(false);
  const hadSession = useRef(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <Center h="100vh">
        <Loader size="xl" />
      </Center>
    );
  }
  if (session) hadSession.current = true;
  if (!session && !hadSession.current) return <Login />;

  return (
    <>
      {children}
      <Modal opened={!session} onClose={() => undefined} withCloseButton={false} fullScreen title="Please log in again">
        <Login embedded />
      </Modal>
      <Modal opened={recovery && !!session} onClose={() => setRecovery(false)} title="Set a new password">
        <PasswordForm onDone={() => setRecovery(false)} />
      </Modal>
    </>
  );
}
```

`src/router.tsx`:

```tsx
import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { Home } from './pages/Home';
import { Settings } from './pages/Settings';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
```

`src/main.tsx` (replace the whole file):

```tsx
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { AuthProvider } from './auth';
import { router } from './router';
import { theme } from './theme';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} forceColorScheme="light">
      <ModalsProvider labels={{ confirm: 'Yes', cancel: 'No' }}>
        <Notifications position="top-center" />
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>,
);
```

- [ ] **Step 6: Write the layout and the password form**

`src/components/AppLayout.tsx`:

```tsx
import { Alert, AppShell, Container, Group } from '@mantine/core';
import { useMediaQuery, useNetwork } from '@mantine/hooks';
import { IconFilePlus, IconFileText, IconHome, IconList, IconNotes, IconSettings, IconWifiOff } from '@tabler/icons-react';
import { NavLink, Outlet } from 'react-router';

const WIDE = '(min-width: 900px)';
const LINKS = [
  { to: '/', label: 'Home', icon: IconHome },
  { to: '/invoices/new', label: 'New Invoice', icon: IconFilePlus },
  { to: '/invoices', label: 'Invoices', icon: IconFileText },
  { to: '/drafts', label: 'Drafts', icon: IconNotes },
  { to: '/lists', label: 'Lists', icon: IconList },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];
/** Five 18px labels do not fit a 360px phone; Lists and Settings are on the Home tiles. */
const PHONE_LINKS = LINKS.slice(0, 4);

export function AppLayout() {
  const wide = useMediaQuery(WIDE, window.matchMedia(WIDE).matches, { getInitialValueInEffect: false });
  const { online } = useNetwork();

  const nav = (
    <Group
      component="nav"
      aria-label="Main"
      h="100%"
      px="sm"
      gap={wide ? 'md' : 0}
      justify={wide ? 'flex-start' : 'space-around'}
      wrap="nowrap"
    >
      {(wide ? LINKS : PHONE_LINKS).map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          style={({ isActive }) => ({
            display: 'flex',
            flexDirection: wide ? 'row' : 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: wide ? 8 : 2,
            minHeight: 56,
            minWidth: 64,
            padding: '4px 8px',
            textDecoration: 'none',
            textAlign: 'center',
            lineHeight: 1.15,
            fontSize: '1.125rem',
            fontWeight: isActive ? 700 : 500,
            color: isActive ? 'var(--mantine-color-blue-8)' : 'var(--mantine-color-gray-9)',
            borderBottom: `3px solid ${isActive ? 'var(--mantine-color-blue-8)' : 'transparent'}`,
          })}
        >
          <Icon size={28} aria-hidden />
          {label}
        </NavLink>
      ))}
    </Group>
  );

  return (
    <AppShell header={wide ? { height: 72 } : undefined} footer={wide ? undefined : { height: 84 }} padding="md">
      {wide ? <AppShell.Header>{nav}</AppShell.Header> : <AppShell.Footer>{nav}</AppShell.Footer>}
      <AppShell.Main>
        <Container size="lg" px={0}>
          {!online && (
            <Alert color="yellow" icon={<IconWifiOff />} mb="md" title="No internet">
              No internet — your work is safe on this screen
            </Alert>
          )}
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
```

`src/components/PasswordForm.tsx`:

```tsx
import { Button, PasswordInput, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function PasswordForm({ onDone }: { onDone?: () => void }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function change() {
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== again) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e) return setError(e.message);
    setPassword('');
    setAgain('');
    notifications.show({ color: 'green', message: 'Password changed.' });
    onDone?.();
  }

  return (
    <Stack>
      <PasswordInput label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
      <PasswordInput label="Type it again" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.currentTarget.value)} />
      {error && <Text c="red.8">{error}</Text>}
      <Button onClick={() => void change()} disabled={busy}>
        {busy ? 'Changing…' : 'Change password'}
      </Button>
    </Stack>
  );
}
```

- [ ] **Step 7: Write the pages**

`src/pages/Login.tsx`:

```tsx
import { Alert, Button, Container, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { describeError } from '../lib/errors';
import { supabase } from '../lib/supabase';

export function Login({ embedded = false }: { embedded?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(err.message === 'Invalid login credentials' ? 'Wrong email or password.' : describeError(err).message);
  }

  async function forgot() {
    if (!email.trim()) {
      setError('Type your email above first, then press "Forgot password".');
      return;
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (err) setError(describeError(err).message);
    else notifications.show({ color: 'green', message: 'We sent a password reset link to your email.' });
  }

  return (
    <Container size={460} py="xl">
      <form onSubmit={(e) => void submit(e)}>
        <Stack>
          {!embedded && <Title order={1}>Invoices</Title>}
          <TextInput label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required />
          <PasswordInput label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} required />
          {error && (
            <Alert color="red" icon={<IconAlertCircle />}>
              {error}
            </Alert>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </Button>
          <Button variant="subtle" onClick={() => void forgot()}>
            Forgot password
          </Button>
        </Stack>
      </form>
    </Container>
  );
}
```

`src/pages/Home.tsx`:

```tsx
import { Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconFilePlus, IconFileText, IconList, IconNotes, IconSettings } from '@tabler/icons-react';
import { Link } from 'react-router';
import { TILE_STYLE } from '../theme';

const TILES = [
  { to: '/invoices/new', label: 'New Invoice', icon: IconFilePlus },
  { to: '/invoices', label: 'Invoices', icon: IconFileText },
  { to: '/drafts', label: 'Drafts', icon: IconNotes },
  { to: '/lists', label: 'Lists', icon: IconList },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

export function Home() {
  return (
    <Stack>
      <Title order={1}>Home</Title>
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
        {TILES.map(({ to, label, icon: Icon }) => (
          <Paper key={to} component={Link} to={to} withBorder radius="md" p="lg" style={TILE_STYLE}>
            <Icon size={44} aria-hidden />
            <Text size="lg" fw={700} ta="center">
              {label}
            </Text>
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
```

`src/pages/Settings.tsx`:

```tsx
import { Alert, Button, Center, Loader, Paper, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconLogout } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { PasswordForm } from '../components/PasswordForm';
import { getSeller, saveSeller } from '../lib/db';
import { describeError, loadErrorMessage } from '../lib/errors';
import { gstinProblem, normalizeGstin, stateName } from '../lib/gstin';
import { supabase } from '../lib/supabase';

export function Settings() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const s = await getSeller();
      setIsNew(!s);
      if (s) {
        setName(s.name);
        setAddress(s.address);
        setGstin(s.gstin);
        setPhone(s.phone);
      }
    } catch (e) {
      setLoadError(loadErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function save() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Please enter your company name.';
    if (!address.trim()) e.address = 'Please enter your company address.';
    const problem = gstinProblem(gstin);
    if (problem) e.gstin = problem;
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    try {
      await saveSeller({ name: name.trim(), address: address.trim(), gstin, phone: phone.trim() });
      setIsNew(false);
      notifications.show({ color: 'green', message: 'Company details saved.' });
    } catch (err) {
      notifications.show({ color: 'red', title: 'Not saved', message: describeError(err).message });
    } finally {
      setBusy(false);
    }
  }

  async function logOut() {
    await supabase.auth.signOut();
    window.location.assign('/');
  }

  const gstinOk = gstinProblem(gstin) === null;

  return (
    <Stack>
      <Title order={1}>Settings</Title>
      {loadError && (
        <Alert color="red" title="Could not load">
          <Stack>
            {loadError}
            <Button onClick={() => void load()}>Try again</Button>
          </Stack>
        </Alert>
      )}
      {loading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : (
        <Paper withBorder p="md">
          <Stack>
            <Title order={2}>Our company</Title>
            {isNew && <Alert color="blue">Please fill your company details. They appear on every invoice.</Alert>}
            <TextInput label="Company name" value={name} onChange={(e) => setName(e.currentTarget.value)} error={errors.name} />
            <Textarea label="Address" autosize minRows={2} value={address} onChange={(e) => setAddress(e.currentTarget.value)} error={errors.address} />
            <TextInput label="GSTIN" value={gstin} onChange={(e) => setGstin(normalizeGstin(e.currentTarget.value))} error={errors.gstin} />
            <Text>State: {gstinOk ? stateName(gstin.slice(0, 2)) : '—'}</Text>
            <TextInput label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save company details'}
            </Button>
          </Stack>
        </Paper>
      )}
      <Paper withBorder p="md">
        <Stack>
          <Title order={2}>Password</Title>
          <PasswordForm />
        </Stack>
      </Paper>
      <Button variant="outline" color="red" leftSection={<IconLogout aria-hidden />} onClick={() => void logOut()}>
        Log out
      </Button>
    </Stack>
  );
}
```

- [ ] **Step 8: Run the e2e test, the typecheck and the build**

Run: `npx playwright test tests/e2e/auth.spec.ts`
Expected: PASS on both the `desktop` and `phone` projects (8 tests).

Run: `npm run build`
Expected: no TypeScript errors; the bundle is built.

- [ ] **Step 9: Commit**

```bash
git add src playwright.config.ts tests/e2e
git commit -m "feat: add app shell with login, large-type theme, Home and Settings"
```

---

### Task 10: Master lists (companies, items, charges)

**Files:**
- Create: `src/components/StateSelect.tsx`, `src/components/SelectWithOther.tsx`, `src/components/CompanyForm.tsx`, `src/components/ItemForm.tsx`, `src/components/ChargeTypeForm.tsx`, `src/pages/Masters.tsx`
- Modify: `src/router.tsx` (add the `/lists` route)
- Modify: `tests/e2e/helpers.ts` (add `pickOption`)
- Test: `tests/e2e/masters.spec.ts`

**Interfaces:**
- Consumes:
  - `listMaster`, `saveMaster`, `setArchived`, `findCompaniesByGstin` (Task 8)
  - `describeError`, `loadErrorMessage` (Task 8)
  - `UNITS`, `HSN_PATTERN` (Task 8)
  - `fmtMoney`, `fmtRate`, `parseAmount`, `plain` (Task 4)
  - `STATES`, `gstinProblem`, `isStateCode`, `normalizeGstin`, `stateName` (Task 2)
- Produces:
  - **Components:**
    - `StateSelect(props: Omit<SelectProps, 'data' | 'searchable'>)`
    - `SelectWithOther({ label, options, value, onChange, error })`
    - `CompanyForm({ initial?: Company; onSaved(c: Company): void; onCancel(): void })`
    - `ItemForm({ initial?: Item; onSaved(i: Item): void; onCancel(): void })`
    - `ChargeTypeForm({ initial?: ChargeType; onSaved(t: ChargeType): void; onCancel(): void })`
  - **Form field labels:**
    - Company: `Company name`, `Address`, `GSTIN`, `State`
    - Item: `Item name`, `Description`, `HSN code`, `Unit`, `GST rate (%)`, `Default price (optional)`
    - Charge: `Charge name`, `GST rate (%)`
  - **e2e helper:** `pickOption(scope: Page | Locator, label: string, search: string, option: string | RegExp)`

- [ ] **Step 1: Add the `pickOption` helper to `tests/e2e/helpers.ts`**

Change the first import line to `import { expect, type Locator, type Page } from '@playwright/test';` and append:

```ts
/** Types into a searchable Mantine Select (found by its label) and clicks the matching option. */
export async function pickOption(scope: Page | Locator, label: string, search: string, option: string | RegExp): Promise<void> {
  const page = 'goto' in scope ? scope : scope.page();
  const input = scope.getByLabel(label, { exact: true });
  await input.click();
  await input.fill(search);
  await page.getByRole('option', { name: option }).first().click();
}
```

- [ ] **Step 2: Write the failing e2e test** `tests/e2e/masters.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { login, pickOption } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/lists');
});

test('adds a company, refuses a look-alike, removes and restores it', async ({ page }, info) => {
  const name = `E2E Buyer ${info.project.name}`;
  const dialog = page.getByRole('dialog');

  await page.getByRole('button', { name: '+ Add company' }).click();
  await dialog.getByLabel('Company name').fill(name);
  await dialog.getByLabel('Address').fill('MG Road, Bengaluru');
  await pickOption(dialog, 'State', 'Karna', /Karnataka/);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('master-row').filter({ hasText: name })).toHaveCount(1);

  await page.getByRole('button', { name: '+ Add company' }).click();
  await dialog.getByLabel('Company name').fill(name.toUpperCase());
  await dialog.getByLabel('Address').fill('Elsewhere');
  await pickOption(dialog, 'State', 'Karna', /Karnataka/);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText(/already exists/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await page.getByTestId('master-row').filter({ hasText: name }).getByRole('button', { name: 'Remove from list' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByTestId('master-row').filter({ hasText: name })).toHaveCount(0);

  await page.getByLabel('Show removed').check();
  await page.getByTestId('master-row').filter({ hasText: name }).getByRole('button', { name: 'Restore' }).click();
  await page.getByLabel('Show removed').uncheck();
  await expect(page.getByTestId('master-row').filter({ hasText: name })).toHaveCount(1);
});

test('explains a bad HSN and keeps a leading zero', async ({ page }, info) => {
  const name = `E2E Item ${info.project.name}`;
  const dialog = page.getByRole('dialog');
  await page.getByRole('tab', { name: 'Items' }).click();
  await page.getByRole('button', { name: '+ Add item' }).click();
  await dialog.getByLabel('Item name').fill(name);
  await dialog.getByLabel('HSN code').fill('12345');
  await dialog.getByLabel('GST rate (%)').fill('18');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('HSN must be 4, 6 or 8 digits.')).toBeVisible();
  await dialog.getByLabel('HSN code').fill('091030');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('master-row').filter({ hasText: name })).toContainText('HSN 091030');
});

test('adds a charge type', async ({ page }, info) => {
  const name = `E2E Charge ${info.project.name}`;
  const dialog = page.getByRole('dialog');
  await page.getByRole('tab', { name: 'Charges' }).click();
  await page.getByRole('button', { name: '+ Add charge' }).click();
  await dialog.getByLabel('Charge name').fill(name);
  await dialog.getByLabel('GST rate (%)').fill('5');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('master-row').filter({ hasText: name })).toContainText('GST 5%');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx playwright test tests/e2e/masters.spec.ts --project=desktop`
Expected: FAIL. `/lists` redirects to Home, so there is no "+ Add company" button.

- [ ] **Step 4: Write the shared inputs**

`src/components/StateSelect.tsx`:

```tsx
import { Select, type SelectProps } from '@mantine/core';
import { STATES } from '../lib/gstin';

const DATA = STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }));

export function StateSelect(props: Omit<SelectProps, 'data' | 'searchable'>) {
  return <Select searchable nothingFoundMessage="No state matches" data={DATA} {...props} />;
}
```

`src/components/SelectWithOther.tsx`:

```tsx
import { Select, Stack, TextInput } from '@mantine/core';
import { useState } from 'react';

interface Props {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

/** A fixed list plus "Other", which reveals a text box. Stores one plain string. */
export function SelectWithOther({ label, options, value, onChange, error }: Props) {
  const [otherMode, setOtherMode] = useState(!options.includes(value));
  const showOther = otherMode || !options.includes(value);
  return (
    <Stack gap="xs">
      <Select
        label={label}
        data={[...options, 'Other']}
        value={showOther ? 'Other' : value}
        onChange={(v) => {
          if (v === 'Other') {
            setOtherMode(true);
            onChange('');
          } else if (v) {
            setOtherMode(false);
            onChange(v);
          }
        }}
        error={showOther ? undefined : error}
      />
      {showOther && (
        <TextInput label={`${label} — type it`} value={value} onChange={(e) => onChange(e.currentTarget.value)} error={error} />
      )}
    </Stack>
  );
}
```

- [ ] **Step 5: Write the three master forms**

`src/components/CompanyForm.tsx`:

```tsx
import { Alert, Button, Group, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import { findCompaniesByGstin, saveMaster } from '../lib/db';
import { describeError } from '../lib/errors';
import { gstinProblem, isStateCode, normalizeGstin } from '../lib/gstin';
import type { Company } from '../lib/types';
import { StateSelect } from './StateSelect';

interface Props {
  initial?: Company;
  onSaved: (c: Company) => void;
  onCancel: () => void;
}

export function CompanyForm({ initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [gstin, setGstin] = useState(initial?.gstin ?? '');
  const [state, setState] = useState(initial?.state_code ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warning, setWarning] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const gstinValid = gstin.length === 15 && gstinProblem(gstin) === null;

  function changeGstin(raw: string) {
    const g = normalizeGstin(raw);
    setGstin(g);
    setWarning(null);
    if (g.length === 15 && gstinProblem(g) === null) setState(g.slice(0, 2));
  }

  /** One GSTIN can have several branches, so a shared GSTIN only warns. */
  async function checkSharedGstin() {
    if (!gstinValid) return;
    try {
      const others = (await findCompaniesByGstin(gstin)).filter((c) => c.id !== initial?.id);
      setWarning(others.length ? `Another company uses this GSTIN: ${others.map((c) => c.name).join(', ')}` : null);
    } catch {
      setWarning(null);
    }
  }

  async function save() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Please enter the company name.';
    if (!address.trim()) e.address = 'Please enter the address.';
    if (gstin) {
      const p = gstinProblem(gstin);
      if (p) e.gstin = p;
    }
    if (!isStateCode(state)) e.state = 'Please choose the state.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    setFormError(null);
    try {
      const saved = await saveMaster(
        'companies',
        { name: name.trim(), address: address.trim(), gstin: gstin || null, state_code: state },
        initial?.id,
      );
      onSaved(saved);
    } catch (err) {
      setFormError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack>
      <TextInput label="Company name" value={name} onChange={(e) => setName(e.currentTarget.value)} error={errors.name} data-autofocus />
      <Textarea label="Address" autosize minRows={2} value={address} onChange={(e) => setAddress(e.currentTarget.value)} error={errors.address} />
      <TextInput
        label="GSTIN"
        description="Leave empty if the company is not registered"
        value={gstin}
        onChange={(e) => changeGstin(e.currentTarget.value)}
        onBlur={() => void checkSharedGstin()}
        error={errors.gstin}
      />
      {warning && <Text c="orange.9">{warning}</Text>}
      <StateSelect
        label="State"
        value={state || null}
        onChange={(v) => setState(v ?? '')}
        disabled={gstinValid}
        description={gstinValid ? 'Taken from the GSTIN' : undefined}
        error={errors.state}
      />
      {formError && <Alert color="red">{formError}</Alert>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </Group>
    </Stack>
  );
}
```

`src/components/ItemForm.tsx`:

```tsx
import { Alert, Button, Group, Stack, TextInput } from '@mantine/core';
import { useState } from 'react';
import { saveMaster } from '../lib/db';
import { describeError } from '../lib/errors';
import { parseAmount, plain } from '../lib/invoiceMath';
import { HSN_PATTERN, UNITS } from '../lib/options';
import type { Item } from '../lib/types';
import { SelectWithOther } from './SelectWithOther';

interface Props {
  initial?: Item;
  onSaved: (item: Item) => void;
  onCancel: () => void;
}

export function ItemForm({ initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [hsn, setHsn] = useState(initial?.hsn ?? '');
  const [unit, setUnit] = useState(initial?.unit ?? 'Nos');
  const [rate, setRate] = useState(initial ? plain(initial.gst_rate) : '');
  const [price, setPrice] = useState(initial?.default_price ? plain(initial.default_price) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    const r = parseAmount(rate, 'rate');
    const p = price.trim() ? parseAmount(price, 'price') : null;
    if (!name.trim()) e.name = 'Please enter the item name.';
    if (!HSN_PATTERN.test(hsn.trim())) e.hsn = 'HSN must be 4, 6 or 8 digits.';
    if (!unit.trim()) e.unit = 'Please choose a unit.';
    if (r === null) e.rate = 'Please enter GST rate (0 to 100).';
    if (price.trim() && p === null) e.price = 'Please enter a price (0 or more, up to 2 decimals), or leave it empty.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    setFormError(null);
    try {
      const saved = await saveMaster(
        'items',
        { name: name.trim(), description: description.trim(), hsn: hsn.trim(), unit: unit.trim(), gst_rate: r, default_price: p },
        initial?.id,
      );
      onSaved(saved);
    } catch (err) {
      setFormError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack>
      <TextInput label="Item name" value={name} onChange={(e) => setName(e.currentTarget.value)} error={errors.name} data-autofocus />
      <TextInput label="Description" value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
      <TextInput label="HSN code" inputMode="numeric" value={hsn} onChange={(e) => setHsn(e.currentTarget.value.trim())} error={errors.hsn} />
      <SelectWithOther label="Unit" options={UNITS} value={unit} onChange={setUnit} error={errors.unit} />
      <TextInput label="GST rate (%)" inputMode="decimal" value={rate} onChange={(e) => setRate(e.currentTarget.value)} error={errors.rate} />
      <TextInput
        label="Default price (optional)"
        inputMode="decimal"
        leftSection="₹"
        value={price}
        onChange={(e) => setPrice(e.currentTarget.value)}
        error={errors.price}
      />
      {formError && <Alert color="red">{formError}</Alert>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </Group>
    </Stack>
  );
}
```

`src/components/ChargeTypeForm.tsx`:

```tsx
import { Alert, Button, Group, Stack, TextInput } from '@mantine/core';
import { useState } from 'react';
import { saveMaster } from '../lib/db';
import { describeError } from '../lib/errors';
import { parseAmount, plain } from '../lib/invoiceMath';
import type { ChargeType } from '../lib/types';

interface Props {
  initial?: ChargeType;
  onSaved: (t: ChargeType) => void;
  onCancel: () => void;
}

export function ChargeTypeForm({ initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [rate, setRate] = useState(initial ? plain(initial.gst_rate) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    const r = parseAmount(rate, 'rate');
    if (!name.trim()) e.name = 'Please enter the charge name.';
    if (r === null) e.rate = 'Please enter GST rate (0 to 100).';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    setFormError(null);
    try {
      onSaved(await saveMaster('charge_types', { name: name.trim(), gst_rate: r }, initial?.id));
    } catch (err) {
      setFormError(describeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack>
      <TextInput label="Charge name" value={name} onChange={(e) => setName(e.currentTarget.value)} error={errors.name} data-autofocus />
      <TextInput label="GST rate (%)" inputMode="decimal" value={rate} onChange={(e) => setRate(e.currentTarget.value)} error={errors.rate} />
      {formError && <Alert color="red">{formError}</Alert>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </Group>
    </Stack>
  );
}
```

- [ ] **Step 6: Write the page** `src/pages/Masters.tsx`

```tsx
import { Alert, Button, Card, Center, Group, Loader, Modal, Stack, Switch, Tabs, Text, TextInput, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconRestore, IconSearch, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { ChargeTypeForm } from '../components/ChargeTypeForm';
import { CompanyForm } from '../components/CompanyForm';
import { ItemForm } from '../components/ItemForm';
import { listMaster, setArchived, type MasterTable } from '../lib/db';
import { describeError, loadErrorMessage } from '../lib/errors';
import { stateName } from '../lib/gstin';
import { fmtMoney, fmtRate } from '../lib/invoiceMath';
import type { ChargeType, Company, Item } from '../lib/types';

type Row = Company | Item | ChargeType;

const TABLES: MasterTable[] = ['companies', 'items', 'charge_types'];
const META: Record<MasterTable, { tab: string; singular: string }> = {
  companies: { tab: 'Companies', singular: 'company' },
  items: { tab: 'Items', singular: 'item' },
  charge_types: { tab: 'Charges', singular: 'charge' },
};

function describeRow(table: MasterTable, row: Row): { title: string; lines: string[] } {
  if (table === 'companies') {
    const c = row as Company;
    return { title: c.name, lines: [`${c.gstin ?? 'No GSTIN'} · ${stateName(c.state_code)}`, c.address] };
  }
  if (table === 'items') {
    const i = row as Item;
    const price = i.default_price ? ` · ${fmtMoney(i.default_price)}` : '';
    return { title: i.name, lines: [`HSN ${i.hsn} · ${i.unit} · GST ${fmtRate(i.gst_rate)}${price}`, i.description].filter(Boolean) };
  }
  const t = row as ChargeType;
  return { title: t.name, lines: [`GST ${fmtRate(t.gst_rate)}`] };
}

export function Masters() {
  return (
    <Stack>
      <Title order={1}>Lists</Title>
      <Tabs defaultValue="companies" keepMounted={false}>
        <Tabs.List grow>
          {TABLES.map((t) => (
            <Tabs.Tab key={t} value={t} fz="lg">
              {META[t].tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {TABLES.map((t) => (
          <Tabs.Panel key={t} value={t} pt="md">
            <MasterList table={t} />
          </Tabs.Panel>
        ))}
      </Tabs>
    </Stack>
  );
}

function MasterList({ table }: { table: MasterTable }) {
  const phone = useMediaQuery('(max-width: 899px)');
  const [showRemoved, setShowRemoved] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const { tab, singular } = META[table];

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      setRows(await listMaster(table, showRemoved));
    } catch (e) {
      setError(loadErrorMessage(e));
    }
  }, [table, showRemoved]);
  useEffect(() => {
    void load();
  }, [load]);

  async function changeArchived(row: Row, archived: boolean) {
    try {
      await setArchived(table, row.id, archived);
      notifications.show({ color: 'green', message: archived ? 'Removed from the list.' : 'Restored.' });
      await load();
    } catch (e) {
      notifications.show({ color: 'red', title: archived ? 'Not removed' : 'Not restored', message: describeError(e).message });
    }
  }

  function confirmRemove(row: Row) {
    modals.openConfirmModal({
      title: 'Remove from list?',
      children: <Text>Remove {describeRow(table, row).title} from the list? Old invoices are not affected. You can restore it later.</Text>,
      labels: { confirm: 'Remove', cancel: 'Keep' },
      confirmProps: { color: 'red' },
      onConfirm: () => void changeArchived(row, true),
    });
  }

  function saved() {
    setEditing(null);
    notifications.show({ color: 'green', message: 'Saved.' });
    void load();
  }

  const q = search.trim().toLowerCase();
  const visible = (rows ?? []).filter((r) => {
    const d = describeRow(table, r);
    return !q || [d.title, ...d.lines].join(' ').toLowerCase().includes(q);
  });
  const initial = editing && editing !== 'new' ? editing : undefined;
  const close = () => setEditing(null);

  return (
    <Stack>
      <TextInput
        label={`Search ${tab.toLowerCase()}`}
        leftSection={<IconSearch size={20} aria-hidden />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />
      <Group justify="space-between">
        <Button onClick={() => setEditing('new')}>{`+ Add ${singular}`}</Button>
        <Switch size="lg" label="Show removed" checked={showRemoved} onChange={(e) => setShowRemoved(e.currentTarget.checked)} />
      </Group>
      {error && (
        <Alert color="red" title="Could not load">
          <Stack>
            {error}
            <Button onClick={() => void load()}>Try again</Button>
          </Stack>
        </Alert>
      )}
      {!rows && !error && (
        <Center py="xl">
          <Loader />
        </Center>
      )}
      {rows && visible.length === 0 && <Text>{showRemoved ? 'Nothing has been removed.' : 'Nothing here yet.'}</Text>}
      {visible.map((row) => {
        const d = describeRow(table, row);
        return (
          <Card key={row.id} withBorder padding="md" data-testid="master-row">
            <Text fw={700} size="lg">
              {d.title}
            </Text>
            {d.lines.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
            <Group mt="sm">
              {showRemoved ? (
                <Button variant="light" leftSection={<IconRestore aria-hidden />} onClick={() => void changeArchived(row, false)}>
                  Restore
                </Button>
              ) : (
                <>
                  <Button variant="light" leftSection={<IconPencil aria-hidden />} onClick={() => setEditing(row)}>
                    Edit
                  </Button>
                  <Button variant="subtle" color="red" leftSection={<IconTrash aria-hidden />} onClick={() => confirmRemove(row)}>
                    Remove from list
                  </Button>
                </>
              )}
            </Group>
          </Card>
        );
      })}
      <Modal opened={editing !== null} onClose={close} title={`${editing === 'new' ? 'Add' : 'Edit'} ${singular}`} fullScreen={phone} size="lg">
        {table === 'companies' && <CompanyForm initial={initial as Company | undefined} onSaved={saved} onCancel={close} />}
        {table === 'items' && <ItemForm initial={initial as Item | undefined} onSaved={saved} onCancel={close} />}
        {table === 'charge_types' && <ChargeTypeForm initial={initial as ChargeType | undefined} onSaved={saved} onCancel={close} />}
      </Modal>
    </Stack>
  );
}
```

- [ ] **Step 7: Add the route**

In `src/router.tsx`:
- Add `import { Masters } from './pages/Masters';`
- Add `{ path: '/lists', element: <Masters /> },` immediately after the `'/'` route.

- [ ] **Step 8: Run the tests**

Run: `npx playwright test tests/e2e/masters.spec.ts tests/e2e/auth.spec.ts`
Expected: PASS on both projects.

Run: `npm run build`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src tests/e2e
git commit -m "feat: add master list screens with add, edit, remove and restore"
```

---

### Task 11: Invoice form rules (state, validation, payload, numbering)

**Files:**
- Create: `src/lib/invoiceForm.ts`
- Test: `src/lib/invoiceForm.test.ts`

**Interfaces:**
- Consumes:
  - `fyOf`, `padSerial`, `parseSerial`, `todayLocal` (Task 1)
  - `gstinProblem`, `isStateCode`, `normalizeGstin` (Task 2)
  - `computeTotals`, `D`, `parseAmount`, `plain`, `Totals` (Task 4)
  - `HSN_PATTERN` and types (Task 8)
- Produces:
  - **Types:**
    - `interface LineForm { key; itemId: string | null; itemName; description; hsn; qty; unit; price; gstRate }` (all strings except itemId)
    - `interface ChargeForm { key; chargeTypeId: string | null; name; amount; gstRate }`
    - `interface InvoiceForm`, exact fields below. It is also the JSON stored in `drafts.data`.
    - `type FormErrors = Record<string, string>`
  - **Building forms:** `newId()`, `emptyLine()`, `emptyCharge()`, `emptyForm(sellerStateCode, today?)`, `formFromInvoice(inv)`, `asNewInvoice(f)`
  - **Applying a pick or edit:** `applyCompany(f, c)`, `setBuyerState(f, code)`, `setBuyerGstin(f, raw)`, `applyItem(line, item)`, `applyChargeType(charge, type)`, `changeDate(f, date)`
  - **Numbering:** `serialDisplay(f, suggestion)`, `effectiveSerial(f)`
  - **Tax and totals:** `isSameState(f)`, `formTotals(f)`
  - **Save:** `validateForm(f)`, `buildSavePayload(f)`
  - **Display helpers:** `draftLabel(f)`, `withCurrentOption(options, id, label)`
  - **Error keys** (used by the editor to place messages):
    - Header: `invoiceDate`, `serial`, `company`, `buyerAddress`, `buyerGstin`, `buyerStateCode`, `shipAddress`, `placeOfSupply`, `paymentTerms`, `transportMode`, `lines`
    - Per item: `lines.<i>.item|hsn|qty|unit|price|gstRate`
    - Per charge: `charges.<i>.type|amount|gstRate`

- [ ] **Step 1: Write the failing test** `src/lib/invoiceForm.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyCompany, applyItem, asNewInvoice, buildSavePayload, changeDate, draftLabel, effectiveSerial, emptyForm,
  formFromInvoice, newId, serialDisplay, setBuyerGstin, validateForm, withCurrentOption, type InvoiceForm,
} from './invoiceForm';
import type { Company, InvoiceFull, Item } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PATEL: Company = { id: 'c1', name: 'Patel Hardware Mart', address: 'Anand', gstin: '24AAKFP5678B1Z5', state_code: '24', archived: false };
const PIPE: Item = { id: 'i1', name: 'MS Pipe 1 inch', description: 'Mild steel pipe', hsn: '7306', unit: 'Mtr', gst_rate: '18.00', default_price: '120.00', archived: false };
const INVOICE: InvoiceFull = {
  id: 'inv-1', invoice_date: '2027-03-10', fy: '2026-27', serial: 12, invoice_no: '2026-27/012', company_id: 'c-gone',
  buyer_name: 'Old Buyer', buyer_address: 'Pune', buyer_gstin: '27AABCA2222E1ZD', buyer_state_code: '27',
  ship_same: false, ship_address: 'Nashik', place_of_supply: '27',
  seller_name: 'Seller', seller_address: 'Ahmedabad', seller_gstin: '24AAACS1234A1Z8', seller_state_code: '24',
  tax_type: 'IGST', payment_terms: '30 days', transport_mode: 'Courier', vehicle_no: null,
  items_total: 240, charges_total: 0, taxable_total: 240, cgst_total: 0, sgst_total: 0, igst_total: 43.2,
  exact_total: 283.2, grand_total: 283, round_off: -0.2,
  created_at: '2027-03-10T05:00:00+00:00', updated_at: '2027-03-11T06:00:00.123456+00:00',
  invoice_lines: [{ id: 'l1', position: 1, item_id: 'i-gone', item_name: 'Retired Item', description: '', hsn: '7306',
    qty: '2.000', unit: 'Mtr', price: '120.00', gst_rate: '18.00', amount: 240, gst_amount: 43.2 }],
  invoice_charges: [],
};

function filled(): InvoiceForm {
  const f = applyCompany(emptyForm('24', '2026-10-08'), PATEL);
  return { ...f, lines: [{ ...applyItem(f.lines[0], PIPE), qty: '2' }] };
}

afterEach(() => vi.unstubAllGlobals());

describe('ids', () => {
  it('makes UUID v4 ids', () => {
    expect(newId()).toMatch(UUID);
  });
  it('still works without crypto.randomUUID (plain-http phone testing)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    expect(newId()).toMatch(UUID);
  });
});

describe('building the form', () => {
  it('starts with one empty item and friendly defaults', () => {
    const f = emptyForm('24', '2026-10-08');
    expect(f.lines).toHaveLength(1);
    expect(f.paymentTerms).toBe('Immediate');
    expect(f.transportMode).toBe('By Road');
    expect(f.shipSame).toBe(true);
    expect(f.mode).toBe('new');
    expect(f.sellerStateCode).toBe('24');
  });
  it('fills an item from the list with clean numbers', () => {
    const l = applyItem(emptyForm('24').lines[0], PIPE);
    expect(l).toMatchObject({ itemName: 'MS Pipe 1 inch', hsn: '7306', unit: 'Mtr', gstRate: '18', price: '120' });
    expect(applyItem({ ...l, price: '99' }, { ...PIPE, default_price: null }).price).toBe('99');
  });
  it('moves state and place of supply with the GSTIN, but keeps a hand-picked place of supply', () => {
    const f = applyCompany(emptyForm('24'), PATEL);
    expect(f.placeOfSupply).toBe('24');
    const moved = setBuyerGstin(f, ' 27aabca2222e1zd ');
    expect(moved).toMatchObject({ buyerGstin: '27AABCA2222E1ZD', buyerStateCode: '27', placeOfSupply: '27' });
    const kept = setBuyerGstin({ ...f, placeOfSupply: '29' }, '27AABCA2222E1ZD');
    expect(kept.placeOfSupply).toBe('29');
  });
  it('loads a saved invoice for editing', () => {
    const f = formFromInvoice(INVOICE);
    expect(f).toMatchObject({ mode: 'edit', originalSerial: 12, originalFy: '2026-27', serialInput: '012', sellerStateCode: '24', shipAddress: 'Nashik' });
    expect(f.lines[0]).toMatchObject({ qty: '2', price: '120', gstRate: '18' });
  });
  it('turns an edit into a new invoice with the same id', () => {
    const f = asNewInvoice(formFromInvoice(INVOICE));
    expect(f).toMatchObject({ id: 'inv-1', mode: 'new', expectedUpdatedAt: null, originalSerial: null, serialTouched: false });
  });
});

describe('invoice number', () => {
  it('uses the suggestion until the user types', () => {
    const f = emptyForm('24', '2026-10-08');
    expect(serialDisplay(f, 7)).toBe('007');
    expect(effectiveSerial(f)).toBeNull();
    const typed = { ...f, serialInput: '012', serialTouched: true };
    expect(effectiveSerial(typed)).toBe(12);
  });
  it('keeps a typed number within the same year, drops it when the year changes', () => {
    const typed = { ...emptyForm('24', '2026-10-08'), serialInput: '50', serialTouched: true };
    expect(changeDate(typed, '2027-03-31').serialTouched).toBe(true);
    expect(effectiveSerial(changeDate(typed, '2027-04-01'))).toBeNull();
  });
  it('returns to the original number when an edit moves to another year and back', () => {
    let f = formFromInvoice(INVOICE);
    expect(serialDisplay(f, 99)).toBe('012');
    expect(effectiveSerial(f)).toBe(12);
    f = changeDate(f, '2027-04-02');
    expect(effectiveSerial(f)).toBeNull();
    expect(serialDisplay(f, 5)).toBe('005');
    f = changeDate(f, '2027-03-15');
    expect(effectiveSerial(f)).toBe(12);
    expect(serialDisplay(f, 5)).toBe('012');
  });
});

describe('validateForm', () => {
  it('lists what is missing on an empty form', () => {
    const keys = Object.keys(validateForm(emptyForm('24')));
    expect(keys).toEqual(expect.arrayContaining([
      'company', 'buyerAddress', 'buyerStateCode', 'placeOfSupply',
      'lines.0.item', 'lines.0.hsn', 'lines.0.qty', 'lines.0.price', 'lines.0.gstRate',
    ]));
  });
  it('accepts a complete form', () => {
    expect(validateForm(filled())).toEqual({});
  });
  it('accepts quantities typed the way people type them', () => {
    const f = filled();
    expect(validateForm({ ...f, lines: [{ ...f.lines[0], qty: '1,000' }] })).toEqual({});
    expect(validateForm({ ...f, lines: [{ ...f.lines[0], qty: '.5' }] })).toEqual({});
  });
  it('refuses zero, a 4th decimal and a bad typed number', () => {
    const f = filled();
    expect(validateForm({ ...f, lines: [{ ...f.lines[0], qty: '0' }] })['lines.0.qty']).toMatch(/more than 0/);
    expect(validateForm({ ...f, lines: [{ ...f.lines[0], qty: '2.3335' }] })['lines.0.qty']).toMatch(/3 decimals/);
    expect(validateForm({ ...f, serialInput: '', serialTouched: true }).serial).toMatch(/whole number/);
  });
  it('explains a mistyped GSTIN and a charge without amount', () => {
    const f = filled();
    expect(validateForm({ ...f, buyerGstin: '24AAKFP5678B1Z6' }).buyerGstin).toMatch(/last character/);
    const withCharge = { ...f, charges: [{ key: 'k', chargeTypeId: 't', name: 'Freight', amount: '0', gstRate: '18' }] };
    expect(validateForm(withCharge)['charges.0.amount']).toMatch(/more than 0/);
    const noType = { ...f, charges: [{ key: 'k', chargeTypeId: null, name: '', amount: '10', gstRate: '18' }] };
    expect(validateForm(noType)['charges.0.type']).toBe('Please choose a charge type.');
  });
});

describe('buildSavePayload', () => {
  it('sends exact strings, the auto number and a copied shipping address', () => {
    const p = buildSavePayload({ ...filled(), vehicleNo: ' gj 01 ab 1234 ' });
    expect(p.serial).toBeNull();
    expect(p.ship_address).toBe('Anand');
    expect(p.vehicle_no).toBe('GJ01AB1234');
    expect(p.lines[0]).toMatchObject({ qty: '2', price: '120', gst_rate: '18', amount: '240', gst_amount: '43.2' });
    expect(p).toMatchObject({
      items_total: '240', charges_total: '0', taxable_total: '240',
      cgst_total: '21.6', sgst_total: '21.6', igst_total: '0',
      exact_total: '283.2', grand_total: '283', round_off: '-0.2',
    });
  });
  it('uses IGST when the place of supply is another state', () => {
    const p = buildSavePayload({ ...filled(), placeOfSupply: '27' });
    expect(p).toMatchObject({ igst_total: '43.2', cgst_total: '0', sgst_total: '0' });
  });
  it('sends null for empty GSTIN and vehicle number', () => {
    const p = buildSavePayload({ ...filled(), buyerGstin: '', vehicleNo: '  ' });
    expect(p.buyer_gstin).toBeNull();
    expect(p.vehicle_no).toBeNull();
  });
});

describe('labels and options', () => {
  it('labels drafts', () => {
    expect(draftLabel(emptyForm('24'))).toBe('No buyer yet');
    expect(draftLabel(filled())).toBe('Patel Hardware Mart');
    expect(draftLabel(formFromInvoice(INVOICE))).toBe('Editing 2026-27/012');
  });
  it('keeps a removed company or item visible in its picker', () => {
    const opts = [{ value: 'c1', label: 'Patel' }];
    expect(withCurrentOption(opts, 'c1', 'Patel')).toBe(opts);
    expect(withCurrentOption(opts, null, '')).toBe(opts);
    expect(withCurrentOption(opts, 'c-gone', 'Old Buyer')).toEqual([...opts, { value: 'c-gone', label: 'Old Buyer (removed from list)' }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/invoiceForm.test.ts`
Expected: FAIL (cannot resolve `./invoiceForm`).

- [ ] **Step 3: Implement** `src/lib/invoiceForm.ts`

```ts
import { fyOf, padSerial, parseSerial, todayLocal } from './fy';
import { gstinProblem, isStateCode, normalizeGstin } from './gstin';
import { computeTotals, D, parseAmount, plain, type Totals } from './invoiceMath';
import { HSN_PATTERN } from './options';
import type { ChargeType, Company, InvoiceFull, Item, SavePayload } from './types';

export interface LineForm {
  key: string;
  itemId: string | null;
  itemName: string;
  description: string;
  hsn: string;
  qty: string;
  unit: string;
  price: string;
  gstRate: string;
}

export interface ChargeForm {
  key: string;
  chargeTypeId: string | null;
  name: string;
  amount: string;
  gstRate: string;
}

/** Everything on the invoice screen. Stored as-is in drafts.data. */
export interface InvoiceForm {
  id: string;
  mode: 'new' | 'edit';
  expectedUpdatedAt: string | null;
  originalFy: string | null;
  originalSerial: number | null;
  originalInvoiceNo: string | null;
  sellerStateCode: string;
  invoiceDate: string;
  serialInput: string;
  serialTouched: boolean;
  companyId: string | null;
  buyerName: string;
  buyerAddress: string;
  buyerGstin: string;
  buyerStateCode: string;
  shipSame: boolean;
  shipAddress: string;
  placeOfSupply: string;
  paymentTerms: string;
  transportMode: string;
  vehicleNo: string;
  lines: LineForm[];
  charges: ChargeForm[];
}

export type FormErrors = Record<string, string>;

/** UUID v4. crypto.randomUUID only exists on https/localhost; plain-http LAN testing falls back to getRandomValues. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function emptyLine(): LineForm {
  return { key: newId(), itemId: null, itemName: '', description: '', hsn: '', qty: '', unit: 'Nos', price: '', gstRate: '' };
}

export function emptyCharge(): ChargeForm {
  return { key: newId(), chargeTypeId: null, name: '', amount: '', gstRate: '' };
}

export function emptyForm(sellerStateCode: string, today: string = todayLocal()): InvoiceForm {
  return {
    id: newId(),
    mode: 'new',
    expectedUpdatedAt: null,
    originalFy: null,
    originalSerial: null,
    originalInvoiceNo: null,
    sellerStateCode,
    invoiceDate: today,
    serialInput: '',
    serialTouched: false,
    companyId: null,
    buyerName: '',
    buyerAddress: '',
    buyerGstin: '',
    buyerStateCode: '',
    shipSame: true,
    shipAddress: '',
    placeOfSupply: '',
    paymentTerms: 'Immediate',
    transportMode: 'By Road',
    vehicleNo: '',
    lines: [emptyLine()],
    charges: [],
  };
}

export function formFromInvoice(inv: InvoiceFull): InvoiceForm {
  return {
    id: inv.id,
    mode: 'edit',
    expectedUpdatedAt: inv.updated_at,
    originalFy: inv.fy,
    originalSerial: inv.serial,
    originalInvoiceNo: inv.invoice_no,
    sellerStateCode: inv.seller_state_code,
    invoiceDate: inv.invoice_date,
    serialInput: padSerial(inv.serial),
    serialTouched: false,
    companyId: inv.company_id,
    buyerName: inv.buyer_name,
    buyerAddress: inv.buyer_address,
    buyerGstin: inv.buyer_gstin ?? '',
    buyerStateCode: inv.buyer_state_code,
    shipSame: inv.ship_same,
    shipAddress: inv.ship_same ? '' : inv.ship_address,
    placeOfSupply: inv.place_of_supply,
    paymentTerms: inv.payment_terms,
    transportMode: inv.transport_mode,
    vehicleNo: inv.vehicle_no ?? '',
    lines: inv.invoice_lines.map((l) => ({
      key: newId(),
      itemId: l.item_id,
      itemName: l.item_name,
      description: l.description,
      hsn: l.hsn,
      qty: plain(l.qty),
      unit: l.unit,
      price: plain(l.price),
      gstRate: plain(l.gst_rate),
    })),
    charges: inv.invoice_charges.map((c) => ({
      key: newId(),
      chargeTypeId: c.charge_type_id,
      name: c.name,
      amount: plain(c.amount),
      gstRate: plain(c.gst_rate),
    })),
  };
}

/** Same id (the old invoice no longer exists), so the existing draft keeps working. */
export function asNewInvoice(f: InvoiceForm): InvoiceForm {
  return {
    ...f,
    mode: 'new',
    expectedUpdatedAt: null,
    originalFy: null,
    originalSerial: null,
    originalInvoiceNo: null,
    serialTouched: false,
    serialInput: '',
  };
}

export function applyCompany(f: InvoiceForm, c: Company): InvoiceForm {
  return {
    ...f,
    companyId: c.id,
    buyerName: c.name,
    buyerAddress: c.address,
    buyerGstin: c.gstin ?? '',
    buyerStateCode: c.state_code,
    placeOfSupply: c.state_code,
  };
}

/** Place of supply follows the buyer state unless the user picked a different one. */
export function setBuyerState(f: InvoiceForm, code: string): InvoiceForm {
  return { ...f, buyerStateCode: code, placeOfSupply: f.placeOfSupply === f.buyerStateCode ? code : f.placeOfSupply };
}

export function setBuyerGstin(f: InvoiceForm, raw: string): InvoiceForm {
  const g = normalizeGstin(raw);
  const next = { ...f, buyerGstin: g };
  return g.length === 15 && gstinProblem(g) === null ? setBuyerState(next, g.slice(0, 2)) : next;
}

export function applyItem(l: LineForm, it: Item): LineForm {
  return {
    ...l,
    itemId: it.id,
    itemName: it.name,
    description: it.description,
    hsn: it.hsn,
    unit: it.unit,
    gstRate: plain(it.gst_rate),
    price: it.default_price !== null ? plain(it.default_price) : l.price,
  };
}

export function applyChargeType(c: ChargeForm, t: ChargeType): ChargeForm {
  return { ...c, chargeTypeId: t.id, name: t.name, gstRate: plain(t.gst_rate) };
}

/** A typed number belongs to its financial year: moving to another year goes back to "auto". */
export function changeDate(f: InvoiceForm, date: string): InvoiceForm {
  if (!date) return { ...f, invoiceDate: '' };
  if (f.invoiceDate && fyOf(date) === fyOf(f.invoiceDate)) return { ...f, invoiceDate: date };
  return { ...f, invoiceDate: date, serialTouched: false, serialInput: '' };
}

function keepsOriginalNumber(f: InvoiceForm): boolean {
  return f.mode === 'edit' && f.originalSerial !== null && f.invoiceDate !== '' && fyOf(f.invoiceDate) === f.originalFy;
}

/** What the number box shows. */
export function serialDisplay(f: InvoiceForm, suggestion: number | null): string {
  if (f.serialTouched) return f.serialInput;
  if (keepsOriginalNumber(f)) return padSerial(f.originalSerial as number);
  return suggestion === null ? '' : padSerial(suggestion);
}

/** What save_invoice receives: a typed number, the invoice's own number, or null = database picks the next one. */
export function effectiveSerial(f: InvoiceForm): number | null {
  if (f.serialTouched) return parseSerial(f.serialInput);
  return keepsOriginalNumber(f) ? f.originalSerial : null;
}

export function isSameState(f: InvoiceForm): boolean {
  return f.sellerStateCode === (f.placeOfSupply || f.sellerStateCode);
}

export function formTotals(f: InvoiceForm): Totals {
  return computeTotals(f.lines, f.charges, isSameState(f));
}

export function validateForm(f: InvoiceForm): FormErrors {
  const e: FormErrors = {};
  if (!f.invoiceDate) e.invoiceDate = 'Please choose a date.';
  if (f.serialTouched && parseSerial(f.serialInput) === null) e.serial = 'Please enter a whole number, like 12.';
  if (!f.buyerName.trim()) e.company = 'Please choose a company.';
  if (!f.buyerAddress.trim()) e.buyerAddress = 'Please enter the billing address.';
  if (f.buyerGstin) {
    const problem = gstinProblem(f.buyerGstin);
    if (problem) e.buyerGstin = problem;
    else if (f.buyerStateCode !== f.buyerGstin.slice(0, 2)) e.buyerStateCode = 'The state must match the GSTIN (its first two digits).';
  }
  if (!isStateCode(f.buyerStateCode)) e.buyerStateCode = 'Please choose the buyer state.';
  if (!f.shipSame && !f.shipAddress.trim()) e.shipAddress = 'Please enter the shipping address.';
  if (!isStateCode(f.placeOfSupply)) e.placeOfSupply = 'Please choose the place of supply.';
  if (!f.paymentTerms.trim()) e.paymentTerms = 'Please choose payment terms.';
  if (!f.transportMode.trim()) e.transportMode = 'Please choose the mode of transport.';
  if (f.lines.length === 0) e.lines = 'Please add at least one item.';
  f.lines.forEach((l, i) => {
    const qty = parseAmount(l.qty, 'qty');
    if (!l.itemName.trim()) e[`lines.${i}.item`] = 'Please choose an item.';
    if (!HSN_PATTERN.test(l.hsn.trim())) e[`lines.${i}.hsn`] = 'HSN must be 4, 6 or 8 digits.';
    if (qty === null || new D(qty).isZero()) e[`lines.${i}.qty`] = 'Please enter quantity (more than 0, up to 3 decimals).';
    if (!l.unit.trim()) e[`lines.${i}.unit`] = 'Please choose a unit.';
    if (parseAmount(l.price, 'price') === null) e[`lines.${i}.price`] = 'Please enter price (0 or more, up to 2 decimals).';
    if (parseAmount(l.gstRate, 'rate') === null) e[`lines.${i}.gstRate`] = 'Please enter GST rate (0 to 100).';
  });
  f.charges.forEach((c, i) => {
    const amount = parseAmount(c.amount, 'amount');
    if (!c.name.trim()) e[`charges.${i}.type`] = 'Please choose a charge type.';
    if (amount === null || new D(amount).isZero()) e[`charges.${i}.amount`] = 'Please enter an amount more than 0 (up to 2 decimals).';
    if (parseAmount(c.gstRate, 'rate') === null) e[`charges.${i}.gstRate`] = 'Please enter GST rate (0 to 100).';
  });
  return e;
}

/** Exact decimal strings only (Decimal#toFixed() never uses exponent notation). Call after validateForm passes. */
export function buildSavePayload(f: InvoiceForm): SavePayload {
  const t = formTotals(f);
  const s = (d: { toFixed(): string }) => d.toFixed();
  const buyerAddress = f.buyerAddress.trim();
  return {
    id: f.id,
    invoice_date: f.invoiceDate,
    serial: effectiveSerial(f),
    company_id: f.companyId,
    buyer_name: f.buyerName.trim(),
    buyer_address: buyerAddress,
    buyer_gstin: f.buyerGstin || null,
    buyer_state_code: f.buyerStateCode,
    ship_same: f.shipSame,
    ship_address: f.shipSame ? buyerAddress : f.shipAddress.trim(),
    place_of_supply: f.placeOfSupply,
    payment_terms: f.paymentTerms.trim(),
    transport_mode: f.transportMode.trim(),
    vehicle_no: f.vehicleNo.replace(/\s+/g, '').toUpperCase() || null,
    items_total: s(t.itemsTotal),
    charges_total: s(t.chargesTotal),
    taxable_total: s(t.taxableTotal),
    cgst_total: s(t.cgstTotal),
    sgst_total: s(t.sgstTotal),
    igst_total: s(t.igstTotal),
    exact_total: s(t.exactTotal),
    grand_total: s(t.grandTotal),
    round_off: s(t.roundOff),
    lines: f.lines.map((l, i) => ({
      item_id: l.itemId,
      item_name: l.itemName.trim(),
      description: l.description.trim(),
      hsn: l.hsn.trim(),
      qty: parseAmount(l.qty, 'qty') ?? '0',
      unit: l.unit.trim(),
      price: parseAmount(l.price, 'price') ?? '0',
      gst_rate: parseAmount(l.gstRate, 'rate') ?? '0',
      amount: s(t.lines[i].amount),
      gst_amount: s(t.lines[i].gstAmount),
    })),
    charges: f.charges.map((c, i) => ({
      charge_type_id: c.chargeTypeId,
      name: c.name.trim(),
      amount: parseAmount(c.amount, 'amount') ?? '0',
      gst_rate: parseAmount(c.gstRate, 'rate') ?? '0',
      gst_amount: s(t.charges[i].gstAmount),
    })),
  };
}

export function draftLabel(f: InvoiceForm): string {
  if (f.mode === 'edit') return `Editing ${f.originalInvoiceNo}`;
  return f.buyerName.trim() || 'No buyer yet';
}

/** Keeps a company/item that was removed from the list selectable on an old invoice. */
export function withCurrentOption(
  options: { value: string; label: string }[],
  id: string | null,
  label: string,
): { value: string; label: string }[] {
  if (!id || options.some((o) => o.value === id)) return options;
  return [...options, { value: id, label: `${label} (removed from list)` }];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/invoiceForm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invoiceForm.ts src/lib/invoiceForm.test.ts
git commit -m "feat: add invoice form rules for validation, numbering and save payload"
```

---

### Task 12: Draft autosave controller

**Files:**
- Create: `src/lib/draftSync.ts`
- Test: `src/lib/draftSync.test.ts`

**Interfaces:**
- Consumes: nothing (the caller passes in the save function and the storage).
- Produces:
  - `interface DraftRecord { id: string; label: string; data: unknown }`
  - `type AutosaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'offline' }`
  - `LOCAL_PREFIX = 'pending-draft:'`
  - `createAutosaver({ delayMs, retryMs, save, storage, onStatus }): Autosaver`, where `Autosaver` has:
    - `schedule(rec)`
    - `flushNow(): Promise<void>`
    - `persistLocal()`
    - `stop(): Promise<void>`
    - `resume()`
    - `forget(id)`
  - `pushLocalDrafts(storage, save): Promise<number>`

- [ ] **Step 1: Write the failing test** `src/lib/draftSync.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosaver, LOCAL_PREFIX, pushLocalDrafts, type AutosaveStatus, type DraftRecord } from './draftSync';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}
const rec = (label: string): DraftRecord => ({ id: 'd1', label, data: { label } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createAutosaver', () => {
  it('waits for a pause in typing and saves only the latest version', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = createAutosaver({ delayMs: 3000, retryMs: 10000, save, storage: memoryStorage(), onStatus: () => undefined });
    a.schedule(rec('A'));
    await vi.advanceTimersByTimeAsync(1000);
    a.schedule(rec('B'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(rec('B'));
  });

  it('stop cancels the queued save and waits for the one in flight', async () => {
    let finish: () => void = () => undefined;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
    const a = createAutosaver({ delayMs: 3000, retryMs: 10000, save, storage: memoryStorage(), onStatus: () => undefined });
    a.schedule(rec('A'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(1);
    a.schedule(rec('B'));
    let stopped = false;
    const stopping = a.stop().then(() => (stopped = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);
    finish();
    await stopping;
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(20000);
    expect(save).toHaveBeenCalledTimes(1);
    a.schedule(rec('C'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps a copy on the device when saving fails, then retries and clears it', async () => {
    const storage = memoryStorage();
    const statuses: AutosaveStatus['kind'][] = [];
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const a = createAutosaver({ delayMs: 3000, retryMs: 10000, save, storage, onStatus: (s) => statuses.push(s.kind) });
    a.schedule(rec('A'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(storage.m.has(`${LOCAL_PREFIX}d1`)).toBe(true);
    expect(statuses.at(-1)).toBe('offline');
    await vi.advanceTimersByTimeAsync(10000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(storage.m.has(`${LOCAL_PREFIX}d1`)).toBe(false);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('writes the queued draft to the device synchronously when the page is closing', () => {
    const storage = memoryStorage();
    const a = createAutosaver({ delayMs: 3000, retryMs: 10000, save: vi.fn(), storage, onStatus: () => undefined });
    a.schedule(rec('A'));
    a.persistLocal();
    expect(JSON.parse(storage.m.get(`${LOCAL_PREFIX}d1`)!)).toEqual(rec('A'));
  });

  it('resume allows saving again after a failed invoice save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = createAutosaver({ delayMs: 3000, retryMs: 10000, save, storage: memoryStorage(), onStatus: () => undefined });
    await a.stop();
    a.resume();
    a.schedule(rec('A'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('pushLocalDrafts', () => {
  it('sends device copies and clears only the ones that were saved', async () => {
    const storage = memoryStorage();
    storage.setItem(`${LOCAL_PREFIX}a`, JSON.stringify({ id: 'a', label: 'A', data: {} }));
    storage.setItem(`${LOCAL_PREFIX}b`, JSON.stringify({ id: 'b', label: 'B', data: {} }));
    storage.setItem('unrelated', 'x');
    const save = vi.fn((r: DraftRecord) => (r.id === 'a' ? Promise.resolve() : Promise.reject(new Error('offline'))));
    expect(await pushLocalDrafts(storage, save)).toBe(1);
    expect(storage.m.has(`${LOCAL_PREFIX}a`)).toBe(false);
    expect(storage.m.has(`${LOCAL_PREFIX}b`)).toBe(true);
    expect(storage.m.has('unrelated')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/draftSync.test.ts`
Expected: FAIL (cannot resolve `./draftSync`).

- [ ] **Step 3: Implement** `src/lib/draftSync.ts`

```ts
export interface DraftRecord {
  id: string;
  label: string;
  data: unknown;
}

export type AutosaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'offline' };

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export const LOCAL_PREFIX = 'pending-draft:';

export interface Autosaver {
  /** Queue the latest version; it is sent after `delayMs` without further changes. */
  schedule(rec: DraftRecord): void;
  /** Send the queued version now (used when leaving the page). */
  flushNow(): Promise<void>;
  /** Synchronously copy the queued version to the device (used on beforeunload). */
  persistLocal(): void;
  /** Drop anything queued and wait for the request in flight. Call before save_invoice. */
  stop(): Promise<void>;
  resume(): void;
  /** Remove the device copy of a draft (after the invoice itself was saved). */
  forget(id: string): void;
}

export function createAutosaver(opts: {
  delayMs: number;
  retryMs: number;
  save: (rec: DraftRecord) => Promise<void>;
  storage: Store;
  onStatus: (s: AutosaveStatus) => void;
}): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  let pending: DraftRecord | null = null;
  let stopped = false;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const arm = (ms: number) => {
    clear();
    timer = setTimeout(() => void flushNow(), ms);
  };

  async function flushNow(): Promise<void> {
    clear();
    while (inflight) await inflight; // one request at a time, in order
    if (!pending || stopped) return;
    const rec = pending;
    pending = null;
    opts.onStatus({ kind: 'saving' });
    inflight = opts
      .save(rec)
      .then(
        () => {
          opts.storage.removeItem(LOCAL_PREFIX + rec.id);
          opts.onStatus({ kind: 'saved', at: new Date() });
        },
        () => {
          opts.storage.setItem(LOCAL_PREFIX + rec.id, JSON.stringify(rec));
          opts.onStatus({ kind: 'offline' });
          if (!pending) pending = rec; // retry unless something newer is already waiting
          if (!stopped) arm(opts.retryMs);
        },
      )
      .finally(() => {
        inflight = null;
      });
    await inflight;
  }

  return {
    schedule(rec) {
      if (stopped) return;
      pending = rec;
      arm(opts.delayMs);
    },
    flushNow,
    persistLocal() {
      if (pending) opts.storage.setItem(LOCAL_PREFIX + pending.id, JSON.stringify(pending));
    },
    async stop() {
      stopped = true;
      clear();
      pending = null;
      while (inflight) await inflight;
    },
    resume() {
      stopped = false;
    },
    forget(id) {
      opts.storage.removeItem(LOCAL_PREFIX + id);
    },
  };
}

/** On app start: send drafts that were kept on this device while offline. Returns how many were sent. */
export async function pushLocalDrafts(storage: Store, save: (rec: DraftRecord) => Promise<void>): Promise<number> {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(LOCAL_PREFIX)) keys.push(k);
  }
  let sent = 0;
  for (const k of keys) {
    const raw = storage.getItem(k);
    if (!raw) continue;
    try {
      await save(JSON.parse(raw) as DraftRecord);
      storage.removeItem(k);
      sent++;
    } catch {
      // still offline; try again on the next start
    }
  }
  return sent;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/draftSync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/draftSync.ts src/lib/draftSync.test.ts
git commit -m "feat: add draft autosave controller with offline device copies"
```

---

### Task 13: Invoice editor and the New Invoice page

**Files:**
- Create: `src/components/CompanyPicker.tsx`, `src/components/ItemCard.tsx`, `src/components/ChargeRow.tsx`, `src/components/TotalsPanel.tsx`, `src/components/InvoiceEditor.tsx`, `src/pages/InvoiceForm.tsx`
- Modify: `src/router.tsx` (add `/invoices/new`)
- Test: `tests/e2e/invoice-create.spec.ts`

**Interfaces:**
- Consumes:
  - Task 11: everything in `invoiceForm.ts`
  - Task 12: `createAutosaver`, `AutosaveStatus`
  - Task 8:
    - `nextSerial`, `saveInvoice`, `upsertDraft`, `deleteDraft`, `getSeller`, `getInvoice`, `getDraft`, `loadMasters`
    - `describeError`, `loadErrorMessage`
    - `PAYMENT_TERMS`, `TRANSPORT_MODES`, `UNITS`
  - Task 10: `CompanyForm`, `ItemForm`, `SelectWithOther`, `StateSelect`
  - Task 4: `fmtMoney`, `fmtRate`, `fmtSigned`
  - Task 3: `amountInWords`, `fmtClock`, `fmtDateTime`
- Produces:
  - `InvoiceEditor({ initial: InvoiceForm; masters: Masters })`
  - `InvoiceFormPage` (handles `/invoices/new`, `/invoices/new?draft=<id>`, `/invoices/:id/edit`, `/invoices/:id/edit?resume=1`; Tasks 14 and 15 only add routes)
  - `TotalsPanel({ totals, sameState, mode: 'bottom' | 'side' | 'static', action? })` (reused by the invoice view in Task 14)
  - **Test ids:** `item-card`, `charge-row`, `grand-total`, `amount-words`, `draft-status`
  - **Field labels:**
    - Header: `Invoice date`, `Invoice number`, `Company`, `Billing address`, `GSTIN`, `Buyer state`, `Shipping address same as billing`, `Shipping address`, `Place of supply`, `Payment terms`, `Mode of transport`, `Vehicle number (optional)`
    - Inside each item card: `Item`, `Description`, `HSN code`, `Quantity`, `Unit`, `Price (before GST)`, `GST rate (%)`
    - Inside each charge row: `Charge type`, `Amount (before GST)`, `GST rate (%)`
  - **Buttons:** `+ Add new company`, `+ New item`, `+ Add item`, `+ Add charge`, `Remove`, `Save`
  - **Success heading:** `Invoice <number> saved`

- [ ] **Step 1: Write the failing e2e test** `tests/e2e/invoice-create.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { login, pickOption } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('creates an invoice with two items and a charge', async ({ page }) => {
  await page.getByRole('link', { name: 'New Invoice' }).first().click();
  await expect(page.getByRole('heading', { name: 'New invoice', level: 1 })).toBeVisible();
  await pickOption(page, 'Company', 'Patel', /Patel Hardware Mart/);
  await expect(page.getByText('CGST + SGST (same state)')).toBeVisible();

  const first = page.getByTestId('item-card').nth(0);
  await pickOption(first, 'Item', 'MS Pipe', /MS Pipe 1 inch/);
  await first.getByLabel('Quantity').fill('2');
  await expect(first.getByText('₹240.00')).toBeVisible();

  await page.getByRole('button', { name: '+ Add item' }).click();
  const second = page.getByTestId('item-card').nth(1);
  await pickOption(second, 'Item', 'Turmeric', /Turmeric Powder/);
  await second.getByLabel('Quantity').fill('1.5');

  await page.getByRole('button', { name: '+ Add charge' }).click();
  const charge = page.getByTestId('charge-row').nth(0);
  await pickOption(charge, 'Charge type', 'Freight', /Freight/);
  await charge.getByLabel('Amount (before GST)').fill('100');

  // 480 items + 100 freight; GST 43.20 + 12.00 + 18.00 = 73.20; 653.20 rounds to 653
  await expect(page.getByTestId('grand-total')).toHaveText('₹653.00');
  await expect(page.getByTestId('amount-words')).toHaveText('Rupees Six Hundred Fifty-Three Only');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Invoice \d{4}-\d{2}\/\d{3,} saved$/ })).toBeVisible();
});

test('explains what is missing instead of saving', async ({ page }) => {
  await page.goto('/invoices/new');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Please choose a company.')).toBeVisible();
  await expect(page.getByText('Please choose an item.')).toBeVisible();
});

test('uses IGST for a buyer in another state', async ({ page }) => {
  await page.goto('/invoices/new');
  await pickOption(page, 'Company', '27AABCA2222E1ZD', /Maharashtra/);
  await expect(page.getByText('IGST (other state)')).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/invoice-create.spec.ts --project=desktop`
Expected: FAIL. `/invoices/new` redirects to Home, so there is no "New invoice" heading.

- [ ] **Step 3: Write the building blocks**

`src/components/CompanyPicker.tsx`:

```tsx
import { Button, Select, Stack } from '@mantine/core';
import { stateName } from '../lib/gstin';
import { withCurrentOption } from '../lib/invoiceForm';
import type { Company } from '../lib/types';

interface Props {
  companies: Company[];
  value: string | null;
  currentName: string;
  error?: string;
  onPick: (c: Company) => void;
  onAddNew: () => void;
}

/** Name · GSTIN · state, so look-alike names are easy to tell apart. */
export function CompanyPicker({ companies, value, currentName, error, onPick, onAddNew }: Props) {
  const data = withCurrentOption(
    companies.map((c) => ({ value: c.id, label: `${c.name} · ${c.gstin ?? 'No GSTIN'} · ${stateName(c.state_code)}` })),
    value,
    currentName,
  );
  return (
    <Stack gap="xs">
      <Select
        label="Company"
        placeholder="Type to search"
        searchable
        nothingFoundMessage="No company matches. Use “+ Add new company”."
        data={data}
        value={value}
        error={error}
        onChange={(id) => {
          const c = companies.find((x) => x.id === id);
          if (c) onPick(c);
        }}
      />
      <Button variant="light" onClick={onAddNew}>
        + Add new company
      </Button>
    </Stack>
  );
}
```

`src/components/ItemCard.tsx`:

```tsx
import { Button, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { applyItem, withCurrentOption, type FormErrors, type LineForm } from '../lib/invoiceForm';
import { fmtMoney, type Row } from '../lib/invoiceMath';
import { UNITS } from '../lib/options';
import type { Item } from '../lib/types';
import { SelectWithOther } from './SelectWithOther';

interface Props {
  index: number;
  line: LineForm;
  items: Item[];
  row: Row;
  errors: FormErrors;
  onChange: (line: LineForm) => void;
  onRemove: () => void;
  onAddNewItem: () => void;
}

export function ItemCard({ index, line, items, row, errors, onChange, onRemove, onAddNewItem }: Props) {
  const data = withCurrentOption(
    items.map((i) => ({ value: i.id, label: `${i.name} · HSN ${i.hsn}` })),
    line.itemId,
    line.itemName,
  );
  const err = (field: string) => errors[`lines.${index}.${field}`];
  const set = (patch: Partial<LineForm>) => onChange({ ...line, ...patch });

  return (
    <Paper withBorder p="md" data-testid="item-card">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700} size="lg">
            Item {index + 1}
          </Text>
          <Button variant="subtle" color="red" leftSection={<IconTrash aria-hidden />} onClick={onRemove}>
            Remove
          </Button>
        </Group>
        <Select
          label="Item"
          placeholder="Type to search"
          searchable
          nothingFoundMessage="No item matches. Use “+ New item”."
          data={data}
          value={line.itemId}
          error={err('item')}
          onChange={(id) => {
            const it = items.find((x) => x.id === id);
            if (it) onChange(applyItem(line, it));
          }}
        />
        <Button variant="light" onClick={onAddNewItem}>
          + New item
        </Button>
        <TextInput label="Description" value={line.description} onChange={(e) => set({ description: e.currentTarget.value })} />
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <TextInput label="HSN code" inputMode="numeric" value={line.hsn} onChange={(e) => set({ hsn: e.currentTarget.value.trim() })} error={err('hsn')} />
          <TextInput label="Quantity" inputMode="decimal" value={line.qty} onChange={(e) => set({ qty: e.currentTarget.value })} error={err('qty')} />
          <SelectWithOther label="Unit" options={UNITS} value={line.unit} onChange={(unit) => set({ unit })} error={err('unit')} />
          <TextInput
            label="Price (before GST)"
            inputMode="decimal"
            leftSection="₹"
            value={line.price}
            onChange={(e) => set({ price: e.currentTarget.value })}
            error={err('price')}
          />
          <TextInput label="GST rate (%)" inputMode="decimal" value={line.gstRate} onChange={(e) => set({ gstRate: e.currentTarget.value })} error={err('gstRate')} />
        </SimpleGrid>
        <Group justify="space-between" bg="gray.0" p="sm" style={{ borderRadius: 8 }}>
          <Text>
            Amount <b>{fmtMoney(row.amount)}</b>
          </Text>
          <Text>
            GST <b>{fmtMoney(row.gstAmount)}</b>
          </Text>
        </Group>
      </Stack>
    </Paper>
  );
}
```

`src/components/ChargeRow.tsx`:

```tsx
import { Button, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { applyChargeType, withCurrentOption, type ChargeForm, type FormErrors } from '../lib/invoiceForm';
import { fmtMoney, fmtRate, type Row } from '../lib/invoiceMath';
import type { ChargeType } from '../lib/types';

interface Props {
  index: number;
  charge: ChargeForm;
  chargeTypes: ChargeType[];
  row: Row;
  errors: FormErrors;
  onChange: (charge: ChargeForm) => void;
  onRemove: () => void;
}

export function ChargeRow({ index, charge, chargeTypes, row, errors, onChange, onRemove }: Props) {
  const data = withCurrentOption(
    chargeTypes.map((t) => ({ value: t.id, label: `${t.name} · GST ${fmtRate(t.gst_rate)}` })),
    charge.chargeTypeId,
    charge.name,
  );
  const err = (field: string) => errors[`charges.${index}.${field}`];
  const set = (patch: Partial<ChargeForm>) => onChange({ ...charge, ...patch });

  return (
    <Paper withBorder p="md" data-testid="charge-row">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700} size="lg">
            Charge {index + 1}
          </Text>
          <Button variant="subtle" color="red" leftSection={<IconTrash aria-hidden />} onClick={onRemove}>
            Remove
          </Button>
        </Group>
        <Select
          label="Charge type"
          placeholder="Type to search"
          searchable
          data={data}
          value={charge.chargeTypeId}
          error={err('type')}
          onChange={(id) => {
            const t = chargeTypes.find((x) => x.id === id);
            if (t) onChange(applyChargeType(charge, t));
          }}
        />
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <TextInput
            label="Amount (before GST)"
            inputMode="decimal"
            leftSection="₹"
            value={charge.amount}
            onChange={(e) => set({ amount: e.currentTarget.value })}
            error={err('amount')}
          />
          <TextInput label="GST rate (%)" inputMode="decimal" value={charge.gstRate} onChange={(e) => set({ gstRate: e.currentTarget.value })} error={err('gstRate')} />
        </SimpleGrid>
        <Text>
          GST <b>{fmtMoney(row.gstAmount)}</b>
        </Text>
      </Stack>
    </Paper>
  );
}
```

`src/components/TotalsPanel.tsx`:

```tsx
import { Button, Collapse, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { Fragment, useState, type ReactNode } from 'react';
import { fmtMoney, fmtRate, fmtSigned, type Totals } from '../lib/invoiceMath';
import { amountInWords } from '../lib/words';

interface Props {
  totals: Totals;
  sameState: boolean;
  /** bottom: phone (sticky above the nav bar, details collapsible); side: desktop column; static: invoice view */
  mode: 'bottom' | 'side' | 'static';
  action?: ReactNode;
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Text fw={strong ? 700 : 400}>{label}</Text>
      <Text fw={strong ? 700 : 500} style={{ whiteSpace: 'nowrap' }}>
        {value}
      </Text>
    </Group>
  );
}

export function TotalsPanel({ totals, sameState, mode, action }: Props) {
  const [open, setOpen] = useState(false);

  const details = (
    <Stack gap={6}>
      <Line label="Items total" value={fmtMoney(totals.itemsTotal)} />
      <Line label="Charges total" value={fmtMoney(totals.chargesTotal)} />
      <Line label="Taxable value" value={fmtMoney(totals.taxableTotal)} strong />
      {totals.byRate.map((g) =>
        sameState ? (
          <Fragment key={g.rate.toFixed()}>
            <Line label={`CGST ${fmtRate(g.rate.dividedBy(2))} on ${fmtMoney(g.taxable)}`} value={fmtMoney(g.gst.dividedBy(2))} />
            <Line label={`SGST ${fmtRate(g.rate.dividedBy(2))} on ${fmtMoney(g.taxable)}`} value={fmtMoney(g.gst.dividedBy(2))} />
          </Fragment>
        ) : (
          <Line key={g.rate.toFixed()} label={`IGST ${fmtRate(g.rate)} on ${fmtMoney(g.taxable)}`} value={fmtMoney(g.gst)} />
        ),
      )}
      <Line label="Round off" value={fmtSigned(totals.roundOff)} />
    </Stack>
  );

  const grand = (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap">
        <Text size="xl" fw={700}>
          Grand Total
        </Text>
        <Text size="xl" fw={800} data-testid="grand-total">
          {fmtMoney(totals.grandTotal)}
        </Text>
      </Group>
      <Text fs="italic" data-testid="amount-words">
        {amountInWords(totals.grandTotal.toFixed(0))}
      </Text>
    </Stack>
  );

  if (mode === 'bottom') {
    return (
      <Paper
        withBorder
        shadow="lg"
        p="md"
        style={{ position: 'sticky', bottom: 'calc(var(--app-shell-footer-offset, 0rem) + 0.5rem)', zIndex: 10 }}
      >
        <Stack gap="sm">
          <Collapse in={open}>
            {details}
            <Divider my="sm" />
          </Collapse>
          {grand}
          <Button variant="subtle" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide details' : 'Show details'}
          </Button>
          {action}
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper
      withBorder
      shadow={mode === 'side' ? 'md' : undefined}
      p="md"
      style={mode === 'side' ? { position: 'sticky', top: 'calc(var(--app-shell-header-offset, 0rem) + 1rem)' } : undefined}
    >
      <Stack gap="sm">
        {mode === 'side' && <Title order={2}>Totals</Title>}
        {details}
        <Divider />
        {grand}
        {action}
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 4: Write the editor** `src/components/InvoiceEditor.tsx`

Every `onChange` reads `e.currentTarget.value` *before* calling the functional state updater, because `currentTarget` is null once the handler returns.

```tsx
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
```

- [ ] **Step 5: Write the page** `src/pages/InvoiceForm.tsx`

This is the final version: it already handles editing and resuming drafts, so Tasks 14 and 15 only add routes.

```tsx
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
```

- [ ] **Step 6: Add the route**

In `src/router.tsx`:
- Add `import { InvoiceFormPage } from './pages/InvoiceForm';`
- Add `{ path: '/invoices/new', element: <InvoiceFormPage /> },` after the `'/'` route.

- [ ] **Step 7: Run the tests**

Run: `npx playwright test tests/e2e/invoice-create.spec.ts`
Expected: PASS on desktop and phone.

Run: `npm test && npm run build`
Expected: unit tests pass; the build has no type errors.

- [ ] **Step 8: Commit**

```bash
git add src tests/e2e
git commit -m "feat: add invoice editor with live totals, autosave and save flow"
```

---

### Task 14: Invoice list, invoice view, edit and delete

**Files:**
- Create: `src/pages/InvoiceList.tsx`, `src/pages/InvoiceView.tsx`
- Modify: `src/router.tsx` (add `/invoices`, `/invoices/:id`, `/invoices/:id/edit`)
- Modify: `tests/e2e/helpers.ts` (accept browser dialogs in `login`; add `createInvoice`)
- Test: `tests/e2e/invoice-manage.spec.ts`

**Interfaces:**
- Consumes:
  - `listInvoices`, `PAGE_SIZE`, `getInvoice`, `invoiceHistory`, `deleteInvoice` (Task 8)
  - `TotalsPanel` (Task 13)
  - `computeTotals`, `fmtMoney`, `fmtRate`, `plain` (Task 4)
  - `fmtDate`, `fmtDateTime` (Task 3)
  - `parseSerial` (Task 1)
  - `stateName` (Task 2)
  - `InvoiceFormPage` (Task 13)
- Produces:
  - **Pages:** `InvoiceList` (heading `Invoices`, search label `Search by number or company`, test id `invoice-row`) and `InvoiceView` (heading `Invoice <number>`; buttons `Edit` (link) and `Delete`; history text `Created … · Edited …`)
  - **e2e helper:** `createInvoice(page, { companySearch, company, itemSearch, item, qty }): Promise<string>` (returns the invoice number)

- [ ] **Step 1: Extend `tests/e2e/helpers.ts`**

In `login`, add this as the first line of the function body. It accepts the browser's "Leave site?" prompt, so `page.goto` never hangs on a dirty form.

```ts
  page.on('dialog', (d) => void d.accept());
```

Append:

```ts
export async function createInvoice(
  page: Page,
  opts: { companySearch: string; company: RegExp; itemSearch: string; item: RegExp; qty: string },
): Promise<string> {
  await page.goto('/invoices/new');
  await pickOption(page, 'Company', opts.companySearch, opts.company);
  const card = page.getByTestId('item-card').nth(0);
  await pickOption(card, 'Item', opts.itemSearch, opts.item);
  await card.getByLabel('Quantity').fill(opts.qty);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const heading = page.getByRole('heading', { name: /^Invoice .+ saved$/ });
  await expect(heading).toBeVisible();
  return ((await heading.textContent()) ?? '').replace(/^Invoice /, '').replace(/ saved$/, '');
}
```

- [ ] **Step 2: Write the failing e2e test** `tests/e2e/invoice-manage.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { createInvoice, login } from './helpers';

test('finds, edits and deletes an invoice', async ({ page }) => {
  await login(page);
  const no = await createInvoice(page, { companySearch: 'Mehta', company: /Mehta Engineering Works/, itemSearch: 'Cement', item: /Cement Bag 50 kg/, qty: '3' });
  const serial = String(Number(no.split('/')[1]));

  await page.goto('/invoices');
  await page.getByLabel('Search by number or company').fill(no);
  const row = page.getByTestId('invoice-row').filter({ hasText: no });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page.getByRole('heading', { name: `Invoice ${no}`, level: 1 })).toBeVisible();
  await expect(page.getByText(/^Created \d{2}-[A-Z][a-z]{2}-\d{4} \d{2}:\d{2}$/)).toBeVisible();

  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByLabel('Invoice number')).toHaveValue(no.split('/')[1]);
  await page.getByTestId('item-card').nth(0).getByLabel('Quantity').fill('4');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Invoice ${no} saved` })).toBeVisible();
  await page.getByRole('link', { name: 'View' }).click();
  await expect(page.getByText(/^Created .+ · Edited .+$/)).toBeVisible();
  await expect(page.getByText('4 Nos')).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(`Type ${serial} to confirm`).fill(String(Number(serial) + 1));
  await expect(dialog.getByRole('button', { name: 'Delete' })).toBeDisabled();
  await dialog.getByLabel(`Type ${serial} to confirm`).fill(serial);
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible();
  await page.getByLabel('Search by number or company').fill(no);
  await expect(page.getByText('No invoice matches your search.')).toBeVisible();
});

test('search copes with commas and percent signs', async ({ page }) => {
  await login(page);
  await page.goto('/invoices');
  await page.getByLabel('Search by number or company').fill('ABC, 50%_');
  await expect(page.getByText('No invoice matches your search.')).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx playwright test tests/e2e/invoice-manage.spec.ts --project=desktop`
Expected: FAIL. `/invoices` redirects to Home.

- [ ] **Step 4: Write** `src/pages/InvoiceList.tsx`

```tsx
import { Alert, Button, Card, Center, Group, Loader, Stack, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { listInvoices, PAGE_SIZE } from '../lib/db';
import { loadErrorMessage } from '../lib/errors';
import { fmtDate } from '../lib/format';
import { fmtMoney } from '../lib/invoiceMath';
import type { InvoiceListRow } from '../lib/types';

export function InvoiceList() {
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const [query, setQuery] = useState({ q: '', page: 0 });
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuery({ q: debounced, page: 0 });
  }, [debounced]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    listInvoices(query.q, query.page)
      .then(
        (r) => {
          if (!alive) return;
          setRows((prev) => (query.page === 0 ? r : [...prev, ...r]));
          setHasMore(r.length === PAGE_SIZE);
        },
        (e: unknown) => alive && setError(loadErrorMessage(e)),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [query]);

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={1}>Invoices</Title>
      </Group>
      <TextInput
        label="Search by number or company"
        leftSection={<IconSearch size={20} aria-hidden />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />
      {error && <Alert color="red">{error}</Alert>}
      {rows.map((r) => (
        <Card
          key={r.id}
          withBorder
          padding="md"
          component={Link}
          to={`/invoices/${r.id}`}
          data-testid="invoice-row"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <Group justify="space-between" wrap="nowrap">
            <Text fw={800} size="lg">
              {r.invoice_no}
            </Text>
            <Text fw={700} size="lg">
              {fmtMoney(r.grand_total)}
            </Text>
          </Group>
          <Text>{r.buyer_name}</Text>
          <Text c="gray.7">{fmtDate(r.invoice_date)}</Text>
        </Card>
      ))}
      {loading && (
        <Center py="md">
          <Loader />
        </Center>
      )}
      {!loading && !error && rows.length === 0 && (
        <Stack align="center">
          <Text>{query.q ? 'No invoice matches your search.' : 'No invoices yet.'}</Text>
          <Button component={Link} to="/invoices/new">
            New Invoice
          </Button>
        </Stack>
      )}
      {!loading && hasMore && (
        <Button variant="light" onClick={() => setQuery((s) => ({ ...s, page: s.page + 1 }))}>
          Show more
        </Button>
      )}
    </Stack>
  );
}
```

- [ ] **Step 5: Write** `src/pages/InvoiceView.tsx`

```tsx
import { Alert, Button, Center, Group, Loader, Modal, Paper, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { TotalsPanel } from '../components/TotalsPanel';
import { deleteInvoice, getInvoice, invoiceHistory } from '../lib/db';
import { describeError, loadErrorMessage } from '../lib/errors';
import { fmtDate, fmtDateTime } from '../lib/format';
import { parseSerial } from '../lib/fy';
import { stateName } from '../lib/gstin';
import { computeTotals, fmtMoney, fmtRate, plain } from '../lib/invoiceMath';
import type { AuditRow, InvoiceFull } from '../lib/types';

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text fw={700}>{label}</Text>
      <Text style={{ whiteSpace: 'pre-line' }}>{value}</Text>
    </div>
  );
}

export function InvoiceView() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [inv, setInv] = useState<InvoiceFull | null | undefined>(undefined);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([getInvoice(id), invoiceHistory(id)]).then(
      ([i, h]) => {
        if (!alive) return;
        setInv(i);
        setHistory(h);
      },
      (e: unknown) => alive && setError(loadErrorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) return <Alert color="red" title="Could not load">{error}</Alert>;
  if (inv === undefined) {
    return (
      <Center py="xl">
        <Loader size="xl" />
      </Center>
    );
  }
  if (inv === null) {
    return (
      <Stack>
        <Alert color="yellow">This invoice no longer exists.</Alert>
        <Button component={Link} to="/invoices">
          Back to invoices
        </Button>
      </Stack>
    );
  }

  const sameState = inv.tax_type === 'CGST_SGST';
  const totals = computeTotals(
    inv.invoice_lines.map((l) => ({ qty: l.qty, price: l.price, gstRate: l.gst_rate })),
    inv.invoice_charges.map((c) => ({ amount: c.amount, gstRate: c.gst_rate })),
    sameState,
  );
  // An id reused after "save as new" keeps older entries; show only the current life of the invoice.
  const lastDelete = history.map((h) => h.action).lastIndexOf('DELETE');
  const historyText = history
    .slice(lastDelete + 1)
    .map((h) => `${h.action === 'INSERT' ? 'Created' : 'Edited'} ${fmtDateTime(h.at)}`)
    .join(' · ');
  const confirmMatches = typed.trim() === inv.invoice_no || parseSerial(typed) === inv.serial;

  async function remove() {
    if (!inv) return;
    setBusy(true);
    try {
      const no = await deleteInvoice(inv.id, typed);
      notifications.show({ color: 'green', message: `Invoice ${no} deleted.` });
      navigate('/invoices');
    } catch (e) {
      notifications.show({ color: 'red', title: 'Not deleted', message: describeError(e).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack>
      <Title order={1}>Invoice {inv.invoice_no}</Title>
      <Group>
        <Button component={Link} to={`/invoices/${inv.id}/edit`} leftSection={<IconPencil aria-hidden />}>
          Edit
        </Button>
        <Button variant="outline" color="red" leftSection={<IconTrash aria-hidden />} onClick={() => setDeleting(true)}>
          Delete
        </Button>
      </Group>

      <Paper withBorder p="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Info label="Invoice date" value={fmtDate(inv.invoice_date)} />
          <Info label="Buyer" value={inv.buyer_name} />
          <Info label="Billing address" value={inv.buyer_address} />
          <Info label="Shipping address" value={inv.ship_same ? 'Same as billing' : inv.ship_address} />
          <Info label="Buyer GSTIN" value={inv.buyer_gstin ?? 'Not registered'} />
          <Info label="Buyer state" value={stateName(inv.buyer_state_code)} />
          <Info label="Place of supply" value={`${stateName(inv.place_of_supply)} · ${sameState ? 'CGST + SGST' : 'IGST'}`} />
          <Info label="Payment terms" value={inv.payment_terms} />
          <Info label="Transport" value={inv.vehicle_no ? `${inv.transport_mode} · ${inv.vehicle_no}` : inv.transport_mode} />
          <Info label="Seller" value={`${inv.seller_name}\n${inv.seller_gstin}`} />
        </SimpleGrid>
      </Paper>

      <Paper withBorder p="md">
        <Title order={2} mb="sm">
          Items
        </Title>
        <Table.ScrollContainer minWidth={760}>
          <Table striped withTableBorder fz="lg">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>Item</Table.Th>
                <Table.Th>HSN</Table.Th>
                <Table.Th>Qty</Table.Th>
                <Table.Th>Price</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>GST</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {inv.invoice_lines.map((l, i) => (
                <Table.Tr key={l.id}>
                  <Table.Td>{i + 1}</Table.Td>
                  <Table.Td>
                    <Text fw={600}>{l.item_name}</Text>
                    {l.description && <Text c="gray.7">{l.description}</Text>}
                  </Table.Td>
                  <Table.Td>{l.hsn}</Table.Td>
                  <Table.Td>{`${plain(l.qty)} ${l.unit}`}</Table.Td>
                  <Table.Td>{fmtMoney(l.price)}</Table.Td>
                  <Table.Td>{fmtMoney(totals.lines[i].amount)}</Table.Td>
                  <Table.Td>{fmtRate(l.gst_rate)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      {inv.invoice_charges.length > 0 && (
        <Paper withBorder p="md">
          <Title order={2} mb="sm">
            Charges
          </Title>
          <Table striped withTableBorder fz="lg">
            <Table.Tbody>
              {inv.invoice_charges.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>{c.name}</Table.Td>
                  <Table.Td>{fmtMoney(c.amount)}</Table.Td>
                  <Table.Td>{fmtRate(c.gst_rate)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      <TotalsPanel totals={totals} sameState={sameState} mode="static" />

      <Paper withBorder p="md">
        <Text fw={700}>History</Text>
        <Text>{historyText}</Text>
      </Paper>

      <Modal opened={deleting} onClose={() => setDeleting(false)} title="Delete invoice?">
        <Stack>
          <Text>
            Delete invoice {inv.invoice_no} for {inv.buyer_name} ({fmtMoney(inv.grand_total)})? This cannot be undone.
          </Text>
          <TextInput
            label={`Type ${inv.serial} to confirm`}
            inputMode="numeric"
            value={typed}
            onChange={(e) => setTyped(e.currentTarget.value)}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button color="red" disabled={!confirmMatches || busy} onClick={() => void remove()}>
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
```

- [ ] **Step 6: Add the routes**

In `src/router.tsx`:
- Add imports `import { InvoiceList } from './pages/InvoiceList';` and `import { InvoiceView } from './pages/InvoiceView';`.
- Add these after the `'/invoices/new'` route:

```tsx
      { path: '/invoices', element: <InvoiceList /> },
      { path: '/invoices/:id', element: <InvoiceView /> },
      { path: '/invoices/:id/edit', element: <InvoiceFormPage /> },
```

- [ ] **Step 7: Run the tests**

Run: `npx playwright test tests/e2e/invoice-manage.spec.ts tests/e2e/invoice-create.spec.ts`
Expected: PASS on both projects.

Run: `npm run build`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src tests/e2e
git commit -m "feat: add invoice list with search, read-only view, edit and typed-confirm delete"
```

---

### Task 15: Drafts page, resuming and offline recovery

**Files:**
- Create: `src/pages/Drafts.tsx`
- Modify: `src/router.tsx` (add `/drafts`)
- Modify: `src/components/AppLayout.tsx` (push device copies on start)
- Test: `tests/e2e/drafts.spec.ts`

**Interfaces:**
- Consumes:
  - `listDrafts`, `deleteDraft`, `upsertDraft` (Task 8)
  - `pushLocalDrafts` (Task 12)
  - The resume URLs handled by `InvoiceFormPage` (Task 13)
  - `fmtDateTime` (Task 3)
- Produces:
  - **Drafts page:** heading `Drafts`; test ids `draft-row` and `drafts-loaded`; buttons `Resume` and `Discard`
  - **Resume URLs:**
    - A new invoice resumes at `/invoices/new?draft=<id>`.
    - An edit resumes at `/invoices/<id>/edit?resume=1`.

- [ ] **Step 1: Write the failing e2e test** `tests/e2e/drafts.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { login, pickOption } from './helpers';

test('keeps unfinished work in Drafts and resumes it', async ({ page }) => {
  await login(page);
  await page.goto('/invoices/new');
  await pickOption(page, 'Company', 'Ramesh', /Ramesh Kumar & Sons/);
  await expect(page.getByTestId('draft-status')).toHaveText(/^Draft saved \d{2}:\d{2}$/, { timeout: 10_000 });

  await page.getByRole('link', { name: 'Drafts' }).first().click();
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByRole('heading', { name: 'Drafts', level: 1 })).toBeVisible();

  await page.getByTestId('draft-row').filter({ hasText: 'Ramesh Kumar & Sons' }).first().getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByLabel('Billing address')).toHaveValue(/Johari Bazar/);
  await expect(page.getByText('IGST (other state)')).toBeVisible();
});

test('a saved invoice leaves no draft behind, even with a change queued just before Save', async ({ page }) => {
  await login(page);
  await page.goto('/drafts');
  await expect(page.getByTestId('drafts-loaded')).toBeVisible();
  const before = await page.getByTestId('draft-row').count();

  await page.goto('/invoices/new');
  await pickOption(page, 'Company', 'Patel', /Patel Hardware Mart/);
  const card = page.getByTestId('item-card').nth(0);
  await pickOption(card, 'Item', 'Wooden', /Wooden Pallet/);
  await card.getByLabel('Quantity').fill('1');
  await expect(page.getByTestId('draft-status')).toHaveText(/^Draft saved/, { timeout: 10_000 });
  await card.getByLabel('Quantity').fill('2');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: /saved$/ })).toBeVisible();
  await page.waitForTimeout(4000); // longer than the 3-second autosave delay

  await page.goto('/drafts');
  await expect(page.getByTestId('drafts-loaded')).toBeVisible();
  await expect(page.getByTestId('draft-row')).toHaveCount(before);
});

test('says when there is no internet and catches up afterwards', async ({ page, context }) => {
  await login(page);
  await page.goto('/invoices/new');
  await expect(page.getByRole('heading', { name: 'New invoice', level: 1 })).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel('Vehicle number (optional)').fill('GJ01AB1234');
  await expect(page.getByText('No internet — your work is safe on this screen')).toBeVisible();
  await expect(page.getByTestId('draft-status')).toHaveText('Not saved — no internet', { timeout: 10_000 });
  await context.setOffline(false);
  await expect(page.getByTestId('draft-status')).toHaveText(/^Draft saved/, { timeout: 20_000 });
});

test('discarding a draft removes it', async ({ page }) => {
  await login(page);
  await page.goto('/invoices/new');
  await pickOption(page, 'Company', 'Mehta', /Mehta Engineering Works/);
  await expect(page.getByTestId('draft-status')).toHaveText(/^Draft saved/, { timeout: 10_000 });
  await page.getByRole('link', { name: 'Drafts' }).first().click();
  await page.getByRole('button', { name: 'Leave' }).click();
  const rows = page.getByTestId('draft-row').filter({ hasText: 'Mehta Engineering Works' });
  const count = await rows.count();
  await rows.first().getByRole('button', { name: 'Discard' }).click();
  await page.getByRole('button', { name: 'Discard', exact: true }).last().click();
  await expect(rows).toHaveCount(count - 1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/drafts.spec.ts --project=desktop`
Expected: FAIL. `/drafts` redirects to Home, so there is no "Drafts" heading and no `drafts-loaded`.

- [ ] **Step 3: Write** `src/pages/Drafts.tsx`

```tsx
import { Alert, Button, Card, Center, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { deleteDraft, listDrafts } from '../lib/db';
import { describeError, loadErrorMessage } from '../lib/errors';
import { fmtDateTime } from '../lib/format';
import type { InvoiceForm } from '../lib/invoiceForm';
import type { DraftRow } from '../lib/types';

export function Drafts() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await listDrafts());
    } catch (e) {
      setError(loadErrorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function resume(d: DraftRow) {
    const f = d.data as InvoiceForm;
    navigate(f.mode === 'edit' ? `/invoices/${d.id}/edit?resume=1` : `/invoices/new?draft=${d.id}`);
  }

  function discard(d: DraftRow) {
    modals.openConfirmModal({
      title: 'Discard this draft?',
      children: <Text>“{d.label}” will be removed. This cannot be undone.</Text>,
      labels: { confirm: 'Discard', cancel: 'Keep' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        void (async () => {
          try {
            await deleteDraft(d.id);
            await load();
          } catch (e) {
            notifications.show({ color: 'red', title: 'Not discarded', message: describeError(e).message });
          }
        })(),
    });
  }

  return (
    <Stack>
      <Title order={1}>Drafts</Title>
      {error && (
        <Alert color="red" title="Could not load">
          <Stack>
            {error}
            <Button onClick={() => void load()}>Try again</Button>
          </Stack>
        </Alert>
      )}
      {rows === null && !error && (
        <Center py="xl">
          <Loader />
        </Center>
      )}
      {rows && (
        <Stack data-testid="drafts-loaded">
          {rows.length === 0 && <Text>No drafts. Unfinished invoices appear here automatically.</Text>}
          {rows.map((d) => (
            <Card key={d.id} withBorder padding="md" data-testid="draft-row">
              <Text fw={700} size="lg">
                {d.label}
              </Text>
              <Text c="gray.7">Last saved {fmtDateTime(d.updated_at)}</Text>
              <Group mt="sm">
                <Button onClick={() => resume(d)}>Resume</Button>
                <Button variant="subtle" color="red" onClick={() => discard(d)}>
                  Discard
                </Button>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
```

- [ ] **Step 4: Push device copies on start**

In `src/components/AppLayout.tsx`:
- Add the imports `import { useEffect } from 'react';`, `import { upsertDraft } from '../lib/db';` and `import { pushLocalDrafts } from '../lib/draftSync';`.
- Add this as the first statement inside `AppLayout()` (before `const wide = …`):

```tsx
  // Drafts kept on this device while offline are sent as soon as the app opens again.
  useEffect(() => {
    void pushLocalDrafts(window.localStorage, upsertDraft);
  }, []);
```

- [ ] **Step 5: Add the route**

In `src/router.tsx`:
- Add `import { Drafts } from './pages/Drafts';`
- Add `{ path: '/drafts', element: <Drafts /> },` after the `/invoices/:id/edit` route.

- [ ] **Step 6: Run the tests**

Run: `npx playwright test tests/e2e/drafts.spec.ts`
Expected: PASS on both projects.

Run: `npm test && npm run build`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src tests/e2e
git commit -m "feat: add Drafts page, resume flows and offline draft recovery"
```

---

### Task 16: Excel export

**Files:**
- Create: `src/lib/exportXlsx.ts`, `src/components/ExportButton.tsx`
- Modify: `src/pages/Home.tsx` (Excel tile), `src/pages/InvoiceList.tsx` (header button)
- Test: `src/lib/exportXlsx.test.ts`, `tests/e2e/export.spec.ts`

**Interfaces:**
- Consumes:
  - `fetchAll` (Task 8)
  - `D` (Task 4)
  - `stateName` (Task 2)
  - `todayLocal` (Task 1)
  - `TILE_STYLE` (Task 9)
  - Row types (Task 8)
- Produces:
  - **`exportXlsx.ts`:**
    - `excelDate(iso): number`, `excelDateTimeIst(ts): number`
    - `INVOICE_HEADERS`, `ITEM_HEADERS`, `CHARGE_HEADERS`
    - `interface ExportData { invoices; lines; charges }`
    - `buildWorkbook(X, data): WorkBook`
    - The module is pure: it imports no Supabase client, so it is unit-testable.
  - **`ExportButton({ tile?: boolean })`**, labelled `Download Excel` (shows `Preparing file…` while working)

- [ ] **Step 1: Write the failing unit test** `src/lib/exportXlsx.test.ts`

```ts
import * as X from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildWorkbook, excelDate, excelDateTimeIst } from './exportXlsx';
import type { ExportChargeRow, ExportLineRow, InvoiceRow } from './types';

const base: InvoiceRow = {
  id: 'a', invoice_date: '2026-10-07', fy: '2026-27', serial: 1, invoice_no: '2026-27/001', company_id: null,
  buyer_name: 'Patel Hardware Mart', buyer_address: 'Anand', buyer_gstin: '24AAKFP5678B1Z5', buyer_state_code: '24',
  ship_same: true, ship_address: 'Anand', place_of_supply: '24',
  seller_name: 'S', seller_address: 'A', seller_gstin: '24AAACS1234A1Z8', seller_state_code: '24',
  tax_type: 'CGST_SGST', payment_terms: 'Immediate', transport_mode: 'By Road', vehicle_no: null,
  items_total: 23.91325, charges_total: 0, taxable_total: 23.91325, cgst_total: 2.1521925, sgst_total: 2.1521925, igst_total: 0,
  exact_total: 28.217635, grand_total: 28, round_off: -0.217635,
  created_at: '2026-10-07T04:30:00Z', updated_at: '2026-10-07T04:30:00Z',
};
const later: InvoiceRow = { ...base, id: 'b', serial: 2, invoice_no: '2026-27/002' };
const lastYear: InvoiceRow = { ...base, id: 'c', fy: '2025-26', serial: 9, invoice_no: '2025-26/009', invoice_date: '2026-03-30' };
const line: ExportLineRow = {
  invoice_id: 'a', position: 1, item_name: 'Turmeric Powder', description: 'Ground', hsn: '091030',
  qty: '2.333', unit: 'Kg', price: '10.25', amount: 23.91325, gst_rate: '18.00', gst_amount: 4.304385,
};
const charge: ExportChargeRow = { invoice_id: 'a', position: 1, name: 'Freight', amount: '100.00', gst_rate: '18.00', gst_amount: 18 };

function roundTrip(data: Parameters<typeof buildWorkbook>[1]) {
  return X.read(X.write(buildWorkbook(X, data), { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true });
}

describe('excel dates', () => {
  it('converts ISO dates and IST timestamps to Excel serials', () => {
    expect(excelDate('2026-10-07')).toBe(46302);
    expect(excelDateTimeIst('2026-10-06T10:00:00Z')).toBeCloseTo(46301.6458333, 6);
  });
});

describe('buildWorkbook', () => {
  it('writes real numbers, real dates and text codes', () => {
    const wb = roundTrip({ invoices: [base], lines: [line], charges: [charge] });
    expect(wb.SheetNames).toEqual(['Invoices', 'Items', 'Charges']);
    const inv = wb.Sheets.Invoices;
    expect(inv.A1.v).toBe('Invoice No');
    expect(inv.A2).toMatchObject({ t: 's', v: '2026-27/001' });
    expect(inv.B2).toMatchObject({ t: 'n', v: 46302, z: 'dd-mmm-yyyy' });
    expect(inv.E2).toMatchObject({ t: 's', v: 'Gujarat' });
    expect(inv.L2).toMatchObject({ t: 'n', v: 23.91 });
    expect(inv.S2).toMatchObject({ t: 'n', v: 28 });
    const items = wb.Sheets.Items;
    expect(items.F2).toMatchObject({ t: 's', v: '091030' });
    expect(items.G2).toMatchObject({ t: 'n', v: 2.333 });
    expect(items.J2).toMatchObject({ t: 'n', v: 23.91 });
    expect(items.K2).toMatchObject({ t: 'n', v: 18 });
    expect(wb.Sheets.Charges.D2).toMatchObject({ t: 's', v: 'Freight' });
  });

  it('sorts by year then number and skips rows whose invoice is missing', () => {
    const wb = roundTrip({ invoices: [later, base, lastYear], lines: [{ ...line, invoice_id: 'zzz' }, line], charges: [] });
    const inv = wb.Sheets.Invoices;
    expect([inv.A2.v, inv.A3.v, inv.A4.v]).toEqual(['2025-26/009', '2026-27/001', '2026-27/002']);
    expect(wb.Sheets.Items['!ref']).toBe('A1:L2');
  });

  it('writes header-only sheets when there are no invoices', () => {
    const wb = roundTrip({ invoices: [], lines: [], charges: [] });
    expect(wb.Sheets.Invoices['!ref']).toBe('A1:U1');
    expect(wb.Sheets.Items['!ref']).toBe('A1:L1');
    expect(wb.Sheets.Charges['!ref']).toBe('A1:G1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/exportXlsx.test.ts`
Expected: FAIL (cannot resolve `./exportXlsx`).

- [ ] **Step 3: Implement** `src/lib/exportXlsx.ts`

```ts
import type * as XLSX from 'xlsx';
import { stateName } from './gstin';
import { D } from './invoiceMath';
import type { ExportChargeRow, ExportLineRow, InvoiceRow } from './types';

type Lib = typeof XLSX;
type Cell = XLSX.CellObject;

const MS_PER_DAY = 86_400_000;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const IST_OFFSET_MS = 5.5 * 3_600_000;

/** 'YYYY-MM-DD' -> Excel date serial (no time zone involved). */
export function excelDate(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - EXCEL_EPOCH) / MS_PER_DAY;
}

/** timestamptz -> Excel date-time serial showing India time. */
export function excelDateTimeIst(ts: string): number {
  return (new Date(ts).getTime() + IST_OFFSET_MS - EXCEL_EPOCH) / MS_PER_DAY;
}

const text = (v: string | null | undefined): Cell => ({ t: 's', v: v ?? '' });
const money = (v: number | string): Cell => ({ t: 'n', v: Number(new D(v).toDecimalPlaces(2).toFixed(2)), z: '#,##0.00' });
const num = (v: number | string): Cell => ({ t: 'n', v: Number(v) });
const date = (iso: string): Cell => ({ t: 'n', v: excelDate(iso), z: 'dd-mmm-yyyy' });
const dateTime = (ts: string): Cell => ({ t: 'n', v: excelDateTimeIst(ts), z: 'dd-mmm-yyyy hh:mm' });

export const INVOICE_HEADERS = [
  'Invoice No', 'Date', 'Buyer', 'Buyer GSTIN', 'Buyer State', 'Place of Supply', 'Billing Address', 'Shipping Address',
  'Payment Terms', 'Transport', 'Vehicle No', 'Items Total', 'Charges Total', 'Taxable Value', 'CGST', 'SGST', 'IGST',
  'Round Off', 'Grand Total', 'Created', 'Last Edited',
];
export const ITEM_HEADERS = ['Invoice No', 'Date', 'Buyer', 'Item', 'Description', 'HSN', 'Qty', 'Unit', 'Price', 'Amount', 'GST %', 'GST Amount'];
export const CHARGE_HEADERS = ['Invoice No', 'Date', 'Buyer', 'Charge', 'Amount', 'GST %', 'GST Amount'];

export interface ExportData {
  invoices: InvoiceRow[];
  lines: ExportLineRow[];
  charges: ExportChargeRow[];
}

/** Cells are written one by one so every type and number format is exactly what we chose. */
function sheet(X: Lib, headers: string[], rows: Cell[][]): XLSX.WorkSheet {
  const all = [headers.map((h) => text(h)), ...rows];
  const ws: XLSX.WorkSheet = {};
  all.forEach((row, r) =>
    row.forEach((cell, c) => {
      ws[X.utils.encode_cell({ r, c })] = cell;
    }),
  );
  ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: all.length - 1, c: headers.length - 1 } });
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  return ws;
}

export function buildWorkbook(X: Lib, data: ExportData): XLSX.WorkBook {
  const invoices = [...data.invoices].sort((a, b) => a.fy.localeCompare(b.fy) || a.serial - b.serial);
  const order = new Map(invoices.map((inv, i) => [inv.id, i]));
  const byId = new Map(invoices.map((inv) => [inv.id, inv]));
  // A row whose invoice was saved while the export was running is skipped, never shown without its number.
  const ordered = <T extends { invoice_id: string; position: number }>(rows: T[]) =>
    rows
      .filter((r) => byId.has(r.invoice_id))
      .sort((a, b) => (order.get(a.invoice_id) ?? 0) - (order.get(b.invoice_id) ?? 0) || a.position - b.position);
  const head = (invoiceId: string): Cell[] => {
    const inv = byId.get(invoiceId) as InvoiceRow;
    return [text(inv.invoice_no), date(inv.invoice_date), text(inv.buyer_name)];
  };

  const wb = X.utils.book_new();
  X.utils.book_append_sheet(
    wb,
    sheet(
      X,
      INVOICE_HEADERS,
      invoices.map((i) => [
        text(i.invoice_no), date(i.invoice_date), text(i.buyer_name), text(i.buyer_gstin),
        text(stateName(i.buyer_state_code)), text(stateName(i.place_of_supply)), text(i.buyer_address), text(i.ship_address),
        text(i.payment_terms), text(i.transport_mode), text(i.vehicle_no),
        money(i.items_total), money(i.charges_total), money(i.taxable_total),
        money(i.cgst_total), money(i.sgst_total), money(i.igst_total), money(i.round_off), money(i.grand_total),
        dateTime(i.created_at), dateTime(i.updated_at),
      ]),
    ),
    'Invoices',
  );
  X.utils.book_append_sheet(
    wb,
    sheet(
      X,
      ITEM_HEADERS,
      ordered(data.lines).map((l) => [
        ...head(l.invoice_id), text(l.item_name), text(l.description), text(l.hsn), num(l.qty), text(l.unit),
        money(l.price), money(l.amount), num(l.gst_rate), money(l.gst_amount),
      ]),
    ),
    'Items',
  );
  X.utils.book_append_sheet(
    wb,
    sheet(
      X,
      CHARGE_HEADERS,
      ordered(data.charges).map((c) => [...head(c.invoice_id), text(c.name), money(c.amount), num(c.gst_rate), money(c.gst_amount)]),
    ),
    'Charges',
  );
  return wb;
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run src/lib/exportXlsx.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing e2e test** `tests/e2e/export.spec.ts`

```ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { createInvoice, login } from './helpers';

test('downloads every invoice as one Excel file', async ({ page }) => {
  await login(page);
  const no = await createInvoice(page, { companySearch: 'Patel', company: /Patel Hardware Mart/, itemSearch: 'Corrugated', item: /Corrugated Box/, qty: '10' });

  await page.goto('/invoices');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Excel' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^invoices-\d{4}-\d{2}-\d{2}\.xlsx$/);

  const wb = XLSX.read(readFileSync(await download.path()), { type: 'buffer', cellNF: true });
  expect(wb.SheetNames).toEqual(['Invoices', 'Items', 'Charges']);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Invoices);
  expect(rows.map((r) => r['Invoice No'])).toContain(no);
  expect(wb.Sheets.Invoices.A2.t).toBe('s');
  expect(wb.Sheets.Invoices.B2.z).toBe('dd-mmm-yyyy');
});

test('Home has a Download Excel tile', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('main').getByRole('button', { name: 'Download Excel' })).toBeVisible();
});
```

Run: `npx playwright test tests/e2e/export.spec.ts --project=desktop`
Expected: FAIL. There is no "Download Excel" button yet.

- [ ] **Step 6: Write** `src/components/ExportButton.tsx`

```tsx
import { Button, Paper, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload } from '@tabler/icons-react';
import { useState } from 'react';
import { fetchAll } from '../lib/db';
import { describeError } from '../lib/errors';
import { buildWorkbook } from '../lib/exportXlsx';
import { todayLocal } from '../lib/fy';
import type { ExportChargeRow, ExportLineRow, InvoiceRow } from '../lib/types';
import { TILE_STYLE } from '../theme';

async function exportAllInvoices(): Promise<number> {
  const [X, invoices, lines, charges] = await Promise.all([
    import('xlsx'), // loaded only when needed, keeping the app itself small
    fetchAll<InvoiceRow>('invoices', '*', ['fy', 'serial']),
    fetchAll<ExportLineRow>(
      'invoice_lines',
      'invoice_id, position, item_name, description, hsn, qty::text, unit, price::text, amount, gst_rate::text, gst_amount',
      ['invoice_id', 'position'],
    ),
    fetchAll<ExportChargeRow>('invoice_charges', 'invoice_id, position, name, amount::text, gst_rate::text, gst_amount', [
      'invoice_id',
      'position',
    ]),
  ]);
  X.writeFile(buildWorkbook(X, { invoices, lines, charges }), `invoices-${todayLocal()}.xlsx`);
  return invoices.length;
}

export function ExportButton({ tile = false }: { tile?: boolean }) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const count = await exportAllInvoices();
      if (count === 0) notifications.show({ message: 'No invoices yet — the file has headers only.' });
    } catch (e) {
      const err = describeError(e);
      notifications.show({
        color: 'red',
        title: 'Download failed',
        message: err.code === 'NETWORK' ? "Couldn't download — no internet. Please try again." : err.message,
      });
    } finally {
      setBusy(false);
    }
  }

  const label = busy ? 'Preparing file…' : 'Download Excel';
  if (tile) {
    return (
      <Paper
        component="button"
        type="button"
        withBorder
        radius="md"
        p="lg"
        onClick={() => void run()}
        disabled={busy}
        style={{ ...TILE_STYLE, width: '100%', background: 'var(--mantine-color-white)', cursor: 'pointer', font: 'inherit' }}
      >
        <IconDownload size={44} aria-hidden />
        <Text size="lg" fw={700} ta="center">
          {label}
        </Text>
      </Paper>
    );
  }
  return (
    <Button variant="light" leftSection={<IconDownload aria-hidden />} onClick={() => void run()} disabled={busy}>
      {label}
    </Button>
  );
}
```

- [ ] **Step 7: Place the buttons**

In `src/pages/Home.tsx`:
- Add `import { ExportButton } from '../components/ExportButton';`
- Inside `<SimpleGrid …>`, after the `TILES.map(…)` block, add `<ExportButton tile />`.

In `src/pages/InvoiceList.tsx`:
- Add `import { ExportButton } from '../components/ExportButton';`
- Replace the line `<Title order={1}>Invoices</Title>` with:

```tsx
        <Title order={1}>Invoices</Title>
        <ExportButton />
```

- [ ] **Step 8: Run the tests**

Run: `npx playwright test tests/e2e/export.spec.ts`
Expected: PASS on both projects.

Run: `npm test && npm run build`
Expected: green. The build output shows a separate chunk for `xlsx`.

- [ ] **Step 9: Commit**

```bash
git add src tests/e2e
git commit -m "feat: add Excel export with typed cells and paged fetching"
```

---

### Task 17: Real-data import and go-live reset

**Files:**
- Create: `supabase/migrations/20261008000400_go_live.sql`, `scripts/masters.ts`, `scripts/import-masters.ts`
- Test: `supabase/tests/database/04_go_live.test.sql`, `scripts/masters.test.ts`

**Interfaces:**
- Consumes:
  - `gstinProblem`, `isStateCode`, `normalizeGstin` (Task 2)
  - `parseAmount` (Task 4)
  - `HSN_PATTERN` (Task 8)
- Produces:
  - **SQL:** `go_live_reset(p_companies jsonb, p_items jsonb, p_charge_types jsonb) returns jsonb`. Executable by `service_role` only. In one transaction it empties invoices, lines, charges, drafts, the change log and all master lists, then loads the given rows. The seller row is kept.
  - **`scripts/masters.ts`:** `SHEETS`, `validateMasters(input) → { companies, items, chargeTypes, errors }`
  - **CLI (`npm run import:masters -- …`):**
    - `--template [file]`
    - `<file.xlsx>` (check only)
    - `<file.xlsx> --apply --confirm-wipe` (needs the `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables)
  - **Workbook format:** one sheet per list, with these exact header rows.

| Sheet | Columns |
|---|---|
| Companies | Name, Address, GSTIN, State Code |
| Items | Name, Description, HSN, Unit, GST Rate, Default Price |
| Charges | Name, GST Rate |

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/database/04_go_live.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Something to wipe
select public.save_invoice('{"id":"00000000-0000-0000-0000-0000000000e1","invoice_date":"2026-10-08","serial":null,"company_id":null,"buyer_name":"ABC Traders","buyer_address":"Mumbai","buyer_gstin":"27AABCA2222E1ZD","buyer_state_code":"27","ship_same":true,"ship_address":"Mumbai","place_of_supply":"27","payment_terms":"Immediate","transport_mode":"By Road","vehicle_no":null,"items_total":"200","charges_total":"50","taxable_total":"250","cgst_total":"0","sgst_total":"0","igst_total":"45","exact_total":"295","grand_total":"295","round_off":"0","lines":[{"item_id":null,"item_name":"MS Pipe 1 inch","description":"","hsn":"7306","qty":"2","unit":"Mtr","price":"100","gst_rate":"18","amount":"200","gst_amount":"36"}],"charges":[{"charge_type_id":null,"name":"Freight","amount":"50","gst_rate":"18","gst_amount":"9"}]}'::jsonb, null);
insert into public.drafts (id, label, data) values (gen_random_uuid(), 'x', '{}');

select throws_ok(
  $$ select public.go_live_reset('[{"name":"Bad","address":"X","gstin":"24bad","state_code":"24"}]', '[]', '[]') $$,
  '23514', null, 'invalid data is refused');
select is((select count(*)::int from public.invoices), 1, 'nothing wiped after a refused import');
select is((select count(*)::int from public.companies), 5, 'companies untouched after a refused import');

select is(
  public.go_live_reset(
    '[{"name":"Real Buyer","address":"Vadodara","gstin":"24AABCA1111D1ZR","state_code":"24"},{"name":"Cash Buyer","address":"Jaipur","gstin":null,"state_code":"08"}]',
    '[{"name":"Real Item","description":"","hsn":"091030","unit":"Kg","gst_rate":"5","default_price":null}]',
    '[{"name":"Freight","gst_rate":"18"}]'),
  '{"companies": 2, "items": 1, "charge_types": 1}'::jsonb,
  'reports what was loaded');
select is((select count(*)::int from public.invoices), 0, 'invoices wiped');
select is((select count(*)::int from public.invoice_lines), 0, 'lines wiped');
select is((select count(*)::int from public.drafts), 0, 'drafts wiped');
select is((select count(*)::int from public.companies), 2, 'companies replaced');
select is((select hsn from public.items), '091030', 'HSN leading zero kept');
select is((select count(*)::int from public.audit_log), 4, 'log restarts with only the loaded rows');
select is((select name from public.seller), 'Shree Demo Industries', 'our company details are kept');

set local role authenticated;
select throws_ok($$ select public.go_live_reset('[]', '[]', '[]') $$, '42501', null, 'the app itself cannot run the reset');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx supabase test db`
Expected: `04_go_live.test.sql` fails (`function public.go_live_reset(unknown, unknown, unknown) does not exist`). The other three files pass.

- [ ] **Step 3: Write the migration** `supabase/migrations/20261008000400_go_live.sql`

```sql
-- Go-live: replace all dummy data with the real master lists, all or nothing.
-- Only the service role (the import script on the owner's machine) may run this.
create function public.go_live_reset(p_companies jsonb, p_items jsonb, p_charge_types jsonb) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  truncate public.invoice_lines, public.invoice_charges, public.invoices, public.drafts, public.audit_log,
           public.companies, public.items, public.charge_types
    restart identity;

  insert into public.companies (name, address, gstin, state_code)
  select btrim(c->>'name'), btrim(c->>'address'), nullif(btrim(c->>'gstin'), ''), c->>'state_code'
  from jsonb_array_elements(p_companies) c;

  insert into public.items (name, description, hsn, unit, gst_rate, default_price)
  select btrim(i->>'name'), coalesce(btrim(i->>'description'), ''), i->>'hsn', btrim(i->>'unit'),
         (i->>'gst_rate')::numeric, nullif(i->>'default_price', '')::numeric
  from jsonb_array_elements(p_items) i;

  insert into public.charge_types (name, gst_rate)
  select btrim(t->>'name'), (t->>'gst_rate')::numeric
  from jsonb_array_elements(p_charge_types) t;

  return jsonb_build_object(
    'companies', jsonb_array_length(p_companies),
    'items', jsonb_array_length(p_items),
    'charge_types', jsonb_array_length(p_charge_types));
end
$$;

-- Supabase grants new functions to anon/authenticated by default; take that back.
revoke execute on function public.go_live_reset(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.go_live_reset(jsonb, jsonb, jsonb) to service_role;
```

- [ ] **Step 4: Apply and run the pgTAP tests**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS for all four files.

- [ ] **Step 5: Write the failing unit test** `scripts/masters.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { validateMasters } from './masters';

const good = {
  companies: [
    { Name: 'Real Buyer', Address: 'Vadodara', GSTIN: '24aabca1111d1zr', 'State Code': '' },
    { Name: 'Cash Buyer', Address: 'Jaipur', GSTIN: '', 'State Code': '8' },
  ],
  items: [{ Name: 'Turmeric', Description: 'Ground', HSN: '091030', Unit: 'Kg', 'GST Rate': '5%', 'Default Price': '1,200.50' }],
  charges: [{ Name: 'Freight', 'GST Rate': '18' }],
};

describe('validateMasters', () => {
  it('cleans a good file', () => {
    const r = validateMasters(good);
    expect(r.errors).toEqual([]);
    expect(r.companies).toEqual([
      { name: 'Real Buyer', address: 'Vadodara', gstin: '24AABCA1111D1ZR', state_code: '24' },
      { name: 'Cash Buyer', address: 'Jaipur', gstin: null, state_code: '08' },
    ]);
    expect(r.items[0]).toEqual({ name: 'Turmeric', description: 'Ground', hsn: '091030', unit: 'Kg', gst_rate: '5', default_price: '1200.50' });
    expect(r.chargeTypes).toEqual([{ name: 'Freight', gst_rate: '18' }]);
  });

  it('reports every problem with its Excel row number', () => {
    const r = validateMasters({
      companies: [
        ...good.companies,
        { Name: 'Real Buyer', Address: 'Elsewhere', GSTIN: '24AABCA1111D1ZR', 'State Code': '' },
        { Name: 'Typo Co', Address: 'X', GSTIN: '24AABCA1111D1ZS', 'State Code': '' },
        { Name: 'Wrong State', Address: 'X', GSTIN: '24AABCA1111D1ZR', 'State Code': '27' },
        { Name: 'No State', Address: 'X', GSTIN: '', 'State Code': '' },
      ],
      items: [
        { Name: 'Lost Zero', HSN: '91030', Unit: 'Kg', 'GST Rate': '5' },
        { Name: 'turmeric', HSN: '0910', Unit: 'Kg', 'GST Rate': '5' },
        { Name: 'Turmeric', HSN: '0910', Unit: '', 'GST Rate': '150' },
      ],
      charges: [{ Name: '', 'GST Rate': '' }],
    });
    expect(r.errors).toEqual(expect.arrayContaining([
      'Companies row 4: Same name and GSTIN as row 2.',
      expect.stringMatching(/^Companies row 5: GSTIN 24AABCA1111D1ZS: The last character does not match/),
      'Companies row 6: State Code 27 does not match the GSTIN, which starts with 24.',
      'Companies row 7: State Code is missing or not a GST state code (for example 24 for Gujarat).',
      expect.stringMatching(/^Items row 2: HSN "91030" must be 4, 6 or 8 digits/),
      'Items row 4: Same name as row 3.',
      'Items row 4: Unit is empty.',
      'Items row 4: GST Rate "150" must be a number from 0 to 100.',
      'Charges row 2: Name is empty.',
      'Charges row 2: GST Rate "" must be a number from 0 to 100.',
    ]));
  });
});
```

Run: `npx vitest run scripts/masters.test.ts`
Expected: FAIL (cannot resolve `./masters`).

- [ ] **Step 6: Implement** `scripts/masters.ts`

```ts
import { gstinProblem, isStateCode, normalizeGstin } from '../src/lib/gstin';
import { parseAmount } from '../src/lib/invoiceMath';
import { HSN_PATTERN } from '../src/lib/options';

export const SHEETS = {
  companies: { name: 'Companies', headers: ['Name', 'Address', 'GSTIN', 'State Code'] },
  items: { name: 'Items', headers: ['Name', 'Description', 'HSN', 'Unit', 'GST Rate', 'Default Price'] },
  charges: { name: 'Charges', headers: ['Name', 'GST Rate'] },
} as const;

export type SheetRow = Record<string, unknown>;
export interface CompanyIn {
  name: string;
  address: string;
  gstin: string | null;
  state_code: string;
}
export interface ItemIn {
  name: string;
  description: string;
  hsn: string;
  unit: string;
  gst_rate: string;
  default_price: string | null;
}
export interface ChargeIn {
  name: string;
  gst_rate: string;
}
export interface MastersResult {
  companies: CompanyIn[];
  items: ItemIn[];
  chargeTypes: ChargeIn[];
  errors: string[];
}

const cell = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());
const nameKey = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ');
const rateOf = (v: unknown): string | null => parseAmount(cell(v).replace(/%$/, ''), 'rate');

/** Checks every row (messages use Excel row numbers: header is row 1). Import nothing unless errors is empty. */
export function validateMasters(input: { companies: SheetRow[]; items: SheetRow[]; charges: SheetRow[] }): MastersResult {
  const errors: string[] = [];
  const problem = (sheet: string, index: number, msg: string) => errors.push(`${sheet} row ${index + 2}: ${msg}`);

  const seenCompanies = new Map<string, number>();
  const companies = input.companies.map((r, i): CompanyIn => {
    const name = cell(r.Name);
    const address = cell(r.Address);
    const gstin = normalizeGstin(cell(r.GSTIN));
    let state = cell(r['State Code']);
    if (state) state = state.padStart(2, '0');
    if (!name) problem('Companies', i, 'Name is empty.');
    if (!address) problem('Companies', i, 'Address is empty.');
    if (gstin) {
      const p = gstinProblem(gstin);
      if (p) problem('Companies', i, `GSTIN ${gstin}: ${p}`);
      else if (state && state !== gstin.slice(0, 2)) {
        problem('Companies', i, `State Code ${state} does not match the GSTIN, which starts with ${gstin.slice(0, 2)}.`);
      } else state = gstin.slice(0, 2);
    }
    if (!isStateCode(state)) problem('Companies', i, 'State Code is missing or not a GST state code (for example 24 for Gujarat).');
    const key = `${nameKey(name)}|${gstin}`;
    const first = seenCompanies.get(key);
    if (first !== undefined) problem('Companies', i, `Same name and GSTIN as row ${first + 2}.`);
    else seenCompanies.set(key, i);
    return { name, address, gstin: gstin || null, state_code: state };
  });

  const seenItems = new Map<string, number>();
  const items = input.items.map((r, i): ItemIn => {
    const name = cell(r.Name);
    const hsn = cell(r.HSN);
    const unit = cell(r.Unit);
    const gst = rateOf(r['GST Rate']);
    const priceText = cell(r['Default Price']).replace(/^₹\s*/, '');
    const price = priceText ? parseAmount(priceText, 'price') : null;
    if (!name) problem('Items', i, 'Name is empty.');
    if (!HSN_PATTERN.test(hsn)) {
      problem('Items', i, `HSN "${hsn}" must be 4, 6 or 8 digits. If it should start with 0, format the HSN column as Text in Excel and type it again.`);
    }
    const first = seenItems.get(nameKey(name));
    if (name && first !== undefined) problem('Items', i, `Same name as row ${first + 2}.`);
    else if (name) seenItems.set(nameKey(name), i);
    if (!unit) problem('Items', i, 'Unit is empty.');
    if (gst === null) problem('Items', i, `GST Rate "${cell(r['GST Rate'])}" must be a number from 0 to 100.`);
    if (priceText && price === null) problem('Items', i, `Default Price "${priceText}" is not a valid amount.`);
    return { name, description: cell(r.Description), hsn, unit, gst_rate: gst ?? '0', default_price: price };
  });

  const seenCharges = new Map<string, number>();
  const chargeTypes = input.charges.map((r, i): ChargeIn => {
    const name = cell(r.Name);
    const gst = rateOf(r['GST Rate']);
    if (!name) problem('Charges', i, 'Name is empty.');
    const first = seenCharges.get(nameKey(name));
    if (name && first !== undefined) problem('Charges', i, `Same name as row ${first + 2}.`);
    else if (name) seenCharges.set(nameKey(name), i);
    if (gst === null) problem('Charges', i, `GST Rate "${cell(r['GST Rate'])}" must be a number from 0 to 100.`);
    return { name, gst_rate: gst ?? '0' };
  });

  return { companies, items, chargeTypes, errors };
}
```

Run: `npx vitest run scripts/masters.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the command-line script** `scripts/import-masters.ts`

```ts
// Usage:
//   npm run import:masters -- --template [masters-template.xlsx]
//   npm run import:masters -- data.xlsx                          (check only, changes nothing)
//   npm run import:masters -- data.xlsx --apply --confirm-wipe   (needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { SHEETS, validateMasters, type SheetRow } from './masters';

const args = process.argv.slice(2);

if (args[0] === '--template') {
  const out = args[1] ?? 'masters-template.xlsx';
  const wb = XLSX.utils.book_new();
  for (const s of Object.values(SHEETS)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...s.headers]]), s.name);
  writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  console.log(`Template written to ${out}. Format the HSN and GSTIN columns as Text before typing.`);
  process.exit(0);
}

const file = args[0];
if (!file) {
  console.error('Usage: npm run import:masters -- <file.xlsx> [--apply --confirm-wipe] | --template [out.xlsx]');
  process.exit(1);
}

const wb = XLSX.read(readFileSync(file), { type: 'buffer' });
function rows(name: string): SheetRow[] {
  const ws = wb.Sheets[name];
  if (!ws) {
    console.error(`The file has no sheet called "${name}".`);
    process.exit(1);
  }
  return XLSX.utils.sheet_to_json<SheetRow>(ws, { raw: false, defval: '' });
}

const result = validateMasters({
  companies: rows(SHEETS.companies.name),
  items: rows(SHEETS.items.name),
  charges: rows(SHEETS.charges.name),
});
console.log(`Checked ${result.companies.length} companies, ${result.items.length} items, ${result.chargeTypes.length} charge types.`);

if (result.errors.length > 0) {
  console.error(`\n${result.errors.length} problem(s) found. Nothing was imported:\n`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
}
if (!args.includes('--apply')) {
  console.log('\nNo problems found. Re-run with --apply --confirm-wipe to replace the data.');
  process.exit(0);
}
if (!args.includes('--confirm-wipe')) {
  console.error('--apply also needs --confirm-wipe: it DELETES all invoices, drafts, the change log and all master lists, then loads this file.');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in this terminal only. Never put the service role key in a file.');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.rpc('go_live_reset', {
  p_companies: result.companies,
  p_items: result.items,
  p_charge_types: result.chargeTypes,
});
if (error) {
  console.error(`Import failed. Nothing was changed: ${error.message}`);
  process.exit(1);
}
console.log('Done. Loaded:', data);
```

- [ ] **Step 8: Try the script against the local stack**

Run: `npm run import:masters -- --template scratch-template.xlsx`
Expected: "Template written to scratch-template.xlsx…".

Run: `npm run import:masters -- scratch-template.xlsx`
Expected: "Checked 0 companies, 0 items, 0 charge types." and "No problems found…". Exit code 0.

Delete `scratch-template.xlsx`. Run `npm test && npm run typecheck`. Expected: green.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20261008000400_go_live.sql supabase/tests/database/04_go_live.test.sql scripts
git commit -m "feat: add validated master-data import and atomic go-live reset"
```

---

### Task 18: Keep-alive, README, full journey test and release check

**Files:**
- Create: `.github/workflows/keep-alive.yml`, `README.md`
- Test: `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - The daily keep-alive workflow (it reads repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`).
  - Owner documentation.
  - The release checklist the controller walks through with the user.

- [ ] **Step 1: Write the full journey test** `tests/e2e/smoke.spec.ts`

```ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { login, pickOption } from './helpers';

test('full journey: create, check, edit, history, export, delete', async ({ page }) => {
  await login(page);
  await page.goto('/invoices/new');
  await pickOption(page, 'Company', 'ABC', /ABC Traders · 24AABCA1111D1ZR/);

  const first = page.getByTestId('item-card').nth(0);
  await pickOption(first, 'Item', 'GI Wire', /GI Wire 12 gauge/);
  await first.getByLabel('Quantity').fill('10');
  await page.getByRole('button', { name: '+ Add item' }).click();
  const second = page.getByTestId('item-card').nth(1);
  await pickOption(second, 'Item', 'Rough', /Rough Diamond/);
  await second.getByLabel('Quantity').fill('1');
  await page.getByRole('button', { name: '+ Add charge' }).click();
  const charge = page.getByTestId('charge-row').nth(0);
  await pickOption(charge, 'Charge type', 'Loading', /Loading/);
  await charge.getByLabel('Amount (before GST)').fill('50');

  // 855.00 @18% = 153.90; 5000 @0.25% = 12.50; 50 @5% = 2.50 → 5905 + 168.90 = 6073.90 → 6074
  await expect(page.getByTestId('grand-total')).toHaveText('₹6,074.00');
  await expect(page.getByTestId('amount-words')).toHaveText('Rupees Six Thousand Seventy-Four Only');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const heading = page.getByRole('heading', { name: /^Invoice .+ saved$/ });
  await expect(heading).toBeVisible();
  const no = ((await heading.textContent()) ?? '').replace(/^Invoice /, '').replace(/ saved$/, '');

  await page.getByRole('link', { name: 'View' }).click();
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByTestId('item-card').nth(0).getByLabel('Quantity').fill('20');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Invoice ${no} saved` })).toBeVisible();
  await page.getByRole('link', { name: 'View' }).click();
  await expect(page.getByText(/^Created .+ · Edited .+$/)).toBeVisible();
  await expect(page.getByTestId('grand-total')).toHaveText('₹7,083.00'); // 1710 + 307.80 + 5000 + 12.50 + 50 + 2.50 = 7082.80

  await page.goto('/invoices');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Excel' }).click()]);
  const wb = XLSX.read(readFileSync(await download.path()), { type: 'buffer' });
  expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Invoices).map((r) => r['Invoice No'])).toContain(no);

  await page.getByLabel('Search by number or company').fill(no);
  await page.getByTestId('invoice-row').filter({ hasText: no }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  const serial = String(Number(no.split('/')[1]));
  await page.getByRole('dialog').getByLabel(`Type ${serial} to confirm`).fill(serial);
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible();
});
```

- [ ] **Step 2: Write** `.github/workflows/keep-alive.yml`

```yaml
# Pings Supabase once a day so the free project is never paused for inactivity.
# Needs repository secrets SUPABASE_URL and SUPABASE_ANON_KEY. Keep the repository private:
# GitHub disables scheduled workflows in public repositories after 60 days without activity.
name: keep-alive
on:
  schedule:
    - cron: '17 3 * * *'
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Call keep_alive()
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: |
          curl --fail --silent --show-error -X POST "$SUPABASE_URL/rest/v1/rpc/keep_alive" \
            -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{}'
```

- [ ] **Step 3: Write** `README.md`

````markdown
# Invoices (GST)

A phone-and-desktop web app for GST invoices: master lists, drafts, a change log and Excel export.
Design: `docs/superpowers/specs/2026-10-08-invoice-app-design.md`. Build plan: `docs/superpowers/plans/2026-10-08-invoice-app.md`.

## Run it on this computer

Needs Node 22.12+ and Docker Desktop (running).

```bash
npm install
npx supabase start        # first run downloads images (several minutes)
npx supabase db reset     # tables + dummy data
npm run env:local         # writes .env.local for the local database
npm run dev               # http://localhost:5173
```

Log in with a user created in the local dashboard (http://localhost:54323 → Authentication), or run the e2e tests once. They create `owner@example.com` / `test-password-123`.

## Tests

```bash
npm test                  # unit tests
npm run test:db           # database tests (pgTAP)
npm run test:int          # 10 simultaneous saves get distinct numbers
npm run test:e2e          # browser tests, phone and desktop (resets the local database first)
npm run build             # type check + production build
```

## Go live (owner steps)

1. Create a Supabase project in the **Mumbai (ap-south-1)** region.
2. Push the database:
   - `npx supabase login`
   - `npx supabase link --project-ref <ref>`
   - `npx supabase db push`
3. In Supabase → Authentication:
   - **Turn off "Allow new users to sign up".**
   - Add the one shared user.
   - Set the Site URL and Redirect URLs to the Vercel address.
4. Create a **private** GitHub repository and push this code.
5. Import the repository in Vercel (framework: Vite). Add the environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
6. In GitHub → Settings → Secrets → Actions, add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (for the daily keep-alive).
7. Load the real data:
   - `npm run import:masters -- --template` gives a blank workbook.
   - Fill it in, then run `npm run import:masters -- real.xlsx` to check it.
   - Then run `npm run import:masters -- real.xlsx --apply --confirm-wipe`. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in that terminal only.
   - **This deletes all invoices, drafts and the change log** and replaces the master lists.
8. Open the app → Settings and enter the real company details.
9. To continue an existing invoice book, type the next number on the first real invoice (for example 48). Suggestions continue from there.

## Good to know

- **Backups are not automatic on the free plan.** Use "Download Excel" regularly and keep the files.
- **Vercel Hobby is for non-commercial use.** Cloudflare Pages is a drop-in alternative.
- **Never put the service role key in the app, in Vercel, or in any file in this repository.**
````

- [ ] **Step 4: Run every check from a clean database**

Run: `npx supabase db reset && npm run test:db`
Expected: all 4 pgTAP files pass.

Run: `npm test && npm run test:int && npm run build`
Expected: all green.

Run: `npm run test:e2e`
Expected: every spec passes on both `desktop` and `phone`.

- [ ] **Step 5: Commit**

```bash
git add .github README.md tests/e2e/smoke.spec.ts
git commit -m "chore: add keep-alive workflow, owner README and full journey test"
```

- [ ] **Step 6: STOP — owner-only release steps**

Report to the controller that the code is complete. Do **not** perform these steps; the controller walks the user through README "Go live" steps 1–6.
- **Steps 1, 3, 4, 5, 6 are (user):** accounts, keys and dashboard settings.
- **Step 2:** the implementer may run `npx supabase db push` only after the user has run `npx supabase login` and given the project ref.

After the deploy:
1. Open the Vercel URL on a phone and on a laptop.
2. Log in.
3. Create, edit and delete one invoice.
4. Download Excel.
5. In Supabase → Authentication, check that "Allow new users to sign up" shows **off**.

Steps 7–9 (real data) happen only when the user supplies the Excel file, and only after the user explicitly confirms the wipe.

---

## Spec Coverage Map

| Spec section | Tasks |
|---|---|
| §2 decisions 1–3 (login, devices, English) | 9 |
| §2 decision 4 (company = buyer, seller in Settings) | 9, 13 |
| §2 decisions 5–6 (master lists, snapshots) | 5, 10 |
| §2 decision 7 (GST split, place of supply) | 4, 11, 13 |
| §2 decisions 8–11 (numbering, editing, suggestion, year change) | 1, 5, 6, 11 |
| §2 decision 12 (charges) | 4, 13 |
| §2 decisions 13–14 (prices, rounding) | 4 |
| §2 decision 15 (any date) | 11 |
| §2 decision 16 (delete) | 6, 14 |
| §2 decision 17 (company uniqueness) | 5, 10 |
| §2 decision 18 (atomic writes) | 6, 8 |
| §2 decision 19 (storage) | 6, 12, 15 |
| §2 decision 20 (keep-alive, no backups) | 18 |
| §4 data model | 5 |
| §5 functions, change log, error codes | 6, 8 |
| §6 security | 7, 17 |
| §7 screens | 9, 10, 13, 14, 15 |
| §8 calculation and validation | 2, 4, 11 |
| §9 drafts, offline, log display | 12, 13, 14, 15 |
| §10 Excel | 8 (`fetchAll`), 16 |
| §12 testing | every task; 7 (concurrency); 18 (journey) |
| §13 deployment | 18 |
| §14 import and go-live | 17 |
| §15 edge cases | 4, 6, 11, 12, 13, 14, 15, 16 |
| §17 Milestone 2 readiness | 5 (snapshot columns) |
