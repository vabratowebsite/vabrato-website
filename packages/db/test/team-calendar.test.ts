import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// The team Google Calendar (0045): one connection, made by an admin, whose
// encrypted token only the server reads; the events we put on it, readable
// by staff; and team_calendar_status() for the Settings page, without the
// token. Members and the public see nothing. Fictional people; the "token" is
// a placeholder.

const U = {
  admin: "a1000000-0000-4000-8000-0000000045a1",
  agent: "c1000000-0000-4000-8000-0000000045c1",
  seller: "e1000000-0000-4000-8000-0000000045e1",
  buyer: "f1000000-0000-4000-8000-0000000045f1",
} as const;
type Who = keyof typeof U | "anon";
const CIPHER = "v1.placeholder-ciphertext-not-a-token";
const APPT = "appt:d1000000-0000-4000-8000-0000000045d1";
const HASH = "a".repeat(64);

describe("team calendar (0045)", () => {
  let t: TestDb;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) => t.as(who === "anon" ? "anon" : "authenticated", who === "anon" ? null : U[who], fn);
  const service = <T>(fn: (q: Query) => Promise<T>) => t.as("service_role", null, fn);
  const connect = () =>
    t.query(`insert into team_calendar (connected_by, account_email, scopes, token_ciphertext, calendar_id, calendar_name) values ($1, 'owner@example.test', '{calendar.app.created}', $2, 'cal-1', 'Vabrato')`, [U.admin, CIPHER]);
  const addEvent = (key = APPT) => t.query(`insert into team_calendar_events (source_key, google_event_id, content_hash) values ($1, 'evt-1', $2)`, [key, HASH]);

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin", email: "admin@example.test" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.seller, { role: "seller" });
    await createUser(t, U.buyer);
    await t.query(`update profiles set full_name = 'Ada Example' where id = $1`, [U.admin]);
  });
  afterAll(() => t.close());
  beforeEach(() => t.exec(`delete from team_calendar; delete from team_calendar_events;`));

  it("replaces the per-person tables, and rewords the switch for the team calendar", async () => {
    expect(await t.query(`select to_regclass('public.calendar_events') as a, to_regclass('public.staff_calendar_prefs') as b`)).toEqual([{ a: null, b: null }]);
    const [flag] = await t.query<{ enabled: boolean; description: string }>(`select enabled, description from feature_flags where key = 'integration_google_calendar'`);
    expect(flag!.enabled).toBe(false);
    expect(flag!.description).toMatch(/one team calendar/);
    expect(await t.query(`select to_regclass('public.staff_connections') as c`)).toEqual([{ c: "staff_connections" }]);
  });

  describe("team_calendar: the server only", () => {
    it("the service role stores, updates and clears the connection", async () => {
      const rows = await service(async (q) => {
        await q(`insert into team_calendar (connected_by, token_ciphertext) values ($1, $2)`, [U.admin, CIPHER]);
        await q(`update team_calendar set calendar_id = 'cal-1', calendar_name = 'Vabrato', last_synced_at = now(), last_error = 'calendar_gone'`);
        const r = await q(`select token_ciphertext, calendar_id, last_error from team_calendar`);
        await q(`delete from team_calendar`);
        return r;
      });
      expect(rows).toEqual([{ token_ciphertext: CIPHER, calendar_id: "cal-1", last_error: "calendar_gone" }]);
    });

    it("there's only ever one", async () => {
      await connect();
      await expect(connect()).rejects.toThrow(/duplicate key/);
      await expect(t.query(`insert into team_calendar (singleton, token_ciphertext) values (false, $1)`, [CIPHER])).rejects.toThrow(/check constraint/);
    });

    it("nobody signed in reads, adds, changes or removes it, not even an admin", async () => {
      await connect();
      for (const who of ["admin", "agent", "seller", "buyer", "anon"] as const) {
        await expect(as(who, (q) => q(`select token_ciphertext from team_calendar`))).rejects.toThrow(/permission denied/);
        await expect(as(who, (q) => q(`update team_calendar set calendar_id = 'other'`))).rejects.toThrow(/permission denied/);
        await expect(as(who, (q) => q(`delete from team_calendar`))).rejects.toThrow(/permission denied/);
      }
      expect(await t.query(`select calendar_id from team_calendar`)).toEqual([{ calendar_id: "cal-1" }]);
    });

    it("a sync lease: taken only when free or expired", async () => {
      await connect();
      const take = () =>
        service((q) => q(`update team_calendar set sync_lock_until = now() + interval '2 minutes' where sync_lock_until is null or sync_lock_until < now() returning singleton`));
      expect(await take()).toHaveLength(1);
      await t.query(`update team_calendar set sync_lock_until = now() + interval '2 minutes'`);
      expect(await take()).toHaveLength(0);
      await t.query(`update team_calendar set sync_lock_until = now() - interval '1 second'`);
      expect(await take()).toHaveLength(1);
    });

    it("only known errors", async () => {
      await connect();
      await expect(t.query(`update team_calendar set last_error = 'the token was abc'`)).rejects.toThrow(/check constraint/);
    });

    it("removing the admin who connected it keeps the connection", async () => {
      const other = "a2000000-0000-4000-8000-0000000045a2";
      await createUser(t, other, { role: "admin" });
      await t.query(`insert into team_calendar (connected_by, token_ciphertext) values ($1, $2)`, [other, CIPHER]);
      await t.query(`delete from profiles where id = $1`, [other]);
      expect(await t.query(`select connected_by from team_calendar`)).toEqual([{ connected_by: null }]);
    });
  });

  describe("team_calendar_events", () => {
    it("the service role writes them; staff read them; nobody signed in writes", async () => {
      const n = await service(async (q) => {
        await q(`insert into team_calendar_events (source_key, google_event_id, content_hash) values ($1, 'evt-1', $2)`, [APPT, HASH]);
        await q(`update team_calendar_events set content_hash = $1`, ["b".repeat(64)]);
        return q(`delete from team_calendar_events returning source_key`);
      });
      expect(n).toHaveLength(1);
      await addEvent();
      for (const who of ["admin", "agent"] as const) expect(await as(who, (q) => q(`select source_key from team_calendar_events`))).toEqual([{ source_key: APPT }]);
      for (const who of ["seller", "buyer"] as const) expect(await as(who, (q) => q(`select source_key from team_calendar_events`))).toEqual([]);
      await expect(as("anon", (q) => q(`select source_key from team_calendar_events`))).rejects.toThrow(/permission denied/);
      await expect(as("admin", (q) => q(`insert into team_calendar_events (source_key, google_event_id, content_hash) values ($1, 'evt-2', $2)`, ["deal:d1000000-0000-4000-8000-0000000045d1:coe", HASH]))).rejects.toThrow(/permission denied/);
      await expect(as("agent", (q) => q(`delete from team_calendar_events`))).rejects.toThrow(/permission denied/);
    });

    it("only our own source keys, once each, with a sha-256 hash", async () => {
      await addEvent("deal:d1000000-0000-4000-8000-0000000045d1:cr:inspection");
      await addEvent("deal:d1000000-0000-4000-8000-0000000045d1:rentback");
      await expect(addEvent("deal:x:coe")).rejects.toThrow(/check constraint/);
      await expect(addEvent("note:anything")).rejects.toThrow(/check constraint/);
      await expect(t.query(`insert into team_calendar_events (source_key, google_event_id, content_hash) values ($1, 'evt', 'short')`, [APPT])).rejects.toThrow(/check constraint/);
      await addEvent();
      await expect(addEvent()).rejects.toThrow(/duplicate key/);
    });
  });

  describe("team_calendar_status", () => {
    it("staff see whether it's connected, by whom, and how many events; never the token", async () => {
      expect(await as("agent", (q) => q(`select * from team_calendar_status()`))).toEqual([
        { connected: false, connected_by_name: null, account_email: null, calendar_name: null, connected_at: null, last_synced_at: null, last_error: null, events: 0 },
      ]);
      await connect();
      await addEvent();
      const [row] = await as("agent", (q) => q<Record<string, unknown>>(`select * from team_calendar_status()`));
      expect(row).toMatchObject({ connected: true, connected_by_name: "Ada Example", account_email: "owner@example.test", calendar_name: "Vabrato", last_error: null, events: 1 });
      expect(Object.keys(row!)).not.toContain("token_ciphertext");
      expect(JSON.stringify(row)).not.toContain(CIPHER);
    });

    it("members and the public get nothing", async () => {
      await connect();
      await expect(as("seller", (q) => q(`select * from team_calendar_status()`))).rejects.toThrow(/staff_only/);
      await expect(as("buyer", (q) => q(`select * from team_calendar_status()`))).rejects.toThrow(/staff_only/);
      await expect(as("anon", (q) => q(`select * from team_calendar_status()`))).rejects.toThrow(/permission denied/);
    });
  });
});
