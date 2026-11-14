// S5b PR 3: Ask Vabrato's drafts and "My drafts", end to end on the local
// stack with the fake Claude (scripts/qa/fake-claude.mjs). Fictional members,
// homes and messages only; everything it adds is removed and every switch and
// setting it touches is put back.
//
// - Off by default: no draft modes, no My drafts, nothing sent.
// - An admin turns both switches on in the console.
// - A seller drafts a note to their movers about their sale: only the address
//   and closing date go (no name, price, escrow number or contact details);
//   their name is filled in afterwards. Open in my email (with a To address
//   the member types), Save to My drafts, edit, Send to my agent (Messages
//   filled in, not sent). Contacts in an answer are replaced; wiring and Fair
//   Housing answers aren't shown; wiring in the notes is refused unsent.
// - A buyer's offer cover letter: terms only, to the agent only (no email or
//   copy); notes about family refused unsent; personal details in a letter
//   not shown. Sellers get no cover-letter mode.
// - Private: the agent's console page and another member see no drafts.
// - Delete a draft, the 30-day purge, and "Delete my assistant data".
// - axe at 1440 and 390, no sideways scroll at 390 and 320, keyboard, and
//   page loads send nothing to the model.
//
// Needs: apps/web on :3003 and apps/va on :3000 with ANTHROPIC_BASE_URL at the
// fake; CLAUDE_LOG, MAIL_DIR, PGURL, SERVICE_KEY; migrations up to 0038.

import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASE, axeAll, check, done, joinAs, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const LOG = process.env.CLAUDE_LOG;
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s5b-drafts");
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

// --- What this run changes, to put back -------------------------------------------------------
const FLAGS = ["ai_enabled", "ai_member_draft", "ai_member_cover_letter"];
const flagsBefore = Object.fromEntries(sql(`select key || '=' || enabled from feature_flags where key in (${FLAGS.map((k) => `'${k}'`).join(",")})`).split("\n").filter(Boolean).map((l) => l.split("=")));
const settingsBefore = sql(`select coalesce(ai_zdr_confirmed_at::text, '') || '|' || ai_daily_tokens_member from app_settings`);
const setFlags = (on, keys = FLAGS) => sql(`update feature_flags set enabled = ${on} where key in (${keys.map((k) => `'${k}'`).join(",")})`);
setFlags(false);
// The fake reports 61,000 input tokens a call; the member token limit is raised for the run.
sql(`update app_settings set ai_zdr_confirmed_at = coalesce(ai_zdr_confirmed_at, now()), ai_daily_tokens_member = 100000000`);
const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);

const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  return ctx.newPage();
};
const cards = (page) => page.locator("ol[aria-label^='Your questions'] > li");
async function ask(page, mode, fill) {
  if (await page.getByRole("radio").count()) await page.getByText(mode, { exact: true }).click();
  await fill();
  const n = await cards(page).count();
  await page.getByRole("button", { name: mode === "Offer cover letter" ? "Write the letter" : "Write the draft" }).click();
  await cards(page).nth(n).waitFor({ timeout: 15000 });
  return cards(page).nth(n);
}
const draftAsk = (page, { to = "Movers", home, notes }) =>
  ask(page, "Draft an email or message", async () => {
    await page.getByLabel("Who it's for").selectOption({ label: to });
    if (home) await page.getByLabel("Which home").selectOption({ label: home });
    await page.getByLabel("What should it say?").fill(notes);
  });

// --- People and homes --------------------------------------------------------------------------
const ADDRESS = `${stamp % 1000} Fixture Lane, Belmont`;
const seller = await newPage();
const sellerEmail = `sam.${stamp}@example.test`;
await joinAs(seller, { email: sellerEmail, name: "Sam Example", role: "seller" });
const sam = sql(`select id from profiles where email = '${sellerEmail}'`);
sql(`update profiles set agent_id = '${mark}' where id = '${sam}'`);
// Price and escrow number are set so the run can show they're never sent.
const deal = sql(`insert into deals (address, ratification_date, days_to_close, agent_id, created_by, sale_price, escrow_number) values ('${ADDRESS}', '2026-11-02', 30, '${mark}', '${mark}', 2150000, 'ESC-${stamp}') returning id`).split("\n")[0];
sql(`insert into deal_members (deal_id, profile_id, member_role) values ('${deal}', '${sam}', 'seller')`);
const buyer = await newPage();
const buyerEmail = `jordan.${stamp}@example.test`;
await joinAs(buyer, { email: buyerEmail, name: "Jordan Example", role: "buyer" });
const jordan = sql(`select id from profiles where email = '${buyerEmail}'`);
sql(`update profiles set agent_id = '${mark}' where id = '${jordan}'`);
const OFFER_HOME = `${stamp % 1000} Example Court, San Carlos`;
sql(`insert into tracked_properties (buyer_id, address, source, status) values ('${jordan}', '${OFFER_HOME}', 'QA', 'watching')`);
const riley = await newPage();
const rileyEmail = `riley.${stamp}@example.test`;
await joinAs(riley, { email: rileyEmail, name: "Riley Example", role: "buyer" });

// --- 1. Off by default -------------------------------------------------------------------------
const callsAtStart = memberCalls();
await seller.goto(`${BASE}/my/assistant`);
check("off: no My drafts in the menu", (await seller.getByRole("link", { name: "My drafts" }).count()) === 0);
await seller.goto(`${BASE}/my/drafts`);
check("off: My drafts still opens (empty)", await seller.getByRole("heading", { name: "No saved drafts" }).isVisible());

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
for (const name of ["Draft an email or message", "Offer cover letter"]) {
  await staff.getByRole("button", { name: `Turn on: ${name} (members)` }).click();
  await staff.getByRole("button", { name: `Turn off: ${name} (members)` }).waitFor({ timeout: 15000 });
}
setFlags(true, ["ai_enabled"]);
check("console: an admin turns on both draft switches", sql(`select string_agg(enabled::text, ',') from feature_flags where key in ('ai_member_draft', 'ai_member_cover_letter')`) === "true,true");

// --- 3. A seller's note to their movers --------------------------------------------------------------
await seller.goto(`${BASE}/my/assistant`);
check("seller: My drafts in the Assistant menu", await seller.getByRole("link", { name: "My drafts" }).isVisible());
check("seller: no cover-letter mode (buyers only)", (await seller.getByText("Offer cover letter", { exact: true }).count()) === 0);
let card = await draftAsk(seller, { home: `Your sale: ${ADDRESS}`, notes: "QA-MODE: ok Ask the movers for a date the week after we close. Call me at 650-555-0101 or sam.qa@example.test." });
check("seller: a draft card, labelled 'You send it'", (await card.getByRole("heading", { name: "Your draft" }).isVisible()) && (await card.locator("[data-ai-label='you-send']").count()) === 1);
const body = await card.getByLabel("Message").inputValue();
check("seller: the address and closing date are in the draft", body.includes(ADDRESS) && body.includes("Dec 2, 2026"), body);
check("seller: their name is filled in afterwards", body.includes("Sam Example") && !body.includes("[Your name]"), body);
let e = last("member_draft");
check("seller: sent without email, phone, price or escrow number; JSON, no tools", e && !e.requestHasEmail && !e.requestHasPhone && !e.requestHasLongNumber && e.format === "json_schema" && e.tools === 0 && e.systemHasAlwaysRules, JSON.stringify(e));
await card.getByLabel("To (optional)").fill("movers.qa@example.test");
const href = await card.getByRole("link", { name: "Open in my email" }).getAttribute("href");
check("open in my email: a mailto with the typed address, subject and body", /^mailto:movers\.qa@example\.test\?subject=/.test(href ?? "") && decodeURIComponent(href ?? "").includes(ADDRESS), href);
await card.getByRole("button", { name: "Copy" }).click();
await card.getByText(/^Copied/).waitFor({ timeout: 5000 });
check("copy: the draft is on the clipboard", (await seller.evaluate(() => navigator.clipboard.readText())).includes(ADDRESS));
await axeAll(seller, "/my/assistant (draft)");
for (const width of [390, 320]) {
  const w = await sideScroll(seller, width);
  check(`/my/assistant (draft): no sideways scroll @${width}`, w <= width, `${w}px`);
}
await shot(seller, "draft");
await card.getByRole("button", { name: "Save to My drafts" }).click();
await card.getByText(/^Saved to My drafts/).waitFor({ timeout: 10000 });
check("save: one private draft, about the sale", sql(`select kind || '|' || recipient || '|' || about from member_drafts where profile_id = '${sam}'`) === `message|movers|${ADDRESS}`);

card = await draftAsk(seller, { notes: "QA-MODE: contacts Ask the contractor for a quote.", to: "A contractor" });
const contactsBody = await card.getByLabel("Message").inputValue();
check("contacts in the answer are replaced", contactsBody.includes("[phone]") && contactsBody.includes("[email]") && !/650-555-0142|dana@example/.test(contactsBody), contactsBody);
card = await draftAsk(seller, { notes: "QA-MODE: wiring Ask the lender about the deposit.", to: "My lender" });
check("wiring details in an answer: not shown", (await card.getByText(/never gives those/).isVisible()) && !(await seller.content()).includes("999999999"));
card = await draftAsk(seller, { notes: "QA-MODE: steering Tell my friend about the house.", to: "Someone else" });
check("Fair Housing wording in an answer: not shown", (await card.getByText(/wording we can't use under Fair Housing/).isVisible()) && !(await seller.content()).includes("young kids"));
let before = memberCalls();
card = await draftAsk(seller, { notes: "Tell the lender to wire it to routing number 999999999, account 000123456789.", to: "My lender" });
check("wiring in the notes: refused before anything is sent", (await card.getByText(/Leave out bank, account or wiring details/).isVisible()) && memberCalls() === before);

card = await draftAsk(seller, { notes: "QA-MODE: ok Ask my agent whether the movers can come early.", to: "My agent" });
check("a note to the agent: Send to my agent, no email link", (await card.getByRole("button", { name: "Send to my agent" }).isVisible()) && (await card.getByRole("link", { name: "Open in my email" }).count()) === 0);
const agentBody = await card.getByLabel("Message").inputValue();
await card.getByRole("button", { name: "Send to my agent" }).click();
await seller.waitForURL(/\/my\/messages\?draft=/, { timeout: 10000 });
const filled = await seller.locator("#message-body").inputValue();
check("send to my agent: Messages filled in, not sent", filled.startsWith("Here's a draft I wrote with Ask Vabrato") && filled.includes(agentBody.split("\n")[0]) && sql(`select count(*) from messages where member_id = '${sam}'`) === "0", filled.slice(0, 80));

// --- 4. My drafts ------------------------------------------------------------------------------
await seller.goto(`${BASE}/my/drafts`);
const saved = seller.locator("ol[aria-label^='Your saved drafts'] > li");
check("my drafts: the saved draft listed, with its home", (await saved.count()) === 1 && (await saved.first().getByText(ADDRESS, { exact: false }).count()) >= 1);
await saved.first().getByLabel("Message").fill(`${body}\n\nP.S. Mornings are best.`);
await saved.first().getByRole("button", { name: "Save changes" }).click();
await saved.first().getByText(/^Saved\.$/).waitFor({ timeout: 10000 });
check("my drafts: an edit is saved", sql(`select body like '%Mornings are best.' from member_drafts where profile_id = '${sam}'`) === "t");
await saved.first().getByRole("textbox", { name: "Message" }).fill(`${body}\n\nP.S. Mornings are best. Wire the deposit to routing number 999999999, account 000123456789.`);
await saved.first().getByRole("button", { name: "Save changes" }).click();
await saved.first().getByText(/never saved here/).waitFor({ timeout: 10000 });
check("my drafts: wiring details are never saved", sql(`select count(*) from member_drafts where body like '%999999999%'`) === "0");
await saved.first().getByLabel("Message").fill(`${body}\n\nP.S. Mornings are best.`);
await axeAll(seller, "/my/drafts");
for (const width of [390, 320]) {
  const w = await sideScroll(seller, width);
  check(`/my/drafts: no sideways scroll @${width}`, w <= width, `${w}px`);
}
await shot(seller, "my-drafts");

// --- 5. A buyer's offer cover letter --------------------------------------------------------------
const letter = (notes, home) =>
  ask(buyer, "Offer cover letter", async () => {
    if (home) await buyer.getByLabel("The home you're offering on").selectOption({ label: home });
    await buyer.getByLabel("What makes your offer strong?").fill(notes);
  });
await buyer.goto(`${BASE}/my/assistant`);
before = memberCalls();
card = await letter("We're a young family with two kids and we love the yard.", OFFER_HOME);
check("cover letter: notes about family refused before anything is sent", (await card.getByText(/about your offer only/).isVisible()) && memberCalls() === before);
card = await letter("QA-MODE: ok Fully underwritten, 21-day close, short rent-back OK.", OFFER_HOME);
check("cover letter: a letter for the agent", (await card.getByRole("heading", { name: "Your cover letter" }).isVisible()) && (await card.getByText(/Offer cover letter, for your agent/).isVisible()));
check("cover letter: no email link and no copy, only Send to my agent", (await card.getByRole("link", { name: "Open in my email" }).count()) === 0 && (await card.getByRole("button", { name: "Copy" }).count()) === 0 && (await card.getByRole("button", { name: "Send to my agent" }).isVisible()));
e = last("member_cover_letter");
check("cover letter: the address went, no name or contacts", e && !e.requestHasEmail && !e.requestHasPhone, JSON.stringify(e));
check("cover letter: the buyer's name filled in", (await card.getByLabel("Letter").inputValue()).includes("Jordan Example"));
await card.getByRole("button", { name: "Save to My drafts" }).click();
await card.getByText(/^Saved to My drafts/).waitFor({ timeout: 10000 });
check("cover letter: saved as a cover letter to the agent", sql(`select kind || '|' || recipient from member_drafts where profile_id = '${jordan}'`) === "cover_letter|agent");
await shot(buyer, "cover-letter");
card = await letter("QA-MODE: personal Quick close.", OFFER_HOME);
check("cover letter: personal details in the letter, not shown", (await card.getByText(/mentioned personal details/).isVisible()) && !(await buyer.content()).includes("Our parents"));
await buyer.goto(`${BASE}/my/drafts`);
await buyer.locator("ol[aria-label^='Your saved drafts'] > li").first().getByRole("button", { name: "Send to my agent" }).click();
await buyer.waitForURL(/\/my\/messages\?draft=/, { timeout: 10000 });
check("cover letter: Send to my agent fills Messages for review", (await buyer.locator("#message-body").inputValue()).startsWith(`Here's a cover letter for my offer on ${OFFER_HOME}. Could you review it?`));
check("cover letter: marked sent to the agent", sql(`select sent_via from member_drafts where profile_id = '${jordan}'`) === "agent");

// Keyboard: mode, then who, which home, notes and the button.
await buyer.goto(`${BASE}/my/assistant`);
await buyer.getByText("Draft an email or message", { exact: true }).click();
// The button is disabled (not focusable) until there are notes.
await buyer.getByLabel("What should it say?").fill("A note to my lender.");
await buyer.getByLabel("Who it's for").focus();
const order = [];
for (let i = 0; i < 3; i++) {
  await buyer.keyboard.press("Tab");
  order.push(await buyer.evaluate(() => document.activeElement?.labels?.[0]?.textContent?.trim() ?? document.activeElement?.textContent?.trim()));
}
check("keyboard: who → which home → notes → the button", JSON.stringify(order) === JSON.stringify(["Which home", "What should it say?", "Write the draft"]), JSON.stringify(order));

// --- 6. Private to the member ----------------------------------------------------------------------
await staff.goto(`${VA}/members/${jordan}`);
check("private: the agent's member page shows no drafts", !(await staff.content()).includes("21-day close") && !(await staff.content()).includes("Fully underwritten"));
await staff.goto(`${VA}/members/${sam}`);
check("private: nor the seller's", !(await staff.content()).includes("Mornings are best"));
await riley.goto(`${BASE}/my/drafts`);
check("private: another member sees none", (await riley.getByRole("heading", { name: "No saved drafts" }).isVisible()) && !(await riley.content()).includes(ADDRESS));

// --- 7. Page loads send nothing ------------------------------------------------------------------
before = memberCalls();
for (const p of ["/my/assistant", "/my/drafts", "/my/todos"]) await seller.goto(`${BASE}${p}`);
check("page loads send nothing to the model", memberCalls() === before);

// --- 8. Delete, purge, delete my assistant data -----------------------------------------------------
// A second saved draft for the seller, then delete one from My drafts.
sql(`insert into member_drafts (profile_id, kind, recipient, subject, body) values ('${sam}', 'message', 'contractor', 'Fence quote', 'Could you quote the fence?'), ('${sam}', 'message', 'lender', 'Rate lock', 'When does our rate lock end?')`);
await seller.goto(`${BASE}/my/drafts`);
seller.once("dialog", (d) => d.accept());
await seller.locator("ol[aria-label^='Your saved drafts'] > li").filter({ hasText: "Fence quote" }).getByRole("button", { name: "Delete" }).click();
// The row leaves the list when the page refreshes.
await seller.waitForFunction(() => !document.body.innerText.includes("Fence quote"), null, { timeout: 10000 });
check("delete: the draft is gone", sql(`select count(*) from member_drafts where profile_id = '${sam}' and subject = 'Fence quote'`) === "0");
// The purge: a draft not edited for 31 days goes; the others stay.
sql(`alter table member_drafts disable trigger member_drafts_guard; update member_drafts set updated_at = now() - interval '31 days' where profile_id = '${sam}' and subject = 'Rate lock'; alter table member_drafts enable trigger member_drafts_guard;`);
const purged = sql(`select public.purge_member_drafts()`);
check("purge: drafts untouched for 30 days are deleted, the rest stay", purged === "1" && sql(`select count(*) from member_drafts where profile_id = '${sam}'`) === "1");
check("purge: scheduled daily when pg_cron is there", sql(`select count(*) from pg_extension where extname = 'pg_cron'`) === "0" || sql(`select count(*) from cron.job where jobname = 'vabrato-purge-member-drafts'`) === "1");
await seller.goto(`${BASE}/my/drafts`);
seller.once("dialog", (d) => d.accept());
await seller.getByRole("button", { name: "Delete my assistant data" }).click();
await seller.getByText(/^Deleted 1 item/).waitFor({ timeout: 10000 });
check("delete my assistant data: the seller's drafts are gone", sql(`select count(*) from member_drafts where profile_id = '${sam}'`) === "0");
check("no member calls were made except the asks", memberCalls() - callsAtStart === 7, String(memberCalls() - callsAtStart));

// --- Clean up and put everything back -----------------------------------------------------------
await browser.close();
for (const [k, v] of Object.entries(flagsBefore)) sql(`update feature_flags set enabled = ${v === "true"} where key = '${k}'`);
const [zdr, tokens] = settingsBefore.split("|");
sql(`update app_settings set ai_zdr_confirmed_at = ${zdr ? `'${zdr}'` : "null"}, ai_daily_tokens_member = ${tokens}`);
sql(`delete from deals where id = '${deal}'`);
sql(`delete from auth.users where email like '%.${stamp}@example.test'`);
check("cleanup: switches back as they were", sql(`select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in (${FLAGS.map((k) => `'${k}'`).join(",")})`) === FLAGS.slice().sort().map((k) => `${k}=${flagsBefore[k]}`).join(","));
check("cleanup: the fictional members and drafts are gone", sql(`select count(*) from profiles where email like '%.${stamp}@example.test'`) === "0" && sql(`select count(*) from member_drafts where profile_id in ('${sam}', '${jordan}')`) === "0");
done();
