\# Vabrato Apps — Project Guide

Product spec: docs/SPEC.md. Read it before planning any task.



\## Structure

Monorepo, three apps, one backend:

\- apps/va      — VA transaction dashboard (internal)

\- apps/seller  — seller portal (client-facing)

\- apps/buyer   — buyer property tracker

\- packages/db  — Supabase schema, generated types, shared queries

\- packages/ui  — shared components

\- packages/lib — auth helpers, schedule engine, integrations



\## Stack (don't substitute without asking)

Next.js (App Router, TS) + Tailwind on Vercel · Supabase (Postgres, Auth:

magic-link + Google OAuth, Storage, RLS) · Zod · TanStack Query · Vitest.

Email: Resend (transactional + scheduled sends). Inbound email:

Postmark/SendGrid Inbound Parse. Integrations: Google Calendar + Drive,

Dropbox (va app only).



\## Hard rules

\- NO runtime AI in apps/seller and apps/buyer. Buyer email parsing is

&#x20; deterministic per-source; notification bodies are static templates.

&#x20; apps/va may use AI OCR for receipts, behind a flag.

\- Never store bank/wiring details as text. Money screens show a "call escrow

&#x20; to verify wiring" banner.

\- RLS mandatory: a seller reads only their own deal; a buyer reads only

&#x20; properties they track; agents read only their own deals.

\- Secrets only in .env.local / Vercel env. Never commit or print them.

\- All seed/test data is fictional (no real client PII).



\## Schedule engine (packages/lib/schedule.ts) — the core

Input: ratificationDate, daysToClose, contingency offsets, sellerType,

rentBackDays. Output: ordered tasks {title, owner, phase, offsetDays,

dueDate} + timeline + notification send dates. dueDate = ratification +

offset, rolled forward off weekends + US federal holidays; COE and

contingency removals never land on a weekend/holiday. Trust/Probate

sellerType appends estate-account, Letters Testamentary/trust certificate,

and supplemental-tax tasks. Must have unit tests (incl. COE never on

weekend/holiday).



\## Workflow

Use plan mode for anything spanning >1 file; show the plan, wait for approval.

Write tests with each feature; run `pnpm test` and make it pass before "done."

Small, reviewable diffs. Match UI to /prototypes/<app> when present.

