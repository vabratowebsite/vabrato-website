# MLS sync on Render (documented, not deployed)

Sync runs can last minutes, so they run as Render cron jobs, never inside Vercel request limits (SPEC `<infrastructure>`). Nothing here is deployed yet: create the jobs once MLSListings credentials arrive. [render.example.yaml](render.example.yaml) has the same setup as a Blueprint. It isn't named `render.yaml` on purpose, so nothing deploys from the repo by accident.

## Jobs

| Job | Schedule (UTC) | Command |
|---|---|---|
| `mls-incremental` | `*/15 * * * *` | `pnpm --filter @vabrato/mls sync incremental` |
| `mls-reconcile` | `17 10 * * *` (02:17 / 03:17 Pacific) | `pnpm --filter @vabrato/mls sync reconcile` |

There is no purge job. Run `pnpm --filter @vabrato/mls sync purge --confirm` by hand, from a Render shell, only if the MLSListings license ends (MLS-9: delete all MLS data within 30 days).

- Runtime: Node 22. Build command: `corepack enable && pnpm install --frozen-lockfile`. Root directory: repo root.
- Region: Oregon, close to Supabase us-west-1.
- Only one run at a time: if a reconcile is still running when an incremental starts, the incremental logs nothing and exits 0 (`skipped`).
- Exit code 1 means the run failed. The run row in `mls_sync_runs` has a sanitized error. Turn on Render's failure notifications for both jobs.

## Environment (Render dashboard only, never in git)

| Variable | Value |
|---|---|
| `MLS_MODE` | `live` (or `mock` for a dry deploy against the fictional fixtures) |
| `MLS_OFFICE_ID` | `VABRA` or `VABRA-1`: confirm which one the feed uses in `OfficeMlsId` / `ListOfficeMlsId` |
| `MLS_API_BASE_URL` | RESO service root from MLSListings |
| `MLS_TOKEN_URL` | OAuth2 token endpoint from MLSListings |
| `MLS_CLIENT_ID`, `MLS_CLIENT_SECRET` | from MLSListings |
| `MLS_RATE_LIMIT_PER_SEC` | default 2; lower it to MLSListings' published limit |
| `MLS_PHOTO_MODE` | `hotlink` until MLSListings allows copying photos, then `copy` |
| `MLS_SOLD_HISTORY_YEARS` | `3` or `5`, per MLSListings |
| `DATABASE_URL` | Supabase Postgres connection string (Session pooler, port 5432), using a dedicated role (see below) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | only for `MLS_PHOTO_MODE=copy` |
| `MLS_REVALIDATE_URL`, `MLS_REVALIDATE_SECRET` | optional: the website's `/api/revalidate` URL and its `REVALIDATE_SECRET`, so changed or removed listings leave the page cache right after each run |
| `NODE_VERSION` | `22` |

### Database role

Don't use the `postgres` role. Create a dedicated login role in the Supabase SQL editor (only MLS tables, no member data); its password lives only in Render:

```sql
create role mls_sync login password '<generate in a password manager>' bypassrls;
grant usage on schema public to mls_sync;
grant select, insert, update, delete on
  mls_listings, mls_listing_vow, mls_listing_full, mls_price_events, mls_media,
  mls_open_houses, mls_offices, mls_members, mls_agent_access, mls_sync_runs to mls_sync;
grant usage on all sequences in schema public to mls_sync;
```

## Health and alerts

- `select * from mls_sync_health()` (staff only) returns the last success, the last failure, the last status, and `stale` (no successful run in 30 minutes). The S6 console shows this and alerts staff (SPEC `<mls_data>` freshness target).
- `mls_sync_runs.counts` holds per-run counts: fetched, upserted, removed, `ineligible.<reason>`, media, photos copied/removed, open houses, members, retries, invalid records, and ACC-1 checks/locks.

## Before going live

0. Remove the fictional preview rows: `pnpm --filter @vabrato/mls sync purge --mock --confirm` (in mock mode against the same database). A live sync refuses to run while they exist.
1. Credentials from MLSListings, entered in Render only.
2. Confirm the `OfficeMlsId` value, the Media/OpenHouse resource names, photo-copy permission and sold-history depth, and update the env vars.
3. Check `src/levels/fields.ts` against MLSListings' IDX/VOW field rules.
4. Run `reconcile` once by hand, check the counts, then enable both cron jobs.
5. SPEC S3 is done when the live feed has synced for 7 days with no failed runs.
