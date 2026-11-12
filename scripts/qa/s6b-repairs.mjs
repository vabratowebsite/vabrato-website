// S6b PR 7b end-to-end check: repair items from an inspection report, the bid
// list and the response to the buyer's request, on the local stack with the
// fake Claude server (fake-claude.mjs): no key, no cost, fictional reports.
//
// - Off by default: no "Repair items" on the Documents tab; Repairs says it's off.
// - Items read from this deal's report (one inline PDF, the trades as data);
//   phones and dollar amounts stripped in code; "a summary, not a
//   replacement for the report"; edited, an added item, a Fair Housing word
//   blocks approval, approved.
// - A 60-item answer is flagged "may be incomplete"; an answer with wiring
//   details isn't shown.
// - Bid list: by trade, labelled "Drafted by the assistant, approved by …";
//   printed; with the vendor switch off, copy or open in email to a matching
//   vendor; with it on, the quote request starts with the trade's items.
// - Response: every item starts as not requested; the seller's approval tick
//   is required; our code writes the list and the total; an amount the agent
//   didn't type, or one in words, blocks approval; a tampered stored list is
//   rebuilt from the decisions; approved, copied and printed.
// - An agent without deal access gets a 404. axe at 1440 and 390 px; screenshots.
//
// Start: node scripts/qa/fake-claude.mjs <log>; apps/va with
// ANTHROPIC_BASE_URL=http://127.0.0.1:4020 and any ANTHROPIC_API_KEY. Needs
// SERVICE_KEY, CLAUDE_LOG, STORAGE_DIR and migrations 0032 and 0033.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { axeAll, check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const LOG = process.env.CLAUDE_LOG;
const STORAGE = process.env.STORAGE_DIR ?? "/var/tmp/vabrato-auth/storage-files";
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s6b-repairs");
mkdirSync(OUT, { recursive: true });
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const logLines = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean);
const before = logLines().length;
const asked = () => logLines().slice(before).map((l) => JSON.parse(l));
const last = () => asked().at(-1) ?? {};
const pdf = (mode, title) => Buffer.from(`%PDF-1.4\n% ${title} (fictional QA file)\n<< /Type /Page >>\n% QA-MODE: ${mode}\n%%EOF\n`);

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

async function waitStatus(page, text, refused) {
  const target = refused ? page.getByRole("alert").filter({ hasText: refused }) : page.getByRole("status").filter({ hasText: text });
  try {
    await target.first().waitFor({ timeout: 30000 });
  } catch {
    throw new Error(`no ${refused ?? text}; alerts: ${JSON.stringify(await page.getByRole("alert").allTextContents())}; status: ${JSON.stringify(await page.getByRole("status").allTextContents())}`);
  }
}

// A report in the deal's staff folder, filed as an inspection (as 7a does it).
function report(deal, name, mode) {
  const path = `deal/${deal}/staff/${stamp}-${name}`;
  sql(`insert into storage.objects (bucket_id, name) values ('deal-docs', '${path}')`);
  mkdirSync(join(STORAGE, "deal-docs", "deal", deal, "staff"), { recursive: true });
  writeFileSync(join(STORAGE, "deal-docs", path), pdf(mode, name));
  writeFileSync(join(STORAGE, "deal-docs", `${path}.type`), "application/pdf");
  return sql(`insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, doc_types, shared) values ('${deal}', '${path}', '${name}', 100, 'application/pdf', '{home_inspection}', false) returning id`).split("\n")[0];
}

// --- Setup ---------------------------------------------------------------------------------------
const leadAdminBefore = sql(`select coalesce(lead_admin_id::text, '') from app_settings`);
const AI = "('ai_enabled', 'ai_staff_inspection_items', 'ai_staff_repair_response')";
sql(`update feature_flags set enabled = false where key like 'ai\\_%'`);
sql(`delete from ai_runs`);
const ada = await account("Ada", "admin");
const avery = await account("Avery", "agent");
const blake = await account("Blake", "agent");
sql(`update app_settings set ai_zdr_confirmed_at = now(), ai_zdr_confirmed_by = '${ada.id}', ai_zdr_note = 'QA fixture (fictional)', lead_admin_id = '${ada.id}', lead_admin_away = false`);
const ADDRESS = `${stamp % 1000} Fixture Court, Belmont`;
const deal = sql(`insert into deals (address, seller_type, ratification_date, days_to_close, agent_id, created_by) values ('${ADDRESS}', 'normal', current_date - 5, 30, '${avery.id}', '${avery.id}') returning id`).split("\n")[0];
const docs = { main: report(deal, "Home inspection.pdf", "ok"), many: report(deal, "Long inspection.pdf", "many"), wiring: report(deal, "Odd inspection.pdf", "wiring") };
const vendorIds = sql(
  `insert into vendors (name, role, email, preferred) values ('Spark Electric QA ${stamp} (fictional)', 'Electrician', 'spark.${stamp}@example.test', true), ('Strap Plumbing QA ${stamp} (fictional)', 'Plumbing and water heater', 'strap.${stamp}@example.test', false) returning id`,
).split("\n").filter((l) => /^[0-9a-f-]{36}$/.test(l));
const ai = (on) => sql(`update feature_flags set enabled = ${on} where key in ${AI}`);
const vendorSwitch = (on) => sql(`update feature_flags set enabled = ${on} where key = 'ai_staff_vendor_request'`);

try {
  // 1. Off by default.
  const av = await signIn(avery.email);
  await av.goto(`${VA}/deals/${deal}/documents`);
  check("off: no Repair items on the Documents tab", (await av.getByRole("button", { name: /^Repair items/ }).count()) === 0);
  await av.goto(`${VA}/deals/${deal}/repairs`);
  check("off: the Repairs tab lists the reports and says reading them is off", (await av.getByText("Home inspection.pdf").isVisible()) && (await av.getByText(/switched off/).isVisible()));

  // 2. Items from this deal's report.
  ai(true);
  await av.goto(`${VA}/deals/${deal}/documents`);
  await av.getByRole("button", { name: /^Repair items\s*from Home inspection\.pdf$/ }).click();
  await av.waitForURL(/\/repairs\/[0-9a-f-]{36}$/, { timeout: 60000 });
  const setId = av.url().split("/").pop();
  let req = last();
  check("items: one inline PDF and the trades as data; no contacts or tools", req.feature === "inspection_items" && req.documents === 1 && req.documentIsInlinePdf && req.dataBlocks === 1 && !req.requestHasEmail && !req.requestHasPhone && req.tools === 0 && req.fileReferences === 0, JSON.stringify(req));
  const stored = sql(`select content::text from ai_drafts where id = '${setId}'`);
  check("items: phone numbers and dollar amounts are stripped in code", !/650-555|\$900/.test(stored) && /Wood rot at rear deck stairs/.test(stored), stored.slice(0, 200));
  check("items: the page says it's a summary, not a replacement for the report", await av.getByText("A summary, not a replacement for the report.").first().isVisible());
  check("items: four items to check, with the report's own words", (await av.getByLabel("Title").count()) === 4 && (await av.getByLabel("The report's words (optional)").first().inputValue()) === "Safety concern");
  await axeAll(av, "/deals/[id]/repairs/[id] (draft)");
  await shots(av, "items-draft");

  await av.getByLabel("Detail").nth(3).fill("Not suitable for the handicapped until cleaned.");
  await av.getByRole("button", { name: "Add an item" }).click();
  await av.getByLabel("Title").nth(4).fill("Loose hall light switch cover");
  await av.getByRole("button", { name: "Approve the list" }).click();
  await waitStatus(av, null, "Fair Housing");
  check("items: a Fair Housing word blocks approval", sql(`select status from ai_drafts where id = '${setId}'`) === "draft");
  await av.getByLabel("Detail").nth(3).fill("Clean gutters and downspouts.");
  await av.getByRole("button", { name: "Approve the list" }).click();
  await waitStatus(av, "Approved.");
  check("items: approved with the added item", sql(`select status || '|' || jsonb_array_length(content->'items') from ai_drafts where id = '${setId}'`) === "approved|5");
  await av.reload();

  // 3. Bid list.
  check("bid list: labelled as the assistant's, approved by the agent", await av.getByText(/Drafted by the assistant, approved by Avery Example on/).first().isVisible());
  await av.getByText("Electrical (1)").click();
  const electric = av.locator("details").filter({ hasText: "Electrical (1)" });
  const mailto = await electric.getByRole("link", { name: /Open in email/ }).getAttribute("href");
  check("bid list, vendor switch off: open in email to a matching vendor with our list", mailto?.startsWith(`mailto:spark.${stamp}@example.test?`) && decodeURIComponent(mailto).includes("Please quote the following electrical items") && decodeURIComponent(mailto).includes("report page 12"), mailto ?? "");
  check("bid list, vendor switch off: copy the items", await electric.getByRole("button", { name: "Copy the items for this trade" }).isVisible());
  await axeAll(av, "/deals/[id]/repairs/[id] (approved)");
  await shots(av, "items-approved");
  await av.goto(`${VA}/deals/${deal}/repairs/${setId}/bids`);
  check("bid list print: by trade, labelled, no AI wording beyond the approved items", (await av.getByRole("heading", { name: "Electrical" }).isVisible()) && (await av.getByText(/Drafted by the assistant, approved by Avery Example/).isVisible()) && (await av.getByText("Loose hall light switch cover").isVisible()));
  await axeAll(av, "/deals/[id]/repairs/[id]/bids");
  await shots(av, "bid-list");
  vendorSwitch(true);
  await av.goto(`${VA}/deals/${deal}/repairs/${setId}`);
  await av.getByText("Electrical (1)").click();
  const note = av.locator("details").filter({ hasText: "Electrical (1)" }).getByLabel("What do you need? (required)");
  check("bid list, vendor switch on: the quote request starts with the trade's items", (await note.inputValue()).includes("Please quote the following electrical items from the inspection report"));
  vendorSwitch(false);

  // 4. The response.
  await av.reload();
  await av.getByRole("button", { name: "Write the response" }).click();
  await waitStatus(av, null, "Mark at least one item repair, credit or decline");
  check("response: every item starts as not requested", (await av.getByLabel(/^Decision/).first().inputValue()) === "not_requested");
  await av.getByLabel(/^Decision\s*for Missing GFCI/).selectOption("repair");
  await av.getByLabel(/^Decision\s*for Water heater lacks seismic strapping/).selectOption("credit");
  await av.getByLabel(/^Credit \(\$\)\s*for Water heater/).fill("450");
  await av.getByLabel(/^Decision\s*for Wood rot/).selectOption("decline");
  await av.getByRole("button", { name: "Add an item that isn't in the report" }).click();
  await av.getByLabel("Item not in the report").fill("Replace cracked switch cover in the hall");
  const preview = await av.getByRole("region", { name: "The item list in the response" }).innerText();
  check("response: our code's list, with the total and the fixed line", preview.includes("Credit to the buyer of $450.00") && preview.includes("Total credits: $450.00") && preview.includes("the signed Request for Repair response form governs") && !preview.includes("Debris in gutters"), preview);
  await av.getByRole("button", { name: "Write the response" }).click();
  await waitStatus(av, null, "The seller has approved these decisions");
  await av.getByLabel("The seller has approved these decisions").check();
  await av.getByRole("button", { name: "Write the response" }).click();
  await waitStatus(av, "Response ready.");
  req = last();
  check("response: the decisions only; never the report", req.feature === "repair_response" && req.documents === 0 && req.images === 0 && !req.requestHasPhone, JSON.stringify(req));
  await av.reload();
  const respId = sql(`select id from ai_drafts where kind = 'repair_response' and deal_id = '${deal}' order by created_at desc limit 1`);
  sql(`update ai_drafts set body = replace(body, '$450.00', '$4,500.00') where id = '${respId}'`);
  await av.getByRole("button", { name: "Approve", exact: true }).click();
  await waitStatus(av, "Approved.");
  const body = sql(`select body from ai_drafts where id = '${respId}'`);
  check("response: a tampered stored list is rebuilt from the decisions at approval", body.includes("Credit to the buyer of $450.00") && !body.includes("$4,500.00") && body.startsWith("Hello,") && body.trim().endsWith("Vabrato Real Estate Services"), body.slice(0, 300));
  await av.reload();
  await av.getByRole("button", { name: "Copy", exact: true }).click();
  await waitStatus(av, "Copied.");
  check("response: copied, and recorded", sql(`select sent_via from ai_drafts where id = '${respId}'`) === "copy");
  await axeAll(av, "/deals/[id]/repairs/[id] (response)");
  await shots(av, "response");
  await av.goto(`${VA}/deals/${deal}/repairs/response/${respId}`);
  check("response print: exactly the approved text", (await av.getByText(/Credit to the buyer of \$450\.00/).isVisible()) && (await av.getByText(/Thank you for sending the buyer's request for repairs/).isVisible()));

  // 5. Numbers the agent didn't type.
  for (const [mode, refused] of [
    ["invented", "weren't typed by you or sent by the console: $2,000"],
    ["words", "amounts written in words"],
  ]) {
    await av.goto(`${VA}/deals/${deal}/repairs/${setId}`);
    await av.getByLabel(/^Decision\s*for Missing GFCI/).selectOption("repair");
    await av.getByLabel("Anything the opening or closing should say? (optional)").fill(`Keep it short. QA-MODE: ${mode}`);
    await av.getByLabel("The seller has approved these decisions").check();
    await av.getByRole("button", { name: "Write the response" }).click();
    await waitStatus(av, "Response ready.");
    await av.reload();
    await av.getByRole("button", { name: "Approve", exact: true }).first().click();
    await waitStatus(av, null, refused);
    check(`response: ${mode === "invented" ? "an amount the agent didn't type" : "an amount in words"} blocks approval`, sql(`select count(*) from ai_drafts where kind = 'repair_response' and deal_id = '${deal}' and status = 'draft'`) === "1");
    await av.getByRole("button", { name: "Discard" }).first().click();
    await waitStatus(av, "Discarded.");
  }

  // 6. A long list, and wiring details.
  await av.goto(`${VA}/deals/${deal}/repairs`);
  await av.getByRole("button", { name: /^Repair items\s*from Long inspection\.pdf$/ }).click();
  await av.waitForURL(/\/repairs\/[0-9a-f-]{36}$/, { timeout: 60000 });
  check("a 60-item answer is flagged as maybe incomplete", await av.getByText(/This list may be incomplete/).isVisible());
  await av.goto(`${VA}/deals/${deal}/repairs`);
  await av.getByRole("button", { name: /^Repair items\s*from Odd inspection\.pdf$/ }).click();
  await waitStatus(av, null, "payment or wiring details");
  check("an answer with wiring details isn't shown or saved", sql(`select count(*) from ai_drafts where kind = 'inspection_items' and content->>'document_id' = '${docs.wiring}'`) === "0");
  await axeAll(av, "/deals/[id]/repairs");
  await shots(av, "repairs-list");

  // 7. An agent without deal access.
  const bl = await signIn(blake.email);
  const r404 = await bl.goto(`${VA}/deals/${deal}/repairs/${setId}`);
  const b404 = await bl.goto(`${VA}/deals/${deal}/repairs/${setId}/bids`);
  check("an agent without deal access gets a 404", r404?.status() === 404 && b404?.status() === 404, `${r404?.status()} ${b404?.status()}`);
  await bl.context().close();

  const runs = sql(`select string_agg(feature || ':' || status, ',' order by created_at) from ai_runs`);
  check("the usage log has metadata only", runs === "staff_inspection_items:ok,staff_repair_response:ok,staff_repair_response:ok,staff_repair_response:ok,staff_inspection_items:ok,staff_inspection_items:blocked_output", runs);
  check("the console called nothing but the Messages endpoint", asked().every((r) => !("unexpected" in r)));
} finally {
  ai(false);
  vendorSwitch(false);
  sql(`update app_settings set ai_zdr_confirmed_at = null, ai_zdr_confirmed_by = null, ai_zdr_note = null, lead_admin_id = ${leadAdminBefore ? `'${leadAdminBefore}'` : "null"}`);
  const objects = sql(`select bucket_id || '/' || name from storage.objects where name like 'deal/${deal}/%'`).split("\n").filter(Boolean);
  for (const o of objects) for (const ext of ["", ".type"]) rmSync(join(STORAGE, o) + ext, { force: true });
  sql(`delete from storage.objects where name like 'deal/${deal}/%'`);
  sql(`delete from deals where id = '${deal}'; delete from ai_runs`);
  if (vendorIds.length) sql(`delete from vendors where id in (${vendorIds.map((v) => `'${v}'`).join(", ")})`);
  sql(`delete from staff_notifications where recipient_id in ('${ada.id}', '${avery.id}', '${blake.id}')`);
  await browser.close();
}
done();
