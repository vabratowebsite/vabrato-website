// S5b PR 6: Ask Vabrato's design features (colors and moodboard, staging
// ideas, open-house flyer and posts) end to end on the local stack with the
// fake Claude and the fictional MLS fixtures. Everything it adds is removed and
// every switch and setting it touches is put back.
//
// - Off by default; the console switches (none needs the MLSListings approval).
// - A buyer's palette: our own drawing (an image, never markup), a text list of
//   the colors, a PNG download; bad colors and markup in the answer never
//   reach the page; buyers get no staging or flyer modes.
// - A seller's staging ideas: costs dropped, a to-do added for the agent.
// - A seller's flyer: only their words sent (no listing data); edited and
//   re-checked when sent; the agent approves it in the console with our own
//   listing and an open house, or declines it with a note. The approved flyer
//   prints with facts from our records (address, price, the open-house time
//   in Pacific time, the agent's card, the DRE number, Equal Housing), the
//   posts copy with the brokerage line, and the post image downloads.
// - axe at 1440 and 390, no sideways scroll at 390 and 320, keyboard, and
//   page loads send nothing to the model.
//
// Needs: apps/web on :3003 and apps/va on :3000 with ANTHROPIC_BASE_URL at the
// fake; CLAUDE_LOG, MAIL_DIR, PGURL, SERVICE_KEY; migrations up to 0041; the
// MLS fixtures seeded (FX-001 is one of our own listings).

import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASE, axeAll, check, done, joinAs, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const LOG = process.env.CLAUDE_LOG;
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s5b-design");
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
const isPng = (path) => readFileSync(path).subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

if (sql(`select count(*) from mls_listings where listing_key = 'FX-001' and is_own_listing and standard_status = 'Active'`) !== "1") throw new Error("fixture FX-001 (our own, active) isn't seeded");

// --- What this run changes, to put back -------------------------------------------------------
const FLAGS = ["ai_enabled", "ai_member_palette", "ai_member_staging", "ai_member_flyer"];
const flagsBefore = Object.fromEntries(sql(`select key || '=' || enabled from feature_flags where key in (${FLAGS.map((k) => `'${k}'`).join(",")})`).split("\n").filter(Boolean).map((l) => l.split("=")));
const settingsBefore = sql(`select coalesce(ai_zdr_confirmed_at::text, '') || '|' || ai_daily_tokens_member from app_settings`);
sql(`update feature_flags set enabled = false where key in (${FLAGS.map((k) => `'${k}'`).join(",")})`);
sql(`update app_settings set ai_zdr_confirmed_at = coalesce(ai_zdr_confirmed_at, now()), ai_daily_tokens_member = 100000000`);
const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);
const OH_DATE = sql(`select (current_date + 6)::text`);
const OH_KEY = `QA-OH-${stamp}`;
// A QA-only open house for FX-001, 10:00-12:00 Pacific.
sql(`insert into mls_open_houses (open_house_key, listing_key, open_house_date, start_time, end_time, open_house_type) values ('${OH_KEY}', 'FX-001', '${OH_DATE}', ('${OH_DATE} 10:00'::timestamp at time zone 'America/Los_Angeles'), ('${OH_DATE} 12:00'::timestamp at time zone 'America/Los_Angeles'), 'Public')`);
const fx001 = sql(`select data->>'UnparsedAddress' from mls_listings where listing_key = 'FX-001'`);

let dialogs = 0;
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const p = await ctx.newPage();
  p.on("dialog", (d) => {
    // Only our own "Delete …?" confirmations are expected; anything else would be injected script.
    if (!/^Delete "/.test(d.message())) dialogs++;
    d.accept();
  });
  return p;
};
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
const seller = await newPage();
const sellerEmail = `sam.${stamp}@example.test`;
await joinAs(seller, { email: sellerEmail, name: "Sam Example", role: "seller" });
const sam = sql(`select id from profiles where email = '${sellerEmail}'`);
sql(`update profiles set agent_id = '${mark}' where id = '${sam}'`);
const buyer = await newPage();
const buyerEmail = `jordan.${stamp}@example.test`;
await joinAs(buyer, { email: buyerEmail, name: "Jordan Example", role: "buyer" });
const jordan = sql(`select id from profiles where email = '${buyerEmail}'`);
sql(`update profiles set agent_id = '${mark}' where id = '${jordan}'`);

// --- 1. Off by default -------------------------------------------------------------------------
const callsAtStart = memberCalls();
await seller.goto(`${BASE}/my/assistant`);
check("off: no design modes, no My flyers", (await seller.getByText("Colors and moodboard", { exact: true }).count()) === 0 && (await seller.getByRole("link", { name: "My flyers" }).count()) === 0);

// --- 2. The console switches -------------------------------------------------------------------
const staff = await newPage();
await staff.goto(`${VA}/login`);
await staff.getByPlaceholder("you@vabrato.com").fill(STAFF_EMAIL);
const m = mails();
await staff.getByRole("button", { name: "Email me a sign-in link" }).click();
await staff.getByText(/Check your email/).waitFor();
await staff.goto(await linkFor(STAFF_EMAIL, m));
await staff.waitForURL(`${VA}/`, { timeout: 15000 });
await staff.goto(`${VA}/assistant`);
for (const name of ["Colors and moodboard", "Staging ideas", "Open-house flyer and posts"]) {
  await staff.getByRole("button", { name: `Turn on: ${name} (members)` }).click();
  await staff.getByRole("button", { name: `Turn off: ${name} (members)` }).waitFor({ timeout: 15000 });
}
sql(`update feature_flags set enabled = true where key = 'ai_enabled'`);
check("console: the three switches on, without the MLSListings approval", sql(`select count(*) from feature_flags where key in ('ai_member_palette', 'ai_member_staging', 'ai_member_flyer') and enabled`) === "3" && sql(`select enabled from feature_flags where key = 'ai_mls_approved'`) === "f");

// --- 3. A buyer's palette ----------------------------------------------------------------------
await buyer.goto(`${BASE}/my/assistant?mode=palette`);
check("buyer: palette only (no staging or flyer modes)", (await buyer.getByText("Staging ideas", { exact: true }).count()) === 0 && (await buyer.getByText("Open-house flyer and posts", { exact: true }).count()) === 0);
const NOTES = "QA-MODE: ok North-facing living room with oak floors; warmer and calmer. Email me at jordan@example.test";
let card = await run(buyer, "Colors and moodboard", () => buyer.getByLabel("The room or the look you want").fill(NOTES), "Make the palette");
check("palette: drawn by our code as images, with the colors as text too", (await card.getByRole("heading", { name: "Your palette" }).isVisible()) && (await card.getByRole("img", { name: /^Palette swatches: Warm white \(#F5F0E6, walls\)/ }).isVisible()) && (await card.getByRole("img", { name: /^Moodboard tiles: Oak floor/ }).isVisible()) && (await card.getByRole("list", { name: "Palette colors" }).getByRole("listitem").count()) === 4);
check("palette: labelled an AI concept for planning", (await card.getByText("AI concept · for planning only").isVisible()) && (await card.getByText(/Screen colors vary/).isVisible()));
check("palette: images are data URLs of SVG, not markup in the page", (await card.locator("svg rect, svg text").count()) === 0 && (await card.locator("img[src^='data:image/svg+xml']").count()) === 2);
let e = last("member_palette");
check("palette: only the notes sent (email removed)", e && !e.requestHasEmail && !e.requestHasPhone && e.format === "json_schema", JSON.stringify(e));
let download = buyer.waitForEvent("download");
await card.getByRole("button", { name: "Download PNG" }).click();
let dl = await download;
check("palette: PNG download", dl.suggestedFilename() === "light-and-warm.png" && isPng(await dl.path()));
await axeAll(buyer, "/my/assistant (palette)");
for (const width of [390, 320]) {
  const w = await sideScroll(buyer, width);
  check(`/my/assistant (palette): no sideways scroll @${width}`, w <= width, `${w}px`);
}
await shot(buyer, "palette");
card = await run(buyer, "Colors and moodboard", () => buyer.getByLabel("The room or the look you want").fill("QA-MODE: badhex a kitchen"), "Make the palette");
check("palette: bad colors are never drawn", (await card.getByText(/palette didn't come through/).isVisible()) && !(await buyer.content()).includes("javascript:x"));
card = await run(buyer, "Colors and moodboard", () => buyer.getByLabel("The room or the look you want").fill("QA-MODE: script a bedroom"), "Make the palette");
const scriptHtml = await buyer.content();
check("palette: markup in the answer stays text (no script runs)", (await card.getByRole("heading", { name: "Your palette" }).isVisible()) && !scriptHtml.includes('<script>alert("x")') && !/<img src="?x"? onerror/.test(scriptHtml) && dialogs === 0);
card = await run(buyer, "Colors and moodboard", () => buyer.getByLabel("The room or the look you want").fill("QA-MODE: steering a den"), "Make the palette");
check("palette: Fair Housing wording isn't shown", (await card.getByText(/Fair Housing/).isVisible()) && !(await buyer.content()).includes("young family"));

// --- 4. A seller's staging ideas ---------------------------------------------------------------
await seller.goto(`${BASE}/my/assistant?mode=staging`);
card = await run(
  seller,
  "Staging ideas",
  async () => {
    await seller.getByLabel("Which room").selectOption("living");
    await seller.getByLabel("Describe the room").fill("QA-MODE: ok Small living room, dark corners, a big sectional.");
  },
  "Get ideas",
);
check("staging: ideas by section, for planning only", (await card.getByRole("heading", { name: "Staging ideas: Living room" }).isVisible()) && (await card.getByRole("heading", { name: "Remove or store" }).isVisible()) && (await card.getByText(/listing photos must show the real home/i).first().isVisible()));
e = last("member_staging");
check("staging: the room type and notes sent, nothing else", e && e.dataBlocks === 1 && e.images === 0 && !e.requestHasListingData && e.requestListingKeys.length === 0, JSON.stringify(e));
await card.getByRole("checkbox").first().check();
await card.getByRole("button", { name: "Add to my to-dos" }).click();
await card.getByText(/^Added 1 to-do/).waitFor({ timeout: 10000 });
check("staging: a to-do waits for the agent", sql(`select count(*) from member_todos where profile_id = '${sam}' and status = 'pending' and source_name = 'Staging ideas: Living room'`) === "1");
await shot(seller, "staging");
card = await run(seller, "Staging ideas", () => seller.getByLabel("Describe the room").fill("QA-MODE: money a bedroom"), "Get ideas");
check("staging: an idea with a cost is left out", (await card.getByText(/mentioned costs or value and were left out/).isVisible()) && !(await card.textContent()).includes("$400"));

// --- 5. A seller's flyer -----------------------------------------------------------------------
await seller.goto(`${BASE}/my/assistant?mode=flyer`);
let before = memberCalls();
card = await run(seller, "Open-house flyer and posts", () => seller.getByLabel("What do you love about your home?").fill("Perfect for a young family in a safe neighborhood."), "Write the flyer");
check("flyer: Fair Housing wording in the notes is refused unsent", (await card.getByText(/Fair Housing/).isVisible()) && memberCalls() === before);
card = await run(seller, "Open-house flyer and posts", () => seller.getByLabel("What do you love about your home?").fill("QA-MODE: ok Morning light in the kitchen, a big yard with a lemon tree, a new roof."), "Write the flyer");
check("flyer: headline, highlights and posts to edit", (await card.getByRole("heading", { name: "Your flyer and posts" }).isVisible()) && (await card.getByLabel("Headline").inputValue()) === "Sunny home with a garden" && (await card.getByLabel("Instagram post").inputValue()).includes("#OpenHouse"));
e = last("member_flyer");
check("flyer: only the seller's words sent (no listing data, keys, address or price)", e && !e.requestHasListingData && e.requestListingKeys.length === 0 && !JSON.stringify(e).includes(fx001), JSON.stringify(e));
await axeAll(seller, "/my/assistant (flyer)");
for (const width of [390, 320]) {
  const w = await sideScroll(seller, width);
  check(`/my/assistant (flyer): no sideways scroll @${width}`, w <= width, `${w}px`);
}
await shot(seller, "flyer-draft");
// Edited, then checked again when sent.
const blurb = card.getByLabel("About the home");
const goodBlurb = await blurb.inputValue();
await blurb.fill("Priced at $1.9M, a steal.");
await card.getByRole("button", { name: "Send to my agent for approval" }).click();
await card.getByRole("alert").waitFor({ timeout: 10000 });
check("flyer: an edit with a price is refused when sent", (await card.getByRole("alert").textContent()).includes("price") && sql(`select count(*) from member_promos where profile_id = '${sam}'`) === "0");
await blurb.fill(goodBlurb);
await card.getByLabel("Headline").fill("Sunny home with a lemon tree");
await card.getByRole("button", { name: "Send to my agent for approval" }).click();
await card.getByText(/^Sent to your agent/).waitFor({ timeout: 10000 });
check("flyer: sent with the edit, waiting; the agent gets one bell alert", sql(`select headline || '|' || status from member_promos where profile_id = '${sam}'`) === "Sunny home with a lemon tree|pending" && sql(`select count(*) from staff_notifications where kind = 'member_promo' and recipient_id = '${mark}' and ref_id = '${sam}'`) === "1");
card = await run(seller, "Open-house flyer and posts", () => seller.getByLabel("What do you love about your home?").fill("QA-MODE: value a home"), "Write the flyer");
check("flyer: value talk in the answer isn't shown", (await card.getByText(/doesn't give price or value opinions/).isVisible()) && !(await card.textContent()).includes("undervalued"));
card = await run(seller, "Open-house flyer and posts", () => seller.getByLabel("What do you love about your home?").fill("QA-MODE: contacts a home"), "Write the flyer");
const fb = await card.getByLabel("Facebook post").inputValue();
check("flyer: phone numbers and links are removed", !fb.includes("650-555-0142") && !fb.includes("example.test") && fb.length > 0, fb);
card = await run(seller, "Open-house flyer and posts", () => seller.getByLabel("What do you love about your home?").fill("QA-MODE: script a home"), "Write the flyer");
check("flyer: markup stays text", (await card.getByLabel("Headline").inputValue()).includes("<script>") && !(await seller.content()).includes('<script>alert("x")') && dialogs === 0);
// A second flyer ("just listed") for the agent to decline.
card = await run(
  seller,
  "Open-house flyer and posts",
  async () => {
    await seller.getByLabel("The flyer is for").selectOption("just_listed");
    await seller.getByLabel("What do you love about your home?").fill("QA-MODE: ok the yard");
  },
  "Write the flyer",
);
await card.getByLabel("Headline").fill("Just listed: a home with a yard");
await card.getByRole("button", { name: "Send to my agent for approval" }).click();
await card.getByText(/^Sent to your agent/).waitFor({ timeout: 10000 });

await seller.goto(`${BASE}/my/flyers`);
check("my flyers: both waiting for the agent", (await seller.getByText("Waiting for your agent", { exact: true }).count()) === 2 && (await seller.getByRole("link", { name: "My flyers" }).count()) === 1);
await axeAll(seller, "/my/flyers");

// --- 6. The agent decides ----------------------------------------------------------------------
await staff.goto(`${VA}/members/${sam}`);
check("console: both flyers waiting, with the member's words", (await staff.getByRole("heading", { name: "Flyers waiting" }).isVisible()) && (await staff.getByText("Sunny home with a lemon tree").isVisible()));
const approveForm = staff.locator("form").filter({ has: staff.getByRole("button", { name: "Approve the flyer: Sunny home with a lemon tree" }) });
await approveForm.getByLabel("Our listing").selectOption("FX-001");
await approveForm.getByLabel("Open house (optional)").selectOption(OH_KEY);
await approveForm.getByRole("button", { name: "Approve the flyer: Sunny home with a lemon tree" }).click();
// Once decided, the flyer leaves the waiting list (and its form with it).
await staff.getByRole("button", { name: "Approve the flyer: Sunny home with a lemon tree" }).waitFor({ state: "detached", timeout: 15000 });
check("console: approved with our listing and its open house", sql(`select status || '|' || listing_key || '|' || open_house_key || '|' || decided_by from member_promos where profile_id = '${sam}' and kind = 'open_house'`) === `approved|FX-001|${OH_KEY}|${mark}`);
const declineForm = staff.locator("form").filter({ has: staff.getByRole("button", { name: "Decline the flyer: Just listed: a home with a yard" }) });
await declineForm.getByLabel("Note to the member (optional)").fill("Let's wait until the photos are in.");
await declineForm.getByRole("button", { name: "Decline the flyer: Just listed: a home with a yard" }).click();
await staff.getByRole("button", { name: "Decline the flyer: Just listed: a home with a yard" }).waitFor({ state: "detached", timeout: 15000 });
check("console: declined with a note (audited)", sql(`select count(*) from staff_audit where action in ('approve_member_promo', 'decline_member_promo') and detail->>'member' = '${sam}'`) === "2");
await axeAll(staff, "console /members/[id] (flyers)");

// --- 7. The approved flyer --------------------------------------------------------------------
await seller.goto(`${BASE}/my/flyers`);
check("my flyers: the agent's note on the declined one", (await seller.getByText("Let's wait until the photos are in.").isVisible()) && (await seller.getByText("Approved", { exact: true }).isVisible()));
await seller.getByRole("link", { name: "Open the flyer: Sunny home with a lemon tree" }).click();
await seller.getByRole("article", { name: "Flyer" }).waitFor({ timeout: 15000 });
const flyerText = await seller.getByRole("article", { name: "Flyer" }).textContent();
check("flyer: the seller's approved words", flyerText.includes("Sunny home with a lemon tree") && flyerText.includes("Big back yard with a lemon tree"));
check("flyer: facts from our records (address, price, rooms)", flyerText.includes(fx001) && /\$[\d,]+/.test(flyerText) && /bedrooms/.test(flyerText), flyerText.slice(0, 300));
check("flyer: the open house in Pacific time", /Open house: [A-Z][a-z]+day, [A-Z][a-z]{2} \d{1,2} · 10:00 AM–12:00 PM/.test(flyerText), flyerText);
check("flyer: the agent's card, the brokerage DRE and Equal Housing", flyerText.includes("Mark Martinho") && flyerText.includes("DRE #02142060") && flyerText.includes("Equal Housing Opportunity"));
const post = (await seller.getByText(/Open house this weekend!/).first().textContent()) ?? "";
check("posts: the brokerage line added by our code", post.trim().endsWith("Vabrato Real Estate Services · DRE #02142060"));
await seller.getByRole("button", { name: "Copy the Instagram post" }).click();
await seller.getByText("Copied.").waitFor({ timeout: 5000 });
check("posts: copied with the brokerage line", (await seller.evaluate(() => navigator.clipboard.readText())).includes("DRE #02142060"));
download = seller.waitForEvent("download");
await seller.getByRole("button", { name: "Download the post image (PNG)" }).click();
dl = await download;
check("post image: an 'Open house' PNG, no photo", dl.suggestedFilename() === "open-house.png" && isPng(await dl.path()) && (await seller.getByRole("img", { name: /^Post graphic: Open house in San Carlos/ }).isVisible()));
await axeAll(seller, "/my/flyers/[id]");
for (const width of [390, 320]) {
  const w = await sideScroll(seller, width);
  check(`/my/flyers/[id]: no sideways scroll @${width}`, w <= width, `${w}px`);
}
await shot(seller, "flyer-approved");
await seller.emulateMedia({ media: "print" });
check("print: only the flyer (posts and the menu hidden)", (await seller.getByRole("article", { name: "Flyer" }).isVisible()) && !(await seller.getByRole("heading", { name: "Posts" }).isVisible()) && !(await seller.getByRole("button", { name: "Print the flyer" }).isVisible()));
await seller.emulateMedia({ media: "screen" });

// A buyer can't open a seller's flyer, or the page.
const id = sql(`select id from member_promos where profile_id = '${sam}' and status = 'approved'`);
const r = await buyer.goto(`${BASE}/my/flyers/${id}`);
check("a buyer can't open someone's flyer", r.status() === 404);

// Keyboard: the flyer kind, the notes, then the button.
await seller.goto(`${BASE}/my/assistant?mode=flyer`);
await seller.getByLabel("What do you love about your home?").fill("The yard");
await seller.getByLabel("The flyer is for").focus();
const order = [];
for (let i = 0; i < 2; i++) {
  await seller.keyboard.press("Tab");
  order.push(await seller.evaluate(() => document.activeElement?.labels?.[0]?.textContent?.trim() ?? document.activeElement?.textContent?.trim()));
}
check("keyboard: flyer kind → notes → Write the flyer", JSON.stringify(order) === JSON.stringify(["What do you love about your home?", "Write the flyer"]), JSON.stringify(order));

// --- 8. Page loads send nothing ------------------------------------------------------------------
before = memberCalls();
for (const p of ["/my/assistant", "/my/assistant?mode=flyer", "/my/flyers", `/my/flyers/${id}`]) await seller.goto(`${BASE}${p}`);
check("page loads send nothing to the model", memberCalls() === before);
check("model calls: only the asks that should send", memberCalls() - callsAtStart === 11, String(memberCalls() - callsAtStart));

// --- Clean up and put everything back -----------------------------------------------------------
await browser.close();
sql(`delete from mls_open_houses where open_house_key = '${OH_KEY}'`);
for (const k of FLAGS) sql(`update feature_flags set enabled = ${flagsBefore[k] === "true"} where key = '${k}'`);
const [zdr, tokens] = settingsBefore.split("|");
sql(`update app_settings set ai_zdr_confirmed_at = ${zdr ? `'${zdr}'` : "null"}, ai_daily_tokens_member = ${tokens}`);
sql(`delete from staff_notifications where kind in ('member_todo', 'member_promo') and ref_id in ('${sam}', '${jordan}')`);
sql(`delete from staff_audit where action in ('approve_member_promo', 'decline_member_promo') and detail->>'member' = '${sam}'`);
sql(`delete from auth.users where email like '%.${stamp}@example.test'`);
check("cleanup: switches back as they were", sql(`select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in (${FLAGS.map((k) => `'${k}'`).join(",")})`) === FLAGS.slice().sort().map((k) => `${k}=${flagsBefore[k]}`).join(","));
check("cleanup: members, flyers, to-dos and the open house", sql(`select count(*) from profiles where email like '%.${stamp}@example.test'`) === "0" && sql(`select count(*) from member_promos where profile_id in ('${sam}', '${jordan}')`) === "0" && sql(`select count(*) from mls_open_houses where open_house_key = '${OH_KEY}'`) === "0");
done();
