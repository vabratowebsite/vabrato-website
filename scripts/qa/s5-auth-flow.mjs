// S5 PR 1 end-to-end check: join → magic link → callback → portal, account
// changes, sign-out, sign-in, onboarding fallback, staff notice, and axe on
// the new pages. Runs against a local stack (scripts/qa/README.md, "Member
// flows"): apps/web on :3003, Supabase Auth + PostgREST behind :54331, and an
// SMTP sink writing .eml files to MAIL_DIR. Fictional people only.
//
//   QA_TOOLS=~/qa-tools MAIL_DIR=/path/to/mail PGURL=postgres://... node scripts/qa/s5-auth-flow.mjs

import { readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3003";
const MAIL_DIR = process.env.MAIL_DIR;
const PGURL = process.env.PGURL;
if (!MAIL_DIR || !PGURL) throw new Error("set MAIL_DIR and PGURL");
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? "mark.qa@example.test";

const tools = createRequire(join(resolve(process.env.QA_TOOLS ?? "."), "package.json"));
const local = createRequire(import.meta.url);
const need = (id) => {
  try {
    return tools(id);
  } catch {
    return local(id);
  }
};
const { chromium } = need("playwright");
const { AxeBuilder } = need("@axe-core/playwright");

const sql = (q) => execFileSync("psql", [PGURL, "-tAc", q], { encoding: "utf8" }).trim();
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

const mails = () => readdirSync(MAIL_DIR).filter((f) => f.endsWith(".eml")).sort();
async function linkFor(email, before) {
  for (let i = 0; i < 40; i++) {
    for (const f of mails().filter((m) => !before.includes(m))) {
      const raw = readFileSync(join(MAIL_DIR, f), "utf8");
      if (!raw.toLowerCase().includes(email.toLowerCase())) continue;
      const text = raw.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
      const m = text.match(/href="(http[^"]+\/verify\?[^"]+)"/);
      if (m) return m[1].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

const axeAll = async (page, label) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    check(`axe ${label} @${width}`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`).join("; "));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
};

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const stamp = Date.now();
const buyerEmail = `jordan.${stamp}@example.test`;

// 1. Join as a buyer with the email link.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/join`);
  await axeAll(page, "join step 1");
  check("join: no VOW checkbox while vow_enabled is off", (await page.content()).includes('name="vow"') === false);
  await page.getByRole("link", { name: /Buying/ }).click();
  await page.waitForURL(/role=buyer/);
  await axeAll(page, "join step 2");
  check("join: VOW checkbox hidden on step 2", (await page.locator('input[name="vow"]').count()) === 0);
  check("join: alerts unchecked by default", !(await page.getByLabel(/Email me new listings/).isChecked()));
  await page.getByLabel("Full name").fill("Jordan Example");
  await page.getByLabel(/Mobile/).fill("650-555-0101");
  await page.getByLabel("Email address").fill(buyerEmail);
  await page.getByLabel(/Email me new listings/).check();
  const before = mails();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText("Check your email.").waitFor();
  check("join: confirmation shown", true);
  const link = await linkFor(buyerEmail, before);
  check("join: magic link email arrived", Boolean(link));

  await page.goto(link);
  await page.waitForURL(/\/my\/buyer$/, { timeout: 15000 });
  check("callback lands on /my/buyer", true);
  check("portal greets by first name", (await page.getByRole("heading", { level: 1 }).textContent())?.includes("Welcome, Jordan") ?? false);
  check("agent card shows the default agent's profile", (await page.locator("aside").textContent())?.includes("Mark Martinho") ?? false);
  check("broker disclosure on the portal page", (await page.content()).includes("DRE #02142060"));
  await axeAll(page, "/my/buyer");

  const row = sql(`select role, phone, alerts_email_opt_in, onboarded_at is not null, vow_accepted_at is null, agent_id = (select default_agent_id from app_settings) from profiles where email = '${buyerEmail}'`);
  check("profile has the join choices", row === "buyer|650-555-0101|t|t|t|t", row);
  check("pending join cookie removed", !(await ctx.cookies()).some((c) => c.name === "vabrato_join"));

  // 2. Account: switch to both, see the selling section.
  await page.goto(`${BASE}/my/account`);
  await axeAll(page, "/my/account");
  check("account: no VOW panel while vow_enabled is off", !(await page.content()).includes("Sold prices and price history"));
  await page.getByLabel(/^Both/).check();
  await page.getByRole("button", { name: "Update my portal" }).click();
  await page.getByText("Saved.").waitFor();
  await page.reload();
  check("account: role now both, nav shows Selling", (await page.locator("aside").textContent())?.includes("My sale") ?? false);
  check("account: role saved", sql(`select role from profiles where email = '${buyerEmail}'`) === "both");

  await page.getByLabel(/Mobile/).fill("not a phone");
  await page.getByRole("button", { name: "Save details" }).click();
  await page.getByText(/digits only/).waitFor();
  check("account: invalid phone rejected with a message", true);

  // 3. Public header knows we're signed in (no Supabase call on public pages).
  await page.goto(`${BASE}/`);
  check("public header shows My portal", await page.getByRole("link", { name: "My portal" }).isVisible());

  // 4. Sign out; /my is protected again.
  await page.goto(`${BASE}/my/account`);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(`${BASE}/`);
  await page.goto(`${BASE}/my`);
  check("signed out: /my redirects to sign-in", page.url().startsWith(`${BASE}/sign-in?next=`));
  await axeAll(page, "/sign-in");

  // 5. Sign in again (existing account), land back where we asked.
  await page.goto(`${BASE}/sign-in?next=/my/account`);
  const before2 = mails();
  await page.getByLabel("Email address").fill(buyerEmail);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText("Check your email.").waitFor();
  const link2 = await linkFor(buyerEmail, before2);
  await page.goto(link2);
  await page.waitForURL(/\/my\/account$/, { timeout: 15000 });
  check("sign-in returns to the requested page", true);

  // 6. A used link can't be replayed.
  await page.goto(link2);
  await page.waitForLoadState("networkidle");
  check("replayed link doesn't sign anyone in", !page.url().endsWith("/my/account") || page.url().includes("error"), page.url());
  await ctx.close();
}

// 6b. "Continue with Google" really starts a Google sign-in (the provider
// isn't configured locally, so we only check where it goes).
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in`);
  const google = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize") && r.url().includes("provider=google"), { timeout: 15000 }).catch(() => null);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  check("sign-in: Google button starts a Google sign-in", Boolean(await google));
  await page.goto(`${BASE}/join?role=buyer`);
  const google2 = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize") && r.url().includes("provider=google"), { timeout: 15000 }).catch(() => null);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  check("join: Google button starts a Google sign-in", Boolean(await google2));
  await ctx.close();
}

// 7. Unknown address on /sign-in: same reply, no account, no email.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const ghost = `nobody.${stamp}@example.test`;
  await page.goto(`${BASE}/sign-in`);
  const before = mails();
  await page.getByLabel("Email address").fill(ghost);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText("Check your email.").waitFor();
  await new Promise((r) => setTimeout(r, 1500));
  check("unknown email: same reply, no mail sent", (await linkFor(ghost, before)) === null);
  check("unknown email: no account created", sql(`select count(*) from profiles where email = '${ghost}'`) === "0");
  await ctx.close();
}

// 8. Onboarding fallback: join choices lost before the link is opened.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const email = `avery.${stamp}@example.test`;
  await page.goto(`${BASE}/join?role=seller`);
  await page.getByLabel("Full name").fill("Avery Sample");
  await page.getByLabel("Email address").fill(email);
  const before = mails();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText("Check your email.").waitFor();
  const link = await linkFor(email, before);
  const keep = (await ctx.cookies()).filter((c) => c.name !== "vabrato_join");
  await ctx.clearCookies();
  await ctx.addCookies(keep);
  await page.goto(link);
  await page.waitForURL(/\/my\/welcome$/, { timeout: 15000 });
  check("lost choices: onboarding step shown", true);
  await axeAll(page, "/my/welcome");
  check("onboarding: alerts unchecked, no role preselected", !(await page.getByLabel(/Email me new listings/).isChecked()) && (await page.locator('input[name="role"]:checked').count()) === 0);
  await page.getByLabel(/^Selling/).check();
  await page.getByRole("button", { name: "Continue to my portal" }).click();
  await page.waitForURL(/\/my\/seller$/);
  check("onboarding completes to the seller portal", sql(`select role || '|' || (onboarded_at is not null) || '|' || alerts_email_opt_in from profiles where email = '${email}'`) === "seller|true|false");
  check("seller with no deal sees the empty state", await page.getByRole("heading", { name: "No sale on file yet" }).isVisible());
  await axeAll(page, "/my/seller");
  await ctx.close();
}

// 9. Staff signing in on the website get the console notice, role unchanged.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/join?role=buyer`);
  await page.getByLabel("Full name").fill("Mark QA");
  await page.getByLabel("Email address").fill(STAFF_EMAIL);
  const before = mails();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText("Check your email.").waitFor();
  await page.goto(await linkFor(STAFF_EMAIL, before));
  await page.waitForURL(/\/my$/, { timeout: 15000 });
  check("staff see the console notice", await page.getByRole("heading", { name: "This portal is for clients" }).isVisible());
  check("staff role unchanged by the join form", sql(`select role from profiles where email = '${STAFF_EMAIL}'`) === "admin");
  await ctx.close();
}

await browser.close();
if (process.env.CLEAN_MAIL) rmSync(MAIL_DIR, { recursive: true, force: true });
console.log(failures ? `${failures} check(s) failed` : "all checks passed");
process.exit(failures ? 1 : 0);
