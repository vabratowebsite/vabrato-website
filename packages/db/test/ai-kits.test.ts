import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S6b PR 5 (0030): launch kits and presentations in ai_drafts. Who may
// start, see and change them, the target rule per kind, frozen content, and
// that the lead and deal drafts from 0028 behave as before. Fictional
// people and listings.

const U = {
  admin: "a1000000-0000-4000-8000-0000000030a1",
  agent: "c1000000-0000-4000-8000-0000000030c1",
  agent2: "c2000000-0000-4000-8000-0000000030c2",
  buyer: "f1000000-0000-4000-8000-0000000030f1",
} as const;
type Who = keyof typeof U | "anon";
const OWN = "QA-OWN-1";
const OTHER = "QA-OTHER-1";
const KIT = { mls_description: "Sunny three-bedroom home.", headline: "Light-filled in San Carlos" };

describe("launch kits and presentations (0030)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) => t.as(who === "anon" ? "anon" : "authenticated", who === "anon" ? null : U[who], fn);
  const insert = (q: Query, cols: Record<string, unknown>) => {
    const keys = Object.keys(cols);
    return q<{ id: string }>(`insert into ai_drafts (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(cols));
  };
  const kit = (q: Query, listing = OWN) => insert(q, { kind: "listing_kit", listing_key: listing, subject: "Launch kit", body: "Sunny three-bedroom home.", content: JSON.stringify(KIT) });
  const seed = async (owner: string, cols: Record<string, unknown>) =>
    (await t.query<{ id: string }>(`insert into ai_drafts (owner_id, body, ${Object.keys(cols).join(", ")}) values ($1, 'Text', ${Object.keys(cols).map((_, i) => `$${i + 2}`).join(", ")}) returning id`, [owner, ...Object.values(cols)]))[0]!.id;

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.agent2, { role: "agent" });
    await createUser(t, U.buyer);
    await t.query(`insert into mls_listings (listing_key, standard_status, is_own_listing, modification_ts, data) values ($1, 'Active', true, now(), '{}'), ($2, 'Active', false, now(), '{}')`, [OWN, OTHER]);
  });
  afterAll(() => t.close());
  beforeEach(() => t.exec(`delete from ai_drafts`));

  it("adds the two switches, off", async () => {
    expect(await t.query(`select key, enabled from feature_flags where key in ('ai_staff_listing_kit', 'ai_staff_presentations') order by key`)).toEqual([
      { key: "ai_staff_listing_kit", enabled: false },
      { key: "ai_staff_presentations", enabled: false },
    ]);
  });

  describe("starting one", () => {
    it("staff start a kit for one of our listings, and presentations", async () => {
      expect(await as("agent", (q) => kit(q))).toHaveLength(1);
      expect(await as("agent", (q) => insert(q, { kind: "listing_presentation", subject: "For Dana", body: "Intro", content: '{"sections":[]}' }))).toHaveLength(1);
      expect(await as("agent2", (q) => insert(q, { kind: "buyer_presentation", subject: "For Jordan", body: "Intro", content: '{"sections":[]}' }))).toHaveLength(1);
    });

    it("not for another brokerage's listing, not for members or the public", async () => {
      await expect(as("agent", (q) => kit(q, OTHER))).rejects.toThrow(/row-level security/);
      await expect(as("buyer", (q) => insert(q, { kind: "buyer_presentation", body: "x", content: "{}" }))).rejects.toThrow(/row-level security/);
      await expect(as("anon", (q) => kit(q))).rejects.toThrow(/permission denied/);
    });

    it("each kind points at what it's about", async () => {
      // A kit with no listing fails the row-level check before the constraint; either way it's refused.
      await expect(as("agent", (q) => insert(q, { kind: "listing_kit", body: "x", content: "{}" }))).rejects.toThrow(/check constraint|row-level security/);
      await expect(as("agent", (q) => insert(q, { kind: "listing_kit", listing_key: OWN, body: "x" }))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => insert(q, { kind: "buyer_presentation", listing_key: OWN, body: "x", content: "{}" }))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => insert(q, { kind: "listing_presentation", body: "x", content: "[1]" }))).rejects.toThrow(/check constraint/);
    });
  });

  describe("who sees one", () => {
    it("the owner; admins only once approved; never another agent, members or the public", async () => {
      const id = await seed(U.agent, { kind: "listing_kit", listing_key: OWN, content: JSON.stringify(KIT) });
      expect(await as("agent", (q) => q(`select id from ai_drafts`))).toHaveLength(1);
      expect(await as("admin", (q) => q(`select id from ai_drafts`))).toHaveLength(0);
      await t.query(`update ai_drafts set status = 'approved' where id = $1`, [id]);
      expect(await as("admin", (q) => q(`select id from ai_drafts`))).toHaveLength(1);
      expect(await as("agent2", (q) => q(`select id from ai_drafts`))).toHaveLength(0);
      expect(await as("buyer", (q) => q(`select id from ai_drafts`))).toHaveLength(0);
      await expect(as("anon", (q) => q(`select id from ai_drafts`))).rejects.toThrow(/permission denied/);
    });

    it("another agent can't change it", async () => {
      const id = await seed(U.agent, { kind: "buyer_presentation", content: "{}" });
      expect(await as("agent2", (q) => q(`update ai_drafts set body = 'mine now' where id = $1 returning id`, [id]))).toHaveLength(0);
    });
  });

  describe("draft, approve, print", () => {
    it("content can be edited as a draft, is frozen once approved, and can then be printed", async () => {
      const id = await seed(U.agent, { kind: "listing_kit", listing_key: OWN, content: JSON.stringify(KIT) });
      await expect(as("agent", (q) => q(`update ai_drafts set sent_via = 'print' where id = $1`, [id]))).rejects.toThrow(/draft_not_approved/);
      await as("agent", (q) => q(`update ai_drafts set content = $2 where id = $1`, [id, JSON.stringify({ ...KIT, headline: "Edited" })]));
      await t.query(`update ai_drafts set content = $2, status = 'approved' where id = $1`, [id, JSON.stringify({ ...KIT, headline: "Edited" })]);
      await expect(as("agent", (q) => q(`update ai_drafts set content = '{"headline":"sneaky"}' where id = $1`, [id]))).rejects.toThrow(/draft_closed/);
      const used = await as("agent", async (q) => {
        await q(`update ai_drafts set sent_via = 'print' where id = $1`, [id]);
        return q<{ sent_via: string; headline: string }>(`select sent_via, content->>'headline' as headline from ai_drafts where id = $1`, [id]);
      });
      expect(used).toEqual([{ sent_via: "print", headline: "Edited" }]);
    });

    it("the listing can't be swapped, and a purged listing takes its kit", async () => {
      await t.query(`insert into mls_listings (listing_key, standard_status, is_own_listing, modification_ts) values ('QA-OWN-2', 'Active', true, now())`);
      const id = await seed(U.agent, { kind: "listing_kit", listing_key: "QA-OWN-2", content: "{}" });
      await expect(t.query(`update ai_drafts set listing_key = $2 where id = $1`, [id, OWN])).rejects.toThrow(/draft_fixed_fields/);
      await t.query(`delete from mls_listings where listing_key = 'QA-OWN-2'`);
      expect(await t.query(`select count(*)::int as n from ai_drafts where id = $1`, [id])).toEqual([{ n: 0 }]);
    });

    it("the 30-day purge covers kits and presentations", async () => {
      const old = await seed(U.agent, { kind: "buyer_presentation", content: "{}" });
      await t.exec(`alter table ai_drafts disable trigger ai_drafts_guard`);
      await t.query(`update ai_drafts set updated_at = now() - interval '31 days' where id = $1`, [old]);
      await t.exec(`alter table ai_drafts enable trigger ai_drafts_guard`);
      expect(await t.query(`select public.purge_ai_drafts() as n`)).toEqual([{ n: 1 }]);
    });
  });

  it("lead and deal drafts from 0028 still can't be written without a lead or deal the person works", async () => {
    await expect(as("agent", (q) => insert(q, { kind: "lead_reply", body: "x" }))).rejects.toThrow(/check constraint|row-level security/);
    await expect(as("agent", (q) => insert(q, { kind: "lead_reply", listing_key: OWN, body: "x" }))).rejects.toThrow(/check constraint|row-level security/);
  });
});
