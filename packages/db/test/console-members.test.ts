import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type TestDb } from "./harness";

// S6 PR 3 (0023): member agent changes, MLS sync alerts (once per incident,
// only while the feed is live), verify_agent_access (ACC-1 at sign-in) and
// the full_data_enabled switch. Fictional people and members only.

const U = {
  mark: "a1000000-0000-4000-8000-0000000007a1",
  viv: "b1000000-0000-4000-8000-0000000007b1",
  agent: "c1000000-0000-4000-8000-0000000007c1",
  va: "d1000000-0000-4000-8000-0000000007d1",
  admin2: "e1000000-0000-4000-8000-0000000007e1",
  member: "f1000000-0000-4000-8000-0000000007f1",
} as const;

describe("console members, sync alerts, ACC-1 (0023)", () => {
  let t: TestDb;
  const act = async <T>(who: keyof typeof U, sql: string, params: unknown[] = []) => {
    await t.query(`select set_config('request.jwt.claim.sub', $1, false)`, [U[who]]);
    try {
      return await t.query<T>(sql, params);
    } finally {
      await t.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  };
  const sweep = async () => (await t.query<{ s: { sync: string } }>(`select notification_sweep() as s`))[0]!.s.sync;
  const alerts = (kind: string) => t.query<{ recipient_id: string }>(`select recipient_id from staff_notifications where kind = $1 order by recipient_id`, [kind]);
  const run = (status: "succeeded" | "failed", minutesAgo: number) =>
    t.query(`insert into mls_sync_runs (kind, status, started_at, finished_at) values ('incremental', $1, now() - make_interval(mins => $2), now() - make_interval(mins => $2))`, [status, minutesAgo]);

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.mark, { role: "admin" });
    await createUser(t, U.viv, { role: "agent" });
    await createUser(t, U.agent, { role: "agent", email: "agent.one@example.test" });
    await createUser(t, U.va, { role: "va" });
    await createUser(t, U.admin2, { role: "admin" });
    await createUser(t, U.member, { role: "buyer" });
    await t.exec(`update app_settings set lead_admin_id = '${U.mark}', backup_admin_id = '${U.viv}'`);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.exec(`delete from staff_notifications; delete from notifications; delete from staff_audit; delete from mls_sync_runs;
                  update sync_alert_state set incident_open = false, opened_at = null, closed_at = null;
                  update app_settings set mls_sync_live = false, lead_admin_away = false`);
  });

  describe("member agent", () => {
    it("only the acting lead admin changes it, only to an agent or admin, audited", async () => {
      await expect(act("agent", `select set_member_agent($1, $2)`, [U.member, U.agent])).rejects.toThrow(/lead_admin_only/);
      await expect(act("admin2", `select set_member_agent($1, $2)`, [U.member, U.agent])).rejects.toThrow(/lead_admin_only/);
      await expect(act("mark", `select set_member_agent($1, $2)`, [U.member, U.va])).rejects.toThrow(/not_an_agent/);
      await expect(act("mark", `select set_member_agent($1, $2)`, [U.viv, U.agent])).rejects.toThrow(/not_found/); // staff aren't members
      await act("mark", `select set_member_agent($1, $2)`, [U.member, U.agent]);
      expect(await t.query(`select agent_id from profiles where id = $1`, [U.member])).toEqual([{ agent_id: U.agent }]);
      expect(await t.query(`select action, detail from staff_audit`)).toEqual([{ action: "set_member_agent", detail: { from: null, to: U.agent } }]);
      await t.exec(`update app_settings set lead_admin_away = true`);
      await act("viv", `select set_member_agent($1, null)`, [U.member]);
      expect(await t.query(`select agent_id from profiles where id = $1`, [U.member])).toEqual([{ agent_id: null }]);
    });
  });

  describe("MLS sync alerts", () => {
    it("say nothing while the feed isn't live", async () => {
      await run("failed", 1);
      expect(await sweep()).toBe("not_live");
      expect(await alerts("sync_alert")).toEqual([]);
    });

    it("alert admins and the lead admin once per incident, then once on recovery", async () => {
      await t.exec(`update app_settings set mls_sync_live = true`);
      await run("succeeded", 50); // last success 50 minutes ago: stale
      expect(await sweep()).toBe("sync_alert");
      expect((await alerts("sync_alert")).map((r) => r.recipient_id).sort()).toEqual([U.mark, U.admin2].sort());
      expect((await t.query(`select template_key from notifications order by template_key`)).length).toBe(2);
      expect(await sweep()).toBe("open");
      expect((await alerts("sync_alert")).length).toBe(2);
      await run("succeeded", 1);
      expect(await sweep()).toBe("sync_recovered");
      expect((await alerts("sync_recovered")).length).toBe(2);
      expect(await sweep()).toBe("ok");
      const payload = (await t.query<{ payload: { lastSuccess: string } }>(`select payload from notifications where template_key = 'staff_sync_alert' limit 1`))[0]!.payload;
      expect(payload.lastSuccess).toMatch(/PT$/);
    });

    it("treat a failed latest run as an incident even when the last success is recent", async () => {
      await t.exec(`update app_settings set mls_sync_live = true`);
      await run("succeeded", 5);
      await run("failed", 1);
      expect(await sweep()).toBe("sync_alert");
    });

    it("are switched on by settings managers only, audited", async () => {
      await expect(act("agent", `select set_mls_sync_live(true)`)).rejects.toThrow(/not_allowed/);
      await act("admin2", `select set_mls_sync_live(true)`);
      expect(await t.query(`select mls_sync_live from app_settings`)).toEqual([{ mls_sync_live: true }]);
      expect(await t.query(`select action from staff_audit`)).toEqual([{ action: "set_mls_sync_live" }]);
    });
  });

  describe("ACC-1: verify_agent_access at sign-in", () => {
    beforeAll(async () => {
      await t.exec(`insert into mls_members (member_key, full_name, email, member_status, office_mls_id) values
        ('MB-A', 'Agent One', 'Agent.One@example.test', 'Active', 'VABRA'),
        ('MB-OTHER', 'Elsewhere', 'viv.other@example.test', 'Active', 'OTHER')`);
    });
    const verify = async (profile: string, email: string, office = "VABRA") =>
      (await t.query<{ r: { verified: boolean; member_key: string | null } }>(`select verify_agent_access($1, $2, $3) as r`, [profile, email, office]))[0]!.r;

    it("grants an active member of our office (email match ignores case)", async () => {
      expect(await verify(U.agent, "agent.one@example.test")).toEqual({ verified: true, member_key: "MB-A" });
      expect(await t.query(`select member_key, active from mls_agent_access where profile_id = $1`, [U.agent])).toEqual([{ member_key: "MB-A", active: true }]);
    });

    it("refuses another office, an unknown email, or no office configured", async () => {
      expect((await verify(U.viv, "viv.other@example.test")).verified).toBe(false);
      expect((await verify(U.viv, "nobody@example.test")).verified).toBe(false);
      expect((await verify(U.agent, "agent.one@example.test", "")).verified).toBe(false);
      expect(await t.query(`select count(*)::int as n from mls_agent_access where profile_id = $1`, [U.viv])).toEqual([{ n: 0 }]);
    });

    it("locks existing access when the member is no longer active", async () => {
      await t.exec(`update mls_members set member_status = 'Inactive' where member_key = 'MB-A'`);
      expect((await verify(U.agent, "agent.one@example.test")).verified).toBe(false);
      expect(await t.query(`select active from mls_agent_access where profile_id = $1`, [U.agent])).toEqual([{ active: false }]);
      await t.exec(`update mls_members set member_status = 'Active' where member_key = 'MB-A'`);
    });

    it("gives FULL data only with the flag on as well", async () => {
      await verify(U.agent, "agent.one@example.test");
      const full = () => t.as("authenticated", U.agent, (q) => q<{ f: boolean }>(`select has_full_mls_access() as f`)).then((r) => r[0]!.f);
      expect(await full()).toBe(false);
      await t.exec(`update feature_flags set enabled = true where key = 'full_data_enabled'`);
      expect(await full()).toBe(true);
      await t.exec(`update feature_flags set enabled = false where key = 'full_data_enabled'`);
    });

    it("isn't callable from the API", async () => {
      await expect(t.as("authenticated", U.agent, (q) => q(`select verify_agent_access($1, 'agent.one@example.test', 'VABRA')`, [U.agent]))).rejects.toThrow(/permission denied/);
      await expect(t.as("anon", null, (q) => q(`select check_sync_health()`))).rejects.toThrow(/permission denied/);
    });
  });
});
