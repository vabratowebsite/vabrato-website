import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// 0014: content tables, leads, and the public MLS read API. Fictional data.

const U = {
  admin: "30000000-0000-4000-8000-000000000001",
  agent: "20000000-0000-4000-8000-000000000001",
  agent2: "20000000-0000-4000-8000-000000000002",
  buyer: "10000000-0000-4000-8000-000000000001",
  vow: "10000000-0000-4000-8000-000000000002",
} as const;

const CONTENT = ["city_guides", "agent_profiles", "testimonials", "videos", "posts"] as const;

describe("0014 content, leads and public MLS API", () => {
  let t: TestDb;
  const anon = <T>(fn: (q: Query) => Promise<T>) => t.as("anon", null, fn);
  const user = <T>(id: string, fn: (q: Query) => Promise<T>) => t.as("authenticated", id, fn);

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.agent2, { role: "agent" });
    await createUser(t, U.buyer);
    await createUser(t, U.vow);
    await t.query(`update profiles set vow_accepted_at = now() where id = $1`, [U.vow]);
    await t.query(`update agent_profiles set profile_id = $1 where slug = 'mark-martinho'`, [U.agent]);

    // Fictional listings (lon/lat around the Peninsula).
    await t.exec(`
      insert into mls_listings (listing_key, listing_id, standard_status, property_sub_type, list_price, city, county,
        bedrooms_total, bathrooms_total, latitude, longitude, list_office_name, list_office_mls_id, is_own_listing,
        address_display, modification_ts, data) values
      ('L1', 'ML1', 'Active', 'Single Family Residence', 2000000, 'San Carlos', 'San Mateo', 4, 3, 37.50, -122.26, 'Vabrato', 'VABRA', true, true, now() - interval '1 day',
        '{"StreetNumber":"100","StreetName":"Example","StreetSuffix":"Way","UnparsedAddress":"100 Example Way, San Carlos, CA 94070","OnMarketDate":"2026-11-05"}'),
      ('L2', 'ML2', 'Pending', 'Condominium', 1200000, 'Redwood City', 'San Mateo', 2, 2, 37.48, -122.23, 'Example Realty', 'EXRG', false, true, now() - interval '2 days',
        '{"UnparsedAddress":"200 Sample Ct #4, Redwood City, CA 94061","OnMarketDate":"2026-11-01"}'),
      ('L3', 'ML3', 'Active', 'Single Family Residence', 3500000, 'Palo Alto', 'Santa Clara', 5, 4, 37.44, -122.14, 'Example Realty', 'EXRG', false, true, now() - interval '3 days',
        '{"StreetNumber":"300","StreetName":"Placeholder","StreetSuffix":"Ave","OnMarketDate":"2026-10-20"}'),
      ('L4', 'ML4', 'Active', 'Single Family Residence', 2900000, 'Los Gatos', 'Santa Clara', 4, 4, null, null, 'Sample Homes', 'SMPL', false, false, now() - interval '4 days',
        '{"City":"Los Gatos","OnMarketDate":"2026-10-25"}'),
      ('L5', 'ML5', 'Closed', 'Single Family Residence', 2100000, 'San Carlos', 'San Mateo', 3, 2, 37.51, -122.27, 'Vabrato', 'VABRA', true, true, now() - interval '30 days',
        '{"StreetNumber":"500","StreetName":"Fixture","StreetSuffix":"St","UnparsedAddress":"500 Fixture St, San Carlos, CA 94070"}');
      insert into mls_listing_vow (listing_key, data) values ('L5', '{"ClosePrice": 2150000, "CloseDate": "2026-10-01"}');
      insert into mls_media (media_key, listing_key, sort_order, url) values
        ('L1-P2', 'L1', 2, 'https://mock.mls.invalid/media/L1-P2.svg'),
        ('L1-P1', 'L1', 1, 'https://mock.mls.invalid/media/L1-P1.svg');
      insert into mls_open_houses (open_house_key, listing_key, start_time, end_time) values
        ('OH-L3', 'L3', now() + interval '2 days', now() + interval '2 days 2 hours'),
        ('OH-L2-PAST', 'L2', now() - interval '2 days', now() - interval '2 days' + interval '2 hours');
      insert into mls_sync_runs (kind, status, finished_at) values ('incremental', 'succeeded', now() - interval '10 minutes');
    `);
  });
  afterAll(() => t.close());

  describe("cities", () => {
    it("seeds the 35 service-area cities, readable by anyone", async () => {
      const rows = await anon((q) => q<{ county: string; n: number }>(`select county, count(*)::int as n from cities group by county order by county`));
      expect(rows).toEqual([
        { county: "San Mateo", n: 20 },
        { county: "Santa Clara", n: 15 },
      ]);
    });

    it("lets admins add an unincorporated area without code changes", async () => {
      const added = await user(U.admin, (q) =>
        q(`insert into cities (slug, name, county, kind, mls_city_names) values ('emerald-hills', 'Emerald Hills', 'San Mateo', 'unincorporated', '{"Emerald Hills"}') returning slug`),
      );
      expect(added).toHaveLength(1);
      await expect(user(U.agent, (q) => q(`insert into cities (slug, name, county, mls_city_names) values ('x', 'X', 'San Mateo', '{X}')`))).rejects.toThrow(
        /row-level security/,
      );
    });
  });

  describe("content tables", () => {
    it.each(CONTENT)("%s: seeded placeholders are unpublished, so the public sees none", async (table) => {
      expect(await anon((q) => q(`select * from ${table}`))).toEqual([]);
      const flagged = await t.query<{ n: number }>(`select count(*)::int as n from ${table} where published and is_placeholder`);
      expect(flagged).toEqual([{ n: 0 }]);
    });

    it("shows published rows to the public and drafts to staff only", async () => {
      await t.query(`update posts set published = true, is_placeholder = false where slug = 'placeholder-news'`);
      expect(await anon((q) => q(`select slug from posts`))).toEqual([{ slug: "placeholder-news" }]);
      expect(await user(U.buyer, (q) => q(`select slug from posts`))).toEqual([{ slug: "placeholder-news" }]);
      expect(await user(U.agent, (q) => q(`select slug from posts order by slug`))).toHaveLength(2);
      await t.query(`update posts set published = false, is_placeholder = true where slug = 'placeholder-news'`);
    });

    it("hides posts scheduled for the future", async () => {
      const seen = await anon(async (q) => {
        await q(`set local role postgres`);
        await q(`update posts set published = true, published_at = now() + interval '1 day' where slug = 'placeholder-insight'`);
        await q(`set local role anon`);
        return q(`select slug from posts`);
      });
      expect(seen).toEqual([]);
    });

    it.each(CONTENT)("%s: only admins write", async (table) => {
      await expect(anon((q) => q(`delete from ${table}`))).rejects.toThrow(/permission denied/);
      expect(await user(U.buyer, (q) => q(`delete from ${table} returning 1`))).toEqual([]);
      expect(await user(U.agent2, (q) => q(`delete from ${table} returning 1`))).toEqual([]);
    });

    it("lets an agent edit their own profile content but not publish it or anyone else's", async () => {
      const own = await user(U.agent, (q) => q(`update agent_profiles set bio = 'Fictional bio' where slug = 'mark-martinho' returning slug`));
      expect(own).toEqual([{ slug: "mark-martinho" }]);
      await expect(user(U.agent, (q) => q(`update agent_profiles set published = true where slug = 'mark-martinho'`))).rejects.toThrow(
        /Only an admin/,
      );
      expect(await user(U.agent, (q) => q(`update agent_profiles set bio = 'x' where slug = 'viv-kelvin' returning slug`))).toEqual([]);
      expect(await user(U.agent2, (q) => q(`update agent_profiles set bio = 'x' where slug = 'mark-martinho' returning slug`))).toEqual([]);
      const pub = await user(U.admin, (q) => q(`update agent_profiles set published = true where slug = 'viv-kelvin' returning slug`));
      expect(pub).toEqual([{ slug: "viv-kelvin" }]);
    });

    it("content_launch_blockers() lists published placeholders (S9 launch check)", async () => {
      const blockers = await user(U.admin, async (q) => {
        await q(`update agent_profiles set published = true where slug = 'viv-kelvin'`);
        return q(`select * from content_launch_blockers()`);
      });
      expect(blockers).toEqual([{ table_name: "agent_profiles", row_key: "viv-kelvin" }]);
      expect(await user(U.admin, (q) => q(`select * from content_launch_blockers()`))).toEqual([]);
      expect(await user(U.buyer, (q) => q(`select * from content_launch_blockers()`))).toEqual([]);
      await expect(anon((q) => q(`select * from content_launch_blockers()`))).rejects.toThrow(/permission denied/);
    });
  });

  describe("leads", () => {
    const insert = (q: Query, email: string, extra = "") =>
      q(`insert into leads (kind, email${extra ? ", ip_hash" : ""}) values ('contact', '${email}'${extra ? `, '${extra}'` : ""})`);

    it("accepts a public submission but never lets it be read back", async () => {
      await anon((q) => insert(q, "visitor@example.test"));
      await expect(anon((q) => q(`select * from leads`))).rejects.toThrow(/permission denied/);
      expect(await user(U.buyer, (q) => q(`select * from leads`))).toEqual([]);
      await expect(anon((q) => q(`insert into leads (kind, email) values ('contact', 'x@example.test') returning id`))).rejects.toThrow(
        /permission denied/,
      );
    });

    it("lets staff read leads and admins assign them", async () => {
      const rows = await user(U.agent, async (q) => {
        await insert(q, "staffcheck@example.test");
        return q(`select email from leads where email = 'staffcheck@example.test'`);
      });
      expect(rows).toHaveLength(1);
      expect(await user(U.agent, (q) => q(`update leads set status = 'closed' returning id`))).toEqual([]);
    });

    it("ignores attempts to pre-assign or pre-close a lead", async () => {
      await expect(anon((q) => q(`insert into leads (kind, email, status) values ('contact', 'a@example.test', 'closed')`))).rejects.toThrow(
        /permission denied/,
      );
      await expect(anon((q) => q(`insert into leads (kind, email, assigned_to) values ('contact', 'a@example.test', '${U.agent}')`))).rejects.toThrow(
        /permission denied/,
      );
    });

    it("validates lengths and email format", async () => {
      await expect(anon((q) => insert(q, "not-an-email"))).rejects.toThrow(/check constraint/);
      await expect(anon((q) => q(`insert into leads (kind, email, message) values ('contact', 'b@example.test', repeat('x', 5000))`))).rejects.toThrow(
        /check constraint/,
      );
    });

    it("limits 5 per email per hour and 5 per IP per 10 minutes", async () => {
      await anon(async (q) => {
        for (let i = 0; i < 5; i++) await insert(q, "Repeat@Example.test");
        await expect(insert(q, "repeat@example.test")).rejects.toThrow(/lead_rate_limited/);
      });
      const ip = "a".repeat(64);
      await anon(async (q) => {
        for (let i = 0; i < 5; i++) await insert(q, `ip${i}@example.test`, ip);
        await expect(insert(q, "ip9@example.test", ip)).rejects.toThrow(/lead_rate_limited/);
      });
    });

    it("purges leads older than the retention period (service role only)", async () => {
      const purged = await t.as("service_role", null, async (q) => {
        await q(`set local role postgres`);
        await q(`alter table leads disable trigger leads_before_insert`);
        await q(`insert into leads (kind, email, created_at) values ('contact', 'old@example.test', now() - interval '25 months'), ('contact', 'new@example.test', now())`);
        await q(`alter table leads enable trigger leads_before_insert`);
        await q(`set local role service_role`);
        return q<{ n: number }>(`select purge_old_leads() as n`);
      });
      expect(purged).toEqual([{ n: 1 }]);
      await expect(anon((q) => q(`select purge_old_leads()`))).rejects.toThrow(/permission denied/);
      await expect(user(U.admin, (q) => q(`select purge_old_leads()`))).rejects.toThrow(/permission denied/);
    });
  });

  describe("search_listings (IDX)", () => {
    type Row = { listing_key: string; street: string | null; latitude: number | null; total_count: number | string; photo_url: string | null };
    const search = (args: string) => anon((q) => q<Row>(`select * from search_listings(${args})`));
    const keysOf = (rows: Row[]) => rows.map((r) => r.listing_key);

    it("returns for-sale listings only, newest first, never Closed", async () => {
      const rows = await search("");
      expect(keysOf(rows)).toEqual(["L1", "L2", "L4", "L3"]);
      expect(Number(rows[0]!.total_count)).toBe(4);
      // Even a VOW member gets no sold rows from public search.
      expect(keysOf(await user(U.vow, (q) => q<Row>(`select * from search_listings()`)))).not.toContain("L5");
    });

    it("filters by city slug, price, beds, baths, type and our office", async () => {
      expect(keysOf(await search("p_cities => '{san-carlos,palo-alto}'"))).toEqual(["L1", "L3"]);
      expect(keysOf(await search("p_min_price => 1500000, p_max_price => 3000000"))).toEqual(["L1", "L4"]);
      expect(keysOf(await search("p_min_beds => 5"))).toEqual(["L3"]);
      expect(keysOf(await search("p_min_baths => 4"))).toEqual(["L4", "L3"]);
      expect(keysOf(await search("p_sub_types => '{Condominium}'"))).toEqual(["L2"]);
      expect(keysOf(await search("p_own_only => true"))).toEqual(["L1"]);
    });

    it("filters by map bounds and upcoming open houses", async () => {
      expect(keysOf(await search("p_bbox => array[-122.30, 37.47, -122.20, 37.52]::float8[]"))).toEqual(["L1", "L2"]);
      expect(keysOf(await search("p_open_houses_only => true"))).toEqual(["L3"]);
    });

    it("sorts and pages", async () => {
      expect(keysOf(await search("p_sort => 'price_desc'"))).toEqual(["L3", "L4", "L1", "L2"]);
      expect(keysOf(await search("p_sort => 'price_asc', p_limit => 2, p_offset => 2"))).toEqual(["L4", "L3"]);
      expect(await search("p_limit => 1000")).toHaveLength(4);
    });

    it("withholds street and coordinates when the address may not be shown (MLS-3)", async () => {
      const rows = await search("");
      const byKey = Object.fromEntries(rows.map((r) => [r.listing_key, r]));
      expect(byKey.L1).toMatchObject({ street: "100 Example Way", photo_url: "https://mock.mls.invalid/media/L1-P1.svg" });
      expect(byKey.L2!.street).toBe("200 Sample Ct #4");
      expect(byKey.L4).toMatchObject({ street: null, latitude: null });
    });
  });

  describe("public MLS helpers", () => {
    it("mls_last_updated() works signed out (MLS-1)", async () => {
      const [row] = await anon((q) => q<{ t: string | null }>(`select mls_last_updated() as t`));
      expect(row!.t).not.toBeNull();
    });

    it("public_own_sold() is empty until public_sold is on, then shows only our own sales (MLS-10)", async () => {
      expect(await anon((q) => q(`select * from public_own_sold()`))).toEqual([]);
      const rows = await anon(async (q) => {
        await q(`set local role postgres`);
        await q(`update feature_flags set enabled = true where key = 'public_sold'`);
        await q(`set local role anon`);
        return q(`select listing_key, street, close_price from public_own_sold()`);
      });
      expect(rows).toEqual([{ listing_key: "L5", street: "500 Fixture St", close_price: "2150000" }]);
    });

    it("adds the site_scl_enabled flag, off", async () => {
      expect(await anon((q) => q(`select enabled from feature_flags where key = 'site_scl_enabled'`))).toEqual([{ enabled: false }]);
    });

    it("accepts the mock marker but nothing else (MLS-8)", async () => {
      await t.query(`insert into mls_listings (listing_key, standard_status, modification_ts, source) values ('MOCK1', 'Active', now(), 'mock')`);
      await expect(
        t.query(`insert into mls_listings (listing_key, standard_status, modification_ts, source) values ('X1', 'Active', now(), 'OtherMLS')`),
      ).rejects.toThrow(/check constraint/);
      await t.query(`delete from mls_listings where listing_key = 'MOCK1'`);
    });
  });
});
