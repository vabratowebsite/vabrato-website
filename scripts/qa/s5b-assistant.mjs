// S5b PR 1: Ask Vabrato, the member assistant, end to end on the local stack
// with the fake Claude server (scripts/qa/fake-claude.mjs). Fictional members
// only; everything it adds is removed and every switch it touches is put back.
//
// - Off by default: no menu item, the page says so, nothing is sent.
// - The console's "Member assistant" switches turn each feature on (admin).
// - Explain a term: label, disclaimer, "Ask my agent" fills Messages (not sent);
//   wiring and Fair Housing wording in an answer are blocked; a steering
//   question is refused before anything is sent.
// - Search by sentence: chips, "Run this search" lands on /search; an unknown
//   city is dropped; sold only for a buyer with VOW; an extra field is refused.
// - Limits, roles (buyer, seller, both, staff), one switch on, axe at 1440 and
//   390, no sideways scroll at 390 and 320, keyboard, and page loads send nothing.
//
// Needs: apps/web on :3003 and apps/va on :3000, both started with
// ANTHROPIC_BASE_URL=http://127.0.0.1:4020 and any ANTHROPIC_API_KEY; the fake
// on :4020 logging to CLAUDE_LOG; MAIL_DIR, PGURL, REVALIDATE_SECRET;
// migrations up to 0036.

import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASE, axeAll, check, done, joinAs, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const LOG = process.env.CLAUDE_LOG;
if (!LOG) throw new Error("set CLAUDE_LOG (the fake Claude's log)");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s5b-assistant");
mkdirSync(OUT, { recursive: true });
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const log = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const memberCalls = () => log().filter((e) => /^member_/.test(e.feature ?? "")).length;
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

// --- What this run changes, to put back at the end ----------------------------------------------
const FLAGS = ["ai_enabled", "ai_member_explain", "ai_member_search", "vow_enabled"];
const before = Object.fromEntries(sql(`select key || '=' || enabled from feature_flags where key in (${FLAGS.map((k) => `'${k}'`).join(",")})`).split("\n").filter(Boolean).map((l) => l.split("=")));
// The fake reports 61,000 input tokens a call, so the member token limit is raised for the run.
const settingsBefore = sql(`select coalesce(ai_zdr_confirmed_at::text, '') || '|' || ai_daily_requests_member || '|' || ai_daily_tokens_member from app_settings`);
const setFlags = (on, keys) => sql(`update feature_flags set enabled = ${on} where key in (${keys.map((k) => `'${k}'`).join(",")})`);
setFlags(false, ["ai_enabled", "ai_member_explain", "ai_member_search", "vow_enabled"]);
sql(`update app_settings set ai_zdr_confirmed_at = coalesce(ai_zdr_confirmed_at, now()), ai_daily_requests_member = 30, ai_daily_tokens_member = 100000000`);
await revalidate();

const newPage = async () => (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const assistantLink = (page) => page.getByRole("link", { name: "Ask Vabrato" });

/** Ask a question on /my/assistant and wait for its answer card; returns the newest card. */
async function ask(page, text, mode) {
  if (await page.getByRole("radio").count()) await page.getByText(mode === "explain" ? "Explain a term" : "Search by sentence", { exact: true }).click();
  await page.getByRole("textbox").first().fill(text);
  const n = await page.locator("ol[aria-label^='Your questions'] > li").count();
  await page.getByRole("button", { name: mode === "search" ? "Make the search" : "Explain" }).click();
  await page.locator("ol[aria-label^='Your questions'] > li").nth(n).waitFor({ timeout: 15000 });
  return page.locator("ol[aria-label^='Your questions'] > li").nth(n);
}

// --- 1. Off by default ----------------------------------------------------------------------------
const buyer = await newPage();
const buyerEmail = `jordan.${stamp}@example.test`;
await joinAs(buyer, { email: buyerEmail, name: "Jordan Example", role: "buyer" });
const callsAtStart = memberCalls();
await buyer.goto(`${BASE}/my/buyer`);
check("off: no Ask Vabrato in the menu", (await assistantLink(buyer).count()) === 0);
await buyer.goto(`${BASE}/my/assistant`);
check("off: the page says it isn't available", await buyer.getByRole("heading", { name: "Ask Vabrato isn't available yet" }).isVisible());
check("off: no question box", (await buyer.getByRole("textbox").count()) === 0);
await axeAll(buyer, "/my/assistant (off)");

// --- 2. The console's member switches -------------------------------------------------------------
const staff = await newPage();
await staff.goto(`${VA}/login`);
await staff.getByPlaceholder("you@vabrato.com").fill(STAFF_EMAIL);
let m = mails();
await staff.getByRole("button", { name: "Email me a sign-in link" }).click();
await staff.getByText(/Check your email/).waitFor();
await staff.goto(await linkFor(STAFF_EMAIL, m));
await staff.waitForURL(`${VA}/`, { timeout: 15000 });
await staff.goto(`${VA}/assistant`);
check("console: a Member assistant panel", await staff.getByRole("heading", { name: "Member assistant (Ask Vabrato)" }).isVisible());
for (const name of ["Explain a term (members)", "Search by sentence (members)"]) {
  await staff.getByRole("button", { name: `Turn on: ${name}` }).click();
  await staff.getByRole("button", { name: `Turn off: ${name}` }).waitFor({ timeout: 15000 });
  check(`console: an admin turns on ${name}`, true);
}
await staff.getByRole("button", { name: "Turn on: The assistant (master switch)" }).click();
await staff.getByRole("button", { name: "Turn off: The assistant (master switch)" }).waitFor({ timeout: 15000 });
check("database: both member switches and the master switch on", sql(`select string_agg(key, ',' order by key) from feature_flags where enabled and key in ('ai_enabled','ai_member_explain','ai_member_search')`) === "ai_enabled,ai_member_explain,ai_member_search");
await axeAll(staff, "console /assistant");

// --- 3. Explain a term ---------------------------------------------------------------------------
await buyer.goto(`${BASE}/my/buyer`);
check("on: Ask Vabrato in the menu", await assistantLink(buyer).isVisible());
await assistantLink(buyer).click();
await buyer.waitForURL(`${BASE}/my/assistant`);
check("on: both features offered", (await buyer.getByRole("radio").count()) === 2);
check("on: the daily allowance shown", await buyer.getByText("30 of 30 questions left today").isVisible());
check("on: says nothing is kept unless saved, and the agent doesn't see questions or drafts", await buyer.getByText(/Nothing you type is kept unless you save a draft or add a to-do.*Your agent doesn.t see your questions or drafts/).isVisible());
const loadsBefore = memberCalls();
await buyer.reload();
check("page loads send nothing to the model", memberCalls() === loadsBefore && loadsBefore === callsAtStart);

let card = await ask(buyer, "What does contingency removal mean?", "explain");
check("explain: an answer card", await card.getByRole("heading", { name: "What it means" }).isVisible());
check("explain: labelled AI", (await card.locator("[data-ai-label]").count()) === 1);
check("explain: not legal or tax advice", await card.getByText(/Not legal or tax advice/).isVisible());
check("explain: the answer is shown", await card.getByText(/formally gives up a condition/).isVisible());
check("explain: focus moves to the answer", await buyer.evaluate(() => document.activeElement?.textContent === "What it means"));
check("explain: the allowance counts down", await buyer.getByText("29 of 30 questions left today").isVisible());
let e = log().filter((x) => x.feature === "member_explain").at(-1);
check("explain: one request, no documents, the always-rules, no tools", e && e.documents === 0 && e.tools === 0 && e.systemHasAlwaysRules && !e.requestHasPrivateListingFields, JSON.stringify(e));
check("explain: low effort", e?.effort === "low", e?.effort);
await shot(buyer, "explain");
await axeAll(buyer, "/my/assistant (answers)");
for (const width of [390, 320]) {
  const w = await sideScroll(buyer, width);
  check(`no sideways scroll @${width}`, w <= width, `${w}px`);
}

const href = await card.getByRole("link", { name: "Ask my agent" }).getAttribute("href");
await buyer.goto(`${BASE}${href}`);
const draft = await buyer.locator("#message-body").inputValue();
check("ask my agent: Messages filled with the question", draft.includes("What does contingency removal mean?"), draft);
check("ask my agent: nothing sent", sql(`select count(*) from messages m join profiles p on p.id = m.member_id where p.email = '${buyerEmail}'`) === "0");
await buyer.goto(`${BASE}/my/assistant`);

card = await ask(buyer, "What is earnest money? QA-MODE: wiring", "explain");
check("explain: wiring details in an answer aren't shown", await card.getByText(/never gives those/).isVisible());
check("explain: the wiring text never reaches the page", !(await buyer.content()).includes("999999999"));
card = await ask(buyer, "What is a starter home? QA-MODE: steering", "explain");
check("explain: Fair Housing wording in an answer isn't shown", await card.getByText(/wording we can't use under Fair Housing/).isVisible());
check("explain: the steering text never reaches the page", !(await buyer.content()).includes("perfect for young families"));
card = await ask(buyer, "What does a building permit mean? QA-MODE: refusal", "explain");
check("explain: a refusal reads as a member message", await card.getByText(/couldn't help with that/).isVisible());
const sentBefore = memberCalls();
card = await ask(buyer, "Which neighborhood is safe with no kids around?", "explain");
check("explain: a steering question gets the neutral answer", await card.getByText(/school district's own website/).isVisible());
check("explain: … and nothing was sent", memberCalls() === sentBefore);

// --- 4. Search by sentence -----------------------------------------------------------------------
card = await ask(buyer, "3-bed house in San Carlos under $2.5M with a view", "search");
const chips = await card.getByRole("list", { name: "Search filters" }).getByRole("listitem").allTextContents();
check("search: the filters as chips", JSON.stringify(chips) === JSON.stringify(["For sale", "San Carlos", "Under $2.5M", "3+ beds", "Houses"]), JSON.stringify(chips));
check("search: what it couldn't use is said", await card.getByText("The search can't filter by view.").isVisible());
const run = card.getByRole("link", { name: "Run this search" });
check("search: links to /search with the same filters", (await run.getAttribute("href")) === "/search?city=san-carlos&maxPrice=2500000&beds=3&type=house", await run.getAttribute("href"));
e = log().filter((x) => x.feature === "member_search").at(-1);
check("search: JSON answer, our city list as data, nothing about the member", e?.format === "json_schema" && e.dataBlocks === 1 && !e.requestHasEmail && !e.requestHasPhone, JSON.stringify(e));
await shot(buyer, "search");
await run.click();
await buyer.waitForURL(/\/search\?/);
check("search: Run this search lands on the results", buyer.url().endsWith("/search?city=san-carlos&maxPrice=2500000&beds=3&type=house"), buyer.url());
check("search: nothing was saved", sql(`select count(*) from saved_searches s join profiles p on p.id = s.profile_id where p.email = '${buyerEmail}'`) === "0");
await buyer.goto(`${BASE}/my/assistant`);

card = await ask(buyer, "2-bed condo in Belmont or Fresno QA-MODE: elsewhere", "search");
check("search: a city we don't cover is dropped and said", await card.getByText(/isn't one of the cities we cover/).isVisible());
card = await ask(buyer, "3-bed houses in San Carlos that sold", "search");
check("search: sold without VOW searches for sale, with a note", (await card.getByRole("link", { name: "Run this search" }).getAttribute("href"))?.startsWith("/search?") && (await card.getByText(/Sold homes aren't available/).isVisible()));
card = await ask(buyer, "3-bed in Belmont QA-MODE: extra", "search");
check("search: an answer with an extra field isn't used", await card.getByText(/didn't come through properly/).isVisible());
const sentBefore2 = memberCalls();
card = await ask(buyer, "3-bed house in a safe neighborhood, adults only", "search");
check("search: a steering sentence is refused before anything is sent", (await card.getByText(/Fair Housing/).isVisible()) && memberCalls() === sentBefore2);

// VOW: a buyer who accepted the terms gets sold homes.
setFlags(true, ["vow_enabled"]);
sql(`update profiles set vow_accepted_at = now() where email = '${buyerEmail}'`);
await revalidate();
await buyer.goto(`${BASE}/my/assistant`);
card = await ask(buyer, "3-bed houses in San Carlos that sold", "search");
check("search: VOW buyer: sold homes, on /my/sold", (await card.getByRole("link", { name: "Run this search" }).getAttribute("href")) === "/my/sold?city=san-carlos&beds=3&type=house");
check("search: VOW buyer: first chip says sold", (await card.getByRole("list", { name: "Search filters" }).getByRole("listitem").first().textContent()) === "Sold homes");
setFlags(false, ["vow_enabled"]);
await revalidate();

// Keyboard: the mode, the box and the button by Tab; Enter submits.
await buyer.goto(`${BASE}/my/assistant`);
await buyer.locator("body").click({ position: { x: 1, y: 1 } });
const reached = new Set();
for (let i = 0; i < 80 && ![...reached].some((r) => r.startsWith("textarea")); i++) {
  await buyer.keyboard.press("Tab");
  const f = await buyer.evaluate(() => {
    const el = document.activeElement;
    const cs = el ? getComputedStyle(el) : null;
    const box = el?.closest("label") ? getComputedStyle(el.closest("label")) : null;
    const visible = Boolean(cs && ((cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none") || (box && box.outlineStyle !== "none" && parseFloat(box.outlineWidth) > 0)));
    return { tag: el?.tagName, type: el?.getAttribute("type"), text: el?.textContent?.trim().slice(0, 40), visible };
  });
  if (f.type === "radio") reached.add(`radio:${f.visible}`);
  if (f.tag === "TEXTAREA") reached.add(`textarea:${f.visible}`);
}
check("keyboard: the mode and the box are reached with a visible focus", reached.has("radio:true") && reached.has("textarea:true"), [...reached].join(", "));
await buyer.keyboard.type("What is escrow?");
await buyer.keyboard.press("Tab");
const onButton = await buyer.evaluate(() => document.activeElement?.textContent?.trim());
check("keyboard: Tab from the box reaches the button", onButton === "Explain", onButton);
await buyer.keyboard.press("Enter");
await buyer.getByRole("heading", { name: "What it means" }).waitFor({ timeout: 15000 });
check("keyboard: Enter on the button asks", true);

// Limits: the member's daily allowance.
const used = Number(sql(`select count(*) from ai_runs r join profiles p on p.id = r.profile_id where p.email = '${buyerEmail}'`));
sql(`update app_settings set ai_daily_requests_member = ${used + 1}`);
await buyer.goto(`${BASE}/my/assistant`);
check("limit: one question left shown", await buyer.getByText(`1 of ${used + 1} questions left today`).isVisible());
await ask(buyer, "What is escrow?", "explain");
check("limit: then the button is off", await buyer.getByRole("button", { name: "Explain" }).isDisabled());
sql(`update app_settings set ai_daily_requests_member = 30`);

// --- 5. Other roles ------------------------------------------------------------------------------
const seller = await newPage();
const sellerEmail = `riley.${stamp}@example.test`;
await joinAs(seller, { email: sellerEmail, name: "Riley Example", role: "seller" });
await seller.goto(`${BASE}/my/seller`);
check("seller: Ask Vabrato in the menu", await assistantLink(seller).isVisible());
await seller.goto(`${BASE}/my/assistant`);
setFlags(true, ["vow_enabled"]);
sql(`update profiles set vow_accepted_at = now() where email = '${sellerEmail}'`);
await revalidate();
card = await ask(seller, "3-bed houses in San Carlos that sold", "search");
check("seller: sold isn't searched (sold search is for buyers)", (await card.getByRole("link", { name: "Run this search" }).getAttribute("href"))?.startsWith("/search?"));
setFlags(false, ["vow_enabled"]);
await revalidate();
await axeAll(seller, "/my/assistant (seller)");

const both = await newPage();
await joinAs(both, { email: `sam.${stamp}@example.test`, name: "Sam Example", role: "both" });
await both.goto(`${BASE}/my/assistant`);
card = await ask(both, "What is a rent-back?", "explain");
check("both-role member: can ask", await card.getByRole("heading", { name: "What it means" }).isVisible());

// One switch only: no choice of mode, just the box for that feature.
setFlags(false, ["ai_member_search"]);
await both.goto(`${BASE}/my/assistant`);
check("one switch on: no mode choice", (await both.getByRole("radio").count()) === 0);
check("one switch on: the explain box", await both.getByLabel("The term or question").isVisible());
setFlags(true, ["ai_member_search"]);

// Staff on the website get the console notice.
const staffWeb = await newPage();
await staffWeb.goto(`${BASE}/join?role=buyer`);
await staffWeb.getByLabel("Full name").fill("Mark QA");
await staffWeb.getByLabel("Email address").fill(STAFF_EMAIL);
m = mails();
await staffWeb.getByRole("button", { name: "Email me a sign-in link" }).click();
await staffWeb.getByText("Check your email.").waitFor();
await staffWeb.goto(await linkFor(STAFF_EMAIL, m));
await staffWeb.waitForURL(/\/my$/, { timeout: 15000 });
await staffWeb.goto(`${BASE}/my/assistant`);
check("staff: /my/assistant gives the console notice", await staffWeb.getByRole("heading", { name: "This portal is for clients" }).isVisible());

// Signed out: sign in first.
const anon = await newPage();
await anon.goto(`${BASE}/my/assistant`);
check("signed out: sent to sign in", anon.url().startsWith(`${BASE}/sign-in?next=`));

// --- Clean up and put everything back ------------------------------------------------------------
await browser.close();
for (const [k, v] of Object.entries(before)) sql(`update feature_flags set enabled = ${v === "true"} where key = '${k}'`);
const [zdr, limit, tokens] = settingsBefore.split("|");
sql(`update app_settings set ai_zdr_confirmed_at = ${zdr ? `'${zdr}'` : "null"}, ai_daily_requests_member = ${limit}, ai_daily_tokens_member = ${tokens}`);
sql(`delete from auth.users where email like '%.${stamp}@example.test'`);
await revalidate();
check("cleanup: switches back as they were", sql(`select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in (${FLAGS.map((k) => `'${k}'`).join(",")})`) === FLAGS.slice().sort().map((k) => `${k}=${before[k]}`).join(","));
check("cleanup: the fictional members are gone", sql(`select count(*) from profiles where email like '%.${stamp}@example.test'`) === "0");
done();
