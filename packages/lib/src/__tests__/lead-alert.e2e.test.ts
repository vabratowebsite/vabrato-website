import { createTestDb, createUser, type TestDb } from "@vabrato/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processDueNotifications, type DueNotification, type NotificationDeps, type OutboundEmail } from "../notifications";

// SPEC S6 done-when: "every web lead reaches Mark within 1 minute". A lead
// row → the 0022 triggers route it and queue the email in the same
// transaction → the console's sender (poked by pg_net right after commit in
// production; called directly here) claims it and sends it. Every real
// migration on PGlite; the sender adapter mirrors supabaseNotificationDeps
// (claim_due_notifications / complete_notification / release_notification).
// The public, member and open-house insert paths are covered in
// packages/db/test/console-leads.test.ts. All people are fictional.

const MARK = "a1000000-0000-4000-8000-00000000e601";
const VIV = "b1000000-0000-4000-8000-00000000e602";

describe("a web lead reaches Mark within 1 minute (S6 done-when)", () => {
  let t: TestDb;
  const sent: { email: OutboundEmail; at: number }[] = [];

  const deps = (): NotificationDeps => ({
    consoleUrl: "https://console.vabrato.com",
    fetchDue: async () =>
      (
        await t.query<{ id: string; template_key: string; payload: unknown; recipient_email: string | null; profile_email: string | null; alerts_email_opt_in: boolean | null }>(
          `select * from claim_due_notifications(50)`,
        )
      ).map((r): DueNotification => ({ id: r.id, template_key: r.template_key, payload: r.payload, recipientEmail: r.recipient_email ?? r.profile_email, alertsOptedOut: r.alerts_email_opt_in === false })),
    send: async (email) => {
      sent.push({ email, at: Date.now() });
      return { error: null };
    },
    markSent: async (id) => void (await t.query(`select complete_notification($1)`, [id])),
    markFailed: async (id, reason, permanent) => void (await t.query(`select release_notification($1, $2, $3)`, [id, reason, permanent ?? false])),
  });

  const webLead = async (email: string) => {
    const at = Date.now();
    const [row] = await t.query<{ id: string; assigned_to: string }>(
      `insert into leads (kind, email, name, payload, site) values ('valuation', $1, 'Avery Sample', '{"address":"1 Fiction Rd"}', 'vabrato') returning id, assigned_to`,
      [email],
    );
    return { ...row!, at };
  };

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, MARK, { role: "admin", email: "mark.e2e@example.test" });
    await createUser(t, VIV, { role: "agent", email: "viv.e2e@example.test" });
    await t.exec(`update app_settings set lead_admin_id = '${MARK}', backup_admin_id = '${VIV}'`);
  });
  afterAll(() => t.close());

  it("queues Mark's email in the same transaction and sends it on the next sender run", async () => {
    const l = await webLead("avery.e2e@example.test");
    expect(l.assigned_to).toBe(MARK);
    const result = await processDueNotifications(deps());
    expect(result).toEqual({ sent: 1, failed: 0 });
    const mail = sent.at(-1)!;
    expect(mail.email.to).toBe("mark.e2e@example.test");
    expect(mail.email.subject).toBe("New home valuation request from Avery");
    expect(mail.email.body).toContain(`https://console.vabrato.com/leads/${l.id}`);
    expect(mail.email.body).not.toMatch(/avery\.e2e@|1 Fiction Rd/); // no contact details or payload in the email
    expect(mail.at - l.at).toBeLessThan(60_000);
    expect(await t.query(`select status from notifications where dedupe_key = $1`, [`new_lead:${l.id}:${MARK}`])).toEqual([{ status: "sent" }]);
    expect(await t.query(`select kind from staff_notifications where recipient_id = $1 and ref_id = $2`, [MARK, l.id])).toEqual([{ kind: "new_lead" }]);
  });

  it("a second sender run sends nothing more", async () => {
    expect(await processDueNotifications(deps())).toEqual({ sent: 0, failed: 0 });
  });

  it("reaches Viv instead while Mark is away", async () => {
    await t.exec(`update app_settings set lead_admin_away = true`);
    const l = await webLead("blake.e2e@example.test");
    expect(l.assigned_to).toBe(VIV);
    await processDueNotifications(deps());
    const mail = sent.at(-1)!;
    expect(mail.email.to).toBe("viv.e2e@example.test");
    expect(mail.at - l.at).toBeLessThan(60_000);
    await t.exec(`update app_settings set lead_admin_away = false`);
  });

  it("retries a failed send on a later run instead of losing it", async () => {
    const l = await webLead("casey.e2e@example.test");
    const failing = { ...deps(), send: async () => ({ error: "Resend 503: unavailable" }) };
    expect(await processDueNotifications(failing)).toEqual({ sent: 0, failed: 1 });
    const [row] = await t.query<{ status: string; attempts: number }>(`select status, attempts from notifications where dedupe_key = $1`, [`new_lead:${l.id}:${MARK}`]);
    expect(row).toEqual({ status: "scheduled", attempts: 1 });
    await t.exec(`update notifications set send_at = now() where dedupe_key = 'new_lead:${l.id}:${MARK}'`);
    expect(await processDueNotifications(deps())).toEqual({ sent: 1, failed: 0 });
  });
});
