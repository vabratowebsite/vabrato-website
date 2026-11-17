import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// Integrations PR 1 (0042): connected accounts. The encrypted tokens are
// readable by the server (service role) only; each staff member sees their own
// connection status; members and the public see nothing. The per-person
// calendar tables were replaced by the team calendar (0045, team-calendar.test.ts).
// Fictional people; the "token" is a placeholder.

const U = {
  admin: "a1000000-0000-4000-8000-0000000042a1",
  agent: "c1000000-0000-4000-8000-0000000042c1",
  agent2: "c2000000-0000-4000-8000-0000000042c2",
  seller: "e1000000-0000-4000-8000-0000000042e1",
  buyer: "f1000000-0000-4000-8000-0000000042f1",
} as const;
type Who = keyof typeof U | "anon";
const CIPHER = "v1.placeholder-ciphertext-not-a-token";

describe("connected accounts (0042)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) => t.as(who === "anon" ? "anon" : "authenticated", who === "anon" ? null : U[who], fn);
  const service = <T>(fn: (q: Query) => Promise<T>) => t.as("service_role", null, fn);

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.agent2, { role: "agent" });
    await createUser(t, U.seller, { role: "seller" });
    await createUser(t, U.buyer);
  });
  afterAll(() => t.close());
  beforeEach(() =>
    t.exec(`delete from staff_connections; delete from staff_audit; update feature_flags set enabled = false where key = 'integration_google_calendar';`),
  );

  // Setup as the database owner (each t.as call is rolled back).
  const connect = (who: keyof typeof U, email = "agent@example.test") =>
    t.query(`insert into staff_connections (profile_id, provider, account_email, scopes, token_ciphertext) values ($1, 'google', $2, '{calendar.events}', $3)`, [U[who], email, CIPHER]);

  it("adds the switch, off", async () => {
    expect(await t.query(`select key, enabled from feature_flags where key = 'integration_google_calendar'`)).toEqual([{ key: "integration_google_calendar", enabled: false }]);
  });

  describe("staff_connections: the server only", () => {
    it("the service role stores and reads a connection", async () => {
      const rows = await service(async (q) => {
        await q(`insert into staff_connections (profile_id, provider, token_ciphertext) values ($1, 'google', $2)`, [U.agent, CIPHER]);
        await q(`update staff_connections set last_synced_at = now(), last_error = 'reconnect' where profile_id = $1`, [U.agent]);
        return q(`select token_ciphertext, last_error from staff_connections where profile_id = $1`, [U.agent]);
      });
      expect(rows).toEqual([{ token_ciphertext: CIPHER, last_error: "reconnect" }]);
    });

    it("nobody signed in reads, adds, changes or removes one, not even its owner", async () => {
      await connect("agent");
      for (const who of ["agent", "admin", "agent2", "seller", "buyer", "anon"] as const) {
        await expect(as(who, (q) => q(`select token_ciphertext from staff_connections`))).rejects.toThrow(/permission denied/);
        await expect(as(who, (q) => q(`insert into staff_connections (profile_id, provider, token_ciphertext) values ($1, 'google', $2)`, [U.agent2, CIPHER]))).rejects.toThrow(/permission denied/);
        await expect(as(who, (q) => q(`update staff_connections set account_email = 'x@example.test'`))).rejects.toThrow(/permission denied/);
        await expect(as(who, (q) => q(`delete from staff_connections`))).rejects.toThrow(/permission denied/);
      }
      expect(await t.query(`select count(*)::int as n from staff_connections`)).toEqual([{ n: 1 }]);
    });

    it("one connection per person and provider; only known providers and errors", async () => {
      await connect("agent");
      await expect(connect("agent")).rejects.toThrow(/duplicate key/);
      await expect(t.query(`insert into staff_connections (profile_id, provider, token_ciphertext) values ($1, 'outlook', $2)`, [U.agent2, CIPHER])).rejects.toThrow(/check constraint/);
      await expect(t.query(`update staff_connections set last_error = 'the token was abc' where profile_id = $1`, [U.agent])).rejects.toThrow(/check constraint/);
    });

    it("my_connections shows a staff member their own, without the token", async () => {
      await connect("agent", "agent@example.test");
      await connect("agent2", "agent2@example.test");
      const mine = await as("agent", (q) => q(`select * from my_connections()`));
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ provider: "google", account_email: "agent@example.test", last_error: null });
      expect(Object.keys(mine[0]!)).not.toContain("token_ciphertext");
      expect(await as("admin", (q) => q(`select * from my_connections()`))).toEqual([]);
    });

    it("members and the public get nothing from my_connections", async () => {
      await t.query(`insert into staff_connections (profile_id, provider, token_ciphertext) values ($1, 'google', $2)`, [U.seller, CIPHER]);
      expect(await as("seller", (q) => q(`select * from my_connections()`))).toEqual([]);
      expect(await as("buyer", (q) => q(`select * from my_connections()`))).toEqual([]);
      await expect(as("anon", (q) => q(`select * from my_connections()`))).rejects.toThrow(/permission denied/);
    });
  });

  describe("set_integration_flag", () => {
    it("an admin turns the switch on and off, audited", async () => {
      const { on, audit } = await as("admin", async (q) => {
        await q(`select set_integration_flag('integration_google_calendar', true)`);
        const on = await q(`select enabled from feature_flags where key = 'integration_google_calendar'`);
        await q(`select set_integration_flag('integration_google_calendar', false)`);
        return { on, audit: await q(`select actor_id, action, ref_id, detail from staff_audit order by id`) };
      });
      expect(on).toEqual([{ enabled: true }]);
      expect(audit).toEqual([
        { actor_id: U.admin, action: "set_integration_flag", ref_id: "integration_google_calendar", detail: { enabled: true } },
        { actor_id: U.admin, action: "set_integration_flag", ref_id: "integration_google_calendar", detail: { enabled: false } },
      ]);
    });

    it("only admins, only integration switches", async () => {
      await expect(as("agent", (q) => q(`select set_integration_flag('integration_google_calendar', true)`))).rejects.toThrow(/admin_only/);
      await expect(as("seller", (q) => q(`select set_integration_flag('integration_google_calendar', true)`))).rejects.toThrow(/admin_only/);
      await expect(as("anon", (q) => q(`select set_integration_flag('integration_google_calendar', true)`))).rejects.toThrow(/permission denied/);
      await expect(as("admin", (q) => q(`select set_integration_flag('ai_enabled', true)`))).rejects.toThrow(/not_an_integration_flag/);
      await expect(as("admin", (q) => q(`select set_integration_flag('integration_nothing_here', true)`))).rejects.toThrow(/not_found/);
      expect(await t.query(`select enabled from feature_flags where key in ('integration_google_calendar', 'ai_enabled')`)).toEqual([{ enabled: false }, { enabled: false }]);
    });
  });

  it("removing a person removes their connection", async () => {
    await connect("agent2");
    await t.query(`delete from profiles where id = $1`, [U.agent2]);
    expect(await t.query(`select count(*)::int as n from staff_connections where profile_id = $1`, [U.agent2])).toEqual([{ n: 0 }]);
  });
});
