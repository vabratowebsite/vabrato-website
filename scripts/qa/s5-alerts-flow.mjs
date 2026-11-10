// S5 PR 3 end-to-end check in the browser: a feed change becomes a bell
// count, a "What changed" entry and a queued email; opening the feed clears
// the bell; unsubscribe works from the confirm page and one-click POST, and a
// GET never unsubscribes. Same local stack as s5-auth-flow.mjs. The feed
// change is simulated in the database (fictional rows), then
// run_member_alerts() runs as the sync job would.

import { BASE, axeAll, check, done, joinAs, need, sql } from "./lib.mjs";

const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const email = `riley.${stamp}@example.test`;
const KEY = `QA-${stamp}`;

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await joinAs(page, { email, name: "Riley Example" });
const me = sql(`select id from profiles where email = '${email}'`);
sql(`update profiles set alerts_email_opt_in = true, alerts_opt_in_at = now() where id = '${me}'`);

// Cursor first (first run only initializes), then a saved search and a saved home.
sql(`select public.run_member_alerts()`);
const saved = sql(`select listing_key from mls_listings where standard_status = 'Active' and address_display and list_office_mls_id <> 'VABRA' order by listing_key limit 1`);
sql(`insert into saved_homes (profile_id, listing_key) values ('${me}', '${saved}')`);
sql(`insert into saved_searches (profile_id, name, criteria, frequency) values ('${me}', 'San Carlos QA', '{"city":"san-carlos"}', 'instant')`);

// Feed change: a new San Carlos listing with a hidden address, and a price drop on the saved home.
sql(`insert into mls_listings (listing_key, standard_status, list_price, city, county, list_office_mls_id, list_office_name, is_own_listing, address_display, bedrooms_total, modification_ts, data, source)
     values ('${KEY}', 'Active', 1777000, 'San Carlos', 'San Mateo', 'EXRG', 'Example Realty Group', false, false, 3, now(),
             '{"StreetNumber":"9","StreetName":"Hidden","StreetSuffix":"Ln","OnMarketDate":"${new Date().toISOString().slice(0, 10)}"}', 'mock')`);
sql(`insert into mls_price_events (listing_key, list_price, standard_status, observed_at) values ('${KEY}', 1777000, 'Active', now())`);
const oldPrice = Number(sql(`select list_price from mls_listings where listing_key = '${saved}'`));
sql(`update mls_listings set list_price = ${oldPrice - 75000} where listing_key = '${saved}'`);
sql(`insert into mls_price_events (listing_key, list_price, standard_status, observed_at) values ('${saved}', ${oldPrice - 75000}, 'Active', now())`);
const r = JSON.parse(sql(`select public.run_member_alerts()::text`));
check("alert run succeeds", typeof r.deliveries === "number", JSON.stringify(r));
check("this member gets 2 deliveries", sql(`select count(*) from alert_deliveries where profile_id = '${me}'`) === "2");
check("one instant email is queued for this member", sql(`select count(*) from notifications where recipient_profile_id = '${me}' and template_key = 'buyer_alert_instant' and status = 'scheduled'`) === "1");

await page.goto(`${BASE}/my/buyer`);
check("bell shows 2 new", await page.getByRole("link", { name: "What changed, 2 new" }).isVisible());
check("dashboard lists the price drop", await page.getByText("Price reduced").first().isVisible());
check("hidden address shows by city only", (await page.content()).includes("Home in San Carlos") && !(await page.content()).includes("9 Hidden Ln"));
check("other broker's listing shows courtesy line", await page.getByText(/Listing courtesy of Example Realty Group/).first().isVisible());
check("dashboard feed never shows the old price", !(await page.locator("main").innerText()).includes(`$${oldPrice.toLocaleString("en-US")}`));
await axeAll(page, "/my/buyer with alerts");

await page.goto(`${BASE}/my/alerts`);
check("What changed page lists both", (await page.locator("main li").count()) === 2);
check("What changed page has the MLS attribution", (await page.locator("[data-mls-attribution]").count()) === 1);
await axeAll(page, "/my/alerts");
await page.goto(`${BASE}/my/buyer`);
check("opening the feed clears the bell", await page.getByRole("link", { name: "What changed", exact: true }).isVisible());

const payload = JSON.parse(sql(`select payload::text from notifications where recipient_profile_id = '${me}' and template_key = 'buyer_alert_instant'`));
check("queued email items carry no old price", !JSON.stringify(payload).includes(String(oldPrice)));
check("queued email withholds the hidden street", !JSON.stringify(payload).includes("Hidden"));

// Unsubscribe: GET does nothing, the confirm page does, one-click POST does.
const token = payload.unsubscribe_token;
const anon = await browser.newContext();
const p2 = await anon.newPage();
await p2.goto(`${BASE}/api/alerts/unsubscribe?t=${token}`);
check("GET on the one-click URL lands on the confirm page", p2.url().startsWith(`${BASE}/alerts/unsubscribe?t=`));
check("GET never unsubscribes", sql(`select alerts_email_opt_in from profiles where id = '${me}'`) === "t");
await axeAll(p2, "/alerts/unsubscribe");
await p2.getByRole("button", { name: "Unsubscribe from alert emails" }).click();
await p2.getByText("You're unsubscribed from alert emails.").waitFor();
check("confirm page unsubscribes", sql(`select alerts_email_opt_in from profiles where id = '${me}'`) === "f");

sql(`update profiles set alerts_email_opt_in = true where id = '${me}'`);
const res = await p2.request.post(`${BASE}/api/alerts/unsubscribe?t=${token}`, { form: { "List-Unsubscribe": "One-Click" } });
check("one-click POST unsubscribes", res.ok() && sql(`select alerts_email_opt_in from profiles where id = '${me}'`) === "f");
const bad = await p2.request.post(`${BASE}/api/alerts/unsubscribe?t=not-a-token`);
check("bad token is refused", bad.status() === 400);

// Clean up the fictional QA listing (its deliveries cascade).
sql(`delete from mls_listings where listing_key = '${KEY}'`);
await browser.close();
done();
