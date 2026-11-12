// S6b PR 7a end-to-end check: deal documents, the seller-type checklist,
// "Check this document" and the receipt reader, on the local stack with the
// fake Claude server (fake-claude.mjs): no key, no cost, fictional files.
//
// - Off by default: the Documents tab and the checklist work, with no
//   assistant buttons; no "Read it" on Receipts.
// - Upload (staff-only), checklist counts, "not needed", the seller's own
//   upload tagged for the deal.
// - Share with the seller: they see it in /my/documents; stop sharing: they
//   don't. A staff-only file is refused to the seller by URL.
// - With the switches on: Check this document suggests types (unknown ones
//   dropped) and issues with pages; wiring in an answer is refused; a receipt
//   read into the form and saved with its file; an unreadable one explained.
// - Today lists the deal's missing documents; another agent sees nothing.
// - Amendment (2026-11-13): "not set up yet" before 0032; the trust list
//   with its "If they apply" group and counts; a top-level unfiled file says
//   the seller can see it; the share warning; stop sharing fails safe when
//   the seller's copy can't be removed; the audit log; a receipt whose
//   upload was tidied away isn't accepted.
// - axe at 1440 and 390 px; screenshots. Everything added is removed.
//
// Start: node scripts/qa/fake-claude.mjs <log>; apps/va with
// ANTHROPIC_BASE_URL=http://127.0.0.1:4020 and any ANTHROPIC_API_KEY; apps/web.
// Needs SERVICE_KEY, CLAUDE_LOG, STORAGE_DIR (the QA storage shim's folder)
// and migration 0032.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BASE, axeAll, check, done, joinAs, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const LOG = process.env.CLAUDE_LOG;
const STORAGE = process.env.STORAGE_DIR ?? "/var/tmp/vabrato-auth/storage-files";
if (!LOG || !process.env.SERVICE_KEY) throw new Error("set CLAUDE_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/s6b-documents");
mkdirSync(OUT, { recursive: true });
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const logLines = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean);
const before = logLines().length;
const asked = () => logLines().slice(before).map((l) => JSON.parse(l));
const last = () => asked().at(-1) ?? {};
const dialogs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Before 0032 is applied: hide the table (and tell PostgREST), then put it back.
const hideDocs = async (hide) => {
  sql(hide ? `alter table deal_documents rename to deal_documents_qa_hidden` : `alter table if exists deal_documents_qa_hidden rename to deal_documents`);
  sql(`notify pgrst, 'reload schema'`);
  await sleep(1500);
};
const BLOCK = "qa_block_unshare_delete";

// Fictional files: the fake Claude reads "QA-MODE: …" from their bytes.
const pdf = (mode, title) => Buffer.from(`%PDF-1.4\n% ${title} (fictional QA file)\n% QA-MODE: ${mode}\n%%EOF\n`);
const png = (mode) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`QA receipt (fictional) QA-MODE: ${mode}`)]);

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
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    d.accept();
  });
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

async function upload(page, name, buffer, type) {
  await page.getByLabel("File (PDF, JPG or PNG, up to 20 MB)").setInputFiles({ name, mimeType: "application/pdf", buffer });
  if (type) await page.getByLabel("What is it? (optional)").selectOption({ label: type });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await waitStatus(page, `Filed ${name}. It's staff-only until you share it.`);
  await page.reload();
}

const heading = async (page) => (await page.getByRole("heading", { name: /^Checklist for a/ }).innerText()).trim();

// --- Setup ---------------------------------------------------------------------------------------
// The seller joins on the website first, so a failure here changes no settings.
const sellerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const sp = await sellerCtx.newPage();
const sellerEmail = `riley.${stamp}@example.test`;
await joinAs(sp, { email: sellerEmail, name: "Riley Example", role: "seller" });
const leadAdminBefore = sql(`select coalesce(lead_admin_id::text, '') from app_settings`);
const AI = "('ai_enabled', 'ai_staff_document_check', 'ai_staff_receipt_reader')";
sql(`update feature_flags set enabled = false where key like 'ai\\_%'`);
sql(`delete from ai_runs`);
const ada = await account("Ada", "admin");
const avery = await account("Avery", "agent");
const blake = await account("Blake", "agent");
sql(`update app_settings set ai_zdr_confirmed_at = now(), ai_zdr_confirmed_by = '${ada.id}', ai_zdr_note = 'QA fixture (fictional)', lead_admin_id = '${ada.id}', lead_admin_away = false`);

const seller = sql(`select id from profiles where email = '${sellerEmail}'`);
sql(`update profiles set onboarded_at = now() where id = '${seller}'`); // past the welcome step
const ADDRESS = `${stamp % 1000} Fixture Way, Belmont`;
const deal = sql(`insert into deals (address, seller_type, ratification_date, days_to_close, agent_id, created_by) values ('${ADDRESS}', 'trust', current_date - 3, 30, '${avery.id}', '${avery.id}') returning id`).split("\n")[0];
sql(`insert into deal_members (deal_id, profile_id, member_role) values ('${deal}', '${seller}', 'seller')`);
// The seller's own upload, as the portal stores it (row, storage object, file).
const spqPath = `member/${seller}/spq-${stamp}.pdf`;
const spqDoc = sql(`insert into member_documents (profile_id, name, storage_path, size_bytes, content_type, uploaded_by) values ('${seller}', 'Seller questionnaire.pdf', '${spqPath}', 60, 'application/pdf', '${seller}') returning id`).split("\n")[0];
sql(`insert into storage.objects (bucket_id, name, owner) values ('member-docs', '${spqPath}', '${seller}')`);
mkdirSync(join(STORAGE, "member-docs", "member", seller), { recursive: true });
writeFileSync(join(STORAGE, "member-docs", spqPath), pdf("ok", "Seller questionnaire"));
writeFileSync(join(STORAGE, "member-docs", `${spqPath}.type`), "application/pdf");
const ai = (on) => sql(`update feature_flags set enabled = ${on} where key in ${AI}`);

try {
  // 0. Before 0032 is applied on hosted: no uploader, no Share, nothing listed.
  const av = await signIn(avery.email);
  await hideDocs(true);
  await av.goto(`${VA}/deals/${deal}/documents`);
  check(
    "before 0032: \"Documents aren't set up yet\", and nothing to upload, share or list",
    (await av.getByRole("heading", { name: "Documents aren't set up yet" }).isVisible()) &&
      (await av.getByRole("button", { name: "Upload", exact: true }).count()) === 0 &&
      (await av.getByRole("button", { name: /Share with seller/ }).count()) === 0 &&
      (await av.getByRole("heading", { name: /^Not filed yet/ }).count()) === 0 &&
      (await av.getByRole("note", { name: "Wiring safety" }).isVisible()),
  );
  await av.goto(`${VA}/`);
  check("before 0032: Today still works, with no Missing documents panel", (await av.getByRole("heading", { name: "Today" }).isVisible()) && (await av.getByRole("heading", { name: /^Missing documents/ }).count()) === 0);
  await hideDocs(false);

  // 1. Off by default: the tab and checklist work; no assistant buttons.
  await av.goto(`${VA}/deals/${deal}/documents`);
  const total = Number(/of (\d+) done/.exec(await heading(av))?.[1]);
  check("the Documents tab shows the trust checklist: 13 required documents", (await heading(av)) === "Checklist for a trust sale: 0 of 13 done", await heading(av));
  const p = (t) => av.locator("p").getByText(t, { exact: true });
  check(
    "trust items: TDS or ESD, certification of trust, Trust Advisory; WHSD and FLD under If they apply",
    (await p("TDS, or Exempt Seller Disclosure (ESD)").isVisible()) &&
      (await p("Certification of trust").isVisible()) &&
      (await p("Trust Advisory (TA)").isVisible()) &&
      (await av.getByRole("list", { name: "Documents if they apply" }).getByText("Water heater and smoke detector statement (WHSD)", { exact: true }).isVisible()) &&
      (await av.getByRole("list", { name: "Documents if they apply" }).getByText("Lead-based paint disclosure (FLD)", { exact: true }).isVisible()),
  );
  check("the panel says on file isn't signed", await av.getByText(/doesn't mean it's signed or complete/).isVisible());
  check("the wiring banner is shown", await av.getByRole("note", { name: "Wiring safety" }).isVisible());
  check("off: no Check this document", (await av.getByRole("button", { name: /^Check this document/ }).count()) === 0);
  await av.goto(`${VA}/deals/${deal}/receipts`);
  check("off: no Read it on Receipts; the wiring banner is shown", (await av.getByRole("button", { name: "Read it" }).count()) === 0 && (await av.getByRole("note", { name: "Wiring safety" }).isVisible()));

  // 2. Upload (staff-only) and the checklist.
  await av.goto(`${VA}/deals/${deal}/documents`);
  await upload(av, "Purchase agreement.pdf", pdf("ok", "Purchase agreement"), "Residential Purchase Agreement (RPA)");
  const rpa = sql(`select shared || '|' || (path like 'deal/${deal}/staff/%') || '|' || array_to_string(doc_types, ',') from deal_documents where deal_id = '${deal}'`);
  check("upload: filed staff-only with its type", rpa === "false|true|rpa", rpa);
  check("checklist: the RPA counts", (await heading(av)) === `Checklist for a trust sale: 1 of ${total} done`, await heading(av));
  check("upload: the name as uploaded is shown", (await av.getByRole("link", { name: "Purchase agreement.pdf" }).count()) === 1 && sql(`select file_name from deal_documents where deal_id = '${deal}'`) === "Purchase agreement.pdf");
  await av.getByRole("button", { name: /^Mark\ not\ needed\s*: Lead\-based\ paint\ disclosure\ \(FLD\)$/ }).click();
  await av.getByLabel("Why (optional)").fill("Built in 1998");
  await av.getByRole("button", { name: /^Save\s*: Lead\-based\ paint\ disclosure\ \(FLD\)\ not\ needed$/ }).click();
  await av.getByText(/Not needed: Built in 1998 \(Avery Example/).waitFor();
  check("checklist: an if-applies item counts once decided", (await heading(av)) === `Checklist for a trust sale: 2 of ${total + 1} done`, await heading(av));

  // 3. The seller's own upload, tagged for this deal.
  await av.getByRole("button", { name: "Edit types for Seller questionnaire.pdf" }).click();
  await av.getByLabel("Seller Property Questionnaire (SPQ)").check();
  await av.getByRole("button", { name: "Save types" }).click();
  await waitStatus(av, "Types saved.");
  await av.reload();
  check("the seller's upload counts once tagged", (await heading(av)) === `Checklist for a trust sale: 3 of ${total + 1} done` && sql(`select array_to_string(doc_types, ',') from deal_member_document_types where member_document_id = '${spqDoc}'`) === "spq");

  // An old file in the seller's view, never filed: labelled, then deleted.
  const old = `deal/${deal}/Old disclosure.pdf`;
  sql(`insert into storage.objects (bucket_id, name, owner) values ('deal-docs', '${old}', '${avery.id}')`);
  mkdirSync(join(STORAGE, "deal-docs", "deal", deal), { recursive: true });
  writeFileSync(join(STORAGE, "deal-docs", old), pdf("ok", "Old disclosure"));
  writeFileSync(join(STORAGE, "deal-docs", `${old}.type`), "application/pdf");
  await av.reload();
  check("not filed yet: a top-level file says the seller can see it", await av.getByText(/^The seller can see this/).isVisible());
  await axeAll(av, "/deals/[id]/documents");
  await shots(av, "documents");

  // 4. Sharing with the seller, and back.
  const staffPath = sql(`select path from deal_documents where deal_id = '${deal}'`);
  const blocked = await sp.request.get(`${BASE}/api/my/deal-docs?path=${encodeURIComponent(staffPath)}`, { maxRedirects: 0 });
  check("a staff-only file is refused to the seller by URL", blocked.status() === 404, String(blocked.status()));
  await sp.goto(`${BASE}/my/documents`);
  check("the seller doesn't see it before it's shared", (await sp.getByText("Purchase agreement.pdf").count()) === 0);
  await av.getByRole("button", { name: /^Delete\s*Old disclosure\.pdf$/ }).click();
  await waitStatus(av, "Deleted.");
  await av.reload();
  await av.getByRole("button", { name: /^Share\ with\ seller\s*: Purchase\ agreement\.pdf$/ }).click();
  await waitStatus(av, "Shared Purchase agreement.pdf with the seller.");
  check("share asks first, with the wiring warning", dialogs.at(-1) === "Share Purchase agreement.pdf with the seller? They'll see it on their Documents page. Never share wiring or bank instructions here.", dialogs.at(-1));
  check("shared: moved to the seller's view", sql(`select shared || '|' || path from deal_documents where deal_id = '${deal}' and 'rpa' = any(doc_types)`) === `true|deal/${deal}/Purchase agreement.pdf`);
  await sp.reload();
  const link = sp.getByRole("link", { name: "Purchase agreement.pdf" });
  check("the seller sees it in /my/documents", await link.isVisible());
  const got = await sp.request.get(`${BASE}${await link.getAttribute("href")}`);
  check("the seller can download it", got.status() === 200 && (await got.body()).subarray(0, 5).toString() === "%PDF-", String(got.status()));
  // Stop sharing fails safe: if the seller's copy can't be removed, nothing changes.
  sql(`create policy ${BLOCK} on storage.objects as restrictive for delete to authenticated using (name <> '${`deal/${deal}/Purchase agreement.pdf`}')`);
  await av.reload();
  await av.getByRole("button", { name: /^Stop\ sharing\s*: Purchase\ agreement\.pdf$/ }).click();
  await waitStatus(av, null, "Couldn't stop sharing: the seller can still see this file. Try again.");
  await sp.reload();
  check(
    "stop sharing: if the seller's copy can't be removed, the row stays shared and no staff copy is left",
    sql(`select shared::text from deal_documents where deal_id = '${deal}' and 'rpa' = any(doc_types)`) === "true" &&
      (await sp.getByRole("link", { name: "Purchase agreement.pdf" }).isVisible()) &&
      sql(`select count(*) from storage.objects where name like 'deal/${deal}/staff/%Purchase agreement.pdf'`) === "0",
    `${sql(`select shared from deal_documents where deal_id = '${deal}' and 'rpa' = any(doc_types)`)} · seller sees ${await sp.getByRole("link", { name: "Purchase agreement.pdf" }).count()} · staff copies ${sql(`select string_agg(name, ' ') from storage.objects where name like 'deal/${deal}/%'`)}`,
  );
  sql(`drop policy ${BLOCK} on storage.objects`);
  await av.reload();
  await av.getByRole("button", { name: /^Stop\ sharing\s*: Purchase\ agreement\.pdf$/ }).click();
  await waitStatus(av, "is staff-only again");
  await sp.reload();
  const after = sql(`select shared || '|' || path from deal_documents where deal_id = '${deal}' and 'rpa' = any(doc_types)`);
  check("stop sharing: the seller no longer sees it", (await sp.getByText("Purchase agreement.pdf").count()) === 0 && after.startsWith(`false|deal/${deal}/staff/`), `${after} · seller sees ${await sp.getByText("Purchase agreement.pdf").count()}`);

  // 5. Another agent can't open the deal or its files.
  const bl = await signIn(blake.email);
  const page404 = await bl.goto(`${VA}/deals/${deal}/documents`);
  const file404 = await bl.request.get(`${VA}/deals/${deal}/file?b=deal-docs&p=${encodeURIComponent(sql(`select path from deal_documents where deal_id = '${deal}' limit 1`))}`, { maxRedirects: 0 });
  check("another agent: no Documents tab, no files", page404?.status() === 404 && file404.status() === 404, `${page404?.status()} ${file404.status()}`);
  await bl.context().close();

  // 6. The assistant on: Check this document.
  ai(true);
  await av.reload();
  await upload(av, "Disclosures.pdf", pdf("ok", "Disclosure packet"));
  await av.getByRole("button", { name: /^Check\ this\ document\s*: Disclosures\.pdf$/ }).click();
  await waitStatus(av, "Checked. The suggested types are ticked below");
  let req = last();
  check("check: one inline PDF, the type list as data, nothing else", req.feature === "document_check" && req.documents === 1 && req.documentIsInlinePdf && req.dataBlocks === 1 && !req.requestHasEmail && !req.requestHasPhone && req.tools === 0 && req.fileReferences === 0, JSON.stringify(req));
  const found = av.getByRole("region", { name: "What the assistant found in Disclosures.pdf" });
  check("check: issues with pages, labelled as the assistant's", (await found.getByText("Page 3: Seller initials missing at the bottom of the page.").isVisible()) && (await found.getByText(/Nothing from this check is saved/).isVisible()));
  check("check: suggested types ticked; the unknown one dropped", (await av.getByLabel("Transfer Disclosure Statement (TDS)").isChecked()) && (await av.getByLabel("Seller Property Questionnaire (SPQ)").isChecked()) && !(await av.getByLabel("Agent Visual Inspection Disclosure (AVID)").isChecked()));
  check("check: nothing saved until the person saves", sql(`select array_to_string(doc_types, ',') from deal_documents where file_name = 'Disclosures.pdf' and deal_id = '${deal}'`) === "");
  await axeAll(av, "/deals/[id]/documents (check result)");
  await shots(av, "document-check");
  await av.getByRole("button", { name: "Save types" }).click();
  await waitStatus(av, "Types saved.");
  check("check: the person saved the types", sql(`select array_to_string(doc_types, ',') from deal_documents where file_name = 'Disclosures.pdf' and deal_id = '${deal}'`) === "tds,spq");
  await av.reload();
  await upload(av, "Wire memo.pdf", pdf("wiring", "Memo"));
  await av.getByRole("button", { name: /^Check\ this\ document\s*: Wire\ memo\.pdf$/ }).click();
  await waitStatus(av, null, "contained payment or wiring details");
  check("check: an answer with wiring details isn't shown", (await av.getByText(/021000021/).count()) === 0);
  await av.reload();
  await av.getByRole("button", { name: /^Delete\s*Wire memo\.pdf$/ }).click();
  await waitStatus(av, "Deleted.");
  const audit = sql(`select string_agg(action || ':' || (detail->>'file'), ',' order by id) from staff_audit where ref_table = 'deal_documents' and detail->>'deal' = '${deal}'`);
  check(
    "audit: share, stop sharing and deletes are logged (the refused attempt isn't)",
    audit === "unfiled_deleted:Old disclosure.pdf,document_shared:Purchase agreement.pdf,document_unshared:Purchase agreement.pdf,document_deleted:Wire memo.pdf",
    audit,
  );

  // 7. Today: missing documents.
  await av.goto(`${VA}/`);
  const panel = av.getByRole("heading", { name: "Missing documents (1 sale)" });
  check("Today lists the deal's missing documents", (await panel.isVisible()) && (await av.getByRole("link", { name: ADDRESS }).getAttribute("href")) === `/deals/${deal}/documents`);
  await axeAll(av, "/ (missing documents)");

  // 8. Receipts: read, check, save with the file.
  await av.goto(`${VA}/deals/${deal}/receipts`);
  await av.getByLabel(/Receipt file \(optional/).setInputFiles({ name: "inspection.png", mimeType: "image/png", buffer: png("ok") });
  await waitStatus(av, "Attached. Use “Read it”");
  await av.getByRole("button", { name: "Read it" }).click();
  await waitStatus(av, "Filled in from the receipt.");
  req = last();
  check("receipt: one image, nothing else", req.feature === "receipt_reader" && req.images === 1 && req.imageTypes[0] === "image/png" && req.documents === 0 && req.dataBlocks === 0, JSON.stringify(req));
  check(
    "receipt: the form is filled for the person to check",
    (await av.getByLabel("Vendor").inputValue()) === "Fixture Home Inspections" && (await av.getByLabel("Amount ($)").inputValue()) === "550.00" && (await av.getByLabel("Receipt date (optional)").inputValue()) === "2026-10-02" && (await av.getByLabel("Category (optional)").inputValue()) === "Inspection",
  );
  await axeAll(av, "/deals/[id]/receipts (read)");
  await shots(av, "receipt-read");
  await av.getByRole("button", { name: "Add receipt" }).click();
  await waitStatus(av, "Receipt added.");
  const rec = sql(`select vendor || '|' || amount || '|' || (storage_path like 'deal/${deal}/uploads/${avery.id}/%') from receipts where deal_id = '${deal}'`);
  check("receipt: saved with its file", rec === "Fixture Home Inspections|550.00|true", rec);
  await av.reload();
  const open = await av.request.get(`${VA}${await av.getByRole("link", { name: /Fixture Home Inspections/ }).getAttribute("href")}`);
  check("receipt: the file opens from the list", open.status() === 200 && (await open.body()).subarray(1, 4).toString() === "PNG", String(open.status()));
  await av.getByLabel(/Receipt file \(optional/).setInputFiles({ name: "blurry.png", mimeType: "image/png", buffer: png("unreadable") });
  await waitStatus(av, "Attached. Use “Read it”");
  await av.getByRole("button", { name: "Read it" }).click();
  await waitStatus(av, null, "The photo is too blurry to read the total.");
  check("receipt: an unreadable one is explained, nothing filled in", (await av.getByLabel("Vendor").inputValue()) === "");
  // The tidy-up removed the upload before it was saved: the receipt isn't added.
  const gone = sql(`select name from storage.objects where bucket_id = 'receipts' and name like 'deal/${deal}/uploads/${avery.id}/%' and name not in (select storage_path from receipts where storage_path is not null) order by created_at desc limit 1`);
  sql(`delete from storage.objects where bucket_id = 'receipts' and name = '${gone}'`);
  await av.getByLabel("Vendor").fill("Fixture Cleaning");
  await av.getByLabel("Amount ($)").fill("120");
  await av.getByRole("button", { name: "Add receipt" }).click();
  await waitStatus(av, null, "Upload the receipt again.");
  check("receipt: a file the tidy-up removed isn't accepted", Boolean(gone) && sql(`select count(*) from receipts where deal_id = '${deal}'`) === "1");

  check("the usage log has metadata only", sql(`select string_agg(feature || ':' || status, ',' order by created_at) from ai_runs`) === "staff_document_check:ok,staff_document_check:blocked_output,staff_receipt_reader:ok,staff_receipt_reader:ok");
  check("the console called nothing but the Messages endpoint", asked().every((r) => !("unexpected" in r)));
} finally {
  ai(false);
  await hideDocs(false);
  sql(`drop policy if exists ${BLOCK} on storage.objects`);
  sql(`delete from staff_audit where ref_table = 'deal_documents' and detail->>'deal' = '${deal}'`);
  sql(`update app_settings set ai_zdr_confirmed_at = null, ai_zdr_confirmed_by = null, ai_zdr_note = null, lead_admin_id = ${leadAdminBefore ? `'${leadAdminBefore}'` : "null"}`);
  const objects = sql(`select bucket_id || '/' || name from storage.objects where name like 'deal/${deal}/%' or name = '${spqPath}'`).split("\n").filter(Boolean);
  for (const o of objects) for (const ext of ["", ".type"]) rmSync(join(STORAGE, o) + ext, { force: true });
  sql(`delete from storage.objects where name like 'deal/${deal}/%' or name = '${spqPath}'`);
  sql(`delete from deals where id = '${deal}'; delete from member_documents where profile_id = '${seller}'; delete from ai_runs`);
  sql(`delete from staff_notifications where recipient_id in ('${ada.id}', '${avery.id}', '${blake.id}')`);
  await browser.close();
}
done();
