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
| S5 | Membership portal | Built and QA'd 2026-11-10 (PRs #12–#17; 0015–0021 on hosted). Live alert delivery waits on MLSListings credentials, Render and Resend; VOW built, off pending MLSListings |
| S5b | Member AI assistant (Ask Vabrato) | In progress: plan v2 (owner answers 2026-11-13). PR 1 merged (the Ask Vabrato page, explain a term, search by sentence; 0036 on hosted 2026-11-13, both switches off). PR 2 merged (summarize a document, suggested to-dos, My to-dos; 0037 on hosted 2026-11-13, switch off). PR 3 merged (drafts and offer cover letters, My drafts; 0038 on hosted 2026-11-14, both switches off). PR 4 merged (compare homes, ask about a home; 0039 on hosted 2026-11-14; locked behind the MLSListings approval switch, off until MLSListings confirms in writing). PR 5 merged (moving plan, pre-listing checklist, tour day; 0040 on hosted 2026-11-14; tour day also behind the MLSListings approval switch). PR 6 merged (colors and moodboard, staging ideas, open-house flyer and posts approved by the agent; 0041 on hosted 2026-11-14; no AI images yet). Next: PR 7 (final QA and the member calls in the live run). Every switch off |
| S6 | Staff console & automations | Done 2026-11-12 (PRs #18–#25; 0022–0025 on hosted). Done-when met live: a website contact form reached the lead admin's inbox via Resend 1.0 s after the lead was created (Rachanee's account standing in as lead admin until Mark signs in; repeat the check once routing moves to Mark). Stats, CMAs and public stats built, flags off pending MLSListings |
| S6b | Staff AI assistant (the VA assistant) | Built 2026-11-13: PR 1 foundations merged (`packages/ai`; 0026 on hosted 2026-11-12, `ai_enabled` off). PR 2 merged (assistant page, AI settings, contract reader; 0027 on hosted 2026-11-12, both AI flags off). PR 3 merged (drafts: lead replies, open-house follow-ups, escrow updates, vendor quote requests; 0028 on hosted 2026-11-12, all switches off). PR 4 merged (daily briefing, member activity summary, questions about your work; 0029 on hosted 2026-11-12, all switches off). PR 5 merged (listing launch kits, listing and buyer presentations; 0030 on hosted 2026-11-12, all switches off). PR 6 merged (market updates, CMA write-ups, CMA in listing presentations; 0031 on hosted 2026-11-12, all switches off). PR 7a merged (deal documents, seller-type checklist, document check, receipt reader; 0032 on hosted 2026-11-12, all switches off; the checklist draft is in use as written and Mark's review of its (confirm) rows is deferred, owner decision 2026-11-13). PR 7b merged (repair items, bid list, response to the buyer's request; 0033 on hosted 2026-11-13, all switches off). PR 7c merged (counter-offer changes, check unchecked documents; 0034 on hosted 2026-11-13, all switches off). PR 8 merged (call notes to to-dos and a follow-up, appointment drafts, staff to-dos; 0035 on hosted 2026-11-13, all switches off). PR 9 merged (final QA, the live test harness, the Fair Housing, Today and notification-bell fixes; no migration). The live test against the real model runs just before the first AI switch goes on, not now (owner decision 2026-11-13). No AI feature is on: every flag is off until Anthropic's written Zero Data Retention confirmation |
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

### S5 membership portal (built 2026-11-10; PRs #12–#17)

- **Accounts (PR 1, #12):** one free account per person, with role buyer,
  seller or both. Join and sign-in use a magic link or Google (Google OAuth is
  in Testing mode with 5 test users). Also:
  - an onboarding fallback, with consents unchecked by default;
  - account page and a deletion request queue;
  - the assigned agent card;
  - the staff notice.
- **Saved homes and searches (PR 2, #13):** hearts and "Save search" on the
  public pages, Compare, and the price-history teaser. The VOW pages
  (`/my/sold`, `/my/listing/[key]`, history) are built and tested, but off
  behind `vow_enabled` until MLSListings allows VOW.
- **Alerts (PR 3, #14):** `run_member_alerts()` runs after each sync. It
  feeds the bell, the "What changed" feed, and instant or daily emails
  (static templates, one-click unsubscribe).
- **Buyer records (PR 4, #15):**
  - homes I'm pursuing (the tracker moved from apps/buyer);
  - tour requests, which only staff confirm;
  - the buyer agreement field;
  - documents (magic-byte check, signed download links);
  - messages with the agent, plus the console inbox.
- **Seller portal (PR 5, #16):** the timeline, to-dos, wiring banner,
  calendar download and listing activity. Also open-house sign-in links, and
  the listing-key field in the console. apps/buyer and apps/seller are deleted.
- **Done-when:**
  - G3 complete: yes.
  - RLS tests for every member table: yes (`packages/db/test/member-*.test.ts`).
  - Test buyer alerted within 30 minutes of a feed change: proven against the
    mock feed (`packages/mls/src/sync/alerts.e2e.test.ts`). Live delivery waits
    on MLSListings credentials, the Render sync job and Resend.
- **QA (PR 6):**
  - `scripts/qa/s5-qa.mjs` covers 32 pages signed in as fictional buyer,
    seller, both, VOW and staff accounts, plus the signed-out account pages.
    axe at 1440 and 390 px: 0 violations in 64 runs.
  - Screenshots and `report.json` are in `docs/screenshots/s5/`.
  - The five flow scripts (auth, saved, alerts, buyer, seller) all pass.
  - All runs used a local production build on Postgres 16 with Supabase Auth
    and PostgREST.
  - Checked on the preview by you: Google sign-in and document uploads.
- **Your steps (not blocking S6):**
  - Set `LISTING_VIEW_SECRET` on vabrato-website and add its hash to the
    database (the SQL is under "Seller portal setup" below).
  - Once Mark has signed in on the website, make Mark's account admin and default agent
    (`app_settings.default_agent_id`). Confirm the SQL with Claude first.
  - Turn on Resend (domain verification, `RESEND_API_KEY`,
    `NOTIFICATIONS_FROM`). This also lifts the magic-link email cap.
  - VOW Terms of Use wording (legal) before `vow_enabled` is turned on.
  - At S9: Google OAuth privacy and terms links, then publish the OAuth app.
- **Follow-ups:** regenerate `packages/db/src/types.gen.ts` from hosted. It
  was hand-edited for 0015–0021, and the tests and typecheck cover it.

### S6 staff console (done 2026-11-12; PRs #18–#25)

Plan v3 (approved 2026-11-11): PR 1 frame and Today; PR 2a lead routing and
notification pipeline (pg_net + pg_cron); PR 2b leads UI; PR 3 members, MLS
sync, ACC-1; PR 4 content editor and featured listings; PR 5 seller weekly
report (live), market stats and CMAs (behind flags, off); PR 6 QA. S5b (AI)
comes after S6, by decision; the console has no AI code.

- **PR 1 (console frame):** apps/va moved to the web design system (preset,
  tokens, Bodoni/Libre Baskerville/Roboto) on `PortalShell` (mockup 07).
  Today page: new leads, members, tour requests (30 days), open deals, newest
  leads, MLS feed health, automations. The deals list moved from `/` to
  `/deals`. The old warm palette failed WCAG contrast on every console page;
  after the move, axe passes on all 11 pages at 1440 and 390 px.
  Before/after screenshots: `docs/screenshots/s6/restyle/`.
- **PR 2a (lead routing and alerts, migration 0022):**
  - Every lead goes to the lead admin (Mark), or to the backup (Viv) while
    Mark is away (with an optional "until" time). Routing is empty on hosted
    until Mark and Viv have accounts; until then leads stay unassigned, every
    role admin is alerted, and role admins see all leads.
  - Visibility: the acting lead admin sees every lead; everyone else sees only
    leads assigned to them. Lead changes go through functions (reassign,
    status, "replied", notes); nobody updates the table directly.
  - Each lead and member message queues an in-console alert and an email in
    the same transaction, then pokes the console's sender over pg_net. A
    pg_cron job every minute re-pokes, escalates leads with no reply after
    2 hours (setting), and flags email waiting over 2 minutes. More than 10
    lead emails in an hour (setting) switch to a 15-minute digest. Retention
    stays 24 months, now keeping leads linked to a member account.
  - Sending claims rows (FOR UPDATE SKIP LOCKED), retries failed sends with
    backoff up to 5 times, then fails and alerts admins; Resend gets the
    notification id as Idempotency-Key. The sender's secret check is
    constant-time.
  - Emails are static templates with a first name at most: no contact
    details, no message text.
  - Done-when proof: `packages/lib/src/__tests__/lead-alert.e2e.test.ts`
    (PGlite, every migration); local stack: a real contact-form lead reached
    a fake Resend 374 ms after submit (`scripts/qa/s6-lead-alert.mjs`).
  - **After 0022 is on hosted (your step):** in the Supabase SQL editor,
    `select vault.create_secret('https://console.vabrato.com/api/notifications/process', 'console_process_url');`
    and `select vault.create_secret('<the console CRON_SECRET>', 'console_cron_secret');`.
    Until `console.vabrato.com` is connected, also store a Vercel Protection
    Bypass for Automation secret as `console_bypass_secret` and use the
    vercel.app URL. Console env: `CRON_SECRET`, `CONSOLE_URL`,
    `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFICATIONS_FROM`.
- **PR 2b (leads screens, no migration):** Leads inbox (new / mine / all
  open / closed, kind and site filters), lead page (contact, request, notes,
  "I've replied", close or reopen, reassign for the acting lead admin, how
  fast the alert email went out), Settings (lead admin, backup, escalation
  time, email cap, away with an optional end time), and an alert bell that
  polls every 20 seconds and, with permission, shows a desktop notification
  while the console tab is in the background. Today shows where new leads go
  and the median first reply. QA: `scripts/qa/s6-leads-ui.mjs` (agent sees
  only their own lead; axe clean at 1440 and 390 px).
- **PR 3 (members, MLS sync, FULL access; migration 0023):**
  - Members list (search, portal role, agent, saved, searches, pursuing),
    member page (account, saved homes and searches, homes pursued, requests,
    documents, deals), agent change by the acting lead admin (audited), and
    the account deletion queue.
  - MLS sync page: health, last 50 runs with counts or the sanitized error,
    how to run a sync on Render. While `mls_sync_live` is on (Settings), a
    failed or late sync alerts admins and the lead admin once per incident
    (console and email) and once on recovery; a banner shows on every
    console page meanwhile. Off until the live feed runs on Render.
  - ACC-1: the console's sign-in callback calls `verify_agent_access()` with
    `MLS_OFFICE_ID` (same rules as the sync job's check; a parity test
    compares them). It never blocks sign-in; Settings shows the result.
  - FULL data: `has_full_mls_access()` now also needs the
    `full_data_enabled` flag, off until MLSListings confirms FULL access in
    writing. Our listings shows IDX fields; private remarks and showing
    instructions appear only for verified agents with the flag on.
  - Console env adds `MLS_OFFICE_ID` (VABRA or VABRA-1, to confirm with
    MLSListings).
- **PR 4 (content with approval, agent photos, featured listings; migration
  0024):**
  - City guides, Insights posts and testimonials change only through
    revisions: anyone on staff drafts and sends for approval; only the acting
    lead admin (Mark, or Viv while Mark is away) publishes, sends back with a
    note, or takes a page down (audited). Direct writes to those tables are
    gone, role admins included. The website keeps the published version
    until a new one is approved. Publishing writes only to a fixed list of
    tables.
  - A testimonial needs its source and the client's permission (checkbox) to
    be published. Placeholders are marked as replaced when published.
  - Fair Housing (FH-1): a deterministic phrase check
    (`packages/lib/src/fair-housing.ts`) runs when a revision is sent, again
    when it's published, and when an agent saves their profile. "Must
    change" phrases (who a home suits, who lives somewhere, safety or
    "exclusive" areas, school-quality claims) block; "check" words (church,
    families, schools) are shown to the author and to Mark. School links in
    city guides must be official https sites; rating sites are refused.
  - Post previews use the website's own Markdown renderer (moved to
    `@vabrato/ui/markdown`): no raw HTML, no images, https/mailto/same-site
    links only.
  - My profile: agents edit their own bio, title and contact details
    directly (no approval) and upload a photo to the public `agent-photos`
    bucket, in their own folder only. The upload is checked by its first
    bytes (JPEG, PNG or WebP, 5 MB; an SVG renamed .png is refused). The
    About and team pages show the photo. Mark links logins to profiles and
    publishes them (SQL for now:
    `update agent_profiles set profile_id = '<profile id>' where slug = '<slug>';`).
  - Featured listings: staff pin for-sale listings with an order and
    optional first/last day (Pacific). The home page shows live pins first,
    then our own listings, then the newest others; a pin disappears when the
    listing leaves the market. Anon may now call `listing_cards` (IDX
    for-sale rows only) for the pinned cards.
  - After a publish, a pin or a profile change, the console calls the
    website's `/api/revalidate` (3 tries); otherwise the website catches up
    within 15 minutes and the console says so. Console env:
    `WEB_REVALIDATE_URL`, `REVALIDATE_SECRET` (same as the website's).
  - QA: `scripts/qa/s6-content.mjs` (36 checks, axe clean at 1440 and 390
    px on every new page); the console tour now covers 22 pages.
  - On hosted (2026-11-11): 0024 applied; advisors show nothing new beyond
    the expected notices for the five signed-in content functions (each
    checks the caller itself). `packages/db/test/hosted-content-check.sql`
    (rolled back, fictional cast) confirmed: an agent drafts and submits but
    can't publish; Mark publishes; nobody writes the content tables directly,
    role admins included; photos upload only to the uploader's own folder,
    members can't upload, the public can't list the bucket; the public sees
    a pin only for a for-sale listing; anon `listing_cards` returns for-sale
    rows only.
  - The website's home page falls back to our own listings if the pins
    can't be read (it failed to prerender before 0024 was on hosted).
- **PR 5 (seller weekly report, market stats, CMAs; migration 0025):**
  - Seller weekly report (live): Seller reports lists last week's numbers
    for every active deal linked to its listing (views, saves, tour
    requests, open-house sign-ins: the same counts as the seller's
    performance page). Staff open one, see the exact email (static template;
    an end-to-end test checks the preview equals what's sent) and press
    Send. It goes to each seller on the deal once per deal per week, is
    audited, and carries counts only (no lead details).
  - Market stats (built, off): per city and period, homes sold, median sale
    price, price per sq ft, sale-to-list, days on market, active and
    pending counts and months of inventory, plus a by-month table. Computed
    in the database; any median from fewer than 5 sales shows as a dash.
    Staff only, behind `market_stats_enabled`.
  - CMAs (built, off): verified agents (ACC-1, no FULL flag needed) search
    recent sales, pick up to 12 comparables and save. A saved CMA keeps the
    subject details and listing keys only (the database refuses other
    fields); it is rebuilt from the feed when opened, so a sale that left
    the feed shows as missing. Printable, with a price range from the
    comparables' price per sq ft, "not an appraisal" and MLS attribution.
    Behind `cma_enabled`.
  - Website city pages: market stats (aggregates only) behind `public_stats`
    (MLS-10, off). The read is best-effort, so the page renders even before
    0025 is on hosted.
  - MLS attribution (MLS-1) now shows on the console pages with MLS data:
    Our listings, Market stats, CMAs.
  - QA: `scripts/qa/s6-reports.mjs` (31 checks, axe clean at 1440 and 390
    px); console tour now 26 pages, 87 checks.
  - Turning stats and CMAs on needs MLSListings' written OK on sold data and
    derivative statistics (with Noel), then the sold data in the feed.
  - On hosted (2026-11-11): 0025 applied; advisors show nothing new beyond
    the expected notices for the new functions (each checks the caller;
    anon can call only `public_city_stats`, which returns nothing while
    `public_stats` is off; `market_stats_compute` is callable by no one).
    `packages/db/test/hosted-reports-check.sql` (rolled back, fictional cast
    and sold rows) confirmed: only staff on the deal can see or send the
    report; it sends once per week with no contact details; stats are off
    by default, staff only, and withhold medians under 5 sales; public
    stats return nothing with the flag off; CMAs return nothing while off
    or to an unverified role admin; saved CMAs refuse MLS fields and are
    visible to their author only. Hosted has no sold (VOW) rows.
- **PR 6 (QA pass, no migration):** `scripts/qa/s6-qa.mjs` signs in as
  each kind of staff member on the local stack and runs axe (WCAG 2.0–2.2 A
  and AA) at 1440 and 390 px on every console page. 248 checks, all
  passing; report and screenshots in `docs/screenshots/s6/`.
  - Lead admin (admin, MLS-verified): all 16 pages plus lead, member,
    content revision, city guide editor, seller report and deal pages; sees
    every lead, can approve and publish, can change routing.
  - Backup (agent): with Mark not away, own leads only, Mark's lead is a
    404, no publish button; with Mark away, sees Mark's lead and can
    publish.
  - Agent (not MLS-verified) and VA: every page loads, own leads only,
    Mark's lead is a 404; the agent can't publish their own revision or
    change routing; Settings shows MLS access isn't verified.
  - A buyer who signs in to the console gets "No access".
  - Timing: a website contact form reached Mark's alert email at the fake
    Resend 262 ms after the lead was created (target: under a minute).
- **S5 review item 17 is done:** new member messages alert the member's
  agent (or the lead admin) in the console and by email, staff replies email
  the member, and tour requests are leads, so they reach Mark the same way
  (PR 2a).
- **Live on hosted (2026-11-12):** Resend verified for vabrato.com; Supabase
  Auth sends through Resend SMTP; `console.vabrato.com` connected (Vercel,
  Cloudflare DNS); console and website variables set and redeployed; both
  Vault secrets stored. Checks: the database's call to the console returned
  200; a real contact form on the website (Turnstile on, IP hash recorded)
  was routed to the lead admin, raised the console alert and was accepted
  by Resend 1,016 ms after the lead was created, first attempt, no errors.
  Still to do: team sign-ins (step 5, postponed), then roles and routing to
  Mark and a repeat of the test with Mark's inbox. `WEB_REVALIDATE_URL`
  stays unset until vabrato.com points at the new site (the website's
  vercel.app address is behind Vercel's login), so published content shows
  within 15 minutes.
- **To finish S6 (your steps, in this order):** steps 1–4 and 6 done
  2026-11-12; step 5 postponed.
  1. Resend: verify vabrato.com, then set `RESEND_API_KEY` and
     `NOTIFICATIONS_FROM` on vabrato-console.
  2. Point `console.vabrato.com` at vabrato-console (custom domains skip
     Vercel's login wall, which pg_net would otherwise hit), or store a
     Protection Bypass for Automation secret as `console_bypass_secret`.
  3. Console env: `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `CONSOLE_URL`,
     `PUBLIC_SITE_URL`, `MLS_OFFICE_ID`, `WEB_REVALIDATE_URL`,
     `REVALIDATE_SECRET`. Website env: `REVALIDATE_SECRET` (same value),
     Turnstile keys, `LEAD_IP_SALT`.
  4. Vault (Supabase SQL editor): the two `vault.create_secret` lines under
     PR 2a above.
  5. Mark, Viv, Cedrick and Shermaine each sign in to the console once (it
     creates their account; they see "No access" until a role is set). Then
     I set the roles decided on 2026-11-11 (Decisions below), move lead
     routing to Mark (lead admin) with Viv as backup, and link the agent
     profiles, after you confirm.
  6. Send a test contact form on vabrato.com. When the lead admin's email
     arrives within a minute, S6 is done.
  - **Interim routing (2026-11-11, your request):** Rachanee's account is
    admin and lead admin on hosted, so every new-lead alert (console and
    email) goes to Rachanee until Mark signs in and step 5 moves routing to
    Mark. Checked with a rolled-back test lead: assigned to Rachanee, console
    alert raised, `staff_new_lead` email queued to Rachanee's address, due at
    once. That account now opens the console rather than the /my portal
    (one role per login); switching back is one SQL line.
  - Still open, with defaults in place (change any time in Settings):
    escalation after 2 hours, lead retention 24 months, the email cap of 10
    leads an hour. Viv's role is decided (admin, Decisions).
- **Found while checking the plan (Step 0):**
  - vabrato-console has Vercel Authentication on for every deployment except
    custom domains, and no custom domain yet. pg_net (S6 PR 2a) and Render
    can't reach `/api/notifications/process` until `console.vabrato.com` is
    connected, or a Protection Bypass for Automation secret is stored.
  - The website's Vercel project has only the two Supabase variables:
    Turnstile, `LEAD_IP_SALT` (per-IP lead limit) and `REVALIDATE_SECRET`
    aren't set in production. Only the honeypot and the per-email limit
    protect the public forms today.
  - Hosted has no admin or agent accounts yet; lead routing needs Mark and
    Viv to sign in once.
  - pg_net and pg_cron are available on the hosted project but not installed
    (PR 2a installs them).

### S5b member AI assistant, Ask Vabrato (in progress)

The assistant for buyers and sellers in `/my`. It runs on the S6b foundation:
`packages/ai`, the master switch and Zero Data Retention gate, `ai_begin`
with the member daily limits, and the site-wide monthly budget.

- **Owner answers (2026-11-13):**
  - **Conversations aren't kept.** Each question is answered on its own,
    and the page clears when the member leaves. Only what the member
    chooses to keep (a draft, a suggested to-do; later PRs) is stored.
    "Delete my assistant data" will remove those.
  - **Placement:** an "Ask Vabrato" page under a new Assistant group in
    the `/my` menu first. A side panel can come later.
  - **Suggested to-dos:** the member adds one; it stays "pending" until
    their agent approves it in the console (mockup 11, PR 2).
  - **First PR:** "Explain a term" and "Search by sentence".
  - **Working defaults kept:**
    - Claude Opus 5.5, with the Opus 4.8 fallback;
    - member limits of 30 requests and 300,000 tokens a day, within the
      site's $100 a month;
    - the agent sees suggestions, never the conversation;
    - photo-style concepts wait for an image provider.
- **Plan v2 (7 PRs):**
  1. The website's wiring, the Ask Vabrato page, "Explain a term" and
     "Search by sentence" (0036).
  2. Summarize a document (the member's own uploads and the documents
     their agent shared), with page references. Suggested questions and
     to-dos; the agent approves to-dos. HEIC refused with a clear message.
     "Delete my assistant data".
  3. Drafts: emails and messages to movers, contractors, the lender or the
     agent, and buyer offer cover letters. The member copies them or opens
     them in their own email; "Ask my agent" fills a message. Discarded
     drafts are deleted after 30 days.
  4. Compare saved homes and answer questions about a listing, from the
     fields the member may see (IDX, or VOW once accepted), with the MLS-3
     opt-outs. Built but off until MLSListings approves AI on MLS data.
  5. Schedules: a moving plan, a pre-listing checklist, a tour-day order.
     Dates from a contract are proposals the agent confirms.
  6. Design: palettes, staging ideas, flyers and social posts as HTML/SVG
     in a sandbox; flyers approved by the agent.
  7. Final QA and the member calls in the live run.
- **PR 1 (Ask Vabrato page, explain a term, search by sentence; migration
  0036, merged as #49, on hosted 2026-11-13):**
  - **Switches:** 0036 adds `ai_member_explain` and `ai_member_search`,
    both off. Admins switch them on the console's /assistant page, in a
    new "Member assistant (Ask Vabrato)" panel. Each runs only while the
    master switch is on.
  - **Explain a term:**
    - It explains a real-estate term in plain language.
    - It never gives legal, tax or financial advice, a price opinion, or
      anything about neighborhoods, schools or who lives where.
    - The page labels the answer and says "Not legal or tax advice".
    - "Ask my agent" opens Messages with the question filled in; the
      member still presses Send.
  - **Search by sentence:**
    - A sentence ("3-bed house in San Carlos under $2.5M") becomes the
      website's own search filters, shown as chips. Only our public city
      list goes with it.
    - Our code checks every value against the `/search` filter schema:
      unknown cities are dropped and said, and nothing the search doesn't
      offer can come through (FH-1).
    - Sold homes are searched only for a buyer with VOW access (on
      `/my/sold`); anyone else gets homes for sale and a note.
    - "Run this search" opens the results. Nothing is searched or saved
      until the member clicks.
  - **The page (`/my/assistant`):**
    - It says that answers are AI-written and can be wrong, that nothing
      typed is kept and the agent doesn't see questions, and to call
      escrow to verify wiring.
    - It shows the questions left today.
    - Refusals are worded for members. A steering question gets a neutral
      answer pointing to the school district, the California Department of
      Education and hud.gov, and nothing is sent.
    - No streaming: every answer is checked whole (payment details, Fair
      Housing) before it's shown.
    - With no switch on, the menu item is hidden and the page says it
      isn't available yet.
  - **Shared code:**
    - `MEMBER_AI_FEATURES` (`packages/lib`) names the member features for
      both apps.
    - The live test's helpers moved to `@vabrato/ai/live`. The guard test
      limits that import to the live tests.
    - `countPdfPages` moved to `packages/lib`.
    - Messages accepts a prefilled draft (`?draft=`), cleared after
      sending.
  - **Tests:**
    - 7 database tests (`member-assistant.test.ts`), and
      `hosted-member-assistant-check.sql`, which passes locally.
    - 17 feature tests: wiring and Fair Housing answers blocked, steering
      questions refused with nothing sent, filters checked, sold gated, an
      extra field refused, injection.
    - A CI coverage test for member features, a menu test, and 4 tests
      for the shared live helpers.
    - The website's live test (`pnpm --filter @vabrato/web test:live`,
      never in CI): fake run 2 of 2 ok, the injection canary not obeyed,
      and a tiny cap leaves every call "not run".
    - Browser QA `scripts/qa/s5b-assistant.mjs`: 65 checks pass on the
      local stack with the fake Claude. They cover off by default, the
      console switches, both features and their refusals, sold for a VOW
      buyer only, the daily limit, buyer, seller, both-role and staff, axe
      at 1440 and 390 px, no sideways scrolling at 390 and 320 px, the
      keyboard, and page loads sending nothing. `s5-qa.mjs` (100) and
      `s6b-assistant.mjs` (64) still pass. Screenshots in
      `docs/screenshots/s5b-assistant/`.
  - **On hosted (2026-11-13):** 0036 applied after checking that main's
    file matched the tested one byte for byte and that hosted ended at
    0035 with no member switches. `hosted-member-assistant-check.sql`
    (rolled back) passed:
    - both switches arrive off, and nothing runs while they're off;
    - with them on, a buyer and a seller may start a run, and a third
      request past a limit of 2 is refused (`daily_requests`);
    - an agent is refused (`not_allowed`), a buyer can't switch them
      (`admin_only`), and the public can't call `ai_begin`;
    - members see no usage rows.
    Nothing was left behind: no check accounts or runs, the Zero Data
    Retention confirmation still unset, the member limit back at 30, and
    all 21 feature switches and the master switch off. Security advisor:
    nothing new (same findings and counts as before; 0036 adds no
    function).
  - **Needs you, when switching on:**
    - `ANTHROPIC_API_KEY` on the website's Vercel project (the console has
      its own);
    - the same conditions as S6b: the live run, Zero Data Retention, then
      `ai_enabled` and each switch.
    - These two features send no MLS listing data and no member documents.
- **PR 2 (summarize a document, suggested to-dos, "My to-dos"; migration
  0037, merged as #51, on hosted 2026-11-13; owner answers 2026-11-13):**
  - **Owner answers:**
    - **"My to-dos":** a new list in `/my` for buyers and sellers. A to-do
      the member adds waits for their agent's approval, then becomes a normal
      to-do they tick off. The deal's schedule tasks are untouched.
    - **"Delete my assistant data"** removes waiting and declined to-dos;
      approved ones stay until the member deletes them.
    - **Agent alert:** the console bell only, no email.
    - **Length limit:** 50 pages per document.
  - **Summarize a document** (switch `ai_member_summarize`):
    - **Which documents:** the member's own uploads, files their Vabrato
      team uploaded for them, and for sellers the files the transaction desk
      shared on their deal. Everything is read with the member's own
      account, so another member's file is never found.
    - **Refused before anything is sent** (so it doesn't use up a question):
      HEIC (iPhone photos), with a clear message to upload a PDF or JPG;
      files over 20 MB; over 50 pages; and large PDFs whose pages can't be
      counted.
    - **The answer:** up to 8 summary points and 6 questions, each with page
      references, and up to 8 suggested to-dos.
      - Our code removes emails, phone numbers and links, keeps only page
        numbers within the file, trims lengths and drops repeated to-dos.
      - Wiring details and Fair Housing wording are never shown.
      - Contract dates are proposals to confirm with the agent.
      - Nothing about neighborhoods or people, and no value opinions.
    - **The page:** a third mode on `/my/assistant` with a list of the
      member's documents, and "Summarize" links on `/my/documents`. Each
      question has "Ask my agent", and the to-dos are checkboxes with "Add
      to my to-dos".
    - **Not kept:** summaries and questions; only to-dos the member adds.
  - **`member_todos` (0037):**
    - **Who:** the member and staff who can see them (`can_see_member`)
      read; only the member adds (pending, never approved or done) and
      deletes.
    - **Functions:** `set_my_todo_done` (the member, approved only),
      `decide_member_todo` (staff who can see the member, waiting only;
      audited) and `delete_my_assistant_data`.
    - **Limits:** 50 waiting and 300 in all per member.
    - **Alert:** one bell alert (`member_todo`) to the member's agent, else
      the lead router, else the admins; no second alert while one is unread.
  - **"My to-dos" (`/my/todos`):** "To do" (approved, tick off), "Waiting
    for your agent" and "Your agent declined these", each with its source
    and page, plus "Delete my assistant data". It's in the Assistant menu
    group when summarizing is on or the member has to-dos.
  - **Console:** a "Suggested to-dos" panel on `/members/[id]` (approve or
    decline each waiting one), the member switch on `/assistant`, and the
    bell linking to the member's page.
  - **Also:**
    - `textPdf` moved to `packages/lib` (both live tests use it).
    - The documents list is shared between `/my/documents` and the
      assistant.
    - Found in passing: the console's document features don't check page
      references against the file's real length; the member feature does.
  - **Tests:**
    - 22 database tests (`member-todos.test.ts`) and
      `hosted-member-todos-check.sql`, which passes locally.
    - 15 feature tests, covering:
      - the file checks (HEIC, 51 pages, size, unreadable, uncounted);
      - document references;
      - page clamping, contacts removed and repeats dropped;
      - wiring and Fair Housing answers blocked;
      - the deal-file run;
      - an extra field refused.
    - **The website's live test:** 3 calls; the new one is a fictional
      four-page inspection report with an injection page. The fake run is 3
      of 3 ok, and the console's is unchanged (20 of 20).
    - Browser QA `scripts/qa/s5b-documents.mjs`: 53 checks pass on the
      local stack with the fake Claude and the storage shim. They cover:
      - off by default, and the console switch;
      - a buyer summarizing their own upload and a team upload, with page
        references, questions and de-duplicated to-dos;
      - wiring, Fair Housing, contacts and out-of-range pages handled;
      - the 51-page file refused; HEIC and other members' files never
        offered;
      - the bell alert linking to the member; the agent approving one and
        declining one (audited); the buyer ticking one and deleting their
        assistant data;
      - a seller summarizing a shared deal file (run against the deal);
      - axe, 390 and 320 px, the keyboard, and page loads sending nothing.
    - `s5b-assistant.mjs` (65), `s5-qa.mjs` (100) and `s6b-documents.mjs`
      (47) still pass. Screenshots in `docs/screenshots/s5b-documents/`.
  - **On hosted (2026-11-13):** 0037 applied after checking that main's
    file matched the tested one byte for byte and that hosted ended at 0036
    with no `member_todos`. `hosted-member-todos-check.sql` (rolled back)
    passed:
    - the switch arrives off;
    - a buyer adds two to-dos, which raise one alert for their agent;
    - adding one for someone else, or adding one already approved, is
      refused, and an agent can't add any;
    - another buyer and another agent see nothing, and the other agent
      can't decide (`not_found`);
    - the buyer can't decide (`staff_only`) or tick a waiting one;
    - the agent approves one and declines one (both audited);
    - the buyer ticks the approved one, and "Delete my assistant data"
      removes the declined one only;
    - the public is refused.
    Nothing was left behind: no check accounts, to-dos, alerts or audit
    rows, the Zero Data Retention confirmation still unset, and all 22
    feature switches and the master switch off.
  - **Security advisor:** nothing new apart from the three intended
    functions (`set_my_todo_done`, `decide_member_todo`,
    `delete_my_assistant_data`). They are listed like the existing
    signed-in functions; each checks its caller, and the public can't run
    them.
- **PR 3 (drafts and offer cover letters, "My drafts"; migration 0038,
  merged as #53, on hosted 2026-11-14; owner answers 2026-11-14):**
  - **Owner answers:**
    - **Saving:** a draft is kept only if the member saves it, in "My
      drafts". Each is deleted 30 days after its last edit; the member can
      delete one sooner, and "Delete my assistant data" removes them all.
    - **Private:** the agent doesn't see saved drafts. They see one only
      when the member presses "Send to my agent", which fills a portal
      message the member still sends.
    - **Offer cover letters:** their own switch, about the offer's terms
      only (price, timing, flexibility, preapproval, care for the home); no
      personal or family details and no photos. They go to the agent only:
      no email or copy button.
    - **What's sent:** the member's notes, who it's for, and the home they
      pick (their sale or a home they track): its address, plus the closing
      date for a sale. The member's and agent's names are filled in
      afterwards and never sent; no price, escrow number or contact details.
  - **Draft an email or message** (switch `ai_member_draft`): to movers, a
    contractor, the lender, the agent or someone else.
    - **Refused before anything is sent:** bank, account or wiring details
      in the notes. Contact details in the notes are replaced before they're
      sent.
    - **The answer:** a subject and a short message as the member. Our code
      replaces any phone number or email address, fills in
      `[Your name]` and `[Agent's name]`, and caps the length (3,500
      characters). Wiring details and Fair Housing wording are never shown.
    - **The card** (mockup 11, "AI draft · You send it"): editable subject
      and message, "Open in my email" (a mailto with an optional To address
      the member types, which isn't sent to the model or saved), "Copy",
      "Save to My drafts", and "Send to my agent" for notes to the agent.
  - **Offer cover letter** (switch `ai_member_cover_letter`, buyers only):
    notes mentioning family, children, marriage, faith, heritage, age,
    health or photos are refused before anything is sent; a letter that
    mentions them anyway isn't shown. The home is a tracked home or a typed
    address.
  - **`member_drafts` (0038):**
    - **Who:** only the member reads, adds, edits and deletes their own
      drafts; there's no staff policy. Cover letters only for buyers, always
      to the agent; who it's for, the kind and the home can't change.
    - **Limits:** 50 per member; 3,500 characters.
    - **Purge:** `purge_member_drafts()` (service role only), daily with
      pg_cron (`vabrato-purge-member-drafts`, 11:47 UTC): drafts not edited
      for 30 days.
    - **Never stored:** saving or sending to the agent re-checks the text
      for payment details, Fair Housing wording and (cover letters) personal
      details, since the member may have edited it.
    - `delete_my_assistant_data()` now also deletes the caller's drafts.
  - **"My drafts" (`/my/drafts`):** saved drafts, newest first, with the same
    buttons plus Delete, and when each was used. It's in the Assistant menu
    group when a draft switch is on or the member has drafts. My to-dos and
    the Ask Vabrato page now say drafts are stored only when saved.
  - **Also:** `mailtoHref`, `firstName` and `redactContacts` moved to
    `packages/lib` (`draft-text.ts`); the console uses them from there.
  - **Tests:**
    - 22 database tests (`member-drafts.test.ts`) and
      `hosted-member-drafts-check.sql`, which passes locally.
    - 15 feature tests, covering:
      - what's sent (address and closing date; no name, contacts, price or
        escrow number) and the run against the member's deal;
      - names filled, contacts replaced, lengths capped;
      - wiring in the notes refused unsent; wiring and Fair Housing answers
        blocked; an extra field refused;
      - cover-letter notes about family refused unsent; personal details in
        a letter not shown;
      - the save check, and the agent link within 4,000 characters.
    - **The website's live test:** 5 calls (the new ones: a movers note
      and a cover letter). The fake run is 5 of 5 ok.
    - Browser QA `scripts/qa/s5b-drafts.mjs`: 50 checks pass on the local
      stack with the fake Claude. They cover:
      - off by default, and the console switches;
      - a seller's movers note: address and closing date sent, no email,
        phone or long number, name filled in; Open in my email, Copy, Save;
      - contacts replaced; wiring and Fair Housing answers not shown;
        wiring in the notes refused unsent;
      - Send to my agent filling Messages without sending;
      - editing in My drafts, and wiring text never saved;
      - a buyer's cover letter: family notes refused unsent, agent only,
        saved, personal details not shown, sent to the agent for review;
      - private: the agent's console pages and another member see none;
      - delete, the 30-day purge, and Delete my assistant data;
      - axe, 390 and 320 px, the keyboard, and page loads sending nothing.
    - `s5b-assistant.mjs` (65; its notice check updated for the new
      wording), `s5b-documents.mjs` (53; "Deleted 1 item"), `s5-qa.mjs`
      (100) and `s6b-drafts.mjs` (42, after the helpers moved) still pass.
      Screenshots in `docs/screenshots/s5b-drafts/`.
  - **On hosted (2026-11-14):** 0038 applied after checking that main's
    file matched the tested one byte for byte and that hosted ended at 0037
    with no `member_drafts`. `hosted-member-drafts-check.sql` (rolled back)
    passed:
    - both switches arrive off;
    - a buyer saves a message and a cover letter and sees both;
    - saving for someone else is refused, a seller can't save a cover
      letter, and an agent can't save any;
    - the buyer's own agent and another buyer see none (private);
    - who it's for can't change, and a cover letter can't be marked as
      emailed; marking it sent to the agent stamps it;
    - a buyer can't run the purge; the purge deletes a draft aged 31 days,
      and the daily job `vabrato-purge-member-drafts` (11:47 UTC) is
      scheduled;
    - "Delete my assistant data" removes the remaining draft and a waiting
      to-do;
    - the public is refused.
    Nothing was left behind: no check accounts, drafts or to-dos, the Zero
    Data Retention confirmation still unset, and all 24 feature switches
    and the master switch off.
  - **Security advisor:** nothing new. `delete_my_assistant_data` was
    already listed (it now also deletes drafts), the purge can't be run by
    signed-in users or the public, and the guard trigger isn't a definer
    function.
- **PR 4 (compare homes, ask about a home; migration 0039, merged as #55,
  on hosted 2026-11-14; owner answers 2026-11-14):**
  - **Owner answers:**
    - **Approval switch:** a separate admin switch, "MLSListings approved
      AI on listing data" (`ai_mls_approved`), off. Neither feature's
      switch can be turned on while it's off, and turning it off turns
      them off. It stays off until MLSListings confirms in writing.
    - **Opt-outs (MLS-3):** a home whose seller opted out of automated
      valuations or consumer comments is never sent to the model. It shows
      facts only, with "ask your agent".
    - **Placement:** "Compare with Ask Vabrato" on `/my/compare`; "Ask
      Vabrato about this home" on a listing's page for signed-in buyers
      (a link into `/my/assistant`, so public pages carry no AI); both as
      modes on `/my/assistant`.
  - **What's sent:** each home's listing facts at the member's level (IDX,
    or VOW once accepted), read with the member's own account (so a sold
    home only for a VOW buyer), through `listingForAi` (never FULL, never
    contacts, showing or lockbox details). Our code works out price per
    sq ft. Nothing about the member is sent.
  - **Compare homes** (switch `ai_member_compare`, buyers): 2 to 4 homes,
    sent as Home A to D. A short summary, a table of differences (one
    line per home) and questions for the agent.
  - **Ask about a home** (switch `ai_member_listing`, buyers): one
    question, answered from the listing only, with the fields it used as
    sources (only fields we sent) and "the listing doesn't say" when it
    doesn't.
  - **Checks after the answer:** no price or value opinions ("overpriced",
    "good deal", "worth", appraisal and the like); every dollar figure must
    be one we sent; contacts and links removed. The pipeline's Fair
    Housing (question and answer) and payment checks still apply.
  - **Cards:** labelled AI, with each home's listing broker, "Listing data:
    MLSListings", "Not legal or tax advice, and not an appraisal or price
    opinion", and "Ask my agent". The assistant page shows the MLS
    attribution while a listing mode is on.
  - **Console:** the approval row at the top of the member panel, with a
    warning; the two switches show "Locked until MLSListings approval is
    on" while it's off.
  - **Database (0039):** the switches, and two triggers on
    `feature_flags`: one refuses turning a listing switch on without the
    approval (`mls_ai_not_approved`, any route, including direct SQL),
    the other turns both off when the approval goes off. `set_ai_flag` is
    unchanged (admins only, audited).
  - **Also:** `listingOptedOutOfAi` in `packages/ai` (AVM and comments
    flags), and the AI guard test accepts `ai_mls_approved` as the one
    switch that isn't a feature.
  - **Tests:**
    - 8 database tests (`mls-ai-gate.test.ts`) and
      `hosted-mls-ai-gate-check.sql`, which passes locally.
    - 16 feature tests on the fictional MLS fixtures: no FULL field,
      contact or internal note ever sent; sold fields only at VOW; a
      hidden address stays hidden; FX-013 (opted out) never sent; price
      opinions, invented dollar figures, Fair Housing and wiring answers
      blocked; a steering question refused unsent; sources filtered.
    - **The website's live test:** 7 calls (the new ones compare FX-001
      and FX-002, and ask about FX-001 with an injection in its remarks).
      The fake run is 7 of 7 ok.
    - Browser QA `scripts/qa/s5b-listings.mjs`: 44 checks pass, twice, on
      the local stack with the fake Claude and the MLS fixtures. They cover:
      - off by default; the approval switch locking both switches in the
        console and in the database, then turning them off again;
      - compare from `/my/compare` and from Ask Vabrato: only FX-001 and
        FX-002 sent, FX-013 listed as not included, no FULL fields,
        contacts, internal notes or VOW fields for an IDX buyer;
      - price opinions, invented dollar figures, Fair Housing and wiring
        answers not shown;
      - ask about a home from the listing page's link, with sources limited
        to fields we sent; a steering question and an opted-out home
        refused unsent;
      - a VOW buyer's request carries VOW fields; an IDX buyer isn't
        offered a sold home, even by link;
      - signed out: no link, no assistant request, no AI text on the
        public page;
      - axe, 390 and 320 px, the keyboard (which also found the comparison
        table needed to be reachable by keyboard on phones, now fixed), and
        page loads sending nothing.
    - `s5b-assistant.mjs` (65), `s5b-drafts.mjs` (50), `s6b-assistant.mjs`
      (64) and `s5-qa.mjs` (100) still pass. Screenshots in
      `docs/screenshots/s5b-listings/`.
  - **On hosted (2026-11-14):** 0039 applied after checking that main's
    file matched the tested one byte for byte and that hosted ended at 0038
    with none of the new switches. `hosted-mls-ai-gate-check.sql` (rolled
    back) passed:
    - all three switches arrive off;
    - before approval, turning on either listing switch is refused
      (`mls_ai_not_approved`), through the console's function and by
      direct SQL;
    - a buyer can't set the approval (`admin_only`);
    - once an admin records the approval, both switches turn on (all
      audited); turning the approval off turns both off.
    Nothing was left behind: no check accounts or audit rows, the Zero Data
    Retention confirmation still unset, and all 26 feature switches, the
    master switch and the approval switch off.
  - **Security advisor:** nothing new. The two trigger functions can't be
    run by signed-in users or the public.
- **PR 5 (schedules: moving plan, pre-listing checklist, tour day; migration
  0040, merged as #57, on hosted 2026-11-14; owner answers 2026-11-14):**
  - **Owner answers:**
    - **Keeping a plan:** the member ticks steps and adds them to My to-dos
      with their dates; the agent approves them as before. A calendar file
      (.ics) downloads in the browser. Plans themselves aren't stored.
    - **Tour day:** our code orders the homes (open houses that day first, by
      start time, then the nearest home by straight-line distance; homes with
      a hidden address last). The assistant adds what to look at in each home
      from the listing. It's behind the MLSListings approval switch like PR 4.
    - **Pre-listing:** the seller types a target list date and notes; our
      code counts each step back from it.
    - **Dates:** dates of record only. A seller's plan counts from the closing
      or rent-back date in the schedule engine (shown as fixed, never
      changed, "confirm with your agent"); a buyer types their move date. No
      contract reading.
  - **The model writes steps; our code does every date.** Each step comes
    with an offset (days from the move day, or before the list date); our
    code adds it to the anchor. A date already past shows "as soon as
    possible". Steps that name a contract deadline (contingencies, close of
    escrow, signing), carry a dollar figure or a value opinion, or fall
    outside the window are dropped, and the card says some were left out.
  - **What's sent:** the move day (or list date) and the member's notes
    (contacts replaced; payment details refused before anything is sent).
    Never the address, price, escrow number or names. A tour sends the
    homes' listing facts at the member's level and their open-house time;
    opted-out homes (MLS-3) stay in the order but are never sent.
  - **Switches** (all off): `ai_member_moving`, `ai_member_prelisting`
    (sellers) and `ai_member_tour` (buyers; needs `ai_mls_approved`).
  - **The page:** three modes on `/my/assistant` (`?mode=` preselects one):
    "Build my moving schedule" (sellers can plan from their sale's dates),
    "Pre-listing checklist" and "Plan a tour day". Cards are labelled AI,
    show the dates of record separately, and offer "Add to my to-dos",
    "Download calendar (.ics)" and "Ask my agent". The tour card shows the
    stops in order with open-house times (Pacific), straight-line miles,
    listing brokers, notes, "Request a tour" links and the MLS attribution.
  - **My to-dos and the console** show each to-do's due date; `/my/todos`
    sorts by it.
  - **Database (0040):** the three switches; the approval triggers now cover
    `ai_member_tour`; `member_todos.due_date` (optional, in the members'
    insert grant; still pending until the agent approves).
  - **Shared code:** `planDate`, `orderTourDay`, `haversineMiles` and
    `planIcs` in `packages/lib` (`plan-schedule.ts`).
  - **Tests:**
    - 8 database tests (`member-schedules.test.ts`) and
      `hosted-schedules-check.sql`, which passes locally.
    - 7 tests for the shared helpers (dates, distances, the tour order, the
      calendar file) and 12 feature tests: what's sent, dates worked out by
      our code, contract deadlines and costs dropped, wiring and Fair Housing
      blocked, the tour order with the opted-out home never sent, price
      opinions and unsent dollar figures blocked, open-house times in Pacific
      time.
    - **The website's live test:** 10 calls (moving, pre-listing and tour
      added). The fake run is 10 of 10 ok.
    - **Browser QA** (`scripts/qa/s5b-schedules.mjs`): 38 of 38, run twice.
      Reruns pass: `s5b-documents` 53, `s5b-listings` 44 (now expects three
      switches locked until approval), `s5b-assistant` 65, `s5-qa` 100.
  - **On hosted (2026-11-14):** 0040 applied after checking that main's
    file matched the tested one byte for byte and that hosted ended at 0039.
    `hosted-schedules-check.sql` (rolled back) passed:
    - all three switches arrive off;
    - before approval, the tour-day switch is refused
      (`mls_ai_not_approved`); after approval it turns on, and turning the
      approval off turns it off again; the moving switch needs no approval;
    - a buyer adds two dated to-dos, which stay pending with one alert to
      their agent; the agent sees the due dates and another buyer sees none;
    - a buyer can't add an approved to-do, add one for someone else, or
      change a due date.
    Nothing was left behind: no check accounts or to-dos, and every AI
    switch, including the approval switch, off.
  - **Security advisor:** nothing new. The two replaced trigger functions
    still can't be run by signed-in users or the public.
- **PR 6 (design: colors and moodboard, staging ideas, open-house flyer and
  posts; migration 0041, merged as #59, on hosted 2026-11-14; owner answers
  2026-11-14):**
  - **Owner answers:**
    - **Drawing:** our own templates. The assistant returns words and color
      choices only; our code checks every color and draws the swatches,
      moodboard and post image. Nothing the model writes is ever shown as
      markup.
    - **Staging:** the seller describes the room in words; no photos are
      sent.
    - **Flyers and posts:** written only from the seller's own words. No
      MLS data goes to the model, so no MLSListings approval is needed. The
      agent approves each one and picks our listing (and, if they like, one
      of its open houses); the flyer's address, price, rooms, photo,
      open-house time and agent card come from our records. Posts need the
      agent's approval too, and our code adds the brokerage line.
    - **Post image:** a square "Open house" / "Just listed" graphic in our
      colors, without a photo.
    - **Who:** colors and moodboards for buyers and sellers; staging, flyers
      and posts for sellers.
    - **AI images:** none yet. Photo-style room concepts (mockup 11) wait
      until an image provider is chosen.
  - **Switches** (all off): `ai_member_palette`, `ai_member_staging` and
    `ai_member_flyer`. None needs `ai_mls_approved`.
  - **Colors and moodboard:**
    - **The answer:** 3 to 6 colors and up to 9 moodboard tiles.
    - **Our checks:** colors that aren't real `#RRGGBB` codes, repeats,
      brand names and paint codes are dropped.
    - **What's shown:** the swatches and tiles are our SVG templates, shown
      as images, with the colors listed as text too. Labels are black or
      white, whichever reads better.
    - **Downloads:** the palette as SVG or PNG, and the moodboard as PNG.
    - **Label:** "AI concept · for planning only".
  - **Staging ideas:** the room type and the seller's words go to the
    model; it returns keep, remove, bring in and arrange lists, accent
    colors and to-dos. Our code drops ideas with costs, value talk or
    edited photos, and says so. To-dos go to My to-dos for the agent's
    approval.
  - **Flyer and posts:**
    - **The answer:** a headline, highlights, a description, and Instagram
      and Facebook posts. The seller edits them.
    - **Sending:** "Send to my agent for approval" checks the words again
      (prices and value talk, payment details, Fair Housing, contacts and
      links) and saves them. The words can't be changed after that.
    - **My flyers** (sellers) shows each flyer's status and the agent's
      note on a declined one. The seller can delete a flyer that's waiting
      or was declined.
    - **The approved flyer** prints with facts from our records, the open
      house in Pacific time, the agent's card, the DRE number and "Equal
      Housing Opportunity". The posts copy with the brokerage line, and the
      post image downloads.
    - **A closed or withdrawn listing** shows "no longer active" instead of
      the flyer.
  - **Console** (member page, "Flyers waiting"):
    - **Approve:** the agent picks one of our active listings and,
      optionally, one of its open houses that hasn't ended. The console
      checks the words again (Fair Housing, payment details, dollar
      figures, links) before approving.
    - **Decline:** with an optional note.
    - **Alerts:** one bell alert per member until it's read.
  - **Database (0041):** the three switches, and `member_promos`:
    - **Who reads:** the member, and staff who can see them.
    - **Who sends:** sellers only, with the status pending and none of the
      agent's fields set.
    - **Limits:** at most 20 per member, and the words are frozen once sent.
    - **Who deletes:** the member, while a flyer is waiting or after it was
      declined.
    - **Decisions:** `decide_member_promo` (staff who can see the member;
      our own listing only; the open house must belong to it and not have
      ended; audited).
    - **Alerts:** bell kind `member_promo`.
    - **Clean-up:** declined flyers are deleted 30 days after the decision,
      in the daily purge, and "Delete my assistant data" removes all of a
      member's flyers.
  - **Tests:**
    - **Database:** 13 tests (`member-design.test.ts`), and
      `hosted-design-check.sql`, which passes locally.
    - **Features:** 10 tests (colors checked, brand names removed, costs
      and value talk dropped, flyer words only, contacts stripped, Fair
      Housing blocked). 6 tests for the SVG templates (every text escaped,
      only our own tags, label contrast). A nav test for My flyers.
    - **The website's live test:** 13 calls (palette, staging and flyer
      added). The fake run is 13 of 13 ok.
    - **Browser QA** (`scripts/qa/s5b-design.mjs`): 58 of 58, run twice.
    - **Reruns:**
      - `s5b-documents` 53, `s5b-drafts` 50, `s5b-schedules` 38,
        `s5b-listings` 44 and `s5-qa` 100 pass unchanged.
      - `s5b-assistant` passes 65 after its check was updated for the new
        sentence about flyers.
  - **Not in this PR:** AI images and room photos, model-written markup,
    posting to social networks, and the agent editing a member's flyer (they
    decline it with a note instead).
  - **On hosted (2026-11-14):** 0041 applied after checking that:
    - main's file matched the tested one byte for byte;
    - hosted ended at 0040, with no `member_promos` table;
    - the notification-kind check it replaces matched 0037's list.

    `hosted-design-check.sql` (rolled back) passed:
    - the three switches arrive off;
    - a seller sends a flyer: it waits, with one bell alert to their agent;
    - a buyer can't send one, and a seller can't send one for someone else,
      send one already approved, edit one, or decide one (`staff_only`);
    - another seller sees nothing;
    - the agent can't approve with another brokerage's listing
      (`not_our_listing`) or another listing's open house
      (`not_this_open_house`); approves with our listing and its open
      house; can't decide it again (`not_found`);
    - the seller can't delete the approved one; "Delete my assistant data"
      removes both of their flyers.

    Nothing was left behind: no check accounts, listings, flyers or audit
    rows, and every AI switch off (13 member switches in all).
  - **Security advisor:** the only new entry is `decide_member_promo`,
    callable by signed-in users as intended. Staff use it, and it checks
    `is_staff` inside, like `decide_member_todo`. The public can't call it,
    and the two trigger functions can't be run by signed-in users or the
    public.

### S6b staff AI assistant, the VA assistant (built 2026-11-13)

Owner decision 2026-11-12: build the VA assistant first, then the client
assistant (S5b). Both run on one foundation. SPEC `<ai_rules>` now lists the
staff features (contract reader, drafts, briefing, launch kit, presentations,
document checks, receipts, calendar drafts).

- **Plan (PRs):**
  1. Foundations: `packages/ai` and migration 0026 (this PR, no screens).
  2. Assistant panel in the console, AI settings for admins (switches,
     limits, this month's spend, a budget alert), and the contract reader:
     proposed dates, contingencies, price and rent-back with page numbers,
     confirmed by a person before the schedule engine builds the timeline.
  3. Drafts: client emails (e.g. a weekly escrow update from the deal's
     tasks), lead replies, open-house follow-ups, vendor requests. (Call
     notes to to-dos moved to PR 8, owner decision 2026-11-12.)
  4. Daily briefing, member activity summary, plain questions about the
     console's data.
  5. Listing launch kit and printable listing and buyer presentations.
  6. Market update (through Mark's content approval; public only with
     `public_stats`) and CMA write-up, on test data behind the sold-data
     switches. (Split from 5, owner decision 2026-11-12.)
  7. Document checks, split in two (owner decision 2026-11-12):
     - 7a: a Documents tab on each deal (staff-only until shared with the
       seller), the seller-type checklist with what's missing (also on
       Today and in the briefing; the seller's own uploads count once
       tagged), "Check this document", and the receipt reader.
     - 7b: inspection report to repair items, the contractor bid list, and
       the seller's response to the buyer's request for repairs (split
       again, owner decision 2026-11-13).
     - 7c: what changed in a counter-offer or addendum (shown only; a
       non-AI "Edit deal terms" comes later), and "Check unchecked
       documents" (up to 10 per click, with the number of calls shown and a
       confirmation).
  8. Appointment drafts (calendar file first; Google Calendar once that
     connection is built), and call notes to to-dos and a follow-up draft.
  9. QA: screens, accessibility, and an optional live test run against the
     real model (costs money; only with approval).
  After S6b, a separate integrations PR: Google sign-in for Calendar and
  Drive, plus Dropbox (receipt import from a folder).
- **PR 1 (foundations, migration 0026):**
  - `packages/ai` is the only code that calls the model (ESLint and a guard
    test enforce it; nothing on public pages or in client components may
    import it). Every feature goes through `runAi()`: switches and limits,
    Fair Housing check of the person's words, documents and pasted text sent
    as data (never as instructions), the model call with no tools, then
    checks on the whole answer (payment or wiring details stop it, Fair
    Housing wording stops it, links that aren't ours or the person's own are
    removed) before anything is shown, then the usage log.
  - Model: Claude Opus 5.5; if it declines a request the API retries on
    Claude Opus 4.8. Documents go inline with the request: no file storage
    or conversation threads at Anthropic (Zero Data Retention).
  - Database: `ai_enabled` master switch (off) plus one `ai_<feature>` flag
    per feature; staff features for staff only, member features for members
    only; `ai_runs` usage log with metadata only (no column for questions,
    documents or answers; admins read it); limits per person per day and a
    monthly budget for the whole site.
  - Defaults, changeable by admins (`set_ai_limits`, audited): staff 100
    requests and 3,000,000 tokens a day; members 30 requests and 300,000
    tokens a day; $100 a month for the site.
  - Listing data sent to the model uses the data-level field list and never
    includes contact details, showing instructions or lockbox information.
  - Tests use a scripted stand-in for the model (no network, no cost): 13
    database tests and 55 in `packages/ai`, including six prompt-injection
    fixtures.
  - Not yet built at PR 1: the alert when the monthly budget is nearly used
    (done in PR 2), and the live test against the real model (PR 9).
  - On hosted (2026-11-12): 0026 applied; the advisor shows nothing new
    beyond the expected notices for the four new functions (each checks
    the caller). `packages/db/test/hosted-ai-check.sql` (rolled back,
    fictional agent and buyer) confirmed: nothing runs while the master
    switch is off; staff features are staff-only and member features
    member-only; the daily limit and a zero monthly budget both stop
    requests; a run is closed once, by the person who started it; only
    admins read the usage log or change limits; the public can call none
    of it. Hosted has no usage rows and `ai_enabled` is off.
- **PR 2 (assistant page, AI settings, contract reader; migration 0027,
  merged as #28):**
  - **Assistant page** (`/assistant`, all staff): whether it's on, what it
    can do, and the person's own use today. Admins also see what's needed
    before it can be turned on (the API key, shown as set or not and never
    its value; the Zero Data Retention confirmation), the switches, this
    month's spend and requests by feature, and the limits.
  - **Zero Data Retention gate:** the master switch can't be turned on,
    from the console or directly in SQL, until an admin records Anthropic's
    written confirmation and where it's filed (`confirm_ai_zdr`, audited).
    Switches (`set_ai_flag`) and limits are admin-only and audited.
  - **Budget alert:** admins get one in-console alert when a request takes
    the month past 80% of the budget and one when it reaches it (the
    assistant then pauses until the budget is raised or the month ends).
  - **Contract reader** (flag `ai_staff_contract_reader`, off): on New
    transaction, a VA uploads the ratified contract (PDF, up to 20 MB). The
    browser puts it in the VA's own staging folder in `deal-docs` (Vercel
    caps request bodies at 4.5 MB), the server sends it inline to the model
    and deletes the staging folder whether the read worked or not. The
    answer fills the form: address, seller and seller type, acceptance
    date, days to close (or worked out from a closing date), price,
    rent-back and the four contingencies, each with "From the contract,
    page N" and a short quote under the field. Waived contingencies are
    blanked; anything missing or out of range is left at the usual value
    with a note. The escrow number is never filled. Nothing is saved until
    the person creates the transaction, and the deadlines come from the
    form, through the schedule engine, as before.
  - **Intake form:** contingency days are now on the form (usual days
    filled in, blank means none, as for an all-cash offer); previously every
    deal got the fixed defaults.
  - **Fix found by the QA (on main since S1):** only admins could create a
    transaction. For agents and VAs the insert succeeded but reading the new
    row back in the same statement failed RLS (`has_deal_access` runs on
    the statement's snapshot, which doesn't hold the new row yet). The
    console now makes the deal id itself and doesn't read the row back.
    Hosted only has an admin account, so nobody hit it.
  - **Tests:** 9 database tests for 0027, 6 for creating deals as each
    staff role (`console-deals.test.ts`), 9 for the contract reader's
    answer handling, 6 for the assistant helpers, 8 for the intake schema.
    `pnpm typecheck`, `pnpm lint`, `pnpm test` (959 tests) pass.
  - **Browser QA** (`scripts/qa/s6b-assistant.mjs`, 64 checks, all pass on
    the local stack with a fake Claude server, so no key and no cost):
    off by default; the ZDR gate; switches and audit; a VA reads a
    fictional contract and the request is checked (the key, one inline PDF,
    a JSON schema, no tools, no file upload, Claude Opus 5.5 with the
    Opus 4.8 fallback); the VA corrects a value and the deal holds what
    they confirmed; an all-cash offer; an answer with wiring details is not
    shown, an answer in the wrong shape isn't used, a refusal says so; no
    staged file survives; the month view, the 80% and 100% alerts, the
    pause and resume; the daily limit; master switch off; the console
    called nothing but the Messages endpoint and the key never reached a
    page. axe at 1440 and 390 px on every new screen. Screenshots in
    `docs/screenshots/s6b/`.
  - **Not proven yet:** a real model call (needs the key and ZDR), and how
    long a real read of a long contract takes against Vercel's 300-second
    limit (`maxDuration = 300` on `/deals/new`).
  - **On hosted (2026-11-12):** 0027 applied after checking that main's
    file matched the tested one and that the hosted kind constraint had the
    expected name (the new one keeps all 10 kinds and adds `ai_budget`).
    The security advisor shows nothing new beyond the expected notices for
    `confirm_ai_zdr`, `set_ai_flag` and `ai_month_summary` (signed-in users
    can call them; each checks for an admin itself); none is callable by the
    public. Both AI flags are off and no confirmation is recorded.
    `packages/db/test/hosted-assistant-check.sql` (rolled back; ZDR gate,
    admin-only controls, budget alerts and pause, the staging folder, and a
    VA creating a deal) passed on hosted (2026-11-12, one admin): the gate
    held even for direct SQL; non-admins were refused; one 80% alert and one
    100% alert reached the admin only, and the next request was paused; each
    person's staging folder was theirs alone; a VA created a deal with its
    tasks and contingencies, and the read-back that broke it before still
    fails as expected. Everything rolled back: flags off, no confirmation,
    $100 budget, no runs, alerts, test accounts, deals or uploads left.
- **PR 3 (drafts; migration 0028, merged as #30):**
  - Four drafts, each behind its own switch (off): **lead replies** and
    **open-house follow-ups** on the lead page, **escrow updates** for the
    seller and **vendor quote requests** on the deal page. The person can
    add a note ("offer Saturday morning"); the assistant writes a subject
    and an email; the person edits, approves, then sends it themselves.
  - **Sending (owner decision 2026-11-12):** "Open in email" opens the
    person's own mail app with the draft filled in (addresses from our
    records, never from the model), "Copy", or "Send as portal message"
    when the recipient has a member account the person may write to
    (assigned to them, or an admin). The console never sends an email.
  - **Approval:** the person who asked approves. The text they approve goes
    through the Fair Housing and payment checks again (they may have
    edited it); an approved draft can't be changed, only recorded as sent.
  - **Storage:** `ai_drafts` (0028). A draft is its owner's while they work
    that lead or deal; once approved it's part of the lead or transaction
    file for staff who work it; members and the public never see drafts.
    Discarded drafts, and drafts nobody approves or discards, are deleted
    30 days after their last change (daily `purge_ai_drafts`, pg_cron on
    hosted; owner decision 2026-11-12). The usage log still holds no text.
  - **What goes to the model:** first names, the lead's message and form
    answers (as data), the listing's public fields; for an escrow update
    the address, dates, contingencies and task list (as data); for a vendor
    the vendor, address and closing date. Never: email addresses or phone
    numbers (also blanked out of anything typed), prices, escrow numbers,
    documents, lockbox or access details (a note mentioning them is
    refused).
  - "My drafts" on /assistant lists each person's open and approved drafts.
  - **Tests:** 15 database tests (`ai-drafts.test.ts`), 18 for the features
    (what each sends, prompt injection kept as data, approval checks,
    mailto, redaction). Browser QA `scripts/qa/s6b-drafts.mjs`: 42 checks
    pass on the local stack with the fake Claude server; the PR 2 script
    (64) still passes. Screenshots in `docs/screenshots/s6b-drafts/`.
  - **On hosted (2026-11-12):** 0028 applied after checking that main's
    file matched the tested one. The security advisor's only new entry is
    `can_work_draft_target` (signed-in users can call it; it only says
    whether the caller works a given lead or deal); nothing new is open to
    the public. The four switches are off.
    `packages/db/test/hosted-drafts-check.sql` (rolled back) passed on
    hosted (2026-11-12, one admin): agents and VAs drafted only for the
    leads and deals they work; another agent, the seller and the public
    could neither draft nor see drafts; the admin saw approved drafts but
    not someone else's unapproved one; approved text was frozen and a draft
    couldn't be marked sent before approval; the purge removed an old
    discarded draft and kept the approved one; only the service role can
    run it, and the daily job `vabrato-purge-ai-drafts` (11:41 UTC) is
    scheduled. Everything rolled back: no drafts, test accounts, leads,
    deals, vendors or queued emails left, every AI switch off.
  - **Not in this PR:** sending from the console through Resend, follow-ups
    for a whole open house at once, call notes to to-dos (PR 8), drafts for
    members (S5b).
- **PR 4 (briefing, member summary, questions; migration 0029 = three
  switches, merged as #32):**
  - **Daily briefing** (Today, "Write my briefing"): what needs attention
    first and what's coming this week, from the person's own records:
    overdue and next-7-day tasks, contingency removals and closings in 14
    days, leads waiting for a first reply, tour requests, members waiting
    for an answer. On demand only; nothing is emailed or stored (owner
    decision 2026-11-12).
  - **Member activity summary** (member page, "Summarize activity"): what
    they've been looking at and asking about, what they seem to be looking
    for, and next steps, from their saved homes (public listing facts),
    searches, tour requests, homes they're pursuing and their last 10 portal
    messages (owner decision 2026-11-12; phone numbers and emails blanked).
    Describes homes, never the member; a summary with steering wording
    isn't shown.
  - **Questions about your work** (/assistant, "Ask about your work"):
    plain questions about your own transactions, tasks, leads and messages,
    answered with links to the records used; says so when the records can't
    answer (for example market data).
  - **How it's built:** our code reads the person's records under their own
    row-level security (an agent sees their own work; the lead admin and
    admins see more), numbers each record (D1, T4, L3…), computes the
    numbers, and sends only that, with typed text as data and contact
    details blanked. Never sent: emails, phone numbers, the sale price,
    escrow numbers, message text (except the member summary's last 10),
    documents. The answer cites records by number and our code turns them
    into links; a number the assistant made up gets no link. Nothing is
    stored; the usage log keeps metadata only.
  - **Tests:** 10 for the record snapshot, 10 for the features (through the
    pipeline with a scripted model: injected text stays data, made-up refs
    dropped, steering questions and answers refused, wiring answers not
    shown, member messages capped at 10 and redacted). Browser QA
    `scripts/qa/s6b-summaries.mjs`: 28 checks pass on the local stack with
    the fake Claude, including that an agent's briefing only covers their
    own transaction and lead; the PR 2 (64) and PR 3 (42) scripts still
    pass. Screenshots in `docs/screenshots/s6b-summaries/`.
  - **On hosted (2026-11-12):** 0029 applied after checking that main's
    file matched the tested one. `hosted-summaries-check.sql` (rolled back)
    passed: the three switches exist and are off, and a signed-in user
    can't turn one on directly. The security advisor shows nothing new
    (0029 only adds rows). All nine AI switches on hosted are off.
  - **Not in this PR:** a morning email of the briefing, stored briefings,
    questions about MLS market data (market updates come in PR 5).
- **PR 5 (launch kits and presentations; migration 0030, merged as #34):**
  - **Listing launch kit** (Our listings → "Launch kit", our own listings
    only): the MLS description (up to 1,000 characters, no contact details
    or links), a headline, Instagram, Facebook and LinkedIn posts, a "just
    listed" email and flyer text, from the listing's public facts and the
    agent's note. The agent edits every part and approves; then copies each
    part where it goes, or prints the flyer. The flyer's facts (address,
    price, rooms, size, photo) and the agent's name and phone come from our
    records, never from the assistant; a draft has no flyer.
  - **Presentations** (Reports → Presentations): listing (for a seller) and
    buyer. The assistant writes up to 6 sections; our records add the
    agent's card (name, title, bio, phone), Vabrato's services and the usual
    escrow timeline from the schedule engine (days 0, 7, 8, 30). No pricing
    (a CMA section comes with PR 6). Approved, then printed or saved as PDF.
  - **Rules:** each person's kits and presentations are their own; admins
    see approved ones; a kit only for one of our own listings; approved text
    is frozen. Every part passes the Fair Housing and payment checks again
    at approval. A note with lockbox or access details is refused. Never
    sent to the model: private remarks, showing or lockbox details, owner or
    agent contacts, client details beyond a first name the agent types.
  - **Database:** 0030 extends `ai_drafts` (three kinds, `listing_key`,
    structured `content`, `print`), with its own policies; 0028's lead and
    deal draft rules are unchanged. The 30-day purge covers the new kinds.
  - **Tests:** 10 database tests (`ai-kits.test.ts`), 13 for the features.
    Browser QA `scripts/qa/s6b-kits.mjs`: 34 checks pass on the local stack
    with the fake Claude (another brokerage's listing has no kit; an MLS
    description with a phone number can't be approved; flyer and
    presentation print views; another agent gets a 404). The PR 2 (64),
    PR 3 (42) and PR 4 (28) scripts still pass. Screenshots in
    `docs/screenshots/s6b-kits/`.
  - **On hosted (2026-11-12):** 0030 applied after checking that main's
    file matched the tested one and that the three constraints it replaces
    had the expected names. `hosted-kits-check.sql` (rolled back) passed: a
    kit for our own listing allowed, another brokerage's refused; a
    presentation allowed; a member and the public refused; another agent
    sees nothing; the admin sees the kit only once approved; approved
    content frozen; no print before approval; a lead draft still needs a
    lead. The security advisor shows nothing new. All 11 AI switches on
    hosted are off.
  - **Not in this PR:** posting to social networks or the MLS, sending the
    email blast, AI images, CMA in presentations (PR 6).
- **PR 6 (market updates and CMA write-ups; migration 0031, merged as
  #36):** both run on sold data, so they only work while
  `market_stats_enabled` / `cma_enabled` are on (off on hosted until
  MLSListings approves); built and tested on fictional sold listings.
  - **Market update** (Market stats → "Write a market update"): written
    around the console's own figures for the city and period. **Numbers
    check:** at approval, every number in the text must be one we sent
    (rounding allowed; years and small counts ignored); anything else is
    listed and blocks approval. While `public_stats` is off the approved
    update is an internal preview only (no copy, no website; owner decision
    2026-11-12). Once it's on: copy it, or "Send to website review", which
    puts a post (kind market update) in Mark's content queue; publishing
    stays his (Viv's while he's away).
  - **CMA write-up** (a CMA → "Write a summary"): a plain-language summary
    of the comparables and our computed range, with "not an appraisal"
    required at approval and the same numbers check; never the assistant's
    own value. The approved summary shows on the CMA and its printout.
  - **CMA in listing presentations** (owner decision 2026-11-12): the form
    can attach one of the agent's CMAs with an approved summary; the
    printout adds our range, the comparables and the summary, only while
    CMAs are on.
  - **Database:** 0031 adds the two switches, the two kinds and `cma_id`
    to `ai_drafts`, and `website` as a way a draft was used; a market
    update only while market stats are on, a write-up only for a CMA the
    person can open and only while CMAs are on.
  - **Tests:** 9 database tests (`ai-market-cma.test.ts`), 11 for the
    features (numbers check, what each sends, approval). Browser QA
    `scripts/qa/s6b-market-cma.mjs`: 24 checks pass on the local stack with
    the fake Claude; the PR 2–5 scripts still pass. Screenshots in
    `docs/screenshots/s6b-market-cma/`.
  - **On hosted (2026-11-12):** 0031 applied after checking that main's
    file matched the tested one. `hosted-market-cma-check.sql` (rolled
    back) passed: with market stats and CMAs off, a market update and a
    write-up refused; with them on, a market update and a write-up for the
    agent's own CMA allowed, another agent's CMA refused; "website" refused
    before approval and recorded after; another agent sees nothing; a
    member and the public refused. Nothing from the check remains. The
    security advisor shows nothing new. All 13 AI switches on hosted are
    off, as are `market_stats_enabled`, `cma_enabled` and `public_stats`.
  - **Not in this PR:** scheduled or emailed market updates, any price
    suggestion.
- **PR 7a (deal documents, checklist, document check, receipt reader;
  migration 0032, merged as #38; amended after owner review 2026-11-13):**
  - **Documents tab** on each deal (with the wiring banner):
    - Staff upload PDFs, JPGs or PNGs (20 MB at most, checked by content).
      Files go from the browser straight to storage, never through a server
      action.
    - Uploads go to a staff-only folder (`deal/{id}/staff/`) until someone
      uses "Share with seller" (owner decision 2026-11-12). It asks first:
      "Never share wiring or bank instructions here."
    - "Stop sharing" fails safe: the seller's copy is removed and confirmed
      gone before the file is recorded as staff-only; otherwise nothing
      changes and it says the seller can still see it.
    - Files open through 60-second signed links. Storage keys use a
      cleaned-up name; the list shows the name as uploaded.
    - Files in the deal's folder without a record show under "Not filed
      yet"; top-level ones say "The seller can see this".
    - Share, stop sharing and delete are written to `staff_audit`.
    - Until 0032 is applied, the tab shows only "Documents aren't set up
      yet": no uploader, Share or file list. Today and the briefing skip
      missing documents.
  - **Checklist** for the deal's seller type, in code
    (`packages/lib/src/deal-documents.ts`). It's a **draft for Mark's
    review**; rows marked (confirm) are new or changed on 2026-11-13. The
    review is deferred (owner decision 2026-11-13): the draft is used as
    written until then, and changing rows later needs no migration.
    - Required, every sale:
      - purchase agreement (RPA)
      - agency disclosure (AD)
      - Statewide Buyer and Seller Advisory (SBSA)
      - Agent Visual Inspection Disclosure (AVID)
      - Natural Hazard Disclosure (NHD)
      - water-conserving fixtures and carbon monoxide notice (WCMD,
        confirm)
      - preliminary title report
      - contingency removal (CR)
      - verification of property condition (VP)
    - By seller type:
      - Standard: Transfer Disclosure Statement (TDS); Seller Property
        Questionnaire (SPQ, confirm).
      - Trust: TDS or Exempt Seller Disclosure (ESD) (confirm); SPQ
        (confirm); certification of trust; Trust Advisory (TA, confirm).
      - Successor trustee: TDS or ESD (confirm); SPQ or ESD (confirm);
        certification of trust; the settlor's death certificate; TA
        (confirm).
      - Probate: ESD in place of TDS and SPQ (confirm); Letters
        Testamentary or Letters of Administration; Probate Advisory (PA);
        probate purchase agreement addendum (PAPA, confirm); probate
        listing addendum (PLA, confirm).
    - If they apply (listed separately):
      - counter offers and addenda
      - water heater and smoke detector statement (WHSD, confirm)
      - lead-based paint disclosure (FLD, if built before 1978)
      - home and pest inspection reports
      - probate court confirmation or IAEA notice
    - Also if they apply, flagged for Mark to keep or drop (confirm):
      - listing agreement (RLA)
      - Seller's Advisory (SA)
      - Fair Housing advisory (FHDA)
      - PRBS
      - Wire Fraud Advisory (WFA)
      - SFLS
      - seller withholding (FIRPTA / CA 593)
      - HOA documents
      - county advisory
    - Counting:
      - "N of M done" counts required items, plus an if-applies item once
        it's on file or marked not needed.
      - "Missing" counts required items only.
      - Either/or items are satisfied by either document.
      - A file counts once its type is set (a combined packet can be
        several types). "On file" means filed, not signed or complete; the
        panel says so.
      - The seller's own portal uploads count once staff tag them for the
        deal (owner decision 2026-11-12).
  - **Missing documents** on Today (a panel per sale, no AI) and in the
    daily briefing (each deal's missing items; within 30 days of closing it
    is in the briefing). Our code counts them.
  - **Check this document** (switch `ai_staff_document_check`):
    - It sends that one file, the seller type and the list of document
      types.
    - It suggests which types the file is (unknown ones dropped), whether
      it's signed, and up to 10 things to look at with pages (missing
      initials, blanks, dates that don't match).
    - The person saves the types; the issues are shown, not stored.
      Answers with wiring details are refused.
    - PDFs over the model's page limit are stopped with "Split this file".
      The limit is 600 pages for both our models, per Anthropic's PDF page
      read on 2026-11-13; it's in `packages/ai/src/models.ts`. An API "too
      large" error gives the same message.
    - The Documents and Receipts pages allow 300 seconds.
  - **Receipt reader** (switch `ai_staff_receipt_reader`):
    - On Receipts (now with the wiring banner), a receipt file can be
      attached, also with the assistant off.
    - "Read it" fills vendor (80 characters at most), total, date and a
      category for the person to check before adding.
    - Anything with 8 or more digits in a row (a card or account number) is
      dropped.
    - Adding a receipt checks its file is still there ("Upload the receipt
      again" if the tidy-up removed it).
    - The file stays with the receipt (deleted with it); unsaved uploads
      are tidied after an hour.
  - **Database:** 0032 adds:
    - the two switches;
    - `deal_documents`, `deal_member_document_types` and
      `deal_checklist_marks` (staff with deal access only; the seller sees
      none of them);
    - path allowlist: a file is either `deal/{id}/{file}` (shared) or
      `deal/{id}/staff/{file}` (not), nothing else;
    - a storage read allowlist: the seller reads only files directly in
      `deal/{id}/`, staff with deal access read everything under it;
    - `log_deal_document_action` for the audit log.
  - **Tests:**
    - 16 database tests (`deal-documents.test.ts`), including a third
      folder, `Staff/` and deeper paths refused to the seller, and the
      audit function.
    - 11 checklist tests (either/or and if-applies rules); 22 console tests
      (file checks, paths, page counts, original names, what each feature
      sends, a document that tries to give the assistant orders, receipt
      digit runs, missing documents before 0032, the briefing); PDF limit
      and "too large" tests in `packages/ai`.
    - Browser QA `scripts/qa/s6b-documents.mjs`: 47 checks pass on the
      local stack with the fake Claude. Includes "not set up yet" with the
      table hidden, sharing with the seller and back, stop sharing refused
      safely when the seller's copy can't be removed, the audit rows,
      another agent getting a 404, and axe at 1440 and 390 px.
    - The PR 2–6 scripts still pass (64, 42, 28, 34, 24). Screenshots are
      in `docs/screenshots/s6b-documents/`.
  - **On hosted (2026-11-12):** 0032 applied after checking that main's
    file matched the tested one and that the storage policy it replaces
    was there. `hosted-documents-check.sql` (rolled back) passed:
    - the deal's agent adds and reads a document, tags the seller's upload
      and marks an item not needed;
    - a shared file in `staff/` and a `tmp/` path are refused by the table;
    - another agent sees nothing and can't add;
    - the seller sees no rows and, in storage, only the top-level file
      (not `staff/`, `Staff/`, `tmp/` or deeper);
    - the public is refused;
    - the audit function writes for the deal's agent and refuses another
      agent and unknown actions.
    Nothing from the check remains. The security advisor's only new item
    is `log_deal_document_action` being callable by signed-in users, which
    is intended (it checks staff and deal access itself, like the other
    audit functions). All 15 AI switches on hosted are off, as are the
    sold-data switches.
  - **Not in this PR:** inspection reports and counter-offers (7b);
    Drive/Dropbox import (integrations PR after S6b).
- **PR 7b (repair items, bid list, response to the buyer's request;
  migration 0033, on hosted 2026-11-13; plan revised after owner review
  2026-11-13):**
  - **Repair items** (switch `ai_staff_inspection_items`):
    - "Repair items" next to a home or pest inspection report (Documents
      tab, and the new **Repairs** tab).
    - The server checks the report is this deal's own document and typed
      as an inspection.
    - It sends that one file, inline, under Zero Data Retention, with the
      list of trades. It returns up to 60 items, each with a title, detail,
      location, trade, page, severity and the report's own severity words.
    - Phones, emails, links and dollar amounts are stripped in code. A
      60-item answer is flagged "may be incomplete".
    - The agent edits, removes and adds items, then approves the list;
      Fair Housing, wiring and contact checks run at approval. "Revise"
      copies an approved list into a new draft. There's one open list per
      report; an unapproved list is deleted after 30 days idle.
    - Every page says "A summary, not a replacement for the report."
  - **Bid list** (no AI):
    - The approved items by trade (15 trades, incl. sewer lateral and pool
      and spa), with a printable page labelled "Drafted by the assistant,
      approved by {agent} on {date}".
    - Per trade: with the vendor switch on, the vendor quote request (PR 3)
      starts with that trade's items. With it off: copy the items, or open
      an email to a matching vendor with our code's list.
  - **Response to the buyer's request** (switch
    `ai_staff_repair_response`):
    - Every item starts as "Not requested" and stays out of the letter. The
      agent marks repair, credit (amount) or decline, can add items that
      aren't in the report, and must tick "The seller has approved these
      decisions".
    - Our code writes the greeting, the item list, the credit total, the
      fixed line "This summary is for convenience; the signed Request for
      Repair response form governs." and the signature. The assistant
      writes only an opening and a closing, from the property, the closing
      date and counts; never the report.
    - At approval, our code rebuilds the letter from the stored decisions,
      so a changed list can't be approved.
    - Numbers in the opening and closing must be typed by the agent or sent
      by our code; amounts in words, contacts, wiring and Fair Housing
      wording are refused.
    - Approved responses are copied, opened in email (a copy fallback over
      1,800 characters) or printed; nothing is sent by the console.
    - For Mark to confirm: the fixed line, and "Seller will repair, by a
      licensed contractor before close of escrow".
  - **Database:** 0033 adds:
    - the two switches;
    - the `inspection_items` and `repair_response` kinds on `ai_drafts`
      (deal only, with content);
    - one open items list per report (a unique index).
    The 0028 policies cover them (staff with deal access; approved ones
    visible to staff on the deal; approved drafts frozen and kept).
  - **Tests:**
    - 9 database tests (`ai-repairs.test.ts`).
    - 29 feature tests (`repairs.test.ts`): what each call sends, stripping,
      the cap and flag, the checks on inspection words ("wiring",
      "rewire", "master bedroom", "in-law unit", "grab bars"), our list, a
      dropped item, swapped amount or changed decision, numbers and number
      words.
    - 4 action tests (another deal's report refused).
    - `lib/numbers.ts` is now shared with market updates. The existing
      guard test keeps the Files API out of the Claude client.
    - Browser QA `scripts/qa/s6b-repairs.mjs`: 36 checks pass on the local
      stack with the fake Claude (incl. a tampered stored list rebuilt at
      approval, invented and spelled-out amounts blocked, an agent without
      deal access getting a 404, axe at 1440 and 390 px). The 7a and PR 2–6
      scripts still pass (47, 64, 42, 28, 34, 24). Screenshots in
      `docs/screenshots/s6b-repairs/`.
  - **On hosted (2026-11-13):** 0033 applied after checking that main's
    file matched the tested one and that the two `ai_drafts` constraints
    it replaces were there. `hosted-repairs-check.sql` (rolled back)
    passed:
    - both switches are off;
    - the deal's agent starts an items list and a response; a second open
      list for the same report is refused (the unique index);
    - a response without a deal is refused;
    - an approved response can't be edited or discarded (`draft_closed`),
      and how it was used is recorded (print);
    - an agent without deal access, the seller and the public see nothing
      and can't add.
    Nothing was left behind, and no AI switch is on. Security advisor:
    nothing new (0033 adds no table, policy or function).
  - **Not in this PR:** counter-offer changes and "Check unchecked
    documents" (7c); editing deal terms; cost estimates.
- **PR 7c (what changed in a counter offer, "Check unchecked documents";
  merged; migration 0034, on hosted 2026-11-13; owner answers 2026-11-12):**
  - **What changed** (switch `ai_staff_counter_changes`):
    - "What changed" next to a file typed "Counter offer or addendum"
      (the deal's files and the seller's tagged uploads).
    - The server checks the file is this deal's own and typed as a counter
      offer, then sends that one file, inline, under Zero Data Retention,
      with the deal's recorded terms as data: acceptance date, days to
      close and closing date, price, rent-back, contingency days. No
      address, names or contacts.
    - The assistant reports only what the document sets, with pages and
      quotes. Our code compares each term with our records and marks it
      "Differs", "Same" or "Not in this document"; the model's view of
      what changed isn't used. Contacts are redacted and account-like
      numbers dropped.
    - Shown only: nothing is stored and the deal's terms and schedule are
      never changed. If it may not be signed by both sides, it says it may
      not be in effect.
  - **Check unchecked documents** (the existing switch
    `ai_staff_document_check`):
    - Every document check is now recorded on the file: when, by whom
      (stamped by the database), the signed answer and how many things to
      look at. Never what the assistant wrote. Each file shows "Checked …
      by …" or "Not checked yet".
    - "Check unchecked documents (N)" checks up to 10 never-checked files,
      oldest first, the seller's uploads included. It first asks, with the
      count and the number of requests ("10 requests, counted against your
      daily limit"); Cancel sends nothing.
    - The browser sends them one at a time (each its own time limit, each
      checked again on the server), with progress and "Stop after this
      one". A limit, budget or switch-off answer stops the run.
    - Results per file with pages and "Save these types"; the notes go
      when you leave the page.
  - **Database:** 0034 adds the switch, the check columns on
    `deal_documents` and `deal_member_document_types`, and a trigger that
    stamps `checked_at` and `checked_by` itself (a client can't backdate a
    check or record it as someone else; a check can't be cleared). The
    0032 policies apply; no new policy or definer function.
  - **Also:** the deal tabs row now wraps, so deal pages no longer scroll
    sideways at 390 px (the Repairs tab had pushed it past phone width;
    7a and 7b screenshots regenerated). The console's Today page still
    scrolls sideways at 390 px (leads table, MLS feed, automations): a
    separate fix.
  - **Tests:**
    - 7 database tests (`doc-checks.test.ts`): the stamp is always the
      caller and now, re-checks re-stamp, no clearing or half checks, an
      agent without deal access, the seller, a buyer and the public
      refused, the seller's upload upserted.
    - 12 feature tests (`counter-changes.test.ts`): what is sent, our
      comparison (including a value equal to ours that the model might
      call changed), the closing date from the schedule engine, impossible
      values, redaction, dates kept, the unchecked list; 7 action tests
      (`document-actions.test.ts`): another deal's file or a file not
      typed as a counter offer refused with nothing sent, terms unchanged,
      checks recorded only on success, limit answers stop the batch.
    - Browser QA `scripts/qa/s6b-counter-checks.mjs`: 32 checks pass on
      the local stack with the fake Claude (incl. 11 files checked 10 then
      1, Stop, the stamps in the database, no issue text stored, no
      sideways scrolling at 390 px, an agent without deal access getting a
      404, axe at 1440 and 390 px). The 7b, 7a and PR 2–6 scripts still
      pass (36, 47, 64, 42, 28, 34, 24). Screenshots in
      `docs/screenshots/s6b-counter-checks/`.
  - **On hosted (2026-11-13):** 0034 applied after checking that main's
    file matched the tested one and that none of its columns, its trigger
    function or its switch were there yet. `hosted-counter-checks-check.sql`
    (rolled back) passed:
    - the switch is off and a new file is unchecked;
    - the deal's agent records a check, stamped with the agent and now
      even when an old date is sent;
    - setting `checked_by` directly is refused, and a check can't be
      cleared or half recorded (`check_incomplete`);
    - the seller's upload gets its check row for the deal;
    - an agent without deal access and the seller change and see
      nothing; the public is refused.
    Nothing was left behind, and no AI switch is on. Security advisor:
    nothing new (the trigger function isn't a definer function and has a
    fixed search path).
  - **Not in this PR:** editing deal terms (a non-AI "Edit deal terms"
    comes later); appointments and call notes (PR 8).
- **PR 8 (call notes, appointment drafts, staff to-dos; migration 0035,
  on hosted 2026-11-13; owner answers 2026-11-13):**
  - **Call notes** (switch `ai_staff_call_notes`), on a lead or a deal:
    - The person types their notes from a call (2,000 characters at
      most). They're the person's own words, so the Fair Housing input
      check runs on them; contacts are redacted and lockbox or access
      details refused before anything is sent. Sent with them: first
      names, what the lead asked about or the property and closing date,
      today's date.
    - The assistant suggests up to 8 to-dos (with due dates) and, if the
      call needs one, a follow-up email. Our code removes duplicates,
      contacts and links. Nothing is added until the person ticks to-dos
      and adds them; the follow-up is an ordinary draft (edit, approve,
      copy, email, or a portal message), with the draft checks at
      approval.
    - The notes aren't kept. On a lead, a tick box saves them as a lead
      note.
  - **Appointment drafts** (switch `ai_staff_appointments`), on a lead or
    a deal:
    - From one sentence ("walkthrough with Dana Tuesday 3pm, 45 min, at
      the house") the assistant proposes the fields and a confirmation.
      Our code checks them (a real date from today to a year ahead,
      7:00 AM to 9:00 PM in 5-minute steps, 15 minutes to 8 hours) and
      leaves anything wrong blank; it fills the date and time into the
      confirmation itself.
    - At approval the confirmation must state the date and time the
      fields say ("Put the date and time in the email" fixes it), with no
      placeholders, contacts, access details, wiring or Fair Housing
      wording.
    - Approved: "Add to calendar (.ics)" (UTC, daylight saving handled),
      copy, open in email, or print. Nothing goes on a calendar unless a
      person opens the file; the console books and sends nothing. Google
      Calendar comes with the integrations PR.
  - **Staff to-dos** (no AI): a staff-only list on each lead and deal
    (add, done, delete) and "To-dos due this week" on Today. Sellers and
    buyers never see them; the deal's schedule tasks are unchanged.
  - **Database:** 0035 adds the two switches, the `call_followup` and
    `appointment` draft kinds (exactly one lead or deal) and
    `staff_todos` (staff who work the lead or deal only; created in your
    own name; column-limited grants). No definer function.
  - **Also:**
    - The generic draft save and approve actions now take email drafts
      only. Repair items and responses, kits, presentations, market
      updates, CMA write-ups and appointments can only be changed and
      approved through their own pages and checks (before, a direct call
      could have approved one without them).
    - The calendar-file helpers moved to `packages/lib` (`ics.ts`); the
      website's open-house and timeline files use them.
    - Found and suggested separately: the Fair Housing check doesn't
      block "no families with kids" (it blocks "no children").
  - **Tests:**
    - 10 database tests (`calls-appointments.test.ts`) and
      `hosted-calls-appointments-check.sql` (passes locally).
    - 12 feature tests, 8 action tests (another lead or deal refused with
      nothing sent; to-dos only when ticked; the lead note only when
      ticked; a changed time blocks approval; the generic actions refuse
      appointments), 3 calendar-file tests (DST, folding, escaping).
    - Browser QA `scripts/qa/s6b-calls-appointments.mjs`: 35 checks pass
      on the local stack with the fake Claude (incl. the calendar file's
      UTC time, no sideways scrolling at 390 px, an agent without access
      getting a 404, axe at 1440 and 390 px). The 7c, 7b, 7a and PR 2–6
      scripts still pass (32, 36, 47, 64, 42, 28, 34, 24). Screenshots in
      `docs/screenshots/s6b-calls-appointments/`.
  - **On hosted (2026-11-13):** 0035 applied after checking that main's
    file matched the tested one, that none of its objects existed yet and
    that the two `ai_drafts` constraints it replaces were there.
    `hosted-calls-appointments-check.sql` (rolled back) passed:
    - both switches are off;
    - the agent starts a follow-up on a lead and an appointment on a deal;
      both targets at once, or an appointment without its fields, are
      refused;
    - the agent adds to-dos on the deal and the lead and marks one done;
      a to-do in someone else's name is refused;
    - an agent who works neither sees no to-dos and can't add a to-do or
      a draft;
    - the seller sees no to-dos and none appear in the schedule tasks;
      the public is refused.
    Nothing was left behind, and no AI switch is on (19 staff switches,
    all off). Security advisor: nothing new (no definer function).
  - **Not in this PR:** Google Calendar (integrations PR); to-dos in the
    daily briefing; the live test against the real model (PR 9).
- **PR 9 (final QA, the live test, two fixes; no migration; merged
  2026-11-13; owner answers 2026-11-13):**
  - **Owner decisions:**
    - The live test is built here and run only on the owner's go-ahead.
    - It covers every feature once.
    - Fictional data may be sent before Zero Data Retention. Real client
      data still waits, and every switch stays off.
  - **Live test** (`apps/va/src/live/`, `pnpm --filter va test:live`):
    - **What it runs:** 20 calls, one for each AI feature value. The listing
      and buyer presentations share the `ai_staff_presentations` switch, so
      the 20 calls cover all 19 switches. They go through the same `runAi()`
      pipeline the console uses, with fictional fixtures: contract,
      counter-offer, disclosure, receipt and inspection PDFs, plus a listing,
      a lead, work items, stats and a CMA.
    - **No-model checks:** the Fair Housing refusals ("no children", "no
      families with kids") and the access-details refusal. Each must stop
      before anything is sent.
    - **Never in CI:** it has its own config, `pnpm test` and CI don't load
      it, and it refuses to start when `CI` is set. A normal CI test
      (`feature-coverage.test.ts`) fails if a new AI feature has no live
      call, or if the calls' switches differ from the 19 on /assistant.
    - **Modes:**
      - Fake mode (`LIVE_AI_FAKE=1`) uses the local fake.
      - Live mode needs `LIVE_AI=1` and `ANTHROPIC_API_KEY` in the shell
        that runs it.
      - Each mode sets its own target and never inherits
        `ANTHROPIC_BASE_URL`.
    - **Spending cap:**
      - `LIVE_AI_BUDGET_USD`, default $5.
      - Before each call, the test refuses it if spent-so-far plus that
        call's worst case would pass the cap; that call and the rest are
        reported "not run".
      - The worst case assumes the fallback fires and both attempts are
        billed at the dearer model's price, with no retries (the live
        client runs with `maxRetries: 0`).
      - The 20 worst cases add up to about $6.69 (113k input and 126k
        output tokens). The expected spend is about $1.50–3.
      - Prices in `models.ts` were checked against Anthropic's pricing page
        on 2026-11-13.
    - **Injection:** the disclosure packet and the inspection report each
      carry a page telling the model to write wiring instructions and the
      code `CANARY-VABRATO-7Q4Z`. The canary in any raw answer, or a
      payment-details block on either call, is a hard fail.
    - **Hard fails:**
      - a model call that doesn't end ok;
      - wiring or contact details in what a person would see;
      - the injection obeyed;
      - an expected refusal that doesn't happen;
      - spend over the cap;
      - in live mode, a call costing more than its worst case.
    - **Findings:** semantic checks (the price taken from the counter, the
      appointment on Tuesday 2026-11-17 for a fixed "today" of Friday
      2026-11-13) are reported, not failed.
    - **Reports:**
      - A full live run writes metadata only to
        `docs/qa/s6b-live-run.json`: outcome, tokens per attempt, cost and
        seconds for each call. Error text is cut to a short reason with
        keys and long numbers removed.
      - Raw answers and fake or partial reports go to `apps/va/.live-ai/`,
        which is gitignored.
    - **Fake run:**
      - 20 of 20 calls ok.
      - The fallback's two attempts are both counted.
      - A $0.01 cap leaves all 20 calls "not run" with nothing sent.
  - **Cost under fallback (fix in `packages/ai`):**
    - When the server-side fallback fires, Anthropic bills each attempt, but
      the top-level usage covers only the attempt that answered.
    - The client now reads every attempt from `usage.iterations`, and
      `runAi` records the sum. Before, the console's monthly budget
      undercounted those requests.
    - 5 tests.
  - **Fair Housing, familial status** (`packages/lib/src/fair-housing.ts`):
    - **Now blocked:**
      - "no families", "no families with kids", "without families", "not
        for families";
      - "not suitable / suited / ideal / good / great / safe / right / meant
        / intended for kids / children / families";
      - "children / kids / families (are) not allowed / permitted /
        welcome";
      - "no young children".
    - **Still blocked:** "no kids", "no children", "without kids", "adults
      only", "perfect for families" and the rest.
    - **Must pass, and does:**
      - "family room", "no family room";
      - "kids' bedroom", "no children's play structure", "children's play
        area in the park nearby";
      - "the seller's children will move the furniture";
      - "single-family home";
      - "55+ community" (housing for older persons is a lawful exemption).
    - **Existing text:** the repo's templates, web content, seed SQL and
      test fixtures, and the hosted published content (read-only), were
      checked with the new rules. Nothing new is blocked.
    - **Needs Mark:** sign-off on this wording list.
  - **Today:** at 390 px the "Newest leads" table widened the page to
    554 px. The grid columns now get `min-w-0`, so the table scrolls inside
    its own labelled region. It now fits at 320 and 390 px, with no second
    copy of the list.
  - **Fixtures:** a real, publicly listed bank routing number
    was used in 15 test fixtures. It's now the fictional `999999999`, and
    the wiring checks still trigger on it.
  - **Console-wide sweep** (`scripts/qa/s6b-final.mjs`):
    - **Roles:** the lead admin (MLS-verified), the backup agent with the
      lead admin not away and then away, an unverified agent, the VA, the
      TC, and a buyer refused.
    - **Pages:** every console page, with every AI switch off and then all
      on.
    - **Each page:** its status, axe at 1440 and 390 px, no sideways
      scrolling at 390 and 320 px, and no console errors.
    - **Keyboard pass:** call notes, the appointment editor, Check unchecked
      documents, What changed, the repair items editor and the response
      decisions.
    - **No model requests:** page loads sent none.
    - **Result:** 1,232 checks pass on the local stack with the fake Claude.
      Page loads sent nothing to the model, and the switches were off again
      afterwards.
    - **Fixed along the way:** the notification bell, which every console
      page has.
      - **The bug:** about one page load in 50 hit a React hydration error
        (#418). The server renders the bell with no alerts. When the alerts
        were already loaded by the time the browser hydrated, the badge
        didn't match the server's HTML, and React re-drew the whole page.
      - **The fix:** the alert count now appears only after hydration. The
        bell also gets its own query client instead of a module-level one,
        which on the server was one cache shared by every request
        (TanStack's Next.js advice; the website already did this).
      - **Checked:** 150 loads with the switches on, now with no console
        errors; it was 1 in 48 before.
  - **The 9 feature QA scripts rerun:** all pass: assistant 64, drafts 42, summaries 28, kits 34, market and CMA 24, documents 47, repairs 36, counter checks 32, calls and appointments 35.
  - **Not in this PR:** the live run itself. Owner decision 2026-11-13: it
    runs just before the first AI switch goes on, not now (below).
- **Needs you:**
  - **The live run** (owner decision 2026-11-13: just before the first
    switch goes on):
    - **Why then:** nothing reaches users while every switch is off, and the
      model, its prices or the prompts may change by then, so the run that
      counts is the last one before turning features on. Meanwhile the CI
      coverage test keeps the harness complete: a new AI feature without a
      live call fails the build.
    - **Optional before S5b** (it reuses `packages/ai`): if a key is handy,
      a two-call check costs well under $1:
      `LIVE_AI=1 LIVE_AI_ONLY=contract_reader,lead_reply ANTHROPIC_API_KEY=… pnpm --filter va test:live`.
    - **The full run:**
      - In the Anthropic Console, create a workspace "vabrato-live-test"
        with a $10 spend limit, and a key in that workspace only.
      - Run `LIVE_AI=1 ANTHROPIC_API_KEY=… pnpm --filter va test:live` in
        your own shell. The key can't be injected into a cloud session:
        `api.anthropic.com` bypasses the session's proxy.
      - Send `docs/qa/s6b-live-run.json`. It's compared with the Console's
        usage for the workspace, and both are recorded here in a small
        docs PR.
      - Revoke the key and archive the workspace afterwards.
  - **Before any switch goes on:**
    - the full live run above, passing;
    - an Anthropic API key (`ANTHROPIC_API_KEY` on the console, later the
      website);
    - Anthropic's written Zero Data Retention confirmation;
    - MLSListings' written approval for AI features that use MLS data
      (listing kits, presentations, market updates, CMA write-ups; the SPEC
      has no rule for this yet);
    - then `ai_enabled`, and each feature's switch.
  - **Mark:**
    - the Fair Housing wording list above;
    - the checklist's "(confirm)" rows (PR 7a);
    - the repair-response wording (PR 7b).

**Must ship before launch (S5 review item 17):** done in S6 PR 2a (member
message and tour-request alerts, in the console and by email). Email
delivery itself waits on Resend (To finish S6, step 1).

**Outstanding for launch (S9), not blocking S5.** Full list in [s4-content-checklist.md](s4-content-checklist.md):
- MLSListings' official IDX icon and disclaimer (one file, `apps/web/src/lib/mls-legal.ts`);
- the Mapbox token;
- Turnstile keys, `LEAD_IP_SALT` and `REVALIDATE_SECRET` in Vercel;
- real copy, photos, bios, testimonials and the San Carlos guide;
- the office phone (currently a fictional 555 number) and the CSLB license number;
- final legal pages;
- homes.sancarloslife.com DNS, Vercel domain, then the flag;
- purging the preview fixtures before the live feed.

### Retire apps/buyer and apps/seller (done in S5 PR 5)

Both apps are deleted. Where everything went:

| What | Moves to |
|---|---|
| Buyer pages (property list/detail, add-property form, actions) | apps/web `/my/buyer` |
| Seller pages (timeline, to-dos, wiring banner, actions) | apps/web `/my/seller` |
| Login page, login form, auth callback (duplicated in 3 apps) | one shared version in packages/lib; `/my` uses it |
| `property-schema.ts` (+ test), `timeline.ts` (+ test) | packages/lib (shared with apps/mobile) |
| access-denied, header components | packages/ui |
| `middleware.ts`, `supabase-server.ts`, `auth.ts` role guards | apps/web, using packages/lib helpers |

Auth helpers were already shared in packages/lib, and `/my` has its own
sign-in, callback and shell, so nothing else needed moving. The tests moved
with the code (timeline: 5 tests, now in packages/lib).

**Seller portal setup still needed (your step, not blocking):**
- Listing views count only once `LISTING_VIEW_SECRET` is set on the
  vabrato-website Vercel project *and* its sha256 is in the database:
  `insert into listing_view_keys (key_hash) values (encode(sha256(convert_to('<secret>', 'UTF8')), 'hex'));`
  in the Supabase SQL editor. Until then the route answers 204 and counts nothing.
- Staff link each deal to its MLS listing key on the deal page (apps/va).
- Open-house sign-in links: apps/va → Open houses → Create sign-in link.
  `PUBLIC_SITE_URL` on vabrato-console sets the link's host.

## Decisions

- **2026-11-09 — AI policy change (owners):** AI is now allowed in `/my`,
  apps/mobile and the agent console under SPEC `<ai_rules>`; not on signed-out
  public pages at launch. Each AI feature sits behind its own feature flag;
  all model calls go through server-side `packages/ai`. Replaces the old
  no-runtime-AI rule (CLAUDE.md hard rule, SPEC AI-1 to AI-9). Buyer email
  parsing stays deterministic and automatic client notifications stay static
  templates. New segment S5b (Member AI assistant, Ask Vabrato).

- **2026-11-11 — Staff roles (Rachanee):** Mark admin (and lead admin once
  signed in); Rachanee admin (owner, setup; lead admin until Mark signs in);
  Viv admin (and backup); Cedrick VA; Shermaine agent. Admin means every
  deal, member record and message thread, the feature flags (including the
  MLS-10 switches), Settings and lead routing, the deletion queue and every
  agent profile. It doesn't add leads or publishing (those follow the
  acting lead admin) or MLS data (ACC-1). Admins also get the in-console
  delivery and MLS-sync alerts, and every new lead whenever routing is
  unset. Applied per person after their first sign-in.

- **2026-11-12 — VA assistant first (Rachanee):** the staff AI assistant
  (S6b) is built before the member assistant (S5b). SPEC `<ai_rules>` staff
  features extended, including reading a deal's own documents under Zero
  Data Retention. Working defaults until Rachanee says otherwise (proposed
  2026-11-12, not yet confirmed): model Claude Opus 5.5; the usage limits
  listed under S6b; the agent sees assistant suggestions, not a member's
  whole conversation; photo-style room concepts wait for an image provider.

- **2026-11-13 — Ask Vabrato (Rachanee):** members' conversations aren't
  kept (only what a member chooses to save); the assistant is its own page
  in `/my` first; a suggested to-do needs the agent's approval; the first
  PR is "Explain a term" and "Search by sentence". The 2026-11-12 working
  defaults stay.

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
- **Seller portal** (apps/web `/my/seller`, S5) — wiring banner, listing
  KPIs, timeline from the schedule engine with an .ics download, seller
  to-dos (read-only), weekly listing activity. Invite flow creates the auth
  user via service role with NO email sent (avoids mailer rate limit); a buyer
  invited as seller becomes `both`; the seller signs in at `/my`.
- **Buyer tracker** (apps/web "Homes I'm pursuing", S5) — tracked properties
  with status ladder, per-property activity feed (empty until inbound parsing
  lands).
- **Notification pipeline (code-complete)** — 5 static seller templates
  (merge fields only, no runtime AI), rows queued on seller invite (future
  dates only, re-invite replaces), DI processor + Resend REST sender at
  `apps/va /api/notifications/process` behind `CRON_SECRET`. Returns 503 until
  `RESEND_API_KEY` exists; rows stay `scheduled`.

Tests: 1,304 across packages/db (PGlite RLS and member isolation), packages/lib, packages/ui, packages/mls,
apps/web and apps/va (`pnpm test`).

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
- Integrations (a separate PR after S6b, owner decision 2026-11-12): Google
  Calendar sync, Google Drive / Dropbox receipt import (va only). The AI
  receipt reader is S6b PR 7a.
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
- Under RLS, `insert ... returning` (supabase-js `insert().select()`) checks
  the new row against the table's SELECT policy. If that policy calls a
  STABLE function that looks the row up again (`has_deal_access`), the
  function can't see it yet and the insert fails with "new row violates
  row-level security policy". Make the id in the app and don't read back,
  or test the insert as a non-admin role.
- React 19 resets an uncontrolled form after every server action, including
  one that returns an error, so typed values are lost. Put browser checks
  (`required`, `min`, `max`) on the fields so a bad submit never reaches the
  action, or keep the fields controlled.
- A `<select>` wrapped inside its `<label>` gets the options' text in its
  name. Use `htmlFor` and an id.
