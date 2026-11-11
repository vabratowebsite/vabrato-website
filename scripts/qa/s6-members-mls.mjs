// S6 PR 3 end-to-end check: members (list, search, member page, agent change
// audited, deletion queue), MLS sync (page, alerts on/off, incident banner
// and recovery), ACC-1 at console sign-in (Settings shows the access), and
// Our listings (IDX, then FULL fields only with full_data_enabled on).
// Same local stack as s6-leads-ui.mjs; apps/va started with MLS_OFFICE_ID.
// Adds fictional rows (a roster member for the staff account, a FULL record
// for one of our fixture listings) and switches the flags back off at the end.

import { axeAll, check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const OFFICE = process.env.MLS_OFFICE_ID ?? "VABRA";
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const started = sql(`select now()`);

const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);
sql(`update app_settings set lead_admin_id = '${mark}', lead_admin_away = false, mls_sync_live = false`);
sql(`update sync_alert_state set incident_open = false`);
sql(`insert into mls_members (member_key, full_name, email, member_status, office_mls_id, source) values ('QA-STAFF', 'QA Staff', '${STAFF_EMAIL}', 'Active', '${OFFICE}', 'mock') on conflict (member_key) do update set member_status = 'Active'`);
sql(`delete from mls_agent_access where profile_id = '${mark}'`);
const member = sql(`select id from profiles where role in ('buyer','seller','both') order by created_at desc limit 1`);
const memberName = sql(`select coalesce(nullif(full_name, ''), email) from profiles where id = '${member}'`);
const agent = sql(`select id from profiles where role = 'agent' order by created_at desc limit 1`);

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${VA}/login`);
await page.getByPlaceholder("you@vabrato.com").fill(STAFF_EMAIL);
const before = mails();
await page.getByRole("button", { name: "Email me a sign-in link" }).click();
await page.getByText(/Check your email/).waitFor();
await page.goto(await linkFor(STAFF_EMAIL, before));
await page.waitForURL(`${VA}/`, { timeout: 15000 });

// 1. ACC-1 ran at sign-in.
check("sign-in recorded MLS access for the staff member", sql(`select active from mls_agent_access where profile_id = '${mark}'`) === "t");
await page.goto(`${VA}/settings`);
check("Settings shows the verified access", await page.getByText(/Verified as an active MLSListings member/).isVisible());
check("and that FULL fields are still off", await page.getByText(/FULL MLS fields are off for everyone/).isVisible());

// 2. Members.
await page.goto(`${VA}/members`);
await axeAll(page, "/members");
check("members list shows members", (await page.locator("tbody tr").count()) > 0);
await page.getByLabel("Find a member").fill(memberName.slice(0, 6));
await page.getByRole("button", { name: "Search" }).click();
await page.waitForURL(/\/members\?q=/);
check("search narrows the list", (await page.locator("tbody tr").count()) >= 1);
await page.goto(`${VA}/members/${member}`);
await axeAll(page, "/members/[id]");
if (agent) {
  await page.getByLabel("Agent").selectOption(agent);
  await page.getByRole("button", { name: "Change agent" }).click();
  await page.getByText("Agent updated.").waitFor();
  check("the member's agent changed, audited", sql(`select agent_id from profiles where id = '${member}'`) === agent && sql(`select count(*) from staff_audit where action = 'set_member_agent' and ref_id = '${member}'`) !== "0");
}
sql(`insert into account_deletion_requests (profile_id) values ('${member}') on conflict do nothing`);
await page.goto(`${VA}/members/deletions`);
await axeAll(page, "/members/deletions");
await page.getByLabel("Note (optional)").first().fill(`QA ${stamp}`);
await page.getByRole("button", { name: "Mark done" }).first().click();
await page.getByText(`QA ${stamp}`).waitFor();
check("deletion request marked done with a note", sql(`select status from account_deletion_requests where note = 'QA ${stamp}'`) === "completed");

// 3. MLS sync: alerts off, then on with an incident and recovery.
await page.goto(`${VA}/mls`);
await axeAll(page, "/mls");
check("feed shows as not live", await page.getByText("Feed not live yet").isVisible());
await page.goto(`${VA}/settings`);
await page.getByRole("button", { name: /Turn feed alerts on/ }).click();
await page.getByText(/On: a failed or late sync alerts/).waitFor();
sql(`insert into mls_sync_runs (kind, status, started_at, finished_at, error) values ('incremental', 'failed', now(), now(), 'QA ${stamp}: token endpoint returned 503')`);
check("the sweep opens an incident", sql(`select (public.notification_sweep())->>'sync'`) === "sync_alert");
await page.goto(`${VA}/`);
check("every console page shows the sync banner", await page.getByText(/The MLS sync is failing or late/).isVisible());
check("admins get an in-console sync alert", sql(`select count(*) from staff_notifications where recipient_id = '${mark}' and kind = 'sync_alert' and created_at >= '${started}'`) === "1");
await page.goto(`${VA}/mls`);
check("the MLS page shows the error", await page.getByText(`QA ${stamp}: token endpoint returned 503`).isVisible());
sql(`insert into mls_sync_runs (kind, status, started_at, finished_at, counts) values ('incremental', 'succeeded', now(), now(), '{"upserted": 3}')`);
check("the sweep closes it", sql(`select (public.notification_sweep())->>'sync'`) === "sync_recovered");
await page.goto(`${VA}/`);
check("the banner is gone", (await page.getByText(/The MLS sync is failing or late/).count()) === 0);
await page.goto(`${VA}/settings`);
await page.getByRole("button", { name: "Turn feed alerts off" }).click();
await page.getByText(/Off: the feed isn't live yet/).waitFor();

// 4. Our listings: IDX, then FULL only with the flag on.
const own = sql(`select listing_key from mls_listings where is_own_listing order by listing_key limit 1`);
sql(`insert into mls_listing_full (listing_key, data) values ('${own}', '{"PrivateRemarks": "QA private remark", "ShowingInstructions": "QA showing note"}') on conflict (listing_key) do update set data = excluded.data`);
await page.goto(`${VA}/listings`);
await axeAll(page, "/listings");
check("Our listings shows IDX data", (await page.getByText("IDX data").isVisible()) && (await page.getByText("QA private remark").count()) === 0);
sql(`update feature_flags set enabled = true where key = 'full_data_enabled'`);
try {
  await page.reload();
  check("with the flag on, a verified agent sees FULL fields", await page.getByText("QA private remark").isVisible());
} finally {
  sql(`update feature_flags set enabled = false where key = 'full_data_enabled'`);
}

await browser.close();
done();
