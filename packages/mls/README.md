# @vabrato/mls

MLSListings data for Vabrato, through the RESO Web API. See `docs/SPEC.md` (`<mls_data>`, MLS-1 to MLS-10, ACC-1/ACC-2).

The repo is public: never commit MLS credentials or real MLS data (listings, exports, photos). Everything in `src/fixtures` is fictional.

## Entry points

| Import | For | Contents |
|---|---|---|
| `@vabrato/mls` | any app | config, RESO client, OData builder, resource schemas, field allowlists, IDX/VOW projections, eligibility rules |
| `@vabrato/mls/full` | **apps/va only** | FULL projections (MLS-7). ESLint blocks this import everywhere else, and `src/guard.test.ts` scans the other apps. |
| `@vabrato/mls/sync` | Render job | sync engine, Postgres store, photo handling, ACC-1 verification |
| `@vabrato/mls/mock` | tests, local dev | mock RESO server, mock feed, fixtures |

## Layout

```
src/
  config.ts         MLS_* env (mock|live), errors name variables, never values
  client/           RESO client: OAuth2 client credentials, rate limit, retries + backoff
                    (429/5xx/network, Retry-After), @odata.nextLink paging with $skip fallback
  resources.ts      Zod schemas: Property, Media, OpenHouse, Member, Office (RESO DD names)
  levels/           field allowlists per data level (IDX / VOW / FULL) and projections (MLS-4)
  eligibility.ts    what we may keep: status, opt-out/IDX flags (MLS-3), service area,
                    MLSListings only (MLS-8), sold-history window
  mock/             mock RESO API: one handler, in-process fetch + node:http server
  fixtures/         fictional records covering active, pending, sold, off-market, opt-out,
                    display flags, other offices, out of area, other MLS
  sync/             incremental + reconcile + purge, run log, photos, ACC-1
  jobs/cli.ts       Render entry: mls-sync incremental | reconcile | purge --confirm
```

## Data levels

Each level is its own table (migration `0012_mls.sql`), with a `data_level` check constraint. `data` holds only allowlisted fields:

| Table | Level | Read by (RLS) |
|---|---|---|
| `mls_listings`, `mls_media`, `mls_open_houses`, `mls_offices` | IDX | everyone, for-sale listings only. Closed listings need VOW, or our own once `public_sold` is on (MLS-10) |
| `mls_listing_vow`, `mls_price_events` | VOW | members with `profiles.vow_accepted_at` (MLS-6) or verified agents |
| `mls_listing_full`, `mls_members` | FULL | `has_full_mls_access()`: active `mls_agent_access` row verified within 36 h, member Active, staff role (ACC-1) |
| `mls_sync_runs` | internal | staff (`mls_sync_health()` for the console) |

The allowlists in `src/levels/fields.ts` are **provisional** until MLSListings confirms its IDX/VOW field rules.

## Sync

- **Incremental** (every 15 min): `ModificationTimestamp gt <high-water mark − 5 min>`. Eligible records are upserted at each level; ineligible ones are deleted with their media, open houses, history and copied photos (MLS-5). Media/OpenHouse changes refresh their listing. A failed run never moves the high-water mark.
- **Reconcile** (nightly): scans every displayable listing in the feed, deletes what's no longer there or eligible, re-fetches drifted records, refreshes photos and open houses, replaces the office roster (Member filtered by `MLS_OFFICE_ID`), and re-checks FULL access (ACC-1).
- **Purge** (MLS-9): `mls-sync purge --confirm` deletes all MLS data and photos; sync runs are kept as the audit log.
- **Mock marker:** mock-mode runs write `source = 'mock'`. `mls-sync purge --mock --confirm` deletes only those rows, and a live sync refuses to run while any are stored (MLS-8).
- **Preview seed:** `tsx src/jobs/seed-preview.ts [--publish-placeholders] > seed.sql` prints SQL that loads the fictional fixtures, with dates rebased to today, for a preview database.
- Only one run at a time (unique index on running runs). Runs stuck in `running` for over an hour are marked failed.

## Photos (`MLS_PHOTO_MODE`)

Whether photos may be copied to our storage is an open question with MLSListings, so both paths exist:

- `hotlink` (default): store the feed's `MediaURL`.
- `copy`: download into the public `mls-photos` bucket (`listing/{ListingKey}/{MediaKey}.{ext}`). A photo is re-downloaded only when its Media `ModificationTimestamp` changes, and deleted when the photo or listing goes away. Needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

Only public `Photo` media are kept (private/office-only and documents are dropped). Only public, not-canceled, upcoming open houses are kept (broker tours stay out of IDX).

## Running locally

```bash
pnpm --filter @vabrato/mls mock                          # mock API on http://127.0.0.1:4010/reso/odata
MLS_MODE=mock pnpm --filter @vabrato/mls sync incremental --pglite   # dry run, in-memory DB with every migration
```

The mock token endpoint is `POST /oauth/token` with `client_id=mock-client` and the fixed mock secret in `src/mock/handler.ts` (not a real credential).

Render setup: [RENDER.md](RENDER.md).
