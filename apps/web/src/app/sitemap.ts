import type { MetadataRoute } from "next";
import { listCities } from "@/lib/public/listings";
import { absoluteUrl } from "@/lib/seo";

// Generated now, served once indexing opens in S9 (robots still disallows all).
// Listing URLs are added with the listing pages (PR 2); hidden-address
// listings use the city-only slug (review item 7).
export const revalidate = 900;

const STATIC_PATHS = ["/", "/search", "/properties", "/open-houses", "/neighborhoods", "/sell", "/buy", "/about", "/testimonials", "/transform", "/insights", "/contact", "/privacy", "/terms", "/accessibility"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({ url: absoluteUrl(p) }));
  try {
    for (const c of await listCities()) entries.push({ url: absoluteUrl(`/neighborhoods/${c.slug}`) });
  } catch {
    // Database not reachable at build time: static entries only.
  }
  return entries;
}
