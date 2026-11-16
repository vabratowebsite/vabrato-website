import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type TestDb } from "./harness";

// AI test mode before Zero Data Retention (0044): named testers, test deals
// (locked at creation), typed-input features only when no deal is named, and
// the UIs' availability answer matching ai_begin. Fictional people.

const U = {
  admin: "a1000000-0000-4000-8000-0000000044a1",
  agent: "c1000000-0000-4000-8000-0000000044c1",
  agent2: "c2000000-0000-4000-8000-0000000044c2",
  seller: "e1000000-0000-4000-8000-0000000044e1",
  buyer: "f1000000-0000-4000-8000-0000000044f1",
  buyer2: "f2000000-0000-4000-8000-0000000044f2",
} as const;
type Who = keyof typeof U;
const TEST_DEAL = "da000000-0000-4000-8000-0000000044d1";
const REAL_DEAL = "da000000-0000-4000-8000-0000000044d2";
const email = (who: Who) => `${who}@example.test`;

interface Begin {
  allowed: boolean;
  reason?: string;
  run_id?: string;
}
interface Available {
  mode: "off" | "live" | "test";
  features: Record<string, boolean>;
}

describe("AI test mode (0044)", () => {
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
  const begin = async (who: Who, feature: string, deal: string | null = null) => (await act<{ r: Begin }>(who, `select ai_begin($1, $2) as r`, [feature, deal]))[0]!.r;
  const available = async (who: Who, features: string[], deal: string | null = null) =>
    (await act<{ r: Available }>(who, `select ai_features_available($1::text[], $2) as r`, [features, deal]))[0]!.r;
  const flags = (on: Record<string, boolean>) => Promise.all(Object.entries(on).map(([k, v]) => t.query(`update feature_flags set enabled = $2 where key = $1`, [k, v])));
  const testers = async (on: Who[]) => {
    await t.query(`update profiles set ai_tester = false`);
    if (on.length) await t.query(`update profiles set ai_tester = true where id = any($1::uuid[])`, [on.map((w) => U[w])]);
  };

  beforeAll(async () => {
    t = await createTestDb();
    for (const [who, role] of [
      ["admin", "admin"],
      ["agent", "agent"],
      ["agent2", "agent"],
      ["seller", "seller"],
      ["buyer", undefined],
      ["buyer2", undefined],
    ] as const)
      await createUser(t, U[who], { role, email: email(who) });
    await t.query(`insert into deals (id, address, ratification_date, agent_id, created_by, is_test) values ($1, 'TEST — 1 Fictional Way', current_date, $2, $2, true)`, [TEST_DEAL, U.agent]);
    await t.query(`insert into deals (id, address, ratification_date, agent_id, created_by) values ($1, '2 Fictional Way', current_date, $2, $2)`, [REAL_DEAL, U.agent]);
    await t.query(`insert into deal_members (deal_id, profile_id, member_role) values ($1, $3, 'seller'), ($2, $3, 'seller')`, [TEST_DEAL, REAL_DEAL, U.seller]);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.exec(`delete from ai_runs; delete from staff_audit; update feature_flags set enabled = false where key like 'ai\\_%'; update app_settings set ai_zdr_confirmed_at = null`);
    await testers(["admin", "agent", "seller", "buyer"]);
    await flags({ ai_test_mode: true });
  });

  describe("switches and columns", () => {
    it("ships with test mode off, no testers and no test deals", async () => {
      const fresh = await createTestDb();
      expect(await fresh.query(`select enabled from feature_flags where key = 'ai_test_mode'`)).toEqual([{ enabled: false }]);
      await createUser(fresh, U.agent, { role: "agent" });
      expect(await fresh.query(`select ai_tester from profiles`)).toEqual([{ ai_tester: false }]);
      await fresh.query(`insert into deals (address, ratification_date, agent_id, created_by) values ('3 Fictional Way', current_date, $1, $1)`, [U.agent]);
      expect(await fresh.query(`select is_test from deals`)).toEqual([{ is_test: false }]);
      await fresh.close();
    });

    it("test mode doesn't get around the ZDR guard on the master switch", async () => {
      await expect(t.query(`update feature_flags set enabled = true where key = 'ai_enabled'`)).rejects.toThrow(/zdr_not_confirmed/);
    });

    it("admins switch test mode with set_ai_flag (audited); others can't", async () => {
      await flags({ ai_test_mode: false });
      await expect(act("agent", `select set_ai_flag('ai_test_mode', true)`)).rejects.toThrow(/admin_only/);
      await act("admin", `select set_ai_flag('ai_test_mode', true)`);
      expect(await t.query(`select enabled from feature_flags where key = 'ai_test_mode'`)).toEqual([{ enabled: true }]);
      expect(await t.query(`select action, ref_id from staff_audit`)).toEqual([{ action: "set_ai_flag", ref_id: "ai_test_mode" }]);
    });
  });

  describe("test deals", () => {
    it("a deal's test status can't change after creation, by staff or directly", async () => {
      await expect(act("agent", `update deals set is_test = false where id = $1`, [TEST_DEAL])).rejects.toThrow(/is_test_locked/);
      await expect(act("admin", `update deals set is_test = true where id = $1`, [REAL_DEAL])).rejects.toThrow(/is_test_locked/);
      await expect(t.query(`update deals set is_test = true where id = $1`, [REAL_DEAL])).rejects.toThrow(/is_test_locked/);
      // Other changes still work.
      await act("agent", `update deals set address = 'TEST — 1 Fictional Way, San Carlos' where id = $1`, [TEST_DEAL]);
      expect(await t.query(`select is_test from deals where id = $1`, [TEST_DEAL])).toEqual([{ is_test: true }]);
    });

    it("staff choose it when they create a deal", async () => {
      await act("agent2", `insert into deals (address, ratification_date, agent_id, created_by, is_test) values ('TEST — 9 Fictional Way', current_date, $1, $1, true)`, [U.agent2]);
      expect(await t.query(`select is_test from deals where address = 'TEST — 9 Fictional Way'`)).toEqual([{ is_test: true }]);
    });
  });

  describe("testers", () => {
    it("set_ai_tester: admins only, by email, audited; unknown emails refused", async () => {
      await testers([]);
      await expect(act("agent", `select set_ai_tester($1, true)`, [email("agent")])).rejects.toThrow(/admin_only/);
      await expect(act("admin", `select set_ai_tester('nobody@example.test', true)`)).rejects.toThrow(/not_found/);
      await act("admin", `select set_ai_tester($1, true)`, [email("agent").toUpperCase()]);
      expect(await t.query(`select ai_tester from profiles where id = $1`, [U.agent])).toEqual([{ ai_tester: true }]);
      expect(await t.query(`select action, ref_id, detail from staff_audit`)).toEqual([{ action: "set_ai_tester", ref_id: U.agent, detail: { on: true } }]);
      await act("admin", `select set_ai_tester($1, false)`, [email("agent")]);
      expect(await t.query(`select ai_tester from profiles where id = $1`, [U.agent])).toEqual([{ ai_tester: false }]);
    });

    it("ai_testers lists them for admins only", async () => {
      expect(await act("admin", `select email, role from ai_testers()`)).toEqual([
        { email: email("admin"), role: "admin" },
        { email: email("agent"), role: "agent" },
        { email: email("buyer"), role: "buyer" },
        { email: email("seller"), role: "seller" },
      ]);
      await expect(act("agent", `select * from ai_testers()`)).rejects.toThrow(/admin_only/);
    });

    it("nobody can set their own tester flag", async () => {
      await expect(act("buyer2", `update profiles set ai_tester = true where id = $1`, [U.buyer2])).rejects.toThrow(/permission denied/);
    });

    it("the internal rule functions aren't callable from the API", async () => {
      await expect(act("agent", `select ai_test_scope('staff_contract_reader', null)`)).rejects.toThrow(/permission denied/);
      await expect(act("agent", `select ai_refusal('staff_contract_reader', null)`)).rejects.toThrow(/permission denied/);
    });
  });

  describe("the gate in test mode", () => {
    it("a tester runs on a test deal, not on a real one", async () => {
      expect(await begin("agent", "staff_document_check", TEST_DEAL)).toMatchObject({ allowed: true });
      expect(await begin("agent", "staff_document_check", REAL_DEAL)).toEqual({ allowed: false, reason: "test_only" });
      expect(await begin("seller", "member_summarize", TEST_DEAL)).toMatchObject({ allowed: true });
      expect(await begin("seller", "member_summarize", REAL_DEAL)).toEqual({ allowed: false, reason: "test_only" });
      expect(await t.query(`select feature, deal_id from ai_runs order by created_at`)).toEqual([
        { feature: "staff_document_check", deal_id: TEST_DEAL },
        { feature: "member_summarize", deal_id: TEST_DEAL },
      ]);
    });

    it("with no deal, only the typed-input features run", async () => {
      expect(await begin("agent", "staff_contract_reader")).toMatchObject({ allowed: true });
      for (const f of ["member_explain", "member_search", "member_draft", "member_cover_letter", "member_moving", "member_prelisting", "member_palette", "member_staging", "member_flyer", "member_summarize"])
        expect(await begin("buyer", f), f).toMatchObject({ allowed: true });
      for (const f of ["staff_daily_briefing", "staff_data_questions", "staff_member_summary", "staff_lead_reply", "staff_open_house_followup", "staff_call_notes", "staff_appointments"])
        expect(await begin("agent", f), f).toEqual({ allowed: false, reason: "test_only" });
    });

    it("handing a test deal to a feature that doesn't work on one deal doesn't let it run", async () => {
      for (const f of ["staff_daily_briefing", "staff_data_questions", "staff_member_summary", "staff_lead_reply", "staff_contract_reader", "staff_listing_kit"])
        expect(await begin("agent", f, TEST_DEAL), f).toEqual({ allowed: false, reason: "test_only" });
      for (const f of ["member_explain", "member_compare"]) expect(await begin("seller", f, TEST_DEAL), f).toEqual({ allowed: false, reason: "test_only" });
      expect((await available("agent", ["staff_daily_briefing", "staff_document_check"], TEST_DEAL)).features).toEqual({ staff_daily_briefing: false, staff_document_check: true });
    });

    it("every feature that works on one deal runs on a test deal", async () => {
      for (const f of ["staff_document_check", "staff_counter_changes", "staff_receipt_reader", "staff_inspection_items", "staff_repair_response", "staff_escrow_update", "staff_vendor_request", "staff_call_notes", "staff_appointments"])
        expect(await begin("agent", f, TEST_DEAL), f).toMatchObject({ allowed: true });
      for (const f of ["member_summarize", "member_draft", "member_cover_letter"]) expect(await begin("seller", f, TEST_DEAL), f).toMatchObject({ allowed: true });
    });

    it("MLS features stay off", async () => {
      for (const f of ["staff_listing_kit", "staff_presentations", "staff_market_update", "staff_cma_writeup"]) expect(await begin("agent", f), f).toEqual({ allowed: false, reason: "test_only" });
      for (const f of ["member_compare", "member_listing", "member_tour"]) expect(await begin("buyer", f), f).toEqual({ allowed: false, reason: "test_only" });
    });

    it("non-testers get nothing; with test mode off, nobody does", async () => {
      expect(await begin("buyer2", "member_explain")).toEqual({ allowed: false, reason: "off" });
      expect(await begin("agent2", "staff_contract_reader")).toEqual({ allowed: false, reason: "off" });
      await flags({ ai_test_mode: false });
      expect(await begin("agent", "staff_document_check", TEST_DEAL)).toEqual({ allowed: false, reason: "off" });
      expect(await begin("buyer", "member_explain")).toEqual({ allowed: false, reason: "off" });
      expect(await t.query(`select count(*)::int as n from ai_runs`)).toEqual([{ n: 0 }]);
    });

    it("per-feature switches don't matter in test mode", async () => {
      await flags({ ai_staff_document_check: false, ai_member_explain: true });
      expect(await begin("agent", "staff_document_check", TEST_DEAL)).toMatchObject({ allowed: true });
      expect(await begin("buyer", "member_explain")).toMatchObject({ allowed: true });
    });

    it("the usual checks still come first: role, deal access, limits", async () => {
      await expect(begin("buyer", "staff_contract_reader")).rejects.toThrow(/not_allowed/);
      await expect(begin("agent", "member_explain")).rejects.toThrow(/not_allowed/);
      await expect(begin("buyer", "member_summarize", TEST_DEAL)).rejects.toThrow(/not_allowed/);
      await t.query(`update app_settings set ai_daily_requests_staff = 0`);
      expect(await begin("agent", "staff_contract_reader")).toEqual({ allowed: false, reason: "daily_requests" });
      await t.query(`update app_settings set ai_daily_requests_staff = 100`);
    });
  });

  describe("once the master switch is on", () => {
    it("the normal path applies to everyone, test deals or not, whatever test mode says", async () => {
      await t.query(`update app_settings set ai_zdr_confirmed_at = now()`);
      await flags({ ai_enabled: true, ai_staff_document_check: true, ai_member_explain: true });
      expect(await begin("agent2", "staff_daily_briefing")).toEqual({ allowed: false, reason: "off" });
      expect(await begin("buyer2", "member_explain")).toMatchObject({ allowed: true });
      expect(await begin("agent", "staff_document_check", REAL_DEAL)).toMatchObject({ allowed: true });
      expect(await begin("agent", "staff_contract_reader")).toEqual({ allowed: false, reason: "off" });
      expect((await available("buyer2", ["member_explain"])).mode).toBe("live");
    });
  });

  describe("what the UIs read", () => {
    const STAFF = ["staff_contract_reader", "staff_document_check", "staff_daily_briefing", "staff_lead_reply", "staff_listing_kit"];
    const MEMBER = ["member_explain", "member_summarize", "member_compare"];

    it("matches ai_begin for every case", async () => {
      const cases: [Who, string[], string | null][] = [
        ["agent", STAFF, null],
        ["agent", STAFF, TEST_DEAL],
        ["agent", STAFF, REAL_DEAL],
        ["agent2", STAFF, null],
        ["buyer", MEMBER, null],
        ["seller", MEMBER, TEST_DEAL],
        ["seller", MEMBER, REAL_DEAL],
        ["buyer2", MEMBER, null],
      ];
      for (const [who, features, deal] of cases) {
        const shown = await available(who, features, deal);
        for (const f of features) {
          const r = await begin(who, f, deal).catch(() => ({ allowed: false }) as Begin);
          expect(shown.features[f], `${who} ${f} ${deal}`).toBe(r.allowed);
        }
      }
    });

    it("says which mode the caller is in, and hides the other kind of account's features", async () => {
      expect(await available("agent", ["staff_contract_reader", "member_explain"])).toEqual({ mode: "test", features: { staff_contract_reader: true, member_explain: false } });
      expect(await available("buyer2", ["member_explain"])).toEqual({ mode: "off", features: { member_explain: false } });
      expect(await available("agent2", ["staff_document_check"], TEST_DEAL)).toEqual({ mode: "off", features: { staff_document_check: false } });
      await flags({ ai_test_mode: false });
      expect(await available("agent", ["staff_contract_reader"])).toEqual({ mode: "off", features: { staff_contract_reader: false } });
    });

    it("a deal the caller can't open is never available, and odd names are skipped", async () => {
      await testers(["agent", "agent2"]);
      expect(await available("agent2", ["staff_document_check"], TEST_DEAL)).toEqual({ mode: "test", features: { staff_document_check: false } });
      expect(await available("agent", ["DROP TABLE", "staff_document_check"], TEST_DEAL)).toEqual({ mode: "test", features: { staff_document_check: true } });
      await expect(act("anon", `select ai_features_available(array['member_explain'])`)).rejects.toThrow(/permission denied/);
    });
  });
});
