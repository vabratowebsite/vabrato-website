import { z } from "zod";
import type { ContentTable, Json, RevisionStatus } from "@vabrato/db";
import { fairHousingIssuesIn, isOfficialSchoolLink, type FairHousingIssue } from "@vabrato/lib";

// Website content editor (S6 PR 4): form parsing and display helpers for
// city guides, Insights posts and testimonials. Bodies match what 0024's
// content_body_ok() accepts and what apps/web reads (lib/public/content.ts).

export const CONTENT_TABLES: ContentTable[] = ["city_guides", "posts", "testimonials"];

export const TABLE_LABEL: Record<ContentTable, { one: string; many: string }> = {
  city_guides: { one: "City guide", many: "City guides" },
  posts: { one: "Insights post", many: "Insights posts" },
  testimonials: { one: "Testimonial", many: "Testimonials" },
};

export const STATUS_LABEL: Record<RevisionStatus, string> = {
  draft: "Draft",
  submitted: "Waiting for approval",
  rejected: "Sent back",
  published: "Published",
};

export const POST_KINDS = [
  { value: "insight", label: "Insight" },
  { value: "news", label: "News" },
  { value: "event", label: "Event" },
  { value: "market_update", label: "Market update" },
] as const;

export const ROLES = [
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "both", label: "Buyer and seller" },
] as const;

/** Repeated rows shown in the city guide editor (filled rows plus spares). */
export const LIST_SLOTS = { neighborhoods: 10, school_links: 8, faq: 10 } as const;

export interface GuideBody {
  intro: string;
  neighborhoods: { name: string; summary: string }[];
  school_links: { name: string; url: string }[];
  faq: { q: string; a: string }[];
}
export interface PostBody {
  kind: (typeof POST_KINDS)[number]["value"];
  title: string;
  excerpt: string;
  body_md: string;
}
export interface TestimonialBody {
  author_display: string;
  role: (typeof ROLES)[number]["value"];
  quote: string;
  source: string;
  sort: number;
  permission_confirmed: boolean;
}
export type ContentBody = GuideBody | PostBody | TestimonialBody;

export type Parsed = { ok: true; key: string | null; body: ContentBody } | { ok: false; error: string };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const fail = (error: string): Parsed => ({ ok: false, error });

function rows<T extends string>(form: FormData, prefix: string, fields: readonly T[], max: number): Record<T, string>[] {
  const out: Record<T, string>[] = [];
  for (let i = 0; i < max; i++) {
    const row = Object.fromEntries(fields.map((f) => [f, text(form, `${prefix}_${f}_${i}`)])) as Record<T, string>;
    if (fields.some((f) => row[f])) out.push(row);
  }
  return out;
}

export function parseContentForm(table: ContentTable, form: FormData): Parsed {
  if (table === "city_guides") {
    const key = text(form, "key");
    if (!SLUG.test(key)) return fail("Pick a city.");
    const intro = text(form, "intro");
    if (!intro) return fail("Write an introduction.");
    if (intro.length > 6000) return fail("Keep the introduction under 6,000 characters.");
    const neighborhoods = rows(form, "hood", ["name", "summary"] as const, LIST_SLOTS.neighborhoods);
    if (neighborhoods.some((h) => !h.name || !h.summary || h.name.length > 80 || h.summary.length > 600))
      return fail("Each neighborhood needs a name (up to 80 characters) and a summary (up to 600).");
    const school_links = rows(form, "school", ["name", "url"] as const, LIST_SLOTS.school_links);
    if (school_links.some((s) => !s.name || s.name.length > 120)) return fail("Each school link needs a name.");
    if (school_links.some((s) => !isOfficialSchoolLink(s.url)))
      return fail("School links must be https links to the official district or school site. Rating and ranking sites aren't allowed.");
    const faq = rows(form, "faq", ["q", "a"] as const, LIST_SLOTS.faq);
    if (faq.some((f) => !f.q || !f.a || f.q.length > 200 || f.a.length > 1500))
      return fail("Each question needs an answer (questions up to 200 characters, answers up to 1,500).");
    return { ok: true, key, body: { intro, neighborhoods, school_links, faq } };
  }

  if (table === "posts") {
    const key = text(form, "key").toLowerCase();
    if (!SLUG.test(key) || key.length > 100) return fail("The web address may use lowercase letters, numbers and single hyphens (up to 100).");
    const kind = z.enum(["insight", "news", "event", "market_update"]).safeParse(text(form, "kind"));
    if (!kind.success) return fail("Pick a kind of post.");
    const title = text(form, "title");
    if (!title || title.length > 200) return fail("Write a title of up to 200 characters.");
    const excerpt = text(form, "excerpt");
    if (excerpt.length > 400) return fail("Keep the summary under 400 characters.");
    const body_md = String(form.get("body_md") ?? "").replace(/\r\n/g, "\n").trim();
    if (!body_md || body_md.length > 50000) return fail("Write the article (up to 50,000 characters).");
    return { ok: true, key, body: { kind: kind.data, title, excerpt, body_md } };
  }

  const rawKey = text(form, "key");
  const key = rawKey ? z.string().uuid().safeParse(rawKey) : null;
  if (key && !key.success) return fail("Unknown testimonial.");
  const author_display = text(form, "author_display");
  if (!author_display || author_display.length > 60) return fail("Write the name as shown (first name and initial, up to 60 characters).");
  const role = z.enum(["buyer", "seller", "both"]).safeParse(text(form, "role") || "buyer");
  if (!role.success) return fail("Pick buyer, seller or both.");
  const quote = text(form, "quote");
  if (!quote || quote.length > 1200) return fail("Write the quote (up to 1,200 characters).");
  const source = text(form, "source");
  if (source.length > 200) return fail("Keep the source under 200 characters.");
  const sort = Number(text(form, "sort") || "0");
  if (!Number.isInteger(sort) || sort < 0 || sort > 1000) return fail("Order must be a whole number from 0 to 1000.");
  return {
    ok: true,
    key: key?.data ?? null,
    body: { author_display, role: role.data, quote, source, sort, permission_confirmed: form.get("permission_confirmed") === "on" },
  };
}

/** Body for the editor from a live row (editing what's on the site now). */
export function bodyFromLive(table: ContentTable, row: Record<string, unknown> | null): ContentBody | null {
  if (!row) return null;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  if (table === "city_guides")
    return {
      intro: String(row.intro ?? ""),
      neighborhoods: arr(row.neighborhoods).map((h) => ({ name: String(h?.name ?? ""), summary: String(h?.summary ?? "") })),
      school_links: arr(row.school_links).map((s) => ({ name: String(s?.name ?? ""), url: String(s?.url ?? "") })),
      faq: arr(row.faq).map((f) => ({ q: String(f?.q ?? ""), a: String(f?.a ?? "") })),
    };
  if (table === "posts")
    return { kind: (row.kind as PostBody["kind"]) ?? "insight", title: String(row.title ?? ""), excerpt: String(row.excerpt ?? ""), body_md: String(row.body_md ?? "") };
  return {
    author_display: String(row.author_display ?? ""),
    role: (row.role as TestimonialBody["role"]) ?? "buyer",
    quote: String(row.quote ?? ""),
    source: String(row.source ?? ""),
    sort: Number(row.sort ?? 0),
    permission_confirmed: row.permission_confirmed === true,
  };
}

export const asBody = (b: Json): ContentBody => b as unknown as ContentBody;

/** "San Carlos", a post title, or "Sam Q." for lists. */
export function revisionLabel(table: ContentTable, key: string | null, body: ContentBody, cityName?: (slug: string) => string | undefined): string {
  if (table === "city_guides") return (key && cityName?.(key)) || key || "City guide";
  if (table === "posts") return (body as PostBody).title || key || "Post";
  return (body as TestimonialBody).author_display || "Testimonial";
}

export interface ContentCheck {
  issues: FairHousingIssue[];
  blocking: boolean;
}

/** FH-1 copy check for a revision body (run at submit and publish). */
export function checkContent(body: ContentBody): ContentCheck {
  const issues = fairHousingIssuesIn(body);
  return { issues, blocking: issues.some((i) => i.level === "block") };
}

export function blockingMessage(check: ContentCheck): string {
  const phrases = [...new Set(check.issues.filter((i) => i.level === "block").map((i) => `"${i.match}"`))];
  return `Reword before sending: ${phrases.join(", ")} (Fair Housing, FH-1).`;
}

/** Website path where the content shows, for the "View on site" link. */
export function sitePath(table: ContentTable, key: string | null): string | null {
  if (table === "testimonials") return "/testimonials";
  if (!key) return null;
  return table === "city_guides" ? `/neighborhoods/${key}` : `/insights/${key}`;
}
