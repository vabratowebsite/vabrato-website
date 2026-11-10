import type { ListingRows, MediaRow, MemberRow, OfficeRow, OpenHouseRow } from "./rows";
import type { Sql } from "./sql";

// Postgres-backed store for the sync job. Runs with a privileged connection
// (Render: DATABASE_URL; tests: PGlite superuser), never with a user session.
// Batches go through jsonb_to_recordset: one statement per table per batch.

export type RunKind = "incremental" | "reconcile" | "purge";
export type RunStatus = "running" | "succeeded" | "failed";
export type Counts = Record<string, number>;

export interface AgentAccessRow {
  profile_id: string;
  member_key: string;
  active: boolean;
  verified_at: string | null;
}

const LISTING_COLUMNS = `
  listing_key text, source text, listing_id text, standard_status text, property_type text, property_sub_type text,
  list_price numeric, city text, county text, postal_code text, bedrooms_total integer,
  bathrooms_total integer, living_area numeric, latitude double precision, longitude double precision,
  list_office_mls_id text, list_office_name text, list_agent_full_name text, is_own_listing boolean,
  address_display boolean, avm_display boolean, comments_display boolean, modification_ts timestamptz, data jsonb`;

const LISTING_FIELDS = LISTING_COLUMNS.split(",").map((c) => c.trim().split(/\s+/)[0]!);

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string).toISOString());

export class PgSyncStore {
  constructor(private readonly sql: Sql) {}

  // --- run log ---------------------------------------------------------------

  /** Marks runs stuck in `running` (crashed job) as failed. */
  async failAbandonedRuns(olderThanMinutes = 60): Promise<number> {
    const rows = await this.sql.query(
      `update mls_sync_runs set status = 'failed', finished_at = now(), error = 'abandoned: run did not finish'
       where status = 'running' and started_at < now() - make_interval(mins => $1) returning id`,
      [olderThanMinutes],
    );
    return rows.length;
  }

  /** Starts a run, or returns null if another run is in progress (unique index on running runs). */
  async startRun(kind: RunKind): Promise<string | null> {
    const [row] = await this.sql.query<{ id: string }>(
      `insert into mls_sync_runs (kind) values ($1) on conflict (status) where status = 'running' do nothing returning id`,
      [kind],
    );
    return row?.id ?? null;
  }

  async finishRun(id: string, r: { status: RunStatus; counts: Counts; highWaterMark: string | null; error?: string | null }) {
    await this.sql.query(
      `update mls_sync_runs set status = $2, finished_at = now(), counts = $3::jsonb, high_water_mark = $4, error = $5 where id = $1`,
      [id, r.status, JSON.stringify(r.counts), r.highWaterMark, r.error ?? null],
    );
  }

  /** Highest ModificationTimestamp applied by a successful run since the last purge. */
  async lastHighWaterMark(): Promise<string | null> {
    const [row] = await this.sql.query<{ hwm: unknown }>(
      `select max(high_water_mark) as hwm from mls_sync_runs
       where status = 'succeeded' and kind in ('incremental', 'reconcile')
         and started_at > coalesce(
           (select max(started_at) from mls_sync_runs where kind = 'purge' and status = 'succeeded'), '-infinity')`,
    );
    return iso(row?.hwm);
  }

  // --- listings ----------------------------------------------------------------

  /** Upserts IDX/VOW/FULL rows and records price/status changes (VOW price history). */
  async upsertListings(rows: ListingRows[]): Promise<{ priceEvents: number }> {
    if (rows.length === 0) return { priceEvents: 0 };
    const idx = JSON.stringify(rows.map((r) => r.idx));
    return this.sql.transaction(async (tx) => {
      const changed = await tx.query<{ listing_key: string }>(
        `select x.listing_key
         from jsonb_to_recordset($1::jsonb) as x(listing_key text, list_price numeric, standard_status text)
         left join mls_listings l on l.listing_key = x.listing_key
         where l.listing_key is null
            or l.list_price is distinct from x.list_price
            or l.standard_status is distinct from x.standard_status`,
        [idx],
      );
      await tx.query(
        `insert into mls_listings (${LISTING_FIELDS.join(", ")}, synced_at)
         select ${LISTING_FIELDS.map((f) => `x.${f}`).join(", ")}, now()
         from jsonb_to_recordset($1::jsonb) as x(${LISTING_COLUMNS})
         on conflict (listing_key) do update set
           ${LISTING_FIELDS.filter((f) => f !== "listing_key")
             .map((f) => `${f} = excluded.${f}`)
             .join(", ")},
           synced_at = now()`,
        [idx],
      );
      for (const table of ["mls_listing_vow", "mls_listing_full"] as const) {
        const level = table === "mls_listing_vow" ? "vow" : "full";
        await tx.query(
          `insert into ${table} (listing_key, data, synced_at)
           select x.listing_key, x.data, now() from jsonb_to_recordset($1::jsonb) as x(listing_key text, data jsonb)
           on conflict (listing_key) do update set data = excluded.data, synced_at = now()`,
          [JSON.stringify(rows.map((r) => ({ listing_key: r.idx.listing_key, data: r[level] })))],
        );
      }
      const keys = new Set(changed.map((c) => c.listing_key));
      if (keys.size) {
        await tx.query(
          `insert into mls_price_events (listing_key, list_price, standard_status, observed_at)
           select x.listing_key, x.list_price, x.standard_status, x.modification_ts
           from jsonb_to_recordset($1::jsonb) as x(listing_key text, list_price numeric, standard_status text, modification_ts timestamptz)`,
          [JSON.stringify(rows.filter((r) => keys.has(r.idx.listing_key)).map((r) => r.idx))],
        );
      }
      return { priceEvents: keys.size };
    });
  }

  /** Deletes listings (cascades to VOW/FULL/media/open houses/history). Returns storage paths to delete. */
  async removeListings(keys: string[]): Promise<{ removed: string[]; storagePaths: string[] }> {
    if (keys.length === 0) return { removed: [], storagePaths: [] };
    return this.sql.transaction(async (tx) => {
      const paths = await tx.query<{ storage_path: string }>(
        `select storage_path from mls_media where listing_key = any($1::text[]) and storage_path is not null`,
        [keys],
      );
      const removed = await tx.query<{ listing_key: string }>(
        `delete from mls_listings where listing_key = any($1::text[]) returning listing_key`,
        [keys],
      );
      return { removed: removed.map((r) => r.listing_key), storagePaths: paths.map((p) => p.storage_path) };
    });
  }

  /** listing_key -> ModificationTimestamp (ISO) for everything stored. */
  async listingVersions(): Promise<Map<string, string>> {
    const rows = await this.sql.query<{ listing_key: string; modification_ts: unknown }>(
      `select listing_key, modification_ts from mls_listings`,
    );
    return new Map(rows.map((r) => [r.listing_key, iso(r.modification_ts)!]));
  }

  async existingListingKeys(keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const rows = await this.sql.query<{ listing_key: string }>(
      `select listing_key from mls_listings where listing_key = any($1::text[])`,
      [keys],
    );
    return rows.map((r) => r.listing_key);
  }

  // --- media & open houses -----------------------------------------------------

  async mediaFor(keys: string[]): Promise<MediaRow[]> {
    if (keys.length === 0) return [];
    const rows = await this.sql.query<MediaRow>(
      `select media_key, listing_key, sort_order, category, url, storage_path, short_description, width, height, modification_ts
       from mls_media where listing_key = any($1::text[])`,
      [keys],
    );
    return rows.map((r) => ({ ...r, modification_ts: iso(r.modification_ts) }));
  }

  /** Replaces the media of `keys` with `rows` (rows for listings we don't store are ignored). */
  async replaceMedia(keys: string[], rows: MediaRow[]): Promise<void> {
    if (keys.length === 0) return;
    await this.sql.transaction(async (tx) => {
      await tx.query(`delete from mls_media where listing_key = any($1::text[])`, [keys]);
      if (rows.length === 0) return;
      await tx.query(
        `insert into mls_media (media_key, listing_key, sort_order, category, url, storage_path, short_description, width, height, modification_ts)
         select x.media_key, x.listing_key, x.sort_order, x.category, x.url, x.storage_path, x.short_description, x.width, x.height, x.modification_ts
         from jsonb_to_recordset($1::jsonb) as x(media_key text, listing_key text, sort_order integer, category text, url text,
           storage_path text, short_description text, width integer, height integer, modification_ts timestamptz)
         join mls_listings l on l.listing_key = x.listing_key
         on conflict (media_key) do update set listing_key = excluded.listing_key, sort_order = excluded.sort_order,
           category = excluded.category, url = excluded.url, storage_path = excluded.storage_path,
           short_description = excluded.short_description, width = excluded.width, height = excluded.height,
           modification_ts = excluded.modification_ts`,
        [JSON.stringify(rows)],
      );
    });
  }

  async replaceOpenHouses(keys: string[], rows: OpenHouseRow[]): Promise<void> {
    if (keys.length === 0) return;
    await this.sql.transaction(async (tx) => {
      await tx.query(`delete from mls_open_houses where listing_key = any($1::text[])`, [keys]);
      if (rows.length === 0) return;
      await tx.query(
        `insert into mls_open_houses (open_house_key, listing_key, open_house_date, start_time, end_time, remarks, open_house_type, modification_ts)
         select x.open_house_key, x.listing_key, x.open_house_date, x.start_time, x.end_time, x.remarks, x.open_house_type, x.modification_ts
         from jsonb_to_recordset($1::jsonb) as x(open_house_key text, listing_key text, open_house_date date, start_time timestamptz,
           end_time timestamptz, remarks text, open_house_type text, modification_ts timestamptz)
         join mls_listings l on l.listing_key = x.listing_key
         on conflict (open_house_key) do update set listing_key = excluded.listing_key, open_house_date = excluded.open_house_date,
           start_time = excluded.start_time, end_time = excluded.end_time, remarks = excluded.remarks,
           open_house_type = excluded.open_house_type, modification_ts = excluded.modification_ts`,
        [JSON.stringify(rows)],
      );
    });
  }

  // --- roster, offices, ACC-1 --------------------------------------------------------

  /** Replaces the office roster: members missing from `rows` are deleted (moved office or left). */
  async replaceMembers(rows: MemberRow[]): Promise<{ removed: number }> {
    return this.sql.transaction(async (tx) => {
      const removed = await tx.query(`delete from mls_members where not (member_key = any($1::text[])) returning member_key`, [
        rows.map((r) => r.member_key),
      ]);
      if (rows.length) {
        await tx.query(
          `insert into mls_members (member_key, source, member_mls_id, full_name, email, member_status, office_mls_id, data, modification_ts)
           select x.member_key, x.source, x.member_mls_id, x.full_name, x.email, x.member_status, x.office_mls_id, x.data, x.modification_ts
           from jsonb_to_recordset($1::jsonb) as x(member_key text, source text, member_mls_id text, full_name text, email text,
             member_status text, office_mls_id text, data jsonb, modification_ts timestamptz)
           on conflict (member_key) do update set source = excluded.source, member_mls_id = excluded.member_mls_id, full_name = excluded.full_name,
             email = excluded.email, member_status = excluded.member_status, office_mls_id = excluded.office_mls_id,
             data = excluded.data, modification_ts = excluded.modification_ts`,
          [JSON.stringify(rows)],
        );
      }
      return { removed: removed.length };
    });
  }

  async upsertOffices(rows: OfficeRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.sql.query(
      `insert into mls_offices (office_key, source, office_mls_id, name, phone, data, modification_ts)
       select x.office_key, x.source, x.office_mls_id, x.name, x.phone, x.data, x.modification_ts
       from jsonb_to_recordset($1::jsonb) as x(office_key text, source text, office_mls_id text, name text, phone text, data jsonb, modification_ts timestamptz)
       on conflict (office_key) do update set source = excluded.source, office_mls_id = excluded.office_mls_id, name = excluded.name,
         phone = excluded.phone, data = excluded.data, modification_ts = excluded.modification_ts`,
      [JSON.stringify(rows)],
    );
  }

  async findActiveMember(email: string, officeId: string): Promise<{ member_key: string } | null> {
    const [row] = await this.sql.query<{ member_key: string }>(
      `select member_key from mls_members
       where lower(email) = lower($1) and member_status = 'Active' and office_mls_id = $2
       order by member_key limit 1`,
      [email, officeId],
    );
    return row ?? null;
  }

  async membersByKey(keys: string[]): Promise<Map<string, { member_status: string | null; office_mls_id: string | null }>> {
    if (keys.length === 0) return new Map();
    const rows = await this.sql.query<{ member_key: string; member_status: string | null; office_mls_id: string | null }>(
      `select member_key, member_status, office_mls_id from mls_members where member_key = any($1::text[])`,
      [keys],
    );
    return new Map(rows.map((r) => [r.member_key, r]));
  }

  async listAgentAccess(): Promise<AgentAccessRow[]> {
    const rows = await this.sql.query<AgentAccessRow>(`select profile_id, member_key, active, verified_at from mls_agent_access`);
    return rows.map((r) => ({ ...r, verified_at: iso(r.verified_at) }));
  }

  /** verifiedAt null keeps the previous verification time. */
  async setAgentAccess(profileId: string, memberKey: string, active: boolean, verifiedAt: Date | null): Promise<void> {
    await this.sql.query(
      `insert into mls_agent_access (profile_id, member_key, active, verified_at) values ($1, $2, $3, $4)
       on conflict (profile_id) do update set member_key = excluded.member_key, active = excluded.active,
         verified_at = coalesce(excluded.verified_at, mls_agent_access.verified_at)`,
      [profileId, memberKey, active, verifiedAt ? verifiedAt.toISOString() : null],
    );
  }

  // --- MLS-9 -----------------------------------------------------------------------

  /** True if any fictional preview rows ('mock') are stored. */
  async hasMockData(): Promise<boolean> {
    const rows = await this.sql.query(
      `select 1 from mls_listings where source = 'mock'
       union all select 1 from mls_members where source = 'mock'
       union all select 1 from mls_offices where source = 'mock' limit 1`,
    );
    return rows.length > 0;
  }

  /** Deletes only the fictional preview rows (source = 'mock'), e.g. before the live feed starts. */
  async purgeMock(): Promise<{ storagePaths: string[]; listings: number; members: number }> {
    return this.sql.transaction(async (tx) => {
      const paths = await tx.query<{ storage_path: string }>(
        `select m.storage_path from mls_media m join mls_listings l using (listing_key)
         where l.source = 'mock' and m.storage_path is not null`,
      );
      await tx.query(
        `update mls_agent_access set active = false where member_key in (select member_key from mls_members where source = 'mock')`,
      );
      const listings = await tx.query(`delete from mls_listings where source = 'mock' returning listing_key`);
      const members = await tx.query(`delete from mls_members where source = 'mock' returning member_key`);
      await tx.query(`delete from mls_offices where source = 'mock'`);
      // Alert emails quoting the fictional listings go too (deliveries cascade).
      await tx.query(`select public.purge_member_alert_data(true)`);
      return { storagePaths: paths.map((p) => p.storage_path), listings: listings.length, members: members.length };
    });
  }

  /** Deletes every stored MLS record (license termination). Sync runs are kept as the audit trail. */
  async purgeAll(): Promise<{ storagePaths: string[]; listings: number; members: number }> {
    return this.sql.transaction(async (tx) => {
      const paths = await tx.query<{ storage_path: string }>(`select storage_path from mls_media where storage_path is not null`);
      const listings = await tx.query(`delete from mls_listings returning listing_key`);
      const members = await tx.query(`delete from mls_members returning member_key`);
      await tx.query(`delete from mls_offices`);
      await tx.query(`update mls_agent_access set active = false`);
      // Member copies of MLS data: alert feed and alert emails (review item 5, MLS-9).
      await tx.query(`select public.purge_member_alert_data(true)`);
      return { storagePaths: paths.map((p) => p.storage_path), listings: listings.length, members: members.length };
    });
  }
}
