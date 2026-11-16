// AI test mode before Zero Data Retention (0044), end to end on the local
// stack with the fake Claude server: no key, no cost, fictional people and
// files.
//
// - Off: no assistant anywhere, no test-mode note.
// - An admin turns test mode on in /assistant and adds testers by email.
// - A tester agent: the note on every page; the contract reader at intake with
//   the "fictional contract" note; creates a deal with "Test deal" ticked
//   (badge, can't be changed); "Check this document" and the escrow-update
//   draft work on the test deal and are absent on a real deal; no briefing,
//   no "Ask about your work".
// - A staff member who isn't a tester sees no assistant.
// - Members: a tester buyer gets Ask Vabrato with the note and an answer; a
//   member who isn't a tester gets nothing; the tester seller invited to the
//   test deal sees "Test sale".
// - Test mode off: the assistant is gone again.
// - axe at 1440 and 390 px, no sideways scroll at 390 and 320 px, no console
//   errors. Everything added is removed.
//
// Start: node scripts/qa/fake-claude.mjs <log>; apps/va and apps/web with
// ANTHROPIC_BASE_URL=http://127.0.0.1:4020 and any ANTHROPIC_API_KEY.
// Needs SERVICE_KEY, CLAUDE_LOG, STORAGE_DIR and migration 0044.

import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BASE, axeAll, check, done, joinAs, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const LOG = process.env.CLAUDE_LOG;
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/ai-test-mode");
mkdirSync(OUT, { recursive: true });
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const logLines = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean);
const before = logLines().length;
const asked = () => logLines().slice(before).map((l) => JSON.parse(l));
const errors = [];
const NOTE_STAFF = /AI test mode: use only fictional data/;
const NOTE_MEMBER = /Ask Vabrato test mode: use only made-up details/;
const pdf = (mode, title) => Buffer.from(`%PDF-1.4\n% ${title} (fictional QA file)\n% QA-MODE: ${mode}\n%%EOF\n`);

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

async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 160)}`));
  page.on("dialog", (d) => d.accept());
  return page;
}

async function staffSignIn(email) {
  const page = await context();
  await page.goto(`${VA}/login`);
  await page.getByPlaceholder("you@vabrato.com").fill(email);
  const sent = mails();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText(/Check your email/).waitFor();
  await page.goto(await linkFor(email, sent));
  await page.waitForURL(`${VA}/`, { timeout: 15000 });
  return page;
}

async function member(first, role) {
  const page = await context();
  const email = `${first.toLowerCase()}.${stamp}@example.test`;
  await joinAs(page, { email, name: `${first} Example`, role });
  const id = sql(`select id from profiles where email = '${email}'`);
  sql(`update profiles set onboarded_at = now() where id = '${id}'`);
  return { page, email, id };
}

async function layout(page, label) {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`no sideways scroll: ${label} @${width}`, sw <= width, `scrollWidth ${sw}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function shots(page, name) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: join(OUT, `${name}-${width}.jpg`), fullPage: true, type: "jpeg", quality: 70 });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function waitStatus(page, text) {
  try {
    await page.getByRole("status").filter({ hasText: text }).first().waitFor({ timeout: 30000 });
  } catch {
    throw new Error(`no "${text}"; alerts: ${JSON.stringify(await page.getByRole("alert").allTextContents())}`);
  }
}

// --- Setup ---------------------------------------------------------------------------------------
sql(`update feature_flags set enabled = false where key like 'ai\\_%'`);
sql(`update app_settings set ai_zdr_confirmed_at = null, ai_zdr_confirmed_by = null, ai_zdr_note = null`);
sql(`update profiles set ai_tester = false`);
const ada = await account("Ada", "admin");
const avery = await account("Avery", "agent");
const blake = await account("Blake", "agent");
const jordan = await member("Jordan", "buyer");
const sam = await member("Sam", "buyer");
const riley = await member("Riley", "seller");
const REAL = `${stamp % 1000} Real Fixture Way, Belmont`;
const TEST = `TEST — ${stamp % 1000} Fixture Way, Belmont`;
const realDeal = sql(`insert into deals (address, ratification_date, days_to_close, agent_id, created_by) values ('${REAL}', current_date - 3, 30, '${avery.id}', '${avery.id}') returning id`).split("\n")[0];
const blakeDeal = sql(`insert into deals (address, ratification_date, days_to_close, agent_id, created_by, is_test) values ('TEST — Blake ${stamp % 1000} Way', current_date - 3, 30, '${blake.id}', '${blake.id}', true) returning id`).split("\n")[0];
let testDeal = null;

try {
  const admin = await staffSignIn(ada.email);
  const av = await staffSignIn(avery.email);
  const bl = await staffSignIn(blake.email);

  // --- 1. Off ------------------------------------------------------------------------------------
  await av.goto(`${VA}/deals/${realDeal}/documents`);
  check("off: no Check this document, no test-mode note", (await av.getByRole("button", { name: /^Check this document/ }).count()) === 0 && (await av.getByText(NOTE_STAFF).count()) === 0);
  await av.goto(`${VA}/deals/new`);
  check("off: no contract reader at intake; the Test deal box is there", (await av.getByRole("heading", { name: "Fill in from the contract" }).count()) === 0 && (await av.getByLabel(/Test deal: fictional data only/).isVisible()));

  // --- 2. The admin turns test mode on and adds testers ------------------------------------------
  await admin.goto(`${VA}/assistant`);
  const tm = admin.getByRole("region", { name: "Test mode (before Zero Data Retention)" });
  const panel = (await tm.count()) ? tm : admin.locator("section", { has: admin.getByRole("heading", { name: "Test mode (before Zero Data Retention)" }) });
  check("admin: the Test mode panel, off, no testers", (await panel.getByText("No testers yet.").isVisible()) && (await panel.getByRole("button", { name: "Turn on: AI test mode" }).isVisible()));
  await axeAll(admin, "/assistant (test mode panel)");
  await panel.getByRole("button", { name: "Turn on: AI test mode" }).click();
  await waitStatus(admin, "AI test mode is now on.");
  for (const who of [avery, jordan, riley]) {
    await admin.reload();
    await panel.getByLabel("Email the person signs in with").fill(who.email.toUpperCase());
    await panel.getByRole("button", { name: "Add tester" }).click();
    await waitStatus(admin, `${who.email} can now use AI test mode.`);
  }
  await admin.reload();
  await panel.getByLabel("Email the person signs in with").fill(`nobody.${stamp}@example.test`);
  await panel.getByRole("button", { name: "Add tester" }).click();
  await admin.getByRole("alert").filter({ hasText: "No account uses that email yet" }).first().waitFor({ timeout: 15000 });
  check("admin: an unknown email is explained", true);
  await admin.reload();
  check("admin: three testers listed", (await panel.getByRole("button", { name: /^Remove tester:/ }).count()) === 3);
  check(
    "admin: switch and testers are audited",
    sql(`select count(*) from staff_audit where actor_id = '${ada.id}' and action in ('set_ai_flag', 'set_ai_tester')`) === "4",
  );
  check("admin isn't a tester: no test-mode note for them", (await admin.getByText(NOTE_STAFF).count()) === 0);
  await axeAll(admin, "/assistant (test mode on, testers)");
  await layout(admin, "/assistant");
  await shots(admin, "assistant-admin");

  // --- 3. The tester agent -----------------------------------------------------------------------
  await av.goto(`${VA}/`);
  check("tester: the test-mode note on Today", await av.getByText(NOTE_STAFF).isVisible());
  check("tester: no briefing in test mode", (await av.getByRole("heading", { name: "Your briefing" }).count()) === 0);
  await av.goto(`${VA}/assistant`);
  check("tester: /assistant says Test mode; no Ask about your work", (await av.getByRole("status").filter({ hasText: "AI test mode is on for you" }).count()) === 1 && (await av.getByRole("heading", { name: "Ask about your work" }).count()) === 0);
  await av.goto(`${VA}/deals/new`);
  check("tester: the contract reader with the fictional-contract note", (await av.getByRole("heading", { name: "Fill in from the contract" }).isVisible()) && (await av.getByText(/upload only a fictional contract/).isVisible()));
  await axeAll(av, "/deals/new (test mode)");
  await layout(av, "/deals/new");
  await shots(av, "new-deal");
  await av.getByLabel("Property address (required)").fill(TEST);
  await av.getByLabel("Ratification date (required)").fill(new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10));
  await av.getByLabel("Days to close escrow (required)").fill("30");
  await av.getByLabel(/Test deal: fictional data only/).check();
  await av.getByRole("button", { name: "Create transaction and task list" }).click();
  await av.waitForURL(/\/deals\/[0-9a-f-]{36}$/, { timeout: 20000 });
  testDeal = av.url().split("/").pop();
  check("create: the deal is a test deal", sql(`select is_test from deals where id = '${testDeal}'`) === "t");
  check("deal page: the Test deal badge and note", (await av.getByText("Fictional data only. It stays out of the daily briefing and calendars.").isVisible()));
  check("deal page: the escrow-update draft is offered on the test deal", await av.getByRole("heading", { name: "Draft an escrow update" }).isVisible());
  await axeAll(av, "/deals/[test deal]");
  await layout(av, "/deals/[test deal]");
  await shots(av, "test-deal");
  // The seller is invited to the test deal.
  await av.getByLabel("Seller's email").fill(riley.email);
  await av.getByRole("button", { name: "Give seller access" }).click();
  await av.waitForTimeout(1500);

  // Check this document on the test deal.
  await av.goto(`${VA}/deals/${testDeal}/documents`);
  await av.getByLabel("File (PDF, JPG or PNG, up to 20 MB)").setInputFiles({ name: "Disclosures.pdf", mimeType: "application/pdf", buffer: pdf("ok", "Disclosure packet") });
  await av.getByRole("button", { name: "Upload", exact: true }).click();
  await waitStatus(av, "Filed Disclosures.pdf.");
  await av.reload();
  const callsBefore = asked().length;
  await av.getByRole("button", { name: /^Check\ this\ document\s*: Disclosures\.pdf$/ }).click();
  await waitStatus(av, "Checked. The suggested types are ticked below");
  check("test deal: Check this document reached the (fake) model", asked().slice(callsBefore).some((r) => r.feature === "document_check"));
  check("test deal: the run is logged against the test deal", sql(`select count(*) from ai_runs where feature = 'staff_document_check' and deal_id = '${testDeal}' and status = 'ok'`) === "1");

  // The real deal: nothing.
  await av.goto(`${VA}/deals/${realDeal}`);
  check("real deal: no Test deal note, no escrow-update draft", (await av.getByText("Fictional data only.").count()) === 0 && (await av.getByRole("heading", { name: "Draft an escrow update" }).count()) === 0);
  await av.goto(`${VA}/deals/${realDeal}/documents`);
  check("real deal: no Check this document", (await av.getByRole("button", { name: /^Check this document/ }).count()) === 0);
  await av.goto(`${VA}/deals`);
  check("deals list: the badge on the test deal only", (await av.getByRole("link", { name: new RegExp(TEST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).getByText("Test deal").count()) === 1 && (await av.getByRole("link", { name: new RegExp(REAL) }).getByText("Test deal").count()) === 0);
  check("no real deal reached the model", sql(`select count(*) from ai_runs where deal_id = '${realDeal}'`) === "0");

  // --- 4. A staff member who isn't a tester ------------------------------------------------------
  await bl.goto(`${VA}/deals/${blakeDeal}/documents`);
  check("non-tester: no Check this document even on a test deal, no note", (await bl.getByRole("button", { name: /^Check this document/ }).count()) === 0 && (await bl.getByText(NOTE_STAFF).count()) === 0);
  await bl.goto(`${VA}/deals/new`);
  check("non-tester: no contract reader", (await bl.getByRole("heading", { name: "Fill in from the contract" }).count()) === 0);

  // --- 5. Members --------------------------------------------------------------------------------
  const jp = jordan.page;
  await jp.goto(`${BASE}/my/assistant`);
  check("tester buyer: Ask Vabrato in the menu, with the test-mode note", (await jp.getByRole("link", { name: "Ask Vabrato" }).isVisible()) && (await jp.getByText(NOTE_MEMBER).isVisible()));
  if (await jp.getByRole("radio").count()) await jp.getByText("Explain a term", { exact: true }).click();
  await jp.getByRole("textbox").first().fill("What is a contingency?");
  const memberBefore = asked().length;
  await jp.getByRole("button", { name: "Explain" }).click();
  await jp.locator("ol[aria-label^='Your questions'] > li").first().waitFor({ timeout: 20000 });
  check("tester buyer: Explain a term reached the (fake) model", asked().slice(memberBefore).some((r) => r.feature === "member_explain"));
  check("tester buyer: no listing features in test mode", (await jp.getByText("Compare homes", { exact: true }).count()) === 0);
  await axeAll(jp, "/my/assistant (test mode)");
  await layout(jp, "/my/assistant");
  await shots(jp, "ask-vabrato");

  const sp = sam.page;
  await sp.goto(`${BASE}/my/buyer`);
  check("non-tester member: no Ask Vabrato, no note", (await sp.getByRole("link", { name: "Ask Vabrato" }).count()) === 0 && (await sp.getByText(NOTE_MEMBER).count()) === 0);

  const rp = riley.page;
  await rp.goto(`${BASE}/my/seller`);
  check("tester seller: the test sale is marked", (await rp.getByText("Made-up details, for trying the portal. Nothing here is a real sale.").isVisible()) && (await rp.getByText(NOTE_MEMBER).isVisible()));
  await axeAll(rp, "/my/seller (test sale)");
  await layout(rp, "/my/seller");
  await shots(rp, "seller-test-sale");

  // --- 6. Test mode off --------------------------------------------------------------------------
  await admin.goto(`${VA}/assistant`);
  await panel.getByRole("button", { name: "Turn off: AI test mode" }).click();
  await waitStatus(admin, "AI test mode is now off.");
  await av.goto(`${VA}/deals/${testDeal}/documents`);
  check("off again: no Check this document on the test deal, no note", (await av.getByRole("button", { name: /^Check this document/ }).count()) === 0 && (await av.getByText(NOTE_STAFF).count()) === 0);
  await jp.goto(`${BASE}/my/buyer`);
  check("off again: no Ask Vabrato for the tester buyer", (await jp.getByRole("link", { name: "Ask Vabrato" }).count()) === 0);
  check("the test deal is still a test deal", sql(`select is_test from deals where id = '${testDeal}'`) === "t");

  check("no console errors", errors.length === 0, errors.slice(0, 5).join(" | "));
} finally {
  // --- Clean up ----------------------------------------------------------------------------------
  sql(`update feature_flags set enabled = false where key like 'ai\\_%'`);
  sql(`update profiles set ai_tester = false`);
  const deals = [realDeal, blakeDeal, testDeal].filter(Boolean).map((d) => `'${d}'`).join(",");
  sql(`delete from ai_runs where deal_id in (${deals}) or profile_id in ('${avery.id}', '${jordan.id}', '${riley.id}')`);
  sql(`delete from deals where id in (${deals})`);
  sql(`delete from auth.users where email like '%.${stamp}@example.test'`);
  await browser.close();
}
done();
