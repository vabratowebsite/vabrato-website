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

  it("collects personal data only through LeadForm, which shows the privacy notice and consent line (review item 4)", () => {
    const leadForm = readFileSync(join(SRC, "components/forms/LeadForm.tsx"), "utf8");
    expect(leadForm).toMatch(/\/privacy/);
    expect(leadForm).toMatch(/may call or text me/);
    expect(leadForm).toMatch(/name="website"/); // honeypot
    const stray: string[] = [];
    for (const dir of PUBLIC_DIRS) {
      for (const f of files(dir)) {
        if (f.endsWith("LeadForm.tsx")) continue;
        const text = readFileSync(f, "utf8");
        // Search forms are GET forms with no personal data; anything else must use LeadForm.
        for (const m of text.matchAll(/<form\b[^>]*>/g)) if (!/method="get"/.test(m[0])) stray.push(`${relative(SRC, f)}: ${m[0]}`);
        if (/type="email"/.test(text) && !/<LeadForm\b/.test(text) && !f.endsWith("fields.tsx")) stray.push(`${relative(SRC, f)}: email field outside LeadForm`);
      }
    }
    expect(stray).toEqual([]);
  });

  it("puts the broker disclosure and Equal Housing logo in the vabrato.com footer", () => {
    // The (site) layout and the root not-found page both render <SiteChrome>.
    for (const file of ["app/(site)/layout.tsx", "app/not-found.tsx"]) {
      expect(readFileSync(join(SRC, file), "utf8")).toMatch(/<SiteChrome>/);
    }
    const chrome = readFileSync(join(SRC, "components/SiteChrome.tsx"), "utf8");
    expect(chrome).toMatch(/dre=\{BROKER_DISCLOSURE\}/);
    const footer = readFileSync(fileURLToPath(new URL("../../../../packages/ui/src/web/site/Footer.tsx", import.meta.url)), "utf8");
    expect(footer).toMatch(/<EqualHousingIcon/);
    expect(footer).toMatch(/\{dre\}/);
  });
});

// S5: member portal and account pages.
describe("member and account guards", () => {
  const read = (p: string) => readFileSync(join(SRC, p), "utf8");

  it("keeps /my out of search engines and caches", () => {
    const layout = read("app/my/layout.tsx");
    expect(layout).toMatch(/export const dynamic = "force-dynamic"/);
    expect(layout).toMatch(/robots: \{ index: false, follow: false \}/);
    expect(read("app/(account)/layout.tsx")).toMatch(/robots: \{ index: false, follow: false \}/);
  });

  it("never reads FULL data anywhere in the web app (MLS-7)", () => {
    const FULL = [/\bmls_listing_full\b/, /\bmls_members\b/, /\bmls_agent_access\b/, /@vabrato\/mls\/full/, /\bprojectFull\b/, /has_full_mls_access/];
    const hits: string[] = [];
    for (const dir of ["app", "member", "lib", "components"]) {
      for (const f of files(join(SRC, dir))) {
        const text = readFileSync(f, "utf8");
        for (const re of FULL) if (re.test(text)) hits.push(`${relative(SRC, f)}: ${re}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("links the privacy notice wherever account details are collected", () => {
    for (const f of ["member/components/AuthForms.tsx", "app/(account)/sign-in/page.tsx", "app/my/welcome/page.tsx"]) {
      expect(read(f), f).toMatch(/href="\/privacy"/);
    }
  });

  it("puts the broker disclosure and Equal Housing logo on every portal page", () => {
    const shell = read("member/components/MemberShell.tsx");
    expect(shell).toMatch(/BROKER_DISCLOSURE/);
    expect(shell).toMatch(/<EqualHousingIcon/);
    for (const f of files(join(SRC, "app/my"))) {
      if (!f.endsWith("page.tsx")) continue;
      const text = readFileSync(f, "utf8");
      // Pages either render inside MemberShell or are full-page notices/redirects without listing data.
      expect(/<MemberShell/.test(text) || /^\s*<main id="main"/m.test(text) || /redirect\(/.test(text), relative(SRC, f)).toBe(true);
    }
  });

  it("never offers the VOW checkbox unless the flag is on", () => {
    expect(read("app/my/account/page.tsx")).toMatch(/\{vowEnabled && \([\s\S]*?<VowForm/);
    for (const f of ["member/components/AuthForms.tsx", "member/components/AccountForms.tsx"]) {
      const text = read(f);
      for (const m of text.matchAll(/name="vow"/g)) {
        const before = text.slice(Math.max(0, m.index! - 400), m.index);
        expect(/vowEnabled &&|VowForm\(/.test(before), `${f}: vow checkbox not gated`).toBe(true);
      }
    }
  });
});

// S5 PR 2: saved homes, saved searches, VOW member pages.
describe("member listing guards", () => {
  const read = (p: string) => readFileSync(join(SRC, p), "utf8");

  it("renders MLS attribution on every /my page that shows listing data (MLS-1, review item 4)", () => {
    const missing: string[] = [];
    for (const f of files(join(SRC, "app/my"))) {
      if (!f.endsWith("page.tsx")) continue;
      const text = readFileSync(f, "utf8");
      const readsListings = /\b(savedListings|soldSearch|memberListing|cards\(|search_listings|listing_cards|alertFeed)\b/.test(text);
      if (readsListings && !/<MlsAttribution\b/.test(text)) missing.push(relative(SRC, f));
    }
    expect(missing).toEqual([]);
  });

  it("serves the VOW pages only while vow_enabled is on (review item 1)", () => {
    for (const f of ["app/my/sold/page.tsx", "app/my/listing/[key]/page.tsx"]) {
      expect(read(f), f).toMatch(/if \(!\(await flagEnabled\("vow_enabled"\)\)\) notFound\(\);/);
    }
    expect(read("app/api/my/listings/[key]/history/route.ts")).toMatch(/!\(await flagEnabled\("vow_enabled"\)\)\) return json\(\{ error: "unavailable" \}, 404\)/);
  });

  it("keeps VOW/FULL reads out of the islands that public pages import (MLS-6)", () => {
    const hits: string[] = [];
    for (const f of files(join(SRC, "member/components"))) {
      const text = readFileSync(f, "utf8");
      for (const re of FORBIDDEN) if (re.test(text)) hits.push(`${relative(SRC, f)}: ${re}`);
      if (/listing_price_history|listing_sold_detail|search_sold_listings/.test(text)) hits.push(`${relative(SRC, f)}: VOW RPC`);
    }
    expect(hits).toEqual([]);
  });

  it("puts no real history in the signed-out teaser (review item 2)", () => {
    const text = read("member/components/PriceHistory.tsx");
    expect(text).toMatch(/const DUMMY = \[/);
    expect(text).toMatch(/aria-hidden="true"/);
  });

  it("sends private, no-store responses and checks Origin on every member API write (review item 7)", () => {
    for (const f of files(join(SRC, "app/api/my"))) {
      const text = readFileSync(f, "utf8");
      expect(text, relative(SRC, f)).toMatch(/from "@\/member\/api"/);
      expect(text, relative(SRC, f)).not.toMatch(/NextResponse\.json/);
      for (const m of text.matchAll(/export async function (POST|PUT|PATCH|DELETE)\b[\s\S]*?\n\}/g)) {
        expect(m[0], `${relative(SRC, f)} ${m[1]}`).toMatch(/if \(!sameOrigin\(req\)\) return forbiddenOrigin\(\);/);
      }
    }
  });
});

// S5 PR 3: alerts.
describe("alert guards", () => {
  const read = (p: string) => readFileSync(join(SRC, p), "utf8");

  it("never unsubscribes on GET (review item 15)", () => {
    const route = read("app/api/alerts/unsubscribe/route.ts");
    const get = route.slice(route.indexOf("export async function GET"));
    expect(get).not.toMatch(/unsubscribeAlerts/);
    expect(read("app/(account)/alerts/unsubscribe/page.tsx")).not.toMatch(/unsubscribeAlerts\(/);
  });

  it("shows only the new price in the feed (review item 3)", () => {
    const feed = read("member/alerts.ts");
    expect(feed).toMatch(/select\("id, kind, listing_key, new_price, created_at, seen_at, saved_searches\(name\)"\)/);
    expect(feed).not.toMatch(/old_price|previous|close_price/);
  });
});

// S5 PR 4: documents, messages, tours.
describe("member records guards", () => {
  const read = (p: string) => readFileSync(join(SRC, p), "utf8");

  it("shows the wiring banner on documents and messages (CLAUDE.md, review item 8)", () => {
    for (const f of ["app/my/documents/page.tsx", "app/my/messages/page.tsx"]) expect(read(f), f).toMatch(/<WiringBanner\b/);
  });

  it("downloads only through short-lived signed URLs that force a download (review item 8)", () => {
    for (const f of ["app/api/my/documents/[id]/route.ts", "app/api/my/deal-docs/route.ts"]) {
      const text = read(f);
      expect(text, f).toMatch(/createSignedUrl\([^,]+, 60, \{ download: /);
    }
  });

  it("checks every upload's bytes before listing it (review item 8)", () => {
    const text = read("app/api/my/documents/complete/route.ts");
    expect(text).toMatch(/sniffDocumentType\(bytes\)/);
    expect(text).toMatch(/bucket\.remove\(\[path\]\)/);
  });

  it("renders messages as plain text (review item 9)", () => {
    for (const f of ["app/my/messages/page.tsx", "../../va/src/app/messages/[memberId]/page.tsx"]) {
      const text = read(f);
      expect(text, f).not.toMatch(/dangerouslySetInnerHTML|<Markdown\b/);
      expect(text, f).toMatch(/whitespace-pre-wrap/);
    }
  });

  it("never confirms a tour from the website (review item 16)", () => {
    for (const f of files(SRC)) {
      const text = readFileSync(f, "utf8");
      expect(/tour_status|set_tour_status/.test(text) && !/my\/tours\/page\.tsx$|__tests__/.test(f), relative(SRC, f)).toBe(false);
    }
  });
});

describe("form submit guards", () => {
  it("never relies on a submit button's name/value (not reliably sent with server actions)", () => {
    const hits: string[] = [];
    for (const dir of [SRC, join(SRC, "../../va/src")]) {
      for (const f of files(dir)) {
        const text = readFileSync(f, "utf8");
        for (const m of text.matchAll(/<(button|SubmitButton)\b[^>]*>/gs)) if (/\bname=/.test(m[0]) && /\bvalue=/.test(m[0])) hits.push(`${relative(SRC, f)}: ${m[0].slice(0, 80)}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
