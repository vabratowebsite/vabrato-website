// S5 PR 5 end-to-end check: the seller portal (timeline, to-dos, wiring
// banner, .ics), linking the deal to its listing in the agent console,
// listing views from a real browser visit, open-house sign-in links on the
// "tablet", and listing activity. Same local stack as s5-buyer-flow.mjs, with
// LISTING_VIEW_SECRET set on apps/web and its sha256 in listing_view_keys.
// Fictional people and fixture listings only.

import { BASE, axeAll, check, done, joinAs, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const LISTING = process.env.LISTING_KEY ?? "FX-013"; // a fixture listing of ours, Active
const CHROME_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
// SHOTS=/some/dir saves full-page screenshots of the seller pages.
const shot = async (p, name) => process.env.SHOTS && p.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true });
const email = `riley.${stamp}@example.test`;
const ADDRESS = `${stamp % 1000} Fictional Dr, San Carlos`;

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await joinAs(page, { email, name: "Riley Example", role: "seller" });
const me = sql(`select id from profiles where email = '${email}'`);
const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);
const deal = sql(`insert into deals (address, ratification_date, days_to_close, sale_price, agent_id, created_by)
  values ('${ADDRESS}', current_date - 6, 21, 2850000, '${mark}', '${mark}') returning id`).split("\n")[0];
sql(`insert into deal_members (deal_id, profile_id, member_role) values ('${deal}', '${me}', 'seller')`);
sql(`insert into deal_contingencies (deal_id, kind, offset_days, due_date, removed_at) values
  ('${deal}', 'property_condition', 4, current_date - 2, now()), ('${deal}', 'appraisal', 10, current_date + 4, null), ('${deal}', 'financing', 14, current_date + 8, null)`);
sql(`insert into tasks (deal_id, title, owner, phase, offset_days, due_date, done) values
  ('${deal}', 'Sign seller disclosures', 'Seller', 'after_ratification', 1, current_date - 5, true),
  ('${deal}', 'Confirm move-out date with movers', 'Seller', 'closing_week', 14, current_date + 8, false),
  ('${deal}', 'Order payoff demand', 'Escrow', 'after_ratification', 2, current_date - 4, false)`);
const OH = `OH-QA-${stamp}`;
sql(`insert into mls_open_houses (open_house_key, listing_key, start_time, end_time) values ('${OH}', '${LISTING}', now(), now() + interval '2 hours')`);
sql(`insert into mls_open_houses (open_house_key, listing_key, start_time, end_time) values ('${OH}-L', '${LISTING}', now() + interval '6 days', now() + interval '6 days 2 hours')`);

// 1. Seller portal before the listing is linked.
await page.goto(`${BASE}/my/seller`);
const h1 = await page.getByRole("heading", { level: 1 }).innerText();
check("headline counts down to closing", /\d+ days to closing/i.test(h1), h1);
check("wiring banner with the sale price", (await page.getByRole("note", { name: "Wiring safety" }).innerText()).includes("$2,850,000"));
check("timeline has the contract dates", (await page.getByRole("list", { name: /Sale timeline/ }).innerText()).includes("Appraisal contingency removal"));
check("timeline marks the next step", (await page.locator('[aria-current="step"]').innerText()).includes("Appraisal"));
const todos = await page.getByRole("list", { name: "Your to-dos" }).innerText();
check("to-dos show only the seller's tasks", todos.includes("Confirm move-out date") && todos.includes("Sign seller disclosures") && !todos.includes("payoff"));
check("no listing linked yet", await page.getByText("Listing activity shows here once your agent links").isVisible());
const ics = await page.request.get(`${BASE}/api/my/seller/calendar?deal=${deal}`);
const icsText = await ics.text();
check("Add to calendar downloads the timeline", ics.status() === 200 && /attachment/.test(ics.headers()["content-disposition"] ?? "") && (icsText.match(/BEGIN:VEVENT/g) ?? []).length >= 4, String(ics.status()));
await axeAll(page, "/my/seller (no listing)");

// 2. Agent console: link the deal to its listing; create the open-house link.
const staff = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const sp = await staff.newPage();
await sp.goto(`${VA}/login`);
await sp.getByPlaceholder("you@vabrato.com").fill(STAFF_EMAIL);
const before = mails();
await sp.getByRole("button", { name: "Email me a sign-in link" }).click();
await sp.getByText(/Check your email/).waitFor();
await sp.goto(await linkFor(STAFF_EMAIL, before));
await sp.waitForURL(`${VA}/`, { timeout: 15000 });
await sp.goto(`${VA}/deals/${deal}`);
await sp.getByLabel("MLS listing key").fill("bad key!");
await sp.getByRole("button", { name: "Save", exact: true }).click();
await sp.getByText(/Use the MLS listing key/).waitFor();
check("console rejects a malformed listing key", true);
await sp.getByLabel("MLS listing key").fill(LISTING);
await sp.getByRole("button", { name: "Save", exact: true }).click();
await sp.getByText(/Saved\. The seller sees listing activity/).waitFor();
check("console links the deal to its listing", sql(`select listing_key from deals where id = '${deal}'`) === LISTING);

await sp.goto(`${VA}/open-houses`);
// Today's open house is the first upcoming one.
await sp.getByRole("button", { name: "Create sign-in link" }).first().click();
await sp.waitForFunction(() => document.querySelector('a[href*="/open-house-sign-in/"]'));
check("console creates the sign-in link", sql(`select count(*) from open_house_signin_links where open_house_key = '${OH}' and created_by = '${mark}'`) === "1");
check("the link points at the public site", (await sp.locator('a[href*="/open-house-sign-in/"]').first().getAttribute("href"))?.startsWith(`${BASE}/open-house-sign-in/`) ?? false);
sql(`insert into open_house_signin_links (open_house_key, created_by) values ('${OH}-L', '${mark}') on conflict do nothing`);
const [today, later] = [`${OH}`, `${OH}-L`].map((k) => sql(`select token from open_house_signin_links where open_house_key = '${k}'`));

// 3. A real visitor views the listing (normal browser UA): one view, once a day.
const visitor = await browser.newContext({ userAgent: CHROME_UA });
const vp = await visitor.newPage();
// Local runs share one IP: forget today's visitors for this listing first.
sql(`delete from listing_view_visitors where listing_key = '${LISTING}'`);
const views0 = Number(sql(`select coalesce(sum(views), 0) from listing_views_daily where listing_key = '${LISTING}'`));
const beacon = vp.waitForResponse((r) => r.url().endsWith("/api/listing-view"));
await vp.goto(`${BASE}/listing/${LISTING}/x`);
check("listing page sends the view beacon", (await beacon).status() === 204);
await vp.reload();
await vp.waitForTimeout(800);
const views1 = Number(sql(`select coalesce(sum(views), 0) from listing_views_daily where listing_key = '${LISTING}'`));
check("one visitor counts once a day", views1 === views0 + 1, `${views0} -> ${views1}`);
const bot = await browser.newContext(); // HeadlessChrome UA: a bot
const bp = await bot.newPage();
await bp.goto(`${BASE}/listing/${LISTING}/x`);
await bp.waitForTimeout(800);
check("headless browsers aren't counted", Number(sql(`select coalesce(sum(views), 0) from listing_views_daily where listing_key = '${LISTING}'`)) === views1);
const forged = await vp.request.post(`${BASE}/api/listing-view`, { data: { key: LISTING }, headers: { origin: "https://evil.example" } });
check("cross-site view posts are ignored", forged.status() === 204 && Number(sql(`select coalesce(sum(views), 0) from listing_views_daily where listing_key = '${LISTING}'`)) === views1);

// 4. The open-house tablet.
const tablet = await browser.newContext({ viewport: { width: 820, height: 1180 } });
const tp = await tablet.newPage();
await tp.goto(`${BASE}/open-house-sign-in/${today}`);
await axeAll(tp, "/open-house-sign-in (open)");
await shot(tp, "open-house-sign-in");
await tp.getByLabel("Name").fill("Casey Visitor");
await tp.getByLabel("Email (required)").fill(`casey.${stamp}@example.test`);
await tp.getByRole("radio", { name: "No" }).check();
await tp.getByRole("button", { name: "Sign in" }).click();
await tp.getByText("Thanks for visiting").waitFor();
const lead = sql(`select kind || '|' || listing_key || '|' || (payload->>'has_agent') || '|' || (ip_hash is null) from leads where email = 'casey.${stamp}@example.test'`);
check("sign-in is stored as an open-house lead, no IP hash", lead === `open_house_signin|${LISTING}|no|true`, lead);
await tp.getByRole("link", { name: "Next visitor" }).click();
await tp.getByLabel("Name").waitFor();
check("next visitor gets a fresh form", (await tp.getByLabel("Name").inputValue()) === "");
await tp.goto(`${BASE}/open-house-sign-in/${later}`);
check("a later event's link doesn't accept sign-ins yet", await tp.getByText("Sign-in for this open house is closed").isVisible());
await axeAll(tp, "/open-house-sign-in (closed)");
const bogus = await tp.goto(`${BASE}/open-house-sign-in/00000000-0000-4000-8000-000000000000`);
check("unknown link is a 404", bogus?.status() === 404);

// 5. Listing activity in the seller portal.
sql(`insert into leads (kind, email, listing_key) values ('tour', 'tour.${stamp}@example.test', '${LISTING}')`);
await page.goto(`${BASE}/my/seller`);
const kpis = await page.locator("main").innerText();
check("seller sees listing KPIs", /Listing views/i.test(kpis) && /Open-house visitors/i.test(kpis));
check("weekly activity chart has a table for screen readers", (await page.locator("figure table caption").innerText()).includes("Listing views by week"));
check("MLS attribution where the listing is linked", (await page.locator("[data-mls-attribution]").count()) === 1);
await axeAll(page, "/my/seller (linked)");
await shot(page, "my-seller");
await page.getByRole("link", { name: "Details" }).click();
await page.waitForURL(/\/my\/seller\/performance/);
const table = await page.getByRole("table", { name: /Listing activity by week/ }).innerText();
check("performance page has the week-by-week table", /open-house visitors/i.test(table));
check("performance page shows the MLS status", await page.getByText("MLS status").isVisible());
await axeAll(page, "/my/seller/performance");
await shot(page, "my-seller-performance");

// 6. Another seller can't see this deal.
const other = await browser.newContext();
const op = await other.newPage();
await joinAs(op, { email: `jamie.${stamp}@example.test`, name: "Jamie Example", role: "seller" });
await op.goto(`${BASE}/my/seller?deal=${deal}`);
check("another seller sees their own empty state, not this deal", await op.getByRole("heading", { name: "No sale on file yet" }).isVisible());
const leak = await op.request.get(`${BASE}/api/my/seller/calendar?deal=${deal}`);
check("another seller can't download this deal's calendar", leak.status() === 404);

await browser.close();
done();
