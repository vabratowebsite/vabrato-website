import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type TestDb } from "./harness";

// S6b PR 2 (0027): the Zero Data Retention gate on the master switch, admin
// AI controls, the budget alert, the month summary, and the contract staging
// folder. Fictional people; no model is called.

const U = {
  admin: "a1000000-0000-4000-8000-0000000027a1",
  admin2: "a2000000-0000-4000-8000-0000000027a2",
  agent: "c1000000-0000-4000-8000-0000000027c1",
  agent2: "c2000000-0000-4000-8000-0000000027c2",
  buyer: "f1000000-0000-4000-8000-0000000027f1",
} as const;
type Who = keyof typeof U;
const READER = "staff_contract_reader";

describe("VA assistant controls (0027)", () => {
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
  const run = async (who: Who, cost: number) => {
    const r = (await act<{ r: { run_id: string } }>(who, `select ai_begin($1) as r`, [READER]))[0]!.r;
    await act(who, `select ai_finish($1, 'ok', 'claude-opus-5-5', 1000, 100, 0, $2, 500)`, [r.run_id, cost]);
  };
  const alerts = () => t.query<{ recipient_id: string; title: string }>(`select recipient_id, title from staff_notifications where kind = 'ai_budget' order by created_at, recipient_id`);

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.admin2, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.agent2, { role: "agent" });
    await createUser(t, U.buyer);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.exec(`delete from ai_runs; delete from staff_notifications; delete from staff_audit;
      update feature_flags set enabled = false where key like 'ai\\_%';
      update app_settings set ai_zdr_confirmed_at = null, ai_zdr_confirmed_by = null, ai_zdr_note = null, ai_monthly_budget_usd = 100`);
  });

  describe("Zero Data Retention gate", () => {
    it("the master switch can't be turned on until an admin records the confirmation", async () => {
      await expect(act("admin", `select set_ai_flag('ai_enabled', true)`)).rejects.toThrow(/zdr_not_confirmed/);
      await expect(act("admin", `update feature_flags set enabled = true where key = 'ai_enabled'`)).rejects.toThrow(/zdr_not_confirmed/);
      // Even directly in SQL.
      await expect(t.exec(`update feature_flags set enabled = true where key = 'ai_enabled'`)).rejects.toThrow(/zdr_not_confirmed/);
      await expect(act("agent", `select confirm_ai_zdr('I have it')`)).rejects.toThrow(/admin_only/);
      await expect(act("admin", `select confirm_ai_zdr('  ')`)).rejects.toThrow(/note_required/);
      await act("admin", `select confirm_ai_zdr('Email from Anthropic, 2026-11-20 (fictional)')`);
      await act("admin", `select set_ai_flag('ai_enabled', true)`);
      expect(await t.query(`select enabled from feature_flags where key = 'ai_enabled'`)).toEqual([{ enabled: true }]);
      expect(await t.query(`select ai_zdr_confirmed_by, ai_zdr_note from app_settings`)).toEqual([{ ai_zdr_confirmed_by: U.admin, ai_zdr_note: "Email from Anthropic, 2026-11-20 (fictional)" }]);
      expect((await t.query<{ action: string }>(`select action from staff_audit order by id`)).map((r) => r.action)).toEqual(["confirm_ai_zdr", "set_ai_flag"]);
    });

    it("other flags, and switching the master off, need no confirmation", async () => {
      await act("admin", `select set_ai_flag('ai_staff_contract_reader', true)`);
      await t.exec(`update feature_flags set enabled = true where key = 'public_stats'; update feature_flags set enabled = false where key = 'public_stats'`);
      await act("admin", `select set_ai_flag('ai_enabled', false)`);
    });
  });

  describe("switches", () => {
    it("only admins flip AI flags, only AI flags, audited", async () => {
      await expect(act("agent", `select set_ai_flag('ai_staff_contract_reader', true)`)).rejects.toThrow(/admin_only/);
      await expect(act("admin", `select set_ai_flag('public_sold', true)`)).rejects.toThrow(/not_an_ai_flag/);
      await expect(act("admin", `select set_ai_flag('ai_staff_nothing', true)`)).rejects.toThrow(/not_found/);
      await act("admin", `select set_ai_flag('ai_staff_contract_reader', true)`);
      expect(await t.query(`select ref_id, detail from staff_audit`)).toEqual([{ ref_id: "ai_staff_contract_reader", detail: { enabled: true } }]);
      expect(await t.query(`select enabled from feature_flags where key = 'public_sold'`)).toEqual([{ enabled: false }]);
    });

    it("the contract reader ships off", async () => {
      expect(await t.query(`select enabled from feature_flags where key = 'ai_staff_contract_reader'`)).toEqual([{ enabled: false }]);
    });
  });

  describe("budget alert and month summary", () => {
    beforeEach(async () => {
      await t.exec(`update app_settings set ai_zdr_confirmed_at = now(), ai_monthly_budget_usd = 10;
        update feature_flags set enabled = true where key in ('ai_enabled', 'ai_staff_contract_reader')`);
    });

    it("alerts every admin once at 80% and once when the budget is reached", async () => {
      await run("agent", 7_000_000);
      expect(await alerts()).toEqual([]);
      await run("agent", 1_500_000); // 85%
      expect((await alerts()).map((a) => a.recipient_id).sort()).toEqual([U.admin, U.admin2].sort());
      expect((await alerts())[0]!.title).toBe("AI budget: 80% of this month's $10 is used");
      await run("agent2", 500_000); // 90%: no second 80% alert
      expect((await alerts()).length).toBe(2);
      await run("agent", 1_500_000); // 105%
      expect((await alerts()).length).toBe(4);
      expect((await alerts())[3]!.title).toMatch(/^AI budget reached/);
      expect((await act<{ r: unknown }>("agent", `select ai_begin($1) as r`, [READER]))[0]!.r).toEqual({ allowed: false, reason: "monthly_budget" });
    });

    it("one large request that jumps past both thresholds sends the 'reached' alert only", async () => {
      await run("agent", 12_000_000);
      expect((await alerts()).map((a) => a.title)).toEqual(Array(2).fill("AI budget reached: the assistant is paused until the budget is raised or the month ends"));
    });

    it("summarizes the month for admins only", async () => {
      await run("agent", 2_000_000);
      await run("agent2", 500_000);
      const [{ s }] = await act<{ s: unknown }>("admin", `select ai_month_summary() as s`) as [{ s: unknown }];
      expect(s).toEqual({ budget_usd: 10, spent_micros: 2_500_000, requests: 2, by_feature: [{ feature: READER, requests: 2, cost_micros: 2_500_000, not_ok: 0 }] });
      await expect(act("agent", `select ai_month_summary()`)).rejects.toThrow(/admin_only/);
      await expect(act("anon", `select ai_month_summary()`)).rejects.toThrow(/permission denied/);
    });
  });

  describe("contract staging folder", () => {
    const put = (who: Who | "anon", name: string) =>
      t.as(who === "anon" ? "anon" : "authenticated", who === "anon" ? null : U[who], (q) => q(`insert into storage.objects (bucket_id, name) values ('deal-docs', $1) returning name`, [name]));

    it("staff upload only into their own intake folder", async () => {
      expect(await put("agent", `intake/${U.agent}/0f8c6f2e-1111-4222-8333-944444444444.pdf`)).toHaveLength(1);
      await expect(put("agent", `intake/${U.agent2}/x.pdf`)).rejects.toThrow(/row-level security/);
      await expect(put("buyer", `intake/${U.buyer}/x.pdf`)).rejects.toThrow(/row-level security/);
      await expect(put("anon", `intake/${U.agent}/x.pdf`)).rejects.toThrow(/row-level security/);
    });

    it("other staff can't read or delete a staged contract (admins read all deal documents, as before)", async () => {
      await t.query(`insert into storage.objects (bucket_id, name) values ('deal-docs', $1)`, [`intake/${U.agent}/contract.pdf`]);
      const see = (who: Who) => t.as("authenticated", U[who], (q) => q(`select name from storage.objects where bucket_id = 'deal-docs' and name like 'intake/%'`));
      expect(await see("agent")).toHaveLength(1);
      expect(await see("agent2")).toEqual([]);
      expect(await see("admin")).toHaveLength(1);
      expect(await t.as("authenticated", U.buyer, (q) => q(`select name from storage.objects where bucket_id = 'deal-docs'`))).toEqual([]);
      expect(await t.as("authenticated", U.agent2, (q) => q(`delete from storage.objects where name like 'intake/%' returning name`))).toEqual([]);
      expect(await t.as("authenticated", U.agent, (q) => q(`delete from storage.objects where name like 'intake/%' returning name`))).toHaveLength(1);
    });
  });
});
