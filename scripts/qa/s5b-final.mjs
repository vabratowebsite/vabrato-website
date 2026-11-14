// S5b PR 7: the member-portal sweep, after every S5b feature. Every /my page,
// as each kind of member, with the AI switches in four states, on the local
// stack with the fake Claude server. Fictional people and records only.
//
// - Roles: a buyer (saved homes, VOW terms accepted, an agent), a seller (a
//   sale linked to FX-001, our listing), a "both" member, a buyer without an
//   agent, and a staff member visiting /my.
// - States: every AI switch off; all 13 member switches on (with the master
//   switch, a ZDR fixture and the MLSListings approval); on with the member
//   daily limit at 0; the master switch off with the member switches on.
// - Each page: HTTP status; axe (WCAG 2.0–2.2 A/AA) at 1440 and 390 px; no
//   sideways scrolling at 390 and 320 px; no console errors; loading pages
//   sends nothing to the model.
// - Each state shows what it should (menus, modes per role, the limit message).
// - One ask per mode (13) with the fake: each card is labelled AI.
// - Keyboard: every mode's fields, the flyer card, My to-dos and My flyers.
//
// A report.json lands next to the screenshots (docs/screenshots/s5b-final/).
// Needs SERVICE_KEY, CLAUDE_LOG, MAIL_DIR, PGURL, REVALIDATE_SECRET, migrations
// up to 0041 and the MLS fixtures seeded.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BASE, check, done, joinAs, linkFor, mails, need, sql } from "./lib.mjs";

const LOG = process.env.CLAUDE_LOG;
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const STORAGE = process.env.STORAGE_DIR ?? "/var/tmp/vabrato-auth/storage-files";
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s5b-final");
mkdirSync(OUT, { recursive: true });
const { chromium } = need("playwright");
const { AxeBuilder } = need("@axe-core/playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const report = [];
const logLines = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean);
const modelRequests = () => logLines().length;
const memberCalls = () => logLines().filter((l) => /"feature":"member_/.test(l)).length;
const day = (n) => sql(`select (current_date + ${n})::text`);

// --- What this run changes, to put back -------------------------------------------------------
const AI_FLAGS = sql(`select string_agg(quote_literal(key), ',') from feature_flags where key like 'ai\\_%'`);
const MEMBER_FLAGS = sql(`select string_agg(quote_literal(key), ',') from feature_flags where key like 'ai\\_member\\_%'`);
const flagsBefore = sql(`select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key like 'ai\\_%' or key = 'vow_enabled'`);
const settingsBefore = sql(`select coalesce(ai_zdr_confirmed_at::text, '') || '|' || coalesce(ai_zdr_confirmed_by::text, '') || '|' || coalesce(ai_zdr_note, '') || '|' || ai_daily_requests_member || '|' || ai_daily_tokens_member from app_settings`);
const setVow = async (on) => {
  sql(`update feature_flags set enabled = ${on} where key = 'vow_enabled'`);
  const res = await fetch(`${BASE}/api/revalidate?tag=content`, { method: "POST", headers: { "x-revalidate-secret": process.env.REVALIDATE_SECRET ?? "" } });
  if (!res.ok) throw new Error(`revalidate failed: ${res.status} (set REVALIDATE_SECRET)`);
};
const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);
const state = {
  off: () => sql(`update feature_flags set enabled = false where key in (${AI_FLAGS})`),
  on: () => {
    sql(`update app_settings set ai_zdr_confirmed_at = coalesce(ai_zdr_confirmed_at, now()), ai_zdr_confirmed_by = coalesce(ai_zdr_confirmed_by, '${mark}'), ai_zdr_note = coalesce(ai_zdr_note, 'QA fixture (fictional)'), ai_daily_requests_member = 1000, ai_daily_tokens_member = 100000000`);
    sql(`update feature_flags set enabled = true where key in ('ai_enabled', 'ai_mls_approved')`);
    sql(`update feature_flags set enabled = true where key in (${MEMBER_FLAGS})`);
  },
  limit0: () => sql(`update app_settings set ai_daily_requests_member = 0`),
  masterOff: () => {
    sql(`update app_settings set ai_daily_requests_member = 1000`);
    sql(`update feature_flags set enabled = false where key = 'ai_enabled'`);
  },
};
state.off();

// --- People and records ------------------------------------------------------------------------
async function member(role, first) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.errors = errors;
  const email = `${first.toLowerCase()}.${stamp}@example.test`;
  await joinAs(page, { email, name: `${first} Example`, role });
  return { page, id: sql(`select id from profiles where email = '${email}'`) };
}
const pdf = (title, pages = 4) => Buffer.from(`%PDF-1.4\n% ${title} (fictional QA file)\n% QA-MODE: ok\n1 0 obj << /Type /Pages /Count ${pages} >> endobj\n%%EOF\n`);
const stored = [];
function memberDoc(profile, name, bytes) {
  const path = `member/${profile}/${stamp}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
  sql(`insert into member_documents (profile_id, name, storage_path, size_bytes, content_type, uploaded_by) values ('${profile}', '${name}', '${path}', ${bytes.length}, 'application/pdf', '${profile}')`);
  sql(`insert into storage.objects (bucket_id, name, owner) values ('member-docs', '${path}', '${profile}')`);
  mkdirSync(join(STORAGE, "member-docs", "member", profile), { recursive: true });
  writeFileSync(join(STORAGE, "member-docs", path), bytes);
  writeFileSync(join(STORAGE, "member-docs", `${path}.type`), "application/pdf");
  stored.push(path);
}

const jordan = await member("buyer", "Jordan"); // buyer, VOW accepted, an agent
const riley = await member("seller", "Riley"); // seller, a sale linked to our FX-001
const sam = await member("both", "Sam"); // buying and selling: every mode
const noel = await member("buyer", "Noel"); // a buyer without an agent
sql(`update profiles set agent_id = '${mark}' where id in ('${jordan.id}', '${riley.id}', '${sam.id}')`);
sql(`update profiles set vow_accepted_at = now() where id = '${jordan.id}'`);
sql(`insert into saved_homes (profile_id, listing_key) values ('${jordan.id}', 'FX-001'), ('${jordan.id}', 'FX-002'), ('${sam.id}', 'FX-001'), ('${sam.id}', 'FX-002'), ('${sam.id}', 'FX-013')`);
const deal = sql(`insert into deals (address, ratification_date, days_to_close, agent_id, created_by, listing_key) values ('${stamp % 1000} Final Lane, Belmont', current_date, 30, '${mark}', '${mark}', 'FX-001') returning id`).split("\n")[0];
sql(`insert into deal_members (deal_id, profile_id, member_role) values ('${deal}', '${riley.id}', 'seller')`);
const flyer = sql(`insert into member_promos (profile_id, kind, headline, highlights) values ('${riley.id}', 'open_house', 'Sunny home with a garden', 'Big yard') returning id`).split("\n")[0];
sql(`insert into member_todos (profile_id, title, source_name) values ('${sam.id}', 'Book the photographer', 'QA')`);
sql(`insert into member_drafts (profile_id, kind, recipient, subject, body) values ('${jordan.id}', 'message', 'movers', 'Moving date', 'Hello, could you move us the week after we close?')`);
memberDoc(sam.id, "Inspection report", pdf("Home inspection report"));
const label = (key) => sql(`select split_part(data->>'UnparsedAddress', ',', 1) from mls_listings where listing_key = '${key}'`);

// --- Checks ----------------------------------------------------------------------------------------
const sideScroll = async (page, width) => {
  await page.setViewportSize({ width, height: 900 });
  return page.evaluate(() => document.documentElement.scrollWidth);
};
/** Status, console errors, axe at 1440 and 390, no sideways scroll at 390 and 320. */
async function audit(page, who, name, path, { expect = 200, shoot = false } = {}) {
  page.errors.length = 0;
  const res = await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  const status = res?.status() ?? 0;
  const entry = { who, name, path, status, violations: {}, widths: {}, errors: [] };
  check(`${who} ${name}: HTTP ${expect}`, status === expect, `got ${status} at ${page.url()}`);
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
  entry.errors = expect === 404 ? page.errors.filter((e) => !/status of 404/.test(e)) : [...page.errors];
  check(`${who} ${name}: no console errors`, entry.errors.length === 0, entry.errors.join(" | "));
  report.push(entry);
}
/** Tabs through the page; the named controls must be reached with a visible focus indicator, and focus must keep moving. */
async function keyboard(page, who, name, path, controls) {
  if (path) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
  }
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  const seen = [];
  let stuck = 0;
  let last = "";
  const allSeen = () => controls.every((c) => seen.some((s) => c.test(s.label)));
  for (let i = 0; i < 400 && stuck < 3 && !allSeen(); i++) {
    await page.keyboard.press("Tab");
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const visible = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
      const label = (el.getAttribute("aria-label") || el.labels?.[0]?.textContent || el.textContent || el.getAttribute("name") || el.id || el.tagName).replace(/\s+/g, " ").trim().slice(0, 80);
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
    check(`${who} keyboard ${name}: reaches ${c}`, Boolean(hit), `${seen.length} stops; last: ${seen.slice(-5).map((s) => s.label).join(" / ")}`);
    if (hit) check(`${who} keyboard ${name}: ${c} shows focus`, hit.visible);
  }
}
const navHas = async (page, name) => (await page.locator("nav, aside").getByRole("link", { name, exact: true }).count()) > 0;
const modes = (page) => page.evaluate(() => [...document.querySelectorAll("input[type=radio][name=mode]")].map((i) => i.parentElement?.textContent?.trim()));

const ALL_MODES = ["Explain a term", "Search by sentence", "Summarize a document", "Draft an email or message", "Offer cover letter", "Compare homes", "Ask about a home", "Build my moving schedule", "Pre-listing checklist", "Plan a tour day", "Colors and moodboard", "Staging ideas", "Open-house flyer and posts"];
const BUYER_ONLY = ["Offer cover letter", "Compare homes", "Ask about a home", "Plan a tour day"];
const SELLER_ONLY = ["Pre-listing checklist", "Staging ideas", "Open-house flyer and posts"];
const MODE_KEYS = ["explain", "search", "summarize", "message", "cover_letter", "compare", "listing", "moving", "prelisting", "tour", "palette", "staging", "flyer"];

const BUYER_PAGES = [
  ["buyer", "/my/buyer"],
  ["saved", "/my/saved"],
  ["searches", "/my/searches"],
  ["compare", "/my/compare?key=FX-001&key=FX-002"],
  ["tours", "/my/tours"],
  ["sold", "/my/sold"],
  ["alerts", "/my/alerts"],
];
const SELLER_PAGES = [
  ["seller", "/my/seller"],
  ["performance", "/my/seller/performance"],
  ["flyer", `/my/flyers/${flyer}`],
];
const SHARED = [
  ["documents", "/my/documents"],
  ["messages", "/my/messages"],
  ["account", "/my/account"],
  ["assistant", "/my/assistant"],
  ["todos", "/my/todos"],
  ["drafts", "/my/drafts"],
  ["flyers", "/my/flyers"],
];

try {
  await setVow(true);
  const requestsAtStart = modelRequests();

  // --- State 1: every AI switch off ----------------------------------------------------------------
  for (const [name, path] of [...BUYER_PAGES, ...SHARED]) await audit(jordan.page, "off-buyer", name, path, { shoot: name === "assistant" });
  for (const [name, path] of [...SELLER_PAGES, ...SHARED]) await audit(riley.page, "off-seller", name, path);
  await audit(jordan.page, "off-buyer", "listing-page", "/listing/FX-001/x");
  check("off: no Ask Vabrato in the menu, the page says it isn't available", !(await navHas(jordan.page, "Ask Vabrato")) && (await (await jordan.page.goto(`${BASE}/my/assistant`), jordan.page.getByText(/Ask Vabrato isn.t available yet/)).isVisible()));
  await jordan.page.goto(`${BASE}/my/compare?key=FX-001&key=FX-002`);
  check("off: no AI on Compare", (await jordan.page.getByRole("button", { name: /Ask Vabrato/ }).count()) === 0);
  await jordan.page.goto(`${BASE}/listing/FX-001/x`);
  await jordan.page.waitForTimeout(1500);
  check("off: no 'Ask Vabrato about this home' on a listing", (await jordan.page.getByRole("link", { name: /Ask Vabrato about this home/ }).count()) === 0);

  // --- State 2: all member switches on ------------------------------------------------------------------
  state.on();
  for (const [name, path] of [...BUYER_PAGES, ...SHARED]) await audit(jordan.page, "on-buyer", name, path, { shoot: ["assistant", "compare"].includes(name) });
  for (const [name, path] of [...SELLER_PAGES, ...SHARED]) await audit(riley.page, "on-seller", name, path, { shoot: name === "flyers" });
  for (const [name, path] of [["buyer", "/my/buyer"], ["seller", "/my/seller"], ...SHARED]) await audit(sam.page, "on-both", name, path);
  for (const [name, path] of [["buyer", "/my/buyer"], ["assistant", "/my/assistant"], ["messages", "/my/messages"]]) await audit(noel.page, "on-no-agent", name, path);
  await audit(jordan.page, "on-buyer", "listing-page", "/listing/FX-001/x");
  // Every mode, as the member who has it.
  for (const k of MODE_KEYS) await audit(sam.page, "on-both", `assistant-${k}`, `/my/assistant?mode=${k}`);
  await jordan.page.goto(`${BASE}/my/assistant`);
  check("on: a buyer gets the buyer modes", JSON.stringify(await modes(jordan.page)) === JSON.stringify(ALL_MODES.filter((m) => !SELLER_ONLY.includes(m))), JSON.stringify(await modes(jordan.page)));
  await riley.page.goto(`${BASE}/my/assistant`);
  check("on: a seller gets the seller modes", JSON.stringify(await modes(riley.page)) === JSON.stringify(ALL_MODES.filter((m) => !BUYER_ONLY.includes(m))), JSON.stringify(await modes(riley.page)));
  await sam.page.goto(`${BASE}/my/assistant`);
  check("on: a member buying and selling gets all 13", JSON.stringify(await modes(sam.page)) === JSON.stringify(ALL_MODES));
  check("on: Ask Vabrato, My to-dos, My drafts and My flyers in a seller's menu", (await navHas(riley.page, "Ask Vabrato")) && (await navHas(riley.page, "My to-dos")) && (await navHas(riley.page, "My drafts")) && (await navHas(riley.page, "My flyers")));
  check("on: no My flyers for a buyer", !(await navHas(jordan.page, "My flyers")));
  await jordan.page.goto(`${BASE}/my/compare?key=FX-001&key=FX-002`);
  check("on: Compare offers Ask Vabrato", (await jordan.page.getByRole("button", { name: /Ask Vabrato/ }).count()) === 1);
  await jordan.page.goto(`${BASE}/listing/FX-001/x`);
  await jordan.page.getByRole("link", { name: /Ask Vabrato about this home/ }).waitFor({ timeout: 10000 }).catch(() => undefined);
  check("on: a listing offers 'Ask Vabrato about this home' to a buyer", (await jordan.page.getByRole("link", { name: /Ask Vabrato about this home/ }).count()) === 1);
  check("loading every page with the switches on sent nothing to the model", modelRequests() === requestsAtStart, `${modelRequests() - requestsAtStart} requests`);

  // One ask per mode, as Sam (buying and selling): every card is labelled AI.
  const callsBefore = memberCalls();
  const cards = () => sam.page.locator("ol[aria-label^='Your questions'] > li");
  const ASKS = [
    ["Explain a term", "Explain", async (p) => p.getByLabel("The term or question").fill("What is a contingency?")],
    ["Search by sentence", "Make the search", async (p) => p.getByLabel("Describe the homes you're looking for").fill("3-bed house in San Carlos")],
    ["Summarize a document", "Summarize", async (p) => p.getByLabel("Which document").selectOption({ label: "Inspection report" })],
    ["Draft an email or message", "Write the draft", async (p) => p.getByLabel("What should it say?").fill("Ask the movers for a date in December.")],
    [
      "Offer cover letter",
      "Write the letter",
      async (p) => {
        if (await p.getByLabel("Address").count()) await p.getByLabel("Address").fill("12 Fixture Way, San Carlos");
        await p.getByLabel("What makes your offer strong?").fill("Preapproved, flexible on timing.");
      },
    ],
    [
      "Compare homes",
      "Compare",
      async (p) => {
        for (const k of ["FX-001", "FX-002"]) await p.getByRole("checkbox", { name: label(k) }).check();
      },
    ],
    ["Ask about a home", "Ask", async (p) => p.getByLabel("Your question").fill("How big is the lot?")],
    [
      "Build my moving schedule",
      "Build the plan",
      async (p) => {
        if (await p.getByRole("radio", { name: "A move date I choose" }).count()) await p.getByRole("radio", { name: "A move date I choose" }).check();
        await p.getByLabel("Move date", { exact: true }).fill(day(40));
      },
    ],
    ["Pre-listing checklist", "Build the checklist", async (p) => p.getByLabel("Target list date").fill(day(42))],
    [
      "Plan a tour day",
      "Plan the day",
      async (p) => {
        for (const k of ["FX-001", "FX-002"]) await p.getByRole("checkbox", { name: label(k) }).check();
        await p.getByLabel("Tour date").fill(day(7));
      },
    ],
    ["Colors and moodboard", "Make the palette", async (p) => p.getByLabel("The room or the look you want").fill("A warm, calm living room.")],
    ["Staging ideas", "Get ideas", async (p) => p.getByLabel("Describe the room").fill("A small living room with dark corners.")],
    ["Open-house flyer and posts", "Write the flyer", async (p) => p.getByLabel("What do you love about your home?").fill("Morning light and a big yard.")],
  ];
  for (const [mode, button, fill] of ASKS) {
    await sam.page.goto(`${BASE}/my/assistant`);
    await sam.page.getByText(mode, { exact: true }).click();
    await fill(sam.page);
    const n = await cards().count();
    await sam.page.getByRole("button", { name: button, exact: true }).click();
    await cards().nth(n).waitFor({ timeout: 20000 });
    const card = cards().nth(n);
    const text = (await card.textContent()) ?? "";
    check(`ask ${mode}: an answer, labelled AI`, !(await card.getByRole("heading", { name: "No answer" }).count()) && (await card.locator("[data-ai-label]").count()) > 0, text.slice(0, 160));
    if (mode === "Open-house flyer and posts") {
      await shotCard(sam.page, "flyer-card");
      await keyboard(sam.page, "on-both", "flyer card", null, [/^Headline$/, /^Highlights$/, /^Instagram post$/, /^Facebook post$/, /^Send to my agent for approval$/]);
    }
  }
  check("the 13 asks reached the model, one each", memberCalls() - callsBefore === 13, String(memberCalls() - callsBefore));

  // Keyboard: every mode's fields, My to-dos and My flyers.
  const FIELDS = {
    explain: /^The term or question/,
    search: /^Describe the homes/,
    summarize: /^Which document/,
    message: /^What should it say/,
    cover_letter: /^What makes your offer strong/,
    compare: /^Final|^\d+ /,
    listing: /^Your question/,
    moving: /^A move date I choose|^Move date/,
    prelisting: /^Target list date/,
    tour: /^Tour date/,
    palette: /^The room or the look you want/,
    staging: /^Which room/,
    flyer: /^The flyer is for/,
  };
  for (const k of MODE_KEYS) if (k !== "compare") await keyboard(sam.page, "on-both", `assistant ${k}`, `/my/assistant?mode=${k}`, [FIELDS[k]]);
  await keyboard(sam.page, "on-both", "my to-dos", "/my/todos", [/^Delete my assistant data$/]);
  await keyboard(riley.page, "on-seller", "my flyers", "/my/flyers", [/^Delete: Sunny home with a garden$/, /^Delete my assistant data$/]);
  const beforeKeys = modelRequests();

  // --- State 3: the member daily limit at 0 ---------------------------------------------------------------
  state.limit0();
  await audit(sam.page, "limit0-both", "assistant", "/my/assistant", { shoot: true });
  check("limit 0: 'isn't available on your account', no form", (await sam.page.getByText(/isn.t available on your account right now/).isVisible()) && (await modes(sam.page)).length === 0);

  // --- State 4: the master switch off, member switches on ---------------------------------------------------
  state.masterOff();
  for (const [name, path] of [["assistant", "/my/assistant"], ["todos", "/my/todos"], ["drafts", "/my/drafts"], ["flyers", "/my/flyers"]]) await audit(riley.page, "master-off-seller", name, path);
  await audit(sam.page, "master-off-both", "todos", "/my/todos");
  await audit(jordan.page, "master-off-buyer", "drafts", "/my/drafts");
  await riley.page.goto(`${BASE}/my/assistant`);
  check("master off: no Ask Vabrato, the page says it isn't available", !(await navHas(riley.page, "Ask Vabrato")) && (await riley.page.getByText(/Ask Vabrato isn.t available yet/).isVisible()));
  check("master off: a seller's flyers stay in the menu and on their page", (await navHas(riley.page, "My flyers")) && (await (await riley.page.goto(`${BASE}/my/flyers`), riley.page.getByText("Sunny home with a garden")).isVisible()));
  await sam.page.goto(`${BASE}/my/todos`);
  check("master off: to-dos stay", (await navHas(sam.page, "My to-dos")) && (await sam.page.getByText("Book the photographer").first().isVisible()));
  await jordan.page.goto(`${BASE}/my/drafts`);
  check("master off: drafts stay", (await navHas(jordan.page, "My drafts")) && (await jordan.page.getByText("Moving date").first().isVisible()));
  await jordan.page.goto(`${BASE}/my/compare?key=FX-001&key=FX-002`);
  check("master off: no AI on Compare", (await jordan.page.getByRole("button", { name: /Ask Vabrato/ }).count()) === 0);

  // --- The staff notice ---------------------------------------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.errors = [];
    page.on("console", (m) => m.type() === "error" && page.errors.push(m.text().slice(0, 160)));
    await page.goto(`${BASE}/sign-in`);
    await page.getByLabel("Email address").fill(STAFF_EMAIL);
    const before = mails();
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await page.getByText("Check your email.").waitFor();
    await page.goto(await linkFor(STAFF_EMAIL, before));
    await page.waitForURL(/\/my/, { timeout: 15000 });
    await audit(page, "staff", "my", "/my");
  }
  check("nothing but the 13 asks reached the model", modelRequests() === beforeKeys && memberCalls() - callsBefore === 13);
} finally {
  // Put everything back.
  for (const pair of flagsBefore.split(",")) {
    const [k, v] = pair.split("=");
    sql(`update feature_flags set enabled = ${v === "true"} where key = '${k}'`);
  }
  await fetch(`${BASE}/api/revalidate?tag=content`, { method: "POST", headers: { "x-revalidate-secret": process.env.REVALIDATE_SECRET ?? "" } }).catch(() => undefined);
  const [zdrAt, zdrBy, zdrNote, req, tok] = settingsBefore.split("|");
  sql(`update app_settings set ai_zdr_confirmed_at = ${zdrAt ? `'${zdrAt}'` : "null"}, ai_zdr_confirmed_by = ${zdrBy ? `'${zdrBy}'` : "null"}, ai_zdr_note = ${zdrNote ? `'${zdrNote.replace(/'/g, "''")}'` : "null"}, ai_daily_requests_member = ${req}, ai_daily_tokens_member = ${tok}`);
  const ids = [jordan, riley, sam, noel].map((m) => `'${m.id}'`).join(",");
  sql(`delete from staff_notifications where kind in ('member_todo', 'member_promo') and ref_id in (${ids})`);
  sql(`delete from deals where id = '${deal}'`);
  for (const path of stored) {
    sql(`delete from storage.objects where bucket_id = 'member-docs' and name = '${path}'`);
    rmSync(join(STORAGE, "member-docs", path), { force: true });
    rmSync(join(STORAGE, "member-docs", `${path}.type`), { force: true });
  }
  sql(`delete from auth.users where email like '%.${stamp}@example.test'`);
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
check("cleanup: switches back as they were", sql(`select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key like 'ai\\_%' or key = 'vow_enabled'`) === flagsBefore);
check("cleanup: members, flyers, to-dos, drafts and the sale removed", sql(`select count(*) from profiles where email like '%.${stamp}@example.test'`) === "0" && sql(`select count(*) from deals where id = '${deal}'`) === "0");
done();

async function shotCard(page, name) {
  await page.screenshot({ path: join(OUT, `${name}-1440.jpg`), fullPage: true, type: "jpeg", quality: 60 });
}
