// S4 QA: axe (WCAG 2.2 AA) at 1440 and 390 px on every public page type,
// screenshots, and Lighthouse (mobile preset) on the key pages.
//
//   node scripts/qa/s4-qa.mjs --base http://localhost:3003 [--out docs/screenshots/s4] [--no-lighthouse] [--chrome /path/to/chromium]
//     [--scl-base http://homes.sancarloslife.com:3003 --scl-ip 127.0.0.1]
//
// --scl-base adds the homes.sancarloslife.com pages (needs `site_scl_enabled`
// on in that database); --scl-ip points that host name at a local server.
//
// Run it against `next build && next start` (apps/web) or any deployment you
// can reach. The tools aren't repo dependencies; install them once anywhere
// and point QA_TOOLS at that folder (see scripts/qa/README.md).
// Exit code 1 if any page has an axe violation or a Lighthouse category < 0.9.

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = opt("base", "http://localhost:3003").replace(/\/+$/, "");
const OUT = resolve(opt("out", "docs/screenshots/s4"));
const CHROME = opt("chrome", process.env.CHROME_PATH);
const LIGHTHOUSE = !args.includes("--no-lighthouse");
const SCL_BASE = opt("scl-base")?.replace(/\/+$/, "");
const SCL_IP = opt("scl-ip");
const TOOLS = process.env.QA_TOOLS ? resolve(process.env.QA_TOOLS) : process.cwd();
const toolsRequire = createRequire(join(TOOLS, "package.json"));
const localRequire = createRequire(import.meta.url); // honors NODE_PATH (e.g. a global Playwright)
const req = Object.assign((id) => {
  try {
    return toolsRequire(id);
  } catch {
    return localRequire(id);
  }
}, { resolve: (id) => { try { return toolsRequire.resolve(id); } catch { return localRequire.resolve(id); } } });

const { chromium } = req("playwright");
const { AxeBuilder } = req("@axe-core/playwright");

// One URL per page type (fictional fixture keys from packages/mls).
export const PAGES = [
  ["home", "/"],
  ["search", "/search"],
  ["search-sold-tab", "/search?tab=sold"],
  ["listing-own", "/listing/FX-001/107-sample-ct-san-carlos"],
  ["listing-other-broker", "/listing/FX-002/114-placeholder-ave-redwood-city"],
  ["listing-hidden-address", "/listing/FX-012/los-gatos"],
  ["open-houses", "/open-houses"],
  ["properties", "/properties"],
  ["buy", "/buy"],
  ["neighborhoods", "/neighborhoods"],
  ["city-with-guide", "/neighborhoods/san-carlos"],
  ["city-no-guide", "/neighborhoods/belmont"],
  ["about", "/about"],
  ["agent", "/team/mark-martinho"],
  ["testimonials", "/testimonials"],
  ["contact", "/contact"],
  ["sell", "/sell"],
  ["transform", "/transform"],
  ["insights", "/insights"],
  ["insight-post", "/insights/placeholder-news"],
  ["join", "/join"],
  ["privacy", "/privacy"],
  ["terms", "/terms"],
  ["accessibility", "/accessibility"],
  ["not-found", "/this-page-does-not-exist"],
  ["listing-not-found", "/listing/FX-404/nowhere"],
];
// homes.sancarloslife.com (G2): San Carlos only.
const SCL_PAGES = SCL_BASE
  ? [
      ["scl-home", "/", SCL_BASE],
      ["scl-listing", "/listing/FX-001/107-sample-ct-san-carlos", SCL_BASE],
      ["scl-not-found", "/about", SCL_BASE],
      ["scl-listing-outside-san-carlos", "/listing/FX-002/114-placeholder-ave-redwood-city", SCL_BASE],
    ]
  : [];
const LIGHTHOUSE_PAGES = ["home", "search", "listing-own", "listing-hidden-address", "city-with-guide", "agent", "contact"];

// Properties each JSON-LD type must have (Google's required fields where it
// has a rich result; schema.org has no required fields of its own).
const REQUIRED = {
  RealEstateAgent: ["name", "url", "address"],
  Person: ["name"],
  BreadcrumbList: ["itemListElement"],
  Article: ["headline", "datePublished", "author"],
  Event: ["name", "startDate", "location"],
  RealEstateListing: ["name", "url"],
  Place: ["name"],
  FAQPage: ["mainEntity"],
  ItemList: ["itemListElement"],
};
const FORBIDDEN_TYPES = ["Review", "AggregateRating"]; // review item 15

function checkJsonLd(blocks) {
  const problems = [];
  const types = [];
  const walk = (node, top) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, top));
    if (!node || typeof node !== "object") return;
    const t = node["@type"];
    if (t) {
      for (const type of [t].flat()) {
        types.push(type);
        if (FORBIDDEN_TYPES.includes(type)) problems.push(`${type} markup is not allowed`);
        for (const p of (top && REQUIRED[type]) || []) if (node[p] == null) problems.push(`${type} is missing ${p}`);
      }
    }
    if (node.itemListElement) [node.itemListElement].flat().forEach((li, i) => li.position !== i + 1 && problems.push(`list item ${i} position ${li.position}`));
    Object.entries(node).forEach(([k, v]) => k !== "@context" && walk(v, false));
  };
  for (const raw of blocks) {
    try {
      const data = JSON.parse(raw);
      if (data["@context"] !== "https://schema.org") problems.push("missing @context https://schema.org");
      walk(data, true);
    } catch (e) {
      problems.push(`invalid JSON: ${e.message}`);
    }
  }
  return { types: [...new Set(types)], problems };
}

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

mkdirSync(OUT, { recursive: true });
const report = { base: BASE, date: new Date().toISOString(), axe: [], lighthouse: [] };
let failed = false;

const hostRules = SCL_BASE && SCL_IP ? [`--host-resolver-rules=MAP ${new URL(SCL_BASE).hostname} ${SCL_IP}`] : [];
const browser = await chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), args: hostRules });
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  for (const [name, path, base = BASE] of [...PAGES, ...SCL_PAGES]) {
    const page = await context.newPage();
    const res = await page.goto(base + path, { waitUntil: "networkidle" });
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    const violations = axe.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5) }));
    if (violations.length) failed = true;
    const jsonLd = checkJsonLd(await page.locator('script[type="application/ld+json"]').allTextContents());
    if (jsonLd.problems.length) failed = true;
    report.axe.push({ page: name, path, viewport: vp.name, status: res?.status() ?? null, violations, passes: axe.passes.length, jsonLd });
    await page.screenshot({ path: join(OUT, `${name}-${vp.name}.jpg`), fullPage: true, type: "jpeg", quality: 70 });
    console.log(
      `axe ${vp.name} ${name} (${res?.status()}): ${violations.length ? violations.map((v) => v.id).join(", ") : "0 violations"}` +
        ` | json-ld ${jsonLd.types.join(",") || "-"}${jsonLd.problems.length ? ` PROBLEMS: ${jsonLd.problems.join("; ")}` : ""}`,
    );
    await page.close();
  }
  await context.close();
}
await browser.close();

if (LIGHTHOUSE) {
  const { default: lighthouse } = await import(req.resolve("lighthouse"));
  const chromeLauncher = await import(req.resolve("chrome-launcher"));
  const chrome = await chromeLauncher.launch({ chromePath: CHROME, chromeFlags: ["--headless=new", "--no-sandbox"] });
  for (const [name, path] of PAGES.filter(([n]) => LIGHTHOUSE_PAGES.includes(n))) {
    // Mobile preset is Lighthouse's default (Moto G Power, slow 4G, 4x CPU).
    const { lhr } = await lighthouse(BASE + path, { port: chrome.port, output: "json", logLevel: "error" });
    const scores = Object.fromEntries(Object.entries(lhr.categories).map(([k, c]) => [k, Math.round((c.score ?? 0) * 100)]));
    // SEO is excluded from the gate: every page is noindex until launch (S9).
    const gated = ["performance", "accessibility", "best-practices"];
    if (gated.some((k) => scores[k] < 90)) failed = true;
    const metrics = Object.fromEntries(
      ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift"].map((id) => [id, lhr.audits[id]?.displayValue]),
    );
    report.lighthouse.push({ page: name, path, scores, metrics });
    console.log(`lighthouse ${name}: ${JSON.stringify(scores)} ${JSON.stringify(metrics)}`);
  }
  await chrome.kill();
}

writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`report: ${join(OUT, "report.json")}`);
process.exit(failed ? 1 : 0);
