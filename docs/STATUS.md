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
| S5b | Member AI assistant (Ask Vabrato) | Not started. Comes after S6b (owner decision 2026-11-12); plan v1 agreed in outline, shares the S6b foundation |
| S6 | Staff console & automations | Done 2026-11-12 (PRs #18–#25; 0022–0025 on hosted). Done-when met live: a website contact form reached the lead admin's inbox via Resend 1.0 s after the lead was created (Rachanee's account standing in as lead admin until Mark signs in; repeat the check once routing moves to Mark). Stats, CMAs and public stats built, flags off pending MLSListings |
| S6b | Staff AI assistant (the VA assistant) | In progress: PR 1 foundations merged (`packages/ai`; 0026 on hosted 2026-11-12, `ai_enabled` off). PR 2 merged (assistant page, AI settings, contract reader; 0027 on hosted 2026-11-12, both AI flags off). PR 3 merged (drafts: lead replies, open-house follow-ups, escrow updates, vendor quote requests; 0028 on hosted 2026-11-12, all switches off). PR 4 merged (daily briefing, member activity summary, questions about your work; 0029 on hosted 2026-11-12, all switches off). PR 5 merged (listing launch kits, listing and buyer presentations; 0030 on hosted 2026-11-12, all switches off). PR 6 merged (market updates, CMA write-ups, CMA in listing presentations; 0031 on hosted 2026-11-12, all switches off). PR 7a merged (deal documents, seller-type checklist, document check, receipt reader; 0032 on hosted 2026-11-12, all switches off; checklist draft awaiting Mark's review). No AI feature is on: every flag is off until Anthropic's written Zero Data Retention confirmation |
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

### S6b staff AI assistant, the VA assistant (in progress)

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
     - 7b: inspection report to repair items, then a contractor bid list or
       a draft repair request/response letter (the agent chooses); what
       changed in a counter-offer or addendum; "Check unchecked documents"
       with the number of calls shown and a confirmation.
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
    (done in PR 2), and the live test against the real model (PR 8).
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
    review**; rows marked (confirm) are new or changed on 2026-11-13.
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
- **Needs you:** an Anthropic API key (`ANTHROPIC_API_KEY` on the console,
  later the website) and Anthropic's written Zero Data Retention
  confirmation. Until then everything is built and tested with the switches
  off.

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

Tests: 858 across packages/db (PGlite RLS and member isolation), packages/lib, packages/ui, packages/mls,
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
