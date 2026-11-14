// Integrations PR 1 end-to-end check: connected accounts and Google Calendar,
// on the local stack with the fake Google (fake-google.mjs): no Google
// account, no OAuth client, nothing leaves the machine; fictional people.
//
// - Switch off: no Connect button; the start route refuses; an agent has no
//   switch; an admin turns it on (audited).
// - An agent connects through the fake consent page (PKCE, one-time state):
//   the token is stored encrypted; their deals' key dates appear (their own
//   deals and a deal they're a member of, not someone else's).
// - Approving an appointment adds it at once; its page says so.
// - Key dates off and on; a cancelled deal's dates go after Sync now.
// - Google revokes the access: "Needs reconnecting"; reconnecting doesn't
//   duplicate events. An unverified Google email and a stale callback are
//   refused. A seller gets nothing.
// - Disconnect removes our events and revokes the token.
// - Every page: status, axe at 1440 and 390 px, no sideways scroll at 390
//   and 320 px, no console errors; a keyboard pass on Settings.
//
// Start: node --experimental-strip-types scripts/qa/fake-google.mjs <log>;
// apps/va with the GOOGLE_* base URLs at http://127.0.0.1:4030, any client id
// and secret, and a 32-byte INTEGRATIONS_TOKEN_KEY. Needs SERVICE_KEY,
// GOOGLE_LOG and migrations up to 0042. Everything is put back in finally.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const FAKE = process.env.FAKE_GOOGLE ?? "http://127.0.0.1:4030";
const GLOG = process.env.GOOGLE_LOG;
if (!GLOG || !process.env.SERVICE_KEY) throw new Error("set GOOGLE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/int-calendar");
mkdirSync(OUT, { recursive: true });
const { chromium } = need("playwright");
const { AxeBuilder } = need("@axe-core/playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const report = [];
const FLAG = "integration_google_calendar";

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

async function signIn(email, home = `${VA}/`) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.errors = errors;
  await page.goto(`${VA}/login`);
  await page.getByPlaceholder("you@vabrato.com").fill(email);
  const before = mails();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText(/Check your email/).waitFor();
  await page.goto(await linkFor(email, before));
  await page.waitForURL(home, { timeout: 15000 });
  return page;
}

const sideScroll = async (page, width) => {
  await page.setViewportSize({ width, height: 900 });
  return page.evaluate(() => document.documentElement.scrollWidth);
};

/** Status, console errors, axe at 1440 and 390, no sideways scroll at 390 and 320. The page is already loaded. */
async function audit(page, who, name, { shoot = true } = {}) {
  await page.waitForLoadState("networkidle");
  const entry = { who, name, url: page.url().replace(VA, ""), violations: {}, widths: {}, errors: [] };
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    entry.violations[width] = r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 3) }));
    check(`${who} axe ${name} @${width}`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(" | ")}`).join("; "));
    if (shoot) await page.screenshot({ path: join(OUT, `${who}-${name}-${width}.jpg`), fullPage: true, type: "jpeg", quality: 60 });
  }
  for (const width of [390, 320]) {
    const w = await sideScroll(page, width);
    entry.widths[width] = w;
    check(`${who} ${name}: no sideways scroll @${width}`, w <= width, `${w}px`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  entry.errors = [...page.errors];
  check(`${who} ${name}: no console errors`, entry.errors.length === 0, entry.errors.join(" | "));
  page.errors.length = 0;
  report.push(entry);
}

async function settings(page) {
  const res = await page.goto(`${VA}/settings`);
  await page.waitForLoadState("networkidle");
  return res?.status() ?? 0;
}

const fake = async (path, method = "GET") => (await fetch(`${FAKE}${path}`, { method })).json();
const eventsFor = async (email) => (await fake("/__fake/events")).filter((e) => e.account === email);
async function waitEvents(email, n, ms = 15000) {
  const until = Date.now() + ms;
  let got = [];
  while (Date.now() < until) {
    got = await eventsFor(email);
    if (got.length === n) return got;
    await new Promise((r) => setTimeout(r, 300));
  }
  return got;
}
const clickAndWait = async (page, name, text) => {
  await page.getByRole("button", { name }).click();
  await page.getByText(text).first().waitFor({ timeout: 20000 });
};

// --- Setup: fictional staff, deals and an appointment --------------------------------------------------
sql(`update feature_flags set enabled = false where key = '${FLAG}'`);
const admin = await account("Avery", "admin");
const agent = await account("Jordan", "agent");
const agent2 = await account("Riley", "agent");
const seller = await account("Dana", "seller");
const googleAgent = `jordan.google.${stamp}@example.test`;
const D1 = sql(`insert into deals (address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by) values ('1 Fixture Way, Belmont (QA ${stamp})', 'normal', current_date - 5, 30, 3, '${agent.id}', '${agent.id}') returning id`).split("\n")[0];
const D2 = sql(`insert into deals (address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by) values ('2 Fixture Way, Belmont (QA ${stamp})', 'normal', current_date - 2, 21, 0, '${agent.id}', '${agent.id}') returning id`).split("\n")[0];
const D3 = sql(`insert into deals (address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by) values ('3 Fixture Way, Belmont (QA ${stamp})', 'normal', current_date - 1, 30, 0, '${agent2.id}', '${agent2.id}') returning id`).split("\n")[0];
const D4 = sql(`insert into deals (address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by) values ('4 Fixture Way, Belmont (QA ${stamp})', 'normal', current_date - 1, 30, 0, '${agent2.id}', '${agent2.id}') returning id`).split("\n")[0];
sql(`insert into deal_contingencies (deal_id, kind, offset_days, due_date) values ('${D1}', 'property_condition', 8, current_date + 3)`);
sql(`insert into deal_members (deal_id, profile_id, member_role) values ('${D3}', '${agent.id}', 'va'), ('${D1}', '${seller.id}', 'seller')`);
// A weekday a week or so ahead, 10:00 for 45 minutes.
const apptDate = sql(`select d::date::text from generate_series(current_date + 7, current_date + 12, interval '1 day') d where extract(isodow from d) < 6 limit 1`);
const appt = sql(
  `insert into ai_drafts (owner_id, kind, deal_id, subject, body, content) values ('${agent.id}', 'appointment', '${D1}', 'Final walkthrough', 'Hi Dana, see you [when] for the final walkthrough.', '${JSON.stringify({ title: "Final walkthrough", date: apptDate, start: "10:00", minutes: 45, location: "1 Fixture Way, Belmont", with: "Dana" })}') returning id`,
).split("\n")[0];
// Deals the agent works: D1 (property-condition removal, close, rent-back end), D2 (close), D3 as a member (close). Not D4.
const KEY_DATES = 5;

try {
  // --- Switch off ------------------------------------------------------------------------------------
  const a = await signIn(agent.email);
  check("agent: settings loads", (await settings(a)) === 200);
  check("off: no Connect button", (await a.getByRole("link", { name: "Connect Google Calendar" }).count()) === 0);
  check("off: says not set up", await a.getByText("Not set up yet.").isVisible());
  check("off: agent has no switch", (await a.getByRole("heading", { name: "Integration switches" }).count()) === 0);
  await audit(a, "agent", "settings-off");
  await a.goto(`${VA}/integrations/google/start`);
  check("off: the start route goes back to Settings", a.url().includes("/settings?google=not_ready"), a.url());
  check("off: says it isn't set up", await a.getByText("That connection isn't set up yet.").isVisible());

  // --- An admin turns it on ---------------------------------------------------------------------------
  const ad = await signIn(admin.email);
  await settings(ad);
  check("admin: sees the switch", await ad.getByRole("heading", { name: "Integration switches" }).isVisible());
  await audit(ad, "admin", "settings-switch-off");
  await clickAndWait(ad, "Turn Google Calendar on", "Google Calendar is on: each person can connect their own.");
  check("switch on in the database", sql(`select enabled from feature_flags where key = '${FLAG}'`) === "t");
  check("switch change audited", sql(`select count(*) from staff_audit where action = 'set_integration_flag' and actor_id = '${admin.id}' and ref_id = '${FLAG}'`) === "1");
  await settings(ad);
  await audit(ad, "admin", "settings-switch-on");

  // --- The agent connects -----------------------------------------------------------------------------
  await fake(`/__fake/account?email=${encodeURIComponent(googleAgent)}`, "POST");
  await settings(a);
  await audit(a, "agent", "settings-not-connected");
  await a.getByRole("link", { name: "Connect Google Calendar" }).click();
  await a.waitForURL(/\/settings\?google=connected/, { timeout: 20000 });
  check("connect: back on Settings with a confirmation", await a.getByText(/Google Calendar connected\./).isVisible());
  const row = sql(`select account_email || '|' || left(token_ciphertext, 3) || '|' || (token_ciphertext like '%fake-refresh%')::text from staff_connections where profile_id = '${agent.id}' and provider = 'google'`);
  check("connect: stored with the Google email, encrypted", row === `${googleAgent}|v1.|false`, row);
  const keyDates = await waitEvents(googleAgent, KEY_DATES);
  check(`connect: ${KEY_DATES} key dates on the calendar`, keyDates.length === KEY_DATES, `${keyDates.length}`);
  const summaries = keyDates.map((e) => e.body.summary).join(" / ");
  check("key dates: their own deals and the one they're a member of, not another agent's", summaries.includes("1 Fixture Way") && summaries.includes("2 Fixture Way") && summaries.includes("3 Fixture Way") && !summaries.includes("4 Fixture Way"), summaries);
  check("key dates: removal, close and rent-back end", /Property-condition contingency removal/.test(summaries) && /Close of escrow/.test(summaries) && /Rent-back ends/.test(summaries), summaries);
  check("key dates: private, all-day, no attendees, our key", keyDates.every((e) => e.body.visibility === "private" && e.body.start.date && !e.body.attendees && /^deal:/.test(e.body.extendedProperties.private.vabratoKey)));
  check("key dates: no money, wiring or seller in them", !/\$|price|wire|Dana/i.test(JSON.stringify(keyDates.map((e) => e.body))));
  await settings(a);
  check("connected: status shows the account", await a.getByText(new RegExp(`${googleAgent.replace(/\./g, "\\.")} · last synced`)).isVisible());
  await audit(a, "agent", "settings-connected");

  // --- Approving an appointment adds it ----------------------------------------------------------------
  await a.goto(`${VA}/appointments/${appt}`);
  await a.waitForLoadState("networkidle");
  await a.getByRole("button", { name: "Put the date and time in the email" }).click();
  await clickAndWait(a, "Approve", "Approved and added to your Google Calendar.");
  const withAppt = await eventsFor(googleAgent);
  const timed = withAppt.find((e) => e.body.extendedProperties?.private?.vabratoKey === `appt:${appt}`);
  check("appointment: on the calendar, timed, California time zone", Boolean(timed?.body.start.dateTime) && timed?.body.start.timeZone === "America/Los_Angeles" && withAppt.length === KEY_DATES + 1, JSON.stringify(timed?.body.start));
  check("appointment: location and a console link, no attendees", timed?.body.location === "1 Fixture Way, Belmont" && timed?.body.description.includes(`/appointments/${appt}`) && !timed?.body.attendees);
  await a.reload();
  await a.waitForLoadState("networkidle");
  check("appointment page: says it's on the calendar", await a.getByText("On your Google Calendar.").isVisible());
  await audit(a, "agent", "appointment-on-calendar");

  // --- Key dates off and on ----------------------------------------------------------------------------
  await settings(a);
  await clickAndWait(a, "Stop adding key dates", "Key dates are off; the ones we added are removed.");
  check("key dates off: only the appointment stays", (await eventsFor(googleAgent)).length === 1);
  await settings(a);
  await clickAndWait(a, "Add key dates for my deals", "Key dates of your deals will be on your calendar.");
  check("key dates on: back again", (await eventsFor(googleAgent)).length === KEY_DATES + 1);

  // --- A cancelled deal's dates go ---------------------------------------------------------------------
  sql(`update deals set status = 'cancelled' where id = '${D2}'`);
  await settings(a);
  await clickAndWait(a, "Sync now", "Google Calendar updated (1 change).");
  const afterCancel = await eventsFor(googleAgent);
  check("cancelled deal: its close of escrow removed", afterCancel.length === KEY_DATES && !afterCancel.some((e) => e.body.summary.includes("2 Fixture Way")), `${afterCancel.length}`);
  await settings(a);
  await clickAndWait(a, "Sync now", "Google Calendar is up to date.");
  check("a second sync changes nothing", (await eventsFor(googleAgent)).length === KEY_DATES);

  // --- Google revokes the access; reconnecting doesn't duplicate --------------------------------------------
  await fake("/__fake/revoke-all", "POST");
  await settings(a);
  await clickAndWait(a, "Sync now", "Google needs you to reconnect: use Connect again.");
  await settings(a);
  check("revoked: Needs reconnecting", await a.getByText("Needs reconnecting").isVisible());
  await audit(a, "agent", "settings-reconnect");
  await a.getByRole("link", { name: "Reconnect Google Calendar" }).click();
  await a.waitForURL(/\/settings\?google=connected/, { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2000));
  check("reconnected: no duplicate events", (await eventsFor(googleAgent)).length === KEY_DATES);
  check("reconnected: error cleared", sql(`select coalesce(last_error, 'none') from staff_connections where profile_id = '${agent.id}'`) === "none");

  // --- Refusals ---------------------------------------------------------------------------------------
  await a.goto(`${VA}/integrations/google/callback?state=${"x".repeat(32)}&code=fake-code-stale`);
  await a.waitForURL(/\/settings\?google=expired/);
  check("a stale callback is refused", await a.getByText(/That connection attempt expired or didn't match/).isVisible());

  const r2 = await signIn(agent2.email);
  await fake(`/__fake/account?email=${encodeURIComponent(`riley.google.${stamp}@example.test`)}&verified=false`, "POST");
  await settings(r2);
  check("another agent: not connected", (await r2.getByText("Connected", { exact: true }).count()) === 0);
  await r2.getByRole("link", { name: "Connect Google Calendar" }).click();
  await r2.waitForURL(/\/settings\?google=unverified/, { timeout: 20000 });
  check("an unverified Google email is refused", await r2.getByText(/hasn't verified that account's email address/).isVisible());
  check("unverified: nothing stored", sql(`select count(*) from staff_connections where profile_id = '${agent2.id}'`) === "0");
  await audit(r2, "agent2", "settings-unverified");

  const s = await signIn(seller.email, /\/(my|login|$)/);
  await s.goto(`${VA}/integrations/google/start`);
  check("seller: the start route sends them away", !s.url().includes("4030") && !s.url().includes("accounts.google"), s.url());
  check("seller: nothing stored", sql(`select count(*) from staff_connections where profile_id = '${seller.id}'`) === "0");

  // --- Keyboard ----------------------------------------------------------------------------------------
  await settings(a);
  await a.locator("body").click({ position: { x: 1, y: 1 } });
  const reached = new Set();
  for (let i = 0; i < 80 && reached.size < 4; i++) {
    await a.keyboard.press("Tab");
    const f = await a.evaluate(() => {
      const el = document.activeElement;
      const cs = el ? getComputedStyle(el) : null;
      return { label: (el?.textContent || el?.getAttribute("name") || "").replace(/\s+/g, " ").trim().slice(0, 80), visible: Boolean(cs && ((cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none"))) };
    });
    for (const want of ["Stop adding key dates", "Sync now", "Disconnect Google account", "confirm"]) if ((f.label === want || f.label.includes(want)) && f.visible) reached.add(want);
  }
  check("keyboard: reaches key dates, Sync now, the confirm box and Disconnect with visible focus", reached.size === 4, [...reached].join(", "));

  // --- Disconnect -------------------------------------------------------------------------------------
  await settings(a);
  await a.getByRole("checkbox", { name: /Remove the console's access to my Google account and the calendar events it added/ }).check();
  await a.getByRole("button", { name: "Disconnect Google account" }).click();
  await a.waitForURL(/\/settings\?google=disconnected$/, { timeout: 20000 });
  check("disconnect: says so", await a.getByText(/Google Calendar disconnected\. The events the console added were removed/).isVisible());
  check("disconnect: our events removed from the calendar", (await eventsFor(googleAgent)).length === 0);
  check("disconnect: connection and event records gone", sql(`select (select count(*) from staff_connections where profile_id = '${agent.id}') + (select count(*) from calendar_events where profile_id = '${agent.id}')`) === "0");
  const glog = readFileSync(GLOG, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  check("disconnect: the token was revoked at Google", glog.some((l) => l.path === "/revoke" && l.status === 200));
  check("the fake's log holds no tokens", !/fake-refresh|fake-access|fake-code/.test(readFileSync(GLOG, "utf8")));
  await settings(a);
  await audit(a, "agent", "settings-disconnected");

  // --- Switch off again ---------------------------------------------------------------------------------
  await settings(ad);
  await clickAndWait(ad, "Turn Google Calendar off", "Google Calendar is off.");
  await settings(a);
  check("switched off: Connect is gone", (await a.getByRole("link", { name: "Connect Google Calendar" }).count()) === 0);
} finally {
  sql(`update feature_flags set enabled = false where key = '${FLAG}'`);
  sql(`delete from calendar_events where profile_id in ('${agent.id}', '${agent2.id}')`);
  sql(`delete from staff_connections where profile_id in ('${agent.id}', '${agent2.id}', '${seller.id}')`);
  sql(`delete from ai_drafts where id = '${appt}'`);
  sql(`delete from deals where id in ('${D1}', '${D2}', '${D3}', '${D4}')`);
  sql(`delete from staff_audit where actor_id = '${admin.id}'`);
  for (const p of [admin, agent, agent2, seller]) sql(`delete from auth.users where id = '${p.id}'`);
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
check("cleanup: nothing left", sql(`select (select count(*) from deals where address like '%(QA ${stamp})') + (select count(*) from profiles where email like '%.${stamp}@example.test') + (select count(*) from calendar_events) + (select count(*) from staff_connections)`) === "0");
check("cleanup: switch off", sql(`select enabled from feature_flags where key = '${FLAG}'`) === "f");
done();
