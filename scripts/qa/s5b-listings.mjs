// S5b PR 4: "Compare homes" and "Ask about a home", end to end on the local
// stack with the fake Claude (scripts/qa/fake-claude.mjs) and the fictional
// MLS fixtures (FX-001 ...). Everything it adds is removed and every switch
// and setting it touches is put back.
//
// - Off by default: no listing modes, no compare button, no listing-page link.
// - The MLSListings approval switch: the two switches are locked until it's
//   on (console and database), and turning it off turns them off.
// - Compare from /my/compare and from Ask Vabrato; ask about a home from the
//   listing page's link. Only listing facts at the member's level are sent:
//   no FULL fields, contacts or internal notes; sold fields only for a VOW
//   buyer. FX-013 (seller opted out of AVM and comments) is never sent.
// - Price opinions, invented dollar figures, Fair Housing wording and wiring
//   details in an answer are never shown; a steering question is refused
//   unsent.
// - Signed-out visitors see no link and the public listing page is unchanged.
// - axe at 1440 and 390, no sideways scroll at 390 and 320, keyboard, and page
//   loads send nothing to the model.
//
// Needs: apps/web on :3003 and apps/va on :3000 with ANTHROPIC_BASE_URL at the
// fake; CLAUDE_LOG, MAIL_DIR, PGURL, SERVICE_KEY, REVALIDATE_SECRET;
// migrations up to 0039; the MLS fixtures seeded (seed-preview.ts).

import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASE, axeAll, check, done, joinAs, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const LOG = process.env.CLAUDE_LOG;
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s5b-listings");
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
const revalidate = async () => {
  const res = await fetch(`${BASE}/api/revalidate?tag=content`, { method: "POST", headers: { "x-revalidate-secret": process.env.REVALIDATE_SECRET ?? "" } });
  if (!res.ok) throw new Error(`revalidate failed: ${res.status} (set REVALIDATE_SECRET)`);
};

for (const key of ["FX-001", "FX-002", "FX-005", "FX-012", "FX-013"]) {
  if (sql(`select count(*) from mls_listings where listing_key = '${key}'`) !== "1") throw new Error(`fixture ${key} isn't seeded (run packages/mls seed-preview)`);
}

// --- What this run changes, to put back -------------------------------------------------------
const FLAGS = ["ai_enabled", "ai_mls_approved", "ai_member_compare", "ai_member_listing", "vow_enabled"];
const flagsBefore = Object.fromEntries(sql(`select key || '=' || enabled from feature_flags where key in (${FLAGS.map((k) => `'${k}'`).join(",")})`).split("\n").filter(Boolean).map((l) => l.split("=")));
const settingsBefore = sql(`select coalesce(ai_zdr_confirmed_at::text, '') || '|' || ai_daily_tokens_member from app_settings`);
const remarksBefore = sql(`select data->>'PublicRemarks' from mls_listings where listing_key = 'FX-002'`);
const setRemarks = (text) => sql(`update mls_listings set data = jsonb_set(data, '{PublicRemarks}', to_jsonb('${text.replace(/'/g, "''")}'::text)) where listing_key = 'FX-002'`);
sql(`update feature_flags set enabled = false where key in ('ai_member_compare', 'ai_member_listing')`);
sql(`update feature_flags set enabled = false where key in ('ai_enabled', 'ai_mls_approved', 'vow_enabled')`);
// The fake reports 61,000 input tokens a call; the member token limit is raised for the run.
sql(`update app_settings set ai_zdr_confirmed_at = coalesce(ai_zdr_confirmed_at, now()), ai_daily_tokens_member = 100000000`);
await revalidate();
const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);

const newPage = async () => (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const cards = (page) => page.locator("ol[aria-label^='Your questions'] > li");
const save = (profile, keys) => sql(`insert into saved_homes (profile_id, listing_key) values ${keys.map((k) => `('${profile}', '${k}')`).join(", ")} on conflict do nothing`);
async function compareInAssistant(page, labels) {
  if (await page.getByRole("radio").count()) await page.getByText("Compare homes", { exact: true }).click();
  for (const l of labels) await page.getByRole("checkbox", { name: l }).check();
  const n = await cards(page).count();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await cards(page).nth(n).waitFor({ timeout: 15000 });
  return cards(page).nth(n);
}
async function askAbout(page, question) {
  if (await page.getByRole("radio").count()) await page.getByText("Ask about a home", { exact: true }).click();
  await page.getByLabel("Your question", { exact: true }).fill(question);
  const n = await cards(page).count();
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await cards(page).nth(n).waitFor({ timeout: 15000 });
  return cards(page).nth(n);
}

// --- People ------------------------------------------------------------------------------------
const buyer = await newPage();
const buyerEmail = `jordan.${stamp}@example.test`;
await joinAs(buyer, { email: buyerEmail, name: "Jordan Example", role: "buyer" });
const jordan = sql(`select id from profiles where email = '${buyerEmail}'`);
save(jordan, ["FX-001", "FX-002", "FX-012", "FX-013"]);
const label = (key) => {
  const street = sql(`select case when address_display then coalesce(data->>'UnparsedAddress', '') else '' end from mls_listings where listing_key = '${key}'`);
  return street.split(",")[0];
};

// --- 1. Off by default -------------------------------------------------------------------------
const callsAtStart = memberCalls();
await buyer.goto(`${BASE}/my/compare`);
check("off: no Compare with Ask Vabrato button", (await buyer.getByRole("button", { name: "Compare with Ask Vabrato" }).count()) === 0);
await buyer.goto(`${BASE}/listing/FX-001/x`);
await buyer.waitForLoadState("networkidle");
check("off: no Ask Vabrato link on the listing page", (await buyer.getByRole("link", { name: /Ask Vabrato about this home/ }).count()) === 0);

// --- 2. The console: the approval locks the switches --------------------------------------------
const staff = await newPage();
await staff.goto(`${VA}/login`);
await staff.getByPlaceholder("you@vabrato.com").fill(STAFF_EMAIL);
const m = mails();
await staff.getByRole("button", { name: "Email me a sign-in link" }).click();
await staff.getByText(/Check your email/).waitFor();
await staff.goto(await linkFor(STAFF_EMAIL, m));
await staff.waitForURL(`${VA}/`, { timeout: 15000 });
await staff.goto(`${VA}/assistant`);
check("console: both listing switches locked until approval", (await staff.getByText("Locked until MLSListings approval is on.").count()) === 2 && (await staff.getByRole("button", { name: "Turn on: Compare homes (members)" }).count()) === 0);
let refused = "";
try {
  sql(`update feature_flags set enabled = true where key = 'ai_member_compare'`);
} catch (e) {
  refused = String(e.stderr ?? e.message);
}
check("database: a listing switch can't be turned on before approval", /mls_ai_not_approved/.test(refused), refused.slice(0, 120));
await axeAll(staff, "console /assistant (approval locked)");
await staff.getByRole("button", { name: "Turn on: MLSListings approved AI on listing data" }).click();
await staff.getByRole("button", { name: "Turn off: MLSListings approved AI on listing data" }).waitFor({ timeout: 15000 });
for (const name of ["Compare homes", "Ask about a home"]) {
  await staff.getByRole("button", { name: `Turn on: ${name} (members)` }).click();
  await staff.getByRole("button", { name: `Turn off: ${name} (members)` }).waitFor({ timeout: 15000 });
}
check("console: approval, then both switches on (audited)", sql(`select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('ai_mls_approved', 'ai_member_compare', 'ai_member_listing')`) === "ai_member_compare=true,ai_member_listing=true,ai_mls_approved=true" && Number(sql(`select count(*) from staff_audit where action = 'set_ai_flag' and ref_id in ('ai_mls_approved', 'ai_member_compare', 'ai_member_listing') and created_at > now() - interval '5 minutes'`)) >= 3);
await shot(staff, "console-approved");
sql(`update feature_flags set enabled = true where key = 'ai_enabled'`);

// --- 3. Compare from /my/compare ----------------------------------------------------------------
await buyer.goto(`${BASE}/my/compare?key=FX-001&key=FX-002&key=FX-013`);
await buyer.getByRole("button", { name: "Compare with Ask Vabrato" }).click();
await buyer.getByRole("heading", { name: "Comparing 3 homes" }).waitFor({ timeout: 15000 });
let e = last("member_compare");
check("compare: only FX-001 and FX-002 sent (FX-013 opted out)", JSON.stringify(e?.requestListingKeys) === '["FX-001","FX-002"]', JSON.stringify(e?.requestListingKeys));
check("compare: no FULL fields, contacts, internal notes or sold fields; JSON, no tools", e && !e.requestHasPrivateListingFields && !e.requestHasInternalNote && !e.requestHasEmail && !e.requestHasPhone && !e.requestHasSoldFields && e.format === "json_schema" && e.tools === 0, JSON.stringify(e));
check("compare: the opted-out home is listed as not included", await buyer.getByText(/^Not included: .*The seller asked that the listing not be used by AI tools/).isVisible());
check("compare: brokers, source and disclaimer shown", (await buyer.getByText(/Listing broker:/).count()) >= 2 && (await buyer.getByText(/Listing data: MLSListings\. .*not an appraisal/).isVisible()));
await axeAll(buyer, "/my/compare (with Ask Vabrato)");
for (const width of [390, 320]) {
  const w = await sideScroll(buyer, width);
  check(`/my/compare: no sideways scroll @${width}`, w <= width, `${w}px`);
}
await shot(buyer, "compare");

// Blocked answers: the mode comes from FX-002's remarks (QA only, put back after).
for (const [mode, text] of [
  ["value", /doesn't give price or value opinions/],
  ["money", /figure that isn't in the listing/],
  ["steering", /wording we can't use under Fair Housing/],
  ["wiring", /never gives those/],
]) {
  setRemarks(`Fictional remarks. QA-MODE: ${mode}`);
  await buyer.goto(`${BASE}/my/compare?key=FX-001&key=FX-002`);
  await buyer.getByRole("button", { name: "Compare with Ask Vabrato" }).click();
  await buyer.getByRole("heading", { name: "No comparison" }).waitFor({ timeout: 15000 });
  check(`compare: a ${mode} answer isn't shown`, (await buyer.getByText(text).isVisible()) && !(await buyer.content()).includes("999999999") && !(await buyer.content()).includes("underpriced"));
}
setRemarks(remarksBefore);

// --- 4. Ask Vabrato: compare mode, and ask about a home ------------------------------------------
await buyer.goto(`${BASE}/my/assistant`);
let card = await compareInAssistant(buyer, [label("FX-001"), label("FX-002")]);
check("assistant: compare mode", await card.getByRole("heading", { name: "Comparing 2 homes" }).isVisible());

await buyer.goto(`${BASE}/listing/FX-001/x`);
const askLink = buyer.getByRole("link", { name: /Ask Vabrato about this home/ });
await askLink.waitFor({ timeout: 15000 });
check("listing page: the link for a signed-in buyer", await askLink.isVisible());
await askLink.click();
await buyer.waitForURL(/\/my\/assistant\?listing=FX-001/);
check("listing link: Ask about a home with the home chosen", (await buyer.getByLabel("Which home").inputValue()) === "FX-001");
card = await askAbout(buyer, "How big is the lot?");
check("ask: answered from the listing, with sources", (await card.getByRole("heading", { name: "About this home" }).isVisible()) && (await card.getByText(/From the listing: Lot size square feet/).isVisible()));
e = last("member_listing");
check("ask: only FX-001's IDX facts sent", JSON.stringify(e?.requestListingKeys) === '["FX-001"]' && !e.requestHasPrivateListingFields && !e.requestHasInternalNote && !e.requestHasSoldFields, JSON.stringify(e));
await axeAll(buyer, "/my/assistant (listing answer)");
for (const width of [390, 320]) {
  const w = await sideScroll(buyer, width);
  check(`/my/assistant: no sideways scroll @${width}`, w <= width, `${w}px`);
}
await shot(buyer, "ask-about-home");
card = await askAbout(buyer, "QA-MODE: fields How big is the lot?");
check("ask: sources name only fields we sent", (await card.getByText(/From the listing: Lot size square feet\.$/).isVisible()) && !(await card.textContent()).includes("Private"));
card = await askAbout(buyer, "QA-MODE: value Is it priced well?");
check("ask: a price opinion isn't shown", await card.getByText(/doesn't give price or value opinions/).isVisible());
card = await askAbout(buyer, "QA-MODE: money What are the taxes?");
check("ask: an invented dollar figure isn't shown", (await card.getByText(/figure that isn't in the listing/).isVisible()) && !(await buyer.content()).includes("9,500"));
let before = memberCalls();
card = await askAbout(buyer, "Is this a good neighborhood for families with kids?");
check("ask: a steering question is refused unsent", (await card.getByText(/Fair Housing/).isVisible()) && memberCalls() === before);
await buyer.goto(`${BASE}/my/assistant?listing=FX-013`);
before = memberCalls();
card = await askAbout(buyer, "How big is the lot?");
check("ask: an opted-out home gets 'ask your agent', unsent", (await card.getByText(/asked that this listing not be used by AI tools/).isVisible()) && memberCalls() === before);

// Keyboard: the home, the question, then the button.
await buyer.goto(`${BASE}/my/assistant?listing=FX-001`);
await buyer.getByLabel("Your question", { exact: true }).fill("How many bedrooms?");
await buyer.getByLabel("Which home").focus();
const order = [];
for (let i = 0; i < 2; i++) {
  await buyer.keyboard.press("Tab");
  order.push(await buyer.evaluate(() => document.activeElement?.labels?.[0]?.textContent?.trim() ?? document.activeElement?.textContent?.trim()));
}
check("keyboard: which home → question → Ask", JSON.stringify(order) === JSON.stringify(["Your question", "Ask"]), JSON.stringify(order));

// --- 5. A VOW buyer gets VOW fields (price history); an IDX buyer never does ---------------------
const vowBuyer = await newPage();
const vowEmail = `riley.${stamp}@example.test`;
await joinAs(vowBuyer, { email: vowEmail, name: "Riley Example", role: "buyer" });
const riley = sql(`select id from profiles where email = '${vowEmail}'`);
sql(`update feature_flags set enabled = true where key = 'vow_enabled'`);
await revalidate();
sql(`update profiles set vow_accepted_at = now() where id = '${riley}'`);
await vowBuyer.goto(`${BASE}/my/compare?key=FX-001&key=FX-002`);
await vowBuyer.getByRole("button", { name: "Compare with Ask Vabrato" }).click();
await vowBuyer.getByRole("heading", { name: "Comparing 2 homes" }).waitFor({ timeout: 15000 });
e = last("member_compare");
check("VOW buyer: VOW fields (price history) are sent", e?.requestHasSoldFields === true && JSON.stringify(e.requestListingKeys) === '["FX-001","FX-002"]', JSON.stringify(e));
before = memberCalls();
await buyer.goto(`${BASE}/my/assistant?listing=FX-005`);
const offered = await buyer.getByLabel("Which home").locator("option").evaluateAll((os) => os.map((o) => o.value));
check("IDX buyer: a sold home isn't offered, even by link (RLS)", !offered.includes("FX-005") && memberCalls() === before, JSON.stringify(offered));
sql(`update feature_flags set enabled = false where key = 'vow_enabled'`);
await revalidate();

// --- 6. Signed out, page loads, and the approval switch off ---------------------------------------
const anon = await newPage();
const publicRequests = [];
anon.on("request", (r) => r.url().includes("/api/my/assistant") && publicRequests.push(r.url()));
await anon.goto(`${BASE}/listing/FX-001/x`);
await anon.waitForLoadState("networkidle");
check("signed out: no link, and no assistant request", (await anon.getByRole("link", { name: /Ask Vabrato about this home/ }).count()) === 0 && publicRequests.length === 0);
check("signed out: the public page carries no AI text", !/Ask Vabrato|AI draft/.test(await anon.content()));
before = memberCalls();
for (const p of ["/my/assistant", "/my/compare", "/listing/FX-001/x"]) await buyer.goto(`${BASE}${p}`);
check("page loads send nothing to the model", memberCalls() === before);
await staff.goto(`${VA}/assistant`);
await staff.getByRole("button", { name: "Turn off: MLSListings approved AI on listing data" }).click();
await staff.getByRole("button", { name: "Turn on: MLSListings approved AI on listing data" }).waitFor({ timeout: 15000 });
check("turning the approval off turns both off", sql(`select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('ai_mls_approved', 'ai_member_compare', 'ai_member_listing')`) === "ai_member_compare=false,ai_member_listing=false,ai_mls_approved=false");
await buyer.goto(`${BASE}/my/compare`);
check("…and the compare button is gone", (await buyer.getByRole("button", { name: "Compare with Ask Vabrato" }).count()) === 0);
check("model calls: only the asks that should send", memberCalls() - callsAtStart === 11, String(memberCalls() - callsAtStart));

// --- Clean up and put everything back -----------------------------------------------------------
await browser.close();
setRemarks(remarksBefore);
sql(`update feature_flags set enabled = false where key in ('ai_member_compare', 'ai_member_listing')`);
for (const k of ["ai_enabled", "vow_enabled", "ai_mls_approved", "ai_member_compare", "ai_member_listing"]) sql(`update feature_flags set enabled = ${flagsBefore[k] === "true"} where key = '${k}'`);
await revalidate();
const [zdr, tokens] = settingsBefore.split("|");
sql(`update app_settings set ai_zdr_confirmed_at = ${zdr ? `'${zdr}'` : "null"}, ai_daily_tokens_member = ${tokens}`);
sql(`delete from auth.users where email like '%.${stamp}@example.test'`);
check("cleanup: switches back as they were", sql(`select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in (${FLAGS.map((k) => `'${k}'`).join(",")})`) === FLAGS.slice().sort().map((k) => `${k}=${flagsBefore[k]}`).join(","));
check("cleanup: the fictional members are gone; FX-002's remarks restored", sql(`select count(*) from profiles where email like '%.${stamp}@example.test'`) === "0" && sql(`select data->>'PublicRemarks' from mls_listings where listing_key = 'FX-002'`) === remarksBefore);
done();
