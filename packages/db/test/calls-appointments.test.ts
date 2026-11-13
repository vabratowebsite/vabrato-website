import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S6b PR 8 (0035): call follow-ups and appointment drafts on one lead or one
// deal, and the staff to-do list. Staff who work the lead or deal only; the
// seller, buyers and the public never see to-dos. Fictional people.

const U = {
  admin: "a1000000-0000-4000-8000-0000000035a1",
  agent: "c1000000-0000-4000-8000-0000000035c1",
  agent2: "c2000000-0000-4000-8000-0000000035c2",
  seller: "e1000000-0000-4000-8000-0000000035e1",
  buyer: "f1000000-0000-4000-8000-0000000035f1",
} as const;
type Who = keyof typeof U | "anon";
const DEAL = "d1000000-0000-4000-8000-0000000035d1";
const DEAL2 = "d2000000-0000-4000-8000-0000000035d2";
const APPT = JSON.stringify({ title: "Final walkthrough", date: "2026-11-17", start: "15:00", minutes: 45, location: "1 Fixture Way, Belmont", with: "Dana" });

describe("call follow-ups, appointments and staff to-dos (0035)", () => {
  let t: TestDb;
  let lead: string;
  let lead2: string;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) => t.as(who === "anon" ? "anon" : "authenticated", who === "anon" ? null : U[who], fn);
  const insert = (q: Query, table: string, cols: Record<string, unknown>) => {
    const keys = Object.keys(cols);
    return q<{ id: string }>(`insert into ${table} (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(cols));
  };
  const todo = (who: keyof typeof U, target: Record<string, string>, title = "Send the HOA documents") => ({ ...target, title, created_by: U[who] });

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.admin, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.agent2, { role: "agent" });
    await createUser(t, U.seller, { role: "seller" });
    await createUser(t, U.buyer);
    await t.exec(`update app_settings set lead_admin_id = '${U.admin}'`);
    lead = (await t.query<{ id: string }>(`insert into leads (kind, email, name, message) values ('contact', 'jordan@example.test', 'Jordan Example', 'A question') returning id`))[0]!.id;
    lead2 = (await t.query<{ id: string }>(`insert into leads (kind, email, name) values ('valuation', 'riley@example.test', 'Riley Example') returning id`))[0]!.id;
    await t.query(`update leads set assigned_to = $1 where id = $2`, [U.agent, lead]);
    await t.query(`update leads set assigned_to = $1 where id = $2`, [U.agent2, lead2]);
    await t.query(`insert into deals (id, address, ratification_date, agent_id, created_by) values ($1, '1 Fixture Way, Belmont', '2026-10-01', $2, $2), ($3, '2 Fixture Way, Belmont', '2026-10-01', $4, $4)`, [DEAL, U.agent, DEAL2, U.agent2]);
    await t.query(`insert into deal_members (deal_id, profile_id, member_role) values ($1, $2, 'seller')`, [DEAL, U.seller]);
  });
  afterAll(() => t.close());
  beforeEach(() => t.exec(`delete from ai_drafts; delete from staff_todos;`));

  it("adds the two switches, off", async () => {
    expect(await t.query(`select key, enabled from feature_flags where key in ('ai_staff_call_notes', 'ai_staff_appointments') order by key`)).toEqual([
      { key: "ai_staff_appointments", enabled: false },
      { key: "ai_staff_call_notes", enabled: false },
    ]);
  });

  describe("the two draft kinds", () => {
    it("a follow-up or appointment on a lead or a deal, by staff who work it", async () => {
      expect(await as("agent", (q) => insert(q, "ai_drafts", { kind: "call_followup", lead_id: lead, subject: "Thanks for the call", body: "Hi Jordan," }))).toHaveLength(1);
      expect(await as("agent", (q) => insert(q, "ai_drafts", { kind: "call_followup", deal_id: DEAL, subject: "Following up", body: "Hi Dana," }))).toHaveLength(1);
      expect(await as("agent", (q) => insert(q, "ai_drafts", { kind: "appointment", deal_id: DEAL, subject: "Walkthrough", body: "Hi Dana,", content: APPT }))).toHaveLength(1);
      expect(await as("admin", (q) => insert(q, "ai_drafts", { kind: "appointment", lead_id: lead2, subject: "Valuation visit", body: "Hi Riley,", content: APPT }))).toHaveLength(1);
    });

    it("exactly one of lead or deal; an appointment needs its fields; nothing else", async () => {
      await expect(as("agent", (q) => insert(q, "ai_drafts", { kind: "call_followup", lead_id: lead, deal_id: DEAL, subject: "x", body: "x" }))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => insert(q, "ai_drafts", { kind: "call_followup", subject: "x", body: "x" }))).rejects.toThrow(/check constraint|row-level security/);
      await expect(as("agent", (q) => insert(q, "ai_drafts", { kind: "appointment", deal_id: DEAL, subject: "x", body: "x" }))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => insert(q, "ai_drafts", { kind: "appointment", deal_id: DEAL, listing_key: "QA-1", subject: "x", body: "x", content: APPT }))).rejects.toThrow(/check constraint/);
    });

    it("an agent who doesn't work the lead or deal, the seller, a buyer and the public can't start one", async () => {
      await expect(as("agent2", (q) => insert(q, "ai_drafts", { kind: "call_followup", lead_id: lead, subject: "x", body: "x" }))).rejects.toThrow(/row-level security/);
      await expect(as("agent2", (q) => insert(q, "ai_drafts", { kind: "appointment", deal_id: DEAL, subject: "x", body: "x", content: APPT }))).rejects.toThrow(/row-level security/);
      await expect(as("seller", (q) => insert(q, "ai_drafts", { kind: "call_followup", deal_id: DEAL, subject: "x", body: "x" }))).rejects.toThrow(/row-level security/);
      await expect(as("buyer", (q) => insert(q, "ai_drafts", { kind: "appointment", lead_id: lead, subject: "x", body: "x", content: APPT }))).rejects.toThrow(/row-level security/);
      await expect(as("anon", (q) => insert(q, "ai_drafts", { kind: "call_followup", lead_id: lead, subject: "x", body: "x" }))).rejects.toThrow(/permission denied/);
    });

    it("an approved appointment is frozen; how it was used is recorded once", async () => {
      const id = (await t.query<{ id: string }>(`insert into ai_drafts (owner_id, kind, deal_id, subject, body, content) values ($1, 'appointment', $2, 'Walkthrough', 'Hi Dana,', $3) returning id`, [U.agent, DEAL, APPT]))[0]!.id;
      await t.query(`update ai_drafts set status = 'approved' where id = $1`, [id]);
      await expect(as("agent", (q) => q(`update ai_drafts set content = '{"start":"16:00"}' where id = $1`, [id]))).rejects.toThrow(/draft_closed/);
      expect(await as("agent", (q) => q<{ sent_via: string }>(`update ai_drafts set sent_via = 'copy' where id = $1 returning sent_via`, [id]))).toEqual([{ sent_via: "copy" }]);
      expect(await as("seller", (q) => q(`select id from ai_drafts`))).toEqual([]);
    });
  });

  describe("staff to-dos", () => {
    it("the deal's agent and the lead's agent add, read, change and remove them", async () => {
      const seen = await as("agent", async (q) => {
        const [d] = await insert(q, "staff_todos", todo("agent", { deal_id: DEAL }));
        const [l] = await insert(q, "staff_todos", { ...todo("agent", { lead_id: lead }, "Call back about the valuation"), due_date: "2026-11-20", source: "call_notes" });
        await q(`update staff_todos set done = true, done_at = now() where id = $1`, [d!.id]);
        await q(`update staff_todos set title = 'Call Jordan back', due_date = null where id = $1`, [l!.id]);
        const rows = await q<{ title: string; done: boolean; source: string }>(`select title, done, source from staff_todos order by title`);
        await q(`delete from staff_todos where id = $1`, [d!.id]);
        return { rows, after: (await q(`select id from staff_todos`)).length };
      });
      expect(seen.rows).toEqual([
        { title: "Call Jordan back", done: false, source: "call_notes" },
        { title: "Send the HOA documents", done: true, source: "manual" },
      ]);
      expect(seen.after).toBe(1);
    });

    it("the admin acting as lead admin works a lead's to-dos; staff with deal access see the deal's", async () => {
      await t.query(`insert into staff_todos (lead_id, title, created_by) values ($1, 'Lead to-do', $2)`, [lead2, U.agent2]);
      await t.query(`insert into staff_todos (deal_id, title, created_by) values ($1, 'Deal to-do', $2)`, [DEAL, U.agent]);
      expect((await as("admin", (q) => q<{ title: string }>(`select title from staff_todos order by title`))).map((r) => r.title)).toEqual(["Deal to-do", "Lead to-do"]);
      expect((await as("agent2", (q) => q<{ title: string }>(`select title from staff_todos`))).map((r) => r.title)).toEqual(["Lead to-do"]);
    });

    it("an agent without access, the seller, a buyer and the public see and change nothing", async () => {
      const id = (await t.query<{ id: string }>(`insert into staff_todos (deal_id, title, created_by) values ($1, 'Private to-do', $2) returning id`, [DEAL, U.agent]))[0]!.id;
      for (const who of ["agent2", "seller", "buyer"] as const) {
        expect(await as(who, (q) => q(`select id from staff_todos`))).toEqual([]);
        expect(await as(who, (q) => q(`update staff_todos set done = true, done_at = now() where id = $1 returning id`, [id]))).toEqual([]);
        expect(await as(who, (q) => q(`delete from staff_todos where id = $1 returning id`, [id]))).toEqual([]);
      }
      await expect(as("seller", (q) => insert(q, "staff_todos", todo("seller", { deal_id: DEAL })))).rejects.toThrow(/row-level security/);
      await expect(as("agent2", (q) => insert(q, "staff_todos", todo("agent2", { lead_id: lead })))).rejects.toThrow(/row-level security/);
      await expect(as("anon", (q) => q(`select id from staff_todos`))).rejects.toThrow(/permission denied/);
    });

    it("one lead or one deal; a title; done goes with its time; created in your own name; fixed columns", async () => {
      await expect(as("agent", (q) => insert(q, "staff_todos", todo("agent", { lead_id: lead, deal_id: DEAL })))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => insert(q, "staff_todos", todo("agent", { deal_id: DEAL }, "   ")))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => insert(q, "staff_todos", todo("admin", { deal_id: DEAL })))).rejects.toThrow(/row-level security/);
      await expect(as("agent", (q) => insert(q, "staff_todos", { ...todo("agent", { deal_id: DEAL }), source: "assistant" }))).rejects.toThrow(/check constraint/);
      const id = (await t.query<{ id: string }>(`insert into staff_todos (deal_id, title, created_by) values ($1, 'x', $2) returning id`, [DEAL, U.agent]))[0]!.id;
      await expect(as("agent", (q) => q(`update staff_todos set done = true where id = $1`, [id]))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => q(`update staff_todos set deal_id = $2 where id = $1`, [id, DEAL2]))).rejects.toThrow(/permission denied/);
      await expect(as("agent", (q) => q(`update staff_todos set created_by = $2 where id = $1`, [id, U.admin]))).rejects.toThrow(/permission denied/);
    });

    it("the deal's schedule tasks are untouched: the seller still reads only those", async () => {
      await t.query(`insert into staff_todos (deal_id, title, created_by) values ($1, 'Staff only', $2)`, [DEAL, U.agent]);
      expect(await as("seller", (q) => q(`select title from tasks where title = 'Staff only'`))).toEqual([]);
    });
  });
});
