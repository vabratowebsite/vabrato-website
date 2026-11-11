// S6 QA pass (PR 6): every agent-console page as each kind of staff member,
// plus a client who tries the console, and the lead-to-Mark timing.
//
//   - Lead admin (Mark, an admin and a verified MLS member): every page and
//     the main detail pages, axe at 1440 and 390 px, full-page screenshots in
//     docs/screenshots/s6/ (lead-admin-*).
//   - Backup (Viv, an agent): with Mark not away, only her own leads and no
//     publishing; with Mark away, every lead and the publish button.
//   - Agent (not MLS-verified), VA: every page loads with axe clean at both
//     widths; they see only their own leads; a few screenshots per role.
//   - A buyer signing in to the console gets "No access".
//   - Timing: a website contact form → Mark's alert email at the fake Resend,
//     measured from the lead's created_at (needs < 60 s; the done-when on
//     hosted still needs real Resend).
//
// A report.json lands next to the screenshots. Exits 1 if anything fails.
// Same local stack as s6-lead-alert.mjs (apps/web :3003, apps/va :3000 with
// CRON_SECRET, RESEND_BASE_URL, MLS_OFFICE_ID; fake Resend writing
// RESEND_LOG) plus SERVICE_KEY to create the fictional staff accounts.
//
//   QA_TOOLS=… MAIL_DIR=… PGURL=… SERVICE_KEY=… RESEND_LOG=… CRON_SECRET=… node scripts/qa/s6-qa.mjs [--out docs/screenshots/s6]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BASE, check, done, linkFor, mails, need, sql } from "./lib.mjs";

const args = process.argv.slice(2);
const OUT = resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : "docs/screenshots/s6");
mkdirSync(OUT, { recursive: true });
const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const OFFICE = process.env.MLS_OFFICE_ID ?? "VABRA";
const LOG = process.env.RESEND_LOG;
const SECRET = process.env.CRON_SECRET;
if (!LOG || !SECRET || !process.env.SERVICE_KEY) throw new Error("set RESEND_LOG, CRON_SECRET and SERVICE_KEY");
const { chromium } = need("playwright");
const { AxeBuilder } = need("@axe-core/playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const report = [];

const PAGES = [
  ["today", "/"],
  ["leads", "/leads?view=all"],
  ["members", "/members"],
  ["messages", "/messages"],
  ["listings", "/listings"],
  ["open-houses", "/open-houses"],
  ["mls", "/mls"],
  ["content", "/content"],
  ["featured", "/featured"],
  ["reports", "/reports"],
  ["stats", "/stats"],
  ["cmas", "/cmas"],
  ["deals", "/deals"],
  ["vendors", "/vendors"],
  ["profile", "/profile"],
  ["settings", "/settings"],
];

/** Status, axe at both widths, optional screenshots. */
async function audit(page, who, name, path, { expect = 200, shoot = false } = {}) {
  const res = await page.goto(`${VA}${path}`);
  await page.waitForLoadState("networkidle");
  const status = res?.status() ?? 0;
  const entry = { who, name, path, status, violations: {} };
  check(`${who} ${name}: HTTP ${expect}`, status === expect, `got ${status}`);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    entry.violations[width] = r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5) }));
    check(`${who} axe ${name} @${width}`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`).join("; "));
    if (shoot) await page.screenshot({ path: join(OUT, `${who}-${name}-${width}.jpg`), fullPage: true, type: "jpeg", quality: 70 });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  report.push(entry);
  return status;
}

async function staffAccount(first, role) {
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
  const before = mails();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText(/Check your email/).waitFor();
  await page.goto(await linkFor(email, before));
  await page.waitForURL(`${VA}/`, { timeout: 15000 });
  return page;
}

const sent = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

// --- Setup: fictional staff, routing, a lead per owner, a revision to approve ---------------
const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);
sql(`insert into mls_members (member_key, full_name, email, member_status, office_mls_id, source) values ('QA-STAFF', 'QA Staff', '${STAFF_EMAIL}', 'Active', '${OFFICE}', 'mock') on conflict (member_key) do update set member_status = 'Active'`);
const viv = await staffAccount("Vivian", "agent");
const alex = await staffAccount("Alex", "agent");
const vera = await staffAccount("Vera", "va");
sql(`update app_settings set lead_admin_id = '${mark}', backup_admin_id = '${viv.id}', lead_admin_away = false, lead_admin_away_until = null`);
sql(`update feature_flags set enabled = false where key in ('market_stats_enabled', 'cma_enabled', 'public_stats', 'full_data_enabled')`);

// Timing: a visitor's contact form → Mark's alert email.
const visitor = `sky.${stamp}@example.test`;
{
  const web = await (await browser.newContext()).newPage();
  await web.goto(`${BASE}/contact`);
  await web.getByLabel("Name").fill("Sky Example");
  await web.getByLabel("Email (required)").fill(visitor);
  await web.getByRole("button", { name: "Send message" }).click();
  await web.getByText(/Thanks/).waitFor();
  await web.context().close();
}
const lead = sql(`select id from leads where email = '${visitor}'`);
const createdMs = Number(sql(`select (extract(epoch from created_at) * 1000)::bigint from leads where id = '${lead}'`));
const before = sent().length;
await fetch(`${VA}/api/notifications/process`, { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } });
const alert = sent()
  .slice(before)
  .find((m) => m.body?.to === STAFF_EMAIL && /^New /.test(m.body?.subject ?? ""));
const ms = alert ? alert.at - createdMs : null;
check("lead → Mark's alert email at the sender in under 60 s", ms !== null && ms < 60000, ms === null ? "no email" : `${ms} ms`);
check("the lead went to Mark", sql(`select assigned_to from leads where id = '${lead}'`) === mark);

const alexLead = sql(`insert into leads (kind, name, email, message) values ('contact', 'Pat Example', 'pat.${stamp}@example.test', 'Fictional QA lead') returning id`).split("\n")[0];
sql(`update leads set assigned_to = '${alex.id}' where id = '${alexLead}'`);
const revision = sql(`insert into content_revisions (table_name, row_key, body, status, created_by, submitted_at)
  values ('posts', 'qa-s6-${stamp}', '{"kind":"insight","title":"QA S6 fictional post","excerpt":"","body_md":"Fictional."}', 'submitted', '${alex.id}', now()) returning id`).split("\n")[0];
const member = sql(`select id from profiles where role in ('buyer','seller','both') order by created_at desc limit 1`);
const deal = sql(`select id from deals where listing_key is not null and status = 'active' order by created_at limit 1`);

try {
  // --- Lead admin: everything, with screenshots -------------------------------------------
  const m = await signIn(STAFF_EMAIL);
  for (const [name, path] of PAGES) await audit(m, "lead-admin", name, path, { shoot: true });
  await audit(m, "lead-admin", "lead", `/leads/${lead}`, { shoot: true });
  await audit(m, "lead-admin", "member", `/members/${member}`, { shoot: true });
  await audit(m, "lead-admin", "content-revision", `/content/${revision}`, { shoot: true });
  await audit(m, "lead-admin", "content-edit", "/content/edit?table=city_guides&key=san-carlos", { shoot: true });
  if (deal) await audit(m, "lead-admin", "report", `/reports/${deal}`, { shoot: true });
  if (deal) await audit(m, "lead-admin", "deal", `/deals/${deal}`, { shoot: true });
  await m.goto(`${VA}/leads?view=all`);
  const listed = async (p, id) => (await p.locator(`main a[href="/leads/${id}"]`).count()) > 0;
  check("lead admin sees every lead", (await listed(m, lead)) && (await listed(m, alexLead)));
  await m.goto(`${VA}/content/${revision}`);
  check("lead admin can approve and publish", (await m.getByRole("button", { name: "Approve and publish" }).count()) === 1);
  await m.goto(`${VA}/settings`);
  check("lead admin can change routing", (await m.getByRole("button", { name: "Save routing" }).count()) === 1);
  check("lead admin is a verified MLS member", await m.getByText(/Verified as an active MLSListings member/).isVisible());

  // --- Backup, Mark not away, then away ----------------------------------------------------
  const v = await signIn(viv.email);
  for (const [name, path] of PAGES) await audit(v, "backup", name, path, { shoot: name === "leads" });
  check("backup (Mark not away): Mark's lead is hidden", (await audit(v, "backup", "marks-lead", `/leads/${lead}`, { expect: 404 })) === 404);
  await v.goto(`${VA}/content/${revision}`);
  check("backup (Mark not away): can't publish", (await v.getByRole("button", { name: "Approve and publish" }).count()) === 0);
  sql(`update app_settings set lead_admin_away = true`);
  await audit(v, "backup-away", "leads", "/leads?view=all", { shoot: true });
  check("backup (Mark away): sees Mark's lead", (await audit(v, "backup-away", "marks-lead", `/leads/${lead}`, { shoot: true })) === 200);
  await v.goto(`${VA}/content/${revision}`);
  check("backup (Mark away): can approve and publish", (await v.getByRole("button", { name: "Approve and publish" }).count()) === 1);
  sql(`update app_settings set lead_admin_away = false`);

  // --- Agent, not MLS-verified ---------------------------------------------------------------
  const a = await signIn(alex.email);
  for (const [name, path] of PAGES) await audit(a, "agent", name, path, { shoot: ["leads", "settings", "cmas"].includes(name) });
  await a.goto(`${VA}/leads?view=all`);
  check("agent sees their own lead only", (await listed(a, alexLead)) && !(await listed(a, lead)));
  check("agent: Mark's lead is hidden", (await audit(a, "agent", "marks-lead", `/leads/${lead}`, { expect: 404 })) === 404);
  await audit(a, "agent", "own-lead", `/leads/${alexLead}`, { shoot: true });
  await a.goto(`${VA}/settings`);
  check("unverified agent: Settings says MLS access isn't verified", !(await a.getByText(/Verified as an active MLSListings member/).isVisible()));
  await a.goto(`${VA}/content/${revision}`);
  check("agent can't publish their own revision", (await a.getByRole("button", { name: "Approve and publish" }).count()) === 0);
  await a.goto(`${VA}/settings`);
  check("agent can't change routing", (await a.getByRole("button", { name: "Save routing" }).count()) === 0);

  // --- VA -------------------------------------------------------------------------------------
  const va = await signIn(vera.email);
  for (const [name, path] of PAGES) await audit(va, "va", name, path, { shoot: name === "today" });
  check("VA: Mark's lead is hidden", (await audit(va, "va", "marks-lead", `/leads/${lead}`, { expect: 404 })) === 404);

  // --- A buyer tries the console -------------------------------------------------------------
  const buyer = await staffAccount("Jamie", "buyer");
  const b = await signIn(buyer.email).catch(() => null);
  if (b) {
    await audit(b, "member", "console", "/", { shoot: true });
    check("a client signing in to the console gets No access", await b.getByRole("heading", { name: "No access", exact: true }).isVisible());
  } else {
    check("a client signing in to the console gets No access", false, "sign-in failed");
  }
} finally {
  sql(`update app_settings set lead_admin_away = false, backup_admin_id = null`);
  sql(`delete from content_revisions where id = '${revision}'`);
  writeFileSync(join(OUT, "report.json"), JSON.stringify({ at: new Date().toISOString(), leadToSenderMs: ms, pages: report }, null, 2));
}

await browser.close();
console.log(`screenshots and report: ${OUT}`);
done();
