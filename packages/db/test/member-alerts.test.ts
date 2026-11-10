import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S5 PR 3 (0018): run_member_alerts() matching, data level (review item 3),
// email queueing and digests, unsubscribe (review item 15), cleanup (review
// item 5), and RLS on alert_deliveries (SEC-1/SEC-2). Fictional data only.

const U = {
  buyer: "a2000000-0000-4000-8000-00000000a001", // opted in, instant search + saved home
  quiet: "b2000000-0000-4000-8000-00000000b001", // opted out
  digest: "c2000000-0000-4000-8000-00000000c001", // opted in, daily search
  agent: "a1000000-0000-4000-8000-00000000a001", // assigned to buyer
  other: "b1000000-0000-4000-8000-00000000b001",
} as const;
type Who = keyof typeof U | "anon";
const DENIED = /permission denied|row-level security/;
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe("member alerts (0018)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) =>
    who === "anon" ? t.as("anon", null, fn) : t.as("authenticated", U[who], fn);
  const run = async (now?: string) =>
    (await t.query<{ r: Record<string, unknown> }>(`select public.run_member_alerts(${now ? `'${now}'::timestamptz` : "now()"}) as r`))[0]!.r;
  const listing = (key: string, city: string, price: number, opts: { beds?: number; hidden?: boolean; onMarket?: string; status?: string; office?: string } = {}) =>
    t.query(
      `insert into mls_listings (listing_key, standard_status, list_price, city, county, list_office_mls_id, list_office_name, is_own_listing, address_display, bedrooms_total, modification_ts, data)
       values ($1, $2, $3, $4, 'San Mateo', 'EXRG', $5, false, $6, $7, now(), $8)`,
      [key, opts.status ?? "Active", price, city, opts.office ?? "Example Realty", !opts.hidden, opts.beds ?? 3,
        JSON.stringify({ StreetNumber: "1", StreetName: key.toLowerCase(), StreetSuffix: "St", OnMarketDate: opts.onMarket ?? iso(Date.now()) })],
    );
  const event = (key: string, price: number, status = "Active") =>
    t.query(`insert into mls_price_events (listing_key, list_price, standard_status, observed_at) values ($1, $2, $3, now())`, [key, price, status]);

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.other, { role: "agent" });
    for (const id of [U.buyer, U.quiet, U.digest]) await createUser(t, id);
    await t.exec(`
      update profiles set full_name = 'Jordan Example', alerts_email_opt_in = true, agent_id = '${U.agent}' where id = '${U.buyer}';
      update profiles set alerts_email_opt_in = true where id = '${U.digest}';
    `);
    // Existing listings and their first events, before the first alert run.
    await listing("L-SAVED", "San Carlos", 2000000);
    await listing("L-OLD", "San Carlos", 1500000, { onMarket: iso(Date.now() - 40 * DAY) });
    await event("L-SAVED", 2000000);
    await event("L-OLD", 1500000);
    await t.exec(`
      insert into saved_homes (profile_id, listing_key) values ('${U.buyer}', 'L-SAVED'), ('${U.quiet}', 'L-SAVED');
      insert into saved_searches (profile_id, name, criteria, frequency) values
        ('${U.buyer}', 'San Carlos 3bd+', '{"city":"san-carlos","beds":"3"}', 'instant'),
        ('${U.buyer}', 'Los Gatos', '{"city":"los-gatos"}', 'instant'),
        ('${U.quiet}', 'Quiet San Carlos', '{"city":"san-carlos"}', 'instant'),
        ('${U.digest}', 'Digest San Carlos', '{"city":"san-carlos"}', 'daily');
    `);
  });
  afterAll(() => t.close());

  it("the first run only sets the cursor (no alerts for the initial load)", async () => {
    expect(await run()).toEqual({ initialized: true });
    expect(await t.query(`select * from alert_deliveries`)).toEqual([]);
  });

  describe("after a feed change", () => {
    beforeAll(async () => {
      await listing("L-NEW", "San Carlos", 1800000); // new, 3 bd, on market today
      await listing("L-NEW-SMALL", "San Carlos", 900000, { beds: 1 }); // new but under the 3bd filter
      await listing("L-HIDDEN", "Los Gatos", 2500000, { hidden: true }); // new, address withheld
      await event("L-NEW", 1800000);
      await event("L-NEW-SMALL", 900000);
      await event("L-HIDDEN", 2500000);
      await event("L-SAVED", 1900000); // price drop on a saved home
      await event("L-OLD", 1450000); // price drop on a home nobody saved
      await run("2026-11-10T15:00:00Z");
    });

    const deliveries = (who: keyof typeof U) =>
      t.query<{ listing_key: string; kind: string; new_price: string; search: string | null }>(
        `select d.listing_key, d.kind, d.new_price::int::text as new_price, s.name as search from alert_deliveries d left join saved_searches s on s.id = d.saved_search_id
         where d.profile_id = $1 order by d.listing_key`,
        [U[who]],
      );

    it("matches new listings to saved searches and price changes to saved homes", async () => {
      expect(await deliveries("buyer")).toEqual([
        { listing_key: "L-HIDDEN", kind: "new_match", new_price: "2500000", search: "Los Gatos" },
        { listing_key: "L-NEW", kind: "new_match", new_price: "1800000", search: "San Carlos 3bd+" },
        { listing_key: "L-SAVED", kind: "price_drop", new_price: "1900000", search: null },
      ]);
    });

    it("records the feed for opted-out members too, but emails only opted-in ones", async () => {
      expect((await deliveries("quiet")).map((d) => d.listing_key)).toEqual(["L-NEW", "L-NEW-SMALL", "L-SAVED"]);
      const emails = await t.query<{ recipient_profile_id: string; template_key: string }>(`select recipient_profile_id, template_key from notifications`);
      expect(emails).toEqual([{ recipient_profile_id: U.buyer, template_key: "buyer_alert_instant" }]);
    });

    it("queues one instant email with IDX-only items: no previous price, hidden street withheld, broker shown", async () => {
      const [n] = await t.query<{ payload: { items: Record<string, unknown>[]; first_name: string; more: number; unsubscribe_token: string }; send_at: string }>(
        `select payload, send_at from notifications where recipient_profile_id = $1`,
        [U.buyer],
      );
      expect(n!.payload.first_name).toBe("Jordan");
      expect(n!.payload.more).toBe(0);
      expect(n!.payload.unsubscribe_token).toMatch(/^[0-9a-f-]{36}$/);
      const byPath = Object.fromEntries(n!.payload.items.map((i) => [i.path, i]));
      expect(byPath["/listing/L-HIDDEN"]).toMatchObject({ title: "Home in Los Gatos", kind: "new_match", price: 2500000, broker: "Example Realty" });
      expect(byPath["/listing/L-SAVED"]).toMatchObject({ title: "1 l-saved St", kind: "price_drop", price: 1900000 });
      const json = JSON.stringify(n!.payload);
      expect(json).not.toMatch(/2000000|previous|old_price|close/i);
      expect(json).not.toMatch(/l-hidden St/);
    });

    it("never alerts on homes first seen long after they listed (backfill guard)", async () => {
      expect(await t.query(`select * from alert_deliveries where listing_key = 'L-OLD'`)).toEqual([]);
    });

    it("is idempotent: a second run adds nothing and sends nothing new", async () => {
      expect(await run("2026-11-10T15:05:00Z")).toMatchObject({ deliveries: 0, instant_emails: 0 });
      expect(await t.query(`select count(*)::int as n from notifications`)).toEqual([{ n: 1 }]);
    });

    it("sends the daily digest once, after 16:00 UTC", async () => {
      expect(await t.query(`select count(*)::int as n from notifications where template_key = 'buyer_alert_digest'`)).toEqual([{ n: 0 }]);
      expect(await run("2026-11-10T16:30:00Z")).toMatchObject({ digest_emails: 1 });
      expect(await run("2026-11-10T18:00:00Z")).toMatchObject({ digest_emails: 0 });
      const [d] = await t.query<{ recipient_profile_id: string; items: number }>(
        `select recipient_profile_id, jsonb_array_length(payload->'items') as items from notifications where template_key = 'buyer_alert_digest'`,
      );
      expect(d).toEqual({ recipient_profile_id: U.digest, items: 2 });
    });

    it("never alerts on sold or off-market changes (no VOW data in alerts)", async () => {
      await event("L-SAVED", 1950000, "Closed");
      await t.query(`update mls_listings set standard_status = 'Closed' where listing_key = 'L-SAVED'`);
      expect(await run("2026-11-10T19:00:00Z")).toMatchObject({ deliveries: 0 });
    });
  });

  describe("RLS on alert_deliveries (SEC-2)", () => {
    const keys = async (who: Who) => (await as(who, (q) => q<{ k: string }>(`select distinct profile_id::text as k from alert_deliveries`))).map((r) => r.k).sort();

    it.each<[Who, string[]]>([
      ["buyer", [U.buyer]],
      ["quiet", [U.quiet]],
      ["agent", [U.buyer]], // assigned agent
      ["other", []],
    ])("%s sees only the deliveries they may see", async (who, expected) => {
      expect(await keys(who)).toEqual(expected);
    });

    it("anon reads nothing; members can't write deliveries", async () => {
      await expect(as("anon", (q) => q(`select * from alert_deliveries`))).rejects.toThrow(DENIED);
      await expect(
        as("buyer", (q) => q(`insert into alert_deliveries (profile_id, listing_key, kind, price_event_id) values ('${U.buyer}', 'L-NEW', 'new_match', 1)`)),
      ).rejects.toThrow(DENIED);
      await expect(as("buyer", (q) => q(`update alert_deliveries set seen_at = now()`))).rejects.toThrow(DENIED);
    });

    it("mark_alerts_seen marks only the caller's own feed", async () => {
      await as("buyer", async (q) => {
        expect((await q<{ n: number }>(`select public.mark_alerts_seen() as n`))[0]!.n).toBe(3);
        await q(`set local role postgres`);
        expect(await q(`select count(*)::int as n from alert_deliveries where profile_id = '${U.quiet}' and seen_at is not null`)).toEqual([{ n: 0 }]);
      });
    });

    it("only the sync job can run or purge alerts", async () => {
      await expect(as("buyer", (q) => q(`select public.run_member_alerts()`))).rejects.toThrow(/permission denied/);
      await expect(as("anon", (q) => q(`select public.purge_member_alert_data(true)`))).rejects.toThrow(/permission denied/);
      await expect(as("agent", (q) => q(`select public.listing_matches_criteria('L-NEW', '{}')`))).rejects.toThrow(/permission denied/);
    });
  });

  describe("unsubscribe (review item 15)", () => {
    it("works signed out with the member's token, cancels queued alert emails, and ignores unknown tokens", async () => {
      await t.query(`insert into notifications (recipient_profile_id, template_key, payload, send_at) values ($1, 'buyer_alert_instant', '{}', now() + interval '1 hour')`, [U.buyer]);
      const [{ token }] = (await t.query<{ token: string }>(`select alerts_unsubscribe_token::text as token from profiles where id = $1`, [U.buyer])) as [{ token: string }];
      await as("anon", async (q) => {
        expect(await q(`select public.unsubscribe_alert_emails('00000000-0000-4000-8000-000000000000') as ok`)).toEqual([{ ok: false }]);
        expect(await q(`select public.unsubscribe_alert_emails('${token}') as ok`)).toEqual([{ ok: true }]);
        await q(`set local role postgres`);
        expect(await q(`select alerts_email_opt_in from profiles where id = '${U.buyer}'`)).toEqual([{ alerts_email_opt_in: false }]);
        expect(await q(`select count(*)::int as n from notifications where recipient_profile_id = '${U.buyer}' and status = 'scheduled'`)).toEqual([{ n: 0 }]);
      });
    });
  });

  describe("cleanup (review item 5)", () => {
    it("deletes deliveries and alert emails older than 90 days, and deliveries go with their listing", async () => {
      await t.query(`update alert_deliveries set created_at = now() - interval '100 days' where listing_key = 'L-NEW-SMALL'`);
      await t.query(`update notifications set created_at = now() - interval '100 days' where template_key = 'buyer_alert_digest'`);
      expect(await t.query(`select public.purge_member_alert_data() as r`)).toEqual([{ r: { deliveries: 2, emails: 1 } }]); // the quiet and digest members both had L-NEW-SMALL
      await t.query(`delete from mls_listings where listing_key = 'L-HIDDEN'`);
      expect(await t.query(`select count(*)::int as n from alert_deliveries where listing_key = 'L-HIDDEN'`)).toEqual([{ n: 0 }]);
    });

    it("purges everything for MLS-9", async () => {
      await t.query(`select public.purge_member_alert_data(true)`);
      expect(await t.query(`select count(*)::int as n from alert_deliveries`)).toEqual([{ n: 0 }]);
      expect(await t.query(`select count(*)::int as n from notifications where template_key like 'buyer_alert%'`)).toEqual([{ n: 0 }]);
    });
  });
});
