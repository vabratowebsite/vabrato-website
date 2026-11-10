import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// SEC-2: for each member table, one member cannot read (or change) another
// member's rows. Covers the tables from 0002-0009 plus storage objects.
// Policies under test are the migrations themselves; nothing here changes RLS.
// All people, addresses and amounts are fictional.

const U = {
  sellerA: "a0000000-0000-4000-8000-00000000000a",
  sellerB: "b0000000-0000-4000-8000-00000000000b",
  agentA: "a1000000-0000-4000-8000-00000000000a",
  agentB: "b1000000-0000-4000-8000-00000000000b",
  va: "c0000000-0000-4000-8000-00000000000c",
  admin: "d0000000-0000-4000-8000-00000000000d",
  buyerA: "a2000000-0000-4000-8000-00000000000a",
  buyerB: "b2000000-0000-4000-8000-00000000000b",
} as const;

const DEAL_A = "da000000-0000-4000-8000-0000000000da";
const DEAL_B = "db000000-0000-4000-8000-0000000000db";
const TRACK_A = "ea000000-0000-4000-8000-0000000000ea";
const TRACK_B = "eb000000-0000-4000-8000-0000000000eb";

type Who = keyof typeof U | "anon";

const keys = async (q: Query, sql: string) => (await q<{ k: string }>(sql)).map((r) => String(r.k)).sort();

describe("member isolation (SEC-2)", () => {
  let t: TestDb;

  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) =>
    who === "anon" ? t.as("anon", null, fn) : t.as("authenticated", U[who], fn);
  const see = (who: Who, sql: string) => as(who, (q) => keys(q, sql));
  /** Rows affected by an UPDATE/DELETE ... RETURNING (RLS filters silently). */
  const affected = (who: Who, sql: string) => as(who, async (q) => (await q(sql)).length);
  const rejects = (who: Who, sql: string) =>
    expect(as(who, (q) => q(sql))).rejects.toThrow(/row-level security|permission denied/);

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.sellerA, { role: "seller" });
    await createUser(t, U.sellerB, { role: "seller" });
    await createUser(t, U.agentA, { role: "agent" });
    await createUser(t, U.agentB, { role: "agent" });
    await createUser(t, U.va, { role: "va" });
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.buyerA);
    await createUser(t, U.buyerB);

    await t.exec(`
      insert into deals (id, address, ratification_date, agent_id, created_by) values
        ('${DEAL_A}', '100 Example Way, San Carlos', '2026-10-01', '${U.agentA}', '${U.agentA}'),
        ('${DEAL_B}', '200 Sample Ct, Belmont', '2026-10-02', '${U.agentB}', '${U.agentB}');
      insert into deal_members (deal_id, profile_id, member_role) values
        ('${DEAL_A}', '${U.sellerA}', 'seller'),
        ('${DEAL_B}', '${U.sellerB}', 'seller'),
        ('${DEAL_A}', '${U.va}', 'va');
      insert into deal_contingencies (deal_id, kind, offset_days) values
        ('${DEAL_A}', 'inspection', 10), ('${DEAL_B}', 'inspection', 10);
      insert into tasks (deal_id, title, owner, phase, offset_days, due_date) values
        ('${DEAL_A}', 'Task A', 'seller', 'after_ratification', 1, '2026-10-02'),
        ('${DEAL_B}', 'Task B', 'seller', 'after_ratification', 1, '2026-10-05');
      insert into vendors (id, name, role) values ('f0000000-0000-4000-8000-0000000000f0', 'Fictional Escrow Co', 'escrow');
      insert into deal_vendors (deal_id, vendor_id) values
        ('${DEAL_A}', 'f0000000-0000-4000-8000-0000000000f0'), ('${DEAL_B}', 'f0000000-0000-4000-8000-0000000000f0');
      insert into receipts (deal_id, vendor, receipt_date, amount, created_by) values
        ('${DEAL_A}', 'Receipt A', '2026-10-03', 120, '${U.agentA}'),
        ('${DEAL_B}', 'Receipt B', '2026-10-04', 80, '${U.agentB}');
      insert into notifications (deal_id, recipient_profile_id, template_key, send_at) values
        ('${DEAL_A}', '${U.sellerA}', 'note_a', now()),
        ('${DEAL_B}', '${U.sellerB}', 'note_b', now()),
        (null, '${U.buyerA}', 'note_buyer_a', now());
      insert into tracked_properties (id, buyer_id, address) values
        ('${TRACK_A}', '${U.buyerA}', '300 Placeholder Ave'), ('${TRACK_B}', '${U.buyerB}', '400 Testing Ln');
      insert into inbound_emails (id, source, raw) values ('e0000000-0000-4000-8000-0000000000e0', 'postmark', '{}');
      insert into property_events (tracked_property_id, kind, source_email_id) values
        ('${TRACK_A}', 'event_a', 'e0000000-0000-4000-8000-0000000000e0'),
        ('${TRACK_B}', 'event_b', 'e0000000-0000-4000-8000-0000000000e0');
      insert into storage.objects (bucket_id, name) values
        ('deal-docs', 'deal/${DEAL_A}/disclosures.pdf'),
        ('deal-docs', 'deal/${DEAL_B}/disclosures.pdf'),
        ('receipts', 'deal/${DEAL_A}/receipt.pdf'),
        ('receipts', 'deal/${DEAL_B}/receipt.pdf');
    `);
  });

  afterAll(() => t.close());

  describe("profiles", () => {
    it.each<[Who, string[]]>([
      ["sellerA", [U.sellerA]],
      ["sellerB", [U.sellerB]],
      ["buyerA", [U.buyerA]],
      ["anon", []],
    ])("%s reads only their own profile", async (who, expected) => {
      expect(await see(who, `select id as k from profiles`)).toEqual(expected);
    });

    it("lets staff read every profile (0002: 'staff reads all', flagged for review)", async () => {
      // Current behavior by design: any staff role (agent, va, tc, admin) reads
      // all profiles, including clients on other agents' deals.
      expect(await see("agentB", `select id as k from profiles`)).toHaveLength(Object.keys(U).length);
    });

    it("does not let a member change someone else's profile, or their own role", async () => {
      expect(await affected("sellerA", `update profiles set full_name = 'x' where id = '${U.sellerB}' returning id`)).toBe(0);
      await rejects("sellerA", `update profiles set role = 'admin' where id = '${U.sellerA}'`);
    });
  });

  describe("deals and deal children", () => {
    const deals = [DEAL_A, DEAL_B].sort();
    it.each<[Who, string[]]>([
      ["sellerA", [DEAL_A]],
      ["sellerB", [DEAL_B]],
      ["agentA", [DEAL_A]],
      ["agentB", [DEAL_B]],
      ["va", [DEAL_A]],
      ["admin", deals],
      ["buyerA", []],
      ["anon", []],
    ])("%s sees only their deals, with the same scope on every deal child table", async (who, expected) => {
      expect(await see(who, `select id as k from deals`)).toEqual(expected);
      expect(await see(who, `select distinct deal_id as k from deal_members`)).toEqual(expected);
      expect(await see(who, `select distinct deal_id as k from deal_contingencies`)).toEqual(expected);
      expect(await see(who, `select distinct deal_id as k from tasks`)).toEqual(expected);
    });

    it("lets a seller see who is on their own deal, but nobody on another deal", async () => {
      expect(await see("sellerA", `select profile_id as k from deal_members`)).toEqual([U.sellerA, U.va].sort());
    });

    it("does not let sellers change deals or tasks, even their own", async () => {
      expect(await affected("sellerA", `update deals set address = 'x' where id = '${DEAL_A}' returning id`)).toBe(0);
      expect(await affected("sellerA", `update tasks set done = true where deal_id = '${DEAL_A}' returning id`)).toBe(0);
      expect(await affected("sellerA", `delete from deal_contingencies where deal_id = '${DEAL_A}' returning id`)).toBe(0);
      await rejects("sellerA", `insert into deals (address, ratification_date, created_by) values ('x', '2026-10-01', '${U.sellerA}')`);
    });

    it("does not let a member join another deal", async () => {
      await rejects("sellerA", `insert into deal_members (deal_id, profile_id, member_role) values ('${DEAL_B}', '${U.sellerA}', 'seller')`);
      await rejects("agentB", `insert into deal_members (deal_id, profile_id, member_role) values ('${DEAL_A}', '${U.agentB}', 'agent')`);
      await rejects("va", `insert into deal_members (deal_id, profile_id, member_role) values ('${DEAL_B}', '${U.va}', 'va')`);
    });

    it("does not let an agent change another agent's deal", async () => {
      expect(await affected("agentB", `update deals set address = 'x' where id = '${DEAL_A}' returning id`)).toBe(0);
      expect(await affected("agentB", `update tasks set done = true where deal_id = '${DEAL_A}' returning id`)).toBe(0);
      expect(await affected("agentB", `delete from deals where id = '${DEAL_A}' returning id`)).toBe(0);
      await rejects("agentB", `insert into tasks (deal_id, title, owner, phase, offset_days, due_date) values ('${DEAL_A}', 'x', 'x', 'after_ratification', 1, '2026-10-02')`);
    });

    it("lets staff with access manage their own deal, and only admins delete deals", async () => {
      expect(await affected("agentA", `update tasks set done = true where deal_id = '${DEAL_A}' returning id`)).toBe(1);
      expect(await affected("va", `update deals set escrow_number = 'E-1' where id = '${DEAL_A}' returning id`)).toBe(1);
      expect(await affected("agentA", `delete from deals where id = '${DEAL_A}' returning id`)).toBe(0);
      expect(await affected("admin", `delete from deals where id = '${DEAL_B}' returning id`)).toBe(1);
    });
  });

  describe("receipts (staff only, never sellers)", () => {
    it.each<[Who, string[]]>([
      ["sellerA", []],
      ["sellerB", []],
      ["agentA", ["Receipt A"]],
      ["agentB", ["Receipt B"]],
      ["va", ["Receipt A"]],
      ["admin", ["Receipt A", "Receipt B"]],
      ["buyerA", []],
      ["anon", []],
    ])("%s sees %j", async (who, expected) => {
      expect(await see(who, `select vendor as k from receipts`)).toEqual(expected);
    });

    it("does not let an agent file a receipt on another agent's deal", async () => {
      await rejects("agentB", `insert into receipts (deal_id, vendor, receipt_date, amount, created_by) values ('${DEAL_A}', 'x', '2026-10-01', 1, '${U.agentB}')`);
      await rejects("sellerA", `insert into receipts (deal_id, vendor, receipt_date, amount, created_by) values ('${DEAL_A}', 'x', '2026-10-01', 1, '${U.sellerA}')`);
    });
  });

  describe("vendors (org-wide, staff only)", () => {
    it("is visible to every staff role and to nobody else", async () => {
      for (const who of ["agentA", "agentB", "va", "admin"] as const) {
        expect(await see(who, `select name as k from vendors`)).toEqual(["Fictional Escrow Co"]);
      }
      for (const who of ["sellerA", "buyerA", "anon"] as const) {
        expect(await see(who, `select name as k from vendors`)).toEqual([]);
        expect(await see(who, `select deal_id as k from deal_vendors`)).toEqual([]);
      }
      await rejects("sellerA", `insert into vendors (name, role) values ('x', 'x')`);
    });

    it("scopes deal_vendors to the staff member's deals", async () => {
      expect(await see("agentB", `select deal_id as k from deal_vendors`)).toEqual([DEAL_B]);
      expect(await see("va", `select deal_id as k from deal_vendors`)).toEqual([DEAL_A]);
    });
  });

  describe("notifications", () => {
    it.each<[Who, string[]]>([
      ["sellerA", ["note_a"]],
      ["sellerB", ["note_b"]],
      ["buyerA", ["note_buyer_a"]],
      ["buyerB", []],
      ["agentA", ["note_a"]],
      ["agentB", ["note_b"]],
      ["va", ["note_a"]],
      ["anon", []],
    ])("%s sees only their own (or their deals')", async (who, expected) => {
      expect(await see(who, `select template_key as k from notifications`)).toEqual(expected);
    });

    it("does not let a member reschedule or cancel anyone's notifications", async () => {
      expect(await affected("sellerA", `update notifications set status = 'cancelled' returning id`)).toBe(0);
      expect(await affected("agentB", `update notifications set status = 'cancelled' where deal_id = '${DEAL_A}' returning id`)).toBe(0);
      await rejects("sellerA", `insert into notifications (deal_id, recipient_profile_id, template_key, send_at) values ('${DEAL_A}', '${U.sellerB}', 'x', now())`);
    });
  });

  describe("buyer tracker", () => {
    it.each<[Who, string[], string[]]>([
      ["buyerA", [TRACK_A], ["event_a"]],
      ["buyerB", [TRACK_B], ["event_b"]],
      // No staff policy exists on the tracker today: agents and admins see nothing.
      ["agentA", [], []],
      ["admin", [], []],
      ["sellerA", [], []],
      ["anon", [], []],
    ])("%s sees only their own tracked properties and events", async (who, props, events) => {
      expect(await see(who, `select id as k from tracked_properties`)).toEqual(props);
      expect(await see(who, `select kind as k from property_events`)).toEqual(events);
    });

    it("does not let a buyer touch another buyer's rows or write events", async () => {
      expect(await affected("buyerB", `update tracked_properties set status = 'x' where id = '${TRACK_A}' returning id`)).toBe(0);
      expect(await affected("buyerB", `delete from tracked_properties where id = '${TRACK_A}' returning id`)).toBe(0);
      await rejects("buyerB", `insert into tracked_properties (buyer_id, address) values ('${U.buyerA}', 'x')`);
      await rejects("buyerA", `insert into property_events (tracked_property_id, kind) values ('${TRACK_A}', 'forged')`);
    });
  });

  describe("inbound_emails (service role only)", () => {
    it.each<Who>(["buyerA", "sellerA", "agentA", "admin", "anon"])("is invisible to %s", async (who) => {
      expect(await see(who, `select id as k from inbound_emails`)).toEqual([]);
    });
  });

  describe("storage objects", () => {
    it.each<[Who, string[], string[]]>([
      ["sellerA", [DEAL_A], []],
      ["sellerB", [DEAL_B], []],
      ["agentA", [DEAL_A], [DEAL_A]],
      ["agentB", [DEAL_B], [DEAL_B]],
      ["va", [DEAL_A], [DEAL_A]],
      ["admin", [DEAL_A, DEAL_B].sort(), [DEAL_A, DEAL_B].sort()],
      ["buyerA", [], []],
      ["anon", [], []],
    ])("%s sees deal-docs %j and receipts %j", async (who, docs, receipts) => {
      const folder = `split_part(name, '/', 2)`;
      expect(await see(who, `select ${folder} as k from storage.objects where bucket_id = 'deal-docs'`)).toEqual(docs);
      expect(await see(who, `select ${folder} as k from storage.objects where bucket_id = 'receipts'`)).toEqual(receipts);
    });

    it("lets only staff with deal access upload", async () => {
      await rejects("sellerA", `insert into storage.objects (bucket_id, name) values ('deal-docs', 'deal/${DEAL_A}/x.pdf')`);
      await rejects("agentB", `insert into storage.objects (bucket_id, name) values ('deal-docs', 'deal/${DEAL_A}/x.pdf')`);
      await rejects("agentB", `insert into storage.objects (bucket_id, name) values ('receipts', 'deal/${DEAL_A}/x.pdf')`);
      const n = await as("agentA", (q) => q(`insert into storage.objects (bucket_id, name) values ('deal-docs', 'deal/${DEAL_A}/x.pdf') returning id`));
      expect(n).toHaveLength(1);
    });

    it("does not let a seller delete their own deal's documents", async () => {
      expect(await affected("sellerA", `delete from storage.objects where bucket_id = 'deal-docs' returning id`)).toBe(0);
    });
  });
});
