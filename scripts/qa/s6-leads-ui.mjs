// S6 PR 2b end-to-end check: a website lead appears in the lead admin's bell
// and inbox; the lead page shows contact details, takes "I've replied", notes,
// reassignment and closing; the new owner sees it (and only it); Settings
// turns "away" on and off. axe at 1440 and 390 px on the new pages.
// Same local stack as s6-lead-alert.mjs (0022 applied, the staff account as
// lead admin), plus SERVICE_KEY (the local service-role JWT) to create a
// fictional agent. Fictional people only.

import { BASE, axeAll, check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const visitor = `sky.${stamp}@example.test`;
const agentEmail = `alex.agent.${stamp}@example.test`;

async function consoleSignIn(email) {
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

const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);
sql(`update app_settings set lead_admin_id = '${mark}', lead_admin_away = false, lead_admin_away_until = null`);
// Create the agent through the Auth admin API (SUPABASE_URL + SERVICE_KEY), as the console's invite does.
const authRes = await fetch(`${process.env.SUPABASE_URL ?? "http://127.0.0.1:54331"}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: process.env.SERVICE_KEY ?? "", Authorization: `Bearer ${process.env.SERVICE_KEY ?? ""}`, "Content-Type": "application/json" },
  body: JSON.stringify({ email: agentEmail, email_confirm: true }),
});
if (!authRes.ok) throw new Error(`create agent: ${authRes.status} ${await authRes.text()}`);
const agent = (await authRes.json()).id;
sql(`update profiles set role = 'agent', full_name = 'Alex Agent ${stamp}' where id = '${agent}'`);

// A visitor sends the contact form.
const web = await (await browser.newContext()).newPage();
await web.goto(`${BASE}/contact`);
await web.getByLabel("Name").fill("Sky Example");
await web.getByLabel("Email (required)").fill(visitor);
await web.getByLabel("Phone").fill("650-555-0142");
await web.getByRole("button", { name: "Send message" }).click();
await web.getByText(/Thanks/).waitFor();
const lead = sql(`select id from leads where email = '${visitor}'`);

// 1. The lead admin's console.
const page = await consoleSignIn(STAFF_EMAIL);
check("Today says where new leads go", (await page.locator("main").innerText()).includes("New leads go to"));
check("nav shows a new-lead count", /\d/.test(await page.locator("aside").getByRole("link", { name: /Leads/ }).innerText()));
const bell = page.getByRole("button", { name: /Alerts/ });
await page.waitForFunction(() => /new/.test(document.querySelector('button[aria-controls]')?.textContent ?? ""), null, { timeout: 25000 });
check("the bell counts new alerts", /Alerts, \d+ new/.test((await bell.innerText()) || (await bell.getAttribute("aria-label")) || (await bell.textContent())));
await bell.click();
check("the bell lists the new lead", await page.getByRole("link", { name: /New contact request from Sky/ }).first().isVisible());
await axeAll(page, "console with alerts open");
await page.getByRole("link", { name: /New contact request from Sky/ }).first().click();
await page.waitForURL(new RegExp(`/leads/${lead}`));
check("lead page shows the contact email and phone", (await page.getByRole("link", { name: visitor }).isVisible()) && (await page.getByRole("link", { name: "650-555-0142" }).isVisible()));
await axeAll(page, "/leads/[id]");

await page.getByRole("button", { name: "I've replied" }).click();
await page.getByText(/after it came in/).waitFor();
check("first reply is recorded", sql(`select first_reply_at is not null and status = 'assigned' from leads where id = '${lead}'`) === "t");
await page.getByLabel("Note").fill("Called back, wants a valuation next month.");
await page.getByRole("button", { name: "Add note" }).click();
await page.getByText("Called back, wants a valuation next month.").waitFor();
check("note is saved", sql(`select count(*) from lead_notes where lead_id = '${lead}'`) === "1");
await page.getByLabel("Agent").selectOption(agent);
await page.getByRole("button", { name: "Reassign" }).click();
await page.getByText(/Reassigned/).waitFor();
check("reassigned to the agent", sql(`select assigned_to from leads where id = '${lead}'`) === agent);
check("the agent gets an in-console alert", sql(`select count(*) from staff_notifications where recipient_id = '${agent}' and kind = 'lead_reassigned'`) === "1");
check("the reassignment is audited", sql(`select count(*) from staff_audit where action = 'reassign_lead' and ref_id = '${lead}'`) === "1");

await page.goto(`${VA}/leads?view=all`);
check("inbox lists the lead under All open", await page.getByRole("link", { name: "S. Example" }).first().isVisible());
await axeAll(page, "/leads");

// 2. Settings: away on, then off.
await page.goto(`${VA}/settings`);
await axeAll(page, "/settings");
check("shows away is off to start", await page.getByText("Away is off: new leads go to the lead admin.").isVisible());
await page.getByRole("button", { name: "Turn away on" }).click();
await page.getByText(/Away is on: new leads go to the backup/).waitFor();
check("away is on", sql(`select lead_admin_away from app_settings`) === "t");
await page.getByRole("button", { name: "Turn away off" }).click();
await page.getByText("Away is off: new leads go to the lead admin.").waitFor();
check("away is off again, audited", sql(`select lead_admin_away from app_settings`) === "f" && sql(`select string_agg(action, ',' order by id) from (select id, action from staff_audit where action in ('away_on', 'away_off') order by id desc limit 2) a`) === "away_on,away_off");

// 3. The agent sees only their lead and can close it, but not reassign.
const ap = await consoleSignIn(agentEmail);
await ap.goto(`${VA}/leads?view=all`);
const rows = await ap.locator("tbody tr").count();
check("the agent sees only the lead assigned to them", rows === 1, String(rows));
await ap.goto(`${VA}/leads/${lead}`);
check("no reassign panel for agents", (await ap.getByRole("heading", { name: "Reassign" }).count()) === 0);
await ap.getByLabel("Reason (optional)").fill("Listed with us");
await ap.getByRole("button", { name: "Close lead" }).click();
await ap.getByText("Closed.").waitFor();
check("the agent closed it with a reason", sql(`select status || '|' || closed_reason from leads where id = '${lead}'`) === "closed|Listed with us");
const other = sql(`select id from leads where id <> '${lead}' and assigned_to = '${mark}' order by created_at desc limit 1`);
if (other) {
  const res = await ap.goto(`${VA}/leads/${other}`);
  check("another person's lead is a 404 for the agent", res?.status() === 404);
}

await browser.close();
done();
