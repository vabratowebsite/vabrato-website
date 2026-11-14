import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type TestDb } from "./harness";

// S5b PR 4 (0039): the MLSListings approval switch for AI on listing data.
// "Compare homes" and "Ask about a home" can't be switched on while it's
// off, by any route; turning it off turns them off. Fictional people only.

const U = {
  admin: "a1000000-0000-4000-8000-0000000039a1",
  agent: "c1000000-0000-4000-8000-0000000039c1",
  buyer: "f1000000-0000-4000-8000-0000000039f1",
} as const;
type Who = keyof typeof U;
const GATED = ["ai_member_compare", "ai_member_listing"];

describe("MLS AI approval gate (0039)", () => {
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
  const flags = () => t.query<{ key: string; enabled: boolean }>(`select key, enabled from feature_flags where key in ('ai_mls_approved', 'ai_member_compare', 'ai_member_listing') order by key`);
  const on = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, true]));
  const state = async () => Object.fromEntries((await flags()).map((f) => [f.key, f.enabled]));

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.buyer);
  });
  afterAll(() => t.close());
  beforeEach(() => t.exec(`update feature_flags set enabled = false where key in ('ai_member_compare', 'ai_member_listing'); update feature_flags set enabled = false where key = 'ai_mls_approved'; delete from staff_audit;`));

  it("adds the approval and both switches, off", async () => {
    expect(await flags()).toEqual([
      { key: "ai_member_compare", enabled: false },
      { key: "ai_member_listing", enabled: false },
      { key: "ai_mls_approved", enabled: false },
    ]);
  });

  it("a listing switch can't be turned on before approval, by any route", async () => {
    for (const key of GATED) {
      await expect(act("admin", `select set_ai_flag($1, true)`, [key])).rejects.toThrow(/mls_ai_not_approved/);
      await expect(t.query(`update feature_flags set enabled = true where key = $1`, [key])).rejects.toThrow(/mls_ai_not_approved/);
    }
    expect(await state()).toEqual({ ai_member_compare: false, ai_member_listing: false, ai_mls_approved: false });
  });

  it("once approved, an admin turns them on (audited)", async () => {
    await act("admin", `select set_ai_flag('ai_mls_approved', true)`);
    for (const key of GATED) await act("admin", `select set_ai_flag($1, true)`, [key]);
    expect(await state()).toEqual({ ...on(GATED), ai_mls_approved: true });
    expect(await t.query(`select ref_id from staff_audit where action = 'set_ai_flag' order by ref_id`)).toEqual([{ ref_id: "ai_member_compare" }, { ref_id: "ai_member_listing" }, { ref_id: "ai_mls_approved" }]);
  });

  it("turning the approval off turns both off", async () => {
    await t.exec(`update feature_flags set enabled = true where key = 'ai_mls_approved'; update feature_flags set enabled = true where key in ('ai_member_compare', 'ai_member_listing');`);
    await act("admin", `select set_ai_flag('ai_mls_approved', false)`);
    expect(await state()).toEqual({ ai_member_compare: false, ai_member_listing: false, ai_mls_approved: false });
  });

  it("turning a listing switch off is always allowed", async () => {
    await t.exec(`update feature_flags set enabled = true where key = 'ai_mls_approved'; update feature_flags set enabled = true where key = 'ai_member_compare';`);
    await act("admin", `select set_ai_flag('ai_member_compare', false)`);
    expect((await state()).ai_member_compare).toBe(false);
  });

  it("only admins set them", async () => {
    for (const who of ["agent", "buyer"] as const) await expect(act(who, `select set_ai_flag('ai_mls_approved', true)`), who).rejects.toThrow(/admin_only/);
    await expect(act("anon", `select set_ai_flag('ai_mls_approved', true)`)).rejects.toThrow(/permission denied/);
    // A member's direct update matches no row they may change (or is refused outright).
    await act("buyer", `update feature_flags set enabled = true where key = 'ai_mls_approved'`).catch(() => undefined);
    expect((await state()).ai_mls_approved).toBe(false);
  });

  it("other switches are unaffected by the gate", async () => {
    await act("admin", `select set_ai_flag('ai_member_explain', true)`);
    expect(await t.query(`select enabled from feature_flags where key = 'ai_member_explain'`)).toEqual([{ enabled: true }]);
    await t.exec(`update feature_flags set enabled = false where key = 'ai_member_explain'`);
  });

  it("the gate's trigger functions can't be called directly", async () => {
    await expect(act("admin", `select public.feature_flags_mls_ai_gate()`)).rejects.toThrow(/permission denied|trigger functions can only be called as triggers/);
  });
});
