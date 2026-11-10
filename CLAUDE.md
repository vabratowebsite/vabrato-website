# Vabrato — Project Guide

Product spec: docs/SPEC.md. Read it before planning any task.
Current state: docs/STATUS.md.

## Structure

pnpm monorepo, one Supabase backend:

- apps/web     — public site, member portal (/my: buyer and seller portals) and the
                 homes.sancarloslife.com listings section (host-based routing in
                 src/lib/site.ts). Port 3003.
- apps/va      — internal transaction desk; becomes the agent console. Port 3000.
- apps/mobile  — reserved for the Expo app (S7). Do not create before S7.
- packages/db  — Supabase schema, migrations, generated types, shared queries
- packages/ui  — shared components and design tokens
- packages/lib — auth helpers, schedule engine, notifications, integrations
- packages/mls — MLSListings RESO Web API client, mock server, fixtures, sync (S3)

## Stack (don't substitute without asking)

Next.js 15 (App Router, TS) + Tailwind on Vercel · Supabase (Postgres + PostGIS,
Auth: magic-link + Google OAuth, Storage, RLS) · Zod · TanStack Query · Vitest ·
ESLint (next/core-web-vitals). Email: Resend (transactional + scheduled sends).
Inbound email: Postmark/SendGrid Inbound Parse. Integrations: Google Calendar +
Drive, Dropbox (va app only). Maps: Mapbox. Mobile: Expo + EAS. MLS sync jobs:
Render. DNS/CDN: Cloudflare.

## Hard rules

- AI features must follow <ai_rules> in docs/SPEC.md. Each AI feature sits
  behind its own feature flag. All model calls go through server-side
  packages/ai.
- Buyer email parsing stays deterministic per source, and notifications sent
  to clients automatically use static templates (AI never sends on a
  member's behalf).
- MLS data follows SPEC rules MLS-1 to MLS-10 and ACC-1/ACC-2: data levels
  (IDX / VOW / FULL), attribution, sold data gated to VOW members, public
  sold/stats behind `public_sold` / `public_stats` flags (off).
- Fair Housing: no demographic filters or steering language anywhere (FH-1).
- Never store bank/wiring details as text. Money screens show a "call escrow
  to verify wiring" banner.
- RLS mandatory: a seller reads only their own deal; a buyer reads only
  properties they track; agents read only their own deals. Every member table
  has tests proving one member can't read another's rows.
- The GitHub repo is PUBLIC during the build. Secrets only in .env.local /
  Vercel / Render env. Never commit or print them. Never commit MLS
  credentials or real MLS data (listings, exports, photos).
- All seed/test data is fictional (no real client PII, no real listings).
- WCAG 2.2 AA in every app.

## Schedule engine (packages/lib/schedule.ts) — the core

Input: ratificationDate, daysToClose, contingency offsets, sellerType,
rentBackDays. Output: ordered tasks {title, owner, phase, offsetDays,
dueDate} + timeline + notification send dates. dueDate = ratification +
offset, rolled forward off weekends + US federal holidays; COE and
contingency removals never land on a weekend/holiday. Trust/Probate
sellerType appends estate-account, Letters Testamentary/trust certificate,
and supplemental-tax tasks. Must have unit tests (incl. COE never on
weekend/holiday).

## Workflow

Use plan mode for anything spanning >1 file; show the plan, wait for approval.
Write tests with each feature; `pnpm typecheck`, `pnpm lint` and `pnpm test`
must pass before "done" (CI runs all three on every PR).
Small, reviewable diffs on a branch, merged by PR. Match UI to /prototypes/<app>
and docs/mockups/ when present. Update docs/STATUS.md at the end of each segment.
