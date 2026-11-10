import type { MetadataRoute } from "next";
import { listingPath } from "@/lib/format";
import { listCities, searchListings } from "@/lib/public/listings";
import { DEFAULT_FILTERS } from "@/lib/search-params";
import { absoluteUrl } from "@/lib/seo";

// Generated now, served once indexing opens in S9 (robots still disallows all).
// Hidden-address listings use the city-only slug (review item 7).
export const revalidate = 900;

const STATIC_PATHS = ["/", "/search", "/properties", "/open-houses", "/neighborhoods", "/sell", "/buy", "/about", "/testimonials", "/transform", "/insights", "/contact", "/privacy", "/terms", "/accessibility"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({ url: absoluteUrl(p) }));
  try {
    for (const c of await listCities()) entries.push({ url: absoluteUrl(`/neighborhoods/${c.slug}`) });
    for (let page = 1; page <= 200; page++) {
      const { rows, total } = await searchListings({ ...DEFAULT_FILTERS, page }, { pageSize: 100 });
      for (const r of rows) entries.push({ url: absoluteUrl(listingPath(r)), lastModified: r.modification_ts });
      if (page * 100 >= total) break;
    }
  } catch {
    // Database not reachable at build time: static entries only.
  }
  return entries;
}
