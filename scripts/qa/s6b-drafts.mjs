// S6b PR 3 end-to-end check: AI drafts in the console, on the local stack
// with the fake Claude server (fake-claude.mjs): no key, no cost, nothing
// leaves the machine.
//
// - Off by default: no assistant panel on the lead or deal page.
// - Lead reply: the agent writes, edits and approves a draft; steering
//   wording they type in blocks approval; the approved draft is frozen,
//   opens in their own email (mailto) and goes to the member's portal as a
//   message from them; the request carried no email, phone or lockbox text.
// - Open-house follow-up: an answer with wiring details or steering wording
//   is refused and nothing is saved; a draft is discarded.
// - Escrow update: written from the task list (a phone number in a task is
//   redacted), approved, sent to the seller's portal.
// - Vendor quote request: a note with a lockbox code is refused before
//   anything is asked; the draft opens in email to the vendor and copies.
// - Another agent can't open the lead; "My drafts" lists the person's drafts;
//   the 30-day purge; with the switches off the approved drafts stay in the
//   file. axe at 1440 and 390 px on every screen with a draft.
//
// Start: node scripts/qa/fake-claude.mjs <log>; apps/va with
// ANTHROPIC_BASE_URL=http://127.0.0.1:4020 and any ANTHROPIC_API_KEY.
// Needs SERVICE_KEY and CLAUDE_LOG, migration 0028, and the preview seed
// (listing FX-001). Fictional people; the switches are turned off and every
// row it adds is removed at the end.

import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { axeAll, check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const LOG = process.env.CLAUDE_LOG;
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s6b-drafts");
mkdirSync(OUT, { recursive: true });
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

const panel = (page, heading) => page.getByRole("region", { name: heading });
/** Writes a draft in a panel and waits for the outcome. */
async function write(page, heading, note) {
  const p = panel(page, heading);
  if (note !== undefined) await p.getByRole("textbox").last().fill(note);
  await p.getByRole("button", { name: "Write draft" }).click();
  await p.getByRole("alert").or(p.getByRole("status").filter({ hasText: /Draft ready/ })).waitFor({ timeout: 30000 });
  return p;
}
const draftRow = (where) => sql(`select coalesce(string_agg(status || ':' || coalesce(sent_via, '-'), ',' order by created_at), '') from ai_drafts where ${where}`);

// --- Setup ---------------------------------------------------------------------------------------
const settingsBefore = sql(`select coalesce(lead_admin_id::text, '') from app_settings`);
sql(`update feature_flags set enabled = false where key like 'ai\\_%'`);
sql(`update app_settings set ai_monthly_budget_usd = 100, ai_daily_requests_staff = 100`);
sql(`delete from ai_runs`);
const ada = await account("Ada", "admin");
const avery = await account("Avery", "agent");
const blake = await account("Blake", "agent");
const vera = await account("Vera", "va");
const jordan = await account("Jordan", "buyer");
const dana = await account("Dana", "seller");
sql(`update app_settings set ai_zdr_confirmed_at = now(), ai_zdr_confirmed_by = '${ada.id}', ai_zdr_note = 'QA fixture (fictional)', lead_admin_id = '${ada.id}'`);
const ohKey = sql(`select coalesce((select open_house_key from mls_open_houses order by start_time desc limit 1), '')`);
const lead1 = sql(
  `insert into leads (kind, name, email, phone, message, listing_key, payload, profile_id, consent_contact, site) values ('tour', 'Jordan Example', '${jordan.email}', '650-555-0199', 'Is it still available? Call me at (650) 555-0199 or ${jordan.email}. QA-MODE: ok', 'FX-001', '{"tourDate":"Saturday","tourMode":"in_person"}', '${jordan.id}', true, 'vabrato') returning id`,
).split("\n")[0];
const lead2 = sql(
  `insert into leads (kind, name, email, listing_key, payload, site) values ('open_house_signin', 'Riley Example', 'riley.${stamp}@example.test', 'FX-013', '{"open_house_key":"${ohKey}","has_agent":"no"}', 'vabrato') returning id`,
).split("\n")[0];
sql(`update leads set assigned_to = '${avery.id}' where id in ('${lead1}', '${lead2}')`);
const deal = sql(
  `insert into deals (address, seller_name, seller_type, ratification_date, days_to_close, rent_back_days, sale_price, escrow_number, agent_id, created_by) values ('12 Fictional Lane, San Carlos, CA', 'Dana Example', 'normal', '2026-03-02', 30, 0, 2150000, 'QA-ESC-${stamp}', '${vera.id}', '${vera.id}') returning id`,
).split("\n")[0];
sql(`insert into tasks (deal_id, title, owner, phase, offset_days, due_date, done) values
  ('${deal}', 'Open escrow; call Pat at 650-555-0123', 'Escrow', 'after_ratification', 1, '2026-03-03', true),
  ('${deal}', 'Order HOA documents', 'TC', 'after_ratification', 7, '2026-03-09', false),
  ('${deal}', 'Loan contingency removal', 'Buyer', 'after_ratification', 21, '2026-03-23', false)`);
sql(`insert into deal_contingencies (deal_id, kind, offset_days, due_date) values ('${deal}', 'financing', 21, '2026-03-23')`);
sql(`insert into deal_members (deal_id, profile_id, member_role) values ('${deal}', '${dana.id}', 'seller')`);
const vendor = sql(`insert into vendors (name, role, email) values ('QA Termite Co ${stamp}', 'Pest inspection', 'quotes.${stamp}@example.test') returning id`).split("\n")[0];
const flags = (on) => sql(`update feature_flags set enabled = ${on} where key in ('ai_enabled', 'ai_staff_lead_reply', 'ai_staff_open_house_followup', 'ai_staff_escrow_update', 'ai_staff_vendor_request')`);

try {
  // 1. Off by default.
  const av = await signIn(avery.email);
  await av.goto(`${VA}/leads/${lead1}`);
  check("off: no assistant on the lead page", (await av.getByRole("heading", { name: "Assistant" }).count()) === 0);
  const ve = await signIn(vera.email);
  await ve.goto(`${VA}/deals/${deal}`);
  check("off: no assistant on the deal page", (await ve.getByRole("heading", { name: "Assistant" }).count()) === 0);

  flags(true);

  // 2. Lead reply.
  await av.goto(`${VA}/leads/${lead1}`);
  let p = await write(av, "Draft a reply", "Offer Saturday morning for a showing. My cell is 650-555-0142.");
  check("lead reply: a draft is written and saved as the agent's own", (await av.getByLabel("Subject").inputValue()) === "Re: 12 Fictional Lane" && draftRow(`lead_id = '${lead1}' and owner_id = '${avery.id}'`) === "draft:-");
  let req = last();
  check(
    "lead reply: the request had the lead's words as data, and no email, phone or lockbox text",
    req.feature === "lead_reply" && req.dataBlocks >= 2 && !req.requestHasEmail && !req.requestHasPhone && !req.requestHasLockbox && req.documents === 0 && req.tools === 0 && req.format === "json_schema" && req.effort === "medium" && req.hasKey,
    JSON.stringify(req),
  );
  check("lead reply: the draft is labelled for checking", await p.getByText("AI draft: check before you send").isVisible());
  await axeAll(av, "/leads/[id] (draft)");
  await shots(av, "lead-draft");

  const body = await av.getByLabel("Email", { exact: true }).inputValue();
  await av.getByLabel("Email", { exact: true }).fill(`${body}\n\nIt's perfect for young families.`);
  await p.getByRole("button", { name: "Approve" }).click();
  await p.getByRole("alert").waitFor();
  check("lead reply: steering wording the person typed blocks approval", (await p.getByRole("alert").textContent()).includes('reword "perfect for young families"') && draftRow(`lead_id = '${lead1}'`) === "draft:-");
  check("…and their edit isn't lost", (await av.getByLabel("Email", { exact: true }).inputValue()).includes("perfect for young families"));
  await av.getByLabel("Email", { exact: true }).fill(`${body}\n\nP.S. The yard gets afternoon sun.`);
  await p.getByRole("button", { name: "Approve" }).click();
  await p.getByRole("status").filter({ hasText: /Approved/ }).waitFor();
  check("lead reply: approved as edited", sql(`select status || '|' || (body like '%afternoon sun.')::text from ai_drafts where lead_id = '${lead1}'`) === "approved|true");
  check("lead reply: the approved text is read-only", (await av.getByLabel("Email", { exact: true }).getAttribute("readonly")) !== null);
  const href = await p.getByRole("link", { name: "Open in email" }).getAttribute("href");
  check("lead reply: no portal option while the member isn't assigned to this agent", (await p.getByRole("button", { name: "Send as portal message" }).count()) === 0);
  // Jordan becomes Avery's member: now Avery may write to them in the portal.
  sql(`update profiles set agent_id = '${avery.id}' where id = '${jordan.id}'`);
  await av.reload();
  p = panel(av, "Draft a reply");
  check("lead reply: after a reload the approved, unsent draft is still ready to send", (await av.getByLabel("Subject").inputValue()) === "Re: 12 Fictional Lane" && (await p.getByText("Approved by you").isVisible()));
  check("lead reply: 'Open in email' addresses the lead from our records", href.startsWith(`mailto:${jordan.email}?subject=Re%3A%2012%20Fictional%20Lane&body=`) && href.includes("afternoon%20sun."), href.slice(0, 80));
  await p.getByRole("button", { name: "Send as portal message" }).click();
  await p.getByRole("status").filter({ hasText: "Sent as a portal message." }).waitFor();
  check(
    "lead reply: sent to the member's portal as a message from the agent, and the lead shows a first reply",
    sql(`select count(*) from messages where member_id = '${jordan.id}' and sender_id = '${avery.id}' and body like 'Re: 12 Fictional Lane%'`) === "1" &&
      draftRow(`lead_id = '${lead1}'`) === "approved:portal" &&
      sql(`select first_reply_at is not null from leads where id = '${lead1}'`) === "t",
  );
  await av.reload();
  check("lead reply: the approved draft is kept with the lead", await av.getByRole("region", { name: "Approved drafts" }).getByText(/Lead reply · approved by You/).isVisible());
  await axeAll(av, "/leads/[id] (approved)");
  await shots(av, "lead-approved");

  const bl = await signIn(blake.email);
  const res = await bl.goto(`${VA}/leads/${lead1}`);
  check("another agent can't open the lead or its drafts", res.status() === 404);
  await bl.context().close();

  // 3. Open-house follow-up: answers that are refused, then a discard.
  await av.goto(`${VA}/leads/${lead2}`);
  const runsBefore = Number(sql(`select count(*) from ai_drafts`));
  p = await write(av, "Draft a follow-up", "QA-MODE: wiring");
  check("follow-up: an answer with wiring details isn't shown or saved", (await p.getByRole("alert").textContent()).includes("payment or wiring") && Number(sql(`select count(*) from ai_drafts`)) === runsBefore);
  p = await write(av, "Draft a follow-up", "QA-MODE: steering");
  check("follow-up: an answer with steering wording isn't shown or saved", /Fair Housing|wording/i.test(await p.getByRole("alert").textContent()) && Number(sql(`select count(*) from ai_drafts`)) === runsBefore);
  p = await write(av, "Draft a follow-up", "");
  check("follow-up: written for the open-house visitor", (await av.getByLabel("Subject").inputValue()) === "Thanks for visiting 12 Fictional Lane" && last().feature === "open_house_followup");
  await p.getByRole("button", { name: "Discard" }).click();
  await p.getByRole("status").filter({ hasText: /Discarded/ }).waitFor();
  check("follow-up: discarded, and the panel offers a new one", draftRow(`lead_id = '${lead2}'`) === "discarded:-" && (await p.getByText("The last draft was discarded.").isVisible()));
  check("the usage log recorded how each request ended, with no content", sql(`select string_agg(status, ',' order by created_at) from ai_runs where feature = 'staff_open_house_followup'`) === "blocked_output,blocked_output,ok");

  // 4. Escrow update.
  await ve.goto(`${VA}/deals/${deal}`);
  p = await write(ve, "Draft an escrow update");
  req = last();
  check("escrow update: written from the task list; the phone in a task never reached the model", req.feature === "escrow_update" && !req.requestHasPhone && !req.requestHasEmail && req.dataBlocks === 1, JSON.stringify(req));
  check("escrow update: no price or escrow number in the request", !req.requestHasLongNumber && sql(`select count(*) from ai_runs where feature = 'staff_escrow_update' and deal_id = '${deal}'`) === "1");
  await axeAll(ve, "/deals/[id] (drafts)");
  await shots(ve, "deal-drafts");
  await p.getByRole("button", { name: "Approve" }).click();
  await p.getByRole("status").filter({ hasText: /Approved/ }).waitFor();
  check("escrow update: 'Open in email' goes to the seller", (await p.getByRole("link", { name: "Open in email" }).getAttribute("href")).startsWith(`mailto:${dana.email}?`));
  await p.getByRole("button", { name: "Send as portal message" }).click();
  await p.getByRole("status").filter({ hasText: "Sent as a portal message." }).waitFor();
  check("escrow update: in the seller's portal, from the VA", sql(`select count(*) from messages where member_id = '${dana.id}' and sender_id = '${vera.id}' and body like 'Your sale: where things stand%'`) === "1");

  // 5. Vendor quote request.
  p = panel(ve, "Ask a vendor for a quote");
  await p.getByLabel("Vendor").selectOption({ label: `QA Termite Co ${stamp} (Pest inspection)` });
  const askedBefore = asked().length;
  await write(ve, "Ask a vendor for a quote", "Quote for the section 1 items. Lockbox code 1234 on the side gate.");
  check("vendor: a note with a lockbox code is refused before anything is asked", (await p.getByRole("alert").textContent()).includes("Leave lockbox codes") && asked().length === askedBefore);
  await write(ve, "Ask a vendor for a quote", "Quote for the section 1 items in the pest report, before March 20.");
  check("vendor: written for the chosen vendor", last().feature === "vendor_request" && !last().requestHasLockbox && draftRow(`vendor_id = '${vendor}'`) === "draft:-");
  await p.getByRole("button", { name: "Approve" }).click();
  await p.getByRole("status").filter({ hasText: /Approved/ }).waitFor();
  check("vendor: 'Open in email' goes to the vendor; no portal for vendors", (await p.getByRole("link", { name: "Open in email" }).getAttribute("href")).startsWith(`mailto:quotes.${stamp}@example.test?`) && (await p.getByRole("button", { name: "Send as portal message" }).count()) === 0);
  await p.getByRole("button", { name: "Copy" }).click();
  await p.getByRole("status").filter({ hasText: /Copied/ }).waitFor();
  const clip = await ve.evaluate(() => navigator.clipboard.readText());
  check("vendor: copied with the subject first", clip.startsWith("Quote request: 12 Fictional Lane, San Carlos\n\nHi,") && draftRow(`vendor_id = '${vendor}'`) === "approved:copy");
  await ve.reload();
  check("deal: both approved drafts are in the transaction file", (await ve.getByRole("region", { name: "Approved drafts" }).getByRole("listitem").count()) === 2);

  // 6. My drafts.
  await av.goto(`${VA}/assistant`);
  check("My drafts: the agent's approved reply, linked to the lead", await av.getByRole("link", { name: "Re: 12 Fictional Lane" }).isVisible());
  check("My drafts: discarded drafts aren't listed", (await av.getByRole("link", { name: "Thanks for visiting 12 Fictional Lane" }).count()) === 0);
  await axeAll(av, "/assistant (my drafts)");
  await shots(av, "assistant-my-drafts");

  // 7. The 30-day purge.
  sql(`alter table ai_drafts disable trigger ai_drafts_guard; update ai_drafts set discarded_at = now() - interval '31 days', updated_at = now() - interval '31 days' where lead_id = '${lead2}'; alter table ai_drafts enable trigger ai_drafts_guard`);
  check("purge: the old discarded draft is deleted, approved ones stay", sql(`select public.purge_ai_drafts()`) === "1" && draftRow(`lead_id = '${lead2}'`) === "" && draftRow(`lead_id = '${lead1}'`) === "approved:portal");

  // 8. Switched off: no new drafts, the file keeps what was approved.
  flags(false);
  await av.goto(`${VA}/leads/${lead1}`);
  check("off again: no new drafts, approved ones stay with the lead", (await av.getByRole("button", { name: "Write draft" }).count()) === 0 && (await av.getByText("The assistant's lead replies are off.").isVisible()) && (await av.getByRole("region", { name: "Approved drafts" }).isVisible()));
  check("the console called nothing but the Messages endpoint", asked().every((r) => !("unexpected" in r)));
} finally {
  flags(false);
  sql(`update app_settings set ai_zdr_confirmed_at = null, ai_zdr_confirmed_by = null, ai_zdr_note = null, lead_admin_id = ${settingsBefore ? `'${settingsBefore}'` : "null"}`);
  sql(`delete from messages where member_id in ('${jordan.id}', '${dana.id}')`);
  sql(`delete from leads where id in ('${lead1}', '${lead2}'); delete from notifications where dedupe_key like '%${lead1}%' or dedupe_key like '%${lead2}%'`);
  sql(`delete from deals where id = '${deal}'; delete from vendors where id = '${vendor}'; delete from ai_runs`);
  sql(`delete from staff_notifications where recipient_id in ('${ada.id}', '${avery.id}', '${blake.id}', '${vera.id}')`);
  await browser.close();
}
done();
