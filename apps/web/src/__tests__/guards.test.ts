import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Structural guards for the public site.
// - Data levels (MLS-4/6/7): the public route groups and lib/public never
//   touch VOW or FULL data. Scoped to (site) and (sancarloslife) so /my (S5)
//   can use VOW data without tripping this (review item 16).
// - MLS-1: any route file that reads listing data renders <MlsAttribution>.
// - Footer: broker disclosure and Equal Housing Opportunity on every page.

const SRC = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIRS = ["app/(site)", "app/(sancarloslife)", "lib/public", "components"].map((d) => join(SRC, d));

function* files(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

const FORBIDDEN = [
  /\bmls_listing_vow\b/,
  /\bmls_price_events\b/,
  /\bmls_listing_full\b/,
  /\bmls_members\b/,
  /\bmls_agent_access\b/,
  /@vabrato\/mls\/full/,
  /\bprojectVow\b/,
  /\bprojectFull\b/,
  /projectForLevel\([^)]*["']VOW["']/,
  /has_vow_access|has_full_mls_access/,
];

describe("public site guards", () => {
  it("never reads VOW or FULL data in the public route groups (MLS-4/6/7)", () => {
    const hits: string[] = [];
    for (const dir of PUBLIC_DIRS) {
      for (const f of files(dir)) {
        const text = readFileSync(f, "utf8");
        for (const re of FORBIDDEN) if (re.test(text)) hits.push(`${relative(SRC, f)}: ${re}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("renders MLS attribution on every route that reads listing data (MLS-1)", () => {
    const missing: string[] = [];
    for (const dir of PUBLIC_DIRS.slice(0, 2)) {
      for (const f of files(dir)) {
        if (!/(page|layout)\.tsx$/.test(f)) continue;
        const text = readFileSync(f, "utf8");
        const readsListings = /\b(searchListings|getListing|ownSoldListings|loadListing)\b/.test(text);
        // <ListingDetail> renders the attribution itself (checked below).
        // Redirect-only routes render nothing, so they show no MLS data.
        const renders = /<[A-Za-z]/.test(text);
        if (readsListings && renders && !/<(MlsAttribution|ListingDetail)\b/.test(text)) missing.push(relative(SRC, f));
      }
    }
    expect(missing).toEqual([]);
    expect(readFileSync(join(SRC, "components/listings/ListingDetail.tsx"), "utf8")).toMatch(/<MlsAttribution\b/);
  });

  it("serves homes.sancarloslife.com only while site_scl_enabled is on, with the broker disclosure (review item 1)", () => {
    const layout = readFileSync(join(SRC, "app/(sancarloslife)/scl/layout.tsx"), "utf8");
    expect(layout).toMatch(/flagEnabled\("site_scl_enabled"\)\)\) notFound\(\)/);
    expect(layout).toMatch(/BROKER_DISCLOSURE/);
    expect(layout).toMatch(/<EqualHousingIcon/);
    const listing = readFileSync(join(SRC, "app/(sancarloslife)/scl/listing/[key]/[slug]/page.tsx"), "utf8");
    expect(listing).toMatch(/canonical: `\$\{SITE_URL\}\$\{listingPath\(parts\)\}`/);
  });

  it("puts the broker disclosure and Equal Housing logo in the vabrato.com footer", () => {
    const layout = readFileSync(join(SRC, "app/(site)/layout.tsx"), "utf8");
    expect(layout).toMatch(/dre=\{BROKER_DISCLOSURE\}/);
    const footer = readFileSync(fileURLToPath(new URL("../../../../packages/ui/src/web/site/Footer.tsx", import.meta.url)), "utf8");
    expect(footer).toMatch(/<EqualHousingIcon/);
    expect(footer).toMatch(/\{dre\}/);
  });
});
