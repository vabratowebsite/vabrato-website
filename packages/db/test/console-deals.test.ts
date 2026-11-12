import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, type TestDb } from "./harness";

// Creating a transaction from the console (createDealAction in apps/va): every
// staff role can, and only through the path the console uses. Found in the
// S6b PR 2 browser QA: an insert that reads its row back (RETURNING, or
// supabase-js insert().select()) fails for agents and VAs, because
// has_deal_access() runs on the statement's snapshot, which doesn't hold the
// new row yet. The console now makes the id itself and doesn't read back.
// Fictional people.

const U = {
  admin: "a1000000-0000-4000-8000-00000000d0a1",
  agent: "c1000000-0000-4000-8000-00000000d0c1",
  va: "e1000000-0000-4000-8000-00000000d0e1",
  buyer: "f1000000-0000-4000-8000-00000000d0f1",
} as const;
type Who = keyof typeof U;

describe("creating a transaction from the console", () => {
  let t: TestDb;
  const act = async <T>(who: Who, sql: string, params: unknown[] = []) => {
    await t.query(`select set_config('request.jwt.claim.sub', $1, false)`, [U[who]]);
    await t.exec(`set role authenticated`);
    try {
      return await t.query<T>(sql, params);
    } finally {
      await t.exec(`reset role`);
      await t.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  };
  const ids: Record<string, string> = {
    admin: "00000000-0000-4000-8000-00000000d001",
    agent: "00000000-0000-4000-8000-00000000d002",
    va: "00000000-0000-4000-8000-00000000d003",
  };
  const insertDeal = (who: Who, id: string) =>
    act(
      who,
      `insert into deals (id, address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id)
       values ($1, '1 Fictional Way, San Carlos', 'normal', '2026-03-02', 30, 0, $2)`,
      [id, U[who]],
    );

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.va, { role: "va" });
    await createUser(t, U.buyer);
  });
  afterAll(() => t.close());

  it.each(["admin", "agent", "va"] as const)("%s: creates the deal, its tasks and contingencies, and can open it", async (who) => {
    const id = ids[who]!;
    await insertDeal(who, id);
    await act(who, `insert into tasks (deal_id, title, owner, phase, offset_days, due_date) values ($1, 'Open escrow', 'Escrow', 'after_ratification', 0, '2026-03-02')`, [id]);
    await act(who, `insert into deal_contingencies (deal_id, kind, offset_days, due_date) values ($1, 'financing', 17, '2026-03-19')`, [id]);
    const rows = await act<{ created_by: string; tasks: number; conts: number }>(
      who,
      `select d.created_by, (select count(*)::int from tasks where deal_id = d.id) tasks, (select count(*)::int from deal_contingencies where deal_id = d.id) conts from deals d where d.id = $1`,
      [id],
    );
    expect(rows).toEqual([{ created_by: U[who], tasks: 1, conts: 1 }]);
  });

  it("reading the new row back in the same statement fails for an agent: the reason the console doesn't", async () => {
    await expect(
      act(
        "agent",
        `insert into deals (address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id)
         values ('2 Fictional Way, San Carlos', 'normal', '2026-03-02', 30, 0, $1) returning id`,
        [U.agent],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("a member can't create a deal", async () => {
    await expect(insertDeal("buyer", "00000000-0000-4000-8000-00000000d004")).rejects.toThrow(/row-level security/);
  });

  it("one agent can't see another staff member's new deal", async () => {
    const seen = await act<{ id: string }>("agent", `select id from deals where id = $1`, [ids.va]);
    expect(seen).toEqual([]);
  });
});
