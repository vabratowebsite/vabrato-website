import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S5 PR 2 (0017): saved homes and searches (SEC-1/SEC-2), card lookups for
// saved keys (IDX only), and the VOW-only member reads, which return nothing
// while vow_enabled is off (review item 1). All data is fictional.

const U = {
  buyerA: "a2000000-0000-4000-8000-0000000000a1",
  buyerB: "b2000000-0000-4000-8000-0000000000b1",
  agentA: "a1000000-0000-4000-8000-0000000000a1", // buyerA's assigned agent
  agentB: "b1000000-0000-4000-8000-0000000000b1",
  admin: "d0000000-0000-4000-8000-0000000000d1",
  vow: "e0000000-0000-4000-8000-0000000000e1", // accepted the VOW terms
} as const;
type Who = keyof typeof U | "anon";
const SEARCH_A = "5a000000-0000-4000-8000-0000000000a1";
const SEARCH_B = "5b000000-0000-4000-8000-0000000000b1";
const DENIED = /permission denied|row-level security/;

describe("saved homes, saved searches and member MLS reads (0017)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) =>
    who === "anon" ? t.as("anon", null, fn) : t.as("authenticated", U[who], fn);
  const keys = async (who: Who, sql: string) => (await as(who, (q) => q<{ k: string }>(sql))).map((r) => r.k).sort();
  /** Runs fn as `who` with vow_enabled switched on (rolled back afterwards). */
  const withVow = <T>(who: Exclude<Who, "anon">, fn: (q: Query) => Promise<T>) =>
    as(who, async (q) => {
      await q(`set local role postgres`);
      await q(`update feature_flags set enabled = true where key = 'vow_enabled'`);
      await q(`set local role authenticated`);
      return fn(q);
    });

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.agentA, { role: "agent" });
    await createUser(t, U.agentB, { role: "agent" });
    await createUser(t, U.admin, { role: "admin" });
    for (const id of [U.buyerA, U.buyerB, U.vow]) await createUser(t, id);
    await t.exec(`
      update profiles set agent_id = '${U.agentA}' where id = '${U.buyerA}';
      update profiles set vow_accepted_at = now(), vow_terms_version = '2026-11-10' where id = '${U.vow}';
      insert into mls_listings (listing_key, standard_status, list_price, city, county, list_office_mls_id, list_office_name, is_own_listing, address_display, modification_ts, data) values
        ('L-ACTIVE', 'Active', 1500000, 'San Carlos', 'San Mateo', 'EXRG', 'Example Realty', false, true, now(), '{"StreetNumber":"1","StreetName":"Fiction","StreetSuffix":"Rd"}'),
        ('L-HIDDEN', 'Active', 1700000, 'Los Gatos', 'Santa Clara', 'EXRG', 'Example Realty', false, false, now(), '{"StreetNumber":"9","StreetName":"Secret","StreetSuffix":"Ln"}'),
        ('L-SOLD', 'Closed', 2000000, 'San Carlos', 'San Mateo', 'EXRG', 'Example Realty', false, true, now(), '{"StreetNumber":"5","StreetName":"Sample","StreetSuffix":"Ct"}'),
        ('L-OLD-SOLD', 'Closed', 900000, 'Belmont', 'San Mateo', 'EXRG', 'Example Realty', false, true, now(), '{}');
      insert into mls_listing_vow (listing_key, data) values
        ('L-ACTIVE', '{"OriginalListPrice":1550000}'),
        ('L-SOLD', '{"ClosePrice":2050000,"CloseDate":"${new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10)}","OriginalListPrice":2100000,"CumulativeDaysOnMarket":12,"BuyerAgentFullName":"Fictional Agent"}'),
        ('L-OLD-SOLD', '{"ClosePrice":950000,"CloseDate":"2019-01-15"}');
      insert into mls_price_events (listing_key, list_price, standard_status, observed_at) values
        ('L-SOLD', 2100000, 'Active', now() - interval '40 days'),
        ('L-SOLD', 2000000, 'Active', now() - interval '30 days'),
        ('L-SOLD', 2000000, 'Closed', now() - interval '20 days');
      insert into saved_homes (profile_id, listing_key) values
        ('${U.buyerA}', 'L-ACTIVE'), ('${U.buyerA}', 'L-GONE'), ('${U.buyerB}', 'L-HIDDEN');
      insert into saved_searches (id, profile_id, name, criteria) values
        ('${SEARCH_A}', '${U.buyerA}', 'San Carlos 3bd+', '{"city":["san-carlos"],"beds":3}'),
        ('${SEARCH_B}', '${U.buyerB}', 'Los Gatos', '{"city":["los-gatos"]}');
    `);
  });
  afterAll(() => t.close());

  describe("isolation (SEC-2)", () => {
    it.each<[Who, string[], string[]]>([
      ["buyerA", ["L-ACTIVE", "L-GONE"], [SEARCH_A]],
      ["buyerB", ["L-HIDDEN"], [SEARCH_B]],
      ["agentA", ["L-ACTIVE", "L-GONE"], [SEARCH_A]], // assigned to buyerA
      ["agentB", [], []],
      ["admin", ["L-ACTIVE", "L-GONE", "L-HIDDEN"], [SEARCH_A, SEARCH_B]],
      ["anon", [], []],
    ])("%s sees only the saves they may see", async (who, homes, searches) => {
      if (who === "anon") {
        await expect(as("anon", (q) => q(`select * from saved_homes`))).rejects.toThrow(DENIED);
        await expect(as("anon", (q) => q(`select * from saved_searches`))).rejects.toThrow(DENIED);
        return;
      }
      expect(await keys(who, `select listing_key as k from saved_homes`)).toEqual(homes);
      expect(await keys(who, `select id::text as k from saved_searches`)).toEqual(searches.sort());
    });

    it("members can't save, change or delete for someone else", async () => {
      await expect(as("buyerA", (q) => q(`insert into saved_homes (profile_id, listing_key) values ('${U.buyerB}', 'L-ACTIVE')`))).rejects.toThrow(DENIED);
      await expect(
        as("buyerA", (q) => q(`insert into saved_searches (profile_id, name, criteria) values ('${U.buyerB}', 'x', '{}')`)),
      ).rejects.toThrow(DENIED);
      expect(await as("buyerA", (q) => q(`update saved_searches set name = 'x' where id = '${SEARCH_B}' returning id`))).toEqual([]);
      expect(await as("buyerA", (q) => q(`delete from saved_homes where profile_id = '${U.buyerB}' returning listing_key`))).toEqual([]);
      expect(await as("buyerA", (q) => q(`delete from saved_searches where id = '${SEARCH_B}' returning id`))).toEqual([]);
    });

    it("staff can read but not change a member's saves", async () => {
      expect(await as("agentA", (q) => q(`delete from saved_homes where profile_id = '${U.buyerA}' returning listing_key`))).toEqual([]);
      expect(await as("admin", (q) => q(`update saved_searches set name = 'x' returning id`))).toEqual([]);
      await expect(as("agentA", (q) => q(`insert into saved_homes (profile_id, listing_key) values ('${U.buyerA}', 'L-HIDDEN')`))).rejects.toThrow(DENIED);
    });

    it("a member saves and removes their own, and can't move a search to another member", async () => {
      await as("buyerB", async (q) => {
        await q(`insert into saved_homes (listing_key) values ('L-ACTIVE')`);
        const [s] = await q<{ id: string }>(`insert into saved_searches (name, criteria, frequency) values ('Mine', '{"beds":2}', 'daily') returning id`);
        expect((await q(`select listing_key from saved_homes order by 1`)).length).toBe(2);
        expect(await q(`delete from saved_homes where listing_key = 'L-ACTIVE' returning listing_key`)).toEqual([{ listing_key: "L-ACTIVE" }]);
        await expect(q(`update saved_searches set profile_id = '${U.buyerA}' where id = '${s!.id}'`)).rejects.toThrow(DENIED);
      });
    });
  });

  describe("validation and limits", () => {
    it("rejects bad keys, empty names and non-object criteria", async () => {
      await expect(as("buyerA", (q) => q(`insert into saved_homes (listing_key) values ('bad key; drop')`))).rejects.toThrow(/check constraint/);
      await expect(as("buyerA", (q) => q(`insert into saved_searches (name, criteria) values ('  ', '{}')`))).rejects.toThrow(/check constraint/);
      await expect(as("buyerA", (q) => q(`insert into saved_searches (name, criteria) values ('x', '[1]')`))).rejects.toThrow(/check constraint/);
    });

    it("caps saved searches at 25 per member", async () => {
      await as("buyerB", async (q) => {
        for (let i = 0; i < 24; i++) await q(`insert into saved_searches (name, criteria) values ('S${i}', '{}')`);
        await expect(q(`insert into saved_searches (name, criteria) values ('one too many', '{}')`)).rejects.toThrow(/saved_searches_limit/);
      });
    });
  });

  describe("listing_cards (IDX)", () => {
    it("returns for-sale saved keys only, with hidden addresses withheld", async () => {
      const rows = await as("buyerA", (q) =>
        q<{ listing_key: string; street: string | null; latitude: number | null }>(
          `select listing_key, street, latitude from listing_cards(array['L-ACTIVE','L-HIDDEN','L-SOLD','L-GONE'])`,
        ),
      );
      expect(rows).toEqual([
        { listing_key: "L-ACTIVE", street: "1 Fiction Rd", latitude: null },
        { listing_key: "L-HIDDEN", street: null, latitude: null },
      ]);
    });

    it("gives anon (home page featured pins, 0024) the same IDX for-sale cards and nothing else", async () => {
      const rows = await as("anon", (q) =>
        q<{ listing_key: string; street: string | null }>(`select listing_key, street from listing_cards(array['L-ACTIVE','L-HIDDEN','L-SOLD','L-GONE'])`),
      );
      expect(rows).toEqual([
        { listing_key: "L-ACTIVE", street: "1 Fiction Rd" },
        { listing_key: "L-HIDDEN", street: null },
      ]);
    });
  });

  describe("VOW reads (MLS-6, review item 1)", () => {
    it("return nothing while vow_enabled is off, even for a member who accepted", async () => {
      await as("vow", async (q) => {
        expect(await q(`select * from search_sold_listings()`)).toEqual([]);
        expect(await q(`select * from listing_price_history('L-SOLD')`)).toEqual([]);
        expect(await q(`select * from listing_sold_detail('L-SOLD')`)).toEqual([]);
      });
    });

    it("return nothing to members who haven't accepted the terms, flag on", async () => {
      await withVow("buyerA", async (q) => {
        expect(await q(`select * from search_sold_listings()`)).toEqual([]);
        expect(await q(`select * from listing_price_history('L-SOLD')`)).toEqual([]);
        expect(await q(`select * from listing_sold_detail('L-SOLD')`)).toEqual([]);
      });
    });

    it("serve VOW members recent sales, history and allowlisted sold fields once the flag is on", async () => {
      await withVow("vow", async (q) => {
        const sold = await q<{ listing_key: string; close_price: string; street: string }>(`select listing_key, close_price::text, street from search_sold_listings()`);
        expect(sold).toEqual([{ listing_key: "L-SOLD", close_price: "2050000", street: "5 Sample Ct" }]);
        expect(await q(`select listing_key from search_sold_listings(p_cities => array['belmont'], p_closed_within_days => 1825)`)).toEqual([]);
        expect(await q(`select list_price::int as p, standard_status as s from listing_price_history('L-SOLD')`)).toEqual([
          { p: 2100000, s: "Active" },
          { p: 2000000, s: "Active" },
          { p: 2000000, s: "Closed" },
        ]);
        const [detail] = await q<Record<string, unknown>>(`select * from listing_sold_detail('L-SOLD')`);
        expect(Object.keys(detail!).sort()).toEqual(["close_date", "close_price", "cumulative_days_on_market", "original_list_price"]);
        expect(detail!.cumulative_days_on_market).toBe(12);
      });
    });

    it("are not callable signed out", async () => {
      for (const fn of ["search_sold_listings()", "listing_price_history('L-SOLD')", "listing_sold_detail('L-SOLD')"]) {
        await expect(as("anon", (q) => q(`select * from ${fn}`))).rejects.toThrow(/permission denied/);
      }
    });
  });
});
