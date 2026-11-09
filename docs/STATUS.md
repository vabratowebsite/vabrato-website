# Project Status

> Last updated: 2026-11-09 (S1). Update this file when a phase completes or a blocker changes.

## What this is

The Vabrato platform: public website + member portal (**web**, :3003), agent
console (**va**, :3000), mobile app (S7), on one Supabase backend with our own
MLSListings feed (**packages/mls**). The **seller** (:3001) and **buyer** (:3002)
prototypes are being folded into web `/my` (S5). Product spec in
[SPEC.md](SPEC.md); stack and hard rules in [CLAUDE.md](../CLAUDE.md).

## Accounts (all Vabrato-owned)

- GitHub: `vabratowebsite/vabrato-website` (public during the build; CI on every PR)
- Supabase: org "Vabrato Real Estate Services", project **Vabrato Website**
  (`cdfztmmhvtkurcyigtzk`, us-west-1). The old prototype project "Vabrato App"
  is paused and no longer used.
- Vercel (Hobby): `vabrato-website` → apps/web; `vabrato-console` → apps/va
- Cloudflare: vabrato.com DNS/CDN (DNS access confirmed Nov 2026)
- Render: MLS sync jobs (set up in S3)

## Segments (SPEC `<segments>`)

| # | Segment | State |
|---|---|---|
| S1 | Repo prep & plan | Done 2026-11-09 |
| S2 | Design system | Next |
| S3 | MLS package (mock first) | Not started; live credentials pending MLSListings |
| S4 | Public website | Not started |
| S5 | Membership portal | Not started |
| S6 | Staff console & automations | Not started |
| S7 | Mobile app | Not started |
| S8 | SEO migration | Not started |
| S9 | Launch QA | Not started |

### S1 (done)

- `apps/web` scaffold: holding page (noindex, robots disallow), host-based
  routing for homes.sancarloslife.com (`src/lib/site.ts`, tested).
- `packages/mls` scaffold: env config (`MLS_MODE` mock|live, `MLS_OFFICE_ID`),
  tested; README with the S3 layout.
- ESLint (next/core-web-vitals + typescript) at the root; `pnpm lint` is clean.
- GitHub Actions CI: typecheck, lint, test on PRs and pushes to main.
- Migrations 0001–0009 applied to the Vabrato Website Supabase project, plus
  new `0010_hardening.sql` (security advisor fixes: pinned search_path, no RPC
  access to the signup trigger, RLS helpers not callable signed-out).
  Generated public types match `types.gen.ts`.
- Remaining advisor notes, accepted: RLS helpers executable by
  `authenticated` (required by the policies); `inbound_emails` has no policies
  (service-role only, by design). Performance notes to address when tables
  get real traffic: wrap `auth.uid()` as `(select auth.uid())` in policies,
  index the 6 unindexed foreign keys, merge duplicate SELECT policies.
- CLAUDE.md updated for the new apps and rules.

### Plan: retire apps/buyer and apps/seller (do in S5)

| What | Moves to |
|---|---|
| Buyer pages (property list/detail, add-property form, actions) | apps/web `/my/buyer` |
| Seller pages (timeline, to-dos, wiring banner, actions) | apps/web `/my/seller` |
| Login page, login form, auth callback (duplicated in 3 apps) | one shared version in packages/lib; `/my` uses it |
| `property-schema.ts` (+ test), `timeline.ts` (+ test) | packages/lib (shared with apps/mobile) |
| access-denied, header components | packages/ui |
| `middleware.ts`, `supabase-server.ts`, `auth.ts` role guards | apps/web, using packages/lib helpers |

Then delete apps/buyer and apps/seller (test-only prototypes, no real users,
no data migration). Test count must not drop: tests move with the code.

## Where things stand

### Done and validated live (against the hosted Supabase project)

- **Foundation** — pnpm monorepo; 9 migrations (12 tables, RLS, storage buckets)
  applied to the hosted project; types generated from the live schema
  (`pnpm --filter @vabrato/db gen:types` after any migration).
- **Auth** — magic-link + Google helpers via @supabase/ssr; per-app role guards.
  Validated end-to-end: sign-in, profile trigger, buyer-by-default role,
  admin promotion (via SQL — role changes are deliberately not self-service).
- **Schedule engine** (`packages/lib/src/schedule.ts`) — the core. Algorithmic
  US federal holidays (observed shifts), COE and all due dates rolled off
  weekends/holidays, COE-anchored closing-week templates, trust/probate tasks,
  contingency overrides, rent-back. Sweep-tested (2 years × 6 escrow lengths).
  Snapshot of the seed deal (rat 2026-02-24, 15d → COE 2026-03-11) verified by
  the user.
- **VA desk** — deal list, intake form with live COE preview, task list by
  phase with done-toggles, calendar tab (month grid), receipts tab
  (manual logging + reimbursement total), org-wide vendors rolodex,
  seller-access panel.
- **Seller portal** — milestone timeline, seller to-dos, wiring-safety banner.
  Invite flow creates the auth user via service role with NO email sent
  (avoids mailer rate limit); seller signs in later with a magic link.
- **Buyer tracker** — tracked properties with status ladder, per-property
  activity feed (empty until inbound parsing lands).
- **Notification pipeline (code-complete)** — 5 static seller templates
  (merge fields only, no runtime AI), rows queued on seller invite (future
  dates only, re-invite replaces), DI processor + Resend REST sender at
  `apps/va /api/notifications/process` behind `CRON_SECRET`. Returns 503 until
  `RESEND_API_KEY` exists; rows stay `scheduled`.

Tests: 87 across packages/lib, packages/ui, packages/mls and the four apps (`pnpm test`).

### Blocked / waiting

- **Resend SMTP + notification sending** — now unblocked: vabrato.com DNS
  access confirmed (Nov 2026). Still to do: verify the domain in Resend. Once
  solved: verify domain → set `RESEND_API_KEY` + `NOTIFICATIONS_FROM` +
  `CRON_SECRET` → add a Vercel cron hitting `/api/notifications/process`.
  This also lifts the built-in Supabase mailer's ~2-emails/hour cap on
  magic links.

### Not started

- Inbound email parsing for the buyer tracker (deterministic per-source per
  CLAUDE.md). Needs: Postmark vs SendGrid Inbound Parse decision + a deployed
  webhook URL. Writes to `inbound_emails` / `property_events` (service-role
  only — schema is ready).
- Integrations: Google Calendar sync, Google Drive / Dropbox receipt import
  (va only), AI OCR for receipts (va only, behind a flag).
- Seller/buyer notification recipients beyond sellers; deal_vendors linking UI.

## Environment (local values are NOT in git)

Each app has a gitignored `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`; apps/va additionally has
`SUPABASE_SERVICE_ROLE_KEY` (invite flow + notification processor).
See `.env.example` (now includes the MLS_* variables). Point local
`.env.local` files at the **Vabrato Website** project; the old prototype
project is paused. Re-link the Supabase CLI from `packages/db`
(`pnpm exec supabase link --project-ref cdfztmmhvtkurcyigtzk`).

## Gotchas learned the hard way

- Migrations on the Vabrato Website project were applied through the Supabase
  MCP connector, so the remote migration history uses timestamp versions, not
  0001–0010. Before using `supabase db push` from the CLI, run
  `supabase migration repair` to mark 0001–0010 as applied, or keep applying
  new migrations through the connector.

- Magic links are single-use and must be opened in the SAME browser that
  requested them (PKCE) — Gmail opening links in another browser breaks it.
- Don't run `next build` for an app while its dev server is running — they
  share `.next` and the dev server 500s (`Cannot find module './NNN.js'`).
  Fix: stop server, delete the app's `.next`, restart.
- Parallel `next build`s race on Next's telemetry config on Windows — build
  with `--workspace-concurrency=1` or `NEXT_TELEMETRY_DISABLED=1`.
- supabase-js ≥2.108 changed SupabaseClient generics; keep @supabase/ssr at
  ^0.12 and regenerate db types rather than hand-writing them.
