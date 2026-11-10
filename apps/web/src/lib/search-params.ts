import { z } from "zod";

// URL <-> search filters. Every search is a shareable, crawlable URL.
// No demographic filters, ever (FH-1).

export const HOME_TYPES = {
  house: "Single Family Residence",
  condo: "Condominium",
  townhome: "Townhouse",
  "multi-family": "Multi Family",
} as const;
export type HomeType = keyof typeof HOME_TYPES;

export const SORTS = ["newest", "price_asc", "price_desc", "beds", "open_house"] as const;
export type Sort = (typeof SORTS)[number];

/** Sold is listed for members (VOW, S5); public search never returns sold rows. */
export const TABS = ["for-sale", "open-houses", "sold"] as const;
export type Tab = (typeof TABS)[number];

export const PAGE_SIZE = 24;

const list = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [])
    .map((s) => String(s).trim())
    .filter(Boolean);

const money = z.coerce.number().int().min(0).max(100_000_000).optional().catch(undefined);
const count = z.coerce.number().int().min(0).max(20).optional().catch(undefined);

const schema = z.object({
  city: z.preprocess(list, z.array(z.string().regex(/^[a-z0-9-]{1,64}$/)).max(35)).catch([]),
  minPrice: money,
  maxPrice: money,
  beds: count,
  baths: count,
  type: z.preprocess(list, z.array(z.enum(Object.keys(HOME_TYPES) as [HomeType, ...HomeType[]])).max(4)).catch([]),
  tab: z.enum(TABS).catch("for-sale"),
  sort: z.enum(SORTS).catch("newest"),
  page: z.coerce.number().int().min(1).max(500).catch(1),
  bbox: z
    .preprocess(
      (v) => (typeof v === "string" ? v.split(",").map(Number) : undefined),
      z
        .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-180).max(180), z.number().min(-90).max(90)])
        .refine(([w, s, e, n]) => w < e && s < n)
        .optional(),
    )
    .catch(undefined),
});

export type SearchFilters = z.infer<typeof schema>;

/** Every filter the public search accepts (reviewed against FH-1). */
export const SEARCH_FILTER_KEYS = Object.keys(schema.shape).sort();

export const DEFAULT_FILTERS: SearchFilters = schema.parse({});

/** Parses Next `searchParams` (or URLSearchParams); invalid values fall back to defaults. */
export function parseSearchParams(input: URLSearchParams | Record<string, string | string[] | undefined>): SearchFilters {
  const raw: Record<string, unknown> = {};
  if (input instanceof URLSearchParams) {
    for (const key of new Set(input.keys())) {
      const all = input.getAll(key);
      raw[key] = all.length > 1 ? all : all[0];
    }
  } else {
    for (const [k, v] of Object.entries(input)) raw[k] = v;
  }
  return schema.parse(raw);
}

/** Canonical query string (defaults omitted, stable order). */
export function toQueryString(f: SearchFilters): string {
  const p = new URLSearchParams();
  if (f.city.length) p.set("city", [...f.city].sort().join(","));
  if (f.minPrice !== undefined) p.set("minPrice", String(f.minPrice));
  if (f.maxPrice !== undefined) p.set("maxPrice", String(f.maxPrice));
  if (f.beds !== undefined) p.set("beds", String(f.beds));
  if (f.baths !== undefined) p.set("baths", String(f.baths));
  if (f.type.length) p.set("type", [...f.type].sort().join(","));
  if (f.tab !== "for-sale") p.set("tab", f.tab);
  if (f.sort !== "newest") p.set("sort", f.sort);
  if (f.bbox) p.set("bbox", f.bbox.map((n) => n.toFixed(4)).join(","));
  if (f.page > 1) p.set("page", String(f.page));
  return p.toString();
}

/** Arguments for public.search_listings(). */
export function toSearchArgs(f: SearchFilters, pageSize = PAGE_SIZE) {
  return {
    p_cities: f.city.length ? f.city : null,
    p_min_price: f.minPrice ?? null,
    p_max_price: f.maxPrice ?? null,
    p_min_beds: f.beds ?? null,
    p_min_baths: f.baths ?? null,
    p_sub_types: f.type.length ? f.type.map((t) => HOME_TYPES[t]) : null,
    p_own_only: false,
    p_open_houses_only: f.tab === "open-houses",
    p_bbox: f.bbox ?? null,
    p_sort: f.tab === "open-houses" && f.sort === "newest" ? "open_house" : f.sort,
    p_limit: pageSize,
    p_offset: (f.page - 1) * pageSize,
  };
}
