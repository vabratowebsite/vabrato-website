import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S5b PR 2 (0037): "My to-dos" from Ask Vabrato. A member adds to-dos the
// assistant suggested; their agent approves or declines; the member ticks
// approved ones done and can delete their assistant data. SEC-1/SEC-2: one
// member never sees another's rows. All people and data are fictional.

const U = {
  buyerA: "a2000000-0000-4000-8000-0000000037a1",
  buyerB: "b2000000-0000-4000-8000-0000000037b1",
  seller: "e2000000-0000-4000-8000-0000000037e1",
  agentA: "a1000000-0000-4000-8000-0000000037a1", // assigned to buyerA
  agentB: "b1000000-0000-4000-8000-0000000037b1",
  va: "c1000000-0000-4000-8000-0000000037c1", // on the seller's deal
  admin: "d0000000-0000-4000-8000-0000000037d1",
} as const;
type Who = keyof typeof U | "anon";
const DENIED = /permission denied|row-level security/;
const DEAL = "da000000-0000-4000-8000-0000000037d1";

describe("member to-dos (0037)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) => (who === "anon" ? t.as("anon", null, fn) : t.as("authenticated", U[who], fn));
  const add = (q: Query, profile: string, title = "Repair GFCI outlets") =>
    q(`insert into member_todos (profile_id, title, source_name, page) values ($1, $2, 'Inspection report.pdf', 14) returning id`, [profile, title]);
  const seed = async (profile: string, status: "pending" | "approved" | "declined", title: string) =>
    (
      await t.query<{ id: string }>(
        `insert into member_todos (profile_id, title, status, decided_at, decided_by) values ($1, $2, $3, case when $3 = 'pending' then null else now() end, case when $3 = 'pending' then null else $4::uuid end) returning id`,
        [profile, title, status, U.agentA],
      )
    )[0]!.id;
  // Runs as the person and keeps what it writes (as() rolls back).
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
  const titles = (who: Who) => as(who, (q) => q<{ title: string }>(`select title from member_todos order by title`)).then((r) => r.map((x) => x.title));

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.agentA, { role: "agent" });
    await createUser(t, U.agentB, { role: "agent" });
    await createUser(t, U.va, { role: "va" });
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.buyerA);
    await createUser(t, U.buyerB);
    await createUser(t, U.seller, { role: "seller" });
    await t.exec(`
      update profiles set agent_id = '${U.agentA}' where id = '${U.buyerA}';
      insert into deals (id, address, ratification_date, agent_id, created_by) values ('${DEAL}', '1 Fixture Way, Belmont', '2026-10-01', '${U.agentB}', '${U.agentB}');
      insert into deal_members (deal_id, profile_id, member_role) values ('${DEAL}', '${U.seller}', 'seller'), ('${DEAL}', '${U.va}', 'va');
    `);
  });
  afterAll(() => t.close());
  beforeEach(() => t.exec(`delete from member_todos; delete from staff_notifications; delete from staff_audit;`));

  it("adds the switch, off", async () => {
    expect(await t.query(`select enabled from feature_flags where key = 'ai_member_summarize'`)).toEqual([{ enabled: false }]);
  });

  describe("who sees which to-dos", () => {
    beforeEach(async () => {
      await seed(U.buyerA, "pending", "A: repair GFCI");
      await seed(U.buyerB, "approved", "B: book a roofer");
      await seed(U.seller, "pending", "S: strap the water heater");
    });

    it.each<[Who, string[]]>([
      ["buyerA", ["A: repair GFCI"]],
      ["buyerB", ["B: book a roofer"]],
      ["seller", ["S: strap the water heater"]],
      ["agentA", ["A: repair GFCI"]], // buyerA's assigned agent
      ["agentB", ["S: strap the water heater"]], // the seller's deal agent
      ["va", ["S: strap the water heater"]], // on the seller's deal
      ["admin", ["A: repair GFCI", "B: book a roofer", "S: strap the water heater"]],
    ])("%s sees only their own (or their members')", async (who, expected) => {
      expect(await titles(who)).toEqual(expected);
    });

    it("the public can't read them", async () => {
      await expect(as("anon", (q) => q(`select * from member_todos`))).rejects.toThrow(DENIED);
    });
  });

  describe("adding", () => {
    it("a member adds their own, waiting for their agent", async () => {
      const rows = await as("buyerA", async (q) => {
        await add(q, U.buyerA);
        return q(`select profile_id, status, done, decided_at from member_todos`);
      });
      expect(rows).toEqual([{ profile_id: U.buyerA, status: "pending", done: false, decided_at: null }]);
    });

    it("never for someone else, never by staff, never already approved or done", async () => {
      await expect(as("buyerA", (q) => add(q, U.buyerB))).rejects.toThrow(DENIED);
      await expect(as("agentA", (q) => add(q, U.buyerA))).rejects.toThrow(DENIED);
      await expect(as("agentA", (q) => add(q, U.agentA))).rejects.toThrow(DENIED);
      await expect(as("buyerA", (q) => q(`insert into member_todos (profile_id, title, status) values ($1, 'x', 'approved')`, [U.buyerA]))).rejects.toThrow(DENIED);
      await expect(as("buyerA", (q) => q(`insert into member_todos (profile_id, title, done, done_at) values ($1, 'x', true, now())`, [U.buyerA]))).rejects.toThrow(DENIED);
      await expect(as("anon", (q) => add(q, U.buyerA))).rejects.toThrow(DENIED);
    });

    it("members can't change a to-do directly (only through the functions)", async () => {
      const id = await seed(U.buyerA, "pending", "A: repair GFCI");
      await expect(as("buyerA", (q) => q(`update member_todos set status = 'approved' where id = $1`, [id]))).rejects.toThrow(DENIED);
      await expect(as("agentA", (q) => q(`update member_todos set status = 'approved' where id = $1`, [id]))).rejects.toThrow(DENIED);
    });

    it("at most 50 waiting per member", async () => {
      await t.exec(`insert into member_todos (profile_id, title) select '${U.buyerA}', 'item ' || g from generate_series(1, 50) g`);
      await expect(as("buyerA", (q) => add(q, U.buyerA))).rejects.toThrow(/too_many_pending/);
      expect((await as("buyerB", (q) => add(q, U.buyerB))).length).toBe(1);
    });

    it("tells the member's agent once, in the bell, until they've read it", async () => {
      await act("buyerA", `insert into member_todos (profile_id, title) values ($1, 'one'), ($1, 'two')`, [U.buyerA]);
      await act("buyerA", `insert into member_todos (profile_id, title) values ($1, 'three')`, [U.buyerA]);
      expect(await t.query(`select recipient_id, kind, ref_table, ref_id from staff_notifications`)).toEqual([{ recipient_id: U.agentA, kind: "member_todo", ref_table: "profiles", ref_id: U.buyerA }]);
      expect((await t.query<{ title: string }>(`select title from staff_notifications`))[0]!.title).toMatch(/^Suggested to-do from /);
      // Once read, the next to-do alerts again.
      await t.exec(`update staff_notifications set read_at = now()`);
      await act("buyerA", `insert into member_todos (profile_id, title) values ($1, 'four')`, [U.buyerA]);
      expect(await t.query(`select count(*)::int as n from staff_notifications where read_at is null`)).toEqual([{ n: 1 }]);
    });

    it("a member with no agent: the lead router, else every admin", async () => {
      await act("buyerB", `insert into member_todos (profile_id, title) values ($1, 'x')`, [U.buyerB]);
      const to = (await t.query<{ recipient_id: string }>(`select recipient_id from staff_notifications`)).map((r) => r.recipient_id);
      expect(to.length).toBeGreaterThan(0);
      expect(to.every((id) => id === U.admin || id === U.agentA || id === U.agentB)).toBe(true);
    });
  });

  describe("the agent decides", () => {
    it("staff who can see the member approve or decline a waiting to-do; it's audited", async () => {
      const a = await seed(U.buyerA, "pending", "approve me");
      const b = await seed(U.buyerA, "pending", "decline me");
      await act("agentA", `select decide_member_todo($1, true)`, [a]);
      await act("agentA", `select decide_member_todo($1, false)`, [b]);
      expect(await t.query(`select title, status, decided_by from member_todos order by title`)).toEqual([
        { title: "approve me", status: "approved", decided_by: U.agentA },
        { title: "decline me", status: "declined", decided_by: U.agentA },
      ]);
      expect(await t.query(`select actor_id, action, ref_id from staff_audit order by id`)).toEqual([
        { actor_id: U.agentA, action: "approve_member_todo", ref_id: a },
        { actor_id: U.agentA, action: "decline_member_todo", ref_id: b },
      ]);
    });

    it("not another agent's member, not twice, and never a member", async () => {
      const a = await seed(U.buyerA, "pending", "x");
      await expect(as("agentB", (q) => q(`select decide_member_todo($1, true)`, [a]))).rejects.toThrow(/not_found/);
      await expect(as("buyerA", (q) => q(`select decide_member_todo($1, true)`, [a]))).rejects.toThrow(/staff_only/);
      await expect(as("anon", (q) => q(`select decide_member_todo($1, true)`, [a]))).rejects.toThrow(DENIED);
      const done = await seed(U.buyerA, "approved", "y");
      await expect(as("agentA", (q) => q(`select decide_member_todo($1, false)`, [done]))).rejects.toThrow(/not_found/);
    });

    it("the seller's deal staff can decide for the seller", async () => {
      const s = await seed(U.seller, "pending", "strap the water heater");
      await t.as("authenticated", U.va, async (q) => {
        await q(`select decide_member_todo($1, true)`, [s]);
        expect(await q(`select status from member_todos where id = $1`, [s])).toEqual([{ status: "approved" }]);
      });
    });
  });

  describe("the member's list", () => {
    it("ticks an approved to-do done and back; nothing else", async () => {
      const ok = await seed(U.buyerA, "approved", "approved");
      const wait = await seed(U.buyerA, "pending", "pending");
      const other = await seed(U.buyerB, "approved", "someone else's");
      await t.as("authenticated", U.buyerA, async (q) => {
        await q(`select set_my_todo_done($1, true)`, [ok]);
        expect((await q<{ done: boolean; done_at: string | null }>(`select done, done_at from member_todos where id = $1`, [ok]))[0]).toMatchObject({ done: true });
        await q(`select set_my_todo_done($1, false)`, [ok]);
        expect(await q(`select done, done_at from member_todos where id = $1`, [ok])).toEqual([{ done: false, done_at: null }]);
      });
      await expect(as("buyerA", (q) => q(`select set_my_todo_done($1, true)`, [wait]))).rejects.toThrow(/not_found/);
      await expect(as("buyerA", (q) => q(`select set_my_todo_done($1, true)`, [other]))).rejects.toThrow(/not_found/);
      await expect(as("agentA", (q) => q(`select set_my_todo_done($1, true)`, [ok]))).rejects.toThrow(/not_found/);
    });

    it("deletes their own, one by one; never someone else's", async () => {
      const mine = await seed(U.buyerA, "approved", "mine");
      const theirs = await seed(U.buyerB, "pending", "theirs");
      expect(await as("buyerA", (q) => q(`delete from member_todos where id = $1 returning id`, [mine]))).toEqual([{ id: mine }]);
      expect(await as("buyerA", (q) => q(`delete from member_todos where id = $1 returning id`, [theirs]))).toEqual([]);
      expect(await as("agentA", (q) => q(`delete from member_todos where id = $1 returning id`, [mine]))).toEqual([]);
    });

    it("'Delete my assistant data' removes waiting and declined to-dos, keeps approved ones and other members'", async () => {
      await seed(U.buyerA, "pending", "pending");
      await seed(U.buyerA, "declined", "declined");
      await seed(U.buyerA, "approved", "approved");
      await seed(U.buyerB, "pending", "B pending");
      await t.as("authenticated", U.buyerA, async (q) => {
        expect(await q(`select delete_my_assistant_data() as n`)).toEqual([{ n: 2 }]);
        expect(await q(`select title from member_todos`)).toEqual([{ title: "approved" }]);
      });
      await expect(as("anon", (q) => q(`select delete_my_assistant_data()`))).rejects.toThrow(DENIED);
    });

    it("go when the member's account is deleted", async () => {
      await seed(U.buyerB, "approved", "B approved");
      await t.exec(`begin`);
      try {
        await t.query(`delete from auth.users where id = $1`, [U.buyerB]);
        expect(await t.query(`select count(*)::int as n from member_todos where profile_id = $1`, [U.buyerB])).toEqual([{ n: 0 }]);
      } finally {
        await t.exec(`rollback`);
      }
    });
  });
});
