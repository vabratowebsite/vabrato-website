// S6b PR 6 end-to-end check: market updates and CMA write-ups, on the local
// stack with the fake Claude server (fake-claude.mjs) and fictional sold
// listings QA-S1…QA-S6 in Belmont (as s6-reports.mjs): no key, no cost.
//
// - Off by default: no market update on Market stats, no summary on a CMA.
// - Market update: written from the console's own figures; a figure the
//   assistant made up blocks approval; approved as an internal preview while
//   public_stats is off (no copy, no website); with public_stats on, sent to
//   Mark's website review and waiting in his queue.
// - CMA write-up: approved and shown on the CMA with "not an appraisal".
// - A listing presentation with the CMA attached prints our range.
// - axe at 1440 and 390 px; screenshots. Everything added is removed.
//
// Start: node scripts/qa/fake-claude.mjs <log>; apps/va with
// ANTHROPIC_BASE_URL=http://127.0.0.1:4020 and any ANTHROPIC_API_KEY. Needs
// SERVICE_KEY, CLAUDE_LOG and migration 0031.

import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { axeAll, check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const LOG = process.env.CLAUDE_LOG;
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s6b-market-cma");
mkdirSync(OUT, { recursive: true });
const OFFICE = process.env.MLS_OFFICE_ID ?? "VABRA";
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const logLines = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean);
const before = logLines().length;
const asked = () => logLines().slice(before).map((l) => JSON.parse(l));
const last = () => asked().at(-1) ?? {};

async function account(first, role) {
  const email = `${first.toLowerCase()}.${stamp}@example.test`;
  const res = await fetch(`${process.env.SUPABASE_URL ?? "http://127.0.0.1:54331"}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: process.env.SERVICE_KEY, Authorization: `Bearer ${process.env.SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`create ${first}: ${res.status} ${await res.text()}`);
  const id = (await res.json()).id;
  sql(`update profiles set role = '${role}', full_name = '${first} Example' where id = '${id}'`);
  return { id, email };
}

async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: VA });
  const page = await ctx.newPage();
  await page.goto(`${VA}/login`);
  await page.getByPlaceholder("you@vabrato.com").fill(email);
  const sent = mails();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText(/Check your email/).waitFor();
  await page.goto(await linkFor(email, sent));
  await page.waitForURL(`${VA}/`, { timeout: 15000 });
  return page;
}

async function shots(page, name) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: join(OUT, `${name}-${width}.jpg`), fullPage: true, type: "jpeg", quality: 70 });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function press(page, button, ready, refused) {
  await page.getByRole("button", { name: button, exact: true }).click();
  const target = refused ? page.getByRole("alert").filter({ hasText: refused }) : page.getByRole("status").filter({ hasText: ready });
  try {
    await target.first().waitFor({ timeout: 30000 });
  } catch {
    throw new Error(`"${button}": no ${refused ?? ready}; alerts: ${JSON.stringify(await page.getByRole("alert").allTextContents())}`);
  }
}
const row = (where) => sql(`select coalesce(string_agg(status || ':' || coalesce(sent_via, '-'), ',' order by created_at), '') from ai_drafts where ${where}`);

// --- Setup ---------------------------------------------------------------------------------------
const leadAdminBefore = sql(`select coalesce(lead_admin_id::text, '') from app_settings`);
const AI = "('ai_enabled', 'ai_staff_market_update', 'ai_staff_cma_writeup', 'ai_staff_presentations')";
const SOLD = "('market_stats_enabled', 'cma_enabled')";
sql(`update feature_flags set enabled = false where key like 'ai\\_%' or key in ('market_stats_enabled', 'cma_enabled', 'public_stats')`);
sql(`delete from ai_runs`);
const ada = await account("Ada", "admin");
const avery = await account("Avery", "agent");
sql(`update app_settings set ai_zdr_confirmed_at = now(), ai_zdr_confirmed_by = '${ada.id}', ai_zdr_note = 'QA fixture (fictional)', lead_admin_id = '${ada.id}', lead_admin_away = false`);
sql(`insert into mls_members (member_key, full_name, email, member_status, office_mls_id, source) values ('QA-AVERY-${stamp}', 'Avery Example', '${avery.email}', 'Active', '${OFFICE}', 'mock')`);
sql(`insert into mls_agent_access (profile_id, member_key, active, verified_at) values ('${avery.id}', 'QA-AVERY-${stamp}', true, now())`);
sql(`delete from mls_listings where listing_key like 'QA-S%'`);
sql(`insert into mls_listings (listing_key, standard_status, list_price, city, county, living_area, bedrooms_total, bathrooms_total, address_display, is_own_listing, list_office_name, modification_ts, data)
     select 'QA-S' || i, 'Closed', 1000000 + i * 100000, 'Belmont', 'San Mateo', 1000 + i * 50, 3, 2, i <> 6, false, 'Example Realty', now(),
            jsonb_build_object('StreetNumber', (100 + i)::text, 'StreetName', 'Sample', 'StreetSuffix', 'Ave', 'OnMarketDate', (current_date - 40 - i)::text)
     from generate_series(1, 6) i`);
sql(`insert into mls_listing_vow (listing_key, data)
     select listing_key, jsonb_build_object('ClosePrice', round(list_price * 1.04), 'CloseDate', (current_date - 10 * substr(listing_key, 5)::int)::text)
     from mls_listings where listing_key like 'QA-S%'`);
const cmaTitle = `QA CMA 12 Example Ave ${stamp}`;
const cma = sql(`insert into cmas (created_by, title, subject, comp_keys) values ('${avery.id}', '${cmaTitle}', '{"city_slug":"belmont","sub_type":"Single Family Residence","beds":3,"baths":2,"sqft":1200}', '{QA-S1,QA-S2,QA-S3,QA-S4}') returning id`).split("\n")[0];
sql(`update feature_flags set enabled = true where key in ${SOLD}`);
const ai = (on) => sql(`update feature_flags set enabled = ${on} where key in ${AI}`);

try {
  // 1. Off by default (sold data on, assistant off).
  const av = await signIn(avery.email);
  await av.goto(`${VA}/stats?city=belmont&months=12`);
  check("off: no market update on Market stats", (await av.getByRole("heading", { name: "Market update" }).count()) === 0);
  await av.goto(`${VA}/cmas/${cma}`);
  check("off: no summary on the CMA", (await av.getByRole("button", { name: "Write a summary" }).count()) === 0);

  ai(true);

  // 2. Market update: a made-up figure blocks approval; internal preview while public_stats is off.
  await av.goto(`${VA}/stats?city=belmont&months=12`);
  await av.getByLabel("Anything it should mention? (optional)").fill("Lead with what sold. QA-MODE: invented");
  await press(av, "Write a market update", "Update ready.");
  let req = last();
  check("market update: written from the console's own figures, as data", req.feature === "market_update" && req.dataBlocks === 1 && !req.requestHasEmail && !req.requestHasPhone && req.effort === "medium", JSON.stringify(req));
  const body = av.getByLabel("Article");
  check("market update: the figures are ours", (await body.inputValue()).includes("homes sold in Belmont over the last 12 months"));
  await press(av, "Approve", null, "These numbers aren't in the statistics: 15%");
  check("market update: a figure that wasn't sent blocks approval", row(`kind = 'market_update' and owner_id = '${avery.id}'`) === "draft:-");
  await body.fill((await body.inputValue()).replace(" Prices will rise 15% next year.", ""));
  await press(av, "Approve", "Approved.");
  check(
    "market update: approved as an internal preview; no copy, no website",
    (await av.getByText(/Internal preview: market statistics can't leave the console/).isVisible()) &&
      (await av.getByRole("button", { name: /^Copy/ }).count()) === 0 &&
      (await av.getByRole("button", { name: "Send to website review" }).count()) === 0,
  );
  await axeAll(av, "/stats (market update)");
  await shots(av, "market-update-internal");

  // 3. With public_stats on: copy and send to Mark's website review.
  sql(`update feature_flags set enabled = true where key = 'public_stats'`);
  await av.reload();
  check("market update: with public_stats on, it can be copied", (await av.getByRole("button", { name: "Copy Title" }).isVisible()));
  await press(av, "Send to website review", "Sent to website review.");
  const rev = sql(`select status || '|' || (body->>'kind') || '|' || (body->>'title') from content_revisions where table_name = 'posts' and created_by = '${avery.id}'`);
  check("market update: a post is waiting in website review", rev === "submitted|market_update|Belmont market, last 12 months" && row(`kind = 'market_update' and owner_id = '${avery.id}'`) === "approved:website", rev);
  const ad = await signIn(ada.email);
  await ad.goto(`${VA}/content`);
  check("Mark's review queue shows it", await ad.getByText("Belmont market, last 12 months").first().isVisible());
  await ad.context().close();

  // 4. CMA write-up.
  await av.goto(`${VA}/cmas/${cma}`);
  await press(av, "Write a summary", "Summary ready.");
  req = last();
  check("CMA: written from the comparables and our range", req.feature === "cma_writeup" && req.dataBlocks === 1 && !req.requestHasEmail, JSON.stringify(req));
  await press(av, "Approve", "Approved.");
  await av.reload();
  const summary = av.getByRole("heading", { name: "Summary" }).locator("..").locator("..");
  check("CMA: the approved summary shows with the CMA, saying it's not an appraisal", (await av.getByText(/This is a comparison of recent sales, not an appraisal\./).first().isVisible()) && (await av.getByText(/approved by Avery Example/).isVisible()));
  void summary;
  await axeAll(av, "/cmas/[id] (summary)");
  await shots(av, "cma-summary");

  // 5. A listing presentation with the CMA attached.
  await av.goto(`${VA}/presentations`);
  await av.getByLabel("Listing presentation (for a seller)").check();
  await av.getByLabel("Attach a CMA (optional)").selectOption({ label: cmaTitle });
  await av.getByRole("button", { name: "Write presentation" }).click();
  await av.waitForURL(/\/presentations\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const pres = av.url().split("/").pop();
  check("presentation: the CMA is attached", sql(`select content->>'cma_id' from ai_drafts where id = '${pres}'`) === cma);
  await press(av, "Approve", "Approved.");
  check("presentation: still attached after approval", sql(`select content->>'cma_id' from ai_drafts where id = '${pres}'`) === cma);
  await av.goto(`${VA}/presentations/${pres}/print`);
  const comps = av.getByRole("region", { name: "Recent comparable sales" });
  check("presentation print: our range, the comparables and the summary", (await comps.getByText(/midpoint/).isVisible()) && (await comps.getByRole("row").count()) >= 4 && (await comps.getByText(/not an appraisal/).first().isVisible()));
  await axeAll(av, "/presentations/[id]/print (with CMA)");
  await shots(av, "presentation-with-cma");

  // 6. Sold data off again: the features go with it.
  sql(`update feature_flags set enabled = false where key in ${SOLD}`);
  await av.goto(`${VA}/stats?city=belmont&months=12`);
  check("sold data off: no market stats, so no market update", (await av.getByRole("heading", { name: "Off for now" }).isVisible()) && (await av.getByRole("heading", { name: "Market update" }).count()) === 0);
  await av.goto(`${VA}/presentations/${pres}/print`);
  check("sold data off: the presentation prints without the CMA", (await av.getByRole("region", { name: "Recent comparable sales" }).count()) === 0);
  check("the usage log has metadata only", sql(`select string_agg(feature || ':' || status, ',' order by created_at) from ai_runs`) === "staff_market_update:ok,staff_cma_writeup:ok,staff_presentations:ok");
  check("the console called nothing but the Messages endpoint", asked().every((r) => !("unexpected" in r)));
} finally {
  ai(false);
  sql(`update feature_flags set enabled = false where key in ('market_stats_enabled', 'cma_enabled', 'public_stats')`);
  sql(`update app_settings set ai_zdr_confirmed_at = null, ai_zdr_confirmed_by = null, ai_zdr_note = null, lead_admin_id = ${leadAdminBefore ? `'${leadAdminBefore}'` : "null"}`);
  sql(`delete from ai_drafts where owner_id in ('${avery.id}', '${ada.id}'); delete from content_revisions where created_by = '${avery.id}'; delete from cmas where created_by = '${avery.id}'`);
  sql(`delete from mls_listing_vow where listing_key like 'QA-S%'; delete from mls_listings where listing_key like 'QA-S%'`);
  sql(`delete from mls_agent_access where profile_id = '${avery.id}'; delete from mls_members where member_key = 'QA-AVERY-${stamp}'; delete from ai_runs`);
  sql(`delete from staff_notifications where recipient_id in ('${ada.id}', '${avery.id}')`);
  await browser.close();
}
done();
