# Project Status

> Last updated: 2026-11-10 (S4 public website). Update this file when a phase completes or a blocker changes.

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
- Render: MLS sync jobs. Documented in S3 (`packages/mls/RENDER.md`), not deployed until
  MLSListings credentials arrive

## Segments (SPEC `<segments>`)

| # | Segment | State |
|---|---|---|
| S1 | Repo prep & plan | Done 2026-11-09 |
| S2 | Design system | Done 2026-11-09 |
| S3 | MLS package (mock first) | Mock complete 2026-11-10; live 7-day criterion blocked on MLSListings credentials |
| S4 | Public website | Built and QA'd 2026-11-10; launch content and MLSListings material outstanding (not blocking S5) |
| S5 | Membership portal | In progress: PR 1 accounts and sign-in (0015–0016 applied to the hosted project 2026-11-10) |
| S5b | Member AI assistant (Ask Vabrato) | Not started |
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

### S2 (done)

- `packages/ui` web design system. Entry points: `@vabrato/ui` (legacy VA
  `T`/`Panel`/`OwnerChip`, unchanged, plus web tokens), `@vabrato/ui/web`
  (components), `@vabrato/ui/tokens.css`, `@vabrato/ui/tailwind-preset`.
- Tokens: colors, type scale, 4px spacing, uppercase tracking, shadows, as TS
  (`tokens.ts`) and CSS variables (`tokens.css`); a test keeps them in sync.
  Fonts via `next/font` in `apps/web/src/app/fonts.ts` (Bodoni Moda, Libre
  Baskerville, Roboto) exposed as `--font-display/--font-subhead/--font-body`.
- Components: site chrome (SiteHeader, SocialRail, BreadcrumbBar,
  SectionTitle, Button, Footer with MLS disclaimer slot + Equal Housing),
  listings (ListingCard with badges + IDX attribution slot, SoldTile,
  StatStrip), home sections (Hero tabs, WelcomeBlock, VideoFeature,
  BeforeAfterSlider, TestimonialCarousel, VideoGrid, NewsList, PortalPitch,
  NeighborhoodTiles, FAQAccordion with FAQPage JSON-LD, ConnectNewsletter),
  agent profile (AgentHero, AgentStatRow, SkillList, ContactForm, ReviewCard),
  portal (PortalShell, Panel, Pill, KpiTile, StatusLadder, Timeline, TodoItem,
  WiringBanner, AIDraftLabel/AIConceptBadge — visual only, no AI calls).
- `/styleguide` in apps/web (noindex, fictional data, grey placeholders).
  axe-core: 0 violations at 1440px and 390px. Screenshots in
  `docs/screenshots/s2/`.
- **Contrast decisions (WCAG 2.2 AA):** gold-ink darkened from #B8862B
  (3.24:1, failed) to **#8F6A1F** (4.94:1 on white). gold-50 tint set to
  #FEF6E0 so gold-ink labels on it pass (4.58:1). Never used for text or
  controls: gold on white/soft, muted on navy (use white/80), `line` as a
  field border (fields use `muted`). Enforced by `tokens.test.ts`.
- Follow-ups: real logo SVG (the `Logo` component renders a text wordmark until
  `src` is passed); official MLSListings IDX icon and disclaimer text (S3/S4,
  via ListingCard `idxIcon` and Footer `mlsDisclaimer`); apps/va adopts the
  web preset in S6. SoldTile / sold badges / StatStrip stay behind
  `public_sold` / `public_stats` on real pages (MLS-10).

### S3 (mock complete; blocked on credentials for the live criterion)

- `packages/mls` (see its README): RESO client (OAuth2 client credentials,
  rate limit, retries/backoff honouring Retry-After, nextLink + $skip paging,
  token sent only to the API origin), configured by `MLS_MODE` / `MLS_OFFICE_ID`
  plus `MLS_TOKEN_URL`, `MLS_RATE_LIMIT_PER_SEC`, `MLS_PHOTO_MODE`,
  `MLS_SOLD_HISTORY_YEARS`.
- Mock RESO API (in-process fetch + `pnpm --filter @vabrato/mls mock`) with 24
  fictional Property fixtures (active, under contract, pending, sold in/out of
  window, withdrawn/expired/canceled/hold/coming soon, opt-out, address hidden,
  AVM/comments off, other offices, out of area, other MLS) plus Media,
  OpenHouse, Member, Office. Fault injection for 401/429/5xx.
- Migrations `0011_feature_flags` (`feature_flags` with `public_sold` /
  `public_stats` OFF, `profiles.vow_accepted_at`), `0012_mls` (one table per
  data level, RLS, `has_vow_access()`, `has_full_mls_access()`,
  `mls_sync_health()`), `0013_mls_storage` (public `mls-photos` bucket, no
  object policies). **Applied to the hosted project** via the Supabase MCP;
  `types.gen.ts` regenerated. Tables are empty (no data loaded).
- Sync: incremental by `ModificationTimestamp` (5-min overlap; failed runs
  never move the high-water mark), nightly reconcile (deletes vanished /
  ineligible listings, drift re-fetch, office roster, ACC-1 re-check), purge
  for MLS-9. One run at a time; abandoned runs marked failed. Every run logged
  in `mls_sync_runs` with counts. Photos: `hotlink` (default) or `copy` into
  `mls-photos`, behind `MLS_PHOTO_MODE`.
- ACC-1 database side: `mls_agent_access` + `verifyAgentAccess()` (S6 calls it
  at console sign-in) + nightly re-check. FULL access needs a verification
  within 36 h, an Active member of our office, and a staff role, so it locks
  itself if the nightly job stops. Sign-in hook is S6.
- MLS-7: FULL projections only in `@vabrato/mls/full`; ESLint
  `no-restricted-imports` outside apps/va; guard test scans the other apps.
- RLS test harness: `@vabrato/db/testing` runs every migration in PGlite with
  a Supabase shim (anon/authenticated/service_role, auth.uid(), storage stub).
  `packages/db/test/mls-rls.test.ts` covers every MLS table (IDX/VOW/FULL,
  public_sold, ACC-1 lockouts, SEC-2 isolation, write denial).
- Render jobs documented in `packages/mls/RENDER.md` and
  `render.example.yaml` (not deployed): `*/15` incremental, nightly reconcile
  10:17 UTC, dedicated `mls_sync` DB role.
- Decisions made in S3: no PostGIS column yet (lat/lng numerics). S4 kept
  it that way: map bounds use a lat/lng btree index; PostGIS comes with
  draw-area saved searches (S5). `is_own_listing` is set at sync time from
  `MLS_OFFICE_ID`. `ComingSoon` and `IDXParticipationYN=false` are treated as not
  displayable until MLSListings confirms. Broker open houses are not stored. The
  reconcile filters by status server-side and checks county locally.
- Advisor notes, accepted: `has_full_mls_access` / `has_vow_access` are
  executable by `authenticated` (same as `is_admin`: RLS needs it; they answer
  only about the caller). `mls_listings` has two SELECT policies on purpose
  (public for-sale vs VOW sold). New MLS indexes show as unused until data
  arrives.

**Blocked on MLSListings (S3 live criterion: 7 days of clean live sync):**
credentials (base URL, token URL, client id/secret); whether `OfficeMlsId` is
`VABRA` or `VABRA-1`; whether Media and OpenHouse are separate resources; whether
photos may be copied (`MLS_PHOTO_MODE=copy`); sold history depth (3 or 5 years);
the IDX/VOW field rules, to confirm the provisional allowlists in
`packages/mls/src/levels/fields.ts`; ComingSoon display; the official IDX icon and
disclaimer text (S4); whether an MLSListings sign-in service exists (ACC-2).
Then: create the Render jobs and the `mls_sync` role per RENDER.md.

### SEC-2 member-isolation tests (2026-11-10, before S4)

- `packages/db/test/member-isolation.test.ts` (PGlite, 61 tests): profiles,
  deals, deal_members, deal_contingencies, tasks, receipts, notifications,
  vendors, deal_vendors, tracked_properties, property_events, inbound_emails,
  and storage objects in `deal-docs` / `receipts`. Each checks cross-member
  reads and writes, staff/admin scope, and anon. A mutation check (loosened
  policies) makes 24 of them fail, as it should.
- Hosted storage policies checked with `packages/db/test/hosted-storage-check.sql`
  (rolls itself back): same results as PGlite; `mls-photos` is not listable
  or writable by API roles.
- **Resolved in S5 (0016):** "staff reads all profiles" is replaced. Admin
  sees everyone; agents see members assigned to them (`profiles.agent_id`,
  default from `app_settings.default_agent_id`) and clients on their deals;
  VA/TC see clients on deals they work; staff see staff. Tests updated.
- No staff policy on the buyer tracker: agents can't see buyers' tracked
  properties yet (S5 decides).

### S4 public website (built 2026-11-10; PRs #6–#11)

- **Pages (apps/web, all G1):**
  - home (mockup 01);
  - `/search` with list, filters, paging and a Mapbox map behind `NEXT_PUBLIC_MAPBOX_TOKEN` (list-only without it);
  - `/listing/[key]/[slug]` (mockup 03) with the `.ics` open-house download, a templated Q&A, a payment estimate and a tour request;
  - `/open-houses`, `/properties`, `/buy`, `/neighborhoods` plus 35 city pages (`/explore` 308s there);
  - `/about`, `/team/[slug]`, `/testimonials`, `/contact`, `/sell`, `/transform`, `/insights` and its posts;
  - the `/join` stub, `/privacy`, `/terms`, `/accessibility`;
  - branded not-found and error pages.
- **homes.sancarloslife.com (G2):** San Carlos listings and detail, Vabrato-branded with the broker disclosure. Canonical URLs point to vabrato.com. The host returns 404 while `site_scl_enabled` is off (it is off).
- **Database:** `0014_content.sql`, applied to the hosted project.
  - Content tables: `cities`, `city_guides`, `agent_profiles`, `testimonials`, `videos` and `posts`, each with `is_placeholder`.
  - `leads`, insert-only with per-email and per-IP limits, plus `purge_old_leads()` (24 months; S6 schedules it).
  - Public functions: `search_listings()`, `mls_last_updated()`, and `public_own_sold()` behind `public_sold`.
  - The `source = 'mock'` marker. The preview project holds the fictional fixtures (IDX tables only).
- **MLS rules:**
  - MLS-1 attribution and last-updated time on every listing page, enforced by a guard test.
  - MLS-2 courtesy line and IDX icon on other brokers' listings.
  - MLS-3 hidden-address listings: city-only title, slug, JSON-LD, sitemap and `.ics`.
  - MLS-6/10: no sold data signed out.
  - MLS photos are served unoptimized. Pages revalidate every 15 min or by tag from the sync job (`/api/revalidate`). Listings that leave the feed return 404.
- **Forms:** server actions with Zod, a honeypot, optional Turnstile, and a hashed-IP limit. Each form links the privacy notice and has an optional call/text consent. Leads stay unrouted until S6.
- **SEO:**
  - schema-dts JSON-LD: RealEstateAgent, RealEstateListing, Event, Place, Person, Article, BreadcrumbList, and FAQPage on the home and city pages. No Review or AggregateRating markup.
  - Sitemap generated; robots disallow and noindex until S9.
  - Metadata is rendered in `<head>` for every user agent (`htmlLimitedBots`).
- **QA (PR #11, `scripts/qa/`):**
  - axe (WCAG 2.2 AA tags) at 1440 and 390 px on all 30 page types, including the homes.sancarloslife.com pages: 0 violations.
  - Lighthouse mobile on home, search, listing (own and hidden address), city, agent and contact: performance 94–96, accessibility 100, best practices 100. SEO is 66 only because of noindex.
  - The JSON-LD check passes on every page.
  - Report and screenshots in `docs/screenshots/s4/`.
  - Run against a local production build on Postgres 16 + PostgREST with the same migrations and preview seed. This session can't reach the hosted project or `*.vercel.app`. How to rerun it against the preview: `scripts/qa/README.md`.
- **Still to do by hand:** paste a preview listing, city and post URL into validator.schema.org (blocked from this session). Send one test lead on the preview and delete it afterwards.

**Outstanding for launch (S9), not blocking S5.** Full list in [s4-content-checklist.md](s4-content-checklist.md):
- MLSListings' official IDX icon and disclaimer (one file, `apps/web/src/lib/mls-legal.ts`);
- the Mapbox token;
- Turnstile keys, `LEAD_IP_SALT` and `REVALIDATE_SECRET` in Vercel;
- real copy, photos, bios, testimonials and the San Carlos guide;
- the office phone (currently a fictional 555 number) and the CSLB license number;
- final legal pages;
- homes.sancarloslife.com DNS, Vercel domain, then the flag;
- purging the preview fixtures before the live feed.

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

## Decisions

- **2026-11-09 — AI policy change (owners):** AI is now allowed in `/my`,
  apps/mobile and the agent console under SPEC `<ai_rules>`; not on signed-out
  public pages at launch. Each AI feature sits behind its own feature flag;
  all model calls go through server-side `packages/ai`. Replaces the old
  no-runtime-AI rule (CLAUDE.md hard rule, SPEC AI-1 to AI-9). Buyer email
  parsing stays deterministic and automatic client notifications stay static
  templates. New segment S5b (Member AI assistant, Ask Vabrato).

## Where things stand

### Done and validated live (against the hosted Supabase project)

- **Foundation** — pnpm monorepo; 14 migrations (RLS on every table, storage buckets)
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

Tests: 490 across packages/db (PGlite RLS and member isolation), packages/lib, packages/ui, packages/mls and the
four apps (`pnpm test`).

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
See `.env.example` (MLS_* variables; `DATABASE_URL` is for the Render sync job only). Point local
`.env.local` files at the **Vabrato Website** project; the old prototype
project is paused. Re-link the Supabase CLI from `packages/db`
(`pnpm exec supabase link --project-ref cdfztmmhvtkurcyigtzk`).

## Gotchas learned the hard way

- Migrations on the Vabrato Website project were applied through the Supabase
  MCP connector, so the remote migration history uses timestamp versions, not
  0001–0014. Before using `supabase db push` from the CLI, run
  `supabase migration repair` to mark 0001–0014 as applied, or keep applying
  new migrations through the connector.
- `types.gen.ts` covers `public` and `storage`. The MCP type generator returns
  `public` only, so splice its output into the public section rather than
  replacing the file (or use the CLI `gen:types`, which includes both).
- RLS tests run in PGlite (no PostGIS, stub storage). Keep new migrations
  PGlite-compatible, or extend the shim in `packages/db/test/harness.ts`.

- Next's fetch cache lives in `.next/cache` and survives rebuilds. After
  changing a feature flag or content directly in the DB, call
  `/api/revalidate?tag=content` (or `tag=mls`) or wait the 15-minute
  revalidate; locally, deleting `.next/cache/fetch-cache` also works.

- Magic links are single-use and must be opened in the SAME browser that
  requested them (PKCE) — Gmail opening links in another browser breaks it.
- Don't run `next build` for an app while its dev server is running — they
  share `.next` and the dev server 500s (`Cannot find module './NNN.js'`).
  Fix: stop server, delete the app's `.next`, restart.
- Parallel `next build`s race on Next's telemetry config on Windows — build
  with `--workspace-concurrency=1` or `NEXT_TELEMETRY_DISABLED=1`.
- supabase-js ≥2.108 changed SupabaseClient generics; keep @supabase/ssr at
  ^0.12 and regenerate db types rather than hand-writing them.
