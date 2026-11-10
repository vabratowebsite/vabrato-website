// S5 PR 4 end-to-end check: homes I'm pursuing, a signed-in tour request,
// messages with the agent console (apps/va on :3000) including tour
// confirmation and the buyer agreement, and the documents page (uploads need
// Supabase Storage, which the local stack doesn't run; checked on the
// preview). Same local stack as s5-auth-flow.mjs. Fictional people only.

import { BASE, axeAll, check, done, joinAs, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const email = `morgan.${stamp}@example.test`;
const NAME = `Morgan Example ${stamp}`;

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await joinAs(page, { email, name: NAME });
const me = sql(`select id from profiles where email = '${email}'`);
const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);
sql(`update profiles set agent_id = '${mark}' where id = '${me}'`);
const key = sql(`select listing_key from mls_listings where standard_status = 'Active' and address_display order by listing_key limit 1`);
sql(`insert into saved_homes (profile_id, listing_key) values ('${me}', '${key}')`);

// 1. Homes I'm pursuing: track a saved home and a typed address; move one along the ladder.
await page.goto(`${BASE}/my/buyer`);
await page.getByLabel("Track one of your saved homes").selectOption(key);
await page.getByRole("button", { name: "Track this home" }).click();
await page.waitForFunction(() => document.querySelector('a[href^="/my/pursuing/"]'));
check("saved home is tracked with its listing", sql(`select listing_key from tracked_properties where buyer_id = '${me}'`) === key);
await page.getByLabel("Or enter any address").fill("12 Fictional Ave, Belmont");
await page.getByRole("button", { name: "Track a property" }).click();
await page.getByRole("link", { name: "12 Fictional Ave, Belmont" }).waitFor();
check("typed address is tracked", sql(`select count(*) from tracked_properties where buyer_id = '${me}'`) === "2");
await axeAll(page, "/my/buyer with pursuing");
await page.getByRole("link", { name: "12 Fictional Ave, Belmont" }).click();
await page.waitForURL(/\/my\/pursuing\//);
await page.getByRole("button", { name: "Toured" }).click();
await page.waitForFunction(() => document.querySelector('button[aria-pressed="true"]')?.textContent === "Toured");
check("status moves along the ladder", sql(`select status from tracked_properties where buyer_id = '${me}' and listing_key is null`) === "toured");
await axeAll(page, "/my/pursuing/[id]");
await page.getByRole("button", { name: "Stop tracking this home" }).click();
await page.waitForURL(/\/my\/buyer$/);
check("stop tracking removes it", sql(`select count(*) from tracked_properties where buyer_id = '${me}'`) === "1");

// 2. A signed-in tour request is linked to the account and never auto-confirmed.
await page.goto(`${BASE}/listing/${key}/x`);
await page.getByLabel("Email (required)").fill(email);
await page.getByRole("button", { name: "Request tour" }).click();
await page.getByText(/An agent will confirm your tour time/).waitFor();
check("tour request is linked to the member", sql(`select count(*) from leads where profile_id = '${me}' and kind = 'tour'`) === "1");
check("tour request starts as requested", sql(`select tour_status from leads where profile_id = '${me}'`) === "requested");
await page.goto(`${BASE}/my/tours`);
check("tours page shows the request waiting for the agent", await page.getByText("Requested · waiting for your agent to confirm").isVisible());
await axeAll(page, "/my/tours");

// 3. Messages: member writes; the agent console reads, replies, confirms the tour, records the agreement.
await page.goto(`${BASE}/my/messages`);
check("messages page has the wiring banner", (await page.content()).includes("never email you wiring instructions") || (await page.content()).toLowerCase().includes("wiring"));
await page.getByLabel("Message your agent").fill("Hi Mark, <b>can we tour</b> this weekend?\nThanks!");
await page.getByRole("button", { name: "Send" }).click();
await page.getByText("Sent. Your agent will reply here.").waitFor();
check("message is stored as plain text", sql(`select body from messages where member_id = '${me}'`).includes("<b>can we tour</b>"));
check("markup is shown as text, not rendered", (await page.locator("ol li").last().innerText()).includes("<b>can we tour</b>"));
await axeAll(page, "/my/messages");

const staff = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const sp = await staff.newPage();
await sp.goto(`${VA}/login`);
await sp.getByPlaceholder("you@vabrato.com").fill(STAFF_EMAIL);
const before = mails();
await sp.getByRole("button", { name: "Email me a sign-in link" }).click();
await sp.getByText(/Check your email/).waitFor();
await sp.goto(await linkFor(STAFF_EMAIL, before));
await sp.waitForURL(`${VA}/`, { timeout: 15000 });
await sp.goto(`${VA}/messages`);
check("console inbox lists the member with an unread message", await sp.getByRole("link", { name: new RegExp(NAME) }).isVisible() && (await sp.getByRole("link", { name: new RegExp(NAME) }).innerText()).includes("1 unread"));
await sp.getByRole("link", { name: new RegExp(NAME) }).click();
await sp.waitForURL(/\/messages\//);
check("console shows the message as text", (await sp.locator("ol li").first().innerText()).includes("<b>can we tour</b>"));
await sp.getByLabel("Reply").fill("Yes, Saturday at 11 works.");
await sp.getByRole("button", { name: "Send reply" }).click();
await sp.getByText("Yes, Saturday at 11 works.").waitFor();
await sp.getByRole("button", { name: "Confirm" }).click();
await sp.getByText("confirmed").waitFor();
check("staff confirmed the tour", sql(`select tour_status from leads where profile_id = '${me}'`) === "confirmed");
await sp.getByRole("button", { name: "Mark as on file" }).click();
await sp.getByText(/On file since/).waitFor();
check("buyer agreement recorded", sql(`select buyer_agreement_on_file_at is not null from profiles where id = '${me}'`) === "t");

await page.goto(`${BASE}/my/buyer`);
check("member sees 1 unread message in the nav", (await page.locator("aside").getByRole("link", { name: /Messages/ }).innerText()).includes("1"));
await page.goto(`${BASE}/my/messages`);
check("member sees the reply", await page.getByText("Yes, Saturday at 11 works.").isVisible());
await page.goto(`${BASE}/my/buyer`);
check("opening messages clears the badge", !(await page.locator("aside").getByRole("link", { name: /Messages/ }).innerText()).match(/\d/));
await page.goto(`${BASE}/my/tours`);
check("tours page shows Confirmed", await page.getByText("Confirmed", { exact: true }).isVisible());

// 4. Documents page renders with the wiring banner (uploads need Supabase Storage).
await page.goto(`${BASE}/my/documents`);
check("documents page has the upload control and wiring banner", (await page.getByLabel("Upload a document").count()) === 1 && (await page.content()).toLowerCase().includes("wiring"));
await axeAll(page, "/my/documents");

await browser.close();
done();
