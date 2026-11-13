// S6b PR 7c end-to-end check: what changed in a counter offer, and "Check
// unchecked documents", on the local stack with the fake Claude server
// (fake-claude.mjs): no key, no cost, fictional files and terms.
//
// - Off by default: no "What changed", no "Check unchecked documents".
// - What changed: one inline PDF and our terms as data; the table marks what
//   differs from our records (ours, not the model's), with pages and quotes;
//   contacts redacted; "shown only"; the deal's terms in the database are
//   unchanged; an unsigned one says it may not be in effect; only files typed
//   as a counter offer get the button.
// - Check unchecked: the count and the number of requests are shown before
//   anything is sent; Cancel sends nothing; 11 unchecked files are checked 10
//   then 1, oldest first, the seller's upload included; each is stamped with
//   the agent and the time, and never the issue text; suggested types can be
//   saved; Stop finishes the current file and stops.
// - An agent without deal access gets a 404. axe at 1440 and 390 px; screenshots.
//
// Start: node scripts/qa/fake-claude.mjs <log>; apps/va with
// ANTHROPIC_BASE_URL=http://127.0.0.1:4020 and any ANTHROPIC_API_KEY. Needs
// SERVICE_KEY, CLAUDE_LOG, STORAGE_DIR and migrations up to 0034.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { axeAll, check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const LOG = process.env.CLAUDE_LOG;
const STORAGE = process.env.STORAGE_DIR ?? "/var/tmp/vabrato-auth/storage-files";
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s6b-counter-checks");
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

async function waitText(page, re, timeout = 60000) {
  try {
    await page.getByText(re).first().waitFor({ timeout });
  } catch {
    throw new Error(`no ${re}; alerts: ${JSON.stringify(await page.getByRole("alert").allTextContents())}; status: ${JSON.stringify(await page.getByRole("status").allTextContents())}`);
  }
}

function put(bucket, path, mode, name) {
  sql(`insert into storage.objects (bucket_id, name) values ('${bucket}', '${path}')`);
  mkdirSync(join(STORAGE, bucket, path, ".."), { recursive: true });
  writeFileSync(join(STORAGE, bucket, path), pdf(mode, name));
  writeFileSync(join(STORAGE, bucket, `${path}.type`), "application/pdf");
}

// A file in the deal's staff folder, filed with its types; `ago` minutes old (oldest are checked first).
function file(deal, name, mode, types, ago) {
  const path = `deal/${deal}/staff/${stamp}-${ago}-${name}`;
  put("deal-docs", path, mode, name);
  return sql(`insert into deal_documents (deal_id, path, file_name, size_bytes, content_type, doc_types, shared, created_at) values ('${deal}', '${path}', '${name}', 100, 'application/pdf', '{${types.join(",")}}', false, now() - interval '${ago} minutes') returning id`).split("\n")[0];
}

// --- Setup ---------------------------------------------------------------------------------------
const leadAdminBefore = sql(`select coalesce(lead_admin_id::text, '') from app_settings`);
const AI = "('ai_enabled', 'ai_staff_counter_changes', 'ai_staff_document_check')";
sql(`update feature_flags set enabled = false where key like 'ai\\_%'`);
sql(`delete from ai_runs`);
const ada = await account("Ada", "admin");
const avery = await account("Avery", "agent");
const blake = await account("Blake", "agent");
const sam = await account("Sam", "seller");
sql(`update app_settings set ai_zdr_confirmed_at = now(), ai_zdr_confirmed_by = '${ada.id}', ai_zdr_note = 'QA fixture (fictional)', lead_admin_id = '${ada.id}', lead_admin_away = false`);
const ADDRESS = `${stamp % 1000} Fixture Court, Belmont`;
const deal = sql(`insert into deals (address, seller_type, ratification_date, days_to_close, sale_price, rent_back_days, agent_id, created_by) values ('${ADDRESS}', 'normal', current_date - 5, 30, 2100000, 0, '${avery.id}', '${avery.id}') returning id`).split("\n")[0];
sql(`insert into deal_contingencies (deal_id, kind, offset_days) values ('${deal}', 'insurance', 7), ('${deal}', 'financing', 21), ('${deal}', 'appraisal', 17), ('${deal}', 'property_condition', 10) on conflict (deal_id, kind) do update set offset_days = excluded.offset_days`);
sql(`insert into deal_members (deal_id, profile_id, member_role) values ('${deal}', '${sam.id}', 'seller')`);
sql(`update profiles set agent_id = '${avery.id}' where id = '${sam.id}'`);
const termsNow = () => sql(`select d.sale_price || '|' || d.rent_back_days || '|' || d.days_to_close || '|' || d.ratification_date || '|' || (select string_agg(kind || '=' || offset_days, ',' order by kind) from deal_contingencies where deal_id = d.id) from deals d where d.id = '${deal}'`);
const termsBefore = termsNow();

file(deal, "Counter offer 1.pdf", "ok", ["counter_offer"], 100);
file(deal, "Counter offer 2.pdf", "unsigned", ["counter_offer"], 90);
const others = Array.from({ length: 8 }, (_, i) => file(deal, `Disclosure ${i + 1}.pdf`, "ok", i === 0 ? ["rpa"] : [], 80 - i));
const mdoc = sql(`insert into member_documents (profile_id, name, storage_path, size_bytes, content_type, uploaded_by, created_at) values ('${sam.id}', 'Seller addendum.pdf', 'member/${sam.id}/${stamp}-addendum.pdf', 100, 'application/pdf', '${sam.id}', now() - interval '1 minute') returning id`).split("\n")[0];
put("member-docs", `member/${sam.id}/${stamp}-addendum.pdf`, "ok", "Seller addendum.pdf");
const ai = (on) => sql(`update feature_flags set enabled = ${on} where key in ${AI}`);
const checkedCount = () => Number(sql(`select (select count(*) from deal_documents where deal_id = '${deal}' and checked_at is not null) + (select count(*) from deal_member_document_types where deal_id = '${deal}' and checked_at is not null)`));

try {
  // 1. Off by default.
  const av = await signIn(avery.email);
  await av.goto(`${VA}/deals/${deal}/documents`);
  check("off: no What changed and no Check unchecked documents", (await av.getByRole("button", { name: /^What changed/ }).count()) === 0 && (await av.getByRole("button", { name: /Check unchecked documents/ }).count()) === 0);

  // 2. What changed in a counter offer.
  ai(true);
  await av.goto(`${VA}/deals/${deal}/documents`);
  check("on: What changed only next to files typed as a counter offer (2)", (await av.getByRole("button", { name: /^What changed/ }).count()) === 2);
  check("on: every file says it hasn't been checked yet", (await av.getByText("Not checked yet").count()) === 11);
  await av.getByRole("button", { name: /^What changed\s*:\s*Counter offer 1\.pdf$/ }).click();
  await waitText(av, /Read\. 3 terms differ from our records\./);
  const req = last();
  check("what changed: one inline PDF and our terms as data; no contacts, tools or file uploads", req.feature === "counter_changes" && req.documents === 1 && req.documentIsInlinePdf && req.dataBlocks === 1 && !req.requestHasEmail && !req.requestHasPhone && req.tools === 0 && req.fileReferences === 0, JSON.stringify(req));
  const box = av.getByRole("region", { name: "What Counter offer 1.pdf changes" });
  const termRow = (label) => box.getByRole("listitem").filter({ has: av.getByText(label, { exact: true }) });
  check("what changed: price differs, ours and theirs with the page", (await termRow("Purchase price").getByText("Differs").isVisible()) && (await termRow("Purchase price").getByText("$2,100,000").isVisible()) && (await termRow("Purchase price").getByText("$2,150,000 (page 1)").isVisible()));
  check("what changed: loan contingency the same, appraisal removed, insurance not in this document", (await termRow("Loan contingency").getByText("Same").isVisible()) && (await termRow("Appraisal contingency").getByText("Removed or waived").isVisible()) && (await termRow("Insurance contingency").getByText("Not in this document").isVisible()));
  check("what changed: contacts in quotes and other changes are redacted", (await box.getByText(/Questions to \[email\]/).isVisible()) && (await box.getByText(/call \[phone\]/).isVisible()) && !(await box.textContent()).includes("example.com"));
  check("what changed: shown only, and the deal's terms are unchanged", (await box.getByText("Shown only. The deal's terms and schedule are not changed.").isVisible()) && termsNow() === termsBefore, termsNow());
  check("what changed: nothing is stored", sql(`select count(*) from ai_drafts`) === "0" && checkedCount() === 0);
  await axeAll(av, "/deals/[id]/documents (what changed)");
  await av.setViewportSize({ width: 390, height: 900 });
  const sideScroll = await av.evaluate(() => document.documentElement.scrollWidth);
  await av.setViewportSize({ width: 1440, height: 900 });
  check("390 px: no sideways scrolling (the deal tabs wrap)", sideScroll <= 390, `${sideScroll}px`);
  await shots(av, "what-changed");
  await av.getByRole("button", { name: /^What changed\s*:\s*Counter offer 2\.pdf$/ }).click();
  await waitText(av, /This may not be signed by both sides; it may not be in effect\./);
  check("what changed: an unsigned counter offer says it may not be in effect", true);

  // 3. Check unchecked documents: confirm first.
  await av.goto(`${VA}/deals/${deal}/documents`);
  const sentBefore = asked().length;
  await av.getByRole("button", { name: "Check unchecked documents (11)" }).click();
  check(
    "batch: the question gives the count and the number of requests",
    await av.getByText("Check 10 of 11 unchecked documents? Each file is one assistant request: 10 requests, counted against your daily limit. Oldest first.").isVisible(),
  );
  await axeAll(av, "/deals/[id]/documents (check unchecked question)");
  await av.getByRole("button", { name: "Cancel" }).click();
  check("batch: Cancel sends nothing", asked().length === sentBefore && checkedCount() === 0);

  // 4. Ten, then one.
  await av.getByRole("button", { name: "Check unchecked documents (11)" }).click();
  await av.getByRole("button", { name: "Check 10 documents" }).click();
  await waitText(av, /Checked 10 of 10\./, 120000);
  check("batch: ten requests, one file each, for this deal's documents check", asked().length === sentBefore + 10 && asked().slice(-10).every((r) => r.feature === "document_check" && r.documents === 1));
  const stamps = sql(`select string_agg(distinct coalesce(checked_by::text, 'none'), ',') || '|' || count(*) filter (where checked_at > now() - interval '5 minutes') || '|' || coalesce(sum(check_issue_count), 0) || '|' || string_agg(distinct check_signed, ',') from deal_documents where deal_id = '${deal}' and checked_at is not null`);
  check("batch: each file is stamped with the agent, now, the signed answer and the count", stamps === `${avery.id}|10|20|unclear`, stamps);
  check("batch: the oldest ten were checked; the seller's newer upload is left", checkedCount() === 10 && sql(`select count(*) from deal_member_document_types where deal_id = '${deal}' and checked_at is not null`) === "0");
  check("batch: no issue text is stored anywhere", sql(`select count(*) from deal_documents where row_to_json(deal_documents)::text like '%initials missing%'`) === "0");
  const results = av.getByRole("list", { name: "Check results" });
  await av.getByText(/^Checked .* by Avery Example: signatures unclear, 2 things to look at$/).nth(9).waitFor({ timeout: 15000 });
  const listed = await results.locator(":scope > li").count();
  const stampLines = await av.getByText(/^Checked .* by Avery Example: signatures unclear, 2 things to look at$/).count();
  check("batch: results listed with pages, and a stamp on each file", listed === 10 && (await results.getByText("Page 3: Seller initials missing at the bottom of the page.").first().isVisible()) && stampLines === 10, `${listed} results, ${stampLines} stamps`);
  await results.getByRole("button", { name: /Save these types\s*for Disclosure 2\.pdf/ }).click();
  await results.getByText("Types saved.").waitFor();
  check("batch: suggested types saved for one file (known types only)", sql(`select array_to_string(doc_types, ',') from deal_documents where id = '${others[1]}'`) === "tds,spq");
  await axeAll(av, "/deals/[id]/documents (check results)");
  await shots(av, "check-results");

  await av.goto(`${VA}/deals/${deal}/documents`);
  await av.getByRole("button", { name: "Check unchecked documents (1)" }).click();
  check("batch: the last one is asked for as one request", await av.getByText(/^Check 1 unchecked document\? Each file is one assistant request: 1 request,/).isVisible());
  await av.getByRole("button", { name: "Check 1 document" }).click();
  await waitText(av, /Checked 1 of 1\./);
  const m = sql(`select checked_by || '|' || check_signed || '|' || check_issue_count from deal_member_document_types where deal_id = '${deal}' and member_document_id = '${mdoc}'`);
  check("batch: the seller's upload is checked and stamped for this deal", m === `${avery.id}|unclear|2`, m);
  await av.goto(`${VA}/deals/${deal}/documents`);
  check("batch: every document checked; no button left", (await av.getByText("Every document has been checked by the assistant.").isVisible()) && (await av.getByRole("button", { name: /Check unchecked documents/ }).count()) === 0);

  // 5. Stop finishes the current file and stops.
  const slow = [file(deal, "Late 1.pdf", "slow", [], 0), file(deal, "Late 2.pdf", "slow", [], 0), file(deal, "Late 3.pdf", "slow", [], 0)];
  await av.goto(`${VA}/deals/${deal}/documents`);
  await av.getByRole("button", { name: "Check unchecked documents (3)" }).click();
  await av.getByRole("button", { name: "Check 3 documents" }).click();
  await av.getByText(/^Checking 1 of 3:/).waitFor();
  await av.getByRole("button", { name: "Stop after this one" }).click();
  await waitText(av, /Stopped\. Checked 1 of 3\./);
  check("stop: one file checked, two left unchecked", sql(`select count(*) from deal_documents where id in (${slow.map((s) => `'${s}'`).join(",")}) and checked_at is not null`) === "1");

  // 6. An agent without deal access.
  const bl = await signIn(blake.email);
  const r404 = await bl.goto(`${VA}/deals/${deal}/documents`);
  check("an agent without deal access gets a 404", r404?.status() === 404, `${r404?.status()}`);
  await bl.context().close();

  const runs = sql(`select string_agg(feature || ':' || status || ':' || n, ',' order by feature, status) from (select feature, status, count(*) n from ai_runs group by 1, 2) x`);
  check("the usage log has metadata only", runs === "staff_counter_changes:ok:2,staff_document_check:ok:12", runs);
  check("the console called nothing but the Messages endpoint", asked().every((r) => !("unexpected" in r)));
} finally {
  ai(false);
  sql(`update app_settings set ai_zdr_confirmed_at = null, ai_zdr_confirmed_by = null, ai_zdr_note = null, lead_admin_id = ${leadAdminBefore ? `'${leadAdminBefore}'` : "null"}`);
  const objects = sql(`select bucket_id || '/' || name from storage.objects where name like 'deal/${deal}/%' or name like 'member/${sam.id}/%'`).split("\n").filter(Boolean);
  for (const o of objects) for (const ext of ["", ".type"]) rmSync(join(STORAGE, o) + ext, { force: true });
  sql(`delete from storage.objects where name like 'deal/${deal}/%' or name like 'member/${sam.id}/%'`);
  sql(`delete from deals where id = '${deal}'; delete from member_documents where profile_id = '${sam.id}'; delete from ai_runs`);
  sql(`delete from staff_notifications where recipient_id in ('${ada.id}', '${avery.id}', '${blake.id}')`);
  await browser.close();
}
done();
