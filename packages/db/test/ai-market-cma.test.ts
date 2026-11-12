import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S6b PR 6 (0031): market updates and CMA write-ups in ai_drafts. Who may
// start, see and send them, and that they follow the sold-data switches.
// Fictional people.

const U = {
  admin: "a1000000-0000-4000-8000-0000000031a1",
  agent: "c1000000-0000-4000-8000-0000000031c1",
  agent2: "c2000000-0000-4000-8000-0000000031c2",
  buyer: "f1000000-0000-4000-8000-0000000031f1",
} as const;
type Who = keyof typeof U | "anon";
const CMA = "00000000-0000-4000-8000-0000000031b1";
const CMA2 = "00000000-0000-4000-8000-0000000031b2";

describe("market updates and CMA write-ups (0031)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) => t.as(who === "anon" ? "anon" : "authenticated", who === "anon" ? null : U[who], fn);
  const insert = (q: Query, cols: Record<string, unknown>) => {
    const keys = Object.keys(cols);
    return q<{ id: string }>(`insert into ai_drafts (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(cols));
  };
  const update = (cma = CMA) => ({ kind: "cma_writeup", cma_id: cma, body: "Summary", content: '{"summary":"Comparable sales"}' });
  const market = { kind: "market_update", body: "Update", content: '{"title":"San Carlos in October"}' };
  const flag = (key: string, on: boolean) => t.query(`update feature_flags set enabled = $2 where key = $1`, [key, on]);
  const seed = async (owner: string, cols: Record<string, unknown>) =>
    (await t.query<{ id: string }>(`insert into ai_drafts (owner_id, body, ${Object.keys(cols).join(", ")}) values ($1, 'Text', ${Object.keys(cols).map((_, i) => `$${i + 2}`).join(", ")}) returning id`, [owner, ...Object.values(cols)]))[0]!.id;

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.agent2, { role: "agent" });
    await createUser(t, U.buyer);
    await t.query(`insert into cmas (id, created_by, title) values ($1, $2, 'QA CMA one'), ($3, $4, 'QA CMA two')`, [CMA, U.agent, CMA2, U.agent2]);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.exec(`delete from ai_drafts`);
    await flag("market_stats_enabled", true);
    await flag("cma_enabled", true);
  });

  it("adds the two switches, off", async () => {
    expect(await t.query(`select key, enabled from feature_flags where key in ('ai_staff_market_update', 'ai_staff_cma_writeup') order by key`)).toEqual([
      { key: "ai_staff_cma_writeup", enabled: false },
      { key: "ai_staff_market_update", enabled: false },
    ]);
  });

  describe("starting one", () => {
    it("a market update while market stats are on; a write-up for a CMA the person can read while CMAs are on", async () => {
      expect(await as("agent", (q) => insert(q, market))).toHaveLength(1);
      expect(await as("agent", (q) => insert(q, update()))).toHaveLength(1);
      expect(await as("admin", (q) => insert(q, update(CMA2)))).toHaveLength(1);
    });

    it("not for someone else's CMA, and not while the sold-data switches are off", async () => {
      await expect(as("agent", (q) => insert(q, update(CMA2)))).rejects.toThrow(/row-level security/);
      await flag("market_stats_enabled", false);
      await expect(as("agent", (q) => insert(q, market))).rejects.toThrow(/row-level security/);
      await flag("cma_enabled", false);
      await expect(as("agent", (q) => insert(q, update()))).rejects.toThrow(/row-level security/);
    });

    it("never for members or the public", async () => {
      await expect(as("buyer", (q) => insert(q, market))).rejects.toThrow(/row-level security/);
      await expect(as("anon", (q) => insert(q, market))).rejects.toThrow(/permission denied/);
    });

    it("a write-up needs its CMA and nothing else; a market update needs no target", async () => {
      await expect(as("agent", (q) => insert(q, { ...update(), cma_id: null }))).rejects.toThrow(/check constraint|row-level security/);
      await expect(as("agent", (q) => insert(q, { ...market, cma_id: CMA }))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => insert(q, { kind: "listing_presentation", body: "x", content: "{}", cma_id: CMA }))).rejects.toThrow(/check constraint/);
    });
  });

  describe("who sees one, and sending it", () => {
    it("the owner; admins once approved; never another agent", async () => {
      const id = await seed(U.agent, { kind: "market_update", content: "{}" });
      expect(await as("agent2", (q) => q(`select id from ai_drafts`))).toHaveLength(0);
      expect(await as("admin", (q) => q(`select id from ai_drafts`))).toHaveLength(0);
      await t.query(`update ai_drafts set status = 'approved' where id = $1`, [id]);
      expect(await as("admin", (q) => q(`select id from ai_drafts`))).toHaveLength(1);
      expect(await as("agent", (q) => q(`select id from ai_drafts`))).toHaveLength(1);
    });

    it("sent to website review only after approval; the CMA can't be swapped", async () => {
      const id = await seed(U.agent, { kind: "cma_writeup", cma_id: CMA, content: "{}" });
      await expect(as("agent", (q) => q(`update ai_drafts set sent_via = 'website' where id = $1`, [id]))).rejects.toThrow(/draft_not_approved/);
      await expect(t.query(`update ai_drafts set cma_id = $2 where id = $1`, [id, CMA2])).rejects.toThrow(/draft_fixed_fields/);
      await t.query(`update ai_drafts set status = 'approved' where id = $1`, [id]);
      const sent = await as("agent", async (q) => {
        await q(`update ai_drafts set sent_via = 'website' where id = $1`, [id]);
        return q(`select sent_via from ai_drafts where id = $1`, [id]);
      });
      expect(sent).toEqual([{ sent_via: "website" }]);
    });

    it("a deleted CMA takes its write-ups", async () => {
      await t.query(`insert into cmas (id, created_by, title) values ('00000000-0000-4000-8000-0000000031b3', $1, 'QA CMA three')`, [U.agent]);
      await seed(U.agent, { kind: "cma_writeup", cma_id: "00000000-0000-4000-8000-0000000031b3", content: "{}" });
      await t.query(`delete from cmas where id = '00000000-0000-4000-8000-0000000031b3'`);
      expect(await t.query(`select count(*)::int as n from ai_drafts`)).toEqual([{ n: 0 }]);
    });
  });

  it("launch kits, presentations and lead drafts behave as before", async () => {
    await expect(as("agent", (q) => insert(q, { kind: "buyer_presentation", body: "x", content: "{}" }))).resolves.toHaveLength(1);
    await expect(as("agent", (q) => insert(q, { kind: "lead_reply", body: "x" }))).rejects.toThrow(/check constraint|row-level security/);
  });
});
