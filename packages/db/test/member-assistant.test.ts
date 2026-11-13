import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type TestDb } from "./harness";

// S5b PR 1 (0036): the two Ask Vabrato switches. Members (buyers, sellers,
// both) may run member features within the member limits; staff may not;
// only admins switch them; a member never sees anyone's usage rows.
// Fictional people; no model is called.

const U = {
  admin: "a1000000-0000-4000-8000-0000000036a1",
  agent: "c1000000-0000-4000-8000-0000000036c1",
  buyer: "f1000000-0000-4000-8000-0000000036f1",
  buyer2: "f2000000-0000-4000-8000-0000000036f2",
  seller: "e1000000-0000-4000-8000-0000000036e1",
  both: "b1000000-0000-4000-8000-0000000036b1",
} as const;
type Who = keyof typeof U;
const FLAGS = ["ai_member_explain", "ai_member_search"];

interface Begin {
  allowed: boolean;
  reason?: string;
  run_id?: string;
}

describe("Ask Vabrato switches (0036)", () => {
  let t: TestDb;
  const act = async <T>(who: Who | "anon", sql: string, params: unknown[] = []) => {
    await t.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who === "anon" ? "" : U[who]]);
    await t.exec(`set role ${who === "anon" ? "anon" : "authenticated"}`);
    try {
      return await t.query<T>(sql, params);
    } finally {
      await t.exec(`reset role`);
      await t.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  };
  const begin = async (who: Who, feature: string) => (await act<{ r: Begin }>(who, `select ai_begin($1) as r`, [feature]))[0]!.r;
  const setFlags = (on: boolean) => t.query(`update feature_flags set enabled = $1 where key = any($2)`, [on, ["ai_enabled", ...FLAGS]]);

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.buyer);
    await createUser(t, U.buyer2);
    await createUser(t, U.seller, { role: "seller" });
    await createUser(t, U.both, { role: "both" });
    await t.exec(`update app_settings set ai_zdr_confirmed_at = now()`);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.exec(`delete from ai_runs; delete from staff_audit; update app_settings set ai_daily_requests_member = 30, ai_daily_tokens_member = 300000`);
    await setFlags(false);
  });

  it("adds the two switches, off", async () => {
    expect(await t.query(`select key, enabled from feature_flags where key = any($1) order by key`, [FLAGS])).toEqual([
      { key: "ai_member_explain", enabled: false },
      { key: "ai_member_search", enabled: false },
    ]);
  });

  it("off: nothing runs and nothing is logged", async () => {
    for (const f of FLAGS) expect(await begin("buyer", f.slice(3))).toEqual({ allowed: false, reason: "off" });
    expect(await t.query(`select count(*)::int as n from ai_runs`)).toEqual([{ n: 0 }]);
  });

  it("only an admin switches them, and it's audited", async () => {
    await expect(act("buyer", `select set_ai_flag('ai_member_explain', true)`)).rejects.toThrow(/admin_only/);
    await expect(act("agent", `select set_ai_flag('ai_member_explain', true)`)).rejects.toThrow(/admin_only/);
    await expect(act("buyer", `update feature_flags set enabled = true where key = 'ai_member_search' returning key`)).resolves.toEqual([]);
    await act("admin", `select set_ai_flag('ai_member_explain', true)`);
    expect(await t.query(`select enabled from feature_flags where key = 'ai_member_explain'`)).toEqual([{ enabled: true }]);
    expect(await t.query(`select action from staff_audit`)).toEqual([{ action: "set_ai_flag" }]);
  });

  it("on: buyers, sellers and both-role members may use them; staff and the public may not", async () => {
    await setFlags(true);
    for (const who of ["buyer", "seller", "both"] as const) {
      for (const f of FLAGS) expect((await begin(who, f.slice(3))).allowed, `${who} ${f}`).toBe(true);
    }
    await expect(begin("agent", "member_explain")).rejects.toThrow(/not_allowed/);
    await expect(begin("admin", "member_search")).rejects.toThrow(/not_allowed/);
    await expect(act("anon", `select ai_begin('member_explain')`)).rejects.toThrow(/permission denied/);
  });

  it("the master switch still governs both", async () => {
    await setFlags(true);
    await t.query(`update feature_flags set enabled = false where key = 'ai_enabled'`);
    expect(await begin("buyer", "member_search")).toEqual({ allowed: false, reason: "off" });
  });

  it("member daily limits apply, per member", async () => {
    await setFlags(true);
    await t.exec(`update app_settings set ai_daily_requests_member = 2`);
    expect((await begin("buyer", "member_explain")).allowed).toBe(true);
    expect((await begin("buyer", "member_search")).allowed).toBe(true);
    expect(await begin("buyer", "member_explain")).toEqual({ allowed: false, reason: "daily_requests" });
    expect((await begin("buyer2", "member_explain")).allowed).toBe(true);
    const usage = (await act<{ u: { requests: number; requests_limit: number } }>("buyer", `select ai_usage_today() as u`))[0]!.u;
    expect(usage).toMatchObject({ requests: 2, requests_limit: 2 });
  });

  it("a member sees no usage rows, theirs or anyone else's", async () => {
    await setFlags(true);
    await begin("buyer", "member_explain");
    await begin("buyer2", "member_search");
    expect(await act("buyer", `select id from ai_runs`)).toEqual([]);
    expect(await act("buyer2", `select id from ai_runs`)).toEqual([]);
    await expect(act("buyer", `insert into ai_runs (profile_id, feature) values ('${U.buyer}', 'member_explain')`)).rejects.toThrow(/permission denied|row-level security/);
  });
});
