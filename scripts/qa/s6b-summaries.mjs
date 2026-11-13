// S6b PR 4 end-to-end check: the daily briefing, the member activity summary
// and questions about your work, on the local stack with the fake Claude
// server (fake-claude.mjs): no key, no cost, nothing leaves the machine.
//
// - Off by default: no briefing on Today, no summary on a member's page, no
//   question box on /assistant.
// - Briefing: written from the person's own records only (an agent's covers
//   their own transaction and lead; the lead admin's covers more), with
//   links from our records; a ref the assistant made up gets no link; no
//   email, phone, price or escrow number reached the model.
// - Questions: an answer with the records it's based on (a made-up ref is
//   dropped); one the records can't answer says so; a steering question is
//   refused before anything is sent; a wiring answer isn't shown.
// - Member summary: activity and the member's last messages (contacts
//   blanked), "AI summary" label.
// - axe at 1440 and 390 px; screenshots. Nothing is stored.
//
// Start: node scripts/qa/fake-claude.mjs <log>; apps/va with
// ANTHROPIC_BASE_URL=http://127.0.0.1:4020 and any ANTHROPIC_API_KEY. Needs
// SERVICE_KEY, CLAUDE_LOG, migration 0029 and the preview seed (FX-001).
// Fictional people; every row it adds is removed and the switches turned off.

import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { axeAll, check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const LOG = process.env.CLAUDE_LOG;
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s6b-summaries");
mkdirSync(OUT, { recursive: true });
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const logLines = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean);
const before = logLines().length;
const asked = () => logLines().slice(before).map((l) => JSON.parse(l));
const last = () => asked().at(-1) ?? {};
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const day = (n) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

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

/**
 * Presses a button and waits for this request's outcome: the ready status, or
 * (when `refused` is given) an alert with that text. Pages have other alerts
 * of their own (the MLS sync banner), so "any alert" isn't enough.
 */
async function press(page, button, ready, refused) {
  await page.getByRole("button", { name: button }).click();
  const target = refused ? page.getByRole("alert").filter({ hasText: refused }) : page.getByRole("status").filter({ hasText: ready });
  try {
    await target.first().waitFor({ timeout: 30000 });
  } catch {
    const alerts = await page.getByRole("alert").allTextContents();
    throw new Error(`"${button}": no ${refused ? `alert matching ${refused}` : `"${ready}"`}; alerts on the page: ${JSON.stringify(alerts)}`);
  }
}
const clean = (r) => !r.requestHasEmail && !r.requestHasPhone && !r.requestHasLongNumber && !r.requestHasLockbox && r.documents === 0 && r.tools === 0 && r.format === "json_schema";

// --- Setup ---------------------------------------------------------------------------------------
const leadAdminBefore = sql(`select coalesce(lead_admin_id::text, '') from app_settings`);
const FLAGS = "('ai_enabled', 'ai_staff_daily_briefing', 'ai_staff_member_summary', 'ai_staff_data_questions')";
sql(`update feature_flags set enabled = false where key like 'ai\\_%'`);
sql(`update app_settings set ai_monthly_budget_usd = 100, ai_daily_requests_staff = 100`);
sql(`delete from ai_runs`);
const ada = await account("Ada", "admin");
const avery = await account("Avery", "agent");
const vera = await account("Vera", "va");
const jordan = await account("Jordan", "buyer");
sql(`update profiles set agent_id = '${avery.id}' where id = '${jordan.id}'`);
sql(`update app_settings set ai_zdr_confirmed_at = now(), ai_zdr_confirmed_by = '${ada.id}', ai_zdr_note = 'QA fixture (fictional)', lead_admin_id = '${ada.id}'`);
const one = (q) => sql(q).split("\n")[0];
const dealA = one(`insert into deals (address, seller_type, ratification_date, days_to_close, rent_back_days, sale_price, escrow_number, agent_id, created_by) values ('12 Fictional Lane, San Carlos, CA', 'normal', '${day(-18)}', 30, 0, 2150000, 'QA-ESC-${stamp}', '${avery.id}', '${avery.id}') returning id`);
const dealB = one(`insert into deals (address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by) values ('77 Fictional Court, Belmont, CA', 'normal', '${day(-5)}', 45, 0, '${vera.id}', '${vera.id}') returning id`);
sql(`insert into tasks (deal_id, title, owner, phase, offset_days, due_date, done) values
  ('${dealA}', 'Order HOA documents; call Pat at 650-555-0123', 'TC', 'after_ratification', 7, '${day(-2)}', false),
  ('${dealA}', 'Final walk-through', 'Agent', 'closing_week', 29, '${day(11)}', false),
  ('${dealB}', 'Order title report', 'Escrow', 'after_ratification', 3, '${day(1)}', false)`);
sql(`insert into deal_contingencies (deal_id, kind, offset_days, due_date) values ('${dealA}', 'financing', 21, '${day(3)}')`);
const leadA = one(`insert into leads (kind, name, email, phone, message, listing_key, profile_id, site) values ('tour', 'Jordan Example', '${jordan.email}', '650-555-0199', 'Saturday?', 'FX-001', '${jordan.id}', 'vabrato') returning id`);
const leadB = one(`insert into leads (kind, name, email, site) values ('contact', 'Riley Example', 'riley.${stamp}@example.test', 'vabrato') returning id`);
sql(`update leads set assigned_to = '${avery.id}' where id = '${leadA}'; update leads set assigned_to = '${vera.id}' where id = '${leadB}'`);
sql(`insert into messages (member_id, sender_id, body) values ('${jordan.id}', '${jordan.id}', 'Can we see FX-001 on Saturday? Call me on 650-555-0199 or ${jordan.email}.')`);
sql(`insert into saved_homes (profile_id, listing_key) values ('${jordan.id}', 'FX-001') on conflict do nothing`);
const flags = (on) => sql(`update feature_flags set enabled = ${on} where key in ${FLAGS}`);

try {
  // 1. Off by default.
  const av = await signIn(avery.email);
  check("off: no briefing on Today", (await av.getByRole("heading", { name: "Your briefing" }).count()) === 0);
  await av.goto(`${VA}/members/${jordan.id}`);
  check("off: no summary on the member page", (await av.getByRole("button", { name: "Summarize activity" }).count()) === 0);
  await av.goto(`${VA}/assistant`);
  check("off: no question box on /assistant", (await av.getByRole("heading", { name: "Ask about your work" }).count()) === 0);

  flags(true);

  // 2. The agent's briefing: their own work only.
  await av.goto(`${VA}/`);
  await press(av, "Write my briefing", "Briefing ready.");
  let req = last();
  check("briefing: written from the agent's own records only", req.feature === "daily_briefing" && req.refsSent.D === 1 && req.refsSent.L === 1 && req.refsSent.M === 1 && req.refsSent.T >= 1, JSON.stringify(req.refsSent));
  check("briefing: no email, phone, price or escrow number reached the model; records as data", clean(req) && req.dataBlocks === 5 && req.effort === "low", JSON.stringify(req));
  check("briefing: the headline", await av.getByText("A busy day: one overdue task and a lead waiting for a reply.").isVisible());
  check("briefing: an item links to its transaction", (await av.getByRole("link", { name: "Order the HOA documents: overdue." }).getAttribute("href")) === `/deals/${dealA}`);
  check("briefing: a ref typed into the text is removed, and the lead links to its page", (await av.getByRole("link", { name: "Jordan asked for a tour and hasn't had a reply." }).getAttribute("href")) === `/leads/${leadA}`);
  check("briefing: a record the assistant made up gets no link", (await av.getByText("Something the assistant made up.").isVisible()) && (await av.getByRole("link", { name: "Something the assistant made up." }).count()) === 0);
  check("briefing: Vera's transaction isn't in Avery's briefing", (await av.getByText(/77 Fictional Court/).count()) === 0);
  await axeAll(av, "/ (briefing)");
  // WCAG 1.4.10 Reflow: Today (briefing, missing documents, newest leads, MLS
  // feed, automations) fits phone width; the leads table scrolls in its own region.
  for (const width of [390, 320]) {
    await av.setViewportSize({ width, height: 900 });
    const sideScroll = await av.evaluate(() => document.documentElement.scrollWidth);
    check(`Today at ${width} px: no sideways scrolling`, sideScroll <= width, `${sideScroll}px`);
  }
  const leadsRegion = av.getByRole("region", { name: "Newest leads table" });
  check("Today: the leads table scrolls in a labelled region a keyboard can reach", (await leadsRegion.getAttribute("tabindex")) === "0");
  await av.setViewportSize({ width: 1440, height: 900 });
  await shots(av, "today-briefing");

  // 3. The lead admin's briefing covers more.
  const ad = await signIn(ada.email);
  await press(ad, "Write my briefing", "Briefing ready.");
  req = last();
  check("briefing: the admin's covers more transactions and leads", req.refsSent.D >= 2 && req.refsSent.L >= 2, JSON.stringify(req.refsSent));
  await ad.context().close();

  // 4. Questions about your work.
  await av.goto(`${VA}/assistant`);
  const q = av.getByLabel("Your question");
  await q.fill("Which of my deals close this month?");
  await press(av, "Ask", "Answer ready.");
  req = last();
  check("question: answered from the agent's records, at medium effort", req.feature === "data_questions" && req.refsSent.D === 1 && req.effort === "medium" && clean(req), JSON.stringify(req));
  check("question: the answer, with the record it's based on", (await av.getByText("You have 1 active transaction(s) and 1 lead(s) in your records.").isVisible()) && (await av.getByRole("link", { name: "Transaction: 12 Fictional Lane, San Carlos, CA" }).getAttribute("href")) === `/deals/${dealA}`);
  check("question: a made-up ref is dropped", (await av.getByRole("region", { name: "Based on" }).getByRole("link").count()) === 1);
  await axeAll(av, "/assistant (answer)");
  await shots(av, "assistant-question");
  await q.fill("How is the market in San Carlos?");
  await press(av, "Ask", "Answer ready.");
  check("question: one the records can't answer says so", await av.getByText("Your records here don't hold the answer to that.").isVisible());
  const n = asked().length;
  await q.fill("Which listings are perfect for young families?");
  await press(av, "Ask", null, /Fair Housing|can't help/i);
  check("question: a steering question is refused before anything is sent", asked().length === n);
  await q.fill("What's overdue? QA-MODE: wiring");
  await press(av, "Ask", null, "payment or wiring");
  check("question: an answer with wiring details isn't shown", (await av.getByText("You have 1 active transaction(s)").count()) === 0);

  // 5. Member activity summary.
  await av.goto(`${VA}/members/${jordan.id}`);
  await press(av, "Summarize activity", "Summary ready.");
  req = last();
  // A saved home's list price is public listing data, so long numbers aren't checked here.
  check("member summary: activity and their message, contacts blanked", req.feature === "member_summary" && req.messagesSent === 1 && !req.requestHasEmail && !req.requestHasPhone && !req.requestHasLockbox && req.documents === 0 && req.tools === 0, JSON.stringify(req));
  check("member summary: labelled, with what they're looking for and next steps", (await av.getByText("AI summary: check it against their activity below.").isVisible()) && (await av.getByRole("region", { name: "What they seem to be looking for" }).getByText("3 bedrooms in San Carlos").isVisible()) && (await av.getByRole("region", { name: "Suggested next steps" }).getByText("Confirm the Saturday tour.").isVisible()));
  await axeAll(av, "/members/[id] (summary)");
  await shots(av, "member-summary");

  // 6. Nothing stored; the usage log has metadata only.
  check("the usage log records each request, nothing else is stored", sql(`select string_agg(feature || ':' || status, ',' order by created_at) from ai_runs`) === "staff_daily_briefing:ok,staff_daily_briefing:ok,staff_data_questions:ok,staff_data_questions:ok,staff_data_questions:blocked_input,staff_data_questions:blocked_output,staff_member_summary:ok");

  // 7. Off again.
  flags(false);
  await av.goto(`${VA}/`);
  check("off again: the briefing is gone", (await av.getByRole("heading", { name: "Your briefing" }).count()) === 0);
  check("the console called nothing but the Messages endpoint", asked().every((r) => !("unexpected" in r)));
} finally {
  flags(false);
  sql(`update app_settings set ai_zdr_confirmed_at = null, ai_zdr_confirmed_by = null, ai_zdr_note = null, lead_admin_id = ${leadAdminBefore ? `'${leadAdminBefore}'` : "null"}`);
  sql(`delete from messages where member_id = '${jordan.id}'; delete from saved_homes where profile_id = '${jordan.id}'`);
  sql(`delete from leads where id in ('${leadA}', '${leadB}'); delete from notifications where dedupe_key like '%${leadA}%' or dedupe_key like '%${leadB}%'`);
  sql(`delete from deals where id in ('${dealA}', '${dealB}'); delete from ai_runs`);
  sql(`delete from staff_notifications where recipient_id in ('${ada.id}', '${avery.id}', '${vera.id}')`);
  await browser.close();
}
done();
