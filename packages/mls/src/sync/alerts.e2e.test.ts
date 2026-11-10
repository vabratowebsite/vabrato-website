import { createTestDb, createUser, type TestDb } from "@vabrato/db/testing";
import { processDueNotifications, type DueNotification, type OutboundEmail } from "@vabrato/lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MlsConfig } from "../config";
import { createClientFromConfig } from "../factory";
import { FIXTURE_NOW } from "../fixtures";
import { createMockHandler } from "../mock/handler";
import { runMemberAlerts } from "./alerts";
import { clientEventCounter, runIncremental, runReconcile, type SyncDeps } from "./engine";
import { MemoryBucket } from "./photos";
import { pgliteSql } from "./sql";
import { PgSyncStore } from "./store";

// SPEC S5 done-when: "a test buyer gets an alert within 30 minutes of a feed
// change". Mock RESO feed → incremental sync → run_member_alerts() → the
// notifications processor, on PGlite with every real migration. In
// production the sync and this step run every 15 minutes on Render, so the
// worst case is one interval plus run time; here the clock is the feed's.
// All people and listings are fictional.

const BUYER = "a2000000-0000-4000-8000-00000000e2e1";
const MIN = 60_000;

describe("buyer alert within 30 minutes of a feed change (S5 done-when)", () => {
  let t: TestDb;
  let deps: SyncDeps;
  let feed: ReturnType<typeof createMockHandler>["feed"];
  let clock = FIXTURE_NOW;
  const sent: OutboundEmail[] = [];

  // Processor deps over PGlite, mirroring supabaseNotificationDeps.
  const processor = () =>
    processDueNotifications({
      siteUrl: "https://vabrato.com",
      fetchDue: async () =>
        (
          await t.query<{ id: string; template_key: string; payload: unknown; email: string; opted_in: boolean }>(
            `select n.id, n.template_key, n.payload, p.email, p.alerts_email_opt_in as opted_in
               from notifications n join profiles p on p.id = n.recipient_profile_id
              where n.status = 'scheduled' and n.send_at <= $1 order by n.send_at`,
            [clock.toISOString()],
          )
        ).map((r): DueNotification => ({ id: r.id, template_key: r.template_key, payload: r.payload, recipientEmail: r.email, alertsOptedOut: !r.opted_in })),
      send: async (e) => {
        sent.push(e);
        return { error: null };
      },
      markSent: async (id) => void (await t.query(`update notifications set status = 'sent', sent_at = $2 where id = $1`, [id, clock.toISOString()])),
      markFailed: async (id, reason) => void (await t.query(`update notifications set status = 'failed', failure_reason = $2 where id = $1`, [id, reason])),
      markCancelled: async (id) => void (await t.query(`update notifications set status = 'cancelled' where id = $1`, [id])),
    });

  /** One scheduled job run: incremental sync, alerts, processor. */
  const scheduledRun = async () => {
    const r = await runIncremental(deps);
    expect(r.status).toBe("succeeded");
    const alerts = await runMemberAlerts(pgliteSql(t.db), clock);
    const mail = await processor();
    return { alerts, mail };
  };

  beforeAll(async () => {
    t = await createTestDb();
    const mock = createMockHandler({ maxPageSize: 10 });
    feed = mock.feed;
    const config: MlsConfig = { mode: "mock", officeId: "VABRA", rateLimitPerSec: 1000, photoMode: "hotlink", soldHistoryYears: 3 };
    const { client } = createClientFromConfig(config, { mock, onEvent: clientEventCounter().onEvent, retry: { baseDelayMs: 1, maxAttempts: 3 } });
    deps = { client, store: new PgSyncStore(pgliteSql(t.db)), config, bucket: new MemoryBucket(), now: () => clock, clientEvents: clientEventCounter(), overlapMinutes: 0 };

    // Initial load, then the first alert run only sets the cursor.
    expect((await runReconcile(deps)).status).toBe("succeeded");
    expect(await runMemberAlerts(pgliteSql(t.db), clock)).toEqual({ initialized: true });

    // A fictional buyer who opted in to alert emails, with a saved home and a saved search.
    await createUser(t, BUYER, { email: "jordan.e2e@example.test" });
    await t.exec(`
      update profiles set full_name = 'Jordan Example', alerts_email_opt_in = true, alerts_opt_in_at = now() where id = '${BUYER}';
      insert into saved_homes (profile_id, listing_key) values ('${BUYER}', 'FX-002');
      insert into saved_searches (profile_id, name, criteria, frequency) values ('${BUYER}', 'San Carlos 3bd+', '{"city":"san-carlos","beds":"3"}', 'instant');
    `);
  });
  afterAll(() => t.close());

  it("emails the buyer about a price drop and a new matching listing on the next scheduled run", async () => {
    // The feed changes: a price drop on the saved home, and a new San Carlos listing.
    const changeAt = new Date(clock.getTime() + MIN);
    clock = changeAt;
    const old = Number(feed.find("Property", "FX-002")!.ListPrice);
    feed.now = changeAt;
    feed.update("Property", "FX-002", { ListPrice: old - 100_000 });
    const template = feed.find("Property", "FX-001")!;
    feed.add("Property", {
      ...template,
      ListingKey: "FX-901",
      ListingId: "ML8000901",
      ListPrice: 1_895_000,
      OnMarketDate: changeAt.toISOString().slice(0, 10),
      StreetNumber: "901",
      UnparsedAddress: "901 Example Way, San Carlos, CA 94070",
      ListOfficeMlsId: "EXRG",
      ListOfficeName: "Example Realty Group",
      ListAgentMlsId: "EX1",
    });

    // Next scheduled run, at most 15 minutes later.
    clock = new Date(changeAt.getTime() + 14 * MIN);
    feed.now = clock;
    const { alerts, mail } = await scheduledRun();
    expect(alerts).toMatchObject({ deliveries: 2, instant_emails: 1 });
    expect(mail).toEqual({ sent: 1, failed: 0 });

    const [row] = await t.query<{ sent_at: string }>(`select sent_at from notifications where status = 'sent'`);
    expect(Date.parse(row!.sent_at) - changeAt.getTime()).toBeLessThanOrEqual(30 * MIN);

    const email = sent[0]!;
    expect(email.to).toBe("jordan.e2e@example.test");
    expect(email.subject).toBe("2 updates on homes you're following");
    expect(email.body).toContain("Price reduced:");
    expect(email.body).toContain(`now $${(old - 100_000).toLocaleString("en-US")}`);
    expect(email.body).toContain('New listing for "San Carlos 3bd+": 901');
    expect(email.body).toContain("https://vabrato.com/listing/FX-901");
    expect(email.body).toContain("Listing courtesy of Example Realty Group");
    expect(email.body).toContain("MLSListings Inc.");
    expect(email.body).not.toContain(`$${old.toLocaleString("en-US")}`); // never the previous price (review item 3)
    expect(email.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    const feedRows = await t.query<{ listing_key: string; kind: string }>(`select listing_key, kind from alert_deliveries where profile_id = $1 order by listing_key`, [BUYER]);
    expect(feedRows).toEqual([
      { listing_key: "FX-002", kind: "price_drop" },
      { listing_key: "FX-901", kind: "new_match" },
    ]);
  });

  it("sends nothing on the next run when nothing changed", async () => {
    clock = new Date(clock.getTime() + 15 * MIN);
    feed.now = clock;
    const { alerts, mail } = await scheduledRun();
    expect(alerts).toMatchObject({ deliveries: 0, instant_emails: 0 });
    expect(mail).toEqual({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(1);
  });

  it("stops emailing once the buyer unsubscribes, but keeps the portal feed", async () => {
    const [{ token }] = (await t.query<{ token: string }>(`select alerts_unsubscribe_token::text as token from profiles where id = $1`, [BUYER])) as [{ token: string }];
    await t.query(`select public.unsubscribe_alert_emails($1::uuid)`, [token]);
    clock = new Date(clock.getTime() + MIN);
    feed.now = clock;
    feed.update("Property", "FX-002", { ListPrice: Number(feed.find("Property", "FX-002")!.ListPrice) - 50_000 });
    clock = new Date(clock.getTime() + 14 * MIN);
    feed.now = clock;
    const { alerts, mail } = await scheduledRun();
    expect(alerts).toMatchObject({ deliveries: 1, instant_emails: 0 });
    expect(mail).toEqual({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(1);
  });

  it("drops the alert feed with the listing when it leaves the feed (review item 5)", async () => {
    await t.query(`delete from mls_listings where listing_key = 'FX-901'`);
    expect(await t.query(`select count(*)::int as n from alert_deliveries where listing_key = 'FX-901'`)).toEqual([{ n: 0 }]);
  });
});
