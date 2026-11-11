// S6 PR 5 end-to-end check: seller weekly report (preview, send once, the
// email reaches the fake Resend with the previewed subject), market stats and
// CMAs (off by default; on with fictional sold fixtures: medians, a saved CMA
// with a price range and the "not an appraisal" notice, a comparable that
// leaves the feed shown as missing, print view without the console frame),
// and the website city page stats behind public_stats. axe at 1440 and 390 px
// on every new page.
// Same local stack as s6-lead-alert.mjs (apps/va started with CRON_SECRET,
// RESEND_BASE_URL and MLS_OFFICE_ID; the fake Resend writing RESEND_LOG).
// Adds fictional sold listings QA-S1…QA-S6 in Belmont and removes them, the
// CMA and the flags at the end. Uses an existing fictional deal linked to a
// listing with a seller.

import { readFileSync } from "node:fs";
import { BASE, axeAll, check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const OFFICE = process.env.MLS_OFFICE_ID ?? "VABRA";
const LOG = process.env.RESEND_LOG;
const SECRET = process.env.CRON_SECRET;
if (!LOG || !SECRET) throw new Error("set RESEND_LOG and CRON_SECRET");
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
// The fake Resend logs each request as { at, path, idem, body: <Resend payload> }.
const sent = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).body ?? {});
// The website caches flags and stats (15 minutes); refresh it after each switch.
const revalidate = () =>
  Promise.all(["content", "mls"].map((tag) => fetch(`${BASE}/api/revalidate?tag=${tag}`, { method: "POST", headers: { "x-revalidate-secret": process.env.REVALIDATE_SECRET ?? "" } }).catch(() => {})));
const flags = async (on) => {
  sql(`update feature_flags set enabled = ${on} where key in ('market_stats_enabled', 'cma_enabled', 'public_stats')`);
  await revalidate();
};

// Fixtures.
sql(`insert into mls_members (member_key, full_name, email, member_status, office_mls_id, source) values ('QA-STAFF', 'QA Staff', '${STAFF_EMAIL}', 'Active', '${OFFICE}', 'mock') on conflict (member_key) do update set member_status = 'Active'`);
await flags(false);
sql(`delete from cmas; delete from mls_listings where listing_key like 'QA-S%'`);
sql(`insert into mls_listings (listing_key, standard_status, list_price, city, county, living_area, bedrooms_total, bathrooms_total, address_display, is_own_listing, list_office_name, modification_ts, data)
     select 'QA-S' || i, 'Closed', 1000000 + i * 100000, 'Belmont', 'San Mateo', 1000 + i * 50, 3, 2, i <> 6, false, 'Example Realty', now(),
            jsonb_build_object('StreetNumber', (100 + i)::text, 'StreetName', 'Sample', 'StreetSuffix', 'Ave', 'OnMarketDate', (current_date - 40 - i)::text)
     from generate_series(1, 6) i`);
sql(`insert into mls_listing_vow (listing_key, data)
     select listing_key, jsonb_build_object('ClosePrice', round(list_price * 1.04), 'CloseDate', (current_date - 10 * substr(listing_key, 5)::int)::text)
     from mls_listings where listing_key like 'QA-S%'`);
const deal = sql(`select d.id from deals d where d.listing_key is not null and d.status = 'active'
                  and exists (select 1 from deal_members m where m.deal_id = d.id and m.member_role = 'seller') order by d.created_at limit 1`);
const address = sql(`select address from deals where id = '${deal}'`);
sql(`delete from seller_report_sends where deal_id = '${deal}'; delete from notifications where dedupe_key like 'seller_weekly:${deal}:%'`);

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${VA}/login`);
await page.getByPlaceholder("you@vabrato.com").fill(STAFF_EMAIL);
const before = mails();
await page.getByRole("button", { name: "Email me a sign-in link" }).click();
await page.getByText(/Check your email/).waitFor();
await page.goto(await linkFor(STAFF_EMAIL, before));
await page.waitForURL(`${VA}/`, { timeout: 15000 });

try {
  // 1. Seller weekly report.
  await page.goto(`${VA}/reports`);
  await axeAll(page, "/reports");
  check("the deal is listed with last week's numbers", await page.getByRole("link", { name: address }).isVisible());
  await page.goto(`${VA}/reports/${deal}`);
  await axeAll(page, "/reports/[deal]");
  const subject = (await page.locator("p", { hasText: /^Subject:/ }).innerText()).replace(/^Subject:\s*/, "");
  check("the preview shows the static template", subject.startsWith(`Your listing this week: ${address}`) && (await page.getByText(/views of the listing page/).isVisible()));
  const before2 = sent().length;
  await page.getByRole("button", { name: "Send to sellers" }).click();
  await page.getByText(/^Sent to \d+ seller/).waitFor();
  check("sent once, recorded and audited", sql(`select count(*) from seller_report_sends where deal_id = '${deal}'`) === "1" && sql(`select count(*) from staff_audit where action = 'send_seller_weekly_report' and ref_id = '${deal}'`) !== "0");
  check("the Send button is gone for that week", (await page.getByRole("button", { name: "Send to sellers" }).count()) === 0);
  await fetch(`${VA}/api/notifications/process`, { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } });
  const mail = sent().slice(before2).find((m) => m.subject === subject);
  check("the seller's email went out with the previewed subject", Boolean(mail), mail ? "" : `subjects: ${sent().slice(before2).map((m) => m.subject).join(" | ")}`);
  check("the email has counts only, no lead contact details", Boolean(mail) && !/@example\.test/.test(mail.text ?? "") && /views of the listing page/.test(mail.text ?? ""));

  // 2. Stats and CMAs are off by default.
  await page.goto(`${VA}/stats`);
  check("market stats are off by default", await page.getByRole("heading", { name: "Off for now" }).isVisible());
  await axeAll(page, "/stats (off)");
  await page.goto(`${VA}/cmas`);
  check("CMAs are off by default", await page.getByRole("heading", { name: "Off for now" }).isVisible());
  await axeAll(page, "/cmas (off)");
  check("the website city page has no stats while public_stats is off", !(await (await fetch(`${BASE}/neighborhoods/belmont`)).text()).includes("Belmont market, last"));

  // 3. With the flags on (fictional sold fixtures).
  await flags(true);
  await page.goto(`${VA}/stats?city=belmont&months=12`);
  await axeAll(page, "/stats (on)");
  const tiles = await page.locator("main").innerText();
  const expected = JSON.parse(sql(`select (market_stats_compute('belmont', 12) -> 'sold')::text`));
  const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
  check(
    "stats show the database's sold count and median",
    expected.count >= 6 && expected.median_price != null && tiles.includes(money(expected.median_price)) && tiles.includes(String(expected.count)),
    `expected ${JSON.stringify(expected)}`,
  );
  await page.goto(`${VA}/cmas/new?city=belmont&sqft=1300&months=6`);
  await axeAll(page, "/cmas/new (results)");
  for (const k of ["QA-S1", "QA-S2", "QA-S3", "QA-S6"]) await page.locator(`#comp-${k}`).check();
  check("a hidden address stays hidden", await page.locator('label[for="comp-QA-S6"]').getByText("Address withheld").isVisible());
  await page.getByLabel("Title").fill("QA subject, Belmont");
  await page.getByRole("button", { name: "Save CMA" }).click();
  await page.waitForURL(/\/cmas\/[0-9a-f-]{36}$/);
  const cmaId = page.url().split("/").pop();
  check("the CMA stores keys only", sql(`select array_to_string(comp_keys, ',') || '|' || subject::text from cmas where id = '${cmaId}'`).startsWith("QA-S1,QA-S2,QA-S3,QA-S6|"));
  check("the CMA shows a range and says it isn't an appraisal", (await page.getByText(/It is not an appraisal/).isVisible()) && /\$[\d,]+ – \$[\d,]+/.test(await page.locator("main").innerText()));
  check("the CMA carries MLS attribution", (await page.locator("[data-mls-attribution]").count()) === 1);
  await axeAll(page, "/cmas/[id]");
  sql(`delete from mls_listings where listing_key = 'QA-S3'`);
  await page.reload();
  check("a comparable that left the feed is listed as missing", await page.getByText(/No longer available from the MLS feed \(1\): QA-S3/).isVisible());
  await page.emulateMedia({ media: "print" });
  check("print view hides the console frame", !(await page.locator("aside").isVisible()) && (await page.getByText(/It is not an appraisal/).isVisible()));
  await page.emulateMedia({ media: "screen" });
  const city = await (await fetch(`${BASE}/neighborhoods/belmont`)).text();
  check("with public_stats on, the city page shows market stats", city.includes("Belmont market, last 12 months"));
  await page.getByRole("button", { name: "Delete CMA" }).click();
  await page.getByText("CMA deleted.").waitFor();
} finally {
  sql(`delete from cmas; delete from mls_listings where listing_key like 'QA-S%'`);
  await flags(false);
}

await browser.close();
done();
