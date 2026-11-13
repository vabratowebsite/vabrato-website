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

`s6-content.mjs` covers the content editor and approval (a post blocked by the Fair Housing check, reworded, sent, published by the lead admin and live on the website at once; a testimonial without permission sent back with a note), My profile (a PNG accepted, an SVG renamed .png refused, the About page shows the photo, removal) and featured listings (a sold listing refused, a pinned listing leads the home page). Start apps/va with `WEB_REVALIDATE_URL=http://localhost:3003/api/revalidate` and the website's `REVALIDATE_SECRET`, and pass `SERVICE_KEY` and `REVALIDATE_SECRET` to the script. The local stack has no Storage API, so photo uploads need a storage shim on `/storage/v1` that inserts into `storage.objects` as the caller (as storage-api does, so the bucket policies apply). The script links a fictional agent to one agent profile and restores it at the end.

`s6-reports.mjs` covers the seller weekly report (preview, send once, the email reaches the fake Resend with the previewed subject and counts only), market stats and CMAs (off by default; then on with fictional sold listings QA-S1…QA-S6 in Belmont: the database's median on the page, a saved CMA with keys only, a price range, "not an appraisal", MLS attribution, a comparable that leaves the feed shown as missing, print view without the console frame) and the website's city stats behind `public_stats`. Needs `RESEND_LOG` and `CRON_SECRET` (as `s6-lead-alert.mjs`) and `REVALIDATE_SECRET`; start the fake Resend with its log path. The flags are switched off and the fixtures removed at the end.

`s6-qa.mjs` is the S6 QA pass: every console page as the lead admin (with screenshots of every page and the main detail pages), the backup with the lead admin present and away, an agent who isn't MLS-verified, and a VA, with axe at 1440 and 390 px; a buyer gets "No access"; and a website contact form's alert email to the lead admin is timed (under 60 s at the fake Resend). It creates the fictional staff through the Auth admin API, so it needs `SERVICE_KEY`, plus `RESEND_LOG` and `CRON_SECRET` as `s6-lead-alert.mjs`. Output: `docs/screenshots/s6/` and `report.json` there.

## VA assistant (S6b)

`s6b-assistant.mjs` checks the assistant page, the admin switches and limits, and the contract reader end to end, without a key or any cost. A fake Claude server (`fake-claude.mjs`) answers `POST /v1/messages` as a stream; the answer is picked by a `QA-MODE: ok|cash|wiring|invalid|refusal` marker inside the fictional PDF the script makes. The fake logs the shape of each request (model, fallback, effort, documents, tools, output format, whether a key was sent), never its content, and logs any other endpoint as unexpected.

```bash
node scripts/qa/fake-claude.mjs /tmp/fake-claude.jsonl
```

Start apps/va with `ANTHROPIC_BASE_URL=http://127.0.0.1:4020` and `ANTHROPIC_API_KEY` set to any value (SDK 1.x sends it as `Authorization: Bearer`). Then:

```bash
QA_TOOLS=~/qa-tools MAIL_DIR=/path/to/mail PGURL=postgres://postgres@127.0.0.1:54329/authqa SERVICE_KEY=… CLAUDE_LOG=/tmp/fake-claude.jsonl node scripts/qa/s6b-assistant.mjs
```

It needs migration 0027 and a storage shim on `/storage/v1` that supports upload (raw and multipart), list, download and remove, with the bucket policies applied as the caller (the contract goes browser → `deal-docs` staging folder → server action → deleted). It counts only the requests made during its own run, so the fake can keep running between runs. Screenshots go to `docs/screenshots/s6b/` (`OUT` changes that). The switches, the ZDR confirmation, the limits and the test deals are reset at the end.

`s6b-drafts.mjs` covers the four AI drafts (lead reply, open-house follow-up, escrow update, vendor quote request): off by default; writing, editing and approving; steering wording typed by the person blocks approval; the approved text is frozen and opens in the person's own email (mailto) or goes to the member's portal; answers with wiring details or steering wording are refused and not saved; a note with a lockbox code is refused before anything is asked; another agent can't open the lead; "My drafts"; the 30-day purge; and that no email address, phone number, price, escrow number or lockbox text reached the fake. It uses the same fake Claude server (it tells the drafts apart by their instructions and picks the answer by a `QA-MODE:` marker in the request text) and needs migration 0028, the preview seed (listing FX-001), `SERVICE_KEY` and `CLAUDE_LOG`. Screenshots go to `docs/screenshots/s6b-drafts/`. The switches are turned off and every row it adds is removed at the end.

`s6b-summaries.mjs` covers the daily briefing (Today), the member activity summary (member page) and questions about your work (/assistant): off by default; the briefing links each item to its record and gives a made-up record no link; an agent's briefing covers only their own transaction and lead while the lead admin's covers more (the fake logs how many records of each kind it was sent); a question answered with its sources, one the records can't answer, a steering question refused before anything is sent, a wiring answer not shown; the member summary with the member's last message (phone and email blanked); and the usage log. Same fake Claude server (it tells the features apart by their instructions and cites refs it was sent); needs migration 0029, the preview seed (FX-001), `SERVICE_KEY` and `CLAUDE_LOG`. Screenshots go to `docs/screenshots/s6b-summaries/`; every row it adds is removed and the switches turned off at the end.

`s6b-kits.mjs` covers listing launch kits and presentations: off by default (no link, the kit page is a 404, Presentations says it's off); a kit for one of our listings (FX-001) written from public listing facts only, an MLS description with a phone number refused at approval, a part copied, the flyer printed with our facts and the agent's own contact details (print view without the console frame), a draft with no flyer, another brokerage's listing (FX-002) with no kit, a wiring answer not shown; listing and buyer presentations written, approved and printed with the agent card, services and timeline; another agent gets a 404; "My drafts"; the usage log. It creates a fictional agent profile for the flyer and removes it at the end. Needs migration 0030, the preview seed, `SERVICE_KEY` and `CLAUDE_LOG`. Screenshots go to `docs/screenshots/s6b-kits/`.

`s6b-market-cma.mjs` covers market updates and CMA write-ups on fictional sold listings QA-S1…QA-S6 in Belmont (as `s6-reports.mjs`), with a fictional agent marked MLS-verified in SQL: off by default; a market update written from the console's own figures, a figure the assistant made up (`QA-MODE: invented`) blocking approval, the approved update kept as an internal preview while `public_stats` is off, then copied and sent to Mark's website review once it's on (the post waits in his queue); a CMA summary approved and shown with "not an appraisal"; a listing presentation with the CMA attached printing our range; with the sold-data switches off, both disappear. Needs migration 0031, `SERVICE_KEY` and `CLAUDE_LOG`. Screenshots go to `docs/screenshots/s6b-market-cma/`; every row, flag and fixture it adds is removed at the end.

`s6b-documents.mjs` covers deal documents (S6b PR 7a) with a fictional trust sale, a seller who joins on the website, and fictional PDF and PNG files: off by default (the Documents tab and checklist work, no assistant buttons, no "Read it"); an upload filed staff-only with its type and counted on the checklist; "not needed" with a note; the seller's own upload tagged for the deal; sharing with the seller (they see and download it in `/my/documents`) and back (they don't), a staff-only file refused to the seller by URL; another agent gets a 404 for the tab and the file; "Check this document" (one inline PDF, the type list as data; suggested types ticked, the unknown one dropped, nothing saved until the person saves; an answer with wiring details not shown); the Missing documents panel on Today; a receipt read into the form and saved with its file, which opens from the list, and an unreadable one explained. Since the 2026-11-13 amendment it also checks: "Documents aren't set up yet" with the table hidden (renamed and put back), the trust list with its "If they apply" group and counts, an old top-level file labelled "The seller can see this", the share warning, stop sharing refused safely when a temporary restrictive storage policy stops the seller's copy from being removed, the `staff_audit` rows, and a receipt whose upload was removed before saving. The fake Claude reads `QA-MODE: …` from the file's bytes. Needs migration 0032, the web app on 3003, `SERVICE_KEY`, `CLAUDE_LOG` and `STORAGE_DIR` (the storage shim's folder; it must support copy, signed URLs, `exists` (HEAD) and `created_at` on `storage.objects`). Screenshots go to `docs/screenshots/s6b-documents/`; everything it adds is removed at the end.

`s6b-repairs.mjs` covers repair items, the bid list and the response to the buyer's request (S6b PR 7b) with a fictional deal, three fictional inspection PDFs filed as in 7a, and two fictional vendors: off by default; items read from this deal's report (one inline PDF, the trades as data) with phones and dollar amounts stripped; a Fair Housing word blocking approval; an added item; approval; the bid list labelled and printed; "Ask a vendor" with the vendor switch off (copy, or email a matching vendor) and on (the quote request starts with the trade's items); the response with every item starting as not requested, the seller's approval tick required, our list and total, a tampered stored list rebuilt at approval, copy and print; an invented amount and an amount in words blocking approval; a 60-item answer flagged "may be incomplete"; an answer with wiring details not shown; an agent without deal access getting a 404. Modes come from `QA-MODE: …` in the PDF bytes (items) or the agent's note (response). Needs migrations 0032 and 0033, `SERVICE_KEY`, `CLAUDE_LOG` and `STORAGE_DIR`. Screenshots go to `docs/screenshots/s6b-repairs/`; everything it adds is removed at the end.

`s6b-counter-checks.mjs` covers "What changed" in a counter offer and "Check unchecked documents" (S6b PR 7c) with a fictional deal and its recorded terms, ten fictional PDFs filed as in 7a (two typed as counter offers) and one fictional seller upload: off by default; What changed only next to counter offers, one inline PDF and our terms as data, the table marking what differs (ours), redacted quotes, "shown only" with the deal's terms unchanged and nothing stored, an unsigned one flagged; the batch question with the count and number of requests, Cancel sending nothing, 11 files checked 10 then 1 (oldest first, the seller's upload last), each stamped with the agent and never the issue text, suggested types saved, Stop after the current file (`QA-MODE: slow`); no sideways scrolling at 390 px; an agent without deal access getting a 404. Needs migrations up to 0034, `SERVICE_KEY`, `CLAUDE_LOG` and `STORAGE_DIR`. Screenshots go to `docs/screenshots/s6b-counter-checks/`; everything it adds is removed at the end.

`s6b-calls-appointments.mjs` covers call notes, appointment drafts and staff to-dos (S6b PR 8) with a fictional deal, seller and lead: off by default (the to-do lists still there); call notes on a deal with suggestions de-duplicated and redacted, two ticked and added, the follow-up approved and the notes stored nowhere; call notes on a lead saved as a lead note only when ticked; an appointment from a sentence (next Tuesday, 3 PM, 45 minutes), a changed time blocking approval until the email says it, the calendar file in UTC, the confirmation copied, a past date left blank; to-dos added, done and deleted, and listed on Today; an agent without access getting a 404; no sideways scrolling at 390 px. Modes come from `QA-MODE: …` in the notes or sentence. Needs migrations up to 0035, `SERVICE_KEY` and `CLAUDE_LOG`. Screenshots go to `docs/screenshots/s6b-calls-appointments/`; everything it adds is removed at the end.

### S6b final QA (PR 9)

`s6b-final.mjs` is the console-wide sweep. It signs in as each role: the lead admin (admin, MLS-verified), the backup agent with the lead admin not away and then away, an unverified agent, the VA, the TC, and a buyer (who must get "No access"). Fictional records are seeded by SQL: a deal with documents, a repair list and response, appointments, a lead, a CMA, a presentation and a launch kit. It visits every console page twice, first with all AI switches off and then with them all on. Each page is checked for its status, axe (WCAG 2.2 AA tags) at 1440 and 390 px, no sideways scrolling at 390 and 320 px, and no console errors. Pages that should be a 404 may log their own 404. A keyboard pass Tabs through the new interactive pages, checking that every control is reachable with a visible focus and that there is no trap; date and time inputs take several Tabs, which is expected. The fake Claude's request log must not grow during page loads. It needs migrations up to 0035, `SERVICE_KEY` and `CLAUDE_LOG`. The report and a few screenshots go to `docs/screenshots/s6b-final/`; everything it adds is removed at the end.

### Live test against the real model (`test:live`)

`apps/va/src/live/live-ai.live.ts` runs every AI feature once (20 calls covering the 19 switches) through the same `runAi()` pipeline the console uses, with fictional input. It never runs in CI or in `pnpm test`: it has its own config (`vitest.live.config.ts`), and it refuses to start when `CI` is set.

- **Fake mode** uses the local fake on :4020 and costs nothing:

```bash
LIVE_AI_FAKE=1 pnpm --filter va test:live
```

- **Live mode** sends real requests and costs money. Run it only with the owner's go-ahead, and only with a dedicated, spend-limited key in your own shell (see STATUS):

```bash
LIVE_AI=1 ANTHROPIC_API_KEY=… pnpm --filter va test:live
```

- **Spending cap:** `LIVE_AI_BUDGET_USD` (default $5 live). Before each call, the test refuses it if what has been spent plus that call's worst case would pass the cap; that call is reported "not run".
- **Re-running some calls:** use `LIVE_AI_ONLY=<call id>,…`.
- **Hard fails:**
  - a model call that doesn't end ok;
  - wiring or contact details in what a person would see;
  - the injection canary in any raw answer;
  - an expected refusal that doesn't happen;
  - spend over the cap.
- **Findings:** semantic checks (the price read from the counter, the appointment date) are reported, not failed.
- **Where results go:**
  - A full live run writes metadata only to `docs/qa/s6b-live-run.json`.
  - Fake and partial runs write to `apps/va/.live-ai/`, which is gitignored and also holds the raw answers.

`apps/va/src/lib/feature-coverage.test.ts` runs in `pnpm test` and CI. It finds every exported AI feature by shape and fails if one has no live call, or if the calls' switches differ from the 19 on /assistant.

## Ask Vabrato, the member assistant (S5b)

`s5b-assistant.mjs` covers the member assistant in `/my` (S5b PR 1) with fictional members, using the fake Claude server as in S6b:
- **Off by default:** no menu item, the page says it isn't available, and nothing is sent.
- **Switches:** an admin turns on the two member switches and the master switch on the console's /assistant page.
- **Explain a term:**
  - a labelled answer with "Not legal or tax advice";
  - "Ask my agent" fills Messages but doesn't send;
  - wiring or Fair Housing wording in an answer isn't shown;
  - a steering question gets the neutral answer with nothing sent.
- **Search by sentence:**
  - the filters as chips, and "Run this search" lands on `/search`;
  - an unknown city is dropped, and an answer with an extra field isn't used;
  - sold homes only for a buyer with VOW, on `/my/sold`.
- **Also:**
  - the daily limit;
  - a seller, a both-role member and staff (console notice);
  - one switch on;
  - axe at 1440 and 390 px, no sideways scrolling at 390 and 320 px, the keyboard, and page loads sending nothing.

Modes come from `QA-MODE: wiring|steering|refusal|extra|elsewhere` in the member's words.

Setup:
- Start both apps with `ANTHROPIC_BASE_URL=http://127.0.0.1:4020` and any `ANTHROPIC_API_KEY`.
- It needs migrations up to 0036, `CLAUDE_LOG`, `MAIL_DIR`, `PGURL` and `REVALIDATE_SECRET`.
- The fake reports 61,000 tokens a call, so the run raises the member token limit and puts it back.

Screenshots go to `docs/screenshots/s5b-assistant/`. Everything it adds is removed, and every switch and setting it touches is put back.

The website has its own live test: `apps/web/src/live/live-ai.live.ts`, run with `pnpm --filter @vabrato/web test:live`, in fake (`LIVE_AI_FAKE=1`) or live (`LIVE_AI=1`) mode, as in S6b.
- It shares its helpers with the console's live test through `@vabrato/ai/live`.
- It never runs in CI.
- `apps/web/src/member/assistant/coverage.test.ts` (in CI) fails if a member AI feature has no live call, or no switch on the console.
