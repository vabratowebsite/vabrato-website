// S6b PR 2 end-to-end check: the VA assistant's switches and the contract
// reader, on the local stack with a fake Claude server (fake-claude.mjs), so
// no key is needed, nothing is billed and no document leaves the machine.
//
// - Off by default: staff see "Off", the intake form has no reader.
// - An admin can't turn the assistant on before recording Anthropic's Zero
//   Data Retention confirmation; then turns on the master switch and the
//   contract reader (all audited).
// - A VA uploads a fictional contract PDF: the form is filled with page
//   references and an "AI draft" notice, the staged file is deleted, the usage
//   log has metadata only, and the request carried the PDF inline with a JSON
//   schema, no tools and no file upload. The VA corrects a value and creates
//   the transaction: the contingencies and deadlines come from the form.
// - An answer with wiring details isn't shown; an unusable answer isn't used;
//   a file that isn't a PDF is refused before upload.
// - The monthly budget pauses the assistant and alerts admins; raising it
//   resumes. axe at 1440 and 390 px on the new screens.
//
// Start: node scripts/qa/fake-claude.mjs <log>; apps/va with
// ANTHROPIC_BASE_URL=http://127.0.0.1:4020 and any ANTHROPIC_API_KEY; the
// storage shim (upload, list, download, remove). Needs SERVICE_KEY and
// CLAUDE_LOG (the fake's log). Fictional people and contract; the switches are
// turned off and the test deals removed at the end.

import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { axeAll, check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const LOG = process.env.CLAUDE_LOG;
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s6b");
mkdirSync(OUT, { recursive: true });
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const logLines = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean);
// Only this run's requests: the fake keeps its log until it's restarted.
const before = logLines().length;
const asked = () => logLines().slice(before).map((l) => JSON.parse(l));

/** A one-page PDF with the given lines (uncompressed, so the fake can see the mode marker). */
function pdf(lines) {
  const text = `BT /F1 12 Tf 72 720 Td ${lines.map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj 0 -18 Td`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const at = objs.map((o, i) => {
    const offset = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return offset;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
const contract = (mode) => ({ name: "Fictional purchase agreement.pdf", mimeType: "application/pdf", buffer: pdf(["FICTIONAL RESIDENTIAL PURCHASE AGREEMENT (QA fixture)", "Property: 12 Fictional Lane, San Carlos", `QA-MODE: ${mode}`]) });

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

async function shots(page, name) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: join(OUT, `${name}-${width}.jpg`), fullPage: true, type: "jpeg", quality: 70 });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

const value = (page, label) => page.getByLabel(label, { exact: true }).inputValue();
const staged = () => Number(sql(`select count(*) from storage.objects where bucket_id = 'deal-docs' and name like 'intake/%'`));
const runs = () => sql(`select coalesce(string_agg(status, ',' order by created_at), '') from ai_runs`);

/** Uploads a contract on /deals/new and waits for the reader to finish, one way or the other. */
async function read(page, file) {
  await page.getByLabel("Contract (PDF, up to 20 MB)").setInputFiles(file);
  await page.getByRole("button", { name: "Read contract" }).click();
  const reader = page.getByRole("region", { name: "Fill in from the contract" });
  await reader.getByRole("alert").or(reader.getByRole("status").filter({ hasText: /Filled in/ })).waitFor({ timeout: 30000 });
  return reader;
}

/** Submits the intake form and returns the new deal's id; on failure, says which field the browser refused or what the console said. */
async function createDeal(page) {
  await page.getByRole("button", { name: "Create transaction and task list" }).click();
  try {
    await page.waitForURL(/\/deals\/[0-9a-f-]{36}$/, { timeout: 20000 });
  } catch {
    const why = await page.evaluate(() =>
      [...document.querySelectorAll("form :invalid")].map((el) => `${el.getAttribute("name")}="${el.value}": ${el.validationMessage}`).concat([...document.querySelectorAll("form [role=alert]")].map((el) => el.textContent)).join("; "),
    );
    throw new Error(`the transaction wasn't created: ${why || "no message on the page"}`);
  }
  return page.url().split("/").pop();
}

// --- Setup: a clean slate, fictional staff ----------------------------------------------------
sql(`update feature_flags set enabled = false where key like 'ai\\_%'`);
sql(`update app_settings set ai_zdr_confirmed_at = null, ai_zdr_confirmed_by = null, ai_zdr_note = null, ai_monthly_budget_usd = 100, ai_daily_requests_staff = 100`);
sql(`delete from ai_runs; delete from storage.objects where bucket_id = 'deal-docs' and name like 'intake/%'`);
const ada = await staffAccount("Ada", "admin");
const vera = await staffAccount("Vera", "va");
const auditFrom = sql(`select coalesce(max(id), 0) from staff_audit`);
const deals = [];

try {
  // 1. Off by default.
  const v = await signIn(vera.email);
  await v.goto(`${VA}/assistant`);
  check("VA: the assistant shows as off", await v.getByRole("status").filter({ hasText: "The assistant is off" }).isVisible());
  check("VA: no admin controls", (await v.getByRole("heading", { name: "Switches" }).count()) === 0 && (await v.getByRole("heading", { name: "Limits" }).count()) === 0 && (await v.getByRole("heading", { name: "This month" }).count()) === 0);
  check("VA: sees their own use today", await v.getByText("Your use today: 0 of 100 requests").isVisible());
  await axeAll(v, "/assistant (VA, off)");
  await v.goto(`${VA}/deals/new`);
  check("intake: no contract reader while off", (await v.getByRole("heading", { name: "Fill in from the contract" }).count()) === 0);
  check("intake: the usual contingency days are filled in", (await value(v, "Insurance")) === "7" && (await value(v, "Loan")) === "7" && (await value(v, "Appraisal")) === "8" && (await value(v, "Property condition")) === "8");
  await axeAll(v, "/deals/new (reader off)");

  // 2. The admin turns it on: Zero Data Retention first.
  const a = await signIn(ada.email);
  await a.goto(`${VA}/assistant`);
  check("admin: sees what's needed first", (await a.getByText("Not confirmed").isVisible()) && (await a.getByRole("heading", { name: "Before turning it on" }).isVisible()));
  check("admin: the API key shows as set, without its value", (await a.getByText("The console has an Anthropic API key.").isVisible()) && !(await a.content()).includes(process.env.ANTHROPIC_API_KEY ?? "qa-local-not-a-key"));
  await axeAll(a, "/assistant (admin, off)");
  await a.getByRole("button", { name: "Turn on: The assistant (master switch)" }).click();
  await a.getByRole("alert").filter({ hasText: "Record Anthropic's written Zero Data Retention confirmation first" }).waitFor();
  check("admin: can't turn it on before the ZDR confirmation", sql(`select enabled from feature_flags where key = 'ai_enabled'`) === "f");
  await a.getByLabel("Where the written confirmation is filed").fill("QA fixture: email from Anthropic dated 2026-11-01, filed by Ada");
  await a.getByRole("button", { name: "Record the confirmation" }).click();
  check("admin: the confirmation needs the tick box (and the note isn't lost)", sql(`select ai_zdr_confirmed_at is null from app_settings`) === "t" && (await a.getByLabel("Where the written confirmation is filed").inputValue()).startsWith("QA fixture"));
  await a.getByLabel(/We have Anthropic's confirmation/).check();
  await a.getByRole("button", { name: "Record the confirmation" }).click();
  await a.getByText("Confirmed", { exact: true }).waitFor();
  check("admin: the confirmation is recorded with who and where", (await a.getByText(/by Ada Example: QA fixture: email from Anthropic/).isVisible()) && sql(`select ai_zdr_confirmed_by from app_settings`) === ada.id);
  await a.getByRole("button", { name: "Turn on: The assistant (master switch)" }).click();
  await a.getByRole("button", { name: "Turn off: The assistant (master switch)" }).waitFor();
  await a.getByRole("button", { name: "Turn on: Contract reader" }).click();
  await a.getByRole("button", { name: "Turn off: Contract reader" }).waitFor();
  check("admin: both switches are on", sql(`select string_agg(key, ',' order by key) from feature_flags where key like 'ai\\_%' and enabled`) === "ai_enabled,ai_staff_contract_reader");
  check("admin: every change is in the audit log", sql(`select string_agg(action || coalesce(':' || ref_id, ''), ',' order by id) from staff_audit where id > ${auditFrom} and actor_id = '${ada.id}'`) === "confirm_ai_zdr,set_ai_flag:ai_enabled,set_ai_flag:ai_staff_contract_reader");
  await a.reload();
  await axeAll(a, "/assistant (admin, on)");

  // A VA can't flip a switch, even by calling the database directly.
  check("VA: no switch buttons", (await v.goto(`${VA}/assistant`), await v.getByRole("button", { name: /Turn off/ }).count()) === 0);
  check("VA: sees it on, with a link to use it", (await v.getByRole("status").filter({ hasText: "The assistant is on" }).isVisible()) && (await v.getByRole("link", { name: "Use it in New transaction" }).isVisible()));

  // 3. The VA reads a contract.
  await v.goto(`${VA}/deals/new`);
  await v.getByRole("heading", { name: "Fill in from the contract" }).waitFor();
  await axeAll(v, "/deals/new (reader on)");

  // Not a PDF: refused in the browser, nothing uploaded, nothing asked.
  let reader = await read(v, { name: "contract.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>not a pdf</html>") });
  check("a file that isn't a PDF is refused", await reader.getByRole("alert").filter({ hasText: "Upload the contract as a PDF." }).isVisible());
  check("…before anything is uploaded or asked", staged() === 0 && asked().length === 0 && runs() === "");

  reader = await read(v, contract("ok"));
  check("the reader says how many fields it filled", await reader.getByRole("status").filter({ hasText: /Filled in 10 fields from the contract\. Check each one/ }).isVisible());
  check(
    "the form is filled from the contract",
    (await value(v, "Property address (required)")) === "12 Fictional Lane, San Carlos, CA" &&
      (await value(v, "Seller name")) === "Dana Example, Trustee of the Example Family Trust" &&
      (await value(v, "Seller type")) === "trust" &&
      (await value(v, "Ratification date (required)")) === "2026-03-02" &&
      (await value(v, "Days to close escrow (required)")) === "30" &&
      (await value(v, "Rent-back days")) === "3" &&
      (await value(v, "Sale price ($)")) === "2150000" &&
      (await value(v, "Loan")) === "21" &&
      (await value(v, "Appraisal")) === "17" &&
      (await value(v, "Property condition")) === "10" &&
      (await value(v, "Insurance")) === "7",
  );
  check("each value shows its page and a quote", (await v.getByText("From the contract, page 16: “Counter Offer No. 1 accepted: March 2, 2026”").isVisible()) && (await v.getByText("From the contract, page 2: “21 (or __) Days After Acceptance”").isVisible()));
  const draft = v.getByRole("region", { name: "AI draft: check before you create the transaction" });
  check("the AI draft notice lists what to check by hand", (await draft.getByText("Buyer's initials are missing at the bottom of page 6.").isVisible()) && (await draft.getByText(/Insurance contingency: not found in the contract\. The usual 7 days are shown/).isVisible()));
  check("the escrow number is left for the person (the reader never fills it)", (await value(v, "Escrow number")) === "");
  check("the estate tasks note follows the seller type", await v.getByText(/Letters Testamentary or trust certificate/).isVisible());
  check("the staged file is deleted", staged() === 0);
  check("the usage log has one finished request, metadata only", sql(`select feature || '|' || status || '|' || model || '|' || input_tokens || '|' || output_tokens || '|' || cost_micros || '|' || (profile_id = '${vera.id}') from ai_runs`) === "staff_contract_reader|ok|claude-opus-5-5|61000|900|262000|true");
  const req = asked()[0] ?? {};
  check("the request: the key, one inline PDF, a JSON schema, our rules, no tools, no file upload", asked().length === 1 && req.hasKey && req.documents === 1 && req.documentIsInlinePdf && req.fileReferences === 0 && req.tools === 0 && req.format === "json_schema" && req.messages === 1 && req.systemHasFeatureRules && req.systemHasAlwaysRules && !("unexpected" in req), JSON.stringify(req));
  check("the request: Claude Opus 5.5 with the fallback, adaptive thinking, high effort", req.model === "claude-opus-5-5" && req.fallbacks?.join() === "claude-opus-4-8" && req.thinking === "adaptive" && req.effort === "high" && /server-side-fallback/.test(req.beta ?? ""), JSON.stringify(req));
  await axeAll(v, "/deals/new (AI draft)");
  await shots(v, "intake-ai-draft");

  // The person decides: the VA corrects a value, then creates the transaction.
  await v.getByLabel("Loan", { exact: true }).fill("17");
  await v.getByLabel("Escrow number").fill(`QA-${stamp}`);
  const deal = await createDeal(v);
  deals.push(deal);
  check("the deal holds what the person confirmed", sql(`select address || '|' || seller_type || '|' || ratification_date || '|' || days_to_close || '|' || rent_back_days || '|' || sale_price::int from deals where id = '${deal}'`) === "12 Fictional Lane, San Carlos, CA|trust|2026-03-02|30|3|2150000");
  check("contingencies come from the form (the VA's 17, not the reader's 21)", sql(`select string_agg(kind || ':' || offset_days || ':' || due_date, ',' order by kind) from deal_contingencies where deal_id = '${deal}'`) === "appraisal:17:2026-03-19,financing:17:2026-03-19,insurance:7:2026-03-09,property_condition:10:2026-03-12");
  check("the schedule engine dated the removal tasks", sql(`select string_agg(due_date::text, ',' order by due_date) from tasks where deal_id = '${deal}' and title like '%contingency removal'`) === "2026-03-09,2026-03-12,2026-03-19,2026-03-19");
  check("nothing from the reader is stored with the deal", sql(`select count(*) from ai_runs where deal_id is not null`) === "0" && staged() === 0);

  // 4. An all-cash offer: waived contingencies are blank and create no tasks.
  await v.goto(`${VA}/deals/new`);
  reader = await read(v, contract("cash"));
  check("waived contingencies are blanked, with a note", (await value(v, "Loan")) === "" && (await value(v, "Appraisal")) === "" && (await value(v, "Property condition")) === "7" && (await v.getByText("Loan contingency: waived or removed in the contract, so the field is blank.").isVisible()));
  deals.push(await createDeal(v));
  check("the cash deal has no loan or appraisal contingency", sql(`select string_agg(kind, ',' order by kind) from deal_contingencies where deal_id = '${deals[1]}'`) === "insurance,property_condition" && sql(`select count(*) from tasks where deal_id = '${deals[1]}' and (title like 'Financing%' or title like 'Appraisal contingency%')`) === "0");

  // 5. Answers that must not be shown or used.
  await v.goto(`${VA}/deals/new`);
  reader = await read(v, contract("wiring"));
  check("an answer with wiring details isn't shown", (await reader.getByRole("alert").filter({ hasText: "contained payment or wiring details" }).isVisible()) && !(await v.content()).includes("021000021"));
  check("…and the form is untouched", (await value(v, "Property address (required)")) === "" && (await v.getByRole("region", { name: /AI draft/ }).count()) === 0);
  reader = await read(v, contract("invalid"));
  check("an answer in the wrong shape isn't used", await reader.getByRole("alert").filter({ hasText: "The assistant's answer wasn't usable" }).isVisible());
  reader = await read(v, contract("refusal"));
  check("a declined request says so", await reader.getByRole("alert").filter({ hasText: "The assistant couldn't help with this request" }).isVisible());
  check("the log records how each request ended", runs() === "ok,ok,blocked_output,error,refused", runs());
  check("no staged file survives a failed read", staged() === 0);
  await shots(v, "intake-reader-refused");

  // 6. The admin's view of the month; the budget pauses the assistant and alerts admins.
  await a.goto(`${VA}/assistant`);
  check("admin: this month's spend and requests by feature", (await a.getByText(/\$1\.31 of the \$100 budget used \(1%\), across 5 requests/).isVisible()) && (await a.getByRole("row", { name: /Contract reader 5 3 \$1\.31/ }).isVisible()));
  await axeAll(a, "/assistant (admin, with use)");
  await shots(a, "assistant-admin");
  await a.getByLabel("Monthly budget for everyone ($)").fill("2");
  await a.getByRole("button", { name: "Save limits" }).click();
  await a.getByRole("status").filter({ hasText: "Limits saved." }).waitFor();
  await v.goto(`${VA}/deals/new`);
  // Each fake request costs $0.262 (61,000 tokens in, 900 out on Opus 5.5).
  const budgetAlerts = () => sql(`select coalesce(string_agg(title, '|' order by created_at), '') from staff_notifications where kind = 'ai_budget' and recipient_id = '${ada.id}'`);
  reader = await read(v, contract("ok")); // $1.31 → $1.57: 79%
  check("no alert below 80% of the budget", budgetAlerts() === "");
  reader = await read(v, contract("ok")); // → $1.83: past 80% of $2
  check("a request that takes the month past 80% alerts the admins once", budgetAlerts() === "AI budget: 80% of this month's $2 is used");
  reader = await read(v, contract("ok")); // → $2.10: reaches the budget
  check("reaching the budget alerts the admins", sql(`select count(*) from staff_notifications where kind = 'ai_budget' and recipient_id = '${ada.id}' and title like 'AI budget reached%'`) === "1");
  const before = asked().length;
  reader = await read(v, contract("ok"));
  check("at the budget the assistant pauses: nothing is sent", (await reader.getByRole("alert").filter({ hasText: "reached this month's budget" }).isVisible()) && asked().length === before && staged() === 0);
  await a.goto(`${VA}/`);
  await a.getByRole("button", { name: /^Alerts/ }).click();
  const alertLink = a.getByRole("link", { name: /AI budget reached/ });
  check("the alert is in the admin's bell and opens the Assistant page", (await alertLink.getAttribute("href")) === "/assistant");
  check("the VA got no budget alert", sql(`select count(*) from staff_notifications where kind = 'ai_budget' and recipient_id = '${vera.id}'`) === "0");
  await a.goto(`${VA}/assistant`);
  await a.getByLabel("Monthly budget for everyone ($)").fill("100");
  await a.getByRole("button", { name: "Save limits" }).click();
  await a.getByRole("status").filter({ hasText: "Limits saved." }).waitFor();
  reader = await read(v, contract("ok"));
  check("raising the budget resumes it", await reader.getByRole("status").filter({ hasText: /Filled in 10 fields/ }).isVisible());

  // The daily limit, per person.
  sql(`update app_settings set ai_daily_requests_staff = ${sql(`select count(*) from ai_runs where profile_id = '${vera.id}'`)}`);
  reader = await read(v, contract("ok"));
  check("the daily limit stops the person who reached it", await reader.getByRole("alert").filter({ hasText: "You've reached today's limit" }).isVisible());
  sql(`update app_settings set ai_daily_requests_staff = 100`);

  // 7. Off again: the master switch stops everything at once.
  await a.goto(`${VA}/assistant`);
  await a.getByRole("button", { name: "Turn off: The assistant (master switch)" }).click();
  await a.getByRole("button", { name: "Turn on: The assistant (master switch)" }).waitFor();
  await v.goto(`${VA}/deals/new`);
  check("master switch off: the reader is gone from intake", (await v.getByRole("heading", { name: "Fill in from the contract" }).count()) === 0);
  await v.goto(`${VA}/assistant`);
  await shots(v, "assistant-va-off");

  check("the console never called anything but the Messages endpoint", asked().every((r) => !("unexpected" in r)));
  check("the API key never reached the browser pages", !(await a.content()).includes(process.env.ANTHROPIC_API_KEY ?? "qa-local-not-a-key"));
} finally {
  sql(`update feature_flags set enabled = false where key like 'ai\\_%'`);
  sql(`update app_settings set ai_zdr_confirmed_at = null, ai_zdr_confirmed_by = null, ai_zdr_note = null, ai_monthly_budget_usd = 100, ai_daily_requests_staff = 100`);
  for (const d of deals) sql(`delete from deals where id = '${d}'`);
  sql(`delete from ai_runs; delete from staff_notifications where kind = 'ai_budget'`);
  await browser.close();
}
done();
