// S5 PR 2 end-to-end check: hearts and Save search on public pages, the
// saved homes / searches / compare pages, the price-history teaser, and the
// VOW pages with vow_enabled off and then on. Same local stack as
// s5-auth-flow.mjs; needs the full fictional seed (VOW rows included).
//
//   QA_TOOLS=~/qa-tools MAIL_DIR=... PGURL=... REVALIDATE_SECRET=<server's> node scripts/qa/s5-saved-flow.mjs

import { rmSync } from "node:fs";
import { BASE, axeAll, check, done, joinAs, need, sql } from "./lib.mjs";

const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const email = `casey.${stamp}@example.test`;
const SOLD_KEY = sql(`select listing_key from mls_listings where standard_status = 'Closed' and address_display order by listing_key limit 1`);
// Flags are read through Next's 15-minute cache, so flipping one also calls
// /api/revalidate (REVALIDATE_SECRET must match the running server).
const setVow = async (on) => {
  sql(`update feature_flags set enabled = ${on} where key = 'vow_enabled'`);
  if (process.env.FETCH_CACHE) rmSync(process.env.FETCH_CACHE, { recursive: true, force: true });
  if (process.env.REVALIDATE_SECRET) {
    const res = await fetch(`${BASE}/api/revalidate?tag=content`, { method: "POST", headers: { "x-revalidate-secret": process.env.REVALIDATE_SECRET } });
    if (!res.ok) throw new Error(`revalidate failed: ${res.status}`);
  }
};
await setVow(false);

// 1. Signed out: hearts and Save search send people to join; the history teaser has no real data.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/search?city=san-carlos`);
  await page.locator("article button[aria-pressed]").first().click();
  await page.waitForURL(/\/join\?next=/);
  check("signed out: heart goes to join with next", decodeURIComponent(page.url()).includes("next=/search?city=san-carlos"));
  await page.goto(`${BASE}/search?city=san-carlos`);
  await page.getByRole("button", { name: "Save search" }).click();
  await page.waitForURL(/\/join\?next=/);
  check("signed out: Save search goes to join", true);

  const listing = sql(`select listing_key from mls_listings where standard_status = 'Active' and address_display order by listing_key limit 1`);
  await page.goto(`${BASE}/listing/${listing}/x`);
  await page.waitForLoadState("networkidle");
  const html = await page.content();
  check("teaser shows the sign-in prompt", html.includes("Sign in free to see full history"));
  check("teaser holds only dummy prices", html.includes("$0,000,000") && !/\b(Price changed|Listed for sale)<\/td><td[^>]*>\$[1-9]/.test(html));
  await ctx.close();
}

// 2. Signed in buyer, vow_enabled off.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await joinAs(page, { email, name: "Casey Example" });
const me = sql(`select id from profiles where email = '${email}'`);

await page.goto(`${BASE}/search?city=san-carlos&beds=3`);
const firstHeart = page.locator("article button[aria-pressed]").first();
await firstHeart.waitFor();
await page.waitForLoadState("networkidle");
await firstHeart.click();
await page.waitForFunction(() => document.querySelector('button[aria-pressed="true"]'));
await page.waitForTimeout(500);
const savedKeys = () => sql(`select string_agg(listing_key, ',' order by listing_key) from saved_homes where profile_id = '${me}'`);
check("heart saves the home", savedKeys().length > 0, savedKeys());

await page.getByRole("button", { name: "Save search" }).click();
await page.getByText(/Saved as/).waitFor();
check("Save search names it from the filters", sql(`select name from saved_searches where profile_id = '${me}'`) === "San Carlos 3bd+", sql(`select name from saved_searches where profile_id = '${me}'`));
check("saved criteria are the canonical filters", sql(`select criteria::text from saved_searches where profile_id = '${me}'`) === `{"beds": "3", "city": "san-carlos"}`);

// Save a second home from a listing page.
const second = sql(`select listing_key from mls_listings where standard_status = 'Active' and listing_key not in (select listing_key from saved_homes where profile_id = '${me}') order by listing_key limit 1`);
await page.goto(`${BASE}/listing/${second}/x`);
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: /^Save/ }).click();
await page.getByRole("button", { name: /^Saved/ }).waitFor();
check("listing page Save button saves", savedKeys().split(",").includes(second));
check("signed in, flag off: history says coming soon", (await page.content()).includes("Price history is coming to member accounts soon."));

// A save whose listing has left the feed.
sql(`insert into saved_homes (profile_id, listing_key) values ('${me}', 'FX-GONE')`);

await page.goto(`${BASE}/my/saved`);
check("saved page lists both live homes", (await page.locator("article").count()) === 2);
check("saved page shows the gone listing", await page.getByText("is no longer for sale").isVisible());
check("saved page has the MLS attribution", (await page.locator("[data-mls-attribution]").count()) === 1);
await axeAll(page, "/my/saved");
await page.getByRole("button", { name: /Remove/ }).click();
await page.waitForFunction(() => !document.body.innerText.includes("is no longer for sale"));
check("removing the gone save works", !savedKeys().includes("FX-GONE"));

await page.goto(`${BASE}/my/saved`);
for (const box of await page.getByRole("checkbox").all()) await box.check();
await page.getByRole("button", { name: "Compare" }).click();
await page.waitForURL(/\/my\/compare\?key=/);
check("compare shows both homes", (await page.locator("thead th").count()) === 2);
check("compare shows the listing broker row", await page.getByRole("rowheader", { name: "Listing broker" }).isVisible());
await axeAll(page, "/my/compare");

await page.goto(`${BASE}/my/searches`);
check("searches page shows the match count", await page.getByRole("link", { name: /homes? for sale now/ }).isVisible());
check("alerts-off note shows", await page.getByText("Alert emails are off for your account.").isVisible());
await axeAll(page, "/my/searches");
await page.getByLabel("Alerts").selectOption("daily");
await page.getByRole("button", { name: /^Save San Carlos/ }).click();
await page.getByText("Saved.").waitFor();
check("frequency saved", sql(`select frequency from saved_searches where profile_id = '${me}'`) === "daily");

await page.goto(`${BASE}/my/buyer`);
check("buyer home lists the saved search", await page.getByRole("link", { name: "San Carlos 3bd+" }).isVisible());
await axeAll(page, "/my/buyer");

let res = await page.goto(`${BASE}/my/sold`);
check("flag off: /my/sold is 404", res?.status() === 404);
res = await page.goto(`${BASE}/my/listing/${SOLD_KEY}`);
check("flag off: /my/listing is 404", res?.status() === 404);
const api = await page.request.get(`${BASE}/api/my/listings/${SOLD_KEY}/history`);
check("flag off: history API is 404", api.status() === 404);
await page.goto(`${BASE}/my/buyer`);
check("flag off: no Sold near me in nav", !(await page.locator("aside").textContent())?.includes("Sold near me"));

// Origin check on writes.
const forged = await page.request.post(`${BASE}/api/my/saved-homes`, { data: { listingKey: second }, headers: { origin: "https://evil.example" } });
check("API refuses writes from another origin", forged.status() === 403);
check("API responses are private, no-store", (forged.headers()["cache-control"] ?? "").includes("no-store"));

// 3. vow_enabled on: terms first, then sold search, sold detail and history.
await setVow(true);
await page.goto(`${BASE}/my/sold`);
check("flag on, terms not accepted: asks for the terms", await page.getByRole("heading", { name: /Accept the Terms of Use/ }).isVisible());
await page.getByLabel(/I agree to the/).check();
await page.getByRole("button", { name: "Accept and see sold data" }).click();
// Accepting re-renders /my/sold straight into the results.
await page.getByText(/homes? sold$/).waitFor();
check("accepting records the terms", sql(`select vow_terms_version from profiles where id = '${me}'`) === "2026-11-10");
await page.goto(`${BASE}/my/sold?within=365`);
check("sold search lists sold homes", (await page.locator("article").count()) >= 1, String(await page.locator("article").count()));
check("sold page has the MLS attribution", (await page.locator("[data-mls-attribution]").count()) === 1);
await axeAll(page, "/my/sold");
await page.goto(`${BASE}/my/listing/${SOLD_KEY}`);
check("sold detail shows the sold price", await page.getByRole("heading", { name: /^Sold \$/ }).isVisible());
check("sold detail shows history rows", (await page.locator("tbody tr").count()) >= 1);
await axeAll(page, "/my/listing/[key]");

const listing = sql(`select listing_key from mls_listings where standard_status = 'Active' and listing_key in (select listing_key from mls_price_events) order by listing_key limit 1`);
await page.goto(`${BASE}/listing/${listing}/x`);
await page.waitForSelector("table caption");
check("VOW member sees real history on the listing page", !(await page.content()).includes("$0,000,000"));

// Isolation between members is covered by packages/db/test/member-saved.test.ts.

await setVow(false);
await ctx.close();
await browser.close();
done();
