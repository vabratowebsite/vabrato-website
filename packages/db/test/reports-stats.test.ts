import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type TestDb } from "./harness";

// S6 PR 5 (0025): seller weekly report, market statistics (suppression and
// flags), CMAs (verified agents + flag; saved CMAs keep keys only).
// Fictional people and fixture listings only.

const U = {
  mark: "a1000000-0000-4000-8000-0000000025a1",
  agent: "c1000000-0000-4000-8000-0000000025c1",
  agent2: "c2000000-0000-4000-8000-0000000025c2",
  va: "d1000000-0000-4000-8000-0000000025d1",
  seller: "e1000000-0000-4000-8000-0000000025e1",
  seller2: "e2000000-0000-4000-8000-0000000025e2",
  buyer: "f1000000-0000-4000-8000-0000000025f1",
} as const;
type Who = keyof typeof U;
const DEAL = "da000000-0000-4000-8000-0000000025a1";
const DEAL_UNLINKED = "db000000-0000-4000-8000-0000000025b1";

interface Stats {
  enabled?: boolean;
  sold: { count: number; median_price: number | null; median_price_per_sqft: number | null; median_days_on_market: number | null; median_sale_to_list: number | null };
  market: { active: number; pending: number; median_list_price: number | null; months_of_inventory: number | null };
  by_month: { month: string; sold: number; median_price: number | null }[];
}

describe("seller weekly report, market stats, CMAs (0025)", () => {
  let t: TestDb;
  let week: string;
  // Runs as the API role with grants and RLS, and keeps what it writes.
  const act = async <T>(who: Who | "anon", sql: string, params: unknown[] = []) => {
    await t.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who === "anon" ? "" : U[who]]);
    await t.exec(`set role ${who === "anon" ? "anon" : "authenticated"}`);
    try {
      return await t.query<T>(sql, params);
    } finally {
      await t.exec(`reset role`);
      await t.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  };
  const flag = (key: string, on: boolean) => t.query(`update feature_flags set enabled = $2 where key = $1`, [key, on]);

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.mark, { role: "admin" });
    await createUser(t, U.agent, { role: "agent", email: "agent.cma@example.test" });
    await createUser(t, U.agent2, { role: "agent" });
    await createUser(t, U.va, { role: "va" });
    await createUser(t, U.seller, { role: "seller" });
    await createUser(t, U.seller2, { role: "seller" });
    await createUser(t, U.buyer);
    await t.query(`update profiles set full_name = 'Jordan Seller' where id = $1`, [U.seller]);
    week = (await t.query<{ w: string }>(`select (date_trunc('week', (now() at time zone 'America/Los_Angeles')::date)::date - 7)::text as w`))[0]!.w;

    // Fixture listings: our listing for the deal; San Carlos with 6 recent
    // sales (one old one outside 12 months), 3 active, 1 pending; Belmont
    // with 4 sales (too few for medians).
    const sold: string[] = [];
    [1000000, 1200000, 1400000, 1600000, 1800000, 2000000].forEach((p, i) => {
      sold.push(`('SC-S${i}', 'Closed', ${Math.round(p / 1.05)}, 'San Carlos', 1000, ${i === 5 ? "false" : "true"}, ('{"StreetNumber":"${i + 1}","StreetName":"Fixture","StreetSuffix":"Way","OnMarketDate":"' || (current_date - ${10 * i + 20})::text || '"}')::jsonb)`);
    });
    sold.push(`('SC-OLD', 'Closed', 900000, 'San Carlos', 1000, true, '{}')`);
    [1100000, 1300000, 1500000, 1700000].forEach((p, i) => sold.push(`('BE-S${i}', 'Closed', ${p}, 'Belmont', 1200, true, '{}')`));
    await t.exec(`
      insert into mls_listings (listing_key, standard_status, list_price, city, living_area, address_display, data, county, modification_ts) values
        ${sold.map((s) => s.replace(/\)$/, ", 'San Mateo', now())")).join(",\n        ")},
        ('OWN-1', 'Active', 2850000, 'San Carlos', 1800, true, '{}', 'San Mateo', now()),
        ('SC-A1', 'Active', 1500000, 'San Carlos', 1100, true, '{}', 'San Mateo', now()),
        ('SC-A2', 'Active', 1700000, 'San Carlos', 1300, true, '{}', 'San Mateo', now()),
        ('SC-P1', 'Pending', 1600000, 'San Carlos', 1200, true, '{}', 'San Mateo', now());
      insert into mls_listing_vow (listing_key, data)
        select listing_key, jsonb_build_object('ClosePrice', round(list_price * 1.05), 'CloseDate', (current_date - (10 * substr(listing_key, 5)::int))::text)
        from mls_listings where listing_key like 'SC-S%';
      insert into mls_listing_vow (listing_key, data) values ('SC-OLD', '{"ClosePrice": 900000, "CloseDate": "2023-01-15"}');
      insert into mls_listing_vow (listing_key, data)
        select listing_key, jsonb_build_object('ClosePrice', list_price, 'CloseDate', (current_date - 30)::text) from mls_listings where listing_key like 'BE-S%';

      insert into deals (id, address, ratification_date, agent_id, created_by, listing_key) values
        ('${DEAL}', '88 Fictional Dr, San Carlos', current_date, '${U.agent}', '${U.agent}', 'OWN-1'),
        ('${DEAL_UNLINKED}', '5 Sample Ct, Belmont', current_date, '${U.agent}', '${U.agent}', null);
      insert into deal_members (deal_id, profile_id, member_role) values
        ('${DEAL}', '${U.seller}', 'seller'), ('${DEAL}', '${U.seller2}', 'seller'), ('${DEAL_UNLINKED}', '${U.seller2}', 'seller');
      insert into listing_views_daily (listing_key, day, views) values
        ('OWN-1', '${week}'::date - 3, 4), ('OWN-1', '${week}', 5), ('OWN-1', '${week}'::date + 3, 7), ('OWN-1', '${week}'::date + 7, 100);
      insert into saved_homes (profile_id, listing_key, created_at) values ('${U.buyer}', 'OWN-1', ('${week}'::date + 1)::timestamp at time zone 'America/Los_Angeles' + interval '12 hours');
    `);
    await t.query(`insert into leads (kind, email, listing_key) values ('tour', 'tour@example.test', 'OWN-1'), ('open_house_signin', 'oh@example.test', 'OWN-1')`);
    await t.query(`update leads set created_at = ($1::date + 2)::timestamp at time zone 'America/Los_Angeles' + interval '10 hours' where listing_key = 'OWN-1'`, [week]);
  });
  afterAll(() => t.close());

  describe("seller weekly report", () => {
    beforeEach(async () => {
      await t.exec(`delete from seller_report_sends; delete from notifications; delete from staff_audit`);
    });

    it("counts one finished Pacific week, plus totals to its end", async () => {
      const { d } = (await act<{ d: Record<string, unknown> }>("agent", `select seller_weekly_report_data($1) as d`, [DEAL]))[0]!;
      expect(d).toMatchObject({
        address: "88 Fictional Dr, San Carlos",
        linked: true,
        week_start: week,
        listing: { standard_status: "Active", list_price: 2850000 },
        week: { views: 12, saves: 1, tour_requests: 1, open_house_signins: 1 },
        totals: { views: 16, saves: 1, tour_requests: 1, open_house_signins: 1 },
        sent: null,
      });
      expect(d.sellers).toEqual([{ first_name: "Jordan" }, { first_name: null }]);
    });

    it("refuses the current week, a non-Monday, and anyone without staff access to the deal", async () => {
      const thisWeek = (await t.query<{ w: string }>(`select ($1::date + 7)::text as w`, [week]))[0]!.w;
      await expect(act("agent", `select seller_weekly_report_data($1, $2)`, [DEAL, thisWeek])).rejects.toThrow(/bad_week/);
      await expect(act("agent", `select seller_weekly_report_data($1, $2::date + 1)`, [DEAL, week])).rejects.toThrow(/bad_week/);
      for (const who of ["agent2", "seller", "buyer"] as const) {
        await expect(act(who, `select seller_weekly_report_data($1)`, [DEAL])).rejects.toThrow(/not_allowed/);
        await expect(act(who, `select send_seller_weekly_report($1)`, [DEAL])).rejects.toThrow(/not_allowed/);
      }
      await expect(act("anon", `select send_seller_weekly_report($1)`, [DEAL])).rejects.toThrow(/permission denied/);
    });

    it("emails every seller once per deal per week, with counts only, audited", async () => {
      expect(await act("agent", `select send_seller_weekly_report($1) as n`, [DEAL])).toEqual([{ n: 2 }]);
      const rows = await t.query<{ recipient_profile_id: string; payload: Record<string, string>; dedupe_key: string }>(
        `select recipient_profile_id, payload, dedupe_key from notifications where template_key = 'seller_weekly_report' order by recipient_profile_id`,
      );
      expect(rows.map((r) => r.recipient_profile_id).sort()).toEqual([U.seller, U.seller2].sort());
      const p = rows.find((r) => r.recipient_profile_id === U.seller)!.payload;
      expect(p).toMatchObject({ sellerName: "Jordan", views: "12", saves: "1", tourRequests: "1", openHouseSignins: "1", totalViews: "16", status: "Active", weekStart: week });
      expect(JSON.stringify(rows)).not.toMatch(/@example\.test/);
      await expect(act("agent", `select send_seller_weekly_report($1)`, [DEAL])).rejects.toThrow(/already_sent/);
      expect((await t.query(`select count(*)::int as n from notifications`))[0]).toEqual({ n: 2 });
      expect(await t.query(`select action from staff_audit`)).toEqual([{ action: "send_seller_weekly_report" }]);
      const { d } = (await act<{ d: { sent: { recipients: number } } }>("mark", `select seller_weekly_report_data($1) as d`, [DEAL]))[0]!;
      expect(d.sent.recipients).toBe(2);
    });

    it("needs a linked listing", async () => {
      await expect(act("agent", `select send_seller_weekly_report($1)`, [DEAL_UNLINKED])).rejects.toThrow(/not_linked/);
    });

    it("send records are visible to staff on the deal only", async () => {
      await act("agent", `select send_seller_weekly_report($1)`, [DEAL]);
      expect((await act("mark", `select deal_id from seller_report_sends`)).length).toBe(1);
      expect(await act("agent2", `select deal_id from seller_report_sends`)).toEqual([]);
      expect(await act("seller", `select deal_id from seller_report_sends`)).toEqual([]);
    });
  });

  describe("market statistics", () => {
    afterAll(async () => {
      await flag("market_stats_enabled", false);
      await flag("public_stats", false);
    });

    it("are off by default, and staff only", async () => {
      expect(await act("va", `select market_stats('san-carlos') as s`)).toEqual([{ s: { enabled: false } }]);
      await expect(act("buyer", `select market_stats('san-carlos')`)).rejects.toThrow(/not_allowed/);
      await expect(act("anon", `select market_stats('san-carlos')`)).rejects.toThrow(/permission denied/);
      await expect(act("agent", `select market_stats_compute('san-carlos', 12)`)).rejects.toThrow(/permission denied/);
    });

    it("compute medians, ratios and inventory for the last 12 months", async () => {
      await flag("market_stats_enabled", true);
      const { s } = (await act<{ s: Stats }>("va", `select market_stats('san-carlos', 12) as s`))[0]!;
      expect(s.enabled).toBe(true);
      expect(s.sold).toEqual({ count: 6, median_price: 1500000, median_price_per_sqft: 1500, median_days_on_market: 20, median_sale_to_list: 1.05 });
      expect(s.market).toEqual({ active: 3, pending: 1, median_list_price: null, months_of_inventory: 6 });
      expect(s.by_month.reduce((n, m) => n + m.sold, 0)).toBe(6);
      expect(s.by_month.every((m) => m.median_price === null || m.sold >= 5)).toBe(true);
      await expect(act("va", `select market_stats('atlantis')`)).rejects.toThrow(/not_found/);
    });

    it("withhold medians built on fewer than 5 sales", async () => {
      const { s } = (await act<{ s: Stats }>("va", `select market_stats('belmont') as s`))[0]!;
      expect(s.sold).toEqual({ count: 4, median_price: null, median_price_per_sqft: null, median_days_on_market: null, median_sale_to_list: null });
      expect(s.market.months_of_inventory).toBeNull();
    });

    it("public city stats return nothing until public_stats is on (MLS-10)", async () => {
      expect(await act("anon", `select public_city_stats('san-carlos') as s`)).toEqual([{ s: null }]);
      await flag("public_stats", true);
      const { s } = (await act<{ s: Stats }>("anon", `select public_city_stats('san-carlos') as s`))[0]!;
      expect(s.sold.median_price).toBe(1500000);
      // Aggregates only: no listing keys or addresses.
      expect(JSON.stringify(s)).not.toMatch(/SC-S|Fixture/);
    });
  });

  describe("CMAs", () => {
    const comps = (who: Who, args = `p_city_slugs => array['san-carlos']`) =>
      act<{ listing_key: string; street: string | null; close_price: string; price_per_sqft: string }>(who, `select * from cma_comps(${args})`);
    beforeAll(async () => {
      await t.exec(`insert into mls_members (member_key, full_name, email, member_status, office_mls_id) values ('MB-CMA', 'Agent Cma', 'agent.cma@example.test', 'Active', 'VABRA');
                    insert into mls_agent_access (profile_id, member_key, active, verified_at) values ('${U.agent}', 'MB-CMA', true, now())`);
    });
    afterAll(() => flag("cma_enabled", false));

    it("return nothing while cma_enabled is off, or to unverified staff", async () => {
      expect(await comps("agent")).toEqual([]);
      await flag("cma_enabled", true);
      expect(await comps("agent2")).toEqual([]);
      expect(await comps("mark")).toEqual([]); // role admin, but not MLS-verified
      await expect(act("anon", `select * from cma_comps()`)).rejects.toThrow(/permission denied/);
    });

    it("give a verified agent recent sold comps, newest first, hidden addresses withheld", async () => {
      const rows = await comps("agent", `p_city_slugs => array['san-carlos'], p_months => 6`);
      expect(rows.map((r) => r.listing_key)).toEqual(["SC-S0", "SC-S1", "SC-S2", "SC-S3", "SC-S4", "SC-S5"]);
      expect(rows.find((r) => r.listing_key === "SC-S5")!.street).toBeNull();
      expect(rows[0]).toMatchObject({ street: "1 Fixture Way", close_price: "1000000", price_per_sqft: "1000" });
      expect((await comps("agent", `p_city_slugs => array['san-carlos'], p_min_sqft => 2000`)).length).toBe(0);
    });

    it("rebuild a saved CMA from its keys; keys that left the feed are simply missing", async () => {
      const rows = await comps("agent", `p_keys => array['SC-S1', 'GONE-1', 'SC-A1']`);
      expect(rows.map((r) => r.listing_key)).toEqual(["SC-S1"]);
    });

    it("saved CMAs store subject details and keys only, for their author (and admins)", async () => {
      const { id } = (await act<{ id: string }>("agent", `insert into cmas (title, subject, comp_keys) values ('88 Fictional Dr', '{"city_slug":"san-carlos","beds":3,"sqft":1500}', array['SC-S1','SC-S2']) returning id`))[0]!;
      await expect(act("agent", `insert into cmas (title, subject) values ('x', '{"ClosePrice": 1}')`)).rejects.toThrow(/cma_subject_ok|check constraint/);
      await expect(act("agent", `insert into cmas (title, comp_keys) values ('x', array['bad key'])`)).rejects.toThrow(/check constraint/);
      await expect(act("agent2", `insert into cmas (title) values ('x')`)).rejects.toThrow(/row-level security/);
      expect(await act("agent2", `select id from cmas`)).toEqual([]);
      expect((await act("mark", `select id from cmas`)).map((r) => (r as { id: string }).id)).toEqual([id]);
      await flag("cma_enabled", false);
      await expect(act("agent", `insert into cmas (title) values ('x')`)).rejects.toThrow(/row-level security/);
      expect((await act("agent", `select id from cmas`)).length).toBe(1);
    });
  });
});
