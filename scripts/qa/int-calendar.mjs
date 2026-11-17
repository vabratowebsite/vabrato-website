// The team Google Calendar (0045) end-to-end, on the local stack with the
// fake Google (fake-google.mjs): no Google account, no OAuth client, nothing
// leaves the machine; fictional people.
//
// - Switch off: nothing to connect; an admin turns it on (audited).
// - An agent can't connect it; the start route refuses them. An admin's
//   unticked permission, an unverified Google email and a stale callback are
//   refused, with nothing stored.
// - The admin connects: the token is stored encrypted, a "Vabrato" calendar
//   (California time) is made in that account, and every real deal's key
//   dates and every approved appointment go on it, titled with who they're
//   for; a test deal and its appointment don't.
// - Everyone on staff sees the state; only admins see Sync now and
//   Disconnect. Approving an appointment adds it; its page says so.
// - A cancelled deal's dates go after Sync now; a calendar deleted in Google
//   is made again; Google revoking the access asks an admin to reconnect,
//   and reconnecting doesn't duplicate anything.
// - The same Google account also used for the admin's Drive imports:
//   disconnecting the team calendar keeps Drive working (Google ends the
//   whole grant on any revoke); disconnecting Drive then revokes it. The
//   calendar stays in Google.
// - Every page: status, axe at 1440 and 390 px, no sideways scroll at 390
//   and 320 px, no console errors; a keyboard pass on Settings.
//
// Start: node --experimental-strip-types scripts/qa/fake-google.mjs <log>;
// apps/va with the GOOGLE_* base URLs at http://127.0.0.1:4030, any client id
// and secret, the picker settings, and a 32-byte INTEGRATIONS_TOKEN_KEY.
// Needs SERVICE_KEY, GOOGLE_LOG and migrations up to 0045. Everything is put
// back in finally.

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
const DRIVE_FLAG = "integration_google_drive";
const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
if (sql(`select count(*) from team_calendar`) !== "0") throw new Error("the team calendar is already connected in this database");
const driveWasOn = sql(`select enabled from feature_flags where key = '${DRIVE_FLAG}'`) === "t";

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
const OWNER = `office.google.${stamp}@example.test`;
const calendarsOf = async () => (await fake("/__fake/calendars")).filter((c) => c.account === OWNER);
const eventsOn = async (calendarId) => (await fake("/__fake/events")).filter((e) => e.account === OWNER && (!calendarId || e.calendarId === calendarId));
/** Our QA events (this run's deals and appointments), by their key. */
const ours = (events, keys) => events.filter((e) => keys.some((k) => e.body.extendedProperties?.private?.vabratoKey?.includes(k)));
async function waitFor(fn, ok, ms = 20000) {
  const until = Date.now() + ms;
  let got = await fn();
  while (!ok(got) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 300));
    got = await fn();
  }
  return got;
}
const clickAndWait = async (page, name, text) => {
  await page.getByRole("button", { name }).click();
  await page.getByText(text).first().waitFor({ timeout: 40000 });
};
const revokes = () =>
  readFileSync(GLOG, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((l) => l.path === "/revoke").length;
/** Every event we recorded is on the calendar exactly once, and nothing else of ours is. */
async function inStep(calendarId) {
  const rows = sql(`select coalesce(string_agg(google_event_id, ',' order by google_event_id), '') from team_calendar_events`).split(",").filter(Boolean);
  const onCal = (await eventsOn(calendarId)).map((e) => e.id).sort();
  return rows.length > 0 && rows.length === onCal.length && rows.every((id, i) => id === onCal[i]);
}

// --- Setup: fictional staff, deals and appointments ----------------------------------------------------
sql(`update feature_flags set enabled = false where key in ('${FLAG}', '${DRIVE_FLAG}')`);
const admin = await account("Avery", "admin");
const agent = await account("Jordan", "agent");
const agent2 = await account("Riley", "agent");
const seller = await account("Dana", "seller");
const deal = (n, agentId, ratified, days, rentBack, test = false) =>
  sql(
    `insert into deals (address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by, is_test) values ('${n} Fixture Way, Belmont (QA ${stamp})', 'normal', current_date - ${ratified}, ${days}, ${rentBack}, '${agentId}', '${agentId}', ${test}) returning id`,
  ).split("\n")[0];
const D1 = deal(1, agent.id, 5, 30, 3);
const D2 = deal(2, agent.id, 2, 21, 0);
const D3 = deal(3, agent2.id, 1, 30, 0);
const DT = deal(4, agent.id, 1, 30, 0, true);
sql(`insert into deal_contingencies (deal_id, kind, offset_days, due_date) values ('${D1}', 'property_condition', 8, current_date + 3), ('${DT}', 'property_condition', 8, current_date + 3)`);
sql(`insert into deal_members (deal_id, profile_id, member_role) values ('${D1}', '${seller.id}', 'seller')`);
// Weekdays a week or so ahead, 10:00 for 45 minutes.
const apptDate = sql(`select d::date::text from generate_series(current_date + 7, current_date + 12, interval '1 day') d where extract(isodow from d) < 6 limit 1`);
const content = (title, place) => JSON.stringify({ title, date: apptDate, start: "10:00", minutes: 45, location: place, with: "Dana" });
const draftAppt = sql(
  `insert into ai_drafts (owner_id, kind, deal_id, subject, body, content) values ('${agent.id}', 'appointment', '${D1}', 'Final walkthrough', 'Hi Dana, see you [when] for the final walkthrough.', '${content("Final walkthrough", "1 Fixture Way, Belmont")}') returning id`,
).split("\n")[0];
const rileyAppt = sql(
  `insert into ai_drafts (owner_id, kind, deal_id, status, approved_at, subject, body, content) values ('${agent2.id}', 'appointment', '${D3}', 'approved', now(), 'Inspection', 'See you then.', '${content("Inspection", "3 Fixture Way, Belmont")}') returning id`,
).split("\n")[0];
const testAppt = sql(
  `insert into ai_drafts (owner_id, kind, deal_id, status, approved_at, subject, body, content) values ('${agent.id}', 'appointment', '${DT}', 'approved', now(), 'Test showing', 'See you then.', '${content("Test showing", "4 Fixture Way, Belmont")}') returning id`,
).split("\n")[0];
const KEYS = [D1, D2, D3, DT, draftAppt, rileyAppt, testAppt];
// On the calendar at first: D1 (removal, close, rent-back end), D2 (close), D3 (close), Riley's appointment. Not the test deal or its appointment.
const FIRST = 6;

try {
  // --- Switch off ------------------------------------------------------------------------------------
  const a = await signIn(agent.email);
  check("agent: settings loads", (await settings(a)) === 200);
  check("off: says not set up", await a.getByText("Not set up yet.").first().isVisible());
  check("off: agent has no switch", (await a.getByRole("heading", { name: "Integration switches" }).count()) === 0);
  await audit(a, "agent", "settings-off");
  await a.goto(`${VA}/integrations/google/start?for=team`);
  check("agent: the team start route refuses them", a.url().includes("/settings?google=admin_only"), a.url());
  check("agent: says only an admin can", await a.getByText("Only an admin can connect the team calendar.").isVisible());

  const ad = await signIn(admin.email);
  await settings(ad);
  check("admin, off: no Connect button", (await ad.getByRole("link", { name: "Connect the team calendar" }).count()) === 0);
  await ad.goto(`${VA}/integrations/google/start?for=team`);
  check("admin, off: the start route says it isn't set up", ad.url().includes("/settings?google=not_ready"), ad.url());

  // --- An admin turns it on ---------------------------------------------------------------------------
  await settings(ad);
  await audit(ad, "admin", "settings-switch-off");
  await clickAndWait(ad, "Turn Team Google Calendar on", "The team Google Calendar is on: an admin can connect it in Connected accounts.");
  check("switch on in the database", sql(`select enabled from feature_flags where key = '${FLAG}'`) === "t");
  check("switch change audited", sql(`select count(*) from staff_audit where action = 'set_integration_flag' and actor_id = '${admin.id}' and ref_id = '${FLAG}'`) === "1");
  await settings(a);
  check("agent, on: not connected yet, no Connect button", (await a.getByText("Not connected yet. An admin connects it here.").isVisible()) && (await a.getByRole("link", { name: "Connect the team calendar" }).count()) === 0);
  await audit(a, "agent", "settings-not-connected");
  await settings(ad);
  await audit(ad, "admin", "settings-not-connected");

  // --- Refusals before connecting ---------------------------------------------------------------------
  await fake(`/__fake/account?email=${encodeURIComponent(OWNER)}&withhold=${encodeURIComponent(CAL_SCOPE)}`, "POST");
  await ad.getByRole("link", { name: "Connect the team calendar" }).click();
  await ad.waitForURL(/\/settings\?google=team_scope/, { timeout: 20000 });
  check("an unticked calendar permission is refused", await ad.getByText(/tick the box that lets the console make and manage its own calendar/).isVisible());
  await fake(`/__fake/account?email=${encodeURIComponent(OWNER)}&verified=false`, "POST");
  await ad.getByRole("link", { name: "Connect the team calendar" }).click();
  await ad.waitForURL(/\/settings\?google=unverified/, { timeout: 20000 });
  check("an unverified Google email is refused", await ad.getByText(/hasn't verified that account's email address/).isVisible());
  check("refusals: nothing stored, no calendar made", sql(`select count(*) from team_calendar`) === "0" && (await calendarsOf()).length === 0);
  await audit(ad, "admin", "settings-refused");
  await ad.goto(`${VA}/integrations/google/callback?state=${"x".repeat(32)}&code=fake-code-stale`);
  await ad.waitForURL(/\/settings\?google=expired/);
  check("a stale callback is refused", await ad.getByText(/That connection attempt expired or didn't match/).isVisible());

  // --- The admin connects -----------------------------------------------------------------------------
  await fake(`/__fake/account?email=${encodeURIComponent(OWNER)}`, "POST");
  await settings(ad);
  await ad.getByRole("link", { name: "Connect the team calendar" }).click();
  await ad.waitForURL(/\/settings\?google=team_connected/, { timeout: 20000 });
  check("connect: back on Settings with a confirmation", await ad.getByText(/Team calendar connected\./).isVisible());
  const row = sql(`select account_email || '|' || left(token_ciphertext, 3) || '|' || (token_ciphertext like '%fake-refresh%')::text || '|' || connected_by from team_calendar`);
  check("connect: stored with the Google email and who connected it, encrypted", row === `${OWNER}|v1.|false|${admin.id}`, row);
  const cals = await waitFor(calendarsOf, (c) => c.length === 1);
  const cal = cals[0];
  check("connect: one calendar called Vabrato, California time, in that account", cals.length === 1 && cal.summary === "Vabrato" && cal.timeZone === "America/Los_Angeles", JSON.stringify(cals));
  const first = ours(await waitFor(() => eventsOn(cal?.id), (e) => ours(e, KEYS).length === FIRST), KEYS);
  check(`connect: ${FIRST} of our events on it`, first.length === FIRST, `${first.length}`);
  const titles = first.map((e) => e.body.summary).join(" / ");
  check("titles name who they're for", /Close of escrow · 1 Fixture Way, Belmont \(QA \d+\) · Jordan Example/.test(titles) && /Close of escrow · 3 Fixture Way.* · Riley Example/.test(titles) && /Inspection · Riley Example/.test(titles), titles);
  check("key dates: removal, close and rent-back end", /Property-condition contingency removal/.test(titles) && /Rent-back ends/.test(titles), titles);
  check("never the test deal or its appointment", !titles.includes("4 Fixture Way") && !titles.includes("Test showing"), titles);
  check("never the draft appointment", !titles.includes("Final walkthrough"), titles);
  check("visible to the team, no attendees, our key", first.every((e) => e.body.visibility === "default" && !e.body.attendees && /^(deal|appt):/.test(e.body.extendedProperties.private.vabratoKey)));
  check("no money or wiring in them; key dates name no client", !/\$|price|wire|wiring/i.test(JSON.stringify(first.map((e) => e.body))) && !/Dana/.test(JSON.stringify(first.filter((e) => e.body.start.date).map((e) => e.body))));
  check("everything recorded is on the calendar once", await waitFor(() => inStep(cal.id), (x) => x));
  check("connect: sync finished, no error", sql(`select (last_synced_at is not null)::text || '|' || coalesce(last_error, 'none') || '|' || (sync_lock_until is null)::text from team_calendar`) === "true|none|true");
  await settings(ad);
  check("admin: status shows the calendar, account and who connected it", await ad.getByText(new RegExp(`“Vabrato” in ${OWNER.replace(/\./g, "\\.")}, connected by Avery Example · last synced`)).isVisible());
  check("admin: Sync now and Disconnect", (await ad.getByRole("button", { name: "Sync now" }).count()) === 1 && (await ad.getByRole("button", { name: "Disconnect the team calendar" }).count()) === 1);
  await ad.getByText("How to share it with the team").click();
  check("admin: the sharing how-to opens", await ad.getByText(/Share with specific people or groups/).isVisible());
  await audit(ad, "admin", "settings-connected");

  // --- Everyone on staff sees it; only admins act -------------------------------------------------------
  await settings(a);
  check("agent: sees it's connected", await a.getByText(/“Vabrato” in .*connected by Avery Example/).isVisible());
  check("agent: no Sync now, no Disconnect", (await a.getByRole("button", { name: "Sync now" }).count()) === 0 && (await a.getByRole("button", { name: "Disconnect the team calendar" }).count()) === 0);
  await audit(a, "agent", "settings-connected");

  // --- Approving an appointment adds it ----------------------------------------------------------------
  await a.goto(`${VA}/appointments/${draftAppt}`);
  await a.waitForLoadState("networkidle");
  await a.getByRole("button", { name: "Put the date and time in the email" }).click();
  await clickAndWait(a, "Approve", "Approved and added to the team calendar.");
  const withAppt = await eventsOn(cal.id);
  const timed = withAppt.find((e) => e.body.extendedProperties?.private?.vabratoKey === `appt:${draftAppt}`);
  check("appointment: on the team calendar, timed, California time, with who", Boolean(timed?.body.start.dateTime) && timed?.body.start.timeZone === "America/Los_Angeles" && timed?.body.summary === "Final walkthrough · Jordan Example", JSON.stringify(timed?.body.summary));
  check("appointment: location and a console link, no attendees", timed?.body.location === "1 Fixture Way, Belmont" && timed?.body.description.includes(`/appointments/${draftAppt}`) && !timed?.body.attendees);
  await a.reload();
  await a.waitForLoadState("networkidle");
  check("appointment page: says it's on the team calendar", await a.getByText("On the team calendar.").isVisible());
  await audit(a, "agent", "appointment-on-calendar");
  await a.goto(`${VA}/appointments/${testAppt}`);
  await a.waitForLoadState("networkidle");
  check("a test deal's appointment page: not on the team calendar", (await a.getByText("On the team calendar.").count()) === 0);

  // --- A cancelled deal's dates go ---------------------------------------------------------------------
  sql(`update deals set status = 'cancelled' where id = '${D2}'`);
  await settings(ad);
  await clickAndWait(ad, "Sync now", "Team calendar updated (1 change).");
  check("cancelled deal: its close of escrow removed", !(await eventsOn(cal.id)).some((e) => e.body.summary.includes("2 Fixture Way")));
  await settings(ad);
  await clickAndWait(ad, "Sync now", "The team calendar is up to date.");
  check("a second sync changes nothing; still in step", await inStep(cal.id));

  // --- The calendar is deleted in Google ---------------------------------------------------------------
  const before = ours(await eventsOn(cal.id), KEYS).length;
  await fake(`/__fake/delete-calendar?id=${encodeURIComponent(cal.id)}`, "POST");
  await settings(ad);
  await clickAndWait(ad, "Sync now", "The “Vabrato” calendar was deleted in Google, so a new one was made: share it with the team again.");
  const again = await calendarsOf();
  const cal2 = again[0];
  check("deleted: a new Vabrato calendar, the old one gone", again.length === 1 && cal2.id !== cal.id && cal2.summary === "Vabrato", JSON.stringify(again));
  check("deleted: every event made again, in step", ours(await eventsOn(cal2.id), KEYS).length === before && (await inStep(cal2.id)));
  check("deleted: the new calendar is recorded", sql(`select calendar_id from team_calendar`) === cal2.id);

  // --- Google revokes the access; reconnecting doesn't duplicate --------------------------------------------
  await fake("/__fake/revoke-all", "POST");
  await settings(ad);
  await clickAndWait(ad, "Sync now", "Google needs an admin to reconnect the team calendar.");
  await settings(a);
  check("revoked: the agent sees it needs an admin", (await a.getByText("Needs reconnecting").isVisible()) && (await a.getByText("An admin needs to reconnect it.").isVisible()));
  await settings(ad);
  check("revoked: Needs reconnecting", await ad.getByText("Needs reconnecting").isVisible());
  await audit(ad, "admin", "settings-reconnect");
  await ad.getByRole("link", { name: "Reconnect the team calendar" }).click();
  await ad.waitForURL(/\/settings\?google=team_connected/, { timeout: 20000 });
  check("reconnected: the same calendar, error cleared", await waitFor(() => sql(`select calendar_id || '|' || coalesce(last_error, 'none') || '|' || (sync_lock_until is null)::text from team_calendar`), (x) => x === `${cal2.id}|none|true`).then((x) => x === `${cal2.id}|none|true`));
  check("reconnected: no duplicate events", (await calendarsOf()).length === 1 && (await inStep(cal2.id)) && ours(await eventsOn(cal2.id), KEYS).length === before);

  // --- Members get nothing ---------------------------------------------------------------------------------
  const s = await signIn(seller.email, /\/(my|login|$)/);
  await s.goto(`${VA}/integrations/google/start?for=team`);
  check("seller: the start route sends them away", !s.url().includes("4030"), s.url());
  check("seller: nothing changed", sql(`select connected_by from team_calendar`) === admin.id);

  // --- Keyboard ----------------------------------------------------------------------------------------
  await settings(ad);
  await ad.locator("body").click({ position: { x: 1, y: 1 } });
  const reached = new Set();
  for (let i = 0; i < 80 && reached.size < 4; i++) {
    await ad.keyboard.press("Tab");
    const f = await ad.evaluate(() => {
      const el = document.activeElement;
      const cs = el ? getComputedStyle(el) : null;
      return { label: (el?.textContent || el?.getAttribute("name") || "").replace(/\s+/g, " ").trim().slice(0, 80), visible: Boolean(cs && ((cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none"))) };
    });
    for (const want of ["How to share it with the team", "Sync now", "Disconnect the team calendar", "confirm"]) if ((f.label === want || f.label.includes(want)) && f.visible) reached.add(want);
  }
  check("keyboard: reaches the how-to, Sync now, the confirm box and Disconnect with visible focus", reached.size === 4, [...reached].join(", "));

  // --- The same Google account for the admin's Drive imports -------------------------------------------------
  sql(`update feature_flags set enabled = true where key = '${DRIVE_FLAG}'`);
  await settings(ad);
  await ad.getByRole("link", { name: "Allow Google Drive imports" }).click();
  await ad.waitForURL(/\/settings\?google=drive_connected/, { timeout: 20000 });
  const driveScopes = sql(`select array_to_string(scopes, ' ') from staff_connections where profile_id = '${admin.id}' and provider = 'google'`);
  check("Drive: its own connection, Drive only (not the calendar)", driveScopes.includes("drive.file") && !driveScopes.includes("calendar"), driveScopes);
  check("Drive: the team calendar still works", (await (async () => (await settings(ad), await clickAndWait(ad, "Sync now", "The team calendar is up to date."), true))()));
  const revokedBefore = revokes();
  await settings(ad);
  await ad.getByRole("checkbox", { name: /Stop updating the team calendar and remove the console's access/ }).check();
  await ad.getByRole("button", { name: "Disconnect the team calendar" }).click();
  await ad.waitForURL(/\/settings\?google=team_disconnected_shared$/, { timeout: 20000 });
  check("disconnect (shared account): says Drive keeps the access", await ad.getByText(/That Google account is also used for Drive imports/).isVisible());
  check("disconnect (shared account): nothing revoked", revokes() === revokedBefore);
  check("disconnect: records gone", sql(`select (select count(*) from team_calendar) + (select count(*) from team_calendar_events)`) === "0");
  check("disconnect: the calendar and its events stay in Google", (await calendarsOf()).length === 1 && ours(await eventsOn(cal2.id), KEYS).length === before);
  check("disconnect: Drive still connected, no error", sql(`select coalesce(last_error, 'none') from staff_connections where profile_id = '${admin.id}' and provider = 'google'`) === "none");
  await audit(ad, "admin", "settings-disconnected");
  await settings(ad);
  await ad.getByRole("checkbox", { name: /Remove the console's access to my Google Drive/ }).check();
  await ad.getByRole("button", { name: "Disconnect Google Drive" }).click();
  await ad.waitForURL(/\/settings\?google=disconnected$/, { timeout: 20000 });
  check("then Drive disconnects and revokes", (await ad.getByText(/Google Drive imports disconnected, and the console's access/).isVisible()) && revokes() === revokedBefore + 1);
  check("the fake's log holds no tokens", !/fake-refresh|fake-access|fake-code/.test(readFileSync(GLOG, "utf8")));

  // --- Switch off again ---------------------------------------------------------------------------------
  await settings(ad);
  await clickAndWait(ad, "Turn Team Google Calendar off", "The team Google Calendar is off.");
  await settings(ad);
  check("switched off: Connect is gone", (await ad.getByRole("link", { name: "Connect the team calendar" }).count()) === 0);
} finally {
  sql(`update feature_flags set enabled = false where key = '${FLAG}'`);
  sql(`update feature_flags set enabled = ${driveWasOn} where key = '${DRIVE_FLAG}'`);
  sql(`delete from team_calendar_events`);
  sql(`delete from team_calendar`);
  sql(`delete from staff_connections where profile_id in ('${admin.id}', '${agent.id}', '${agent2.id}', '${seller.id}')`);
  sql(`delete from ai_drafts where id in ('${draftAppt}', '${rileyAppt}', '${testAppt}')`);
  sql(`delete from deals where id in ('${D1}', '${D2}', '${D3}', '${DT}')`);
  sql(`delete from staff_audit where actor_id = '${admin.id}'`);
  for (const p of [admin, agent, agent2, seller]) sql(`delete from auth.users where id = '${p.id}'`);
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
check(
  "cleanup: nothing left",
  sql(`select (select count(*) from deals where address like '%(QA ${stamp})') + (select count(*) from profiles where email like '%.${stamp}@example.test') + (select count(*) from team_calendar) + (select count(*) from team_calendar_events) + (select count(*) from staff_connections)`) === "0",
);
check("cleanup: switches back", sql(`select enabled from feature_flags where key = '${FLAG}'`) === "f" && sql(`select enabled from feature_flags where key = '${DRIVE_FLAG}'`) === (driveWasOn ? "t" : "f"));
done();
