import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S6b PR 3 (0028): AI drafts. Who sees and changes a draft, how it moves
// from draft to approved or discarded, and the 30-day purge. Fictional
// people; no model is called (the console writes the text it gets back).

const U = {
  mark: "a1000000-0000-4000-8000-0000000028a1",
  agent: "c1000000-0000-4000-8000-0000000028c1",
  agent2: "c2000000-0000-4000-8000-0000000028c2",
  va: "e1000000-0000-4000-8000-0000000028e1",
  seller: "f1000000-0000-4000-8000-0000000028f1",
} as const;
type Who = keyof typeof U | "anon";
const DEAL = "00000000-0000-4000-8000-0000000028d1";
const VENDOR = "00000000-0000-4000-8000-0000000028b1";

describe("AI drafts (0028)", () => {
  let t: TestDb;
  let leadId = "";
  let otherLead = "";

  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) => t.as(who === "anon" ? "anon" : "authenticated", who === "anon" ? null : U[who], fn);
  const draft = (q: Query, cols: Record<string, string>) => {
    const keys = Object.keys(cols);
    return q<{ id: string; owner_id: string; status: string }>(
      `insert into ai_drafts (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id, owner_id, status`,
      Object.values(cols),
    );
  };
  /** Superuser insert of a draft row, for set-up. */
  const seed = async (owner: string, cols: Record<string, string | null>) => {
    const keys = ["owner_id", "body", ...Object.keys(cols)];
    const rows = await t.query<{ id: string }>(
      `insert into ai_drafts (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
      [owner, "Hi Jordan, thanks for reaching out.", ...Object.values(cols)],
    );
    return rows[0]!.id;
  };

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.mark, { role: "admin" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.agent2, { role: "agent" });
    await createUser(t, U.va, { role: "va" });
    await createUser(t, U.seller, { role: "seller" });
    await t.exec(`update app_settings set lead_admin_id = '${U.mark}'`);
    leadId = (await t.query<{ id: string }>(`insert into leads (kind, email, name, message) values ('contact', 'jordan@example.test', 'Jordan Example', 'Is it still available?') returning id`))[0]!.id;
    otherLead = (await t.query<{ id: string }>(`insert into leads (kind, email, name) values ('open_house_signin', 'riley@example.test', 'Riley Example') returning id`))[0]!.id;
    await t.query(`update leads set assigned_to = $1 where id = $2`, [U.agent, leadId]);
    await t.query(`update leads set assigned_to = $1 where id = $2`, [U.agent2, otherLead]);
    await t.query(
      `insert into deals (id, address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by) values ($1, '12 Fictional Lane, San Carlos', 'normal', '2026-03-02', 30, 0, $2, $2)`,
      [DEAL, U.va],
    );
    await t.query(`insert into deal_members (deal_id, profile_id, member_role) values ($1, $2, 'seller')`, [DEAL, U.seller]);
    await t.query(`insert into vendors (id, name, role, email) values ($1, 'Example Termite Co', 'Pest inspection', 'quotes@example.test')`, [VENDOR]);
  });
  afterAll(() => t.close());
  beforeEach(() => t.exec(`delete from ai_drafts`));

  it("adds the four draft switches, all off", async () => {
    expect(await t.query(`select key, enabled from feature_flags where key in ('ai_staff_lead_reply', 'ai_staff_open_house_followup', 'ai_staff_escrow_update', 'ai_staff_vendor_request') order by key`)).toEqual([
      { key: "ai_staff_escrow_update", enabled: false },
      { key: "ai_staff_lead_reply", enabled: false },
      { key: "ai_staff_open_house_followup", enabled: false },
      { key: "ai_staff_vendor_request", enabled: false },
    ]);
  });

  describe("writing drafts", () => {
    it("staff draft for the leads and deals they work, as themselves", async () => {
      const lead = await as("agent", (q) => draft(q, { kind: "lead_reply", lead_id: leadId, subject: "Re: your question", body: "Hi Jordan" }));
      expect(lead).toEqual([{ id: expect.any(String), owner_id: U.agent, status: "draft" }]);
      const deal = await as("va", (q) => draft(q, { kind: "escrow_update", deal_id: DEAL, body: "Hi Dana" }));
      expect(deal[0]!.owner_id).toBe(U.va);
      const vendor = await as("va", (q) => draft(q, { kind: "vendor_request", deal_id: DEAL, vendor_id: VENDOR, body: "Could you quote…" }));
      expect(vendor[0]!.status).toBe("draft");
      // The acting lead admin works every lead.
      expect(await as("mark", (q) => draft(q, { kind: "open_house_followup", lead_id: otherLead, body: "Thanks for visiting" }))).toHaveLength(1);
    });

    it("not for a lead or deal they don't work, nor as someone else, nor already approved", async () => {
      await expect(as("agent2", (q) => draft(q, { kind: "lead_reply", lead_id: leadId, body: "x" }))).rejects.toThrow(/row-level security/);
      await expect(as("agent", (q) => draft(q, { kind: "escrow_update", deal_id: DEAL, body: "x" }))).rejects.toThrow(/row-level security/);
      await expect(as("agent", (q) => draft(q, { kind: "lead_reply", lead_id: leadId, body: "x", owner_id: U.agent2 }))).rejects.toThrow(/permission denied/);
      await expect(as("agent", (q) => draft(q, { kind: "lead_reply", lead_id: leadId, body: "x", status: "approved" }))).rejects.toThrow(/permission denied/);
    });

    it("members and the public can't draft, even for their own deal", async () => {
      await expect(as("seller", (q) => draft(q, { kind: "escrow_update", deal_id: DEAL, body: "x" }))).rejects.toThrow(/row-level security/);
      await expect(as("anon", (q) => draft(q, { kind: "lead_reply", lead_id: leadId, body: "x" }))).rejects.toThrow(/permission denied/);
    });

    it("each kind points at what it's about", async () => {
      await expect(as("agent", (q) => draft(q, { kind: "lead_reply", lead_id: leadId, deal_id: DEAL, body: "x" }))).rejects.toThrow(/check constraint/);
      await expect(as("va", (q) => draft(q, { kind: "vendor_request", deal_id: DEAL, body: "x" }))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => draft(q, { kind: "lead_reply", lead_id: leadId, body: "   " }))).rejects.toThrow(/check constraint/);
      await expect(as("agent", (q) => draft(q, { kind: "newsletter", lead_id: leadId, body: "x" }))).rejects.toThrow(/check constraint/);
    });
  });

  describe("who sees a draft", () => {
    it("a draft is the owner's alone; once approved, everyone who works the lead or deal sees it", async () => {
      const id = await seed(U.agent, { kind: "lead_reply", lead_id: leadId });
      expect(await as("agent", (q) => q(`select id from ai_drafts`))).toHaveLength(1);
      expect(await as("mark", (q) => q(`select id from ai_drafts`))).toHaveLength(0);
      await t.query(`update ai_drafts set status = 'approved' where id = $1`, [id]);
      expect(await as("mark", (q) => q(`select id from ai_drafts`))).toHaveLength(1);
      expect(await as("agent2", (q) => q(`select id from ai_drafts`))).toHaveLength(0);
      expect(await as("va", (q) => q(`select id from ai_drafts`))).toHaveLength(0);
    });

    it("an approved deal draft is in the transaction file for staff, never for the seller", async () => {
      const id = await seed(U.va, { kind: "escrow_update", deal_id: DEAL, status: "approved", approved_at: new Date().toISOString() });
      expect(await as("mark", (q) => q(`select id from ai_drafts where id = $1`, [id]))).toHaveLength(1);
      expect(await as("seller", (q) => q(`select id from ai_drafts`))).toHaveLength(0);
      expect(await as("agent", (q) => q(`select id from ai_drafts`))).toHaveLength(0);
      await expect(as("anon", (q) => q(`select id from ai_drafts`))).rejects.toThrow(/permission denied/);
    });

    it("the owner loses the draft when the lead is reassigned away from them", async () => {
      await seed(U.agent, { kind: "lead_reply", lead_id: leadId });
      await t.query(`update leads set assigned_to = $1 where id = $2`, [U.agent2, leadId]);
      try {
        expect(await as("agent", (q) => q(`select id from ai_drafts`))).toHaveLength(0);
        expect(await as("agent", (q) => q(`update ai_drafts set body = 'changed' returning id`))).toHaveLength(0);
      } finally {
        await t.query(`update leads set assigned_to = $1 where id = $2`, [U.agent, leadId]);
      }
    });
  });

  describe("draft, then approved or discarded", () => {
    it("the owner edits, then approves; the approved text can't change, only how it was used", async () => {
      const id = await seed(U.agent, { kind: "lead_reply", lead_id: leadId });
      await as("agent", (q) => q(`update ai_drafts set subject = 'Re: 12 Fictional Lane', body = 'Hi Jordan, yes it is.' where id = $1`, [id]));
      expect(await as("mark", (q) => q(`update ai_drafts set body = 'not mine' where id = $1 returning id`, [id]))).toHaveLength(0);
      const approved = await as("agent", async (q) => {
        await q(`update ai_drafts set status = 'approved' where id = $1`, [id]);
        return q<{ status: string; approved: boolean }>(`select status, approved_at is not null as approved from ai_drafts where id = $1`, [id]);
      });
      expect(approved).toEqual([{ status: "approved", approved: true }]);

      await t.query(`update ai_drafts set status = 'approved' where id = $1`, [id]);
      await expect(as("agent", (q) => q(`update ai_drafts set body = 'sneaky edit' where id = $1`, [id]))).rejects.toThrow(/draft_closed/);
      await expect(as("agent", (q) => q(`update ai_drafts set status = 'discarded' where id = $1`, [id]))).rejects.toThrow(/draft_closed/);
      const used = await as("agent", async (q) => {
        await q(`update ai_drafts set sent_via = 'email' where id = $1`, [id]);
        return q<{ sent_via: string; used: boolean }>(`select sent_via, used_at is not null as used from ai_drafts where id = $1`, [id]);
      });
      expect(used).toEqual([{ sent_via: "email", used: true }]);
    });

    it("a draft can't be marked as sent before it's approved", async () => {
      const id = await seed(U.agent, { kind: "lead_reply", lead_id: leadId });
      await expect(as("agent", (q) => q(`update ai_drafts set sent_via = 'portal' where id = $1`, [id]))).rejects.toThrow(/draft_not_approved/);
    });

    it("the owner can't move a draft to another lead, deal or person", async () => {
      const id = await seed(U.agent, { kind: "lead_reply", lead_id: leadId });
      await expect(as("agent", (q) => q(`update ai_drafts set lead_id = $2 where id = $1`, [id, otherLead]))).rejects.toThrow(/permission denied/);
      await expect(t.query(`update ai_drafts set owner_id = $2 where id = $1`, [id, U.agent2])).rejects.toThrow(/draft_fixed_fields/);
    });

    it("discarded is final, and nobody deletes a row directly", async () => {
      const id = await seed(U.agent, { kind: "lead_reply", lead_id: leadId });
      await t.query(`update ai_drafts set status = 'discarded' where id = $1`, [id]);
      expect(await t.query(`select discarded_at is not null as d from ai_drafts where id = $1`, [id])).toEqual([{ d: true }]);
      await expect(t.query(`update ai_drafts set status = 'draft' where id = $1`, [id])).rejects.toThrow(/draft_closed/);
      await expect(as("agent", (q) => q(`delete from ai_drafts where id = $1`, [id]))).rejects.toThrow(/permission denied/);
    });
  });

  describe("purge after 30 days", () => {
    it("removes old discarded and untouched drafts, keeps approved ones and recent ones", async () => {
      const oldDiscarded = await seed(U.agent, { kind: "lead_reply", lead_id: leadId });
      const oldUntouched = await seed(U.agent, { kind: "lead_reply", lead_id: leadId });
      const oldApproved = await seed(U.va, { kind: "escrow_update", deal_id: DEAL });
      const recent = await seed(U.agent, { kind: "lead_reply", lead_id: leadId });
      const recentDiscarded = await seed(U.agent, { kind: "lead_reply", lead_id: leadId });
      await t.query(`update ai_drafts set status = 'discarded' where id in ($1, $2)`, [oldDiscarded, recentDiscarded]);
      await t.query(`update ai_drafts set status = 'approved' where id = $1`, [oldApproved]);
      // Age the rows (the guard keeps the timestamps honest, so step around it).
      await t.exec(`alter table ai_drafts disable trigger ai_drafts_guard`);
      await t.query(`update ai_drafts set updated_at = now() - interval '31 days', discarded_at = case when status = 'discarded' then now() - interval '31 days' end, approved_at = case when status = 'approved' then now() - interval '31 days' end where id in ($1, $2, $3)`, [oldDiscarded, oldUntouched, oldApproved]);
      await t.exec(`alter table ai_drafts enable trigger ai_drafts_guard`);

      expect(await t.query(`select public.purge_ai_drafts() as n`)).toEqual([{ n: 2 }]);
      const left = (await t.query<{ id: string }>(`select id from ai_drafts`)).map((r) => r.id).sort();
      expect(left).toEqual([oldApproved, recent, recentDiscarded].sort());
    });

    it("only the service role can run it", async () => {
      await expect(as("mark", (q) => q(`select public.purge_ai_drafts()`))).rejects.toThrow(/permission denied/);
      await expect(as("anon", (q) => q(`select public.purge_ai_drafts()`))).rejects.toThrow(/permission denied/);
      expect(await t.as("service_role", null, (q) => q(`select public.purge_ai_drafts() as n`))).toEqual([{ n: 0 }]);
    });

    it("drafts go with their lead or deal", async () => {
      const lead = (await t.query<{ id: string }>(`insert into leads (kind, email, name) values ('contact', 'gone@example.test', 'Sam Example') returning id`))[0]!.id;
      await t.query(`update leads set assigned_to = $1 where id = $2`, [U.agent, lead]);
      await seed(U.agent, { kind: "lead_reply", lead_id: lead });
      await t.query(`delete from leads where id = $1`, [lead]);
      expect(await t.query(`select count(*)::int as n from ai_drafts where lead_id = $1`, [lead])).toEqual([{ n: 0 }]);
    });
  });
});
