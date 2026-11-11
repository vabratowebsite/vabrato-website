import { createTestDb, createUser, type TestDb } from "@vabrato/db/testing";
import type { SellerWeeklyReportData } from "@vabrato/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderNotification } from "../notifications";
import { finishedWeeks, weeklyReportMergeFields } from "../seller-report";

// The console previews the seller weekly report from seller_weekly_report_data()
// and weeklyReportMergeFields(); send_seller_weekly_report() builds the payload
// in SQL. Every real migration on PGlite: the email a seller gets must be the
// one staff previewed. Fictional people and listing.

const AGENT = "c1000000-0000-4000-8000-00000000e701";
const SELLER = "e1000000-0000-4000-8000-00000000e702";
const DEAL = "da000000-0000-4000-8000-00000000e703";

describe("seller weekly report: preview = sent email", () => {
  let t: TestDb;
  const asAgent = async <T>(sql: string, params: unknown[] = []) => {
    await t.query(`select set_config('request.jwt.claim.sub', $1, false)`, [AGENT]);
    await t.exec(`set role authenticated`);
    try {
      return await t.query<T>(sql, params);
    } finally {
      await t.exec(`reset role`);
    }
  };

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, AGENT, { role: "agent" });
    await createUser(t, SELLER, { role: "seller" });
    await t.query(`update profiles set full_name = 'Dana Fictional' where id = $1`, [SELLER]);
    await t.exec(`
      insert into mls_listings (listing_key, standard_status, list_price, city, is_own_listing, modification_ts) values ('OWN-E2E', 'Active', 2850000, 'San Carlos', true, now());
      insert into deals (id, address, ratification_date, agent_id, created_by, listing_key) values ('${DEAL}', '501 Fictional Ct, San Carlos', current_date, '${AGENT}', '${AGENT}', 'OWN-E2E');
      insert into deal_members (deal_id, profile_id, member_role) values ('${DEAL}', '${SELLER}', 'seller');
      insert into listing_views_daily (listing_key, day, views)
        values ('OWN-E2E', date_trunc('week', (now() at time zone 'America/Los_Angeles')::date)::date - 5, 9);
    `);
  });
  afterAll(() => t.close());

  it("sends exactly the previewed email", async () => {
    const data = (await asAgent<{ d: SellerWeeklyReportData }>(`select seller_weekly_report_data($1) as d`, [DEAL]))[0]!.d;
    const preview = renderNotification("seller_weekly_report", weeklyReportMergeFields(data, data.sellers[0]?.first_name ?? null));
    await asAgent(`select send_seller_weekly_report($1)`, [DEAL]);
    const [row] = await t.query<{ payload: Record<string, string> }>(`select payload from notifications where template_key = 'seller_weekly_report'`);
    expect(row!.payload).toEqual(weeklyReportMergeFields(data, "Dana"));
    expect(renderNotification("seller_weekly_report", row!.payload)).toEqual(preview);
    expect(preview.body).toContain("- 9 views of the listing page");
  });

  it("offers the last finished weeks, Mondays only", () => {
    expect(finishedWeeks("2026-11-11", 3)).toEqual(["2026-11-02", "2026-10-26", "2026-10-19"]);
    expect(finishedWeeks("2026-11-09", 1)).toEqual(["2026-11-02"]); // a Monday: the current week isn't finished
    expect(finishedWeeks("2026-11-08", 1)).toEqual(["2026-10-26"]); // a Sunday
  });
});
