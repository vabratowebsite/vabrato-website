import { HOME_TYPES, parseSearchParams, toQueryString, type SearchFilters } from "@/lib/search-params";

// Saved homes and saved searches: what's stored and how it's named. Pure,
// unit-tested. A saved search stores exactly the /search filters (FH-1: no
// demographic filters exist to store), never the sold tab (VOW) or a page.

export const LISTING_KEY = /^[A-Za-z0-9._-]{1,64}$/;

export type SearchCriteria = Record<string, string>;

/** Filters → the JSON stored in saved_searches.criteria (URL params, canonical). */
export function criteriaFromFilters(f: SearchFilters): SearchCriteria {
  const clean: SearchFilters = { ...f, page: 1, tab: f.tab === "sold" ? "for-sale" : f.tab };
  return Object.fromEntries(new URLSearchParams(toQueryString(clean)));
}

/** Stored criteria → filters (anything unknown or invalid falls back to defaults). */
export function filtersFromCriteria(c: unknown): SearchFilters {
  const raw: Record<string, string> = {};
  if (c && typeof c === "object" && !Array.isArray(c)) {
    for (const [k, v] of Object.entries(c)) if (typeof v === "string") raw[k] = v;
  }
  const f = parseSearchParams(raw);
  return { ...f, page: 1, tab: f.tab === "sold" ? "for-sale" : f.tab };
}

export const searchHref = (c: unknown) => {
  const q = toQueryString(filtersFromCriteria(c));
  return q ? `/search?${q}` : "/search";
};

const shortPrice = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M` : `$${Math.round(n / 1000)}K`;

const TYPE_LABELS: Record<keyof typeof HOME_TYPES, string> = {
  house: "Houses",
  condo: "Condos",
  townhome: "Townhomes",
  "multi-family": "Multi-family",
};

/** "San Carlos 3bd+ under $2.5M"-style name from the filters (mockup 05). */
export function describeSearch(f: SearchFilters, cityName: (slug: string) => string | undefined): string {
  const cities = f.city.map((s) => cityName(s) ?? s).filter(Boolean);
  const parts: string[] = [];
  parts.push(cities.length === 0 ? "All areas" : cities.length <= 2 ? cities.join(" & ") : `${cities[0]} + ${cities.length - 1} more`);
  if (f.type.length === 1) parts.push(TYPE_LABELS[f.type[0]!]);
  if (f.beds) parts.push(`${f.beds}bd+`);
  if (f.baths) parts.push(`${f.baths}ba+`);
  if (f.minPrice !== undefined && f.maxPrice !== undefined) parts.push(`${shortPrice(f.minPrice)}–${shortPrice(f.maxPrice)}`);
  else if (f.maxPrice !== undefined) parts.push(`under ${shortPrice(f.maxPrice)}`);
  else if (f.minPrice !== undefined) parts.push(`over ${shortPrice(f.minPrice)}`);
  if (f.bbox) parts.push("map area");
  if (f.tab === "open-houses") parts.push("open houses");
  return parts.join(" ").slice(0, 80);
}

export const FREQUENCIES = [
  { value: "instant", label: "Instant alerts" },
  { value: "daily", label: "Daily digest" },
  { value: "off", label: "No alerts" },
] as const;
export type Frequency = (typeof FREQUENCIES)[number]["value"];
export const isFrequency = (v: unknown): v is Frequency => FREQUENCIES.some((f) => f.value === v);
