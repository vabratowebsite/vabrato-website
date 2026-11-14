import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S5b PR 5 (0040): the schedule switches, the tour-day switch under the
// MLSListings approval, and to-dos with a due date (still waiting for the
// agent's approval). Fictional people only.

const U = {
  admin: "a1000000-0000-4000-8000-0000000040a1",
  agent: "c1000000-0000-4000-8000-0000000040c1",
  buyerA: "f1000000-0000-4000-8000-0000000040f1",
  buyerB: "f2000000-0000-4000-8000-0000000040f2",
} as const;
type Who = keyof typeof U | "anon";
const DENIED = /permission denied|row-level security/;

describe("schedules (0040)", () => {
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
  const state = async () =>
    Object.fromEntries((await t.query<{ key: string; enabled: boolean }>(`select key, enabled from feature_flags where key in ('ai_mls_approved', 'ai_member_tour', 'ai_member_compare') order by key`)).map((f) => [f.key, f.enabled]));

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.buyerA);
    await createUser(t, U.buyerB);
    await t.exec(`update profiles set agent_id = '${U.agent}' where id = '${U.buyerA}'`);
  });
  afterAll(() => t.close());
  beforeEach(() =>
    t.exec(`
      update feature_flags set enabled = false where key in ('ai_member_compare', 'ai_member_listing', 'ai_member_tour');
      update feature_flags set enabled = false where key = 'ai_mls_approved';
      delete from member_todos; delete from staff_notifications; delete from staff_audit;
    `),
  );

  it("adds the three switches, off", async () => {
    expect(await t.query(`select key, enabled from feature_flags where key in ('ai_member_moving', 'ai_member_prelisting', 'ai_member_tour') order by key`)).toEqual([
      { key: "ai_member_moving", enabled: false },
      { key: "ai_member_prelisting", enabled: false },
      { key: "ai_member_tour", enabled: false },
    ]);
  });

  describe("tour day needs the MLSListings approval", () => {
    it("can't be turned on before approval, by any route", async () => {
      await expect(act("admin", `select set_ai_flag('ai_member_tour', true)`)).rejects.toThrow(/mls_ai_not_approved/);
      await expect(t.query(`update feature_flags set enabled = true where key = 'ai_member_tour'`)).rejects.toThrow(/mls_ai_not_approved/);
    });

    it("turns on after approval, and off with it (the PR 4 switches too)", async () => {
      await act("admin", `select set_ai_flag('ai_mls_approved', true)`);
      await act("admin", `select set_ai_flag('ai_member_tour', true)`);
      await act("admin", `select set_ai_flag('ai_member_compare', true)`);
      expect(await state()).toEqual({ ai_member_compare: true, ai_member_tour: true, ai_mls_approved: true });
      await act("admin", `select set_ai_flag('ai_mls_approved', false)`);
      expect(await state()).toEqual({ ai_member_compare: false, ai_member_tour: false, ai_mls_approved: false });
    });

    it("the moving and pre-listing switches don't need approval", async () => {
      await act("admin", `select set_ai_flag('ai_member_moving', true)`);
      await act("admin", `select set_ai_flag('ai_member_prelisting', true)`);
      expect(await t.query(`select count(*)::int as n from feature_flags where key in ('ai_member_moving', 'ai_member_prelisting') and enabled`)).toEqual([{ n: 2 }]);
      await t.exec(`update feature_flags set enabled = false where key in ('ai_member_moving', 'ai_member_prelisting')`);
    });
  });

  describe("to-dos with a due date", () => {
    it("a member adds dated to-dos for themselves; they still wait for the agent (one alert)", async () => {
      await act("buyerA", `insert into member_todos (profile_id, title, source_name, due_date) values ($1, 'Book movers', 'Moving plan', '2026-12-01'), ($1, 'Forward mail', 'Moving plan', '2026-12-10')`, [U.buyerA]);
      expect(await t.query(`select title, status, due_date::text from member_todos order by due_date`)).toEqual([
        { title: "Book movers", status: "pending", due_date: "2026-12-01" },
        { title: "Forward mail", status: "pending", due_date: "2026-12-10" },
      ]);
      expect(await t.query(`select count(*)::int as n from staff_notifications where recipient_id = $1 and kind = 'member_todo'`, [U.agent])).toEqual([{ n: 1 }]);
    });

    it("another member sees none; the agent sees the due dates", async () => {
      await t.query(`insert into member_todos (profile_id, title, due_date) values ($1, 'Book movers', '2026-12-01')`, [U.buyerA]);
      expect(await as("buyerB", (q) => q(`select * from member_todos`))).toEqual([]);
      expect(await as("agent", (q) => q(`select due_date::text from member_todos`))).toEqual([{ due_date: "2026-12-01" }]);
    });

    it("still never approved by the member, never for someone else; dates in range", async () => {
      await expect(as("buyerA", (q) => q(`insert into member_todos (profile_id, title, due_date, status) values ($1, 'x', '2026-12-01', 'approved')`, [U.buyerA]))).rejects.toThrow(DENIED);
      await expect(as("buyerA", (q) => q(`insert into member_todos (profile_id, title, due_date) values ($1, 'x', '2026-12-01')`, [U.buyerB]))).rejects.toThrow(DENIED);
      await expect(as("buyerA", (q) => q(`insert into member_todos (profile_id, title, due_date) values ($1, 'x', '1999-01-01')`, [U.buyerA]))).rejects.toThrow(/check constraint/);
      await expect(as("anon", (q) => q(`insert into member_todos (profile_id, title, due_date) values ($1, 'x', '2026-12-01')`, [U.buyerA]))).rejects.toThrow(DENIED);
    });

    it("members can't change a due date directly", async () => {
      const id = (await t.query<{ id: string }>(`insert into member_todos (profile_id, title, due_date) values ($1, 'x', '2026-12-01') returning id`, [U.buyerA]))[0]!.id;
      await expect(as("buyerA", (q) => q(`update member_todos set due_date = '2027-01-01' where id = $1`, [id]))).rejects.toThrow(DENIED);
    });
  });
});
