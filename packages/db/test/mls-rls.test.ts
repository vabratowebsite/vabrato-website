import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// RLS for the MLS tables (0011-0013): data levels IDX / VOW / FULL, MLS-6,
// MLS-7, MLS-10, ACC-1/ACC-2, SEC-1/SEC-2. All data is fictional.

const U = {
  buyer: "10000000-0000-4000-8000-000000000001",
  vow: "10000000-0000-4000-8000-000000000002",
  vow2: "10000000-0000-4000-8000-000000000003",
  agent: "20000000-0000-4000-8000-000000000001",
  agent2: "20000000-0000-4000-8000-000000000002",
  unverified: "20000000-0000-4000-8000-000000000003",
  stale: "20000000-0000-4000-8000-000000000004",
  inactive: "20000000-0000-4000-8000-000000000005",
  admin: "30000000-0000-4000-8000-000000000001",
  forgedBuyer: "10000000-0000-4000-8000-000000000009",
} as const;

const MLS_TABLES = [
  "mls_listings",
  "mls_media",
  "mls_open_houses",
  "mls_offices",
  "mls_listing_vow",
  "mls_price_events",
  "mls_listing_full",
  "mls_members",
  "mls_agent_access",
  "mls_sync_runs",
] as const;

const keys = async (q: Query, table: string, col: string) =>
  (await q<Record<string, string>>(`select ${col} as k from ${table} order by 1`)).map((r) => r.k);

describe("MLS RLS", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.buyer);
    await createUser(t, U.vow);
    await createUser(t, U.vow2);
    await createUser(t, U.forgedBuyer);
    for (const id of [U.agent, U.agent2, U.unverified, U.stale, U.inactive]) await createUser(t, id, { role: "agent" });
    await createUser(t, U.admin, { role: "admin" });
    await t.query(`update profiles set vow_accepted_at = now() where id in ($1, $2)`, [U.vow, U.vow2]);

    await t.exec(`
      insert into mls_listings (listing_key, standard_status, list_price, city, county, list_office_mls_id, is_own_listing, modification_ts, data) values
        ('L-ACTIVE', 'Active', 1500000, 'San Carlos', 'San Mateo', 'EXRG', false, now(), '{"PublicRemarks":"Fictional"}'),
        ('L-PENDING', 'Pending', 1800000, 'Belmont', 'San Mateo', 'VABRA', true, now(), '{}'),
        ('L-OWN-SOLD', 'Closed', 2000000, 'San Carlos', 'San Mateo', 'VABRA', true, now(), '{}'),
        ('L-OTHER-SOLD', 'Closed', 2100000, 'Sunnyvale', 'Santa Clara', 'EXRG', false, now(), '{}');
      insert into mls_listing_vow (listing_key, data) values
        ('L-ACTIVE', '{"OriginalListPrice":1550000}'),
        ('L-OWN-SOLD', '{"ClosePrice":2050000}'),
        ('L-OTHER-SOLD', '{"ClosePrice":2150000}');
      insert into mls_listing_full (listing_key, data) values
        ('L-ACTIVE', '{"PrivateRemarks":"Fictional"}'),
        ('L-OWN-SOLD', '{"ShowingInstructions":"Fictional"}');
      insert into mls_price_events (listing_key, list_price, standard_status, observed_at) values
        ('L-ACTIVE', 1550000, 'Active', now() - interval '10 days'),
        ('L-ACTIVE', 1500000, 'Active', now());
      insert into mls_media (media_key, listing_key, sort_order, url) values
        ('M-ACTIVE-1', 'L-ACTIVE', 1, 'https://mock.mls.invalid/media/M-ACTIVE-1.svg'),
        ('M-OWN-SOLD-1', 'L-OWN-SOLD', 1, 'https://mock.mls.invalid/media/M-OWN-SOLD-1.svg');
      insert into mls_open_houses (open_house_key, listing_key, start_time) values
        ('OH-ACTIVE', 'L-ACTIVE', now() + interval '2 days'),
        ('OH-OTHER-SOLD', 'L-OTHER-SOLD', now() - interval '90 days');
      insert into mls_offices (office_key, office_mls_id, name) values ('O-VABRA', 'VABRA', 'Vabrato Real Estate Services');
      insert into mls_members (member_key, full_name, email, member_status, office_mls_id) values
        ('MB-1', 'Avery Example', 'avery@example.test', 'Active', 'VABRA'),
        ('MB-2', 'Jordan Sample', 'jordan@example.test', 'Active', 'VABRA'),
        ('MB-3', 'Riley Placeholder', 'riley@example.test', 'Active', 'VABRA'),
        ('MB-4', 'Casey Demo', 'casey@example.test', 'Inactive', 'VABRA');
      insert into mls_agent_access (profile_id, member_key, active, verified_at) values
        ('${U.agent}', 'MB-1', true, now()),
        ('${U.agent2}', 'MB-2', true, now() - interval '1 hour'),
        ('${U.stale}', 'MB-3', true, now() - interval '3 days'),
        ('${U.inactive}', 'MB-4', true, now()),
        ('${U.forgedBuyer}', 'MB-1', true, now());
      insert into mls_sync_runs (kind, status, finished_at, counts) values
        ('incremental', 'succeeded', now() - interval '2 hours', '{"upserted":4}');
    `);
  });

  afterAll(() => t.close());

  it("has RLS enabled on every MLS table (SEC-1)", async () => {
    const rows = await t.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = any($1)`,
      [[...MLS_TABLES, "feature_flags"]],
    );
    expect(rows).toHaveLength(MLS_TABLES.length + 1);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  describe("signed out (IDX)", () => {
    it("sees for-sale listings but no sold ones (MLS-6, MLS-10)", async () => {
      const seen = await t.as("anon", null, (q) => keys(q, "mls_listings", "listing_key"));
      expect(seen).toEqual(["L-ACTIVE", "L-PENDING"]);
    });

    it("sees media and open houses only for visible listings", async () => {
      expect(await t.as("anon", null, (q) => keys(q, "mls_media", "media_key"))).toEqual(["M-ACTIVE-1"]);
      expect(await t.as("anon", null, (q) => keys(q, "mls_open_houses", "open_house_key"))).toEqual(["OH-ACTIVE"]);
    });

    it("reads offices and feature flags", async () => {
      expect(await t.as("anon", null, (q) => keys(q, "mls_offices", "office_key"))).toEqual(["O-VABRA"]);
      expect(await t.as("anon", null, (q) => keys(q, "feature_flags", "key"))).toEqual(["cma_enabled", "full_data_enabled", "market_stats_enabled", "public_sold", "public_stats", "site_scl_enabled", "vow_enabled"]);
    });

    it.each(["mls_listing_vow", "mls_price_events", "mls_listing_full", "mls_members", "mls_agent_access", "mls_sync_runs"])(
      "is denied %s outright",
      async (table) => {
        await expect(t.as("anon", null, (q) => q(`select * from ${table}`))).rejects.toThrow(/permission denied/);
      },
    );

    it("cannot call the access helpers or the health function", async () => {
      for (const fn of ["has_vow_access()", "has_full_mls_access()", "mls_sync_health()"]) {
        await expect(t.as("anon", null, (q) => q(`select ${fn}`))).rejects.toThrow(/permission denied/);
      }
    });

    it("sees our own sold listings only once public_sold is on (MLS-10), still without VOW fields", async () => {
      const seen = await t.as("anon", null, async (q) => {
        await q(`set local role postgres`);
        await q(`update feature_flags set enabled = true where key = 'public_sold'`);
        await q(`set local role anon`);
        return keys(q, "mls_listings", "listing_key");
      });
      expect(seen).toEqual(["L-ACTIVE", "L-OWN-SOLD", "L-PENDING"]);
      // as() rolled the flag back.
      expect(await t.query(`select enabled from feature_flags where key = 'public_sold'`)).toEqual([{ enabled: false }]);
    });
  });

  describe("signed-in member without VOW Terms", () => {
    it("gets IDX only", async () => {
      await t.as("authenticated", U.buyer, async (q) => {
        expect(await keys(q, "mls_listings", "listing_key")).toEqual(["L-ACTIVE", "L-PENDING"]);
        expect(await keys(q, "mls_listing_vow", "listing_key")).toEqual([]);
        expect(await q(`select * from mls_price_events`)).toEqual([]);
        expect(await keys(q, "mls_listing_full", "listing_key")).toEqual([]);
        expect(await keys(q, "mls_members", "member_key")).toEqual([]);
        expect(await q(`select * from mls_sync_runs`)).toEqual([]);
      });
    });

    it("cannot accept the VOW Terms by writing the column itself", async () => {
      await expect(
        t.as("authenticated", U.buyer, (q) => q(`update profiles set vow_accepted_at = now() where id = $1`, [U.buyer])),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("VOW member (MLS-6)", () => {
    it("sees no VOW data while vow_enabled is off, even after accepting the terms (review item 1)", async () => {
      await t.as("authenticated", U.vow, async (q) => {
        expect(await keys(q, "mls_listings", "listing_key")).toEqual(["L-ACTIVE", "L-PENDING"]);
        expect(await keys(q, "mls_listing_vow", "listing_key")).toEqual([]);
        expect(await q(`select list_price from mls_price_events`)).toEqual([]);
        expect(await q(`select public.has_vow_access() as v`)).toEqual([{ v: false }]);
      });
    });

    it("reads sold listings, sold detail and price history once vow_enabled is on, but no FULL data", async () => {
      await t.as("authenticated", U.vow, async (q) => {
        await q(`set local role postgres`);
        await q(`update feature_flags set enabled = true where key = 'vow_enabled'`);
        await q(`set local role authenticated`);
        expect(await keys(q, "mls_listings", "listing_key")).toEqual(["L-ACTIVE", "L-OTHER-SOLD", "L-OWN-SOLD", "L-PENDING"]);
        expect(await keys(q, "mls_listing_vow", "listing_key")).toEqual(["L-ACTIVE", "L-OTHER-SOLD", "L-OWN-SOLD"]);
        expect(await q(`select list_price from mls_price_events order by observed_at`)).toHaveLength(2);
        expect(await keys(q, "mls_media", "media_key")).toEqual(["M-ACTIVE-1", "M-OWN-SOLD-1"]);
        expect(await keys(q, "mls_listing_full", "listing_key")).toEqual([]);
        expect(await keys(q, "mls_members", "member_key")).toEqual([]);
        expect(await q(`select public.has_vow_access() as v, public.has_full_mls_access() as f`)).toEqual([{ v: true, f: false }]);
      });
    });
  });

  describe("FULL data (MLS-7, ACC-1, ACC-2)", () => {
    // 0023: FULL also needs full_data_enabled (off until MLSListings confirms).
    const withFull = <T>(fn: () => Promise<T>) =>
      (async () => {
        await t.query(`update feature_flags set enabled = true where key = 'full_data_enabled'`);
        try {
          return await fn();
        } finally {
          await t.query(`update feature_flags set enabled = false where key = 'full_data_enabled'`);
        }
      })();

    it("stays locked for everyone, verified agents included, while full_data_enabled is off", async () => {
      await t.as("authenticated", U.agent, async (q) => {
        expect(await keys(q, "mls_listing_full", "listing_key")).toEqual([]);
        expect(await keys(q, "mls_members", "member_key")).toEqual([]);
        expect(await q(`select public.has_full_mls_access() as f`)).toEqual([{ f: false }]);
      });
    });

    it("is readable by a verified active agent of our office once the flag is on", async () => {
      await withFull(() => t.as("authenticated", U.agent, async (q) => {
        expect(await keys(q, "mls_listing_full", "listing_key")).toEqual(["L-ACTIVE", "L-OWN-SOLD"]);
        expect(await keys(q, "mls_members", "member_key")).toEqual(["MB-1", "MB-2", "MB-3", "MB-4"]);
        expect(await keys(q, "mls_listing_vow", "listing_key")).toHaveLength(3);
      }));
    });

    it.each([
      ["unverified agent", U.unverified],
      ["agent whose last verification is older than 36h", U.stale],
      ["agent whose MLS membership is inactive", U.inactive],
      ["non-staff profile with a forged access row", U.forgedBuyer],
      ["admin who is not a verified agent", U.admin],
    ])("is locked for an %s, even with the flag on", async (_label, id) => {
      await withFull(() => t.as("authenticated", id, async (q) => {
        expect(await keys(q, "mls_listing_full", "listing_key")).toEqual([]);
        expect(await keys(q, "mls_members", "member_key")).toEqual([]);
      }));
    });

    it("locks automatically when the nightly re-check deactivates the agent", async () => {
      const seen = await withFull(() => t.as("authenticated", U.agent, async (q) => {
        await q(`set local role postgres`);
        await q(`update mls_agent_access set active = false where profile_id = $1`, [U.agent]);
        await q(`set local role authenticated`);
        return keys(q, "mls_listing_full", "listing_key");
      }));
      expect(seen).toEqual([]);
    });
  });

  describe("mls_agent_access isolation (SEC-2)", () => {
    it("shows each agent only their own row", async () => {
      expect(await t.as("authenticated", U.agent, (q) => keys(q, "mls_agent_access", "profile_id"))).toEqual([U.agent]);
      expect(await t.as("authenticated", U.agent2, (q) => keys(q, "mls_agent_access", "profile_id"))).toEqual([U.agent2]);
      expect(await t.as("authenticated", U.buyer, (q) => keys(q, "mls_agent_access", "profile_id"))).toEqual([]);
    });

    it("shows admins every row", async () => {
      expect(await t.as("authenticated", U.admin, (q) => keys(q, "mls_agent_access", "profile_id"))).toHaveLength(5);
    });

    it("does not let an agent grant themselves access", async () => {
      await expect(
        t.as("authenticated", U.unverified, (q) =>
          q(`insert into mls_agent_access (profile_id, member_key, active, verified_at) values ($1, 'MB-1', true, now())`, [U.unverified]),
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("writes", () => {
    it.each(MLS_TABLES)("API roles cannot write %s", async (table) => {
      for (const id of [U.buyer, U.vow, U.agent, U.admin]) {
        await expect(t.as("authenticated", id, (q) => q(`delete from ${table}`))).rejects.toThrow(/permission denied/);
      }
      await expect(t.as("anon", null, (q) => q(`delete from ${table}`))).rejects.toThrow(/permission denied/);
    });

    it("the service role can write (the sync job)", async () => {
      const n = await t.as("service_role", null, async (q) => {
        await q(`update mls_listings set list_price = 1 where listing_key = 'L-ACTIVE'`);
        return q(`select list_price from mls_listings where listing_key = 'L-ACTIVE'`);
      });
      expect(n).toEqual([{ list_price: "1.00" }]);
    });

    it("rejects rows stored at the wrong data level or from another MLS (MLS-4, MLS-8)", async () => {
      await expect(
        t.query(`insert into mls_listings (listing_key, standard_status, modification_ts, data_level) values ('X', 'Active', now(), 'FULL')`),
      ).rejects.toThrow(/check constraint/);
      await expect(
        t.query(`insert into mls_listings (listing_key, standard_status, modification_ts, source) values ('X', 'Active', now(), 'OtherMLS')`),
      ).rejects.toThrow(/check constraint/);
      await expect(t.query(`insert into mls_listing_full (listing_key, data_level) values ('L-PENDING', 'IDX')`)).rejects.toThrow(
        /check constraint/,
      );
    });
  });

  describe("feature flags", () => {
    it("start off", async () => {
      expect(await t.query(`select key, enabled from feature_flags order by key`)).toEqual([
        { key: "cma_enabled", enabled: false },
        { key: "full_data_enabled", enabled: false },
        { key: "market_stats_enabled", enabled: false },
        { key: "public_sold", enabled: false },
        { key: "public_stats", enabled: false },
        { key: "site_scl_enabled", enabled: false },
        { key: "vow_enabled", enabled: false },
      ]);
    });

    it("cannot be flipped by agents or members", async () => {
      for (const id of [U.agent, U.vow]) {
        const changed = await t.as("authenticated", id, (q) =>
          q(`update feature_flags set enabled = true where key = 'public_sold' returning key`),
        );
        expect(changed).toEqual([]);
      }
    });

    it("can be flipped by an admin, who still cannot add flags", async () => {
      const changed = await t.as("authenticated", U.admin, (q) =>
        q(`update feature_flags set enabled = true where key = 'public_sold' returning key`),
      );
      expect(changed).toEqual([{ key: "public_sold" }]);
      await expect(
        t.as("authenticated", U.admin, (q) => q(`insert into feature_flags (key) values ('surprise')`)),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("sync health", () => {
    it("is staff-only and reports a stale feed", async () => {
      const [health] = await t.as("authenticated", U.admin, (q) => q<{ stale: boolean; last_status: string }>(`select * from mls_sync_health()`));
      expect(health).toMatchObject({ stale: true, last_status: "succeeded" });
      const [none] = await t.as("authenticated", U.buyer, (q) => q<{ stale: boolean; last_success_at: unknown }>(`select * from mls_sync_health()`));
      expect(none).toMatchObject({ stale: true, last_success_at: null });
    });

    it("is fresh after a recent successful run", async () => {
      const [health] = await t.as("authenticated", U.unverified, async (q) => {
        await q(`set local role postgres`);
        await q(`insert into mls_sync_runs (kind, status, finished_at) values ('incremental', 'succeeded', now() - interval '5 minutes')`);
        await q(`set local role authenticated`);
        return q<{ stale: boolean }>(`select * from mls_sync_health()`);
      });
      expect(health).toMatchObject({ stale: false });
    });
  });
});
