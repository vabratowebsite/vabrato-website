// Agent console page tour (S6): signs in as staff with the email link, opens
// every console page, runs axe at 1440 and 390 px and saves full-page
// screenshots. Used for the before/after comparison when the console moved to
// the web design system (S6 PR 1), and as the base of the S6 QA pass.
// Same local stack as the S5 scripts; picks a fictional deal and member
// thread from the database.
//
//   QA_TOOLS=… MAIL_DIR=… PGURL=… node scripts/qa/s6-console-shots.mjs --out /some/dir [--no-axe]

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { check, done, linkFor, mails, need, sql } from "./lib.mjs";

const args = process.argv.slice(2);
const OUT = resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : "docs/screenshots/s6");
const AXE = !args.includes("--no-axe");
mkdirSync(OUT, { recursive: true });
const VA = process.env.VA_BASE ?? "http://localhost:3000";
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";
const { chromium } = need("playwright");
const { AxeBuilder } = need("@axe-core/playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

const deal = sql(`select d.id from deals d where exists (select 1 from deal_members m where m.deal_id = d.id) order by d.created_at desc limit 1`);
const member = sql(`select member_id from messages order by created_at desc limit 1`);
const memberId = sql(`select id from profiles where role in ('buyer', 'seller', 'both') order by created_at desc limit 1`);
const revision = sql(`select id from content_revisions order by updated_at desc limit 1`);
const lead = sql(`select l.id from leads l join app_settings s on l.assigned_to = s.lead_admin_id order by l.created_at desc limit 1`);

const PAGES = [
  ["today", "/"],
  ...(lead ? [["leads", "/leads?view=all"], ["lead", `/leads/${lead}`]] : []),
  ["settings", "/settings"],
  ["members", "/members"],
  ...(memberId ? [["member", `/members/${memberId}`]] : []),
  ["deletions", "/members/deletions"],
  ["listings", "/listings"],
  ["mls", "/mls"],
  ["deals", "/deals"],
  ["deal-new", "/deals/new"],
  ["deal", `/deals/${deal}`],
  ["deal-calendar", `/deals/${deal}/calendar`],
  ["deal-receipts", `/deals/${deal}/receipts`],
  ["vendors", "/vendors"],
  ["messages", "/messages"],
  ["messages-thread", `/messages/${member}`],
  ["open-houses", "/open-houses"],
  ["content", "/content"],
  ["content-edit-guide", "/content/edit?table=city_guides&key=san-carlos"],
  ["content-edit-post", "/content/edit?table=posts"],
  ...(revision ? [["content-revision", `/content/${revision}`]] : []),
  ["featured", "/featured"],
  ["profile", "/profile"],
];

async function shoot(page, name, path) {
  const res = await page.goto(`${VA}${path}`);
  await page.waitForLoadState("networkidle");
  check(`${name}: loads (${path})`, (res?.status() ?? 0) < 400, String(res?.status()));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (AXE) {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      check(`axe ${name} @${width}`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`).join("; "));
    }
    await page.screenshot({ path: join(OUT, `${name}-${width}.jpg`), fullPage: true, type: "jpeg", quality: 70 });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await shoot(page, "login", "/login");
await page.getByPlaceholder("you@vabrato.com").fill(STAFF_EMAIL);
const before = mails();
await page.getByRole("button", { name: "Email me a sign-in link" }).click();
await page.getByText(/Check your email/).waitFor();
await page.goto(await linkFor(STAFF_EMAIL, before));
await page.waitForURL(`${VA}/`, { timeout: 15000 });
for (const [name, path] of PAGES) await shoot(page, name, path);

await browser.close();
console.log(`screenshots: ${OUT}`);
done();
