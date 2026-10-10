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
