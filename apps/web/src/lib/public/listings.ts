import { z } from "zod";
import { toSearchArgs, type SearchFilters } from "../search-params";
import { publicSupabase } from "./supabase";

// Public (IDX) listing reads. Everything goes through the anon client, so RLS
// decides what is visible: for-sale listings only, never VOW/FULL tables.
// Results are validated here; DB errors throw (pages show the error boundary
// rather than an empty list that looks like "no homes").

const num = z.coerce.number();
const numOrNull = z.union([z.coerce.number(), z.null()]);

export const SearchRowSchema = z.object({
  listing_key: z.string(),
  listing_id: z.string().nullable(),
  standard_status: z.string(),
  property_type: z.string().nullable(),
  property_sub_type: z.string().nullable(),
  list_price: numOrNull,
  street: z.string().nullable(),
  city: z.string().nullable(),
  postal_code: z.string().nullable(),
  bedrooms_total: z.number().nullable(),
  bathrooms_total: z.number().nullable(),
  living_area: numOrNull,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  list_office_name: z.string().nullable(),
  is_own_listing: z.boolean(),
  address_display: z.boolean(),
  on_market_date: z.string().nullable(),
  modification_ts: z.string(),
  photo_url: z.string().nullable(),
  photo_storage_path: z.string().nullable(),
  next_open_house_start: z.string().nullable(),
  next_open_house_end: z.string().nullable(),
  total_count: num,
});
export type SearchRow = z.infer<typeof SearchRowSchema>;

export async function searchListings(
  filters: SearchFilters,
  opts: { pageSize?: number; ownOnly?: boolean } = {},
): Promise<{ rows: SearchRow[]; total: number }> {
  // Sold search is VOW (S5): the public sold tab shows the members banner instead.
  if (filters.tab === "sold") return { rows: [], total: 0 };
  const args = { ...toSearchArgs(filters, opts.pageSize), p_own_only: opts.ownOnly ?? false };
  const { data, error } = await publicSupabase().rpc("search_listings", args);
  if (error) throw new Error(`search_listings failed: ${error.message}`);
  const rows = z.array(SearchRowSchema).parse(data ?? []);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

const ListingSchema = z.object({
  listing_key: z.string(),
  listing_id: z.string().nullable(),
  standard_status: z.string(),
  property_type: z.string().nullable(),
  property_sub_type: z.string().nullable(),
  list_price: numOrNull,
  city: z.string().nullable(),
  county: z.string().nullable(),
  postal_code: z.string().nullable(),
  bedrooms_total: z.number().nullable(),
  bathrooms_total: z.number().nullable(),
  living_area: numOrNull,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  list_office_name: z.string().nullable(),
  list_office_mls_id: z.string().nullable(),
  list_agent_full_name: z.string().nullable(),
  is_own_listing: z.boolean(),
  address_display: z.boolean(),
  avm_display: z.boolean(),
  comments_display: z.boolean(),
  modification_ts: z.string(),
  // IDX field set only (the sync stores nothing else in this column).
  data: z.record(z.unknown()),
  mls_media: z.array(
    z.object({
      media_key: z.string(),
      sort_order: z.number(),
      url: z.string().nullable(),
      storage_path: z.string().nullable(),
      short_description: z.string().nullable(),
      width: z.number().nullable(),
      height: z.number().nullable(),
    }),
  ),
  mls_open_houses: z.array(
    z.object({
      open_house_key: z.string(),
      start_time: z.string().nullable(),
      end_time: z.string().nullable(),
      remarks: z.string().nullable(),
    }),
  ),
});
export type Listing = z.infer<typeof ListingSchema>;

const LISTING_COLUMNS = [
  "listing_key",
  "listing_id",
  "standard_status",
  "property_type",
  "property_sub_type",
  "list_price",
  "city",
  "county",
  "postal_code",
  "bedrooms_total",
  "bathrooms_total",
  "living_area",
  "latitude",
  "longitude",
  "list_office_name",
  "list_office_mls_id",
  "list_agent_full_name",
  "is_own_listing",
  "address_display",
  "avm_display",
  "comments_display",
  "modification_ts",
  "data",
  "mls_media(media_key, sort_order, url, storage_path, short_description, width, height)",
  "mls_open_houses(open_house_key, start_time, end_time, remarks)",
].join(", ");

/** One listing with photos and open houses, or null if it isn't (or is no longer) publicly visible. */
export async function getListing(listingKey: string): Promise<Listing | null> {
  const { data, error } = await publicSupabase()
    .from("mls_listings")
    .select(LISTING_COLUMNS)
    .eq("listing_key", listingKey)
    .order("sort_order", { referencedTable: "mls_media" })
    .order("start_time", { referencedTable: "mls_open_houses" })
    .maybeSingle();
  if (error) throw new Error(`listing query failed: ${error.message}`);
  if (!data) return null;
  const listing = ListingSchema.parse(data);
  const now = Date.now();
  return {
    ...listing,
    // Coordinates follow the address rule (MLS-3).
    latitude: listing.address_display ? listing.latitude : null,
    longitude: listing.address_display ? listing.longitude : null,
    mls_open_houses: listing.mls_open_houses.filter((o) => !o.end_time || Date.parse(o.end_time) >= now),
  };
}

/** MLS-1 "last updated": when the last sync succeeded. */
export async function mlsLastUpdated(): Promise<string | null> {
  const { data, error } = await publicSupabase().rpc("mls_last_updated");
  if (error) throw new Error(`mls_last_updated failed: ${error.message}`);
  return z.string().nullable().parse(data ?? null);
}

export async function flagEnabled(key: "public_sold" | "public_stats" | "site_scl_enabled"): Promise<boolean> {
  const { data, error } = await publicSupabase().from("feature_flags").select("enabled").eq("key", key).maybeSingle();
  if (error) throw new Error(`feature flag read failed: ${error.message}`);
  return z.object({ enabled: z.boolean() }).nullable().parse(data)?.enabled ?? false;
}

export const OwnSoldSchema = z.object({
  listing_key: z.string(),
  street: z.string().nullable(),
  city: z.string().nullable(),
  postal_code: z.string().nullable(),
  property_sub_type: z.string().nullable(),
  bedrooms_total: z.number().nullable(),
  bathrooms_total: z.number().nullable(),
  close_price: numOrNull,
  close_date: z.string().nullable(),
});

/** Our own sold listings for public pages (MLS-10). Empty while `public_sold` is off. */
export async function ownSoldListings(limit = 12) {
  const { data, error } = await publicSupabase().rpc("public_own_sold", { p_limit: limit });
  if (error) throw new Error(`public_own_sold failed: ${error.message}`);
  return z.array(OwnSoldSchema).parse(data ?? []);
}

export const CitySchema = z.object({
  slug: z.string(),
  name: z.string(),
  county: z.string(),
  kind: z.enum(["city", "unincorporated"]),
  priority: z.number(),
});
export type City = z.infer<typeof CitySchema>;

export async function listCities(): Promise<City[]> {
  const { data, error } = await publicSupabase()
    .from("cities")
    .select("slug, name, county, kind, priority")
    .order("county")
    .order("name");
  if (error) throw new Error(`cities query failed: ${error.message}`);
  return z.array(CitySchema).parse(data ?? []);
}
