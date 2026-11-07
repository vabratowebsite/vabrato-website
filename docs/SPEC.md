# Vabrato Real Estate Services: Website, Member Portal, Mobile App and Agent Console

Product spec for coding agents. Read this, `CLAUDE.md` and `docs/STATUS.md` before planning any task.
Last updated: 2026-11-08.

<role>
You are the lead engineer and product designer for this project. You extend the existing pnpm monorepo `vabratowebsite/vabrato-website` into four products:

- a full public website
- a member portal
- a mobile app
- an agent console

Together they replace the current WordPress site at vabrato.com and its iHomefinder IDX.
</role>

<organization>

| Field | Value |
|---|---|
| Name | Vabrato Real Estate Services |
| Address | 935 Chestnut St, San Carlos, CA 94070 |
| Designated Broker | Mark Martinho, CA DRE Lic. #01372898 |
| Broker | Viv Kelvin (backup to Mark, see `<roles>`) |
| Corporate DRE | #02142060 |
| MLSListings Broker Code | VABRA |
| MLSListings Branch | 1 |
| MLSListings Office ID | VABRA-1 |

</organization>

<repository>
Before starting any work, read `CLAUDE.md` and `docs/STATUS.md`.

Existing contents:

| Path | Purpose |
|---|---|
| `apps/va` | Internal transaction desk. Extend this into the agent console. |
| `apps/seller` | Seller portal prototype. Absorb into `/my` in `apps/web`, then delete. |
| `apps/buyer` | Buyer tracker prototype. Absorb into `/my` in `apps/web`, then delete. |
| `packages/db` | Supabase schema, migrations, RLS |
| `packages/lib` | Holiday-aware schedule engine, auth, notifications |
| `packages/ui` | Design tokens, Panel |
| `prototypes/va` | Prototype of the transaction desk |

New apps and packages to create:

| Path | Purpose |
|---|---|
| `apps/web` | Public site, member portal (`/my`) and sancarloslife.com listings section |
| `apps/mobile` | iOS/Android app |
| `packages/mls` | RESO Web API client, mock server, fixtures, sync jobs |

`apps/buyer` and `apps/seller` were test-only prototypes with no real users. Delete them once `/my` covers their features. No user or data migration is needed.
</repository>

<stack>
Do not substitute any item below without asking first.

| Area | Choice |
|---|---|
| Web | Next.js 15 App Router, TypeScript, Tailwind, deployed on Vercel |
| Backend | Supabase Postgres + PostGIS, Supabase Auth, Supabase Storage, with RLS |
| Validation | Zod |
| Data fetching | TanStack Query |
| Tests | Vitest. For `apps/mobile`, propose a React Native test setup (e.g. jest-expo) in the S7 plan and get approval. |
| Email | Resend |
| Mobile | Expo (React Native) + EAS |
| Maps | Mapbox |

</stack>

<infrastructure>
All accounts are owned by Vabrato.

| Service | Resource | Use |
|---|---|---|
| Vercel | Project `vabrato-website` | `apps/web`: public site, member portal, sancarloslife.com listings section. Functions in `sfo1`. |
| Vercel | Second project for `apps/va` (create in S6) | Agent console at `console.vabrato.com`, same repo. |
| Supabase | Project "Vabrato Website" (us-west-1) | Database, auth, file storage |
| Render | Scheduled jobs | MLS sync. Runs can last minutes, so they must run here, never inside Vercel request limits. |
| Cloudflare | DNS + CDN | vabrato.com |
| Cloudflare R2 | Object storage | Listing photos. Move here only when Supabase Storage use passes 80% of the plan quota; propose the move and wait for approval. |

The GitHub repo is public during the build. Never commit secrets, MLS credentials or real MLS data. Before launch, Vercel is upgraded to Pro and the repo is made private (in that order).
</infrastructure>

<mls_data>
Source: Vabrato's own MLSListings feed, through the RESO Web API.

Resources: Property, Media, OpenHouse, Member, Office.

Data levels:

| Level | Where it may be used | Who may see it |
|---|---|---|
| IDX | Public website, mobile app (signed out), sancarloslife.com listings section | Anyone |
| VOW | Member portal and mobile app (signed in) | Registered clients who have accepted the VOW Terms of Use |
| FULL | Agent console only | Agents who are signed in and verified as active MLSListings subscribers in Vabrato's office |

Sync:

- Incremental sync every 15 minutes, keyed on `ModificationTimestamp`. Full reconcile nightly. Both run on Render.
- Freshness target: a listing change appears on the site within 30 minutes (one sync interval plus run time). Alert staff in the console if a run fails or the last successful run is older than 30 minutes.
- Office filter (roster, "our listings"): read the office identifier from config (`MLS_OFFICE_ID`), not hard-coded. Spec values are Broker Code `VABRA` and Office ID `VABRA-1`; confirm which one the feed uses in `OfficeMlsId` / `ListOfficeMlsId` once credentials arrive.

Search area: San Mateo and Santa Clara Counties only (see `<service_area>`), MLSListings data only.

Before credentials arrive:

- Build against a mock server and fixtures in `packages/mls`.
- Fixtures use RESO Data Dictionary field names.
- Fixtures are entirely fictional.
</mls_data>

<brand>
Match the current vabrato.com. Mockups are in `docs/mockups/`. Applies to the public site, sancarloslife.com listings section and mobile app. The agent console uses the same tokens and fonts in a simpler, data-dense layout.

- Pages: white background
- Colors: navy `#151B5C`; gold `#E8A90C` (logo)
- Display headings: high-contrast uppercase serif, Bodoni Moda
- Subheads: Libre Baskerville
- Body: Roboto
- Buttons: thin outlined uppercase buttons with a short underline
- Listing cards: dark card with the photo, the address at top-left, the price at bottom-left, and a black "LISTING NO." bar

</brand>

<goals>
<goal id="G1" name="Public site (apps/web)">
Reproduce today's pages:

- Properties (our office's for-sale and sold listings; sold behind the `public_sold` flag, see MLS-10)
- About/Team
- Testimonials
- Explore
- Contact

Add:

- Map and list search across San Mateo and Santa Clara Counties
- Listing detail pages
- Open houses
- A page for every city in both counties (see `<service_area>`)
- Home valuation request
- "Transform your home" GC service page
- Insights hub with monthly market updates

</goal>

<goal id="G2" name="sancarloslife.com listings section">

- Shows San Carlos IDX listings only, Vabrato-branded.
- Served by `apps/web` (same codebase and data) on a subdomain such as `homes.sancarloslife.com`, using host-based routing. The WordPress/Divi site links to it.
- sancarloslife.com itself stays on WordPress/Divi. Do not rebuild it.
- MLS-1 and MLS-2 apply on this subdomain too.

</goal>

<goal id="G3" name="Free membership (/my in apps/web)">

- One account per person. `role` is one of `buyer | seller | both`.
- `/my` replaces `apps/buyer` and `apps/seller`.
- Features:
  - Saved homes and saved searches
  - Alerts on new matches and price changes
  - Sold prices and price history (VOW data only)
  - Tour requests
  - Documents
  - Messages with their agent
  - Seller timeline from the schedule engine in `packages/lib`
  - Listing performance: from our own data (site views, saves, tour requests, open house sign-ins) plus the seller's own listing at VOW level. Never FULL data.

</goal>

<goal id="G4" name="Mobile app (apps/mobile, iOS + Android)">
Uses the same account as the website. IDX when signed out; VOW after sign-in and accepting the VOW Terms. Features:

- Search
- Saved homes
- Sold prices and price history (VOW, signed in)
- Seller timeline
- Push alerts

</goal>

<goal id="G5" name="Agent console (extend apps/va)">

- Leads inbox and routing (see `<lead_routing>`)
- Members
- MLS sync health
- Featured overrides
- Content editor (city guides, Insights, testimonials, agent profiles)
- Market statistics
- CMAs and comparable sales
- Seller weekly report: generated by code from a static template with the same data as listing performance, reviewed and sent by staff. No AI in the client-facing report (AI-1).
- AI-assisted drafts (see AI-1 to AI-9)

</goal>

<goal id="G6" name="SEO / AEO">

- Pages are server-rendered.
- Pages include schema.org JSON-LD.
- Pages include FAQ blocks.
- Every old vabrato.com URL returns a 301 redirect to its new URL. The old-URL list is the union of a site crawl, the current sitemaps and a Semrush top-pages export, saved in `docs/seo/old-urls.csv`.
- Current rankings are kept, measured against the Semrush baseline saved in `docs/seo/baseline.csv` before launch.

</goal>
</goals>

<hard_rules>
These rules are non-negotiable. If a task would violate one, stop and ask.

<rules group="General">

- **GEN-1:** Keep every rule in `CLAUDE.md`. If `CLAUDE.md` and this spec conflict, stop and ask.
- **GEN-2:** Secrets live only in environment variables: Vercel, Render, and local `.env.local`. Never commit or print them.
- **GEN-3:** All seed and test data is fictional.
- **GEN-4:** Meet WCAG 2.2 AA in every app (public site, portal, console, mobile).

</rules>

<rules group="AI">

- **AI-1:** No runtime AI in buyer- or seller-facing code. This covers `apps/web` public pages, `/my`, `apps/mobile`, and anything sent to clients automatically.
- **AI-2:** AI is for staff only. Use the Claude API under Anthropic's Commercial Terms with Zero Data Retention, behind a feature flag.
- **AI-3:** Our own code computes statistics and selects records. Send only that request's results, and only through a field allowlist.
- **AI-4:** Never send any of the following to the AI:
  - seller or occupant contact info
  - lockbox or showing instructions
  - agent phone or email
- **AI-5:** Do not use MLS data for training, fine-tuning, embeddings or vector stores.
- **AI-6:** AI logs record only request type, time and user. They never record MLS content.
- **AI-7:** A person approves every draft before it is sent or published (see `<approvals>`).
- **AI-8:** Every draft gets a Fair Housing language check.
- **AI-9:** Delete discarded drafts after 30 days. Approved drafts become published content or part of the client's transaction file and follow those retention rules. Drafts are stored only in our Supabase database.

</rules>

<rules group="MLS compliance">

- **MLS-1:** Every page that shows MLS data displays the MLSListings logo, the MLSListings disclaimer and the last-updated time.
- **MLS-2:** Other brokers' listings show the IDX icon and the listing broker.
- **MLS-3:** Honor display flags and opt-out flags.
- **MLS-4:** Show only the fields permitted for the page's data level (IDX, VOW or FULL).
- **MLS-5:** Remove off-market or ineligible listings at the next sync.
- **MLS-6:** Show sold detail and price history only to signed-in members who have accepted the VOW Terms of Use.
- **MLS-7:** FULL data never leaves the agent console.
- **MLS-8:** Never commingle our MLSListings data with other MLS data.
- **MLS-9:** If the license is terminated, delete all MLS data within 30 days.
- **MLS-10:** Public display of Vabrato's own sold listings and of public market statistics (city pages, Insights) is built behind feature flags `public_sold` and `public_stats`, **off by default**. Turn on only after MLSListings confirms in writing. Until then, public pages show for-sale listings only.

</rules>

<rules group="FULL access">

- **ACC-1:** An agent gets FULL data only after sign-in and a check that they are an active MLSListings member in Vabrato's office (Member resource, office filter from `MLS_OFFICE_ID`). Re-check at every sign-in and nightly; lock FULL access automatically when a member becomes inactive.
- **ACC-2:** An unverified agent sees the console without any FULL data (no MLS-derived screens beyond IDX level). If MLSListings offers its own sign-in service, prefer it; ask before building.

</rules>

<rules group="Fair Housing">

- **FH-1:** No demographic filters and no steering language anywhere. This includes AI-generated copy.

</rules>

<rules group="Security">

- **SEC-1:** Enable RLS on every member table.
- **SEC-2:** For each member table, write tests proving that one member cannot read another member's rows.

</rules>
</hard_rules>

<business_details>
<service_area>
Every city in San Mateo County and Santa Clara County gets a city page with live listings and market statistics generated from MLS data (statistics behind `public_stats`, MLS-10).

San Mateo County (20): Atherton, Belmont, Brisbane, Burlingame, Colma, Daly City, East Palo Alto, Foster City, Half Moon Bay, Hillsborough, Menlo Park, Millbrae, Pacifica, Portola Valley, Redwood City, San Bruno, San Carlos, San Mateo, South San Francisco, Woodside.

Santa Clara County (15): Campbell, Cupertino, Gilroy, Los Altos, Los Altos Hills, Los Gatos, Milpitas, Monte Sereno, Morgan Hill, Mountain View, Palo Alto, San Jose, Santa Clara, Saratoga, Sunnyvale.

City page rules:

- Generate city pages from a `cities` table. Unincorporated areas (for example Emerald Hills, North Fair Oaks, El Granada) must be addable later with no code changes.
- Priority cities also get hand-written guides (neighborhoods, schools links, FAQ) on top of the generated data. San Carlos comes first; others are added over time from the agent console.
- Pages without written content must still be useful (live listings, stats, recent activity) so they are not thin content.

</service_area>

<roles>

| Role | Who | Powers |
|---|---|---|
| Admin | Mark Martinho | Receives all leads, reassigns leads, approves website content |
| Backup admin | Viv Kelvin | Same powers as Mark when Mark is marked "away" in the console |
| Agent | Other Vabrato agents | Own leads, own clients, own drafts, own profile |
| Staff | Non-agent staff | Console access as assigned; no FULL data unless also a verified agent (ACC-1) |

</roles>

<agent_roster>

- Once the feed is live: load agents from the MLS Member resource, filtered by the office identifier in `MLS_OFFICE_ID`.
- Until then: seed fictional agents.
- Profile content (bio, photo, contact) is edited in the agent console by the agent; no approval needed.

</agent_roster>

<lead_routing>

- All leads go to Mark Martinho (to Viv Kelvin when Mark is marked "away").
- Mark (or Viv) can reassign a lead to another agent in the console. The new agent is notified the same way.
- New-lead notifications go out within 1 minute by email and by in-console notification (web push where the browser allows it).

</lead_routing>

<approvals>

- **AI drafts:** the agent who requested the draft approves it.
- **Website content:** market updates, city guides, Insights posts and testimonials need Mark's approval (Viv's when Mark is away) before publishing, whether AI-assisted or not. Agent profile edits and featured-listing overrides do not.
- **Plans and PRs (development):** approved by Rachanee (web developer) unless she delegates.

</approvals>
</business_details>

<segments>
Work proceeds in these segments, in order, one Claude Code session each. A segment may span several PRs.

| # | Segment | Phase | Done when |
|---|---|---|---|
| S1 | Repo prep & plan | 1 | Monorepo layout for `apps/web`, `apps/mobile`, `packages/mls` agreed; CLAUDE.md updated |
| S2 | Design system | 1 | `packages/ui` has web tokens and core components matching `<brand>` |
| S3 | MLS package (mock first) | 2 | Client, mock server, fixtures, migrations, incremental + nightly sync, photos, health log; live feed syncs 7 days with no failed runs once credentials arrive |
| S4 | Public website | 3 | All G1 pages on staging; Lighthouse mobile ≥ 90; structured data validates |
| S5 | Membership portal | 4 | G3 complete; RLS tests pass for every table; a test buyer gets an alert within 30 minutes of a feed change |
| S6 | Staff console & automations | 5 | G5 complete; every web lead reaches Mark within 1 minute |
| S7 | Mobile app | 6 | G4 complete; TestFlight and Play internal testing |
| S8 | SEO migration | 7 | Old-URL list and redirects done; baseline saved |
| S9 | Launch QA | 7 | `<definition_of_done>` met |

If a segment is blocked on a human (see `<workflow>`), record it in `docs/STATUS.md` and continue with the next unblocked work.
</segments>

<workflow>
Follow these steps for every task.

1. **Orient.** Read `CLAUDE.md`, `docs/STATUS.md` and this spec.
2. **Plan.** Start in plan mode and produce a plan that lists files to add or change, migrations, tests and risks.
3. **Wait for approval** (see `<approvals>`). Do not write code until the plan is approved.
4. **Implement.** Small PRs, one segment at a time. Write tests with each feature, not afterwards. New member tables need RLS and cross-member isolation tests (SEC-1, SEC-2).
5. **Verify.** Run the checks in `<pr_checklist>`. `pnpm test` and `pnpm typecheck` must both pass.
6. **Record.** At the end of each segment, update `docs/STATUS.md`: what is done, what is blocked, what is next.

When you need a human, stop that piece of work and state exactly what is needed (credentials, DNS changes, legal wording, answers from MLSListings). Continue with other unblocked work.
</workflow>

<pr_checklist>
Confirm each item is satisfied or not applicable before marking a PR ready.

- [ ] `pnpm test` passes.
- [ ] `pnpm typecheck` passes.
- [ ] No secrets, MLS credentials or real MLS data in the diff (GEN-2, GEN-3).
- [ ] Every new member table has RLS and isolation tests (SEC-1, SEC-2).
- [ ] Every page showing MLS data has the logo, disclaimer and last-updated time (MLS-1).
- [ ] Other brokers' listings show the IDX icon and listing broker (MLS-2).
- [ ] Each page shows only the fields allowed for its data level (MLS-4).
- [ ] Sold detail and price history are gated to signed-in members who accepted the VOW Terms (MLS-6).
- [ ] Public sold listings and public stats stay behind `public_sold` / `public_stats` (MLS-10).
- [ ] No FULL data is reachable outside the agent console, or by unverified agents (MLS-7, ACC-1, ACC-2).
- [ ] No runtime AI in `apps/web` public pages, `/my`, `apps/mobile` or client-facing automated messages (AI-1).
- [ ] AI calls are flagged, allowlisted and logged as metadata only (AI-2 to AI-6).
- [ ] No demographic filters or steering language (FH-1).
- [ ] UI changes meet WCAG 2.2 AA (GEN-4).
- [ ] No stack substitutions without approval.
- [ ] `docs/STATUS.md` is updated if this PR ends a segment.

</pr_checklist>

<definition_of_done>
The project is done when all of the following are true:

- [ ] The site is live on vabrato.com.
- [ ] Listing changes appear within 30 minutes of MLSListings, and sync health shows no failed runs for the last 7 days.
- [ ] Lighthouse mobile scores are ≥ 90 on the home, search and listing pages.
- [ ] The site has passed MLSListings compliance review.
- [ ] The mobile app is approved in both the Apple App Store and Google Play.
- [ ] Every URL in `docs/seo/old-urls.csv` redirects with a 301.
- [ ] 30 days after launch, organic traffic and the top 50 baseline keywords show no drop beyond normal migration noise (within 3 positions on average).
- [ ] iHomefinder is cancelled, only after 7 consecutive days of clean live data: no failed sync runs, and Vabrato's active and sold listings match what MLSListings shows.
- [ ] Before launch: Vercel upgraded to Pro, then the repo made private.

</definition_of_done>

<open_questions>
Waiting on outside answers. Do not guess; build around them as described.

- **MLSListings:** whether Vabrato's own sold listings and aggregate market statistics may be shown publicly (MLS-10); whether `OfficeMlsId` is `VABRA` or `VABRA-1`; whether Media and OpenHouse are separate resources and photos may be copied to our storage; whether an MLSListings sign-in service exists for ACC-2; sold history depth (3 or 5 years).
- **Anthropic:** written Zero Data Retention confirmation before AI features go live (AI-2).

</open_questions>
