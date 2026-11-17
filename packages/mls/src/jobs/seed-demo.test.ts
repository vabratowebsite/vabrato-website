import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, type TestDb } from "@vabrato/db/testing";
import { DEMO_PREFIX, demoCheckSql, demoPurgeSql, demoSeedSql } from "./seed-demo";
import { seedPreviewSql } from "./seed-preview";

// The demo content (owner request 2026-11-17): it applies on a fresh database
// with every migration, makes the whole fictional office, queues no email,
// can run twice, and the purge leaves nothing behind. Fictional people only.

const TODAY = "2026-11-17";
const U = {
  admin: "a1000000-0000-4000-8000-00000000d0a1",
  agent: "c1000000-0000-4000-8000-00000000d0c1",
  va: "c2000000-0000-4000-8000-00000000d0c2",
  buyer: "f1000000-0000-4000-8000-00000000d0f1",
  seller: "e1000000-0000-4000-8000-00000000d0e1",
};

describe("demo content", () => {
  let t: TestDb;
  const check = async () => (await t.query<{ demo: Record<string, number> }>(demoCheckSql()))[0]!.demo;
  const count = async (sql: string) => Number((await t.query<{ n: string }>(sql))[0]!.n);
  const emailsQueued = () => count(`select count(*)::text as n from notifications`);

  beforeAll(async () => {
    t = await createTestDb();
    await t.exec(await seedPreviewSql({ now: new Date(`${TODAY}T16:00:00Z`), publicOnly: true }));
    for (const [role, id] of Object.entries(U)) await createUser(t, id, { role, email: `${role}.owner@example.test` });
  }, 120_000);
  afterAll(() => t.close());

  it("makes the whole fictional office, and queues no email", async () => {
    const before = await emailsQueued();
    await t.exec(demoSeedSql({ today: TODAY }));
    expect(await check()).toEqual({
      deals: 7,
      test_deals: 3,
      tasks: expect.any(Number),
      contingencies: 28,
      leads: 10,
      appointments: 7,
      people: 4,
      vendors: 6,
      receipts: 8,
      messages: 6,
      tracked: 3,
      guides: 2,
      posts: 2,
      queued_emails_for_demo: 0,
      non_example_emails: 0,
    });
    expect(await emailsQueued()).toBe(before);
    expect(await count(`select count(*)::text as n from staff_notifications`)).toBe(0);
    expect(await count(`select count(*)::text as n from notification_errors`)).toBe(0);
  });

  it("attaches the demo to the test accounts", async () => {
    expect(await count(`select count(*)::text as n from deal_members where profile_id = '${U.seller}' and member_role = 'seller'`)).toBe(1);
    expect(await count(`select count(*)::text as n from deal_members where profile_id = '${U.va}'`)).toBe(3);
    expect(await count(`select count(*)::text as n from deals where id::text like '${DEMO_PREFIX}%' and agent_id = '${U.agent}' and created_by = '${U.agent}'`)).toBe(7);
    expect(await count(`select count(*)::text as n from tracked_properties where buyer_id = '${U.buyer}'`)).toBe(3);
    expect(await count(`select count(*)::text as n from messages where member_id = '${U.buyer}' and body like '[Demo]%'`)).toBe(4);
    expect(await count(`select count(*)::text as n from leads where profile_id = '${U.buyer}' and email = 'buyer.owner@example.test'`)).toBe(1);
  });

  it("leads never escalate by email, and appointments are approved with their dates", async () => {
    expect(await count(`select count(*)::text as n from leads where id::text like '${DEMO_PREFIX}%' and status = 'new' and escalated_at is null`)).toBe(0);
    const appts = await t.query<{ status: string; date: string }>(`select status, content ->> 'date' as date from ai_drafts where id::text like '${DEMO_PREFIX}%' order by id`);
    expect(appts.filter((a) => a.status === "approved")).toHaveLength(6);
    for (const a of appts) expect([0, 6]).not.toContain(new Date(`${a.date}T12:00:00Z`).getUTCDay());
  });

  it("runs twice without doubling anything", async () => {
    await t.exec(demoSeedSql({ today: TODAY }));
    expect((await check()).deals).toBe(7);
    expect(await count(`select count(*)::text as n from saved_homes where profile_id = '${U.buyer}'`)).toBe(2);
  });

  it("the purge leaves nothing behind", async () => {
    await t.exec(demoPurgeSql());
    const left = await check();
    for (const [k, v] of Object.entries(left)) expect([k, v]).toEqual([k, 0]);
    expect(await count(`select count(*)::text as n from saved_homes`)).toBe(0);
    expect(await count(`select count(*)::text as n from messages`)).toBe(0);
    expect(await count(`select count(*)::text as n from listing_views_daily`)).toBe(0);
    expect(await count(`select count(*)::text as n from featured_listings`)).toBe(0);
    expect(await count(`select count(*)::text as n from profiles`)).toBe(Object.keys(U).length);
  });

  it("stops if the test accounts aren't one per role", async () => {
    await createUser(t, "c3000000-0000-4000-8000-00000000d0c3", { role: "agent" });
    await expect(t.exec(demoSeedSql({ today: TODAY }))).rejects.toThrow(/demo_needs_exactly_one_agent/);
    // Named by email instead, it works.
    await t.exec("rollback");
    await t.exec(demoSeedSql({ today: TODAY, accounts: { agent: "agent.owner@example.test" } }));
    expect((await check()).deals).toBe(7);
  });

  it("everything in it is fictional", () => {
    const sql = demoSeedSql({ today: TODAY });
    const emails = sql.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? [];
    expect(emails.length).toBeGreaterThan(10);
    for (const e of emails) expect(e).toMatch(/@example\.test$/);
    expect(sql).not.toMatch(/routing number|account number|wire (the|your)|wiring instructions/i);
    for (const phone of sql.match(/\d{3}-\d{3}-\d{4}/g) ?? []) expect(phone).toMatch(/^\d{3}-555-01\d\d$/);
  });
});
