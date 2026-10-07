# GST Invoice App — Milestone 1 Design

- **Date:** 2026-10-08
- **Status:** Design approved in conversation; written spec awaiting review
- **Milestone 2 (separate spec, not built here):** challan image generated from a saved invoice, downloadable and shareable to WhatsApp / Gmail / gallery.

---

## 1. Purpose and success criteria

A small business needs to raise GST tax invoices quickly from a phone or a laptop. The users include elderly people, so the app must be obvious to use, forgiving of mistakes, and must never lose work or produce wrong tax figures.

Milestone 1 delivers:

1. An invoice form (header, items, invoice-level charges, live totals).
2. Saving every invoice to Supabase, viewing, editing and deleting it.
3. Master lists (companies, items, charge types) with add / edit / remove / restore.
4. "Our company" settings (the seller).
5. Drafts and a change log, both stored in Supabase.
6. Export of all invoices to one `.xlsx` file.
7. Dummy data everywhere until the real Excel data is supplied.

Success criteria:

- An elderly user can create an invoice with three items and one charge on a phone without help.
- Two invoices can never share a number within a financial year, even under simultaneous saves.
- Totals match a hand calculation exactly up to the single final round-off.
- No user action can leave a half-saved or half-deleted record.
- A dropped connection or closed tab never loses typed work.
- The exported workbook opens in Excel and Google Sheets with working SUMs and intact leading zeros.

## 2. Decision log

| # | Topic | Decision |
|---|---|---|
| 1 | Access | One shared login (Supabase Auth email + password). Public sign-ups disabled. |
| 2 | Devices | One responsive, mobile-first layout for phone and desktop. |
| 3 | Language | English only. |
| 4 | "Company" | Means the buyer. The seller is always our own company, stored once in Settings. |
| 5 | Master lists | Companies, items, charge types — each with add, edit, remove (soft) and restore screens. |
| 6 | Master edits vs old invoices | Invoices store a copy (snapshot) of all seller, buyer, item and charge details at save time. Editing or removing a master entry never changes saved invoices. |
| 7 | GST split | CGST + SGST when our state equals the place of supply, otherwise IGST. Our state comes from our GSTIN. Place of supply defaults to the buyer's state and can be changed per invoice. |
| 8 | Invoice number | Format `2026-27/001`: Indian financial year (April–March) derived from the invoice date, a forward slash, then a serial padded to 3 digits (`1000` and above print in full). |
| 9 | Number editing | The serial is pre-filled and editable on create and edit. The year prefix always follows the invoice date. Duplicates within a financial year are refused by the database. |
| 10 | Number suggestion | Highest serial used in that financial year + 1. Skipped numbers are only used when typed. |
| 11 | Changing the date across financial years | Allowed. The prefix changes and uniqueness is re-checked. |
| 12 | Extra charges | Invoice-level lines below the items. Each picks a charge type (with its own GST rate) and an amount. Several allowed. |
| 13 | Prices | Entered exclusive of GST. |
| 14 | Rounding | Exact decimal arithmetic throughout. One round-off to the nearest rupee after items, charges and GST are all added. |
| 15 | Dates | Any date (past, present, future) is accepted with no warning. |
| 16 | Deleting invoices | Real delete, after typing the invoice serial to confirm. A full copy is kept in the change log. |
| 17 | Company uniqueness | Two active companies may share a name only if their GSTINs differ. Same name with no GSTIN on both is refused. |
| 18 | Atomicity | Every user action is exactly one database call, executed in one transaction. The client never chains writes. |
| 19 | Storage | Everything — invoices, masters, settings, drafts, change log — lives in Supabase. The only exception is a temporary on-device copy of a draft while Supabase is unreachable. |
| 20 | Free-tier operations | A daily GitHub Action keeps the Supabase project from pausing. No automated backups; the Excel export is the manual backup. |
| 21 | Stack | Vite + React + TypeScript single-page app talking directly to Supabase; business rules enforced in Postgres. Hosted on Vercel Hobby. |
| 22 | Execution | This spec and its plan are written by the planning session; implementation is done by Sonnet subagents at high effort. |

## 3. Architecture

```
Browser (React SPA, Mantine UI)
   |  supabase-js over HTTPS, user JWT
   v
Supabase
   - Auth (one user, sign-ups off)
   - Postgres: tables + constraints + RLS
   - RPC functions: save_invoice, delete_invoice, next_serial, keep_alive
   - Triggers: change log for master tables and seller
Vercel: serves the static build only (no server functions)
GitHub Actions: daily keep_alive ping
```

Why this shape:

- The rules that must never break (unique numbers, all-or-nothing saves, change log, access control) are enforced by Postgres, so a UI bug cannot bypass them.
- No server code means no Vercel function limits or cold starts.
- Live totals are computed in one tested TypeScript module; the database re-checks the arithmetic with constraints.

### Libraries

| Need | Choice | Reason |
|---|---|---|
| UI components | Mantine (core, hooks, notifications, modals) | Accessible type-to-search select, dialogs and toasts in large sizes; avoids hand-built comboboxes. |
| Routing | react-router | Standard; provides navigation blocking for "Leave without saving?". |
| Money arithmetic | decimal.js-light | Exact decimals; JavaScript floats give wrong paise. |
| Excel | SheetJS, installed from `cdn.sheetjs.com` (latest), loaded lazily on export | The npm registry copy is outdated and has known vulnerabilities. |
| Database client | @supabase/supabase-js | Official client. No extra data-fetching library. |
| Date input | Native `<input type="date">` | Uses the phone's own date picker. |
| Tests | Vitest, pgTAP (`npx supabase test db`), Playwright | Unit, database and one end-to-end test. |

## 4. Data model

All money and quantity columns use Postgres `numeric`, which is exact. Columns marked "exact" are unconstrained `numeric` so no digits are lost.

### 4.1 `seller` (exactly one row)

| Column | Type | Rule |
|---|---|---|
| id | smallint PK | default 1, `check (id = 1)` |
| name | text | not blank |
| address | text | not blank |
| gstin | text | valid GSTIN pattern |
| state_code | text | generated: first two characters of `gstin` |
| phone | text | optional |
| updated_at | timestamptz | set on every update |

### 4.2 `companies` (buyers)

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| name | text | not blank |
| address | text | not blank |
| gstin | text, nullable | valid GSTIN pattern when present; stored upper-case without spaces |
| state_code | text | one of the GST state codes; must equal `left(gstin, 2)` when a GSTIN is present |
| archived | boolean | default false |
| created_at, updated_at | timestamptz | |

Unique index on `(normalized name, coalesce(gstin, ''))` where `archived = false`. Normalized name = lower-case, trimmed, inner whitespace collapsed to one space.

### 4.3 `items`

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | |
| name | text | not blank; unique (normalized) among active items |
| description | text | default `''` |
| hsn | text | 4, 6 or 8 digits (`^\d{4}(\d{2}){0,2}$`) |
| unit | text | not blank |
| gst_rate | numeric(5,2) | 0 to 100 |
| default_price | numeric(14,2), nullable | 0 or more |
| archived | boolean | default false |
| created_at, updated_at | timestamptz | |

### 4.4 `charge_types`

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | |
| name | text | not blank; unique (normalized) among active charge types |
| gst_rate | numeric(5,2) | 0 to 100 |
| archived | boolean | default false |
| created_at, updated_at | timestamptz | |

### 4.5 `invoices`

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | generated by the client when the form opens (see §5.1) |
| invoice_date | date | required |
| fy | text | generated: `fy_of(invoice_date)`, e.g. `2026-27` |
| serial | integer | `> 0` and `< 100000000` (keeps `invoice_no` within the 16-character GST limit) |
| invoice_no | text | generated: `fy || '/' || (lpad(serial, 3, '0') if serial < 1000 else serial)`. Plain `lpad` would truncate `1000` to `100`. |
| company_id | uuid, nullable | FK to `companies` (reference only; display uses the snapshot) |
| buyer_name, buyer_address | text | snapshot, not blank |
| buyer_gstin | text, nullable | snapshot |
| buyer_state_code | text | snapshot |
| ship_same | boolean | "shipping same as billing" |
| ship_address | text | always filled; equals `buyer_address` when `ship_same` |
| place_of_supply | text | GST state code |
| seller_name, seller_address, seller_gstin, seller_state_code | text | snapshot copied from `seller` when the invoice is created; unchanged on edit |
| tax_type | text | generated: `CGST_SGST` if `seller_state_code = place_of_supply`, else `IGST` |
| payment_terms | text | not blank |
| transport_mode | text | not blank |
| vehicle_no | text, nullable | upper-case, spaces removed |
| items_total, charges_total, taxable_total | numeric (exact) | `taxable_total = items_total + charges_total` |
| cgst_total, sgst_total, igst_total | numeric (exact) | `CGST_SGST`: `igst_total = 0` and `cgst_total = sgst_total`; `IGST`: `cgst_total = sgst_total = 0` |
| exact_total | numeric (exact) | `taxable_total + cgst_total + sgst_total + igst_total` |
| grand_total | numeric (exact) | `= round(exact_total, 0)` |
| round_off | numeric (exact) | `= grand_total - exact_total` |
| created_at, updated_at | timestamptz | |

Constraints: `unique (fy, serial)`, and every equality above as a `check` constraint.

### 4.6 `invoice_lines`

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | |
| invoice_id | uuid | FK to `invoices`, `on delete cascade` |
| position | smallint | `unique (invoice_id, position)` |
| item_id | uuid, nullable | FK to `items` (reference only) |
| item_name, description, hsn, unit | text | snapshot; HSN rule as in §4.3 |
| qty | numeric(14,3) | `> 0` |
| price | numeric(14,2) | `>= 0` |
| gst_rate | numeric(5,2) | 0 to 100 |
| amount | numeric (exact) | `check (amount = qty * price)` |
| gst_amount | numeric (exact) | `check (gst_amount = amount * gst_rate / 100)` |

### 4.7 `invoice_charges`

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | |
| invoice_id | uuid | FK, `on delete cascade` |
| position | smallint | `unique (invoice_id, position)` |
| charge_type_id | uuid, nullable | FK to `charge_types` (reference only) |
| name | text | snapshot |
| amount | numeric(14,2) | `> 0` |
| gst_rate | numeric(5,2) | 0 to 100 |
| gst_amount | numeric (exact) | `check (gst_amount = amount * gst_rate / 100)` |

### 4.8 `drafts`

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | same value as the invoice id the form is building or editing |
| label | text | buyer name, "No buyer yet", or "Editing 2026-27/012" |
| data | jsonb | full form state |
| updated_at | timestamptz | |

### 4.9 `audit_log` (append-only)

| Column | Type |
|---|---|
| id | bigint identity PK |
| at | timestamptz default `now()` |
| table_name | text |
| row_id | text |
| action | text: `INSERT`, `UPDATE`, `DELETE` |
| old_data | jsonb, nullable |
| new_data | jsonb, nullable |

Index on `(table_name, row_id, at)` for the per-invoice history.

### 4.10 Helper function

`fy_of(d date) returns text`, `immutable`: April or later gives `YYYY-YY` starting that year; January–March gives the previous year. Examples: 2026-04-01 → `2026-27`; 2027-03-31 → `2026-27`; 2027-04-01 → `2027-28`; 2099-04-01 → `2099-00`.

## 5. Database functions and guarantees

All functions are `security definer`, use `set search_path = ''`, and are executable only by `authenticated` (except `keep_alive`).

### 5.1 `save_invoice(p jsonb, p_expected_updated_at timestamptz) returns jsonb`

`p` contains the invoice id, header fields, `serial` (null means "auto"), `lines[]`, `charges[]` and the client-computed totals. One transaction:

1. Compute `fy` from the invoice date and take `pg_advisory_xact_lock(hashtext(fy))`, serializing saves within a financial year.
2. Read `seller`. If it is missing, raise `NO_SELLER`.
3. Look up the invoice by id (`for update`):
   - Not found and `p_expected_updated_at` is null → **create**.
   - Not found and `p_expected_updated_at` is not null → raise `INVOICE_DELETED` (it was deleted elsewhere while being edited).
   - Found and `p_expected_updated_at` is null → raise `ALREADY_SAVED` with its `invoice_no` (a retried create, or a draft resumed on two devices).
   - Found and `updated_at <> p_expected_updated_at` → raise `EDIT_CONFLICT` with the other save's time.
   - Found and matching → **update**.
4. Serial:
   - Null → `next_serial(fy)`, safe because of the lock.
   - Given → if another invoice has the same `(fy, serial)`, raise `DUPLICATE_NUMBER` with that invoice's number, buyer and date.
5. Write the header. On create, copy the seller snapshot; on update, keep the existing seller snapshot.
6. Delete the existing lines and charges for the invoice, then insert the new ones with positions 1..n.
7. Check that `items_total`, `charges_total` and the GST totals equal the sums of the inserted lines and charges. Raise `TOTALS_MISMATCH` otherwise. Row-level and header `check` constraints cover the remaining arithmetic.
8. Insert one `audit_log` row: `INSERT` or `UPDATE`, with `old_data` and `new_data` holding the full invoice (header, lines, charges) as JSON.
9. Delete the `drafts` row with the same id.
10. Return `{ id, invoice_no, serial, updated_at }`.

Any error rolls back everything above.

### 5.2 `delete_invoice(p_id uuid, p_typed text) returns text`

One transaction:

1. Load the invoice `for update`; if it is missing, raise `NOT_FOUND`.
2. Normalize `p_typed`: trim, accept the full `invoice_no` or the serial with or without leading zeros. If it doesn't match, raise `CONFIRM_MISMATCH`.
3. Insert an `audit_log` `DELETE` row with the full invoice JSON in `old_data`.
4. Delete the invoice (lines and charges cascade) and any draft with that id.
5. Return the deleted `invoice_no`.

### 5.3 `next_serial(p_fy text) returns integer`

`coalesce(max(serial), 0) + 1` for that financial year. Used for the preview in the form; `save_invoice` calls it again under the lock.

### 5.4 `keep_alive() returns integer`

Returns `1`. Executable by `anon`. Used only by the daily GitHub Action.

### 5.5 Change-log trigger

A generic `after insert or update or delete` trigger on `seller`, `companies`, `items` and `charge_types` writes one `audit_log` row with `old_data` / `new_data` (`to_jsonb(OLD)` / `to_jsonb(NEW)`). It runs inside the same transaction as the change. The invoice tables have no trigger, because `save_invoice` and `delete_invoice` write one consolidated entry per action. Drafts are not logged.

### 5.6 Error codes

Functions raise exceptions whose message starts with a code. The client maps each code to plain English:

| Code | Message shown |
|---|---|
| `DUPLICATE_NUMBER` | "2026-27/008 is already used by ABC Traders (05-Oct-2026). Please choose another number." |
| `EDIT_CONFLICT` | "This invoice was changed on another device at 3:42 PM. Reload to see the latest." |
| `ALREADY_SAVED` | "This invoice was already saved as 2026-27/012." (then opens it) |
| `INVOICE_DELETED` | "This invoice was deleted on another device. Save it as a new invoice?" |
| `TOTALS_MISMATCH` | "The totals could not be verified. Please try again." (indicates a bug; logged to console) |
| `NO_SELLER` | "Please fill your company details in Settings first." |
| `CONFIRM_MISMATCH` | "The number you typed does not match." |
| Check / unique violations on masters | Field-specific text, e.g. "A company with this name and GSTIN already exists." |
| Network failure | "Couldn't save — no internet. Nothing is lost, try again." |
| Auth failure | "Please log in again." Work is kept (see §8.2). |

## 6. Security

- Row-level security is enabled on every table. With no policy, access is denied.
- `authenticated` policies:
  - `seller`: select, insert, update. No delete.
  - `companies`, `items`, `charge_types`: select, insert, update. No delete; removal is `archived = true`.
  - `drafts`: select, insert, update, delete.
  - `invoices`, `invoice_lines`, `invoice_charges`: select only. Writes happen only through `save_invoice` / `delete_invoice`.
  - `audit_log`: select only. Rows are written only by security-definer functions and triggers, so the app cannot alter the log.
- `anon`: no table access. Only `keep_alive` is executable.
- Public sign-ups are disabled in Supabase Auth. The single user is created from the dashboard.
- The Supabase anon key is public by design and lives in Vercel environment variables. The service-role key is never placed in the frontend, the repository or Vercel.
- `.env*` files except `.env.example` are git-ignored.
- Supabase Auth Site URL and redirect URLs are set to the Vercel domain so password-reset emails work.

## 7. Screens and usability

### 7.1 Global

- **Navigation:** a bottom bar on phones and a top bar on desktop, with icon **and** text: New Invoice, Invoices, Drafts, Lists, Settings. The Home page shows the same destinations as big tiles plus "Download Excel".
- **Layout breakpoint:** about 900 px. Below it the page is one column and the totals bar is fixed to the bottom of the screen (collapsed to Grand Total with a "Show details" toggle). Above it there are two columns and the totals sit in a sticky side panel.
- **Sizes and contrast:** text 18 px or larger; inputs and buttons at least 48 px tall; dark text on white; WCAG AA contrast at minimum.
- **Labels:** always visible above fields, never placeholder-only.
- **Phone keyboards:** number fields use `inputmode="decimal"` (quantity, price, amount) or `"numeric"` (serial).
- **Formats:**
  - Money is shown with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`, e.g. ₹1,12,345.00.
  - Dates are shown as `07-Oct-2026`.
  - Timestamps are shown in Asia/Kolkata time.
- **Interaction:** no hover-only or swipe-only actions and no small × buttons. Pressing Enter inside a field never submits a form. Works at 200% zoom.
- **Errors:** red text plus an icon next to the field, in plain words. On save, the page scrolls to the first problem.
- **Confirmations:** only for destructive actions (delete invoice, remove master entry, discard draft). Removing an item row uses "Undo" instead.

### 7.2 Login

Email, password, a "Show password" toggle and a "Forgot password" link. The session persists, so the login screen is rarely seen.

### 7.3 Invoice form (create and edit)

Numbered sections stacked vertically:

**1. Details**

- **Date:** native date input, defaulting to today's **local** date. This must not use `toISOString()`, which gives yesterday's date before 5:30 AM IST.
- **Invoice number:** a fixed prefix `2026-27 /` (follows the date) and an editable number box.
  - The box is pre-filled from `next_serial` with the hint "Suggested — you can change it".
  - When the user hasn't touched it, the number is sent as "auto" and the database assigns it at save time. If that differs from the preview, the success screen says "Saved as 2026-27/013".
  - A number typed by the user is never changed silently.
  - Changing the date across financial years refreshes the prefix and the suggestion. This also applies when editing: the number switches back to auto with the new year's suggestion unless the user then types one.
  - Whether the number has been touched is part of the form state, so it survives drafts.

**2. Buyer**

- **Company:** a type-to-search select over active companies. Each option shows name · GSTIN · state name.
  - "+ Add new company" opens the company form in a dialog. Saving it adds the company to the master list (one atomic write) and selects it.
  - Picking a company fills in its address, GSTIN and state. These fields stay editable for this invoice only; the master list is unchanged.
- **"Shipping address same as billing":** a large checkbox, ticked by default. Unticking it shows a shipping address box.
- **Place of supply:** a state select, defaulting to the buyer's state.
- **Tax type badge:** "CGST + SGST (same state)" or "IGST (other state)", updating live.

**3. Terms and transport**

- **Payment terms:** Immediate, 7 / 15 / 30 / 45 / 60 / 90 days, or Other (free text). Default: Immediate.
- **Mode of transport:** By Road, By Hand, Courier, Rail, Air, or Other (free text). Default: By Road.
- **Vehicle number:** optional.

**4. Items** — one card per line

- **Item:** a type-to-search select over active items, matching name or HSN, with "+ Add new item" (same dialog pattern as companies).
- **Auto-fill:** picking an item fills in description, HSN, unit, GST rate and the default price (if any). All of these stay editable on this line.
- **Fields:**
  - Quantity: up to 3 decimals.
  - Unit: Nos, Pcs, Kg, Mtr, Ltr, Box, Set, or Other (free text).
  - Price: up to 2 decimals.
  - GST rate.
- **Live amount and GST** on each card.
- **"Remove"** shows the toast "Item removed — Undo".
- **"+ Add item"** is a large button. The form opens with one empty item card.

**5. Charges**

- "+ Add charge" adds a row: charge type select (fills in the GST rate), amount, GST rate (editable), live GST.
- "Remove" with Undo.

**Totals panel**

- Items total, charges total, taxable value.
- A GST table grouped by rate: rate, taxable, CGST and SGST (or IGST).
- Round off (signed), a large **Grand Total**, and the amount in words.

**Save**

- One large button. While the request is running it's disabled and reads "Saving…".
- On success, a confirmation screen: "Invoice 2026-27/012 saved", with **View** and **New Invoice**.

**Draft status line:** "Draft saved 10:42" / "Saving draft…" / "Not saved — no internet".

**Editing an invoice that already has a draft:** the form asks "You have unsaved changes from 06-Oct-2026 15:30 — Continue them / Discard".

### 7.4 Invoice list

- A search box matching invoice number or buyer name (case-insensitive).
- Newest first: invoice date descending, then financial year and serial descending.
- 50 per page with "Show more".
- Each card shows number, date, buyer and grand total.
- "Download Excel" in the page header.

### 7.5 Invoice view

- **Read-only**, showing every field, the lines, the charges and the totals.
- **History** from `audit_log`: "Created 05-Oct-2026 10:12 · Edited 06-Oct-2026 15:30".
- **Buttons:** Edit and Delete.
- **Delete dialog:** "Delete invoice 2026-27/012 for ABC Traders (₹1,23,456)? This cannot be undone. Type 12 to confirm." The Delete button enables only when the input matches; `12`, `012` and `2026-27/012` all work.

### 7.6 Drafts

- A list showing label, last saved time, Resume and Discard (with confirmation).
- **Resuming a new-invoice draft** reopens the form with the same id.
- **Resuming an edit draft** reopens the edit form. If the invoice has since been deleted, the user is told and the draft becomes a new invoice: a fresh id, and the number set back to auto.

### 7.7 Lists (masters)

- Tabs: Companies, Items, Charges.
- Each tab has search, "+ Add", Edit and "Remove from list".
- **Removing** asks: "Remove ABC Traders from the list? Old invoices are not affected. You can restore it later."
- A "Show removed" toggle lists archived entries with **Restore**. Restoring into a conflict with an active entry shows the unique-violation message.
- **Company form:** name, address, GSTIN, state. The state is locked to the GSTIN's state when a GSTIN is entered, and is a required select when there isn't one.
- A GSTIN already used by another active company shows a non-blocking warning: "Another company uses this GSTIN: XYZ Ltd."

### 7.8 Settings

- **Our company:** name, address, GSTIN, phone. The state is shown read-only, taken from the GSTIN.
- Change password (`supabase.auth.updateUser`).
- Log out.
- Until our company details are saved, New Invoice shows "Please fill your company details in Settings first" with a button to Settings.

## 8. Calculation and validation

### 8.1 Calculation (`src/lib/invoiceMath.ts`)

All arithmetic uses `decimal.js-light`, configured with `precision: 50` (its default of 20 significant digits would round large amounts), with no intermediate rounding:

1. Line `amount = qty × price`.
2. Line or charge `gst_amount = amount × gst_rate ÷ 100`.
3. `items_total = Σ line amounts`; `charges_total = Σ charge amounts`; `taxable_total = items_total + charges_total`.
4. `gst_total = Σ gst_amount` over lines and charges.
5. If `seller_state_code = place_of_supply`: `cgst_total = sgst_total = gst_total ÷ 2` and `igst_total = 0`. Otherwise `igst_total = gst_total`.
6. `exact_total = taxable_total + cgst_total + sgst_total + igst_total`.
7. `grand_total = exact_total` rounded to 0 decimals, half-up (0.50 goes up). `round_off = grand_total − exact_total`.
8. The amount in words uses the Indian system (crore, lakh, thousand): "Rupees One Lakh Twelve Thousand Three Hundred Forty-Five Only". There are no paise because `grand_total` is whole rupees.
9. For display only, values are rounded to 2 decimals half-up. Displayed lines can differ from the exact total by a paisa; this is accepted. The GST-by-rate table shows CGST and SGST rates as half the rate (for example 0.25% becomes 0.125% + 0.125%).

The client sends the exact values; the database re-checks them (§4.5–4.7, §5.1 step 7). Every quantity, price, rate and amount in the `save_invoice` payload is a decimal **string** produced by `Decimal#toFixed()` with no argument, which never uses exponent notation. Never send JavaScript numbers, which lose precision.

### 8.2 Validation

| Field | Rule | Enforced in |
|---|---|---|
| Items | At least one line | Client + `save_invoice` |
| Quantity | > 0, up to 3 decimals | Client + column type/check |
| Price | ≥ 0, up to 2 decimals (0 allowed for free samples) | Client + check |
| Charge amount | > 0, up to 2 decimals | Client + check |
| GST rate | 0–100, up to 2 decimals (no hard-coded slab list) | Client + check |
| GSTIN | Spaces removed and upper-cased automatically; 15 characters matching `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`; valid mod-36 check digit; state code in the GST state list. Optional for unregistered buyers. Invalid input blocks saving. | Pattern: client + check constraint on `seller.gstin`, `companies.gstin` and `invoices.buyer_gstin`. Check digit and state list: client. |
| State code | One of the GST state codes 01–38 or 97, held in `src/lib/gstin.ts` with names | Client + check |
| HSN | 4, 6 or 8 digits, stored as text | Client + check |
| Text fields | Trimmed; required fields must not be blank | Client + check |
| Invoice serial | Whole number ≥ 1; unique within the financial year | Client + unique constraint |
| Date | Any valid date | Client |

Not supported: special-format GSTINs such as UIN / embassy registrations (the pattern check rejects them).

## 9. Drafts, offline behaviour and the change log

### 9.1 Drafts

- **When the form opens:**
  - New invoice: a new uuid is generated, used as both the invoice id and the draft id.
  - Edit: the invoice's own id is used.
- **Auto-save:** 3 seconds after the last change, once the form has any user-entered value, the draft is upserted to `drafts`.
- **Clean-up:** a successful `save_invoice` deletes the draft in the same transaction (§5.1 step 9). Drafts are otherwise deleted only via Discard.
- **Two devices, one draft:** the latest auto-save wins. This is acceptable for unfinished work; saved invoices are protected by `EDIT_CONFLICT` and `ALREADY_SAVED`.

### 9.2 When Supabase can't be reached

- **Fallback:** if an auto-save fails (offline, Supabase paused, session expired), the draft is written to `localStorage` under its id.
  - A yellow bar shows "No internet — your work is safe on this screen".
  - Auto-save keeps retrying. On the first success the local copy is removed.
- **On app start:** any local draft copies are pushed to Supabase, then removed locally.
- **Unsaved-changes guard:**
  - Closing or refreshing the tab with unsaved changes triggers the browser's "Leave site?" prompt (`beforeunload`).
  - In-app navigation shows "Leave without saving?" (router blocker).
- **Session expiry:** saving shows "Please log in again". After login the user returns to the same form, restored from the draft.

### 9.3 Change log

- Written by the database as described in §5.1, §5.2 and §5.5.
- The invoice view shows the history (§7.5).
- A deleted invoice can be recovered from `audit_log.old_data` through the Supabase dashboard. There is no in-app restore screen.

## 10. Excel export (`src/lib/exportXlsx.ts`)

- **Trigger:** "Download Excel" on Home and on the Invoice list.
- **Filename:** `invoices-YYYY-MM-DD.xlsx`, using the local date.
- **Fetching:** in pages of 1,000 rows (the Supabase per-request maximum) until exhausted, for `invoices`, `invoice_lines` and `invoice_charges`. Without paging, the export would silently stop at 1,000 rows.
- **Sort:** by `fy`, then `serial`.
- **Sheet "Invoices"** (one row per invoice): Invoice No, Date, Buyer, Buyer GSTIN, Buyer State, Place of Supply, Billing Address, Shipping Address, Payment Terms, Transport, Vehicle No, Items Total, Charges Total, Taxable Value, CGST, SGST, IGST, Round Off, Grand Total, Created, Last Edited.
- **Sheet "Items"** (one row per line): Invoice No, Date, Buyer, Item, Description, HSN, Qty, Unit, Price, Amount, GST %, GST Amount.
- **Sheet "Charges"** (one row per charge): Invoice No, Date, Buyer, Charge, Amount, GST %, GST Amount.
- **Cell types:**
  - Money and quantity are numeric cells (money formatted `#,##0.00`), rounded to 2 decimals for the file. Quantity is not rounded.
  - Dates are real date cells formatted `dd-mmm-yyyy`.
  - Invoice No, GSTIN, HSN and Vehicle No are text cells, so leading zeros and slashes survive.
- **Loading:** SheetJS is loaded with a dynamic `import()` only when the button is pressed. The button shows "Preparing file…" while working.
- **No invoices yet:** the workbook still downloads with header rows only, plus the toast "No invoices yet — the file has headers only."

## 11. Project layout

```
supabase/
  config.toml
  migrations/
    0001_schema.sql        tables, generated columns, constraints, indexes, fy_of()
    0002_functions.sql     save_invoice, delete_invoice, next_serial, keep_alive, audit trigger
    0003_security.sql      RLS policies and grants
  seed.sql                 dummy data
  tests/                   pgTAP tests
src/
  main.tsx  App.tsx        Mantine provider, router, auth gate, nav
  lib/
    supabase.ts            client from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
    invoiceMath.ts         §8.1
    gstin.ts               GSTIN validation, check digit, state code list
    fy.ts                  fy_of, invoice number formatting, local "today"
    words.ts               amount in words (Indian system)
    errors.ts              error code → message map (§5.6)
    exportXlsx.ts          §10
    *.test.ts              unit tests
  pages/
    Login  Home  InvoiceForm  InvoiceList  InvoiceView  Drafts  Masters  Settings
  components/
    CompanyPicker  ItemCard  ChargeRow  TotalsPanel
tests/e2e/                 Playwright smoke test
.github/workflows/keep-alive.yml
vercel.json                SPA rewrite: all paths → /index.html
.env.example
```

### Dummy seed data

- **Seller:** a Gujarat GSTIN (state 24).
- **Five companies:**
  - Two in Gujarat.
  - Two named "ABC Traders" with different GSTINs (Gujarat and Maharashtra).
  - One unregistered buyer in Rajasthan.
- **Ten items** with a mix of 4-, 6- and 8-digit HSNs (at least one with a leading zero) and GST rates of 0, 5 and 18 (one at 0.25), across several units.
- **Three charge types:** Freight 18%, Packing 18%, Loading 5%.
- **No invoices.**

All seed GSTINs carry valid check digits.

## 12. Testing

1. **Unit tests (Vitest)**
   - `invoiceMath`:
     - 2.333 × ₹10.25 = 23.91325 exactly.
     - Totals ending in .50 round up; .49 rounds down.
     - Mixed 5% + 18% + charges, both same state and other state.
     - A 0.25% rate split into 0.125% + 0.125%.
     - Zero-price line.
     - Round-off sign.
   - `words`: ₹0, ₹1, ₹15, ₹100, ₹1,000, ₹1,00,000, ₹10,00,00,000, ₹1,12,345.
   - `gstin`:
     - A valid GSTIN.
     - A single changed character fails the check digit.
     - Lower case with spaces normalizes.
     - A bad state code fails.
   - `fy`: 31-Mar and 1-Apr boundaries; serial padding for 1, 999, 1000; local "today" around midnight.
2. **Database tests (pgTAP, local Supabase in Docker)**
   - The first invoice of a financial year gets serial 1, and auto serials increment.
   - A typed duplicate raises `DUPLICATE_NUMBER`; the same serial in a different financial year is allowed.
   - A serial of 1000 formats as `2026-27/1000`.
   - A stale `p_expected_updated_at` raises `EDIT_CONFLICT`; a create retry raises `ALREADY_SAVED`; an edit of a deleted invoice raises `INVOICE_DELETED`.
   - A line with a bad amount rolls back the whole save: no header, no lines, no audit row, draft still present.
   - Delete with a wrong typed number raises `CONFIRM_MISMATCH`. Delete with the right one removes the header, lines, charges and draft and writes one `DELETE` audit row.
   - Master insert, update and archive each write an audit row.
   - Company uniqueness: same name with different GSTINs is allowed; same name with both GSTINs empty is refused; an archived duplicate doesn't block.
   - `anon` cannot select from any table. `authenticated` cannot insert into `invoices` or `audit_log` directly, and cannot delete from master tables.
3. **Concurrency check:** a Vitest integration test against local Supabase fires 10 parallel `save_invoice` calls with auto serials and asserts 10 distinct consecutive serials.
4. **End-to-end (Playwright, phone viewport and desktop viewport):** log in, create an invoice with 2 items and 1 charge, check the total, edit the quantity, check the history, export Excel (file downloads), delete the invoice.

## 13. Deployment and operations

Steps marked **(user)** need the account owner; the implementer prepares everything else and pauses for them.

1. **(user)** Create a Supabase project in the Mumbai region (ap-south-1). Provide the project ref and the anon key.
2. **(user)** Log in to the Supabase CLI once (`npx supabase login`). Then link and push the migrations (`npx supabase link`, `npx supabase db push`).
3. **(user)** In Supabase Auth:
   - Disable sign-ups.
   - Create the single user.
   - Set the Site URL and redirect URLs to the Vercel domain.
4. **(user)** Create a **private** GitHub repository and allow the push.
5. **(user)** Import the repository into Vercel (framework: Vite). Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
6. **Keep-alive workflow:** `.github/workflows/keep-alive.yml` calls `keep_alive` once a day using the URL and anon key from repository secrets. It must be a private repository, because GitHub disables scheduled workflows in public repositories after 60 days without activity.
7. **Backups:** none are automated. The user downloads the Excel export periodically.

Known limits:

- Vercel Hobby terms allow non-commercial use only. Cloudflare Pages is a drop-in alternative if that matters.
- Without the keep-alive, the Supabase free tier pauses after 7 days of inactivity. Its data is not backed up automatically.

## 14. Real data import and go-live

1. The user supplies an Excel file with companies, items (with HSN) and charge types (with GST rates).
2. A one-time script, `scripts/import-masters.ts`, reads the workbook and validates every row (blanks, GSTIN and check digit, state code, HSN, GST rate, duplicates by the uniqueness rules). It prints an error list by sheet and row. Nothing is written while any error remains.
3. **Go-live reset (destructive; run only after explicit user confirmation):** one transaction that empties `invoices` (lines and charges cascade), `drafts`, `audit_log`, `companies`, `items` and `charge_types`, then inserts the validated master data. Either everything is replaced or nothing changes.
4. The user enters the real seller details in Settings.
5. To continue an existing paper or Tally series, the user types the next number on the first real invoice (for example 48). Suggestions continue from there.

## 15. Edge cases

| Situation | Behaviour |
|---|---|
| Two people save new invoices at the same moment | The advisory lock per financial year serializes the saves; auto serials differ. |
| A typed number is already taken | `DUPLICATE_NUMBER` with the other invoice's buyer and date; the typed number is kept so the user can change it. |
| An untouched suggested number is taken by someone else first | Auto mode: the database assigns the next free number, and the success screen shows the actual number. |
| Save clicked twice, or a network retry after a lost response | The button is disabled while saving; a retried create raises `ALREADY_SAVED` and opens the saved invoice. |
| The same invoice edited on two devices | The second save gets `EDIT_CONFLICT`; nothing is overwritten. |
| The invoice is deleted while another device edits it | `INVOICE_DELETED`; offer to save as a new invoice. |
| Date moved from March into April | The prefix changes to the new financial year; the suggestion refreshes; uniqueness is checked in the new year. |
| Serial ≥ 1000 | Printed in full (`2026-27/1000`); the limit of 99,999,999 keeps it within 16 characters. |
| Gaps from deletions or skipped numbers | Allowed; never auto-filled. Suggestion = highest + 1. |
| Opening the form just after midnight IST | "Today" uses the device's local date, not UTC. |
| Same company name with different GSTINs | Allowed; the picker shows name · GSTIN · state. |
| Same company name, neither has a GSTIN | Refused, with advice to add a GSTIN or a distinguishing suffix. |
| Same GSTIN on two companies | Allowed, with a warning (one GSTIN can have several branches). |
| A master entry is edited or removed after it was used | Old invoices are unchanged (snapshots). Removed entries disappear from pickers and can be restored. |
| Restoring an entry that now duplicates an active one | Refused with the uniqueness message. |
| Our company details changed later | New invoices use the new details; existing invoices keep the details they were issued with, including on edit. |
| Our company not set up yet | New Invoice is blocked with a link to Settings; `save_invoice` also raises `NO_SELLER`. |
| Bill to one state, ship to another | Place of supply defaults to the buyer's state and can be changed; the tax type follows it. |
| Unregistered buyer | No GSTIN; the state is chosen in the company form; place of supply defaults to it. |
| 0% item or zero-price line | Allowed; GST is 0. |
| GST rate with decimals (0.25, 1.5, 3) | Allowed; CGST and SGST are half each, shown with up to 3 decimals. |
| HSN with a leading zero | Stored and exported as text. |
| Very large quantity or price | Bounded by `numeric(14,3)` / `numeric(14,2)`; field validation explains the limit. |
| Internet drops while filling the form | Draft kept on the device and the yellow bar shown; pushed to Supabase when back online. |
| Tab closed with unsaved changes | Browser leave prompt; the draft is already in Supabase or on the device. |
| Session expired mid-form | Auto-save falls back to the device; "Please log in again"; the form is restored after login. |
| Supabase project paused | All calls fail like offline; the keep-alive normally prevents this. Restore from the dashboard. |
| A resumed edit draft whose invoice was deleted | The user is told; the draft becomes a new invoice with a fresh id and auto number. |
| Export with more than 1,000 rows | Paged fetching; every row is exported. |
| Export with no invoices | A workbook with headers only, plus a toast. |
| Refreshing a deep link on Vercel | `vercel.json` rewrite serves the app. |
| A bad line slips past client validation | DB check constraint fails; the whole save rolls back; the user sees a field message. |

## 16. Out of scope for Milestone 1

- The challan image and sharing (Milestone 2).
- Discounts.
- Reverse charge.
- Export / SEZ invoices.
- E-way bill.
- Credit and debit notes.
- Multiple users or roles.
- An in-app restore of deleted invoices.
- An audit viewer beyond the per-invoice history.
- Date-range filters on export.
- Translations.
- PDF output.
- Automated backups.
- Reordering item lines.
- Special-format GSTINs (UIN).

## 17. Milestone 2 readiness

Every saved invoice already holds everything a challan needs, without consulting the master lists:

- Seller and buyer snapshots.
- Shipping address and place of supply.
- Transport mode and vehicle number.
- Lines with HSN.
- Charges.
- Totals.

The amount in words is derived from `grand_total` by `src/lib/words.ts`. Milestone 2 will add a challan view and image export on top of the invoice view page.
