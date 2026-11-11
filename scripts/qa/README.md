# Site QA (S4, S5)

`s4-qa.mjs` runs, for every public page type:

- axe-core (WCAG 2.0/2.1/2.2 A and AA tags) at 1440 and 390 px;
- a JSON-LD check (valid JSON, `@context`, the required fields per type, no Review/AggregateRating markup);
- full-page screenshots, written to `docs/screenshots/s4/`;
- Lighthouse with the mobile preset on the key pages. The gate is ≥ 90 for performance, accessibility and best practices. SEO is reported but not gated: every page is noindex until launch (S9), and that alone costs the SEO score.

It exits 1 if any page fails. `report.json` lands next to the screenshots.

## Setup (once)

The tools aren't repo dependencies. Install them in any folder:

```bash
npm i --prefix ~/qa-tools lighthouse@12.2.1 @axe-core/playwright@4.10.1 axe-core@4.10.2 playwright
```

## Run against a local production build

```bash
pnpm --filter @vabrato/web build && pnpm --filter @vabrato/web start
```

```bash
QA_TOOLS=~/qa-tools node scripts/qa/s4-qa.mjs --base http://localhost:3003
```

Optional flags:

- `--chrome /path/to/chromium` uses a specific browser.
- `--no-lighthouse` skips Lighthouse.
- `--scl-base http://homes.sancarloslife.com:3003 --scl-ip 127.0.0.1` adds the homes.sancarloslife.com pages. This only works when `site_scl_enabled` is on in that database.

The page list uses the fictional fixture keys (FX-001 and so on). So run it against a database loaded with the preview seed (`packages/mls/src/jobs/seed-preview.ts`), never against live MLS data.

## How the S4 run was made

The cloud session that built S4 couldn't reach the hosted Supabase project or `*.vercel.app`. So the run used a local stack:

- Postgres 16, loaded with the PGlite harness's Supabase shim (`packages/db/test/harness.ts`), every migration, and the preview seed (`--public-only --publish-placeholders`);
- PostgREST v12 in front of it;
- a small proxy that maps `/rest/v1` to PostgREST, so supabase-js works unchanged.

The web app was built with `NEXT_PUBLIC_SUPABASE_URL` pointing at that proxy. Same code and same data as the preview; only the database host differs.

To check the Vercel preview itself, run the same command with `--base <preview URL>` from a machine that can reach it. The URL needs a protection-bypass token if Deployment Protection is on.

## Member flows (S5)

`s5-auth-flow.mjs` runs the real sign-in flow end to end:
- join with a magic link, then the callback and the portal;
- account changes, sign-out and sign-in;
- the onboarding fallback and the staff notice;
- axe on every new page at 1440 and 390 px.

It needs a local stack with Supabase Auth, because the hosted project's email cap and redirect allowlist get in the way. The S5 run used:

- Postgres 16 with the Auth server's own migrations, then the storage stub from the PGlite shim, then every migration and the preview seed;
- Supabase Auth (`github.com/supabase/auth`, built with `go build`), with SMTP pointed at a local sink that writes `.eml` files (`aiosmtpd`);
- PostgREST v12 and a small proxy that maps `/auth/v1` and `/rest/v1` to them;
- apps/web built with `NEXT_PUBLIC_SUPABASE_URL` pointing at that proxy.

```bash
QA_TOOLS=~/qa-tools MAIL_DIR=/path/to/mail PGURL=postgres://postgres@127.0.0.1:54329/authqa node scripts/qa/s5-auth-flow.mjs
```

`STAFF_EMAIL` must be an existing admin account in that database.

`s5-saved-flow.mjs` covers saved homes and searches, compare, the price-history teaser and the VOW pages. It runs with `vow_enabled` off, then on. Same stack, plus:

- the full fictional seed (`seed-preview.ts --publish-placeholders`, without `--public-only`), so VOW rows exist;
- `REVALIDATE_SECRET` set to the running server's secret: flags are read through Next's 15-minute cache, so the script calls `/api/revalidate` after flipping one.

After applying a migration to the local database, run `notify pgrst, 'reload schema'`, or PostgREST keeps the old schema and the new tables return errors. Hosted Supabase does this automatically.

`s5-alerts-flow.mjs` simulates a feed change in the local database: fictional rows, then `run_member_alerts()` as the sync job would run it. It then checks:
- the bell count and the "What changed" feed (new price only, hidden address, broker line, MLS attribution);
- the queued email payload;
- unsubscribe from the confirm page and by one-click POST, and that a GET never unsubscribes.

The full sync-to-email path, from mock feed to email, is the PGlite test `packages/mls/src/sync/alerts.e2e.test.ts`.

`s5-buyer-flow.mjs` covers homes I'm pursuing, a signed-in tour request, and messages with the agent console. It also checks tour confirmation, the buyer agreement, and the documents page.

It needs apps/va running on :3000, built with the same Supabase env. For the local stack:

- add `http://localhost:3000/**` to `GOTRUE_URI_ALLOW_LIST`, so the console can sign in;
- make the local proxy add CORS headers (Supabase's API gateway does this on the hosted project; the console's login calls Auth from the browser);
- set `GOTRUE_SMTP_MAX_FREQUENCY=1s`, so repeated runs can email the same staff address.

Uploads aren't covered locally, because the stack doesn't run Supabase Storage. Check them on the preview: upload a PDF and a photo, then download and delete them.

`s5-seller-flow.mjs` covers the seller portal: the timeline, to-dos, wiring banner and calendar download; linking the deal to its listing in the console; listing views from a real browser visit (bots, headless browsers and cross-site posts aren't counted); open-house sign-in links on a tablet-sized screen; and listing activity. A second seller checks that one seller can't see another's deal.

It needs apps/web started with `LISTING_VIEW_SECRET` set, and that secret's sha256 in the database:

```sql
insert into listing_view_keys (key_hash) values (encode(sha256(convert_to('<the secret>', 'UTF8')), 'hex'));
```

`SHOTS=/some/dir` saves screenshots of the seller pages.

## S5 QA pass

`s5-qa.mjs` opens every member and account page as fictional buyer, seller, both, VOW and staff accounts, plus the signed-out pages. For each page it checks the HTTP status, runs axe at 1440 and 390 px and takes full-page screenshots. Screenshots and `report.json` go to `docs/screenshots/s5/`.

It needs the full fictional seed, apps/va on :3000 and `REVALIDATE_SECRET` (it turns `vow_enabled` on for the VOW pages and off again at the end).

```bash
QA_TOOLS=~/qa-tools MAIL_DIR=/path/to/mail PGURL=postgres://postgres@127.0.0.1:54329/authqa REVALIDATE_SECRET=… node scripts/qa/s5-qa.mjs
```

## Agent console (S6)

`s6-console-shots.mjs` signs in to the console (apps/va on :3000) as staff with the email link, opens every console page, runs axe at 1440 and 390 px and saves screenshots. `--out <dir>` sets where they go; `--no-axe` skips axe. It picks a fictional deal and message thread from the database.

```bash
QA_TOOLS=~/qa-tools MAIL_DIR=/path/to/mail PGURL=postgres://postgres@127.0.0.1:54329/authqa node scripts/qa/s6-console-shots.mjs --out docs/screenshots/s6
```

`s6-lead-alert.mjs` checks the 1-minute lead path on the local stack: a real lead from `/contact` is routed to the lead admin, queued with an in-console alert, and sent by the console's `/api/notifications/process` to a fake Resend. On hosted, pg_net calls that endpoint right after the insert; locally the script calls it. It also checks a member message alert.

It needs migration 0022 applied, the staff account set as lead admin (`update app_settings set lead_admin_id = …`), and apps/va started with `CRON_SECRET`, `RESEND_API_KEY` (any value), `RESEND_BASE_URL=http://127.0.0.1:4010` and `CONSOLE_URL`. The fake Resend is a tiny Node server that appends each `POST /emails` body, its arrival time and its `Idempotency-Key` to a JSON-lines file; pass that file as `RESEND_LOG`.

`s6-leads-ui.mjs` drives the leads screens in the console: a website lead shows in the lead admin's bell and inbox; the lead page records a reply, a note, a reassignment and a close; Settings turns away on and off; a fictional agent sees only their own lead and gets a 404 for anyone else's. axe runs on the inbox, lead page, Settings and the open bell. It needs `SERVICE_KEY` (the local service-role JWT) to create the agent account.

`s6-members-mls.mjs` covers members (list, search, member page, agent change, deletion queue), the MLS sync page and its alerts (off, then on with a failed run opening an incident and banner, then recovery), ACC-1 at console sign-in, and Our listings (IDX, then FULL fields only with `full_data_enabled` on, switched off again at the end). Start apps/va with `MLS_OFFICE_ID`. The script adds fictional rows: a roster member for the staff account and a FULL record for one fixture listing.
