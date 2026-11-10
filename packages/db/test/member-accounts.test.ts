import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S5 PR 1 (0016): member accounts. Members change their own profile only
// through RPCs (review item 6); role choice never reaches staff roles; VOW
// acceptance is refused while vow_enabled is off (review item 1); new members
// get the default agent from app_settings (review item 11); deletion requests
// go to an admin queue (review item 14). All people are fictional.

const U = {
  mark: "d0000000-0000-4000-8000-0000000000d1", // admin and default agent
  agent: "a1000000-0000-4000-8000-0000000000a1",
  va: "c0000000-0000-4000-8000-0000000000c1",
  buyer: "a2000000-0000-4000-8000-0000000000a2",
  buyer2: "b2000000-0000-4000-8000-0000000000b2",
  dealSeller: "a3000000-0000-4000-8000-0000000000a3",
} as const;
type Who = keyof typeof U;

const DENIED = /permission denied|row-level security/;

describe("member accounts (0016)", () => {
  let t: TestDb;
  const as = <T>(who: Who | "anon", fn: (q: Query) => Promise<T>) =>
    who === "anon" ? t.as("anon", null, fn) : t.as("authenticated", U[who], fn);
  const profile = async (id: string) =>
    (await t.query<Record<string, unknown>>(`select * from profiles where id = $1`, [id]))[0]!;

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.mark, { role: "admin" });
    await t.query(`update app_settings set default_agent_id = $1`, [U.mark]);
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.va, { role: "va" });
    await createUser(t, U.buyer);
    await createUser(t, U.buyer2);
    await createUser(t, U.dealSeller, { role: "seller" });
    await t.exec(`
      insert into deals (id, address, ratification_date, agent_id, created_by)
        values ('da000000-0000-4000-8000-0000000000d1', '10 Fiction Rd, San Carlos', '2026-10-01', '${U.agent}', '${U.agent}');
      insert into deal_members (deal_id, profile_id, member_role)
        values ('da000000-0000-4000-8000-0000000000d1', '${U.dealSeller}', 'seller');
    `);
  });
  afterAll(() => t.close());

  describe("default agent (app_settings)", () => {
    it("assigns new members the default agent", async () => {
      expect((await profile(U.buyer)).agent_id).toBe(U.mark);
    });

    it("only accepts an agent or admin as the default agent or an assigned agent", async () => {
      await expect(t.query(`update app_settings set default_agent_id = $1`, [U.va])).rejects.toThrow(/agent or admin/);
      await expect(t.query(`update profiles set agent_id = $1 where id = $2`, [U.buyer2, U.buyer])).rejects.toThrow(/agent or admin/);
    });

    it("is readable by staff, changeable by admins only, invisible to members", async () => {
      expect(await as("buyer", (q) => q(`select * from app_settings`))).toEqual([]);
      expect(await as("va", (q) => q(`select default_agent_id from app_settings`))).toEqual([{ default_agent_id: U.mark }]);
      expect(await as("agent", (q) => q(`update app_settings set default_agent_id = '${U.agent}' returning id`))).toEqual([]);
      expect(await as("mark", (q) => q(`update app_settings set default_agent_id = '${U.agent}' returning default_agent_id`))).toEqual([
        { default_agent_id: U.agent },
      ]);
    });
  });

  describe("no direct profile writes (review item 6)", () => {
    it.each([
      ["role", "'admin'"],
      ["agent_id", `'${U.agent}'`],
      ["vow_accepted_at", "now()"],
      ["vow_terms_version", "'2026-11-10'"],
      ["phone", "'650-555-0199'"],
      ["alerts_email_opt_in", "true"],
      ["onboarded_at", "now()"],
    ])("a member cannot UPDATE profiles.%s", async (col, value) => {
      await expect(as("buyer", (q) => q(`update profiles set ${col} = ${value} where id = '${U.buyer}'`))).rejects.toThrow(DENIED);
    });
  });

  describe("set_member_role", () => {
    it("lets a member choose buyer, seller or both", async () => {
      expect(await as("buyer", (q) => q(`select public.set_member_role('both') as r`))).toEqual([{ r: "both" }]);
      expect(await as("buyer", (q) => q(`select public.set_member_role('seller') as r`))).toEqual([{ r: "seller" }]);
    });

    it("keeps the seller view for a seller on a deal who picks buyer", async () => {
      expect(await as("dealSeller", (q) => q(`select public.set_member_role('buyer') as r`))).toEqual([{ r: "both" }]);
    });

    it("never grants or changes a staff role", async () => {
      await expect(as("buyer", (q) => q(`select public.set_member_role('admin')`))).rejects.toThrow(/invalid_role/);
      await expect(as("buyer", (q) => q(`select public.set_member_role('agent')`))).rejects.toThrow(/invalid_role/);
      await expect(as("agent", (q) => q(`select public.set_member_role('buyer')`))).rejects.toThrow(/role_not_member/);
    });

    it("is not callable signed out", async () => {
      await expect(as("anon", (q) => q(`select public.set_member_role('buyer')`))).rejects.toThrow(/permission denied/);
    });
  });

  describe("update_my_profile and set_alert_emails", () => {
    it("change only the caller's own row", async () => {
      await as("buyer", async (q) => {
        await q(`select public.update_my_profile('Jordan Example', '650-555-0101')`);
        await q(`select public.set_alert_emails(true)`);
        expect(await q(`select full_name, phone, alerts_email_opt_in, alerts_opt_in_at is not null as at from profiles where id = '${U.buyer}'`)).toEqual([
          { full_name: "Jordan Example", phone: "650-555-0101", alerts_email_opt_in: true, at: true },
        ]);
        expect(await q(`select full_name from profiles where id = '${U.buyer2}'`)).toEqual([]);
      });
      expect((await profile(U.buyer2)).full_name).toBe("");
    });

    it("rejects a malformed phone number", async () => {
      await expect(as("buyer", (q) => q(`select public.update_my_profile('A', 'call me')`))).rejects.toThrow(/check constraint/);
    });

    it("clears the consent time when alerts are turned off", async () => {
      await as("buyer", async (q) => {
        await q(`select public.set_alert_emails(true)`);
        await q(`select public.set_alert_emails(false)`);
        expect(await q(`select alerts_email_opt_in, alerts_opt_in_at from profiles where id = '${U.buyer}'`)).toEqual([
          { alerts_email_opt_in: false, alerts_opt_in_at: null },
        ]);
      });
    });
  });

  describe("accept_vow_terms (MLS-6)", () => {
    it("is refused while vow_enabled is off", async () => {
      await expect(as("buyer", (q) => q(`select public.accept_vow_terms('2026-11-10')`))).rejects.toThrow(/vow_disabled/);
    });

    it("records version and time once the flag is on", async () => {
      await as("buyer", async (q) => {
        await q(`set local role postgres`);
        await q(`update feature_flags set enabled = true where key = 'vow_enabled'`);
        await q(`set local role authenticated`);
        await expect(q(`select public.accept_vow_terms('v1')`)).rejects.toThrow(/invalid_version/);
      });
      await as("buyer", async (q) => {
        await q(`set local role postgres`);
        await q(`update feature_flags set enabled = true where key = 'vow_enabled'`);
        await q(`set local role authenticated`);
        await q(`select public.accept_vow_terms('2026-11-10')`);
        expect(await q(`select vow_terms_version, vow_accepted_at is not null as at, public.has_vow_access() as vow from profiles where id = '${U.buyer}'`)).toEqual([
          { vow_terms_version: "2026-11-10", at: true, vow: true },
        ]);
      });
    });
  });

  it("complete_onboarding sets onboarded_at once", async () => {
    await as("buyer", async (q) => {
      await q(`select public.complete_onboarding()`);
      const [first] = await q<{ onboarded_at: string }>(`select onboarded_at from profiles where id = '${U.buyer}'`);
      await q(`select public.complete_onboarding()`);
      expect(await q(`select onboarded_at from profiles where id = '${U.buyer}'`)).toEqual([first]);
    });
  });

  describe("account deletion requests (review item 14)", () => {
    it("one pending request per member, visible to that member and admins only", async () => {
      await t.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U.buyer2}', false);
        select public.request_account_deletion(); select public.request_account_deletion();
        reset role; select set_config('request.jwt.claim.sub', '', false);`);
      expect(await t.query(`select status from account_deletion_requests where profile_id = $1`, [U.buyer2])).toEqual([{ status: "pending" }]);
      expect(await as("buyer2", (q) => q(`select status from account_deletion_requests`))).toEqual([{ status: "pending" }]);
      expect(await as("buyer", (q) => q(`select * from account_deletion_requests`))).toEqual([]);
      expect(await as("agent", (q) => q(`select * from account_deletion_requests`))).toEqual([]);
      expect(await as("mark", (q) => q(`select count(*)::int as n from account_deletion_requests`))).toEqual([{ n: 1 }]);
    });

    it("can't be inserted or closed by members", async () => {
      await expect(as("buyer", (q) => q(`insert into account_deletion_requests (profile_id) values ('${U.buyer}')`))).rejects.toThrow(DENIED);
      expect(await as("buyer2", (q) => q(`update account_deletion_requests set status = 'cancelled' returning id`))).toEqual([]);
      expect(await as("mark", (q) => q(`update account_deletion_requests set status = 'completed', handled_by = '${U.mark}', handled_at = now() returning status`))).toEqual([
        { status: "completed" },
      ]);
    });
  });

  describe("SECURITY DEFINER hygiene (review item 6)", () => {
    // Definer functions anon may call on purpose (signed-out public pages, 0014).
    const ANON_OK = new Set(["mls_last_updated", "public_own_sold"]);

    it("every definer function pins search_path and isn't executable by PUBLIC", async () => {
      const fns = await t.query<{ name: string; config: string[] | null; public_exec: boolean }>(`
        select p.proname as name, p.proconfig as config,
          exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_exec
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef`);
      expect(fns.length).toBeGreaterThan(20);
      for (const f of fns) {
        expect(f.config?.some((c) => c.startsWith("search_path=")), `${f.name} search_path`).toBe(true);
        expect(f.public_exec, `${f.name} executable by PUBLIC`).toBe(false);
      }
    });

    it("anon can execute only the intended public definer functions", async () => {
      const callable = await t.query<{ name: string }>(`
        select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')`);
      expect(callable.map((r) => r.name).filter((n) => !ANON_OK.has(n))).toEqual([]);
    });
  });
});
