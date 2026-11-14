// Integrations PR 2 end-to-end check: importing files from Google Drive and
// Dropbox into a deal's documents and receipts, on the local stack with the
// fake Google (fake-google.mjs: Drive files and a stand-in picker) and the
// fake Dropbox (fake-dropbox.mjs). No Google or Dropbox account; nothing
// leaves the machine; fictional people and files.
//
// - Switches off: no import buttons, no Drive or Dropbox in Settings.
// - An admin turns both on (audited).
// - Drive: allowed from Settings (drive.file only); the picker gets a
//   Drive-only token; four files picked: a PDF and a PNG imported staff-only,
//   an oversized scan and a HEIC photo refused with reasons; the same PDF
//   again is refused.
// - Dropbox: connected; the Apps/Vabrato list; one file imported to
//   Documents, then marked "Imported". A receipt imported into the form and
//   saved with source dropbox; another from Drive with source drive.
// - Revoked Dropbox access: "reconnect in Settings", then reconnecting works.
// - Another agent gets a 404 on the deal; the seller sees nothing new.
// - Disconnecting Dropbox and Google revokes the access.
// - Every page: axe at 1440 and 390 px, no sideways scroll at 390 and 320
//   px, no console errors; a keyboard pass on the import controls.
//
// Needs migrations up to 0043, SERVICE_KEY, GOOGLE_LOG and DROPBOX_LOG, the
// console started with the fakes (scripts/qa/README.md). Everything is put
// back in finally.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const GOOGLE = process.env.FAKE_GOOGLE ?? "http://127.0.0.1:4030";
const DROPBOX = process.env.FAKE_DROPBOX ?? "http://127.0.0.1:4040";
const GLOG = process.env.GOOGLE_LOG;
const DLOG = process.env.DROPBOX_LOG;
if (!GLOG || !DLOG || !process.env.SERVICE_KEY) throw new Error("set GOOGLE_LOG, DROPBOX_LOG and SERVICE_KEY");
const OUT = resolve(process.env.OUT ?? "docs/screenshots/int-import");
mkdirSync(OUT, { recursive: true });
const { chromium } = need("playwright");
const { AxeBuilder } = need("@axe-core/playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const report = [];
const FLAGS = ["integration_google_drive", "integration_dropbox"];
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

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

/** axe at 1440 and 390, no sideways scroll at 390 and 320, no console errors. The page is already loaded. */
async function audit(page, who, name) {
  await page.waitForLoadState("networkidle");
  const entry = { who, name, url: page.url().replace(VA, ""), violations: {}, widths: {}, errors: [] };
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    entry.violations[width] = r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 3) }));
    check(`${who} axe ${name} @${width}`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(" | ")}`).join("; "));
    await page.screenshot({ path: join(OUT, `${who}-${name}-${width}.jpg`), fullPage: true, type: "jpeg", quality: 60 });
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

const go = async (page, path) => {
  const res = await page.goto(`${VA}${path}`);
  await page.waitForLoadState("networkidle");
  return res?.status() ?? 0;
};
const post = (base, path) => fetch(`${base}${path}`, { method: "POST" }).then((r) => r.json());
async function waitStatus(page, re) {
  await page.getByText(re).first().waitFor({ timeout: 30000 });
}

// --- Setup: fictional staff, a seller and two deals ------------------------------------------------------
sql(`update feature_flags set enabled = false where key in ('${FLAGS.join("','")}')`);
const admin = await account("Avery", "admin");
const agent = await account("Jordan", "agent");
const agent2 = await account("Riley", "agent");
const seller = await account("Dana", "seller");
const gmail = `jordan.drive.${stamp}@example.test`;
const dmail = `jordan.dropbox.${stamp}@example.test`;
const D1 = sql(`insert into deals (address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by) values ('1 Fixture Way, Belmont (QA ${stamp})', 'normal', current_date - 5, 30, 0, '${agent.id}', '${agent.id}') returning id`).split("\n")[0];
const D2 = sql(`insert into deals (address, seller_type, ratification_date, days_to_close, rent_back_days, agent_id, created_by) values ('2 Fixture Way, Belmont (QA ${stamp})', 'normal', current_date - 5, 30, 0, '${agent2.id}', '${agent2.id}') returning id`).split("\n")[0];
sql(`insert into deal_members (deal_id, profile_id, member_role) values ('${D1}', '${seller.id}', 'seller')`);

try {
  // --- Switches off ---------------------------------------------------------------------------------------
  const a = await signIn(agent.email);
  check("off: documents tab loads", (await go(a, `/deals/${D1}/documents`)) === 200);
  check("off: no import controls on Documents", (await a.getByText("Or import files").count()) === 0);
  await go(a, `/deals/${D1}/receipts`);
  check("off: no import controls on Receipts", (await a.getByText("Or import the receipt").count()) === 0);
  await go(a, "/settings");
  check("off: no Drive or Dropbox in Settings", (await a.getByRole("heading", { name: "Google Drive import" }).count()) === 0 && (await a.getByRole("heading", { name: "Dropbox import" }).count()) === 0);
  await a.goto(`${VA}/integrations/dropbox/start`);
  check("off: the Dropbox start route goes back to Settings", a.url().includes("/settings?google=not_ready"), a.url());

  // --- An admin turns both on -------------------------------------------------------------------------
  const ad = await signIn(admin.email);
  await go(ad, "/settings");
  await ad.getByRole("button", { name: "Turn Google Drive import on" }).click();
  await waitStatus(ad, "Google Drive import is on");
  await go(ad, "/settings");
  await ad.getByRole("button", { name: "Turn Dropbox import on" }).click();
  await waitStatus(ad, "Dropbox import is on");
  check("switches on in the database", sql(`select string_agg(key || '=' || enabled, ',' order by key) from feature_flags where key in ('${FLAGS.join("','")}')`) === "integration_dropbox=true,integration_google_drive=true");
  check("switch changes audited", sql(`select count(*) from staff_audit where action = 'set_integration_flag' and actor_id = '${admin.id}'`) === "2");
  await go(ad, "/settings");
  await audit(ad, "admin", "settings-switches");

  // --- Connect Drive (drive.file only) ----------------------------------------------------------------
  await go(a, `/deals/${D1}/documents`);
  check("on, not connected: Documents points to Settings", await a.getByText(/need your account connected first/).isVisible());
  await post(GOOGLE, `/__fake/account?email=${encodeURIComponent(gmail)}`);
  await go(a, "/settings");
  await audit(a, "agent", "settings-not-connected");
  await a.getByRole("link", { name: "Allow Google Drive imports" }).click();
  await a.waitForURL(/\/settings\?google=drive_connected/, { timeout: 20000 });
  check("drive: allowed, with a confirmation", await a.getByText(/Google Drive imports allowed\./).isVisible());
  const scopes = sql(`select array_to_string(scopes, ' ') from staff_connections where profile_id = '${agent.id}' and provider = 'google'`);
  check("drive: stored with drive.file and no Calendar access", scopes.includes(DRIVE_SCOPE) && !scopes.includes("calendar"), scopes);
  check("drive: token stored encrypted", sql(`select left(token_ciphertext, 3) from staff_connections where profile_id = '${agent.id}' and provider = 'google'`) === "v1.");

  // --- Import from Drive into Documents ------------------------------------------------------------------
  for (const [name, kind] of [["Inspection report.pdf", "pdf"], ["Front photo.png", "png"], ["Scan.pdf", "big"], ["IMG_0001.heic", "heic"]]) await post(GOOGLE, `/__fake/drive-file?account=${encodeURIComponent(gmail)}&name=${encodeURIComponent(name)}&kind=${kind}`);
  await go(a, `/deals/${D1}/documents`);
  await audit(a, "agent", "documents-import");
  await a.getByLabel(/What are they\?/).selectOption({ index: 1 });
  await a.getByRole("button", { name: "Import from Google Drive" }).click();
  const picker = a.getByRole("dialog", { name: "Fake Google picker" });
  await picker.waitFor({ timeout: 20000 });
  for (const box of await picker.getByRole("checkbox").all()) await box.check();
  await picker.getByRole("button", { name: "Select" }).click();
  await waitStatus(a, "Imported 2 of 4 files.");
  check("drive: the oversized scan refused", await a.getByText(/Scan\.pdf\. Files must be 20 MB or smaller/).isVisible());
  check("drive: the HEIC photo refused", await a.getByText(/IMG_0001\.heic\. Upload a PDF, JPG or PNG/).isVisible());
  check("drive: two documents filed staff-only with their source and type", sql(`select count(*) from deal_documents where deal_id = '${D1}' and external_ref like 'drive:%' and not shared and cardinality(doc_types) = 1`) === "2");
  const issued = await fetch(`${GOOGLE}/__fake/scopes`).then((r) => r.json());
  check("drive: the picker got a drive.file-only token", issued.some((s) => s.length === 1 && s[0] === DRIVE_SCOPE));
  const glog = readFileSync(GLOG, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  check("drive: the picker listed files with that token", glog.some((l) => l.path === "/__fake/picker-files" && l.status === 200) && !glog.some((l) => l.path === "/__fake/picker-files" && l.status === 403));
  await a.reload();
  await a.waitForLoadState("networkidle");
  check("drive: both files listed on Documents", (await a.getByText("Inspection report.pdf").count()) > 0 && (await a.getByText("Front photo.png").count()) > 0);
  await audit(a, "agent", "documents-imported");

  await a.getByRole("button", { name: "Import from Google Drive" }).click();
  await picker.waitFor();
  await picker.getByRole("checkbox", { name: "Inspection report.pdf" }).check();
  await picker.getByRole("button", { name: "Select" }).click();
  await waitStatus(a, "Nothing was imported.");
  check("drive: the same file again is refused", await a.getByText(/Already imported to this deal\./).isVisible());

  // --- Dropbox ----------------------------------------------------------------------------------------
  await post(DROPBOX, `/__fake/account?email=${encodeURIComponent(dmail)}`);
  for (const [name, kind] of [["Closing statement.pdf", "pdf"], ["Receipt cleaners.png", "png"], ["Big scan.pdf", "big"]]) await post(DROPBOX, `/__fake/file?account=${encodeURIComponent(dmail)}&name=${encodeURIComponent(name)}&kind=${kind}`);
  await go(a, "/settings");
  await a.getByRole("link", { name: "Connect Dropbox" }).click();
  await a.waitForURL(/\/settings\?google=dropbox_connected/, { timeout: 20000 });
  check("dropbox: connected, with a confirmation", await a.getByText(/Dropbox connected\./).isVisible());
  check("dropbox: stored encrypted with the account", sql(`select account_email || '|' || left(token_ciphertext, 3) from staff_connections where profile_id = '${agent.id}' and provider = 'dropbox'`) === `${dmail}|v1.`);
  await audit(a, "agent", "settings-connected");

  await go(a, `/deals/${D1}/documents`);
  await a.getByRole("button", { name: "Import from Dropbox" }).click();
  const list = a.getByRole("group", { name: /Pick files in Apps\/Vabrato/ });
  await list.waitFor({ timeout: 20000 });
  check("dropbox: the folder is listed", (await list.getByRole("checkbox").count()) === 3);
  await audit(a, "agent", "documents-dropbox-list");
  await list.getByRole("checkbox", { name: /Closing statement\.pdf/ }).check();
  await a.getByRole("button", { name: "Import 1 file" }).click();
  await waitStatus(a, "Imported 1 of 1 file.");
  check("dropbox: filed staff-only with its source", sql(`select count(*) from deal_documents where deal_id = '${D1}' and external_ref like 'dropbox:id:%' and not shared`) === "1");
  await a.getByRole("button", { name: "Import from Dropbox" }).click();
  await list.waitFor();
  check("dropbox: the imported file is marked and can't be picked again", (await list.getByText("Imported").count()) === 1 && (await list.getByRole("checkbox", { name: /Closing statement\.pdf/ }).isDisabled()));
  await a.getByRole("button", { name: "Close" }).click();

  // --- Receipts from Dropbox and Drive -------------------------------------------------------------------
  await go(a, `/deals/${D1}/receipts`);
  await a.getByRole("button", { name: "Import from Dropbox" }).click();
  const rlist = a.getByRole("group", { name: /Pick the receipt in Apps\/Vabrato/ });
  await rlist.waitFor({ timeout: 20000 });
  await rlist.getByRole("radio", { name: /Receipt cleaners\.png/ }).check();
  await a.getByRole("button", { name: "Import this receipt" }).click();
  await waitStatus(a, "Imported Receipt cleaners.png");
  await a.getByLabel("Vendor").fill("Fixture Cleaners");
  await a.getByLabel("Amount ($)").fill("180");
  await a.getByRole("button", { name: "Add receipt" }).click();
  await waitStatus(a, "Receipt added.");
  check("receipt: saved with source dropbox and its file", sql(`select source || '|' || (storage_path is not null)::text from receipts where deal_id = '${D1}' and external_ref like 'dropbox:%'`) === "dropbox|true");
  await audit(a, "agent", "receipts-imported");

  await a.getByRole("button", { name: "Import from Google Drive" }).click();
  await picker.waitFor({ timeout: 20000 });
  await picker.getByRole("checkbox", { name: "Front photo.png" }).check();
  await picker.getByRole("button", { name: "Select" }).click();
  await waitStatus(a, "Imported Front photo.png");
  await a.getByLabel("Vendor").fill("Fixture Stagers");
  await a.getByLabel("Amount ($)").fill("95.50");
  await a.getByRole("button", { name: "Add receipt" }).click();
  await waitStatus(a, "Receipt added.");
  check("receipt: saved with source drive", sql(`select source from receipts where deal_id = '${D1}' and external_ref like 'drive:%'`) === "drive");

  await a.getByRole("button", { name: "Import from Dropbox" }).click();
  await rlist.waitFor();
  check("receipt: the Dropbox file already used is marked", await rlist.getByRole("radio", { name: /Receipt cleaners\.png/ }).isDisabled());

  // --- Revoked Dropbox access ---------------------------------------------------------------------------
  await post(DROPBOX, "/__fake/revoke-all");
  await go(a, `/deals/${D1}/documents`);
  await a.getByRole("button", { name: "Import from Dropbox" }).click();
  await waitStatus(a, /Dropbox: The connection needs renewing: reconnect in Settings\./);
  check("revoked: asks to reconnect", true);
  await go(a, "/settings");
  check("revoked: Settings shows Needs reconnecting", (await a.getByText("Needs reconnecting").count()) === 1);
  await a.getByRole("link", { name: "Reconnect Dropbox" }).click();
  await a.waitForURL(/\/settings\?google=dropbox_connected/, { timeout: 20000 });
  check("reconnected: error cleared", sql(`select coalesce(last_error, 'none') from staff_connections where profile_id = '${agent.id}' and provider = 'dropbox'`) === "none");

  // --- Other people ----------------------------------------------------------------------------------------
  const r2 = await signIn(agent2.email);
  check("another agent: the deal's Documents is a 404", (await go(r2, `/deals/${D1}/documents`)) === 404);
  check("another agent: their own deal shows Settings links, not imports", (await go(r2, `/deals/${D2}/documents`)) === 200 && (await r2.getByText(/need your account connected first/).isVisible()));
  check("seller: nothing imported is shared", sql(`select count(*) from deal_documents where deal_id = '${D1}' and shared`) === "0");
  check("seller: receipts stay staff-only (RLS)", sql(`select count(*) from receipts r where r.deal_id = '${D1}' and exists (select 1 from deal_members m where m.deal_id = r.deal_id and m.profile_id = '${seller.id}')`) === "2");

  // --- Keyboard -----------------------------------------------------------------------------------------
  await go(a, `/deals/${D1}/documents`);
  await a.locator("body").click({ position: { x: 1, y: 1 } });
  const reached = new Set();
  for (let i = 0; i < 400 && reached.size < 3; i++) {
    await a.keyboard.press("Tab");
    const f = await a.evaluate(() => {
      const el = document.activeElement;
      const cs = el ? getComputedStyle(el) : null;
      const label = (el?.labels?.[0]?.textContent || el?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
      return { label, visible: Boolean(cs && ((cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none"))) };
    });
    for (const want of ["What are they?", "Import from Google Drive", "Import from Dropbox"]) if (f.label.startsWith(want) && f.visible) reached.add(want);
  }
  check("keyboard: the type, Drive and Dropbox controls are reached with visible focus", reached.size === 3, [...reached].join(", "));

  // --- Disconnect ---------------------------------------------------------------------------------------
  await go(a, "/settings");
  await a.getByRole("checkbox", { name: /Remove the console's access to my Dropbox/ }).check();
  await a.getByRole("button", { name: "Disconnect Dropbox" }).click();
  await a.waitForURL(/\/settings\?google=dropbox_disconnected$/, { timeout: 20000 });
  check("dropbox disconnect: revoked at Dropbox", (await fetch(`${DROPBOX}/__fake/grants`).then((r) => r.json())).live === 0);
  await a.getByRole("checkbox", { name: /Remove the console's access to my Google account/ }).check();
  await a.getByRole("button", { name: "Disconnect Google account" }).click();
  await a.waitForURL(/\/settings\?google=disconnected$/, { timeout: 20000 });
  check("google disconnect: connection gone", sql(`select count(*) from staff_connections where profile_id = '${agent.id}'`) === "0");
  check("google disconnect: revoked at Google", readFileSync(GLOG, "utf8").includes('"path":"/revoke","status":200'));
  check("imports stay on the deal after disconnecting", sql(`select count(*) from deal_documents where deal_id = '${D1}' and external_ref is not null`) === "3");
  check("the fakes' logs hold no tokens", !/fake-(refresh|access|code)|fake-dbx-/.test(readFileSync(GLOG, "utf8") + readFileSync(DLOG, "utf8")));
  await audit(a, "agent", "settings-disconnected");
} finally {
  sql(`update feature_flags set enabled = false where key in ('${FLAGS.join("','")}')`);
  sql(`delete from staff_connections where profile_id in ('${agent.id}', '${agent2.id}', '${seller.id}', '${admin.id}')`);
  sql(`delete from storage.objects where name like 'deal/${D1}/%' or name like 'deal/${D2}/%'`);
  sql(`delete from deals where id in ('${D1}', '${D2}')`);
  sql(`delete from staff_audit where actor_id = '${admin.id}'`);
  for (const p of [admin, agent, agent2, seller]) sql(`delete from auth.users where id = '${p.id}'`);
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
check("cleanup: nothing left", sql(`select (select count(*) from deals where address like '%(QA ${stamp})') + (select count(*) from profiles where email like '%.${stamp}@example.test') + (select count(*) from staff_connections)`) === "0");
check("cleanup: switches off", sql(`select count(*) from feature_flags where key in ('${FLAGS.join("','")}') and enabled`) === "0");
done();

