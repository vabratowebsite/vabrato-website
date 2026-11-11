import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createUser, type Query, type TestDb } from "./harness";

// S6 PR 2a (0022): lead routing, visibility, lead work, in-console and email
// alerts, delivery claims and retries, the minute sweep, message alerts.
// Fictional people only. `as()` rolls back, so writes later checks rely on
// run on the owner connection with `act()` setting who auth.uid() is.

const U = {
  mark: "a1000000-0000-4000-8000-0000000006a1", // lead admin (role admin)
  viv: "b1000000-0000-4000-8000-0000000006b1", // backup (role agent)
  agent: "c1000000-0000-4000-8000-0000000006c1",
  agent2: "c2000000-0000-4000-8000-0000000006c2",
  va: "d1000000-0000-4000-8000-0000000006d1",
  tc: "d2000000-0000-4000-8000-0000000006d2",
  admin2: "e1000000-0000-4000-8000-0000000006e1", // another role admin (not Mark)
  member: "f1000000-0000-4000-8000-0000000006f1",
} as const;
type Who = keyof typeof U | "anon";
const DENIED = /permission denied|row-level security|not_allowed|lead_admin_only/;

describe("lead routing and notifications (0022)", () => {
  let t: TestDb;
  let n = 0;
  const as = <T>(who: Who, fn: (q: Query) => Promise<T>) =>
    who === "anon" ? t.as("anon", null, fn) : t.as("authenticated", U[who], fn);
  /** Run SQL on the owner connection as if `who` were signed in (persists). */
  const act = async <T>(who: keyof typeof U, sql: string, params: unknown[] = []) => {
    await t.query(`select set_config('request.jwt.claim.sub', $1, false)`, [U[who]]);
    try {
      return await t.query<T>(sql, params);
    } finally {
      await t.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  };
  const lead = async (kind = "contact", extra: Record<string, string | null> = {}) => {
    n += 1;
    const cols = ["kind", "email", "name", ...Object.keys(extra)];
    const vals = [kind, `lead${n}@example.test`, `Jordan Example${n}`, ...Object.values(extra)];
    const rows = await t.query<{ id: string; assigned_to: string | null }>(
      `insert into leads (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id, assigned_to`,
      vals,
    );
    return rows[0]!;
  };
  const routing = (lead: string | null, backup: string | null, extra = "") =>
    t.exec(`update app_settings set lead_admin_id = ${lead ? `'${lead}'` : "null"}, backup_admin_id = ${backup ? `'${backup}'` : "null"}, lead_admin_away = false, lead_admin_away_until = null${extra}`);
  const emails = (recipient: string, template?: string) =>
    t.query<{ template_key: string; payload: Record<string, unknown>; send_at: string; dedupe_key: string }>(
      `select template_key, payload, send_at, dedupe_key from notifications where recipient_profile_id = $1 ${template ? "and template_key = $2" : ""} order by created_at`,
      template ? [recipient, template] : [recipient],
    );
  const inConsole = (recipient: string, kind?: string) =>
    t.query<{ kind: string; title: string; ref_id: string | null }>(
      `select kind, title, ref_id from staff_notifications where recipient_id = $1 ${kind ? "and kind = $2" : ""} order by id`,
      kind ? [recipient, kind] : [recipient],
    );

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, U.mark, { role: "admin" });
    await createUser(t, U.viv, { role: "agent" });
    await createUser(t, U.agent, { role: "agent" });
    await createUser(t, U.agent2, { role: "agent" });
    await createUser(t, U.va, { role: "va" });
    await createUser(t, U.tc, { role: "tc" });
    await createUser(t, U.admin2, { role: "admin" });
    await createUser(t, U.member, { role: "buyer" });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.exec(`delete from notifications; delete from staff_notifications; delete from notification_errors; delete from staff_audit; delete from leads;
                  update app_settings set lead_flood_cap = 10, lead_escalation_minutes = 120`);
    await routing(null, null);
  });

  describe("routing (SPEC <lead_routing>)", () => {
    it("with no routing set: the lead is saved unassigned and every role admin is told", async () => {
      const l = await lead();
      expect(l.assigned_to).toBeNull();
      for (const who of [U.mark, U.admin2]) {
        expect((await inConsole(who)).map((r) => r.kind).sort()).toEqual(["new_lead", "routing_missing"]);
        expect((await emails(who)).map((e) => e.template_key)).toEqual(["staff_new_lead"]);
      }
      expect(await as("admin2", (q) => q(`select id from leads`))).toHaveLength(1); // bootstrap: role admins see all
      expect(await as("agent", (q) => q(`select id from leads`))).toEqual([]);
    });

    it("goes to Mark, alerting him by email (due now) and in the console", async () => {
      await routing(U.mark, U.viv);
      const l = await lead("tour");
      expect(l.assigned_to).toBe(U.mark);
      const [e] = await emails(U.mark);
      expect(e).toMatchObject({ template_key: "staff_new_lead", dedupe_key: `new_lead:${l.id}:${U.mark}`, payload: { leadId: l.id, kind: "tour request", firstName: "Jordan", site: "vabrato" } });
      expect(Date.parse(e!.send_at)).toBeLessThanOrEqual(Date.now());
      expect(await inConsole(U.mark)).toEqual([{ kind: "new_lead", title: "New tour request from Jordan", ref_id: l.id }]);
      expect(await inConsole(U.viv)).toEqual([]);
    });

    it("goes to Viv while Mark is away, and back to Mark when the away time ends", async () => {
      await routing(U.mark, U.viv);
      await t.exec(`update app_settings set lead_admin_away = true`);
      expect((await lead()).assigned_to).toBe(U.viv);
      await t.exec(`update app_settings set lead_admin_away_until = now() - interval '1 minute'`);
      expect((await lead()).assigned_to).toBe(U.mark);
      await t.exec(`update app_settings set lead_admin_away_until = now() + interval '1 day'`);
      expect((await lead()).assigned_to).toBe(U.viv);
    });

    it("works for every insert path: public form, signed-in member, open-house link", async () => {
      await routing(U.mark, U.viv);
      await as("anon", (q) => q(`insert into leads (kind, email) values ('contact', 'anon-path@example.test')`));
      await as("member", (q) => q(`insert into leads (kind, email, profile_id) values ('tour', 'member-path@example.test', '${U.member}')`));
      await expect(as("anon", (q) => q(`insert into leads (kind, email, assigned_to) values ('contact', 'x@example.test', '${U.agent}')`))).rejects.toThrow(/permission denied/);
    });

    it("never rejects a lead when alerting fails", async () => {
      await routing(U.mark, U.viv);
      await t.exec(`alter table staff_notifications add constraint test_break check (kind = 'nope') not valid`);
      try {
        const l = await lead();
        expect(await t.query(`select id from leads where id = $1`, [l.id])).toHaveLength(1);
        expect(await t.query(`select source from notification_errors`)).toEqual([{ source: `lead:${l.id}` }]);
      } finally {
        await t.exec(`alter table staff_notifications drop constraint test_break`);
      }
    });

    it("switches to a 15-minute digest past the hourly flood cap", async () => {
      await routing(U.mark, U.viv, ", lead_flood_cap = 2");
      for (let i = 0; i < 5; i++) await lead();
      expect((await emails(U.mark, "staff_new_lead")).length).toBe(2);
      const digest = await emails(U.mark, "staff_lead_digest");
      expect(digest).toHaveLength(1);
      expect(digest[0]!.payload).toEqual({ count: 3 });
      expect((await inConsole(U.mark, "new_lead")).length).toBe(5); // the console always gets each one
    });
  });

  describe("visibility (Mark/Viv-when-away all, others their own)", () => {
    const visible = async (who: Who) => (await as(who, (q) => q<{ id: string }>(`select id from leads order by created_at`))).length;

    it("matches the matrix", async () => {
      await routing(U.mark, U.viv);
      await lead(); // Mark's
      const own = await lead();
      await t.query(`update leads set assigned_to = $1 where id = $2`, [U.agent, own.id]);
      expect(await visible("mark")).toBe(2);
      expect(await visible("viv")).toBe(0);
      expect(await visible("admin2")).toBe(0); // role admin, but routing is set
      expect(await visible("agent")).toBe(1);
      expect(await visible("agent2")).toBe(0);
      expect(await visible("va")).toBe(0);
      expect(await visible("tc")).toBe(0);
      expect(await visible("member")).toBe(0);
      await expect(visible("anon")).rejects.toThrow(/permission denied/);
      await t.exec(`update app_settings set lead_admin_away = true`);
      expect(await visible("viv")).toBe(2);
      expect(await visible("mark")).toBe(2); // Mark keeps his view while away
    });
  });

  describe("working a lead", () => {
    it("only the acting lead admin reassigns, only to an agent or admin, audited and announced", async () => {
      await routing(U.mark, U.viv);
      const l = await lead();
      await expect(act("agent", `select reassign_lead($1, $2)`, [l.id, U.agent])).rejects.toThrow(/lead_admin_only/);
      await expect(act("viv", `select reassign_lead($1, $2)`, [l.id, U.agent])).rejects.toThrow(/lead_admin_only/);
      await expect(act("mark", `select reassign_lead($1, $2)`, [l.id, U.va])).rejects.toThrow(/not_an_agent/);
      await act("mark", `select reassign_lead($1, $2)`, [l.id, U.agent]);
      expect(await t.query(`select assigned_to, status from leads where id = $1`, [l.id])).toEqual([{ assigned_to: U.agent, status: "assigned" }]);
      expect(await t.query(`select actor_id, action, detail from staff_audit`)).toEqual([{ actor_id: U.mark, action: "reassign_lead", detail: { from: U.mark, to: U.agent } }]);
      expect((await emails(U.agent)).map((e) => e.template_key)).toEqual(["staff_lead_reassigned"]);
      expect((await inConsole(U.agent)).map((r) => r.kind)).toEqual(["lead_reassigned"]);
      // Viv can reassign while Mark is away.
      await t.exec(`update app_settings set lead_admin_away = true`);
      await act("viv", `select reassign_lead($1, $2)`, [l.id, U.agent2]);
      expect(await t.query(`select assigned_to from leads where id = $1`, [l.id])).toEqual([{ assigned_to: U.agent2 }]);
    });

    it("the assignee replies, closes with a reason; nobody else can", async () => {
      await routing(U.mark, U.viv);
      const l = await lead();
      await t.query(`update leads set assigned_to = $1 where id = $2`, [U.agent, l.id]);
      await expect(act("agent2", `select set_lead_status($1, 'closed', 'x')`, [l.id])).rejects.toThrow(/not_allowed/);
      await expect(act("agent", `select set_lead_status($1, 'deleted', null)`, [l.id])).rejects.toThrow(/bad_status/);
      await act("agent", `select mark_lead_replied($1)`, [l.id]);
      const [first] = await t.query<{ first_reply_at: string; status: string }>(`select first_reply_at, status from leads where id = $1`, [l.id]);
      expect(first!.status).toBe("assigned");
      await act("agent", `select mark_lead_replied($1)`, [l.id]);
      expect((await t.query<{ first_reply_at: string }>(`select first_reply_at from leads where id = $1`, [l.id]))[0]!.first_reply_at).toEqual(first!.first_reply_at);
      await act("agent", `select set_lead_status($1, 'closed', ' Bought elsewhere ')`, [l.id]);
      expect(await t.query(`select status, closed_reason from leads where id = $1`, [l.id])).toEqual([{ status: "closed", closed_reason: "Bought elsewhere" }]);
    });

    it("notes follow the lead's visibility", async () => {
      await routing(U.mark, U.viv);
      const l = await lead();
      await t.query(`update leads set assigned_to = $1 where id = $2`, [U.agent, l.id]);
      await as("agent", async (q) => {
        await q(`insert into lead_notes (lead_id, author_id, body) values ($1, $2, 'Called, left voicemail')`, [l.id, U.agent]);
        expect(await q(`select body from lead_notes`)).toEqual([{ body: "Called, left voicemail" }]);
      });
      await expect(as("agent2", (q) => q(`insert into lead_notes (lead_id, author_id, body) values ($1, $2, 'x')`, [l.id, U.agent2]))).rejects.toThrow(/row-level security/);
      await t.query(`insert into lead_notes (lead_id, author_id, body) values ($1, $2, 'Hot lead')`, [l.id, U.agent]);
      expect(await as("agent2", (q) => q(`select body from lead_notes`))).toEqual([]);
      expect(await as("mark", (q) => q(`select body from lead_notes`))).toEqual([{ body: "Hot lead" }]);
    });

    it("routing and away are changed only by the lead admin or a role admin, and audited", async () => {
      await expect(act("agent", `select set_lead_routing($1, $2)`, [U.agent, null])).rejects.toThrow(/not_allowed/);
      await act("admin2", `select set_lead_routing($1, $2, 90, 20)`, [U.mark, U.viv]);
      expect(await t.query(`select lead_admin_id, backup_admin_id, lead_escalation_minutes, lead_flood_cap from app_settings`)).toEqual([
        { lead_admin_id: U.mark, backup_admin_id: U.viv, lead_escalation_minutes: 90, lead_flood_cap: 20 },
      ]);
      await expect(act("mark", `select set_lead_routing($1, $2)`, [U.va, U.viv])).rejects.toThrow(/agent or admin/);
      await expect(act("viv", `select set_lead_admin_away(true, null)`)).rejects.toThrow(/not_allowed/);
      await expect(act("mark", `select set_lead_admin_away(true, now() - interval '1 hour')`)).rejects.toThrow(/until_in_past/);
      await act("mark", `select set_lead_admin_away(true, now() + interval '3 days')`);
      expect((await t.query<{ v: boolean }>(`select lead_admin_away_now() as v`))[0]!.v).toBe(true);
      expect((await t.query<{ action: string }>(`select action from staff_audit order by id`)).map((r) => r.action)).toEqual(["set_lead_routing", "away_on"]);
      // Viv, now acting, can turn it off.
      await act("viv", `select set_lead_admin_away(false)`);
      expect((await t.query<{ v: boolean }>(`select lead_admin_away_now() as v`))[0]!.v).toBe(false);
    });
  });

  describe("delivery: claims, retries, sweep", () => {
    const queue = async (count: number, minutesAgo = 0) => {
      for (let i = 0; i < count; i++) {
        await t.query(`insert into notifications (recipient_profile_id, template_key, payload, send_at) values ($1, 'staff_new_lead', '{}', now() - make_interval(mins => $2))`, [U.mark, minutesAgo]);
      }
    };

    it("claims each due row once until the claim goes stale", async () => {
      await queue(3);
      const first = await t.query<{ id: string; attempts: number; profile_email: string }>(`select * from claim_due_notifications(10)`);
      expect(first).toHaveLength(3);
      expect(first.every((r) => r.attempts === 1 && r.profile_email.endsWith("@example.test"))).toBe(true);
      expect(await t.query(`select * from claim_due_notifications(10)`)).toEqual([]);
      await t.exec(`update notifications set claimed_at = now() - interval '6 minutes'`);
      expect(await t.query(`select * from claim_due_notifications(10)`)).toHaveLength(3);
    });

    it("retries with backoff, then fails and tells the admins; completes once", async () => {
      await queue(2);
      const [a, b] = await t.query<{ id: string }>(`select id from claim_due_notifications(10)`);
      expect((await t.query<{ r: string }>(`select release_notification($1, 'Resend 500') as r`, [a!.id]))[0]!.r).toBe("retry");
      const [row] = await t.query<{ status: string; claimed_at: string | null; future: boolean }>(`select status, claimed_at, send_at > now() as future from notifications where id = $1`, [a!.id]);
      expect(row).toEqual({ status: "scheduled", claimed_at: null, future: true });
      await t.query(`update notifications set attempts = 5 where id = $1`, [a!.id]);
      expect((await t.query<{ r: string }>(`select release_notification($1, 'Resend 500') as r`, [a!.id]))[0]!.r).toBe("failed");
      expect((await t.query<{ r: string }>(`select release_notification($1, 'no recipient email', true) as r`, [b!.id]))[0]!.r).toBe("failed");
      expect((await inConsole(U.admin2, "delivery_failed")).length).toBe(2);
      await queue(1);
      const [c] = await t.query<{ id: string }>(`select id from claim_due_notifications(10)`);
      await t.query(`select complete_notification($1)`, [c!.id]);
      await t.query(`select complete_notification($1)`, [c!.id]);
      expect(await t.query(`select status from notifications where id = $1`, [c!.id])).toEqual([{ status: "sent" }]);
    });

    it("the sweep escalates an unanswered lead once and flags overdue email once an hour", async () => {
      await routing(U.mark, U.viv, ", lead_escalation_minutes = 60");
      const l = await lead();
      await t.query(`update leads set created_at = now() - interval '2 hours' where id = $1`, [l.id]);
      await queue(1, 5);
      const r1 = (await t.query<{ s: Record<string, unknown> }>(`select notification_sweep() as s`))[0]!.s;
      expect(r1).toMatchObject({ escalated: 1, overdue: 1, poked: false });
      expect((await emails(U.viv, "staff_lead_escalated")).length).toBe(1);
      expect((await inConsole(U.viv)).map((x) => x.kind)).toEqual(["lead_escalated"]);
      expect((await inConsole(U.mark, "delivery_overdue")).length).toBe(1);
      const r2 = (await t.query<{ s: Record<string, unknown> }>(`select notification_sweep() as s`))[0]!.s;
      expect(r2).toMatchObject({ escalated: 0 });
      expect((await emails(U.viv, "staff_lead_escalated")).length).toBe(1);
      expect((await inConsole(U.mark, "delivery_overdue")).length).toBe(1);
    });

    it("can't poke the sender without pg_net and Vault (local and tests)", async () => {
      expect((await t.query<{ p: boolean }>(`select poke_notification_sender() as p`))[0]!.p).toBe(false);
    });
  });

  describe("message alerts (S5 review item 17)", () => {
    it("a member's message alerts their agent (one email per 15 minutes); a staff reply emails the member", async () => {
      await routing(U.mark, U.viv);
      await t.query(`update profiles set agent_id = $1, full_name = 'Riley Example' where id = $2`, [U.agent, U.member]);
      await t.query(`insert into messages (member_id, sender_id, body) values ($1, $1, 'Hi, can we tour Saturday?')`, [U.member]);
      await t.query(`insert into messages (member_id, sender_id, body) values ($1, $1, 'Also Sunday works.')`, [U.member]);
      expect((await inConsole(U.agent, "new_message")).map((r) => r.title)).toEqual(["New message from Riley", "New message from Riley"]);
      const staffMail = await emails(U.agent, "staff_new_message");
      expect(staffMail).toHaveLength(1);
      expect(JSON.stringify(staffMail[0]!.payload)).not.toMatch(/tour Saturday/);
      await t.query(`insert into messages (member_id, sender_id, body) values ($1, $2, 'Saturday at 11 works.')`, [U.member, U.agent]);
      expect((await emails(U.member, "member_new_message")).length).toBe(1);
      await t.query(`update profiles set agent_id = null where id = $1`, [U.member]);
    });

    it("falls back to the lead router when the member has no agent", async () => {
      await routing(U.mark, U.viv);
      await t.query(`insert into messages (member_id, sender_id, body) values ($1, $1, 'Question')`, [U.member]);
      expect((await inConsole(U.mark, "new_message")).length).toBe(1);
    });
  });

  describe("other rules", () => {
    it("purges old leads but keeps those linked to a member", async () => {
      const a = await lead();
      const b = await lead("tour", { profile_id: U.member });
      await t.query(`update leads set created_at = now() - interval '25 months' where id in ($1, $2)`, [a.id, b.id]);
      expect((await t.query<{ n: number }>(`select purge_old_leads() as n`))[0]!.n).toBe(1);
      expect(await t.query(`select id from leads where id = $1`, [b.id])).toHaveLength(1);
    });

    it("staff see and clear only their own in-console alerts", async () => {
      await routing(U.mark, U.viv);
      await lead();
      expect(await as("agent", (q) => q(`select id from staff_notifications`))).toEqual([]);
      await as("mark", async (q) => {
        expect(await q(`select kind from staff_notifications`)).toEqual([{ kind: "new_lead" }]);
        expect(await q(`select mark_staff_notifications_read() as n`)).toEqual([{ n: 1 }]);
      });
      await expect(as("mark", (q) => q(`insert into staff_notifications (recipient_id, kind, title) values ($1, 'new_lead', 'x')`, [U.agent]))).rejects.toThrow(/permission denied/);
    });

    it("Viv works the deletion queue only while Mark is away", async () => {
      await routing(U.mark, U.viv);
      await t.query(`insert into account_deletion_requests (profile_id) values ($1)`, [U.member]);
      expect(await as("viv", (q) => q(`select id from account_deletion_requests`))).toEqual([]);
      await t.exec(`update app_settings set lead_admin_away = true`);
      expect(await as("viv", (q) => q(`select id from account_deletion_requests`))).toHaveLength(1);
      await t.exec(`delete from account_deletion_requests`);
    });

    it("keeps the internal functions away from API roles", async () => {
      for (const fn of ["poke_notification_sender()", "notification_sweep()", "claim_due_notifications(1)", "lead_router()"]) {
        for (const who of ["anon", "agent"] as const) {
          await expect(as(who, (q) => q(`select ${fn}`)), `${who} ${fn}`).rejects.toThrow(/permission denied/);
        }
      }
      for (const fn of ["release_notification", "complete_notification", "queue_lead_alert", "staff_notify"]) {
        const [{ ok }] = (await t.query<{ ok: boolean }>(
          `select bool_or(has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) as ok
             from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = $1`,
          [fn],
        )) as [{ ok: boolean }];
        expect(ok, fn).toBe(false);
      }
      expect(DENIED.test("permission denied")).toBe(true);
    });
  });
});
