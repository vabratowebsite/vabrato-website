import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type TestDb } from "./harness";

// AI foundations (0026): the master switch and per-feature flags, who may use
// staff and member features, daily and monthly limits, and the usage log,
// which holds metadata only. Fictional people; no model is called.

const U = {
  admin: "a1000000-0000-4000-8000-0000000026a1",
  agent: "c1000000-0000-4000-8000-0000000026c1",
  agent2: "c2000000-0000-4000-8000-0000000026c2",
  buyer: "f1000000-0000-4000-8000-0000000026f1",
  buyer2: "f2000000-0000-4000-8000-0000000026f2",
} as const;
type Who = keyof typeof U;
const DEAL = "da000000-0000-4000-8000-0000000026d1";
const STAFF = "staff_test_feature";
const MEMBER = "member_test_feature";

interface Begin {
  allowed: boolean;
  reason?: string;
  run_id?: string;
}

describe("AI foundations (0026)", () => {
  let t: TestDb;
  // Runs as the API role with grants and RLS, and keeps what it writes.
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
  const begin = async (who: Who, feature: string, deal: string | null = null) => (await act<{ r: Begin }>(who, `select ai_begin($1, $2) as r`, [feature, deal]))[0]!.r;
  const finish = (who: Who, run: string, status = "ok", input = 0, output = 0, cost = 0) =>
    act(who, `select ai_finish($1, $2, 'claude-opus-5-5', $3, $4, 0, $5, 1200)`, [run, status, input, output, cost]);
  const flags = (on: Record<string, boolean>) =>
    Promise.all(Object.entries(on).map(([k, v]) => t.query(`update feature_flags set enabled = $2 where key = $1`, [k, v])));

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.agent2, { role: "agent" });
    await createUser(t, U.buyer);
    await createUser(t, U.buyer2);
    await t.exec(`
      insert into feature_flags (key, description) values ('ai_${STAFF}', 'test only'), ('ai_${MEMBER}', 'test only');
      update app_settings set ai_zdr_confirmed_at = now();
      insert into deals (id, address, ratification_date, agent_id, created_by) values ('${DEAL}', '1 Fictional Way', current_date, '${U.agent}', '${U.agent}');
    `);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.exec(`delete from ai_runs; delete from staff_audit;
      update app_settings set ai_daily_requests_staff = 100, ai_daily_requests_member = 30, ai_daily_tokens_staff = 3000000, ai_daily_tokens_member = 300000, ai_monthly_budget_usd = 100`);
    await flags({ ai_enabled: true, [`ai_${STAFF}`]: true, [`ai_${MEMBER}`]: true });
  });

  describe("switches", () => {
    it("ships with the master switch off", async () => {
      const fresh = await createTestDb();
      expect(await fresh.query(`select enabled from feature_flags where key = 'ai_enabled'`)).toEqual([{ enabled: false }]);
      await fresh.close();
    });

    it("needs the master switch and the feature's own flag", async () => {
      await flags({ ai_enabled: false });
      expect(await begin("agent", STAFF)).toEqual({ allowed: false, reason: "off" });
      await flags({ ai_enabled: true, [`ai_${STAFF}`]: false });
      expect(await begin("agent", STAFF)).toEqual({ allowed: false, reason: "off" });
      expect(await begin("agent", "staff_never_registered")).toEqual({ allowed: false, reason: "off" });
      expect(await t.query(`select count(*)::int as n from ai_runs`)).toEqual([{ n: 0 }]);
      await flags({ [`ai_${STAFF}`]: true });
      const r = await begin("agent", STAFF);
      expect(r.allowed).toBe(true);
      expect(await t.query(`select profile_id, feature, status from ai_runs where id = $1`, [r.run_id])).toEqual([{ profile_id: U.agent, feature: STAFF, status: "started" }]);
    });
  });

  describe("who may use what", () => {
    it("staff features are for staff, member features for buyers and sellers", async () => {
      await expect(begin("buyer", STAFF)).rejects.toThrow(/not_allowed/);
      await expect(begin("agent", MEMBER)).rejects.toThrow(/not_allowed/);
      expect((await begin("buyer", MEMBER)).allowed).toBe(true);
      await expect(act("anon", `select ai_begin($1)`, [MEMBER])).rejects.toThrow(/permission denied/);
    });

    it("refuses odd feature names and deals the caller can't see", async () => {
      await expect(begin("agent", "staff_x'; drop table leads; --")).rejects.toThrow(/unknown_feature/);
      await expect(begin("agent", "other_feature")).rejects.toThrow(/unknown_feature/);
      await expect(begin("agent2", STAFF, DEAL)).rejects.toThrow(/not_allowed/);
      const r = await begin("agent", STAFF, DEAL);
      expect(await t.query(`select deal_id from ai_runs where id = $1`, [r.run_id])).toEqual([{ deal_id: DEAL }]);
    });
  });

  describe("limits", () => {
    it("stops at the daily request limit, per person", async () => {
      await t.exec(`update app_settings set ai_daily_requests_member = 2`);
      expect((await begin("buyer", MEMBER)).allowed).toBe(true);
      expect((await begin("buyer", MEMBER)).allowed).toBe(true);
      expect(await begin("buyer", MEMBER)).toEqual({ allowed: false, reason: "daily_requests" });
      expect((await begin("buyer2", MEMBER)).allowed).toBe(true);
      // Yesterday's requests don't count.
      await t.exec(`update ai_runs set created_at = created_at - interval '2 days' where profile_id = '${U.buyer}'`);
      expect((await begin("buyer", MEMBER)).allowed).toBe(true);
    });

    it("stops at the daily token limit", async () => {
      await t.exec(`update app_settings set ai_daily_tokens_member = 1000`);
      const r = await begin("buyer", MEMBER);
      await finish("buyer", r.run_id!, "ok", 900, 200);
      expect(await begin("buyer", MEMBER)).toEqual({ allowed: false, reason: "daily_tokens" });
    });

    it("stops everyone at the monthly budget", async () => {
      await t.exec(`update app_settings set ai_monthly_budget_usd = 1`);
      const r = await begin("agent", STAFF);
      await finish("agent", r.run_id!, "ok", 100, 100, 1_000_000);
      expect(await begin("buyer", MEMBER)).toEqual({ allowed: false, reason: "monthly_budget" });
      expect(await begin("agent2", STAFF)).toEqual({ allowed: false, reason: "monthly_budget" });
    });

    it("admins change limits (audited); others can't", async () => {
      await expect(act("agent", `select set_ai_limits(p_monthly_budget_usd => 5000)`)).rejects.toThrow(/admin_only/);
      await expect(act("agent", `update app_settings set ai_monthly_budget_usd = 5000`)).rejects.toThrow(/permission denied/);
      await act("admin", `select set_ai_limits(p_requests_member => 10, p_monthly_budget_usd => 250)`);
      expect(await t.query(`select ai_daily_requests_member, ai_daily_requests_staff, ai_monthly_budget_usd from app_settings`)).toEqual([
        { ai_daily_requests_member: 10, ai_daily_requests_staff: 100, ai_monthly_budget_usd: 250 },
      ]);
      expect(await t.query(`select action, detail from staff_audit`)).toEqual([{ action: "set_ai_limits", detail: { requests_member: 10, monthly_budget_usd: 250 } }]);
    });

    it("shows people their own usage today", async () => {
      const r = await begin("buyer", MEMBER);
      await finish("buyer", r.run_id!, "ok", 500, 250);
      expect((await act<{ u: unknown }>("buyer", `select ai_usage_today() as u`))[0]!.u).toEqual({ enabled: true, requests: 1, tokens: 750, requests_limit: 30, tokens_limit: 300000 });
      expect((await act<{ u: { requests: number; requests_limit: number } }>("agent", `select ai_usage_today() as u`))[0]!.u).toMatchObject({ requests: 0, requests_limit: 100 });
    });
  });

  describe("the usage log", () => {
    it("is closed once, by the person who started it", async () => {
      const r = await begin("buyer", MEMBER);
      await expect(finish("buyer2", r.run_id!)).rejects.toThrow(/not_found/);
      await expect(finish("buyer", r.run_id!, "started")).rejects.toThrow(/bad_status/);
      await finish("buyer", r.run_id!, "refused", 10, 0);
      await expect(finish("buyer", r.run_id!, "ok", 0, 0)).rejects.toThrow(/not_found/);
      expect(await t.query(`select status, model, input_tokens, duration_ms, finished_at is not null as done from ai_runs`)).toEqual([
        { status: "refused", model: "claude-opus-5-5", input_tokens: 10, duration_ms: 1200, done: true },
      ]);
    });

    it("holds metadata only: no column for questions, documents or answers", async () => {
      const cols = await t.query<{ column_name: string; data_type: string }>(
        `select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'ai_runs' order by column_name`,
      );
      expect(cols.map((c) => c.column_name)).toEqual([
        "cache_read_tokens",
        "cost_micros",
        "created_at",
        "deal_id",
        "duration_ms",
        "feature",
        "finished_at",
        "id",
        "input_tokens",
        "model",
        "output_tokens",
        "profile_id",
        "status",
      ]);
      expect(cols.filter((c) => ["jsonb", "json", "bytea"].includes(c.data_type))).toEqual([]);
    });

    it("is read by admins only, and written by nobody directly", async () => {
      await begin("buyer", MEMBER);
      await begin("agent", STAFF);
      expect((await act("admin", `select id from ai_runs`)).length).toBe(2);
      expect(await act("buyer", `select id from ai_runs`)).toEqual([]);
      expect(await act("agent", `select id from ai_runs`)).toEqual([]);
      await expect(act("anon", `select id from ai_runs`)).rejects.toThrow(/permission denied/);
      await expect(act("admin", `insert into ai_runs (profile_id, feature) values ($1, $2)`, [U.admin, STAFF])).rejects.toThrow(/permission denied/);
      await expect(act("buyer", `update ai_runs set input_tokens = 0`)).rejects.toThrow(/permission denied/);
      await expect(act("buyer", `delete from ai_runs`)).rejects.toThrow(/permission denied/);
    });

    it("goes when the person's account is deleted", async () => {
      await begin("buyer2", MEMBER);
      await t.query(`delete from auth.users where id = $1`, [U.buyer2]);
      expect(await t.query(`select count(*)::int as n from ai_runs where profile_id = $1`, [U.buyer2])).toEqual([{ n: 0 }]);
    });
  });
});
