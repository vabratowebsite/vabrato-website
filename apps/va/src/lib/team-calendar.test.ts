import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncMessage } from "./calendar-messages";

// The team Google Calendar (0045): what goes on it, and what people read
// after a sync. The database is a small in-memory fake of the service client.
// Fictional people, deals and appointments.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const field = (r: Row, col: string) => (col.startsWith("content->>") ? (r.content as Row)?.[col.slice(10)] : r[col]);
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (filters.push((r) => field(r, c) === v), q),
    neq: (c: string, v: unknown) => (filters.push((r) => field(r, c) !== v), q),
    gte: (c: string, v: string) => (filters.push((r) => String(field(r, c)) >= v), q),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(field(r, c))), q),
    limit: () => q,
    then: (ok: (x: { data: Row[] }) => unknown) => Promise.resolve({ data: (db[table] ?? []).filter((r) => filters.every((f) => f(r))) }).then(ok),
  };
  return q;
}

vi.mock("@vabrato/lib", async (orig) => ({ ...(await orig<typeof import("@vabrato/lib")>()), createServiceSupabase: () => ({ from: query }) }));
vi.mock("@/lib/appointment-kinds", async (orig) => ({ ...(await orig<typeof import("@/lib/appointment-kinds")>()), pacificToday: () => "2026-11-17" }));

const { desiredTeamEvents } = await import("./team-calendar");

const D = (n: number) => `d1000000-0000-4000-8000-00000000000${n}`;
const A = (n: number) => `a1000000-0000-4000-8000-00000000000${n}`;
const deal = (n: number, o: Row = {}) => ({
  id: D(n),
  address: `${n} Example Lane`,
  status: "active",
  ratification_date: "2026-11-02",
  days_to_close: 30,
  rent_back_days: 0,
  is_test: false,
  agent: { full_name: "Avery Example" },
  ...o,
});
const appt = (n: number, o: Row = {}) => ({
  id: A(n),
  kind: "appointment",
  status: "approved",
  deal_id: null,
  owner: { full_name: "Blake Example" },
  content: { title: "Showing", date: "2026-11-20", start: "10:00", minutes: 30, location: "", with: "" },
  ...o,
});

beforeEach(() => {
  db.deals = [deal(1), deal(2, { is_test: true }), deal(3, { status: "cancelled" }), deal(4, { status: "closed", ratification_date: "2025-01-02" }), deal(5, { is_test: true, status: "cancelled" })];
  db.deal_contingencies = [
    { deal_id: D(1), kind: "inspection", due_date: "2026-11-12" },
    { deal_id: D(2), kind: "inspection", due_date: "2026-11-12" },
  ];
  db.ai_drafts = [
    appt(1),
    appt(2, { status: "draft" }),
    appt(3, { deal_id: D(2) }),
    appt(4, { deal_id: D(5) }),
    appt(5, { content: { title: "Old", date: "2026-08-01", start: "10:00", minutes: 30, location: "", with: "" } }),
    appt(6, { owner: { full_name: null }, deal_id: D(1) }),
  ];
});

describe("what goes on the team calendar", () => {
  it("every approved appointment and every real deal's key dates, titled with who they're for", async () => {
    const events = await desiredTeamEvents();
    const byKey = new Map(events.map((e) => [e.sourceKey, e.body.summary]));
    expect([...byKey.keys()].sort()).toEqual([`appt:${A(1)}`, `appt:${A(6)}`, `deal:${D(1)}:coe`, `deal:${D(1)}:cr:inspection`].sort());
    expect(byKey.get(`appt:${A(1)}`)).toBe("Showing · Blake Example");
    expect(byKey.get(`deal:${D(1)}:coe`)).toMatch(/^Close of escrow · 1 Example Lane · Avery Example$/);
    // No name on file: just the title.
    expect(byKey.get(`appt:${A(6)}`)).toBe("Showing");
  });

  it("never test deals or their appointments, cancelled deals, drafts, long-closed deals or old appointments", async () => {
    const keys = (await desiredTeamEvents()).map((e) => e.sourceKey).join(" ");
    for (const n of [2, 3, 4, 5]) expect(keys).not.toContain(D(n));
    for (const n of [2, 3, 4, 5]) expect(keys).not.toContain(A(n));
  });

  it("visible to everyone it's shared with, and nothing about the seller or money", async () => {
    for (const e of await desiredTeamEvents()) {
      expect(e.body.visibility).toBe("default");
      expect(JSON.stringify(e.body)).not.toMatch(/seller|wire|wiring|price|\$/i);
    }
  });
});

describe("what people read after a sync", () => {
  it("says what happened, and what to do next", () => {
    expect(syncMessage({ status: "synced", changes: 0, failed: 0, capped: false, recreated: false })).toEqual({ error: null, ok: "The team calendar is up to date." });
    expect(syncMessage({ status: "synced", changes: 3, failed: 0, capped: true, recreated: false }).ok).toBe("Team calendar updated (3 changes; more on the next sync).");
    expect(syncMessage({ status: "synced", changes: 3, failed: 1, capped: false, recreated: false }).error).toMatch(/partly updated: 1 change didn't/);
    expect(syncMessage({ status: "synced", changes: 9, failed: 0, capped: false, recreated: true }).error).toMatch(/new one was made: share it with the team again/);
    expect(syncMessage({ status: "busy" }).error).toMatch(/being updated right now/);
    expect(syncMessage({ status: "reconnect" }).error).toMatch(/admin to reconnect/);
    expect(syncMessage({ status: "calendar_gone" }).error).toMatch(/couldn't be made again/);
    expect(syncMessage({ status: "failed" }).error).toMatch(/couldn't be updated/);
  });
});
