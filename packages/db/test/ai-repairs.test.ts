import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S6b PR 7b (0033): repair items and the response to the buyer's request,
// as ai_drafts on a deal. Who may start, see and change them, the target
// rule, one open items list per report, and frozen approved drafts.
// Fictional people and deals.

const U = {
  admin: "a1000000-0000-4000-8000-0000000033a1",
  agent: "c1000000-0000-4000-8000-0000000033c1",
  agent2: "c2000000-0000-4000-8000-0000000033c2",
  seller: "e1000000-0000-4000-8000-0000000033e1",
  buyer: "f1000000-0000-4000-8000-0000000033f1",
} as const;
type Who = keyof typeof U | "anon";
const DEAL = "d1000000-0000-4000-8000-0000000033d1";
const DEAL2 = "d2000000-0000-4000-8000-0000000033d2";
const DOC = "b1000000-0000-4000-8000-0000000033b1";
const ITEMS = JSON.stringify({ document_id: DOC, items: [{ id: "i1", title: "Missing GFCI at kitchen outlets", trade: "electrical" }] });
const RESPONSE = JSON.stringify({ items_id: "x", decisions: [{ id: "i1", decision: "repair" }] });

describe("repair items and responses (0033)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) => t.as(who === "anon" ? "anon" : "authenticated", who === "anon" ? null : U[who], fn);
  const insert = (q: Query, cols: Record<string, unknown>) => {
    const keys = Object.keys(cols);
    return q<{ id: string }>(`insert into ai_drafts (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(cols));
  };
  const items = (deal = DEAL, content = ITEMS) => ({ kind: "inspection_items", deal_id: deal, subject: "Repair items", body: "1 item", content });
  const response = (deal = DEAL) => ({ kind: "repair_response", deal_id: deal, subject: "Response to the request for repairs", body: "Hello,", content: RESPONSE });
  const seed = async (owner: string, cols: Record<string, unknown>) => {
    const keys = Object.keys(cols);
    return (await t.query<{ id: string }>(`insert into ai_drafts (owner_id, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")}) returning id`, [owner, ...Object.values(cols)]))[0]!.id;
  };

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.agent2, { role: "agent" });
    await createUser(t, U.seller, { role: "seller" });
    await createUser(t, U.buyer);
    await t.query(`insert into deals (id, address, ratification_date, agent_id, created_by) values ($1, '1 Fixture Way, Belmont', '2026-10-01', $2, $2), ($3, '2 Fixture Way, Belmont', '2026-10-01', $4, $4)`, [DEAL, U.agent, DEAL2, U.agent2]);
    await t.query(`insert into deal_members (deal_id, profile_id, member_role) values ($1, $2, 'seller')`, [DEAL, U.seller]);
  });
  afterAll(() => t.close());
  beforeEach(() => t.exec(`delete from ai_drafts`));

  it("adds the two switches, off", async () => {
    expect(await t.query(`select key, enabled from feature_flags where key in ('ai_staff_inspection_items', 'ai_staff_repair_response') order by key`)).toEqual([
      { key: "ai_staff_inspection_items", enabled: false },
      { key: "ai_staff_repair_response", enabled: false },
    ]);
  });

  describe("starting one", () => {
    it("staff with access to the deal start items and responses", async () => {
      expect(await as("agent", (q) => insert(q, items()))).toHaveLength(1);
      expect(await as("agent", (q) => insert(q, response()))).toHaveLength(1);
      expect(await as("admin", (q) => insert(q, items(DEAL2)))).toHaveLength(1);
    });

    it("an agent without deal access, the seller, a buyer and the public can't", async () => {
      await expect(as("agent2", (q) => insert(q, items()))).rejects.toThrow(/row-level security/);
      await expect(as("seller", (q) => insert(q, items()))).rejects.toThrow(/row-level security/);
      await expect(as("buyer", (q) => insert(q, response()))).rejects.toThrow(/row-level security/);
      await expect(as("anon", (q) => insert(q, items()))).rejects.toThrow(/permission denied/);
    });

    it("both need the deal, content, and nothing else", async () => {
      await expect(as("agent", (q) => insert(q, { ...items(), deal_id: null }))).rejects.toThrow(/check constraint|row-level security/);
      await expect(as("agent", (q) => insert(q, { ...items(), content: null }))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => insert(q, { ...response(), listing_key: "QA-1" }))).rejects.toThrow(/check constraint/);
      await t.query(`insert into cmas (id, created_by, title) values ('00000000-0000-4000-8000-0000000033b9', $1, 'QA CMA') on conflict do nothing`, [U.agent]);
      await expect(as("agent", (q) => insert(q, { ...response(), cma_id: "00000000-0000-4000-8000-0000000033b9" }))).rejects.toThrow(/check constraint/);
    });

    it("one open items list per report; another once it's approved", async () => {
      const first = await seed(U.agent, items());
      await expect(t.query(`insert into ai_drafts (owner_id, kind, deal_id, subject, body, content) values ($1, 'inspection_items', $2, 'x', 'x', $3)`, [U.agent, DEAL, ITEMS])).rejects.toThrow(/duplicate key/);
      await t.query(`update ai_drafts set status = 'approved' where id = $1`, [first]);
      expect(await seed(U.agent, items())).toBeTruthy();
      expect(await seed(U.agent, items(DEAL, JSON.stringify({ document_id: "another-report", items: [] })))).toBeTruthy();
    });
  });

  describe("seeing and changing them", () => {
    it("the owner reads their drafts; staff on the deal read approved ones; nobody else", async () => {
      const draft = await seed(U.agent, items());
      const approved = await seed(U.agent, response());
      await t.query(`update ai_drafts set status = 'approved' where id = $1`, [approved]);
      expect((await as("agent", (q) => q<{ id: string }>(`select id from ai_drafts order by created_at`))).map((r) => r.id)).toEqual([draft, approved]);
      expect((await as("admin", (q) => q<{ id: string }>(`select id from ai_drafts`))).map((r) => r.id)).toEqual([approved]);
      expect(await as("agent2", (q) => q(`select id from ai_drafts`))).toEqual([]);
      expect(await as("seller", (q) => q(`select id from ai_drafts`))).toEqual([]);
    });

    it("approved drafts are frozen and can't be discarded; how they were used is recorded once", async () => {
      const id = await seed(U.agent, response());
      expect(await as("agent", (q) => q(`update ai_drafts set body = 'Hello, edited' where id = $1 returning id`, [id]))).toHaveLength(1);
      await t.query(`update ai_drafts set status = 'approved' where id = $1`, [id]);
      await expect(as("agent", (q) => q(`update ai_drafts set content = '{"decisions":[]}' where id = $1`, [id]))).rejects.toThrow(/draft_closed/);
      await expect(as("agent", (q) => q(`update ai_drafts set status = 'discarded' where id = $1`, [id]))).rejects.toThrow(/draft_closed/);
      expect(await as("agent", (q) => q<{ sent_via: string }>(`update ai_drafts set sent_via = 'print' where id = $1 returning sent_via`, [id]))).toEqual([{ sent_via: "print" }]);
    });

    it("another agent can't change or discard someone's draft", async () => {
      const id = await seed(U.agent, items());
      expect(await as("agent2", (q) => q(`update ai_drafts set status = 'discarded' where id = $1 returning id`, [id]))).toEqual([]);
      expect(await as("admin", (q) => q(`update ai_drafts set body = 'x' where id = $1 returning id`, [id]))).toEqual([]);
    });
  });

  it("the earlier kinds behave as before", async () => {
    await expect(as("agent", (q) => insert(q, { kind: "escrow_update", deal_id: DEAL, subject: "Update", body: "Hi" }))).resolves.toHaveLength(1);
    await expect(as("agent", (q) => insert(q, { kind: "listing_presentation", deal_id: DEAL, body: "x", content: "{}" }))).rejects.toThrow(/check constraint/);
  });
});
