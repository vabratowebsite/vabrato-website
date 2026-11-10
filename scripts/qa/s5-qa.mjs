// S5 QA pass (PR 6): every member and account page, signed in as fictional
// buyer, seller, both and VOW members, plus the onboarding step and the
// staff notice. For each page: HTTP status, axe (WCAG 2.0/2.1/2.2 A and AA)
// at 1440 and 390 px, and full-page screenshots in docs/screenshots/s5/.
// A report.json lands next to the screenshots. Exits 1 if anything fails.
//
// Same local stack as the other S5 scripts (scripts/qa/README.md), with apps/va
// on :3000, REVALIDATE_SECRET matching the running web server (the VOW part
// flips vow_enabled), and the full fictional seed. Fictional people only.
//
//   QA_TOOLS=~/qa-tools MAIL_DIR=… PGURL=… REVALIDATE_SECRET=… node scripts/qa/s5-qa.mjs [--out docs/screenshots/s5]

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BASE, check, done, joinAs, linkFor, mails, need, sql } from "./lib.mjs";

const args = process.argv.slice(2);
const OUT = resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : "docs/screenshots/s5");
mkdirSync(OUT, { recursive: true });
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const { chromium } = need("playwright");
const { AxeBuilder } = need("@axe-core/playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const report = [];

const setVow = async (on) => {
  sql(`update feature_flags set enabled = ${on} where key = 'vow_enabled'`);
  const res = await fetch(`${BASE}/api/revalidate?tag=content`, { method: "POST", headers: { "x-revalidate-secret": process.env.REVALIDATE_SECRET ?? "" } });
  if (!res.ok) throw new Error(`revalidate failed: ${res.status} (set REVALIDATE_SECRET)`);
};

/** Status, axe at both widths, screenshots. `expect` is the HTTP status the page should return. */
async function audit(page, path, name, { expect = 200, shoot = true } = {}) {
  const res = await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  const status = res?.status() ?? 0;
  const entry = { name, path, status, violations: {} };
  check(`${name}: HTTP ${expect}`, status === expect, `got ${status} at ${page.url()}`);
  for (const [width, vp] of [[1440, "1440"], [390, "390"]]) {
    await page.setViewportSize({ width, height: 900 });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    entry.violations[vp] = r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5) }));
    check(`axe ${name} @${width}`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`).join("; "));
    if (shoot) await page.screenshot({ path: join(OUT, `${name}-${vp}.jpg`), fullPage: true, type: "jpeg", quality: 70 });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  report.push(entry);
}

async function member(role, first) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const email = `${first.toLowerCase()}.${stamp}@example.test`;
  await joinAs(page, { email, name: `${first} Example`, role });
  const id = sql(`select id from profiles where email = '${email}'`);
  return { ctx, page, email, id };
}

const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);
const active = sql(`select listing_key from mls_listings where standard_status = 'Active' and address_display and not is_own_listing order by listing_key limit 4`).split("\n");
const OWN = sql(`select listing_key from mls_listings where standard_status = 'Active' and is_own_listing order by listing_key limit 1`);
const SOLD = sql(`select listing_key from mls_listings where standard_status = 'Closed' and address_display order by listing_key limit 1`);
await setVow(false);

// --- Public account pages --------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await audit(page, "/join", "join-role");
  await audit(page, "/join?role=buyer", "join-details");
  await audit(page, "/sign-in", "sign-in");
  await audit(page, "/vow-terms", "vow-terms");
  await audit(page, "/my/buyer", "signed-out-redirect", { shoot: false });
  check("signed out: /my pages send people to sign in", page.url().startsWith(`${BASE}/sign-in?next=`), page.url());
  await ctx.close();
}

// --- Buyer with a full portal --------------------------------------------------------
const buyer = await member("buyer", "Jordan");
{
  const { page, id } = buyer;
  sql(`update profiles set agent_id = '${mark}', alerts_email_opt_in = true, alerts_opt_in_at = now() where id = '${id}'`);
  for (const k of active) sql(`insert into saved_homes (profile_id, listing_key) values ('${id}', '${k}') on conflict do nothing`);
  sql(`insert into saved_searches (profile_id, name, criteria, frequency) values ('${id}', 'San Carlos 3+ beds', '{"city":"san-carlos","beds":3}', 'instant'), ('${id}', 'Belmont under $2M', '{"city":"belmont","maxPrice":2000000}', 'daily')`);
  const street = sql(`select split_part(data ->> 'UnparsedAddress', ',', 1) from mls_listings where listing_key = '${active[0]}'`);
  const tracked = sql(`insert into tracked_properties (buyer_id, address, listing_key, status) values ('${id}', '${street.replace(/'/g, "''")}', '${active[0]}', 'toured') returning id`).split("\n")[0];
  sql(`insert into tracked_properties (buyer_id, address, status) values ('${id}', '12 Fictional Ave, Belmont', 'watching')`);
  sql(`insert into property_events (tracked_property_id, kind, payload) values ('${tracked}', 'status', '{"from":"watching","to":"toured"}')`);
  sql(`insert into leads (kind, email, listing_key, profile_id, payload) values ('tour', 'jordan.${stamp}@example.test', '${active[1]}', '${id}', '{"tourDate":"2026-11-15","tourMode":"in_person"}')`);
  sql(`insert into messages (member_id, sender_id, body) values ('${id}', '${id}', 'Hi Mark, could we see two homes on Saturday?')`);
  sql(`insert into messages (member_id, sender_id, body) values ('${id}', '${mark}', 'Yes. 11 AM and 1 PM work. I''ll confirm by text.')`);
  sql(`insert into member_documents (profile_id, name, storage_path, size_bytes, content_type, uploaded_by) values ('${id}', 'Pre-approval letter.pdf', 'member/${id}/qa-${stamp}.pdf', 120000, 'application/pdf', '${id}')`);
  // A price drop on a saved home becomes an alert (as the sync job would run it).
  sql(`select public.run_member_alerts()`);
  const p = Number(sql(`select list_price from mls_listings where listing_key = '${active[0]}'`));
  sql(`update mls_listings set list_price = ${p - 50000} where listing_key = '${active[0]}'`);
  sql(`insert into mls_price_events (listing_key, list_price, standard_status, observed_at) values ('${active[0]}', ${p - 50000}, 'Active', now())`);
  sql(`select public.run_member_alerts()`);

  await audit(page, "/my/buyer", "buyer-home");
  await audit(page, "/my/saved", "buyer-saved");
  await audit(page, "/my/searches", "buyer-searches");
  await audit(page, "/my/compare", "buyer-compare");
  await audit(page, "/my/tours", "buyer-tours");
  await audit(page, `/my/pursuing/${tracked}`, "buyer-pursuing");
  await audit(page, "/my/documents", "buyer-documents");
  await audit(page, "/my/messages", "buyer-messages");
  await audit(page, "/my/account", "buyer-account");
  await audit(page, "/my/alerts", "buyer-alerts");
  await audit(page, "/my/sold", "buyer-sold-flag-off", { expect: 404, shoot: false });
  await audit(page, "/my/seller", "buyer-to-seller-redirect", { shoot: false });
  check("a buyer opening /my/seller lands on the buyer portal", page.url().endsWith("/my/buyer"), page.url());
  const token = sql(`select alerts_unsubscribe_token from profiles where id = '${id}'`);
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await audit(await anon.newPage(), `/alerts/unsubscribe?t=${token}`, "alerts-unsubscribe");
  await anon.close();
}

// --- Seller with a linked listing ------------------------------------------------------
{
  const { page, id } = await member("seller", "Riley");
  const deal = sql(`insert into deals (address, ratification_date, days_to_close, sale_price, agent_id, created_by, listing_key)
    values ('88 Fictional Dr, San Carlos', current_date - 6, 21, 2850000, '${mark}', '${mark}', '${OWN}') returning id`).split("\n")[0];
  sql(`insert into deal_members (deal_id, profile_id, member_role) values ('${deal}', '${id}', 'seller')`);
  sql(`insert into deal_contingencies (deal_id, kind, offset_days, due_date, removed_at) values
    ('${deal}', 'property_condition', 4, current_date - 2, now()), ('${deal}', 'appraisal', 10, current_date + 4, null), ('${deal}', 'financing', 14, current_date + 8, null)`);
  sql(`insert into tasks (deal_id, title, owner, phase, offset_days, due_date, done) values
    ('${deal}', 'Sign seller disclosures', 'Seller', 'after_ratification', 1, current_date - 5, true),
    ('${deal}', 'Confirm move-out date with movers', 'Seller', 'closing_week', 14, current_date + 8, false),
    ('${deal}', 'Seller signs closing documents (window opens)', 'Seller', 'closing_week', 17, current_date + 11, false)`);
  sql(`insert into listing_views_daily (listing_key, day, views)
    select '${OWN}', d::date, 20 + (extract(doy from d)::int % 7) * 9 from generate_series(current_date - 34, current_date, interval '1 day') d
    on conflict (listing_key, day) do nothing`);
  await audit(page, "/my/seller", "seller-home");
  await audit(page, "/my/seller/performance", "seller-performance");
  await audit(page, "/my/documents", "seller-documents");
  await audit(page, "/my/messages", "seller-messages");
  await audit(page, "/my/account", "seller-account");
  await audit(page, "/my/buyer", "seller-to-buyer-redirect", { shoot: false });
  check("a seller opening /my/buyer lands on the seller portal", page.url().endsWith("/my/seller"), page.url());
}

// --- Both, with no sale yet -------------------------------------------------------------
{
  const { page, id } = await member("both", "Sam");
  sql(`insert into saved_homes (profile_id, listing_key) values ('${id}', '${active[2]}')`);
  await audit(page, "/my/buyer", "both-buyer-home");
  await audit(page, "/my/seller", "both-seller-empty");
  check("both: nav shows Buying and Selling", /buying[\s\S]*selling/i.test(await page.locator("aside").innerText()));
}

// --- Onboarding step (join choices lost) and the staff notice ---------------------------------
{
  const { page, id } = await member("buyer", "Avery");
  sql(`update profiles set onboarded_at = null where id = '${id}'`);
  await audit(page, "/my/welcome", "welcome-onboarding");
}
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel("Email address").fill(STAFF_EMAIL);
  const before = mails();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText("Check your email.").waitFor();
  await page.goto(await linkFor(STAFF_EMAIL, before));
  await page.waitForURL(/\/my$/, { timeout: 15000 });
  await audit(page, "/my", "staff-notice");
  await ctx.close();
}

// --- VOW pages (vow_enabled on; off again at the end) ---------------------------------------------
try {
  await setVow(true);
  const { page } = await member("buyer", "Casey");
  await audit(page, "/my/sold", "vow-terms-prompt");
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: "Accept and see sold data" }).click();
  await page.getByText(/homes? sold$/).waitFor();
  await audit(page, "/my/sold?within=365", "vow-sold");
  await audit(page, `/my/listing/${SOLD}`, "vow-sold-detail");
  await audit(page, "/my/account", "vow-account");
} finally {
  await setVow(false);
}

await browser.close();
writeFileSync(join(OUT, "report.json"), JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), pages: report }, null, 2) + "\n");
console.log(`report: ${join(OUT, "report.json")} (${report.length} pages)`);
done();
