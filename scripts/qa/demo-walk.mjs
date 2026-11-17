// Walks the demo content (packages/mls/src/jobs/seed-demo.ts) as each test
// role on the local stack: the demo shows where it should and not where it
// shouldn't, every page loads without console errors, passes axe at 1440 and
// 390 px, and doesn't scroll sideways at 390 px. Fictional people only.
//
// Start the local stack and both apps; seed the preview listings, then the
// demo with the stand-in accounts named below:
//   tsx packages/mls/src/jobs/seed-demo.ts --agent <agent> --buyer <buyer> --seller <seller> --va <va>
// Needs SERVICE_KEY-free local auth (magic links land in MAIL_DIR).

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BASE, check, done, linkFor, mails, need, sql } from "./lib.mjs";

const VA = process.env.VA_BASE ?? "http://localhost:3000";
const OUT = resolve(process.env.OUT ?? "docs/screenshots/demo-walk");
mkdirSync(OUT, { recursive: true });
const ACCOUNTS = {
  admin: process.env.DEMO_ADMIN ?? "demo-owner-admin@example.test",
  agent: process.env.DEMO_AGENT ?? "demo-owner-agent@example.test",
  va: process.env.DEMO_VA ?? "demo-owner-va@example.test",
  buyer: process.env.DEMO_BUYER ?? "demo-owner-buyer@example.test",
  seller: process.env.DEMO_SELLER ?? "demo-owner-seller@example.test",
};
const P = "de300000-0000-4000-8000-";
const id = (n) => `${P}${n.toString(16).padStart(12, "0")}`;
const deal = (n) => id(0x100 + n);
const lead = (n) => id(0x400 + n);

const { chromium } = need("playwright");
const { AxeBuilder } = need("@axe-core/playwright");
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const report = [];

check("the demo is seeded", sql(`select count(*) from deals where id::text like '${P}%'`) === "7");

async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => m.type() === "error" && page.errors.push(m.text().slice(0, 160)));
  return page;
}

async function staff(email) {
  const page = await context();
  await page.goto(`${VA}/login`);
  await page.getByPlaceholder("you@vabrato.com").fill(email);
  const before = mails();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText(/Check your email/).waitFor();
  await page.goto(await linkFor(email, before));
  await page.waitForURL(`${VA}/`, { timeout: 15000 });
  return page;
}

async function member(email) {
  const page = await context();
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel("Email address").fill(email);
  const before = mails();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText("Check your email.").waitFor();
  await page.goto(await linkFor(email, before));
  await page.waitForURL(/\/my/, { timeout: 15000 });
  return page;
}

/** Opens a page and checks it: the texts it should and shouldn't show, errors, axe, width. */
async function visit(page, who, url, { shows = [], hides = [], name }) {
  const res = await page.goto(url);
  await page.waitForLoadState("networkidle");
  const label = `${who} ${name ?? url.replace(/^https?:\/\/[^/]+/, "")}`;
  check(`${label}: loads`, (res?.status() ?? 0) < 400, `${res?.status()}`);
  // Headings are styled in capitals, which innerText reports, so compare without case.
  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const s of shows) check(`${label}: shows "${s}"`, text.includes(s.toLowerCase()));
  for (const s of hides) check(`${label}: doesn't show "${s}"`, !text.includes(s.toLowerCase()));
  const entry = { who, url: page.url(), violations: {}, errors: [] };
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    entry.violations[width] = r.violations.map((v) => v.id);
    check(`${label}: axe @${width}`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(" | ")}`).join("; "));
    if (width === 390) {
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(`${label}: no sideways scroll @390`, sw <= 390, `${sw}px`);
    }
    await page.screenshot({ path: join(OUT, `${who}-${(name ?? url).replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}-${width}.jpg`), fullPage: true, type: "jpeg", quality: 55 });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  entry.errors = [...page.errors];
  check(`${label}: no console errors`, page.errors.length === 0, page.errors.join(" | "));
  page.errors.length = 0;
  report.push(entry);
}

try {
  // The agent: works every demo deal and most leads.
  const agent = await staff(ACCOUNTS.agent);
  await visit(agent, "agent", `${VA}/`, { name: "today", shows: ["(Demo)"] });
  await visit(agent, "agent", `${VA}/deals`, { shows: ["1 Fixture Way, San Carlos (Demo)", "710 Demo Street, Menlo Park (Demo)", "22 Sample Court, Redwood City (Demo)"] });
  await visit(agent, "agent", `${VA}/deals/${deal(1)}`, { name: "deal-1", shows: ["1 Fixture Way, San Carlos (Demo)", "Confirm appraisal access with the seller (Demo)", "Appraisal access (Demo)"] });
  await visit(agent, "agent", `${VA}/deals/${deal(5)}`, { name: "deal-5-trust", shows: ["9 Testcase Drive, Foster City (Demo)"] });
  await visit(agent, "agent", `${VA}/deals/${deal(6)}/receipts`, { name: "deal-6-receipts", shows: ["Fixture Handyman (Demo)"] });
  await visit(agent, "agent", `${VA}/leads`, { shows: ["T. Example", "S. Placeholder"] });
  await visit(agent, "agent", `${VA}/leads?view=all`, { name: "leads-all", shows: ["J. Placeholder"] });
  await visit(agent, "agent", `${VA}/leads/${lead(2)}`, { name: "lead-2", shows: ["Called back; wants a pricing range"] });
  await visit(agent, "agent", `${VA}/appointments/${id(0x701)}`, { name: "appointment", shows: ["Appraisal access"] });
  await visit(agent, "agent", `${VA}/members`, { shows: ["Jamie Sample", "Robin Example"] });
  await visit(agent, "agent", `${VA}/messages`, { shows: ["Jamie Sample"] });
  await visit(agent, "agent", `${VA}/vendors`, { shows: ["Sample Home Inspections (Demo)"] });

  // The VA: only the deals they're on.
  const va = await staff(ACCOUNTS.va);
  await visit(va, "va", `${VA}/deals`, { shows: ["1 Fixture Way, San Carlos (Demo)", "22 Sample Court, Redwood City (Demo)", "710 Demo Street, Menlo Park (Demo)"], hides: ["305 Example Avenue, Belmont (Demo)"] });

  // The buyer test account.
  const buyer = await member(ACCOUNTS.buyer);
  await visit(buyer, "buyer", `${BASE}/my/buyer`, { name: "buyer", shows: ["(Demo)"] });
  await visit(buyer, "buyer", `${BASE}/my/messages`, { shows: ["[Demo] Welcome!"] });
  await visit(buyer, "buyer", `${BASE}/my/todos`, { shows: ["Get pre-approval letter updated (Demo)"] });
  await visit(buyer, "buyer", `${BASE}/my/searches`, { shows: ["3+ beds in San Carlos under $2.5M (Demo)"] });
  await visit(buyer, "buyer", `${BASE}/my/drafts`, { shows: ["Moving quote"] });
  await visit(buyer, "buyer", `${BASE}/my/tours`, { name: "tours" });

  // The seller test account: their demo sale.
  const seller = await member(ACCOUNTS.seller);
  await visit(seller, "seller", `${BASE}/my/seller`, { name: "seller", shows: ["1 Fixture Way, San Carlos (Demo)"], hides: ["22 Sample Court"] });
  await visit(seller, "seller", `${BASE}/my/seller/performance`, { name: "performance" });

  // The public website.
  const visitor = await context();
  await visit(visitor, "public", `${BASE}/neighborhoods/belmont`, { shows: ["Placeholder guide for Belmont"] });
  await visit(visitor, "public", `${BASE}/insights/demo-market-update`, { shows: ["Placeholder market update"] });
  await visit(visitor, "public", `${BASE}/insights`, { shows: ["Placeholder: open house weekend"] });
} finally {
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
check("still no email queued for the demo", sql(`select count(*) from notifications where status = 'scheduled' and (deal_id::text like '${P}%' or recipient_profile_id::text like '${P}%' or payload::text like '%${P}%')`) === "0");
done();
