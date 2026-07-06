# Project Status

> Last updated: 2026-07-07. Update this file when a phase completes or a blocker changes.

## What this is

Three apps on one Supabase backend for Vabrato (residential real estate):
**va** (internal transaction desk, :3000), **seller** (client portal, :3001),
**buyer** (property tracker, :3002). Stack and hard rules in [CLAUDE.md](../CLAUDE.md).

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

Tests: 78 across packages/lib, packages/ui, and the three apps (`pnpm test`).

### Blocked / waiting

- **Resend SMTP + notification sending** — blocked: nobody currently has
  access to vabrato.com DNS (needed to verify the domain in Resend). Once
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
- Deployment to Vercel (repo had no remote until now).
- Seller/buyer notification recipients beyond sellers; deal_vendors linking UI.

## Environment (local values are NOT in git)

Each app has a gitignored `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`; apps/va additionally has
`SUPABASE_SERVICE_ROLE_KEY` (invite flow + notification processor).
See `.env.example`. Supabase CLI is linked to the hosted project from
`packages/db` (`pnpm exec supabase ...` there).

## Gotchas learned the hard way

- Magic links are single-use and must be opened in the SAME browser that
  requested them (PKCE) — Gmail opening links in another browser breaks it.
- Don't run `next build` for an app while its dev server is running — they
  share `.next` and the dev server 500s (`Cannot find module './NNN.js'`).
  Fix: stop server, delete the app's `.next`, restart.
- Parallel `next build`s race on Next's telemetry config on Windows — build
  with `--workspace-concurrency=1` or `NEXT_TELEMETRY_DISABLED=1`.
- supabase-js ≥2.108 changed SupabaseClient generics; keep @supabase/ssr at
  ^0.12 and regenerate db types rather than hand-writing them.
