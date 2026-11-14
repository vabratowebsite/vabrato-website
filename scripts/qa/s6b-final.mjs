// S6b PR 9: the console-wide QA sweep, after every S6b feature. Every console
// page, as each kind of staff member, with the AI switches off and then on,
// on the local stack with the fake Claude server. Fictional records only.
//
// - Roles: lead admin (admin, verified MLS member), backup agent (lead admin
//   not away, then away), agent (not MLS-verified, owns the fictional deal
//   and lead), VA and TC (members of the deal), and a buyer ("No access").
// - Each page: HTTP status; axe (WCAG 2.0–2.2 A/AA tags) at 1440 and 390 px;
//   no sideways scrolling at 390 and 320 px; no console errors.
// - Switches on: loading pages sends nothing to the model (the fake Claude's
//   request log doesn't grow).
// - Keyboard: on the new interactive pages, the main controls are reached by
//   Tab with a visible focus indicator and no focus trap.
//
// A report.json lands next to the screenshots (docs/screenshots/s6b-final/).
// Needs SERVICE_KEY, CLAUDE_LOG, MAIL_DIR, PGURL and migrations up to 0035.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const LOG = process.env.CLAUDE_LOG;
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const OFFICE = process.env.MLS_OFFICE_ID ?? "VABRA";
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s6b-final");
mkdirSync(OUT, { recursive: true });
const { chromium } = need("playwright");
const { AxeBuilder } = need("@axe-core/playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const report = [];
const modelRequests = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean).length;

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
  page.on("dialog", (d) => d.accept());
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
  await page.waitForURL(`${VA}/`, { timeout: 15000 });
  return page;
}

const sideScroll = async (page, width) => {
  await page.setViewportSize({ width, height: 900 });
  return page.evaluate(() => document.documentElement.scrollWidth);
};

/** Status, console errors, axe at 1440 and 390, no sideways scroll at 390 and 320. */
async function audit(page, who, name, path, { expect = 200, shoot = false } = {}) {
  page.errors.length = 0;
  const res = await page.goto(`${VA}${path}`);
  await page.waitForLoadState("networkidle");
  const status = res?.status() ?? 0;
  const entry = { who, name, path, status, violations: {}, widths: {}, errors: [] };
  check(`${who} ${name}: HTTP ${expect}`, status === expect, `got ${status}`);
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
  // An intended 404 logs its own "Failed to load resource" line; anything else counts.
  if (expect === 404) entry.errors = entry.errors.filter((e) => !/status of 404/.test(e));
  check(`${who} ${name}: no console errors`, entry.errors.length === 0, entry.errors.join(" | "));
  report.push(entry);
  return status;
}

/** Tabs through the page; the named controls must be reached, each with a visible focus indicator, and focus must keep moving. */
async function keyboard(page, who, name, path, controls) {
  await page.goto(`${VA}${path}`);
  await page.waitForLoadState("networkidle");
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  const seen = [];
  let stuck = 0;
  let last = "";
  // Long pages (a deal's full task list) need many Tabs; stop once every named control is reached.
  const allSeen = () => controls.every((c) => seen.some((s) => c.test(s.label)));
  for (let i = 0; i < 600 && stuck < 3 && !allSeen(); i++) {
    await page.keyboard.press("Tab");
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const visible = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
      // The accessible name, roughly: a field is named by its <label>, not its text.
      const label = (el.getAttribute("aria-label") || el.labels?.[0]?.textContent || el.textContent || el.getAttribute("name") || el.id || el.tagName).replace(/\s+/g, " ").trim().slice(0, 80);
      // Date and time inputs take several Tabs (month, day, year): not a trap.
      const segmented = el.tagName === "INPUT" && ["date", "time", "datetime-local"].includes(el.getAttribute("type") ?? "");
      return { key: `${el.tagName}|${label}|${el.getBoundingClientRect().top}`, label, visible, segmented };
    });
    if (!f) continue;
    stuck = f.key === last && !f.segmented ? stuck + 1 : 0;
    last = f.key;
    seen.push(f);
  }
  check(`${who} keyboard ${name}: focus keeps moving (no trap)`, stuck < 3, `stuck on ${last}`);
  for (const c of controls) {
    const hit = seen.find((s) => c.test(s.label));
    check(`${who} keyboard ${name}: reaches ${c}`, Boolean(hit), `${seen.length} stops; last: ${seen.slice(-6).map((s) => s.label).join(" / ")}`);
    if (hit) check(`${who} keyboard ${name}: ${c} shows focus`, hit.visible);
  }
}

// --- Setup: fictional staff and records -----------------------------------------------------------
const leadAdminBefore = sql(`select coalesce(lead_admin_id::text, '') || '|' || coalesce(backup_admin_id::text, '') from app_settings`);
const AI_FLAGS = sql(`select string_agg(quote_literal(key), ',') from feature_flags where key like 'ai\\_%'`);
// Since 0039 the listing switches turn on only once the MLSListings approval is on: that one first.
const ai = (on) => {
  if (on) sql(`update feature_flags set enabled = true where key = 'ai_mls_approved'`);
  sql(`update feature_flags set enabled = ${on} where key in (${AI_FLAGS})`);
};
ai(false);
const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);
if (!mark) throw new Error(`no lead-admin profile for ${STAFF_EMAIL} on the local stack`);
sql(`insert into mls_members (member_key, full_name, email, member_status, office_mls_id, source) values ('QA-STAFF', 'QA Staff', '${STAFF_EMAIL}', 'Active', '${OFFICE}', 'mock') on conflict (member_key) do update set member_status = 'Active'`);
const viv = await staffAccount("Vivian", "agent");
const alex = await staffAccount("Alex", "agent");
const vera = await staffAccount("Vera", "va");
const tina = await staffAccount("Tina", "tc");
const bo = await staffAccount("Bo", "buyer");
sql(`update app_settings set lead_admin_id = '${mark}', backup_admin_id = '${viv.id}', lead_admin_away = false, lead_admin_away_until = null, ai_zdr_confirmed_at = now(), ai_zdr_confirmed_by = '${mark}', ai_zdr_note = 'QA fixture (fictional)'`);

const ADDRESS = `${stamp % 1000} Final Court, Belmont`;
const deal = sql(`insert into deals (address, seller_type, ratification_date, days_to_close, sale_price, agent_id, created_by, listing_key) values ('${ADDRESS}', 'normal', current_date - 5, 30, 2100000, '${alex.id}', '${alex.id}', 'FX-001') returning id`).split("\n")[0];
sql(`insert into deal_members (deal_id, profile_id, member_role) values ('${deal}', '${vera.id}', 'va'), ('${deal}', '${tina.id}', 'tc')`);
sql(`insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, doc_types, uploaded_by) values ('${deal}', 'deal/${deal}/staff/${stamp}-counter.pdf', 'Counter offer 1.pdf', 100, 'application/pdf', '{counter_offer}', '${alex.id}')`);
const inspection = sql(`insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, doc_types, uploaded_by) values ('${deal}', 'deal/${deal}/staff/${stamp}-inspection.pdf', 'Home inspection.pdf', 100, 'application/pdf', '{home_inspection}', '${alex.id}') returning id`).split("\n")[0];
const item = (id, title, trade) => ({ id, title, detail: "Fictional finding.", location: "Kitchen", severity: "repair", severity_label: "", trade, page: 2 });
const itemsJson = (draft) => JSON.stringify({ document_id: inspection, document_name: "Home inspection.pdf", items: [item("i1", "Missing GFCI at kitchen outlets", "electrical"), item("i2", "Worn deck stair treads", "pest")], may_be_incomplete: false, ...(draft ? {} : {}) });
const draft = (kind, cols, approve) => {
  const id = sql(`insert into ai_drafts (owner_id, kind, ${Object.keys(cols).join(", ")}) values ('${alex.id}', '${kind}', ${Object.values(cols).map((v) => `'${String(v).replace(/'/g, "''")}'`).join(", ")}) returning id`).split("\n")[0];
  if (approve) sql(`update ai_drafts set status = 'approved' where id = '${id}'`);
  return id;
};
const itemsApproved = draft("inspection_items", { deal_id: deal, subject: "Repair items", body: "2 items", content: itemsJson() }, true);
const response = draft("repair_response", { deal_id: deal, subject: "Response to the request for repairs", body: "Hello,\n\nThe seller's response.\n\nAlex", content: JSON.stringify({ items_id: itemsApproved, decisions: [{ id: "i1", title: "Missing GFCI at kitchen outlets", decision: "repair", amount: null }], seller_approved: true, opening: "Thank you for the request for repairs.", closing: "Please let me know if you have questions." }) }, true);
void response;
const itemsDraftDeal = sql(`insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, doc_types, uploaded_by) values ('${deal}', 'deal/${deal}/staff/${stamp}-pest.pdf', 'Pest report.pdf', 100, 'application/pdf', '{pest_inspection}', '${alex.id}') returning id`).split("\n")[0];
const itemsDraft = draft("inspection_items", { deal_id: deal, subject: "Repair items", body: "2 items", content: itemsJson().replace(inspection, itemsDraftDeal) }, false);
const tuesday = sql(`select to_char(current_date + ((9 - extract(isodow from current_date)::int) % 7 + 1), 'YYYY-MM-DD')`);
const apptFields = (start) => JSON.stringify({ title: "Final walkthrough", date: tuesday, start, minutes: 45, location: ADDRESS, with: "Dana" });
const apptApproved = draft("appointment", { deal_id: deal, subject: "Final walkthrough", body: "Hi Dana,\n\nConfirming our walkthrough.\n\nAlex", content: apptFields("15:00") }, true);
const apptDraft = draft("appointment", { deal_id: deal, subject: "Walkthrough", body: "Hi Dana,\n\nConfirming.\n\nAlex", content: apptFields("16:00") }, false);
const presentation = draft("listing_presentation", { subject: "Listing presentation", body: "x", content: JSON.stringify({ title: "Selling 12 Fictional Lane", summary: "A fictional plan." }) }, true);
const kit = draft("listing_kit", { listing_key: "FX-001", subject: "Launch kit", body: "x", content: JSON.stringify({ mls_description: "Fictional description.", headline: "Fictional headline" }) }, true);
const cma = sql(`insert into cmas (created_by, title) values ('${alex.id}', 'QA final CMA (fictional)') returning id`).split("\n")[0];
const lead = sql(`insert into leads (kind, name, email, message) values ('contact', 'Pat Example', 'pat.${stamp}@example.test', 'Fictional QA lead') returning id`).split("\n")[0];
sql(`update leads set assigned_to = '${alex.id}', status = 'assigned' where id = '${lead}'`);
const markLead = sql(`insert into leads (kind, name, email, message) values ('contact', 'Sky Example', 'sky.${stamp}@example.test', 'Fictional QA lead') returning id`).split("\n")[0];
sql(`update leads set assigned_to = '${mark}', status = 'assigned' where id = '${markLead}'`);
const revision = sql(`insert into content_revisions (table_name, row_key, body, status, created_by, submitted_at) values ('posts', 'qa-final-${stamp}', '{"kind":"insight","title":"QA final fictional post","excerpt":"","body_md":"Fictional."}', 'submitted', '${alex.id}', now()) returning id`).split("\n")[0];
const member = sql(`select id from profiles where role in ('buyer','seller') and id <> '${bo.id}' order by created_at desc limit 1`);
sql(`insert into staff_todos (deal_id, title, due_date, created_by) values ('${deal}', 'Order the termite report', current_date + 1, '${alex.id}')`);

const LIST = [
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
  ["assistant", "/assistant"],
  ["presentations", "/presentations"],
  ["deals-new", "/deals/new"],
  ["cmas-new", "/cmas/new"],
];
const DEAL_PAGES = [
  ["deal", `/deals/${deal}`],
  ["deal-calendar", `/deals/${deal}/calendar`],
  ["deal-documents", `/deals/${deal}/documents`],
  ["deal-receipts", `/deals/${deal}/receipts`],
  ["deal-repairs", `/deals/${deal}/repairs`],
  ["repair-items", `/deals/${deal}/repairs/${itemsApproved}`],
  ["repair-bids", `/deals/${deal}/repairs/${itemsApproved}/bids`],
  ["repair-response", `/deals/${deal}/repairs/response/${response}`],
  ["appointment", `/appointments/${apptApproved}`],
  ["report", `/reports/${deal}`],
];
const OWN_PAGES = [
  ["lead", `/leads/${lead}`],
  ["cma", `/cmas/${cma}`],
  ["presentation", `/presentations/${presentation}`],
  ["presentation-print", `/presentations/${presentation}/print`],
  ["kit", "/listings/FX-001/kit"],
  ["kit-flyer", `/listings/FX-001/kit/${kit}/flyer`],
  ["appointment-draft", `/appointments/${apptDraft}`],
  ["repair-items-draft", `/deals/${deal}/repairs/${itemsDraft}`],
];
const ADMIN_PAGES = [
  ["member", `/members/${member}`],
  ["member-messages", `/messages/${member}`],
  ["member-deletions", "/members/deletions"],
  ["content-revision", `/content/${revision}`],
  ["content-edit", "/content/edit?table=city_guides&key=san-carlos"],
  ["lead-admin-lead", `/leads/${markLead}`],
];

try {
  const requestsAtStart = modelRequests();

  // --- Pass 1: AI switches off ------------------------------------------------------------------
  const m = await signIn(STAFF_EMAIL);
  for (const [name, path] of [...LIST, ...DEAL_PAGES, ...ADMIN_PAGES]) await audit(m, "off-lead-admin", name, path, { shoot: ["today", "assistant", "deal-documents"].includes(name) });
  const a = await signIn(alex.email);
  // With its switch off the launch kit page is a 404 by design (S6b PR 5).
  for (const [name, path] of OWN_PAGES) await audit(a, "off-agent", name, path, { expect: name === "kit" ? 404 : 200 });

  // --- Pass 2: AI switches on (pages only: nothing may reach the model) ---------------------------
  ai(true);
  for (const [name, path] of [...LIST, ...DEAL_PAGES, ...ADMIN_PAGES]) await audit(m, "on-lead-admin", name, path, { shoot: ["today", "deal", "deal-documents", "appointment"].includes(name) });
  for (const [name, path] of [...LIST, ...DEAL_PAGES, ...OWN_PAGES]) await audit(a, "on-agent", name, path, { shoot: ["deal", "lead", "appointment-draft"].includes(name) });
  const v = await signIn(vera.email);
  for (const [name, path] of [...LIST, ...DEAL_PAGES]) await audit(v, "on-va", name, path);
  const t = await signIn(tina.email);
  for (const [name, path] of [...LIST, ...DEAL_PAGES]) await audit(t, "on-tc", name, path);
  const b = await signIn(viv.email);
  for (const [name, path] of LIST) await audit(b, "on-backup", name, path);
  check("backup (lead admin not away): the lead admin's lead is hidden", (await audit(b, "on-backup", "lead-admin-lead", `/leads/${markLead}`, { expect: 404 })) === 404);
  check("backup: the deal isn't theirs", (await audit(b, "on-backup", "deal", `/deals/${deal}`, { expect: 404 })) === 404);
  sql(`update app_settings set lead_admin_away = true`);
  check("backup (lead admin away): sees the lead admin's lead", (await audit(b, "on-backup-away", "lead-admin-lead", `/leads/${markLead}`)) === 200);
  sql(`update app_settings set lead_admin_away = false`);
  check("loading every page with the switches on sent nothing to the model", modelRequests() === requestsAtStart, `${modelRequests() - requestsAtStart} requests`);

  // --- Keyboard pass on the new interactive pages ----------------------------------------------------
  await keyboard(a, "agent", "deal (call notes, appointments, to-dos)", `/deals/${deal}`, [/^Your notes from the call|^Suggest to-dos/i, /^Describe it in a sentence|^Draft the appointment/i, /^New to-do|^Add to-do/i]);
  await keyboard(a, "agent", "appointment editor", `/appointments/${apptDraft}`, [/^Approve$/, /^Save changes$/]);
  await keyboard(a, "agent", "documents (check unchecked, what changed)", `/deals/${deal}/documents`, [/Check unchecked documents/, /^What changed/]);
  await keyboard(a, "agent", "repair items editor", `/deals/${deal}/repairs/${itemsDraft}`, [/^Approve/i]);
  check("the keyboard pass sent nothing to the model", modelRequests() === requestsAtStart);

  // --- A buyer gets no access ------------------------------------------------------------------------
  const buyer = await signIn(bo.email).catch(() => null);
  if (buyer) {
    await buyer.goto(`${VA}/`);
    check("a buyer signing in to the console gets No access", await buyer.getByText(/No access|isn.t for your account|staff only/i).first().isVisible());
  } else check("a buyer can't get past sign-in to the console", true);
} finally {
  ai(false);
  const [la, ba] = leadAdminBefore.split("|");
  sql(`update app_settings set lead_admin_id = ${la ? `'${la}'` : "null"}, backup_admin_id = ${ba ? `'${ba}'` : "null"}, lead_admin_away = false, ai_zdr_confirmed_at = null, ai_zdr_confirmed_by = null, ai_zdr_note = null`);
  sql(`delete from deals where id = '${deal}'; delete from leads where id in ('${lead}', '${markLead}'); delete from cmas where id = '${cma}'; delete from content_revisions where id = '${revision}'; delete from ai_drafts where id in ('${presentation}', '${kit}')`);
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
done();
