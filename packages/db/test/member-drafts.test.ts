import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S5b PR 3 (0038): drafts a member saves from Ask Vabrato. Private to the
// member (their agent and admins see nothing), deleted 30 days after the last
// edit, and removed by "Delete my assistant data". All data is fictional.

const U = {
  buyerA: "a2000000-0000-4000-8000-0000000038a1",
  buyerB: "b2000000-0000-4000-8000-0000000038b1",
  seller: "e2000000-0000-4000-8000-0000000038e1",
  agentA: "a1000000-0000-4000-8000-0000000038a1", // assigned to buyerA
  va: "c1000000-0000-4000-8000-0000000038c1", // on the seller's deal
  admin: "d0000000-0000-4000-8000-0000000038d1",
} as const;
type Who = keyof typeof U | "anon";
const DENIED = /permission denied|row-level security/;
const DEAL = "da000000-0000-4000-8000-0000000038d1";

describe("member drafts (0038)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) => (who === "anon" ? t.as("anon", null, fn) : t.as("authenticated", U[who], fn));
  const save = (q: Query, kind = "message", recipient = "movers", body = "Hi, we'd like a move on the 14th.") =>
    q<{ id: string }>(`insert into member_drafts (kind, recipient, about, subject, body) values ($1, $2, '1 Fixture Way, Belmont', 'Our move', $3) returning id`, [kind, recipient, body]);
  const seed = async (profile: string, body: string, kind = "message", recipient = "movers") =>
    (await t.query<{ id: string }>(`insert into member_drafts (profile_id, kind, recipient, body) values ($1, $2, $3, $4) returning id`, [profile, kind, recipient, body]))[0]!.id;
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
  // The guard keeps updated_at on anything but an edit, so tests age a row
  // with the trigger off.
  const age = async (id: string, days: number) => {
    await t.exec(`alter table member_drafts disable trigger member_drafts_guard`);
    try {
      await t.query(`update member_drafts set updated_at = now() - make_interval(days => $2) where id = $1`, [id, days]);
    } finally {
      await t.exec(`alter table member_drafts enable trigger member_drafts_guard`);
    }
  };
  const bodies = (who: Who) => as(who, (q) => q<{ body: string }>(`select body from member_drafts order by body`)).then((r) => r.map((x) => x.body));

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.agentA, { role: "agent" });
    await createUser(t, U.va, { role: "va" });
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.buyerA);
    await createUser(t, U.buyerB);
    await createUser(t, U.seller, { role: "seller" });
    await t.exec(`
      update profiles set agent_id = '${U.agentA}' where id = '${U.buyerA}';
      insert into deals (id, address, ratification_date, agent_id, created_by) values ('${DEAL}', '1 Fixture Way, Belmont', '2026-10-01', '${U.agentA}', '${U.agentA}');
      insert into deal_members (deal_id, profile_id, member_role) values ('${DEAL}', '${U.seller}', 'seller'), ('${DEAL}', '${U.va}', 'va');
    `);
  });
  afterAll(() => t.close());
  beforeEach(() => t.exec(`delete from member_drafts; delete from member_todos;`));

  it("adds both switches, off", async () => {
    expect(await t.query(`select key, enabled from feature_flags where key in ('ai_member_draft', 'ai_member_cover_letter') order by key`)).toEqual([
      { key: "ai_member_cover_letter", enabled: false },
      { key: "ai_member_draft", enabled: false },
    ]);
  });

  describe("private to the member", () => {
    beforeEach(async () => {
      await seed(U.buyerA, "A: note to movers");
      await seed(U.buyerB, "B: note to lender", "message", "lender");
      await seed(U.seller, "S: note to contractor", "message", "contractor");
    });

    it.each<[Who, string[]]>([
      ["buyerA", ["A: note to movers"]],
      ["buyerB", ["B: note to lender"]],
      ["seller", ["S: note to contractor"]],
      ["agentA", []], // buyerA's own agent: drafts are private
      ["va", []], // on the seller's deal
      ["admin", []],
    ])("%s reads %j", async (who, expected) => {
      expect(await bodies(who)).toEqual(expected);
    });

    it("the public can't read the table at all", async () => {
      await expect(bodies("anon")).rejects.toThrow(DENIED);
    });

    it("another member can't change or delete someone's draft (nothing matches)", async () => {
      const n = await as("buyerB", async (q) => {
        await q(`update member_drafts set body = 'x' where profile_id <> $1`, [U.buyerB]);
        await q(`delete from member_drafts where profile_id <> $1`, [U.buyerB]);
        return q<{ n: number }>(`select count(*)::int as n from member_drafts`);
      });
      expect(n).toEqual([{ n: 1 }]);
      expect(await t.query(`select body from member_drafts order by body`)).toEqual([{ body: "A: note to movers" }, { body: "B: note to lender" }, { body: "S: note to contractor" }]);
    });
  });

  describe("saving", () => {
    it("a member saves their own draft; profile_id defaults to them", async () => {
      const rows = await as("buyerA", async (q) => {
        await save(q);
        return q<{ profile_id: string; kind: string; used_at: string | null }>(`select profile_id, kind, used_at from member_drafts`);
      });
      expect(rows).toEqual([{ profile_id: U.buyerA, kind: "message", used_at: null }]);
    });

    it("never for someone else, never by staff or the public", async () => {
      await expect(as("buyerA", (q) => q(`insert into member_drafts (profile_id, kind, recipient, body) values ($1, 'message', 'movers', 'x')`, [U.buyerB]))).rejects.toThrow(DENIED);
      for (const who of ["agentA", "va", "admin"] as const) await expect(as(who, (q) => save(q)), who).rejects.toThrow(DENIED);
      await expect(as("anon", (q) => save(q))).rejects.toThrow(DENIED);
    });

    it("cover letters: buyers only, always to the agent", async () => {
      await expect(as("seller", (q) => save(q, "cover_letter", "agent"))).rejects.toThrow(DENIED);
      await expect(as("buyerA", (q) => save(q, "cover_letter", "movers"))).rejects.toThrow(/check constraint/);
      expect(await as("buyerA", (q) => save(q, "cover_letter", "agent"))).toHaveLength(1);
    });

    it("sent_via can't be set on insert; lengths and kinds are checked", async () => {
      await expect(as("buyerA", (q) => q(`insert into member_drafts (kind, recipient, body, sent_via) values ('message', 'movers', 'x', 'email')`))).rejects.toThrow(DENIED);
      await expect(as("buyerA", (q) => save(q, "message", "movers", "x".repeat(3501)))).rejects.toThrow(/check constraint/);
      await expect(as("buyerA", (q) => save(q, "message", "movers", ""))).rejects.toThrow(/check constraint/);
      await expect(as("buyerA", (q) => save(q, "letter", "movers"))).rejects.toThrow(/check constraint/);
      await expect(as("buyerA", (q) => save(q, "message", "neighbor"))).rejects.toThrow(/check constraint/);
    });

    it("at most 50 per member", async () => {
      await t.exec(`insert into member_drafts (profile_id, kind, recipient, body) select '${U.buyerA}', 'message', 'movers', 'n' || g from generate_series(1, 50) g`);
      await expect(as("buyerA", (q) => save(q))).rejects.toThrow(/too_many_drafts/);
      expect(await as("buyerB", (q) => save(q))).toHaveLength(1);
    });
  });

  describe("editing", () => {
    it("subject and body edits move updated_at; sent_via stamps used_at", async () => {
      const id = await seed(U.buyerA, "first");
      await age(id, 10);
      await act("buyerA", `update member_drafts set sent_via = 'email' where id = $1`, [id]);
      let [r] = await t.query<{ fresh: boolean; used: boolean }>(`select updated_at > now() - interval '1 day' as fresh, used_at is not null as used from member_drafts where id = $1`, [id]);
      expect(r).toEqual({ fresh: false, used: true }); // marking it used isn't an edit
      await act("buyerA", `update member_drafts set body = 'second' where id = $1`, [id]);
      [r] = await t.query(`select updated_at > now() - interval '1 day' as fresh, used_at is not null as used from member_drafts where id = $1`, [id]);
      expect(r).toEqual({ fresh: true, used: true });
    });

    it("kind, recipient, about and owner can't change", async () => {
      const id = await seed(U.buyerA, "x");
      await expect(as("buyerA", (q) => q(`update member_drafts set recipient = 'lender' where id = $1`, [id]))).rejects.toThrow(DENIED);
      await expect(as("buyerA", (q) => q(`update member_drafts set kind = 'cover_letter' where id = $1`, [id]))).rejects.toThrow(DENIED);
      await expect(as("buyerA", (q) => q(`update member_drafts set profile_id = $2 where id = $1`, [id, U.buyerB]))).rejects.toThrow(DENIED);
      await expect(t.query(`update member_drafts set recipient = 'lender' where id = $1`, [id])).rejects.toThrow(/draft_fixed_fields/);
    });

    it("a cover letter can only be marked sent to the agent", async () => {
      const id = await seed(U.buyerA, "letter", "cover_letter", "agent");
      await expect(as("buyerA", (q) => q(`update member_drafts set sent_via = 'email' where id = $1`, [id]))).rejects.toThrow(/check constraint/);
      await expect(as("buyerA", (q) => q(`update member_drafts set sent_via = 'copy' where id = $1`, [id]))).rejects.toThrow(/check constraint/);
      await act("buyerA", `update member_drafts set sent_via = 'agent' where id = $1`, [id]);
      expect(await t.query(`select sent_via from member_drafts where id = $1`, [id])).toEqual([{ sent_via: "agent" }]);
    });

    it("the member deletes their own", async () => {
      await seed(U.buyerA, "x");
      await act("buyerA", `delete from member_drafts`);
      expect(await t.query(`select count(*)::int as n from member_drafts`)).toEqual([{ n: 0 }]);
    });
  });

  describe("purge after 30 days without an edit", () => {
    it("deletes drafts 31 days old, keeps 29-day-old ones", async () => {
      const old = await seed(U.buyerA, "old");
      const recent = await seed(U.buyerA, "recent");
      await seed(U.buyerB, "today");
      await age(old, 31);
      await age(recent, 29);
      expect(await t.query(`select public.purge_member_drafts() as n`)).toEqual([{ n: 1 }]);
      expect(await t.query(`select body from member_drafts order by body`)).toEqual([{ body: "recent" }, { body: "today" }]);
    });

    it("only the service role runs it", async () => {
      await expect(as("buyerA", (q) => q(`select public.purge_member_drafts()`))).rejects.toThrow(/permission denied/);
      await expect(as("admin", (q) => q(`select public.purge_member_drafts()`))).rejects.toThrow(/permission denied/);
      await expect(as("anon", (q) => q(`select public.purge_member_drafts()`))).rejects.toThrow(/permission denied/);
      expect(await t.as("service_role", null, (q) => q(`select public.purge_member_drafts() as n`))).toEqual([{ n: 0 }]);
    });
  });

  describe("Delete my assistant data", () => {
    it("removes the caller's drafts and waiting/declined to-dos, keeps approved to-dos and other members' data", async () => {
      await seed(U.buyerA, "A1");
      await seed(U.buyerA, "A2", "cover_letter", "agent");
      await seed(U.buyerB, "B1");
      await t.exec(`
        insert into member_todos (profile_id, title) values ('${U.buyerA}', 'waiting');
        insert into member_todos (profile_id, title, status, decided_at, decided_by) values
          ('${U.buyerA}', 'declined', 'declined', now(), '${U.agentA}'),
          ('${U.buyerA}', 'approved', 'approved', now(), '${U.agentA}');
      `);
      expect(await act("buyerA", `select public.delete_my_assistant_data() as n`)).toEqual([{ n: 4 }]);
      expect(await t.query(`select body from member_drafts`)).toEqual([{ body: "B1" }]);
      expect(await t.query(`select title from member_todos`)).toEqual([{ title: "approved" }]);
    });

    it("needs a signed-in member", async () => {
      await expect(as("anon", (q) => q(`select public.delete_my_assistant_data()`))).rejects.toThrow(/permission denied/);
    });
  });
});
