// S6b PR 8 end-to-end check: call notes to to-dos and a follow-up,
// appointment drafts and the staff to-do list, on the local stack with the
// fake Claude server (fake-claude.mjs): no key, no cost, fictional people.
//
// - Off by default: no call notes or appointments; the to-do lists are there.
// - Call notes on a deal: suggested to-dos (duplicates removed, contacts
//   redacted), two ticked and added, the follow-up approved; the notes aren't
//   stored anywhere.
// - Call notes on a lead with "save on the lead": a lead note; no follow-up.
// - Appointment from a sentence: fields checked (next Tuesday, 3 PM, 45
//   minutes); a changed time blocks approval until the email says it;
//   approved; the calendar file in UTC; the confirmation copied. A past date
//   is left blank.
// - To-dos: add, done, delete; Today lists them.
// - An agent without access gets a 404. No sideways scrolling at 390 px. axe
//   at 1440 and 390 px; screenshots.
//
// Start: node scripts/qa/fake-claude.mjs <log>; apps/va with
// ANTHROPIC_BASE_URL=http://127.0.0.1:4020 and any ANTHROPIC_API_KEY. Needs
// SERVICE_KEY, CLAUDE_LOG and migrations up to 0035.

import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { axeAll, check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const LOG = process.env.CLAUDE_LOG;
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s6b-calls-appointments");
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
  page.on("dialog", (d) => d.accept());
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

async function sideScroll(page) {
  await page.setViewportSize({ width: 390, height: 900 });
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.setViewportSize({ width: 1440, height: 900 });
  return w;
}

async function waitText(page, re, timeout = 30000) {
  try {
    await page.getByText(re).first().waitFor({ timeout });
  } catch {
    throw new Error(`no ${re}; alerts: ${JSON.stringify(await page.getByRole("alert").allTextContents())}; status: ${JSON.stringify(await page.getByRole("status").allTextContents())}`);
  }
}

const pacificToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const plusDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const nextTuesday = () => {
  const t = pacificToday();
  const dow = new Date(`${t}T00:00:00Z`).getUTCDay();
  return plusDays(t, ((2 - dow + 7) % 7) || 7);
};

// --- Setup ---------------------------------------------------------------------------------------
const leadAdminBefore = sql(`select coalesce(lead_admin_id::text, '') from app_settings`);
const AI = "('ai_enabled', 'ai_staff_call_notes', 'ai_staff_appointments')";
sql(`update feature_flags set enabled = false where key like 'ai\\_%'`);
sql(`delete from ai_runs`);
const ada = await account("Ada", "admin");
const avery = await account("Avery", "agent");
const blake = await account("Blake", "agent");
const sam = await account("Sam", "seller");
sql(`update app_settings set ai_zdr_confirmed_at = now(), ai_zdr_confirmed_by = '${ada.id}', ai_zdr_note = 'QA fixture (fictional)', lead_admin_id = '${ada.id}', lead_admin_away = false`);
const ADDRESS = `${stamp % 1000} Fixture Court, Belmont`;
const deal = sql(`insert into deals (address, seller_type, ratification_date, days_to_close, agent_id, created_by) values ('${ADDRESS}', 'normal', current_date - 5, 30, '${avery.id}', '${avery.id}') returning id`).split("\n")[0];
sql(`insert into deal_members (deal_id, profile_id, member_role) values ('${deal}', '${sam.id}', 'seller')`);
const lead = sql(`insert into leads (kind, email, name, message) values ('valuation', 'jordan.${stamp}@example.test', 'Jordan Example', 'What is my home worth? (fictional QA lead)') returning id`).split("\n")[0];
sql(`update leads set assigned_to = '${avery.id}', status = 'assigned' where id = '${lead}'`);
const ai = (on) => sql(`update feature_flags set enabled = ${on} where key in ${AI}`);

try {
  // 1. Off by default.
  const av = await signIn(avery.email);
  await av.goto(`${VA}/deals/${deal}`);
  check("off: no call notes or appointments on the deal; the staff to-do list is there", (await av.getByRole("heading", { name: "Call notes" }).count()) === 0 && (await av.getByRole("heading", { name: "Draft an appointment" }).count()) === 0 && (await av.getByText(/Staff to-dos \(0\)/).isVisible()));
  await av.goto(`${VA}/leads/${lead}`);
  check("off: the lead has its to-do list and no call notes", (await av.getByText(/^To-dos \(0\)$/).isVisible()) && (await av.getByRole("heading", { name: "Call notes" }).count()) === 0);

  // 2. Call notes on the deal.
  ai(true);
  await av.goto(`${VA}/deals/${deal}`);
  await av.getByLabel("Your notes from the call").fill("Dana called: send the HOA docs to the buyer's agent tomorrow, book the stager this week. QA-MODE: ok");
  await av.getByRole("button", { name: "Suggest to-dos and a follow-up" }).click();
  await waitText(av, /Read\. 3 suggested to-dos, a follow-up draft\./);
  const req = last();
  check("call notes: the notes as the person's words with a few facts; no documents, contacts or tools", req.feature === "call_notes" && req.documents === 0 && !req.requestHasEmail && !req.requestHasPhone && req.tools === 0, JSON.stringify(req));
  check("call notes: duplicates removed and contacts redacted in the suggestions", (await av.getByLabel("To-do 2").inputValue()) === "Book the stager for a walkthrough, call [phone]" && (await av.getByLabel(/^To-do \d$/).count()) === 3);
  check("call notes: nothing added until ticked and added", sql(`select count(*) from staff_todos where deal_id = '${deal}'`) === "0");
  await av.getByRole("checkbox", { name: /^Add: Confirm the final walkthrough time$/ }).uncheck();
  await axeAll(av, "/deals/[id] (call notes)");
  await shots(av, "call-notes");
  await av.getByRole("button", { name: "Add ticked to-dos" }).click();
  await waitText(av, /Added 2 to-dos\./);
  const added = sql(`select string_agg(source || ':' || (created_by = '${avery.id}')::text, ',') from staff_todos where deal_id = '${deal}'`);
  check("call notes: the two ticked to-dos added, from call notes, as the agent", added === "call_notes:true,call_notes:true", added);
  check("call notes: the notes aren't stored anywhere", sql(`select (select count(*) from lead_notes where body like '%Dana called%') + (select count(*) from ai_drafts where body like '%Dana called%' or subject like '%Dana called%')`) === "0");
  await av.getByRole("button", { name: "Approve" }).click();
  await waitText(av, /Approved\./);
  check("call notes: the follow-up approved as this deal's draft", sql(`select kind || ':' || status from ai_drafts where deal_id = '${deal}' and kind = 'call_followup'`) === "call_followup:approved");

  // 3. Call notes on the lead, saved as a note.
  await av.goto(`${VA}/leads/${lead}`);
  await av.getByLabel("Your notes from the call").fill("Jordan wants a valuation visit next week. QA-MODE: nofollowup");
  await av.getByLabel("Save these notes on the lead").check();
  await av.getByRole("button", { name: "Suggest to-dos and a follow-up" }).click();
  await waitText(av, /Read\. 3 suggested to-dos, no follow-up needed\. Your notes are saved on the lead\./);
  check("lead: the notes saved as a lead note only because it was ticked; no follow-up draft", sql(`select count(*) from lead_notes where lead_id = '${lead}' and body like 'Jordan wants a valuation%'`) === "1" && sql(`select count(*) from ai_drafts where lead_id = '${lead}'`) === "0");
  check("lead: the request had no deal", last().feature === "call_notes");

  // 4. An appointment from a sentence.
  await av.goto(`${VA}/deals/${deal}`);
  await av.getByLabel("Describe it in a sentence").fill("walkthrough with Dana Tuesday 3pm, 45 min, at the house QA-MODE: ok");
  await av.getByRole("button", { name: "Draft the appointment" }).click();
  await av.waitForURL(/\/appointments\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const appt = av.url().split("/").pop();
  check("appointment: the request was one sentence and a few facts; no contacts or tools", last().feature === "appointments" && last().documents === 0 && !last().requestHasEmail && last().tools === 0);
  check(
    "appointment: fields checked (next Tuesday, 3 PM, 45 minutes) and the time filled into the email",
    (await av.getByLabel("Date").inputValue()) === nextTuesday() && (await av.getByLabel("Start (California time)").inputValue()) === "15:00" && (await av.getByLabel("Length").inputValue()) === "45" && (await av.getByLabel("Confirmation", { exact: true }).inputValue()).includes("at 3:00 PM"),
  );
  await axeAll(av, "/appointments/[id] (draft)");
  await shots(av, "appointment-draft");
  await av.getByLabel("Start (California time)").fill("16:00");
  await av.getByRole("button", { name: "Approve" }).click();
  await waitText(av, /The confirmation must say ".* at 4:00 PM"/);
  check("appointment: a changed time blocks approval until the email says it", sql(`select status from ai_drafts where id = '${appt}'`) === "draft");
  await av.getByRole("button", { name: "Put the date and time in the email" }).click();
  await av.getByRole("button", { name: "Approve" }).click();
  await waitText(av, /Approved\. Add it to your calendar/);
  check("appointment: approved with the new time", sql(`select status || ':' || (content->>'start') from ai_drafts where id = '${appt}'`) === "approved:16:00");
  const ics = await av.request.get(`${VA}/appointments/${appt}/ics`);
  const icsText = await ics.text();
  const startUtc = new Date(Date.parse(`${nextTuesday()}T16:00:00-08:00`));
  // Pacific offset for that date (PDT or PST).
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "shortOffset" }).formatToParts(startUtc).find((p) => p.type === "timeZoneName")?.value === "GMT-7" ? 7 : 8;
  const expected = new Date(Date.parse(`${nextTuesday()}T16:00:00-0${off}:00`)).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  check("calendar file: one event in UTC with the approved time, 45 minutes, a stable id", ics.status() === 200 && /text\/calendar/.test(ics.headers()["content-type"] ?? "") && icsText.includes(`DTSTART:${expected}`) && icsText.includes(`UID:${appt}@vabrato.com`) && icsText.includes("SUMMARY:Final walkthrough"), `${ics.status()} ${expected} ${icsText.slice(0, 400)}`);
  await av.getByRole("button", { name: "Copy confirmation" }).click();
  await waitText(av, /Copied\./);
  check("appointment: the confirmation copied, and that's recorded", sql(`select sent_via from ai_drafts where id = '${appt}'`) === "copy");
  check("390 px: the appointment page doesn't scroll sideways", (await sideScroll(av)) <= 390);
  await axeAll(av, "/appointments/[id] (approved)");
  await shots(av, "appointment-approved");

  await av.goto(`${VA}/deals/${deal}`);
  await av.getByLabel("Describe it in a sentence").fill("walkthrough yesterday QA-MODE: past");
  await av.getByRole("button", { name: "Draft the appointment" }).click();
  await av.waitForURL(/\/appointments\/[0-9a-f-]{36}$/, { timeout: 30000 });
  check("appointment: a past date is left blank for the person", (await av.getByLabel("Date").inputValue()) === "");
  await av.getByRole("button", { name: "Approve" }).click();
  await waitText(av, /Not approved yet\. Add the date\./);

  // 5. To-dos: add, done, delete; Today.
  await av.goto(`${VA}/deals/${deal}`);
  await av.getByLabel("New to-do").fill("Order the termite report");
  await av.getByLabel("Due (optional)").last().fill(plusDays(pacificToday(), 2));
  await av.getByRole("button", { name: "Add to-do" }).click();
  await waitText(av, /Added 1 to-do\./);
  await av.getByText(/Staff to-dos \(3\)/).waitFor();
  await av.getByRole("button", { name: /^Done\s*:\s*Send the HOA documents/ }).click();
  await av.getByText(/Staff to-dos \(2\)/).waitFor();
  await av.getByRole("button", { name: /^Delete\s*:\s*Book the stager/ }).click();
  await av.getByText(/Staff to-dos \(1\)/).waitFor();
  check("to-dos: added, done and deleted", sql(`select string_agg(title || ':' || done, ',' order by title) from staff_todos where deal_id = '${deal}'`) === "Order the termite report:false,Send the HOA documents to the buyer's agent:true");
  check("390 px: the deal page doesn't scroll sideways", (await sideScroll(av)) <= 390);
  await axeAll(av, "/deals/[id] (to-dos)");
  await shots(av, "deal-todos");
  await av.goto(`${VA}/`);
  const todayPanel = av.getByText(/To-dos due this week/);
  check("Today: lists the to-dos due this week with a link to the deal", (await todayPanel.isVisible()) && (await av.getByRole("link", { name: ADDRESS }).first().isVisible()) && (await av.getByText("Order the termite report", { exact: true }).first().isVisible()));
  await axeAll(av, "/ (to-dos)");

  // 6. An agent without access.
  const bl = await signIn(blake.email);
  const p404 = await bl.goto(`${VA}/appointments/${appt}`);
  const i404 = await bl.request.get(`${VA}/appointments/${appt}/ics`);
  const d404 = await bl.goto(`${VA}/deals/${deal}`);
  check("an agent without access gets a 404 for the appointment, its calendar file and the deal", p404?.status() === 404 && i404.status() === 404 && d404?.status() === 404, `${p404?.status()} ${i404.status()} ${d404?.status()}`);
  await bl.goto(`${VA}/`);
  check("an agent without access doesn't see the to-dos on Today", (await bl.getByText("Order the termite report", { exact: true }).count()) === 0);
  await bl.context().close();

  const runs = sql(`select string_agg(feature || ':' || status || ':' || n, ',' order by feature) from (select feature, status, count(*) n from ai_runs group by 1, 2) x`);
  check("the usage log has metadata only", runs === "staff_appointments:ok:2,staff_call_notes:ok:2", runs);
  check("the console called nothing but the Messages endpoint", asked().every((r) => !("unexpected" in r)));
} finally {
  ai(false);
  sql(`update app_settings set ai_zdr_confirmed_at = null, ai_zdr_confirmed_by = null, ai_zdr_note = null, lead_admin_id = ${leadAdminBefore ? `'${leadAdminBefore}'` : "null"}`);
  sql(`delete from deals where id = '${deal}'; delete from leads where id = '${lead}'; delete from ai_runs`);
  sql(`delete from staff_notifications where recipient_id in ('${ada.id}', '${avery.id}', '${blake.id}')`);
  await browser.close();
}
done();
