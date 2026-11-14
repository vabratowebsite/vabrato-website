// S5b PR 5: Ask Vabrato's schedules (moving plan, pre-listing checklist, tour
// day) end to end on the local stack with the fake Claude and the fictional
// MLS fixtures. Everything it adds is removed and every switch and setting it
// touches is put back.
//
// - Off by default; the console switches, with tour day locked until the
//   MLSListings approval is on.
// - A seller's moving plan counts from their sale's dates of record (shown as
//   fixed); only the move day and the notes are sent (no address, contacts or
//   long numbers). Steps naming a contract deadline or a cost are dropped;
//   wiring and Fair Housing answers aren't shown. Steps go to My to-dos with
//   their due dates; the agent sees the dates; a calendar file downloads.
// - A buyer's moving plan from a typed date; a pre-listing checklist from a
//   typed list date (a past date is refused).
// - A tour day: our code's order (the open house first), the opted-out home
//   kept in the order but never sent, and a price opinion not shown.
// - axe at 1440 and 390, no sideways scroll at 390 and 320, keyboard, and
//   page loads send nothing to the model.
//
// Needs: apps/web on :3003 and apps/va on :3000 with ANTHROPIC_BASE_URL at the
// fake; CLAUDE_LOG, MAIL_DIR, PGURL, SERVICE_KEY; migrations up to 0040; the
// MLS fixtures seeded.

import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASE, axeAll, check, done, joinAs, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const LOG = process.env.CLAUDE_LOG;
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s5b-schedules");
mkdirSync(OUT, { recursive: true });
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const log = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const memberCalls = () => log().filter((e) => /^member_/.test(e.feature ?? "")).length;
const last = (feature) => log().filter((e) => e.feature === feature).at(-1);
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}-1440.jpg`, fullPage: true, type: "jpeg", quality: 60 });
const sideScroll = async (page, width) => {
  await page.setViewportSize({ width, height: 900 });
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.setViewportSize({ width: 1440, height: 900 });
  return w;
};
const day = (n) => sql(`select (current_date + ${n})::text`);

for (const key of ["FX-001", "FX-002", "FX-013"]) {
  if (sql(`select count(*) from mls_listings where listing_key = '${key}'`) !== "1") throw new Error(`fixture ${key} isn't seeded`);
}

// --- What this run changes, to put back -------------------------------------------------------
const FLAGS = ["ai_enabled", "ai_mls_approved", "ai_member_moving", "ai_member_prelisting", "ai_member_tour"];
const flagsBefore = Object.fromEntries(sql(`select key || '=' || enabled from feature_flags where key in (${FLAGS.map((k) => `'${k}'`).join(",")})`).split("\n").filter(Boolean).map((l) => l.split("=")));
const settingsBefore = sql(`select coalesce(ai_zdr_confirmed_at::text, '') || '|' || ai_daily_tokens_member from app_settings`);
const remarksBefore = sql(`select data->>'PublicRemarks' from mls_listings where listing_key = 'FX-002'`);
const setRemarks = (text) => sql(`update mls_listings set data = jsonb_set(data, '{PublicRemarks}', to_jsonb('${text.replace(/'/g, "''")}'::text)) where listing_key = 'FX-002'`);
sql(`update feature_flags set enabled = false where key in ('ai_member_tour', 'ai_member_moving', 'ai_member_prelisting'); update feature_flags set enabled = false where key in ('ai_enabled', 'ai_mls_approved')`);
sql(`update app_settings set ai_zdr_confirmed_at = coalesce(ai_zdr_confirmed_at, now()), ai_daily_tokens_member = 100000000`);
const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);
const TOUR_DATE = day(7);
const OH_KEY = `QA-OH-${stamp}`;
// A QA-only open house for FX-002 on the tour date, 10:00-12:00 Pacific.
sql(`insert into mls_open_houses (open_house_key, listing_key, open_house_date, start_time, end_time, open_house_type) values ('${OH_KEY}', 'FX-002', '${TOUR_DATE}', ('${TOUR_DATE} 10:00'::timestamp at time zone 'America/Los_Angeles'), ('${TOUR_DATE} 12:00'::timestamp at time zone 'America/Los_Angeles'), 'Public')`);

const newPage = async () => (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
const cards = (page) => page.locator("ol[aria-label^='Your questions'] > li");
async function run(page, mode, fill, button) {
  if (await page.getByRole("radio", { name: mode }).count()) await page.getByText(mode, { exact: true }).click();
  await fill();
  const n = await cards(page).count();
  await page.getByRole("button", { name: button, exact: true }).click();
  await cards(page).nth(n).waitFor({ timeout: 15000 });
  return cards(page).nth(n);
}

// --- People ------------------------------------------------------------------------------------
const ADDRESS = `${stamp % 1000} Fixture Lane, Belmont`;
const seller = await newPage();
const sellerEmail = `sam.${stamp}@example.test`;
await joinAs(seller, { email: sellerEmail, name: "Sam Example", role: "seller" });
const sam = sql(`select id from profiles where email = '${sellerEmail}'`);
sql(`update profiles set agent_id = '${mark}' where id = '${sam}'`);
const deal = sql(`insert into deals (address, ratification_date, days_to_close, agent_id, created_by, sale_price, escrow_number) values ('${ADDRESS}', current_date, 30, '${mark}', '${mark}', 2150000, 'ESC-${stamp}') returning id`).split("\n")[0];
sql(`insert into deal_members (deal_id, profile_id, member_role) values ('${deal}', '${sam}', 'seller')`);
sql(`insert into deal_contingencies (deal_id, kind, offset_days, due_date) values ('${deal}', 'insurance', 7, current_date + 7)`);
const buyer = await newPage();
const buyerEmail = `jordan.${stamp}@example.test`;
await joinAs(buyer, { email: buyerEmail, name: "Jordan Example", role: "buyer" });
const jordan = sql(`select id from profiles where email = '${buyerEmail}'`);
sql(`update profiles set agent_id = '${mark}' where id = '${jordan}'`);
sql(`insert into saved_homes (profile_id, listing_key) values ('${jordan}', 'FX-001'), ('${jordan}', 'FX-002'), ('${jordan}', 'FX-013')`);
const label = (key) => sql(`select split_part(data->>'UnparsedAddress', ',', 1) from mls_listings where listing_key = '${key}'`);

// --- 1. Off by default -------------------------------------------------------------------------
const callsAtStart = memberCalls();
await seller.goto(`${BASE}/my/assistant`);
check("off: no schedule modes", (await seller.getByText("Build my moving schedule", { exact: true }).count()) === 0);

// --- 2. The console switches -----------------------------------------------------------------------
const staff = await newPage();
await staff.goto(`${VA}/login`);
await staff.getByPlaceholder("you@vabrato.com").fill(STAFF_EMAIL);
const m = mails();
await staff.getByRole("button", { name: "Email me a sign-in link" }).click();
await staff.getByText(/Check your email/).waitFor();
await staff.goto(await linkFor(STAFF_EMAIL, m));
await staff.waitForURL(`${VA}/`, { timeout: 15000 });
await staff.goto(`${VA}/assistant`);
check("console: tour day locked until the MLSListings approval", (await staff.getByRole("button", { name: "Turn on: Plan a tour day (members)" }).count()) === 0);
for (const name of ["Moving plan", "Pre-listing checklist"]) {
  await staff.getByRole("button", { name: `Turn on: ${name} (members)` }).click();
  await staff.getByRole("button", { name: `Turn off: ${name} (members)` }).waitFor({ timeout: 15000 });
}
await staff.getByRole("button", { name: "Turn on: MLSListings approved AI on listing data" }).click();
await staff.getByRole("button", { name: "Turn off: MLSListings approved AI on listing data" }).waitFor({ timeout: 15000 });
await staff.getByRole("button", { name: "Turn on: Plan a tour day (members)" }).click();
await staff.getByRole("button", { name: "Turn off: Plan a tour day (members)" }).waitFor({ timeout: 15000 });
sql(`update feature_flags set enabled = true where key = 'ai_enabled'`);
check("console: all three switches on", sql(`select count(*) from feature_flags where key in ('ai_member_moving', 'ai_member_prelisting', 'ai_member_tour') and enabled`) === "3");

// --- 3. A seller's moving plan from their sale ---------------------------------------------------
await seller.goto(`${BASE}/my/assistant?mode=moving`);
check("seller: the plan can count from their sale", await seller.getByRole("radio", { name: /My sale's dates/ }).isChecked());
let card = await run(seller, "Build my moving schedule", () => seller.getByLabel("Anything to plan around? (optional)").fill("QA-MODE: ok We have a piano. Call me at 650-555-0101."), "Build the plan");
check("seller: a moving plan with its dated steps", (await card.getByRole("heading", { name: "Your moving plan" }).isVisible()) && (await card.getByRole("checkbox").count()) === 5);
check("seller: dates of record shown as fixed (close of escrow, the contingency)", (await card.getByText("Dates from your sale (your agent's schedule)").isVisible()) && (await card.getByText(/^Close of escrow: /).isVisible()) && (await card.getByText(/Ask Vabrato never changes these/).isVisible()) && (await card.getByText(/^Move day \(from your sale\):/).isVisible()));
let e = last("member_moving");
check("seller: only the move day and notes sent (no address, phone or long numbers)", e && !e.requestHasPhone && !e.requestHasEmail && !e.requestHasLongNumber && !JSON.stringify(e).includes("Fixture Lane") && e.format === "json_schema", JSON.stringify(e));
await axeAll(seller, "/my/assistant (moving plan)");
for (const width of [390, 320]) {
  const w = await sideScroll(seller, width);
  check(`/my/assistant (plan): no sideways scroll @${width}`, w <= width, `${w}px`);
}
await shot(seller, "moving-plan");
const download = seller.waitForEvent("download");
await card.getByRole("button", { name: "Download calendar (.ics)" }).click();
const file = await (await download).path();
const ics = readFileSync(file, "utf8");
check("calendar file: one all-day event per step", ics.startsWith("BEGIN:VCALENDAR") && (ics.match(/BEGIN:VEVENT/g) ?? []).length === 5 && /DTSTART;VALUE=DATE:\d{8}/.test(ics));
const boxes = card.getByRole("checkbox");
await boxes.nth(0).check();
await boxes.nth(1).check();
await card.getByRole("button", { name: "Add to my to-dos" }).click();
await card.getByText(/^Added 2 steps with their dates/).waitFor({ timeout: 10000 });
check("add: two dated to-dos waiting for the agent", sql(`select count(*) from member_todos where profile_id = '${sam}' and status = 'pending' and due_date is not null and source_name = 'Moving plan'`) === "2");
await staff.goto(`${VA}/members/${sam}`);
check("console: the agent sees the due dates", (await staff.getByText(/^Due [A-Z][a-z]{2} \d{1,2}, \d{4}/).count()) >= 2);
await seller.goto(`${BASE}/my/todos`);
check("my to-dos: due dates shown", (await seller.getByText(/^Due [A-Z][a-z]{2} \d{1,2}, \d{4}/).count()) >= 2);

await seller.goto(`${BASE}/my/assistant?mode=moving`);
card = await run(seller, "Build my moving schedule", () => seller.getByLabel("Anything to plan around? (optional)").fill("QA-MODE: deadline"), "Build the plan");
check("a step naming a contract deadline is dropped", (await card.getByText(/Some suggestions were left out/).isVisible()) && !(await card.textContent()).includes("Remove your contingencies"));
card = await run(seller, "Build my moving schedule", () => seller.getByLabel("Anything to plan around? (optional)").fill("QA-MODE: money"), "Build the plan");
check("a step with a cost is dropped", (await card.getByText(/Some suggestions were left out/).isVisible()) && !(await card.textContent()).includes("$2,000"));
card = await run(seller, "Build my moving schedule", () => seller.getByLabel("Anything to plan around? (optional)").fill("QA-MODE: wiring"), "Build the plan");
check("wiring details in a plan: not shown", (await card.getByText(/never gives those/).isVisible()) && !(await seller.content()).includes("999999999"));
card = await run(seller, "Build my moving schedule", () => seller.getByLabel("Anything to plan around? (optional)").fill("QA-MODE: steering"), "Build the plan");
check("Fair Housing wording in a plan: not shown", (await card.getByText(/Fair Housing/).isVisible()) && !(await seller.content()).includes("young kids"));

// --- 4. Pre-listing checklist ------------------------------------------------------------------------
const listDate = day(42);
await seller.goto(`${BASE}/my/assistant?mode=prelisting`);
card = await run(
  seller,
  "Pre-listing checklist",
  async () => {
    await seller.getByLabel("Target list date").fill(listDate);
    await seller.getByLabel("Notes on the home (optional)").fill("QA-MODE: ok Old carpet in the den.");
  },
  "Build the checklist",
);
check("pre-listing: a checklist counted back from the list date", (await card.getByRole("heading", { name: "Your pre-listing checklist" }).isVisible()) && (await card.getByRole("checkbox").count()) === 5);
e = last("member_prelisting");
check("pre-listing: the list date and notes sent; no address or numbers", e && !e.requestHasLongNumber && !JSON.stringify(e).includes("Fixture Lane"), JSON.stringify(e));
await shot(seller, "prelisting");
let before = memberCalls();
card = await run(
  seller,
  "Pre-listing checklist",
  async () => {
    await seller.getByLabel("Target list date").fill(day(-3));
  },
  "Build the checklist",
);
check("pre-listing: a past list date is refused unsent", (await card.getByText("Pick a date from today on.").isVisible()) && memberCalls() === before);

// --- 5. A buyer's moving plan and tour day --------------------------------------------------------------
await buyer.goto(`${BASE}/my/assistant?mode=moving`);
check("buyer: no 'my sale' option, and no pre-listing mode", (await buyer.getByRole("radio", { name: /My sale's dates/ }).count()) === 0 && (await buyer.getByText("Pre-listing checklist", { exact: true }).count()) === 0);
card = await run(
  buyer,
  "Build my moving schedule",
  async () => {
    await buyer.getByLabel("Move date").fill(day(45));
  },
  "Build the plan",
);
check("buyer: a moving plan from the typed date", (await card.getByText(/^Your move day:/).isVisible()) && (await card.getByText("Dates from your sale (your agent's schedule)").count()) === 0);

await buyer.goto(`${BASE}/my/assistant?mode=tour`);
card = await run(
  buyer,
  "Plan a tour day",
  async () => {
    for (const k of ["FX-001", "FX-002", "FX-013"]) await buyer.getByRole("checkbox", { name: label(k) }).check();
    await buyer.getByLabel("Tour date").fill(TOUR_DATE);
  },
  "Plan the day",
);
const stopNames = await card.locator("ol[aria-label='Stops, in order'] > li > p:first-child").allTextContents();
check("tour: the open house first, in our code's order", stopNames[0]?.includes(label("FX-002")) && stopNames.length === 3, JSON.stringify(stopNames));
check("tour: the open-house time in Pacific time", await card.getByText(/^Open house 10:00 AM–12:00 PM/).isVisible());
check("tour: the opted-out home kept in the order, without notes", await card.getByText(/asked that this listing not be used by AI tools/).isVisible());
e = last("member_tour");
check("tour: only FX-001 and FX-002 sent; no FULL fields or internal notes", JSON.stringify(e?.requestListingKeys) === '["FX-001","FX-002"]' && !e.requestHasPrivateListingFields && !e.requestHasInternalNote, JSON.stringify(e));
await axeAll(buyer, "/my/assistant (tour day)");
for (const width of [390, 320]) {
  const w = await sideScroll(buyer, width);
  check(`/my/assistant (tour): no sideways scroll @${width}`, w <= width, `${w}px`);
}
await shot(buyer, "tour-day");
setRemarks("Fictional remarks. QA-MODE: value");
card = await run(
  buyer,
  "Plan a tour day",
  async () => {
    for (const k of ["FX-001", "FX-002"]) await buyer.getByRole("checkbox", { name: label(k) }).check();
    await buyer.getByLabel("Tour date").fill(TOUR_DATE);
  },
  "Plan the day",
);
check("tour: a price opinion isn't shown", (await card.getByText(/doesn't give price or value opinions/).isVisible()) && !(await buyer.content()).includes("underpriced"));
setRemarks(remarksBefore);

// Keyboard: the move date, the notes, then the button.
await buyer.goto(`${BASE}/my/assistant?mode=moving`);
await buyer.getByLabel("Move date").fill(day(30));
await buyer.getByLabel("Move date").focus();
const order = [];
for (let i = 0; i < 2; i++) {
  await buyer.keyboard.press("Tab");
  order.push(await buyer.evaluate(() => document.activeElement?.labels?.[0]?.textContent?.trim() ?? document.activeElement?.textContent?.trim()));
}
check("keyboard: move date → notes → Build the plan", JSON.stringify(order) === JSON.stringify(["Anything to plan around? (optional)", "Build the plan"]), JSON.stringify(order));

// --- 6. Page loads send nothing ------------------------------------------------------------------
before = memberCalls();
for (const p of ["/my/assistant", "/my/assistant?mode=tour", "/my/todos"]) await buyer.goto(`${BASE}${p}`);
check("page loads send nothing to the model", memberCalls() === before);
check("model calls: only the asks that should send", memberCalls() - callsAtStart === 9, String(memberCalls() - callsAtStart));

// --- Clean up and put everything back -----------------------------------------------------------
await browser.close();
setRemarks(remarksBefore);
sql(`delete from mls_open_houses where open_house_key = '${OH_KEY}'`);
sql(`update feature_flags set enabled = false where key in ('ai_member_tour', 'ai_member_moving', 'ai_member_prelisting')`);
for (const k of ["ai_enabled", "ai_mls_approved", "ai_member_moving", "ai_member_prelisting", "ai_member_tour"]) sql(`update feature_flags set enabled = ${flagsBefore[k] === "true"} where key = '${k}'`);
const [zdr, tokens] = settingsBefore.split("|");
sql(`update app_settings set ai_zdr_confirmed_at = ${zdr ? `'${zdr}'` : "null"}, ai_daily_tokens_member = ${tokens}`);
sql(`delete from staff_notifications where kind = 'member_todo' and ref_id in ('${sam}', '${jordan}')`);
sql(`delete from deals where id = '${deal}'`);
sql(`delete from auth.users where email like '%.${stamp}@example.test'`);
check("cleanup: switches back as they were", sql(`select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in (${FLAGS.map((k) => `'${k}'`).join(",")})`) === FLAGS.slice().sort().map((k) => `${k}=${flagsBefore[k]}`).join(","));
check("cleanup: members, to-dos, the open house and FX-002's remarks", sql(`select count(*) from profiles where email like '%.${stamp}@example.test'`) === "0" && sql(`select count(*) from mls_open_houses where open_house_key = '${OH_KEY}'`) === "0" && sql(`select data->>'PublicRemarks' from mls_listings where listing_key = 'FX-002'`) === remarksBefore);
done();
