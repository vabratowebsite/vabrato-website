// S5b PR 2: Ask Vabrato's document summary and "My to-dos", end to end on
// the local stack with the fake Claude (scripts/qa/fake-claude.mjs) and the
// QA storage shim. Fictional members and files only; everything it adds is
// removed and every switch and setting it touches is put back.
//
// - Off by default: no Summarize links, no My to-dos, nothing sent.
// - An admin turns "Summarize a document (members)" on in the console.
// - A buyer summarizes their own upload and a file their team added for them:
//   page references (only within the file), questions, suggested to-dos
//   (repeats dropped, phone numbers removed); wiring and Fair Housing wording
//   never shown; a 51-page file refused; HEIC photos and other members'
//   documents never offered.
// - Added to-dos wait for the agent (one bell alert); the agent approves one
//   and declines one in the console; the buyer ticks the approved one and
//   deletes their assistant data (the declined one goes, the approved stays).
// - A seller summarizes a file their transaction desk shared (run against
//   the deal).
// - axe at 1440 and 390, no sideways scroll at 390 and 320, keyboard, and
//   page loads send nothing to the model.
//
// Needs: apps/web on :3003 and apps/va on :3000 with ANTHROPIC_BASE_URL at the
// fake; CLAUDE_LOG, MAIL_DIR, PGURL, REVALIDATE_SECRET, SERVICE_KEY,
// STORAGE_DIR (the shim's folder); migrations up to 0037.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BASE, axeAll, check, done, joinAs, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const LOG = process.env.CLAUDE_LOG;
const STORAGE = process.env.STORAGE_DIR ?? "/var/tmp/vabrato-auth/storage-files";
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s5b-documents");
mkdirSync(OUT, { recursive: true });
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const log = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const memberCalls = () => log().filter((e) => /^member_/.test(e.feature ?? "")).length;
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}-1440.jpg`, fullPage: true, type: "jpeg", quality: 60 });
const sideScroll = async (page, width) => {
  await page.setViewportSize({ width, height: 900 });
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.setViewportSize({ width: 1440, height: 900 });
  return w;
};

// Fictional files. The fake Claude reads "QA-MODE: …" from the bytes; the
// page count comes from the /Count the PDF claims.
const pdf = (mode, title, pages = 30) => Buffer.from(`%PDF-1.4\n% ${title} (fictional QA file)\n% QA-MODE: ${mode}\n1 0 obj << /Type /Pages /Count ${pages} >> endobj\n%%EOF\n`);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(16)]);

// --- What this run changes, to put back -------------------------------------------------------
const FLAGS = ["ai_enabled", "ai_member_summarize"];
const flagsBefore = Object.fromEntries(sql(`select key || '=' || enabled from feature_flags where key in (${FLAGS.map((k) => `'${k}'`).join(",")})`).split("\n").filter(Boolean).map((l) => l.split("=")));
const settingsBefore = sql(`select coalesce(ai_zdr_confirmed_at::text, '') || '|' || ai_daily_tokens_member from app_settings`);
const setFlags = (on, keys = FLAGS) => sql(`update feature_flags set enabled = ${on} where key in (${keys.map((k) => `'${k}'`).join(",")})`);
setFlags(false);
// The fake reports 61,000 input tokens a call; the member token limit is raised for the run.
sql(`update app_settings set ai_zdr_confirmed_at = coalesce(ai_zdr_confirmed_at, now()), ai_daily_tokens_member = 100000000`);
const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);

async function account(first, role) {
  const email = `${first.toLowerCase()}.${stamp}@example.test`;
  const res = await fetch(`${process.env.SUPABASE_URL ?? "http://127.0.0.1:54331"}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: process.env.SERVICE_KEY, Authorization: `Bearer ${process.env.SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`create ${first}: ${res.status} ${await res.text()}`);
  const id = (await res.json()).id;
  sql(`update profiles set role = '${role}', full_name = '${first} Example', onboarded_at = now() where id = '${id}'`);
  return { id, email };
}

const stored = [];
/** A member-docs file: the row, the storage object and the bytes, as the portal stores them. */
function memberDoc(profile, name, bytes, type, uploadedBy = profile) {
  const path = `member/${profile}/${stamp}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${type === "image/heic" ? "heic" : "pdf"}`;
  const id = sql(`insert into member_documents (profile_id, name, storage_path, size_bytes, content_type, uploaded_by) values ('${profile}', '${name}', '${path}', ${bytes.length}, '${type}', '${uploadedBy}') returning id`).split("\n")[0];
  sql(`insert into storage.objects (bucket_id, name, owner) values ('member-docs', '${path}', '${uploadedBy}')`);
  mkdirSync(join(STORAGE, "member-docs", "member", profile), { recursive: true });
  writeFileSync(join(STORAGE, "member-docs", path), bytes);
  writeFileSync(join(STORAGE, "member-docs", `${path}.type`), type);
  stored.push(["member-docs", path]);
  return id;
}

const newPage = async () => (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
async function summarize(page, label) {
  if (await page.getByRole("radio").count()) await page.getByText("Summarize a document", { exact: true }).click();
  await page.getByLabel("Which document").selectOption({ label });
  const n = await page.locator("ol[aria-label^='Your questions'] > li").count();
  await page.getByRole("button", { name: "Summarize" }).click();
  await page.locator("ol[aria-label^='Your questions'] > li").nth(n).waitFor({ timeout: 15000 });
  return page.locator("ol[aria-label^='Your questions'] > li").nth(n);
}

// --- People and files ------------------------------------------------------------------------
const buyer = await newPage();
const buyerEmail = `jordan.${stamp}@example.test`;
await joinAs(buyer, { email: buyerEmail, name: "Jordan Example", role: "buyer" });
const jordan = sql(`select id from profiles where email = '${buyerEmail}'`);
sql(`update profiles set agent_id = '${mark}' where id = '${jordan}'`);
const riley = await account("Riley", "buyer");
const rileyDoc = memberDoc(riley.id, "Riley private notes.pdf", pdf("ok", "Riley private"), "application/pdf");
memberDoc(jordan, "Inspection report.pdf", pdf("ok", "Inspection report"), "application/pdf");
memberDoc(jordan, "Disclosures from your agent.pdf", pdf("ok", "Disclosures"), "application/pdf", mark);
memberDoc(jordan, "Wiring.pdf", pdf("wiring", "Wiring"), "application/pdf");
memberDoc(jordan, "Steering.pdf", pdf("steering", "Steering"), "application/pdf");
memberDoc(jordan, "Contacts.pdf", pdf("contacts", "Contacts"), "application/pdf");
memberDoc(jordan, "Pages.pdf", pdf("pages", "Pages"), "application/pdf");
memberDoc(jordan, "HOA packet.pdf", pdf("ok", "HOA packet", 51), "application/pdf");
const heicDoc = memberDoc(jordan, "Kitchen photo.heic", HEIC, "image/heic");
const callsAtStart = memberCalls();

// --- 1. Off by default -------------------------------------------------------------------------
await buyer.goto(`${BASE}/my/documents`);
check("off: no Summarize links on Documents", (await buyer.getByRole("link", { name: /^Summarize/ }).count()) === 0);
check("off: no My to-dos in the menu", (await buyer.getByRole("link", { name: "My to-dos" }).count()) === 0);
await buyer.goto(`${BASE}/my/todos`);
check("off: My to-dos still opens (empty)", await buyer.getByRole("heading", { name: "Waiting for your agent" }).isVisible());

// --- 2. The console switch -----------------------------------------------------------------------
const staff = await newPage();
await staff.goto(`${VA}/login`);
await staff.getByPlaceholder("you@vabrato.com").fill(STAFF_EMAIL);
let m = mails();
await staff.getByRole("button", { name: "Email me a sign-in link" }).click();
await staff.getByText(/Check your email/).waitFor();
await staff.goto(await linkFor(STAFF_EMAIL, m));
await staff.waitForURL(`${VA}/`, { timeout: 15000 });
await staff.goto(`${VA}/assistant`);
await staff.getByRole("button", { name: "Turn on: Summarize a document (members)" }).click();
await staff.getByRole("button", { name: "Turn off: Summarize a document (members)" }).waitFor({ timeout: 15000 });
setFlags(true, ["ai_enabled"]);
check("console: an admin turns on Summarize a document", sql(`select enabled from feature_flags where key = 'ai_member_summarize'`) === "t");

// --- 3. The buyer summarizes ------------------------------------------------------------------
await buyer.goto(`${BASE}/my/documents`);
check("on: My to-dos in the menu", await buyer.getByRole("link", { name: "My to-dos" }).isVisible());
check("on: Summarize links on readable files", (await buyer.getByRole("link", { name: /^Summarize/ }).count()) === 7);
check("on: no Summarize link on the HEIC photo", (await buyer.getByRole("link", { name: "Summarize Kitchen photo.heic" }).count()) === 0);
const loadsBefore = memberCalls();
await buyer.getByRole("link", { name: "Summarize Inspection report.pdf" }).click();
await buyer.waitForURL(/\/my\/assistant\?doc=upload/);
check("page loads send nothing to the model", memberCalls() === loadsBefore && loadsBefore === callsAtStart);
check("the Summarize link preselects the document", (await buyer.getByLabel("Which document").inputValue()).startsWith("upload:"));
const options = await buyer.getByLabel("Which document").locator("option").allTextContents();
check("the list: own and team uploads, no HEIC, nobody else's", options.includes("Inspection report.pdf") && options.includes("Disclosures from your agent.pdf") && !options.includes("Kitchen photo.heic") && !options.some((o) => /Riley/.test(o)), options.join(" | "));

let card = await summarize(buyer, "Inspection report.pdf");
check("summary: heading with the name and length", await card.getByRole("heading", { name: "Summary of Inspection report.pdf (30 pages)" }).isVisible());
check("summary: labelled AI", (await card.locator("[data-ai-label]").count()) === 1);
check("summary: page references", (await card.getByText("(p. 14)").count()) >= 1 && (await card.getByText("(p. 22)").count()) >= 1);
check("summary: questions with Ask my agent", (await card.getByRole("link", { name: /^Ask my agent/ }).count()) === 2);
const todoBoxes = card.getByRole("checkbox");
check("summary: repeated to-dos dropped (3 suggested, 2 shown)", (await todoBoxes.count()) === 2);
check("summary: not legal or engineering advice", await card.getByText(/Not legal, engineering or tax advice/).isVisible());
let e = log().filter((x) => x.feature === "member_summarize").at(-1);
check("summary: one inline PDF, JSON, no tools, the always-rules", e?.documents === 1 && e.documentIsInlinePdf && e.format === "json_schema" && e.tools === 0 && e.systemHasAlwaysRules && e.fileReferences === 0, JSON.stringify(e));
await axeAll(buyer, "/my/assistant (summary)");
for (const width of [390, 320]) {
  const w = await sideScroll(buyer, width);
  check(`/my/assistant: no sideways scroll @${width}`, w <= width, `${w}px`);
}
await shot(buyer, "summary");

await card.getByRole("button", { name: "Add to my to-dos" }).click();
check("add: nothing ticked is refused", await card.getByText("Tick at least one to-do to add.").isVisible());
await todoBoxes.nth(0).check();
await todoBoxes.nth(1).check();
await card.getByRole("button", { name: "Add to my to-dos" }).click();
await card.getByText(/^Added 2 to-dos/).waitFor({ timeout: 10000 });
check("add: two to-dos waiting for the agent", sql(`select count(*) from member_todos where profile_id = '${jordan}' and status = 'pending'`) === "2");
check("add: one bell alert for the agent", sql(`select count(*) from staff_notifications where recipient_id = '${mark}' and kind = 'member_todo' and ref_id = '${jordan}' and read_at is null`) === "1");
check("add: the card can't add twice", (await card.getByRole("button", { name: "Add to my to-dos" }).count()) === 0);

card = await summarize(buyer, "Disclosures from your agent.pdf");
check("a file the team uploaded for the buyer: summarized", await card.getByRole("heading", { name: /^Summary of Disclosures from your agent\.pdf/ }).isVisible());
card = await summarize(buyer, "Wiring.pdf");
check("wiring details in a summary: not shown", (await card.getByText(/never gives those/).isVisible()) && !(await buyer.content()).includes("999999999"));
card = await summarize(buyer, "Steering.pdf");
check("Fair Housing wording in a summary: not shown", (await card.getByText(/wording we can't use under Fair Housing/).isVisible()) && !(await buyer.content()).includes("young kids"));
card = await summarize(buyer, "Contacts.pdf");
const contactTodo = await card.getByRole("checkbox").first().locator("xpath=..").textContent();
check("a phone number and email in a to-do are removed", !/650-555-0142|@example\.test/.test(contactTodo ?? "") && /water heater/.test(contactTodo ?? ""), contactTodo);
card = await summarize(buyer, "Pages.pdf");
check("page references outside the file are dropped", (await card.getByText("(pp. 9)").count()) + (await card.getByText("(p. 9)").count()) >= 1 && !(await card.textContent()).includes("999") && !(await card.textContent()).includes("p. 400"));
const sentBefore = memberCalls();
card = await summarize(buyer, "HOA packet.pdf");
check("a 51-page document is refused before anything is sent", (await card.getByText(/has 51 pages/).isVisible()) && memberCalls() === sentBefore);
await buyer.goto(`${BASE}/my/assistant?doc=upload:${rileyDoc}`);
check("someone else's document isn't offered, even by link", !(await buyer.content()).includes("Riley private") && !(await buyer.getByLabel("Which document").inputValue()).includes(rileyDoc));
await buyer.goto(`${BASE}/my/assistant?doc=upload:${heicDoc}`);
check("a HEIC photo isn't offered, even by link", !(await buyer.getByLabel("Which document").inputValue()).includes(heicDoc));

// Keyboard: the mode, the document list and the button.
await buyer.goto(`${BASE}/my/assistant`);
if (await buyer.getByRole("radio").count()) await buyer.getByText("Summarize a document", { exact: true }).click();
await buyer.locator("body").click({ position: { x: 1, y: 1 } });
let reachedSelect = false;
for (let i = 0; i < 60 && !reachedSelect; i++) {
  await buyer.keyboard.press("Tab");
  reachedSelect = await buyer.evaluate(() => document.activeElement?.tagName === "SELECT");
}
await buyer.keyboard.press("Tab");
const onButton = await buyer.evaluate(() => document.activeElement?.textContent?.trim());
check("keyboard: the document list and then the Summarize button", reachedSelect && onButton === "Summarize", onButton);

// --- 4. The agent decides ----------------------------------------------------------------------
const bell = await staff.request.get(`${VA}/api/staff/notifications`);
const items = (await bell.json()).items ?? [];
check("bell: the alert links to the member's page", items.some((i) => i.kind === "member_todo" && i.href === `/members/${jordan}`), JSON.stringify(items.slice(0, 3)));
await staff.goto(`${VA}/members/${jordan}`);
check("console: Suggested to-dos panel with two waiting", (await staff.getByRole("button", { name: /^Approve: / }).count()) === 2);
await axeAll(staff, "console /members/[id] (suggested to-dos)");
await shot(staff, "console-member");
// A decided row leaves the list when the page refreshes.
const waitingRows = (n) => staff.waitForFunction((k) => document.querySelectorAll("button[aria-label^='Approve: ']").length === k, n, { timeout: 10000 });
await staff.getByRole("button", { name: /^Approve: / }).first().click();
await waitingRows(1);
await staff.getByRole("button", { name: /^Decline: / }).first().click();
await waitingRows(0);
check("console: nothing left waiting", await staff.getByText("Nothing waiting.").isVisible());
check("console: one approved, one declined, both audited", sql(`select string_agg(status, ',' order by status) from member_todos where profile_id = '${jordan}'`) === "approved,declined" && sql(`select count(*) from staff_audit where actor_id = '${mark}' and action in ('approve_member_todo','decline_member_todo') and ref_id in (select id::text from member_todos where profile_id = '${jordan}')`) === "2");

// --- 5. My to-dos -----------------------------------------------------------------------------
await buyer.goto(`${BASE}/my/todos`);
check("my to-dos: the approved one under To do, labelled", (await buyer.getByRole("checkbox").count()) === 1 && (await buyer.locator("[data-ai-label='suggested']").count()) === 1);
check("my to-dos: the declined one listed", await buyer.getByRole("heading", { name: "Your agent declined these" }).isVisible());
check("my to-dos: its source and page shown", (await buyer.getByText(/^From Inspection report\.pdf, p\. \d+/).count()) >= 1);
await axeAll(buyer, "/my/todos");
for (const width of [390, 320]) {
  const w = await sideScroll(buyer, width);
  check(`/my/todos: no sideways scroll @${width}`, w <= width, `${w}px`);
}
await buyer.getByRole("checkbox").check();
await buyer.waitForTimeout(1500);
check("my to-dos: ticking it marks it done", sql(`select done from member_todos where profile_id = '${jordan}' and status = 'approved'`) === "t");
await shot(buyer, "todos");
buyer.once("dialog", (d) => d.accept());
await buyer.getByRole("button", { name: "Delete my assistant data" }).click();
await buyer.getByText(/^Deleted 1 item/).waitFor({ timeout: 10000 });
check("delete my assistant data: the declined one goes, the approved one stays", sql(`select string_agg(status, ',') from member_todos where profile_id = '${jordan}'`) === "approved");

// --- 6. A seller and a file their transaction desk shared ------------------------------------------
const seller = await newPage();
const sellerEmail = `sam.${stamp}@example.test`;
await joinAs(seller, { email: sellerEmail, name: "Sam Example", role: "seller" });
const sam = sql(`select id from profiles where email = '${sellerEmail}'`);
const ADDRESS = `${stamp % 1000} Fixture Way, Belmont`;
const deal = sql(`insert into deals (address, ratification_date, days_to_close, agent_id, created_by) values ('${ADDRESS}', current_date - 3, 30, '${mark}', '${mark}') returning id`).split("\n")[0];
sql(`insert into deal_members (deal_id, profile_id, member_role) values ('${deal}', '${sam}', 'seller')`);
const shared = `deal/${deal}/Preliminary title report.pdf`;
sql(`insert into storage.objects (bucket_id, name, owner) values ('deal-docs', '${shared}', '${mark}')`);
mkdirSync(join(STORAGE, "deal-docs", "deal", deal), { recursive: true });
writeFileSync(join(STORAGE, "deal-docs", shared), pdf("ok", "Preliminary title report", 12));
writeFileSync(join(STORAGE, "deal-docs", `${shared}.type`), "application/pdf");
stored.push(["deal-docs", shared]);
await seller.goto(`${BASE}/my/documents`);
await seller.getByRole("link", { name: "Summarize Preliminary title report.pdf" }).click();
await seller.waitForURL(/\/my\/assistant\?doc=deal/);
card = await summarize(seller, `Preliminary title report.pdf (shared for ${ADDRESS})`);
check("seller: a shared deal file is summarized", await card.getByRole("heading", { name: "Summary of Preliminary title report.pdf (12 pages)" }).isVisible());
check("seller: the run is recorded against the deal", sql(`select count(*) from ai_runs where profile_id = '${sam}' and deal_id = '${deal}' and feature = 'member_summarize'`) === "1");

// --- Clean up and put everything back -----------------------------------------------------------
await browser.close();
for (const [k, v] of Object.entries(flagsBefore)) sql(`update feature_flags set enabled = ${v === "true"} where key = '${k}'`);
const [zdr, tokens] = settingsBefore.split("|");
sql(`update app_settings set ai_zdr_confirmed_at = ${zdr ? `'${zdr}'` : "null"}, ai_daily_tokens_member = ${tokens}`);
sql(`delete from staff_notifications where kind = 'member_todo' and ref_id in ('${jordan}', '${sam}')`);
sql(`delete from deals where id = '${deal}'`);
for (const [bucket, path] of stored) {
  sql(`delete from storage.objects where bucket_id = '${bucket}' and name = '${path.replace(/'/g, "''")}'`);
  rmSync(join(STORAGE, bucket, path), { force: true });
  rmSync(join(STORAGE, bucket, `${path}.type`), { force: true });
}
sql(`delete from auth.users where email like '%.${stamp}@example.test'`);
check("cleanup: switches back as they were", sql(`select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in (${FLAGS.map((k) => `'${k}'`).join(",")})`) === FLAGS.slice().sort().map((k) => `${k}=${flagsBefore[k]}`).join(","));
check("cleanup: the fictional members, files and to-dos are gone", sql(`select count(*) from profiles where email like '%.${stamp}@example.test'`) === "0" && sql(`select count(*) from member_todos where profile_id in ('${jordan}', '${sam}')`) === "0");
done();
