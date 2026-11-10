import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S5 PR 5 (0020–0021): deal ↔ listing link, listing views, open-house sign-in
// links and listing_performance(). Sellers see only their own deal's counts;
// the public can't write views without the server key. Fictional data only.
// `as()` rolls back, so writes that later tests rely on run as the owner.

const U = {
  sellerA: "a3000000-0000-4000-8000-0000000005a1",
  sellerB: "b3000000-0000-4000-8000-0000000005b1",
  buyer: "c3000000-0000-4000-8000-0000000005c1",
  agentA: "a1000000-0000-4000-8000-0000000005a1",
  agentB: "b1000000-0000-4000-8000-0000000005b1",
} as const;
const DEAL_A = "da000000-0000-4000-8000-0000000005a1";
const DEAL_B = "db000000-0000-4000-8000-0000000005b1";
type Who = keyof typeof U | "anon";
const DENIED = /permission denied|row-level security|not_allowed|staff_only/;
const KEY = "fictional-server-key";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const visitor = (n: number) => sha(`visitor-${n}`);

interface Perf {
  linked: boolean;
  listing?: { standard_status: string; list_price: number };
  totals?: { views: number; saves: number; tour_requests: number; open_house_signins: number };
  weeks?: { week_start: string; views: number; saves: number; tour_requests: number; open_house_signins: number }[];
}

describe("seller portal data (0020–0021)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) =>
    who === "anon" ? t.as("anon", null, fn) : t.as("authenticated", U[who], fn);
  const perf = async (who: Who, deal: string) =>
    (await as(who, (q) => q<{ p: Perf }>(`select listing_performance($1) as p`, [deal])))[0]!.p;
  const view = (who: Who, listing: string, v: string, key: string | null = KEY) =>
    as(who, (q) => q<{ ok: boolean }>(`select record_listing_view($1, $2, $3) as ok`, [listing, v, key])).then((r) => r[0]!.ok);

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.agentA, { role: "agent" });
    await createUser(t, U.agentB, { role: "agent" });
    await createUser(t, U.sellerA, { role: "seller" });
    await createUser(t, U.sellerB, { role: "seller" });
    await createUser(t, U.buyer);
    await t.exec(`
      insert into mls_listings (listing_key, standard_status, list_price, city, county, list_office_mls_id, is_own_listing, address_display, modification_ts, data) values
        ('OWN-1', 'Active', 2850000, 'San Carlos', 'San Mateo', 'VAB', true, true, now(), '{"UnparsedAddress": "88 Fictional Dr, San Carlos, CA 94070"}'),
        ('OWN-2', 'Active', 1900000, 'Belmont', 'San Mateo', 'VAB', true, false, now(), '{"UnparsedAddress": "9 Hidden Ln, Belmont, CA 94002"}'),
        ('OTHER-1', 'Active', 1500000, 'Redwood City', 'San Mateo', 'EXRG', false, true, now(), '{}');
      insert into mls_open_houses (open_house_key, listing_key, open_house_date, start_time, end_time) values
        ('OH-TODAY', 'OWN-1', null, now(), now() + interval '2 hours'),
        ('OH-LATER', 'OWN-1', null, now() + interval '7 days', now() + interval '7 days 2 hours'),
        ('OH-OTHER', 'OTHER-1', null, now(), now() + interval '2 hours'),
        ('OH-HIDDEN', 'OWN-2', null, now(), now() + interval '2 hours');
      insert into deals (id, address, ratification_date, agent_id, created_by, listing_key) values
        ('${DEAL_A}', '88 Fictional Dr, San Carlos', current_date, '${U.agentA}', '${U.agentA}', 'OWN-1'),
        ('${DEAL_B}', '5 Sample Ct, Belmont', current_date, '${U.agentB}', '${U.agentB}', null);
      insert into deal_members (deal_id, profile_id, member_role) values
        ('${DEAL_A}', '${U.sellerA}', 'seller'), ('${DEAL_B}', '${U.sellerB}', 'seller');
      insert into saved_homes (profile_id, listing_key) values ('${U.buyer}', 'OWN-1'), ('${U.sellerB}', 'OWN-1');
      insert into leads (kind, email, listing_key) values ('tour', 'tour@example.test', 'OWN-1'), ('contact', 'c@example.test', 'OWN-1');
    `);
  });
  afterAll(() => t.close());

  describe("deals.listing_key", () => {
    it("staff on the deal set it; sellers can't", async () => {
      await as("sellerB", (q) => q(`update deals set listing_key = 'OWN-2' where id = $1`, [DEAL_B]));
      expect(await t.query(`select listing_key from deals where id = $1`, [DEAL_B])).toEqual([{ listing_key: null }]);
      await as("agentA", (q) => q(`update deals set listing_key = 'OWN-2' where id = $1`, [DEAL_B]));
      expect(await t.query(`select listing_key from deals where id = $1`, [DEAL_B])).toEqual([{ listing_key: null }]);
      const set = await as("agentB", async (q) => {
        await q(`update deals set listing_key = 'OWN-2' where id = $1`, [DEAL_B]);
        return q(`select listing_key from deals where id = $1`, [DEAL_B]);
      });
      expect(set).toEqual([{ listing_key: "OWN-2" }]);
    });

    it("rejects malformed keys", async () => {
      await expect(t.query(`update deals set listing_key = 'bad key; drop' where id = $1`, [DEAL_B])).rejects.toThrow(/check/);
    });
  });

  describe("listing views (review item 10)", () => {
    it("are refused without the server key, and before one is set", async () => {
      await expect(view("anon", "OWN-1", visitor(1))).rejects.toThrow(DENIED);
      await t.query(`insert into listing_view_keys (key_hash) values ($1)`, [sha(KEY)]);
      await expect(view("anon", "OWN-1", visitor(1), "guess")).rejects.toThrow(DENIED);
      await expect(view("anon", "OWN-1", visitor(1), null)).rejects.toThrow(DENIED);
    });

    it("aren't callable by signed-in users or readable by anyone", async () => {
      await expect(view("buyer", "OWN-1", visitor(1))).rejects.toThrow(/permission denied/);
      for (const who of ["anon", "buyer", "sellerA", "agentA"] as const) {
        for (const tbl of ["listing_views_daily", "listing_view_visitors", "listing_view_keys"]) {
          await expect(as(who, (q) => q(`select * from ${tbl}`)), `${who} ${tbl}`).rejects.toThrow(/permission denied/);
        }
        await expect(as(who, (q) => q(`insert into listing_views_daily (listing_key, day, views) values ('OWN-1', current_date, 999)`))).rejects.toThrow(/permission denied/);
      }
    });

    it("count once per visitor per listing per day, own listings only", async () => {
      expect(await view("anon", "OWN-1", visitor(1))).toBe(true); // the website's role may call it
      const rec = async (listing: string, v: string) =>
        (await t.query<{ ok: boolean }>(`select record_listing_view($1, $2, $3) as ok`, [listing, v, KEY]))[0]!.ok;
      expect(await rec("OWN-1", visitor(1))).toBe(true);
      expect(await rec("OWN-1", visitor(1))).toBe(false);
      expect(await rec("OWN-1", visitor(2))).toBe(true);
      expect(await rec("OTHER-1", visitor(1))).toBe(false);
      expect(await rec("OWN-1", "not-a-hash")).toBe(false);
      expect(await t.query(`select listing_key, views from listing_views_daily order by listing_key`)).toEqual([{ listing_key: "OWN-1", views: 2 }]);
    });

    it("cap each visitor at 50 listings a day", async () => {
      await t.exec(`insert into listing_view_visitors (day, visitor, listing_key)
        select (now() at time zone 'America/Los_Angeles')::date, '${visitor(9)}', 'X-' || g from generate_series(1, 50) g`);
      expect(await view("anon", "OWN-1", visitor(9))).toBe(false);
    });

    it("forget visitors after two days", async () => {
      await t.query(`insert into listing_view_visitors (day, visitor, listing_key) values (current_date - 5, $1, 'OWN-1')`, [visitor(7)]);
      await t.query(`select record_listing_view('OWN-2', $1, $2)`, [visitor(3), KEY]);
      expect(await t.query(`select count(*)::int as n from listing_view_visitors where day < current_date - 2`)).toEqual([{ n: 0 }]);
    });
  });

  describe("open-house sign-in links", () => {
    let token = "";

    it("only staff create them, only for Vabrato's own listings", async () => {
      await expect(as("sellerA", (q) => q(`select open_house_signin_link('OH-TODAY')`))).rejects.toThrow(DENIED);
      await expect(as("anon", (q) => q(`select open_house_signin_link('OH-TODAY')`))).rejects.toThrow(/permission denied/);
      await expect(as("agentB", (q) => q(`select open_house_signin_link('OH-OTHER')`))).rejects.toThrow(/not_found/);
      const [first, again, rows] = await as("agentB", async (q) => [
        (await q<{ t: string }>(`select open_house_signin_link('OH-TODAY') as t`))[0]!.t,
        (await q<{ t: string }>(`select open_house_signin_link('OH-TODAY') as t`))[0]!.t,
        await q<{ created_by: string }>(`select created_by from open_house_signin_links`),
      ] as const);
      expect(first).toMatch(/^[0-9a-f-]{36}$/);
      expect(again).toBe(first);
      expect(rows).toEqual([{ created_by: U.agentB }]);
      token = (await t.query<{ t: string }>(`insert into open_house_signin_links (open_house_key, created_by) values ('OH-TODAY', $1) returning token as t`, [U.agentB]))[0]!.t;
    });

    it("aren't readable by members or the public", async () => {
      expect(await as("sellerA", (q) => q(`select * from open_house_signin_links`))).toEqual([]);
      await expect(as("anon", (q) => q(`select * from open_house_signin_links`))).rejects.toThrow(/permission denied/);
      expect(await as("agentA", (q) => q(`select open_house_key from open_house_signin_links`))).toEqual([{ open_house_key: "OH-TODAY" }]);
    });

    it("show the event for a valid token only, street only when it may be shown", async () => {
      const info = await as("anon", (q) => q<{ street: string | null; city: string; accepting: boolean }>(`select street, city, accepting from open_house_signin_info($1)`, [token]));
      expect(info).toEqual([{ street: "88 Fictional Dr", city: "San Carlos", accepting: true }]);
      expect(await as("anon", (q) => q(`select * from open_house_signin_info(gen_random_uuid())`))).toEqual([]);
      const hidden = (await t.query<{ t: string }>(`insert into open_house_signin_links (open_house_key) values ('OH-HIDDEN') returning token as t`))[0]!.t;
      expect(await as("anon", (q) => q(`select street, city from open_house_signin_info($1)`, [hidden]))).toEqual([{ street: null, city: "Belmont" }]);
    });

    it("accept sign-ins on the day of the event as leads, with no IP hash", async () => {
      await as("anon", (q) => q(`select submit_open_house_signin($1, 'Anon Check', 'check@example.test', null, false, null)`, [token]));
      await t.query(`select submit_open_house_signin($1, ' Avery Sample ', 'Avery@Example.test', '', true, 'no')`, [token]);
      const rows = await t.query(`select kind, name, email, phone, listing_key, payload, consent_contact, ip_hash, tour_status from leads where kind = 'open_house_signin'`);
      expect(rows).toEqual([{ kind: "open_house_signin", name: "Avery Sample", email: "avery@example.test", phone: null, listing_key: "OWN-1", payload: { open_house_key: "OH-TODAY", has_agent: "no" }, consent_contact: true, ip_hash: null, tour_status: null }]);
      await expect(as("anon", (q) => q(`select submit_open_house_signin(gen_random_uuid(), 'X', 'x@example.test', null, false, null)`))).rejects.toThrow(/not_found/);
      await expect(as("anon", (q) => q(`select * from leads`))).rejects.toThrow(/permission denied/);
    });

    it("can't be inserted directly, without the link", async () => {
      for (const who of ["anon", "buyer"] as const) {
        await expect(as(who, (q) => q(`insert into leads (kind, email, listing_key) values ('open_house_signin', 'x@example.test', 'OWN-1')`)), who).rejects.toThrow(/row-level security/);
      }
      await as("anon", (q) => q(`insert into leads (kind, email) values ('contact', 'still-ok@example.test')`));
    });

    it("refuse sign-ins on other days", async () => {
      const later = (await t.query<{ t: string }>(`insert into open_house_signin_links (open_house_key) values ('OH-LATER') returning token as t`))[0]!.t;
      expect((await as("anon", (q) => q<{ accepting: boolean }>(`select accepting from open_house_signin_info($1)`, [later])))[0]!.accepting).toBe(false);
      await expect(as("anon", (q) => q(`select submit_open_house_signin($1, 'X', 'x@example.test', null, false, null)`, [later]))).rejects.toThrow(/signin_closed/);
    });

    it("are removed with the open house", async () => {
      await t.query(`delete from mls_open_houses where open_house_key = 'OH-LATER'`);
      expect(await t.query(`select count(*)::int as n from open_house_signin_links where open_house_key = 'OH-LATER'`)).toEqual([{ n: 0 }]);
    });
  });

  describe("listing_performance (SEC-1/SEC-2)", () => {
    it("gives the seller on the deal counts for their listing", async () => {
      const p = await perf("sellerA", DEAL_A);
      expect(p.linked).toBe(true);
      expect(p.listing).toEqual({ standard_status: "Active", list_price: 2850000 });
      expect(p.totals).toEqual({ views: 2, saves: 2, tour_requests: 1, open_house_signins: 1 });
      expect(p.weeks).toHaveLength(8);
      expect(p.weeks!.at(-1)).toMatchObject({ views: 2, saves: 2, tour_requests: 1, open_house_signins: 1 });
      expect(p.weeks!.slice(0, -1).every((w) => w.views + w.saves + w.tour_requests + w.open_house_signins === 0)).toBe(true);
      expect(Object.keys(p).sort()).toEqual(["linked", "listing", "listing_key", "totals", "weeks"]);
    });

    it("the deal's agent sees it too", async () => {
      expect((await perf("agentA", DEAL_A)).totals?.views).toBe(2);
    });

    it("nobody else does", async () => {
      for (const who of ["sellerB", "buyer", "agentB"] as const) {
        await expect(perf(who, DEAL_A), who).rejects.toThrow(DENIED);
      }
      await expect(perf("anon", DEAL_A)).rejects.toThrow(/permission denied/);
    });

    it("says when no listing is linked", async () => {
      expect(await perf("sellerB", DEAL_B)).toEqual({ linked: false });
    });
  });
});
