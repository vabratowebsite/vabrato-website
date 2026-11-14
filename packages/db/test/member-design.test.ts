import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S5b PR 6 (0041): the design switches, and flyers a seller sends to their
// agent. The agent approves one with our own listing (and maybe one of its
// open houses) or declines it with a note. SEC-1/SEC-2: one member never sees
// another's flyers. All people, listings and data are fictional.

const U = {
  sellerA: "e2000000-0000-4000-8000-0000000041e1", // agentA's client
  sellerB: "e2000000-0000-4000-8000-0000000041e2",
  buyer: "f1000000-0000-4000-8000-0000000041f1",
  agentA: "a1000000-0000-4000-8000-0000000041a1",
  agentB: "b1000000-0000-4000-8000-0000000041b1",
  admin: "d0000000-0000-4000-8000-0000000041d1",
} as const;
type Who = keyof typeof U | "anon";
const DENIED = /permission denied|row-level security/;
const OWN = "QA-DESIGN-OWN";
const OTHER = "QA-DESIGN-OTHER";

describe("member design (0041)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) => (who === "anon" ? t.as("anon", null, fn) : t.as("authenticated", U[who], fn));
  const act = async <T>(who: keyof typeof U, sql: string, params: unknown[] = []) => {
    await t.query(`select set_config('request.jwt.claim.sub', $1, false)`, [U[who]]);
    await t.exec(`set role authenticated`);
    try {
      return await t.query<T>(sql, params);
    } finally {
      await t.exec(`reset role`);
      await t.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  };
  const send = (q: Query, profile: string, headline = "Sunny open house this Sunday") =>
    q<{ id: string }>(`insert into member_promos (profile_id, kind, headline, highlights, instagram) values ($1, 'open_house', $2, 'Big yard\nNew kitchen', 'Come see it') returning id`, [profile, headline]);
  const seed = async (profile: string) => (await send(t.query.bind(t) as Query, profile))[0]!.id;

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.agentA, { role: "agent" });
    await createUser(t, U.agentB, { role: "agent" });
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.sellerA, { role: "seller" });
    await createUser(t, U.sellerB, { role: "seller" });
    await createUser(t, U.buyer);
    await t.exec(`
      update profiles set agent_id = '${U.agentA}' where id = '${U.sellerA}';
      insert into mls_listings (listing_key, standard_status, is_own_listing, modification_ts, data) values ('${OWN}', 'Active', true, now(), '{}'), ('${OTHER}', 'Active', false, now(), '{}');
      insert into mls_open_houses (open_house_key, listing_key, open_house_date, start_time, end_time) values
        ('QA-OH-NEXT', '${OWN}', current_date + 3, now() + interval '3 days', now() + interval '3 days 2 hours'),
        ('QA-OH-PAST', '${OWN}', current_date - 3, now() - interval '3 days', now() - interval '3 days' + interval '2 hours'),
        ('QA-OH-OTHER', '${OTHER}', current_date + 3, now() + interval '3 days', now() + interval '3 days 2 hours');
    `);
  });
  afterAll(() => t.close());
  beforeEach(() => t.exec(`delete from member_promos; delete from staff_notifications; delete from staff_audit;`));

  it("adds the three switches, off, none behind the MLSListings approval", async () => {
    expect(await t.query(`select key, enabled from feature_flags where key in ('ai_member_palette', 'ai_member_staging', 'ai_member_flyer') order by key`)).toEqual([
      { key: "ai_member_flyer", enabled: false },
      { key: "ai_member_palette", enabled: false },
      { key: "ai_member_staging", enabled: false },
    ]);
    await act("admin", `select set_ai_flag('ai_member_flyer', true)`);
    await act("admin", `select set_ai_flag('ai_member_palette', true)`);
    expect(await t.query(`select count(*)::int as n from feature_flags where key in ('ai_member_flyer', 'ai_member_palette') and enabled`)).toEqual([{ n: 2 }]);
    await t.exec(`update feature_flags set enabled = false where key in ('ai_member_flyer', 'ai_member_palette')`);
  });

  describe("sending a flyer", () => {
    it("a seller sends one for themselves; it waits, and their agent hears once", async () => {
      await act("sellerA", `insert into member_promos (kind, headline) values ('open_house', 'One'), ('just_listed', 'Two')`);
      expect(await t.query(`select headline, status, profile_id from member_promos order by headline`)).toEqual([
        { headline: "One", status: "pending", profile_id: U.sellerA },
        { headline: "Two", status: "pending", profile_id: U.sellerA },
      ]);
      expect(await t.query(`select recipient_id, kind, ref_id from staff_notifications`)).toEqual([{ recipient_id: U.agentA, kind: "member_promo", ref_id: U.sellerA }]);
      expect((await t.query<{ title: string }>(`select title from staff_notifications`))[0]!.title).toMatch(/^Flyer to approve from /);
    });

    it("never for someone else, never by a buyer, staff or the public, never already decided", async () => {
      await expect(as("sellerA", (q) => send(q, U.sellerB))).rejects.toThrow(DENIED);
      await expect(as("buyer", (q) => send(q, U.buyer))).rejects.toThrow(DENIED);
      await expect(as("agentA", (q) => send(q, U.agentA))).rejects.toThrow(DENIED);
      await expect(as("anon", (q) => send(q, U.sellerA))).rejects.toThrow(DENIED);
      await expect(as("sellerA", (q) => q(`insert into member_promos (kind, headline, status) values ('open_house', 'x', 'approved')`))).rejects.toThrow(DENIED);
      await expect(as("sellerA", (q) => q(`insert into member_promos (kind, headline, listing_key) values ('open_house', 'x', $1)`, [OWN]))).rejects.toThrow(DENIED);
    });

    it("lengths are checked; at most 20 per member", async () => {
      await expect(as("sellerA", (q) => send(q, U.sellerA, "x".repeat(81)))).rejects.toThrow(/check constraint/);
      await t.exec(`insert into member_promos (profile_id, kind, headline) select '${U.sellerA}', 'open_house', 'item ' || g from generate_series(1, 20) g`);
      await expect(as("sellerA", (q) => send(q, U.sellerA))).rejects.toThrow(/too_many_flyers/);
      expect((await as("sellerB", (q) => send(q, U.sellerB))).length).toBe(1);
    });
  });

  describe("who sees what", () => {
    it("the member and their staff only", async () => {
      await seed(U.sellerA);
      await seed(U.sellerB);
      const count = (who: Who) => as(who, (q) => q<{ n: number }>(`select count(*)::int as n from member_promos`)).then((r) => r[0]!.n);
      expect(await count("sellerA")).toBe(1);
      expect(await count("sellerB")).toBe(1);
      expect(await count("buyer")).toBe(0);
      await expect(count("anon")).rejects.toThrow(DENIED);
      expect(await count("agentA")).toBe(1); // sellerA's agent, not sellerB's
      expect(await count("agentB")).toBe(0);
      expect(await count("admin")).toBe(2);
    });

    it("nobody changes a flyer directly", async () => {
      const id = await seed(U.sellerA);
      await expect(as("sellerA", (q) => q(`update member_promos set headline = 'x' where id = $1`, [id]))).rejects.toThrow(DENIED);
      await expect(as("agentA", (q) => q(`update member_promos set status = 'approved', listing_key = $2 where id = $1`, [id, OWN]))).rejects.toThrow(DENIED);
    });
  });

  describe("the agent's decision", () => {
    it("approves with our own listing and one of its upcoming open houses (audited)", async () => {
      const id = await seed(U.sellerA);
      await act("agentA", `select decide_member_promo($1, true, $2, 'QA-OH-NEXT')`, [id, OWN]);
      expect(await t.query(`select status, listing_key, open_house_key, decided_by from member_promos`)).toEqual([{ status: "approved", listing_key: OWN, open_house_key: "QA-OH-NEXT", decided_by: U.agentA }]);
      expect(await t.query(`select action, ref_id from staff_audit`)).toEqual([{ action: "approve_member_promo", ref_id: id }]);
      // Decided once only, and the words are frozen.
      await expect(act("agentA", `select decide_member_promo($1, false)`, [id])).rejects.toThrow(/not_found/);
      await expect(t.query(`update member_promos set headline = 'x' where id = $1`, [id])).rejects.toThrow(/flyer_fixed_fields/);
    });

    it("refuses another brokerage's listing, another listing's or a past open house", async () => {
      const id = await seed(U.sellerA);
      await expect(act("agentA", `select decide_member_promo($1, true, $2)`, [id, OTHER])).rejects.toThrow(/not_our_listing/);
      await expect(act("agentA", `select decide_member_promo($1, true, null)`, [id])).rejects.toThrow(/not_our_listing/);
      await expect(act("agentA", `select decide_member_promo($1, true, $2, 'QA-OH-OTHER')`, [id, OWN])).rejects.toThrow(/not_this_open_house/);
      await expect(act("agentA", `select decide_member_promo($1, true, $2, 'QA-OH-PAST')`, [id, OWN])).rejects.toThrow(/not_this_open_house/);
      // Without an open house is fine.
      await act("agentA", `select decide_member_promo($1, true, $2)`, [id, OWN]);
      expect(await t.query(`select status, open_house_key from member_promos`)).toEqual([{ status: "approved", open_house_key: null }]);
    });

    it("declines with a note the member reads", async () => {
      const id = await seed(U.sellerA);
      await act("agentA", `select decide_member_promo($1, false, null, null, '  Please drop the second line.  ')`, [id]);
      expect(await as("sellerA", (q) => q(`select status, decline_note, listing_key from member_promos`))).toEqual([{ status: "declined", decline_note: "Please drop the second line.", listing_key: null }]);
    });

    it("only staff who can see the member; never the member, never the public", async () => {
      const id = await seed(U.sellerA);
      await expect(act("agentB", `select decide_member_promo($1, true, $2)`, [id, OWN])).rejects.toThrow(/not_found/);
      await expect(act("sellerA", `select decide_member_promo($1, true, $2)`, [id, OWN])).rejects.toThrow(/staff_only/);
      await expect(as("anon", (q) => q(`select decide_member_promo($1, true, $2)`, [id, OWN]))).rejects.toThrow(/permission denied/);
      await act("admin", `select decide_member_promo($1, true, $2)`, [id, OWN]);
    });
  });

  describe("deleting", () => {
    it("the member deletes waiting or declined flyers, not approved ones", async () => {
      const waiting = await seed(U.sellerA);
      const declined = await seed(U.sellerA);
      const approved = await seed(U.sellerA);
      await act("agentA", `select decide_member_promo($1, false)`, [declined]);
      await act("agentA", `select decide_member_promo($1, true, $2)`, [approved, OWN]);
      await act("sellerA", `delete from member_promos where id in ($1, $2, $3)`, [waiting, declined, approved]);
      expect(await t.query(`select id from member_promos`)).toEqual([{ id: approved }]);
      // Another member can't delete it either.
      await act("sellerB", `delete from member_promos`);
      expect(await t.query(`select count(*)::int as n from member_promos`)).toEqual([{ n: 1 }]);
    });

    it("declined flyers go 30 days after the decision; the rest stay", async () => {
      const old = await seed(U.sellerA);
      const recent = await seed(U.sellerA);
      await seed(U.sellerA);
      await act("agentA", `select decide_member_promo($1, false)`, [old]);
      await act("agentA", `select decide_member_promo($1, false)`, [recent]);
      // The guard freezes decided rows, so age it with the trigger off.
      await t.exec(`alter table member_promos disable trigger member_promos_guard`);
      await t.query(`update member_promos set decided_at = now() - interval '31 days' where id = $1`, [old]);
      await t.exec(`alter table member_promos enable trigger member_promos_guard`);
      expect(await t.query(`select public.purge_member_drafts() as n`)).toEqual([{ n: 1 }]);
      expect(await t.query(`select count(*)::int as n from member_promos`)).toEqual([{ n: 2 }]);
      await expect(as("sellerA", (q) => q(`select public.purge_member_drafts()`))).rejects.toThrow(/permission denied/);
    });

    it("'Delete my assistant data' removes all of the member's flyers, nobody else's", async () => {
      const approved = await seed(U.sellerA);
      await act("agentA", `select decide_member_promo($1, true, $2)`, [approved, OWN]);
      await seed(U.sellerA);
      await seed(U.sellerB);
      expect(await act("sellerA", `select public.delete_my_assistant_data() as n`)).toEqual([{ n: 2 }]);
      expect(await t.query(`select profile_id from member_promos`)).toEqual([{ profile_id: U.sellerB }]);
    });
  });
});
