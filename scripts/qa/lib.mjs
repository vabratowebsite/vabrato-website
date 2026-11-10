// Shared helpers for the local member-flow QA scripts (see README.md).

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

export const BASE = process.env.BASE ?? "http://localhost:3003";
export const MAIL_DIR = process.env.MAIL_DIR;
export const PGURL = process.env.PGURL;
if (!MAIL_DIR || !PGURL) throw new Error("set MAIL_DIR and PGURL");

const tools = createRequire(join(resolve(process.env.QA_TOOLS ?? "."), "package.json"));
const local = createRequire(import.meta.url);
export const need = (id) => {
  try {
    return tools(id);
  } catch {
    return local(id);
  }
};

export const sql = (q) => execFileSync("psql", [PGURL, "-tAc", q], { encoding: "utf8" }).trim();

let failures = 0;
export const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};
export const done = () => {
  console.log(failures ? `${failures} check(s) failed` : "all checks passed");
  process.exit(failures ? 1 : 0);
};

export const mails = () => readdirSync(MAIL_DIR).filter((f) => f.endsWith(".eml")).sort();

/** The sign-in link from the newest email to `email` sent after `before`. */
export async function linkFor(email, before) {
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

/** Joins as a new member with the email link and lands in the portal. */
export async function joinAs(page, { email, name, role = "buyer" }) {
  await page.goto(`${BASE}/join?role=${role}`);
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email address").fill(email);
  const before = mails();
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await page.getByText("Check your email.").waitFor();
  await page.goto(await linkFor(email, before));
  await page.waitForURL(/\/my\//, { timeout: 15000 });
}

export async function axeAll(page, label) {
  const { AxeBuilder } = need("@axe-core/playwright");
  const size = page.viewportSize() ?? { width: 1440, height: 900 };
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    check(`axe ${label} @${width}`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`).join("; "));
  }
  await page.setViewportSize(size);
}
