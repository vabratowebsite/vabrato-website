// S6 PR 2a end-to-end check on the local stack: a real lead from the website's
// contact form is routed to the lead admin, queued in the same transaction,
// and sent by the console's /api/notifications/process (what pg_net pokes on
// hosted) to a fake Resend within a minute. Also: a member message alerts the
// assigned agent, and a wrong secret is refused.
//
// Needs: apps/web on :3003; apps/va on :3000 started with CRON_SECRET,
// RESEND_API_KEY (any value), RESEND_BASE_URL pointing at the fake Resend
// (scripts/qa/README.md), CONSOLE_URL; migration 0022 applied; the staff
// account as lead admin. Fictional people only.
//
//   RESEND_LOG=/path/resend.jsonl CRON_SECRET=… PGURL=… node scripts/qa/s6-lead-alert.mjs

import { readFileSync } from "node:fs";
import { BASE, check, done, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const LOG = process.env.RESEND_LOG;
const SECRET = process.env.CRON_SECRET;
if (!LOG || !SECRET) throw new Error("set RESEND_LOG and CRON_SECRET");
const { chromium } = need("playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const email = `quinn.${stamp}@example.test`;
const mails = () => readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const poke = (secret = SECRET) => fetch(`${VA}/api/notifications/process`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });

const mark = sql(`select id from profiles where email = '${STAFF_EMAIL}'`);
check("routing: the staff account is the lead admin", sql(`select lead_admin_id from app_settings`) === mark);

// 1. A visitor sends the contact form.
const page = await (await browser.newContext()).newPage();
await page.goto(`${BASE}/contact`);
await page.getByLabel("Name").fill(`Quinn Example`);
await page.getByLabel("Email (required)").fill(email);
const submitted = Date.now();
await page.getByRole("button", { name: "Send message" }).click();
await page.getByText(/Thanks/).waitFor();
const [leadId, assigned] = sql(`select id || '|' || coalesce(assigned_to::text, '') from leads where email = '${email}'`).split("|");
check("the lead is routed to the lead admin", assigned === mark);
check("an in-console alert is waiting", sql(`select count(*) from staff_notifications where recipient_id = '${mark}' and ref_id = '${leadId}' and kind = 'new_lead'`) === "1");
check("the email is queued, due now", sql(`select count(*) from notifications where dedupe_key = 'new_lead:${leadId}:${mark}' and send_at <= now() and status = 'scheduled'`) === "1");

// 2. The poke (pg_net on hosted) runs the console's sender.
check("a wrong secret is refused", (await poke("nope")).status === 401);
const before = mails().length;
const res = await poke();
const body = await res.json();
check("the sender runs", res.ok && body.sent >= 1, JSON.stringify(body));
const mine = mails().slice(before).find((m) => m.body.to === STAFF_EMAIL && m.body.text.includes(leadId));
check("the lead admin's email reached Resend", Boolean(mine));
check("within a minute of the form", mine && mine.at - submitted < 60_000, mine ? `${mine.at - submitted} ms` : "");
check("subject names the request and first name only", mine?.body.subject === "New contact request from Quinn", mine?.body.subject);
check("no contact details in the email", mine && !mine.body.text.includes(email));
check("idempotency key is the notification id", mine?.idem === sql(`select id from notifications where dedupe_key = 'new_lead:${leadId}:${mark}'`));
check("the row is marked sent", sql(`select status from notifications where dedupe_key = 'new_lead:${leadId}:${mark}'`) === "sent");
const again = await (await poke()).json();
check("a second run sends nothing new for this lead", mails().filter((m) => m.body.text?.includes(leadId)).length === 1, JSON.stringify(again));

// 3. A member's message alerts their agent.
const member = sql(`insert into auth.users (id, email) values (gen_random_uuid(), 'member.${stamp}@example.test') returning id`).split("\n")[0];
sql(`update profiles set agent_id = '${mark}', full_name = 'Rowan Example' where id = '${member}'`);
sql(`insert into messages (member_id, sender_id, body) values ('${member}', '${member}', 'Is the open house still on?')`);
check("the agent gets an in-console message alert", sql(`select count(*) from staff_notifications where recipient_id = '${mark}' and kind = 'new_message' and ref_id = '${member}'`) === "1");
const b2 = mails().length;
await poke();
const msgMail = mails().slice(b2).find((m) => m.body.subject === "New message from Rowan");
check("and an email without the message text", msgMail && !msgMail.body.text.includes("open house still on"));

await browser.close();
done();
