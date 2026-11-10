import { z } from "zod";
import type { SupabaseDb } from "@vabrato/lib";
import { SearchRowSchema, type SearchRow } from "@/lib/public/listings";
import { HOME_TYPES, PAGE_SIZE, type SearchFilters } from "@/lib/search-params";

// Member listing reads (signed-in client, so RLS applies). IDX for saved
// homes and compare; VOW for sold search and sold detail, which the DB also
// gates on has_vow_access() + vow_enabled (MLS-6, review item 1).

export async function savedListings(db: SupabaseDb): Promise<{ keys: string[]; rows: SearchRow[]; gone: string[] }> {
  const { data, error } = await db.from("saved_homes").select("listing_key").order("created_at", { ascending: false });
  if (error) throw new Error(`saved homes failed: ${error.message}`);
  const keys = (data ?? []).map((r) => r.listing_key);
  const rows = await cards(db, keys);
  const byKey = new Map(rows.map((r) => [r.listing_key, r]));
  return { keys, rows: keys.map((k) => byKey.get(k)).filter((r): r is SearchRow => Boolean(r)), gone: keys.filter((k) => !byKey.has(k)) };
}

export async function cards(db: SupabaseDb, keys: string[]): Promise<SearchRow[]> {
  if (keys.length === 0) return [];
  const { data, error } = await db.rpc("listing_cards", { p_keys: keys.slice(0, 500) });
  if (error) throw new Error(`listing cards failed: ${error.message}`);
  return z.array(SearchRowSchema).parse(data ?? []);
}

export const SoldRowSchema = z.object({
  listing_key: z.string(),
  listing_id: z.string().nullable(),
  property_type: z.string().nullable(),
  property_sub_type: z.string().nullable(),
  close_price: z.coerce.number().nullable(),
  close_date: z.string().nullable(),
  street: z.string().nullable(),
  city: z.string().nullable(),
  postal_code: z.string().nullable(),
  bedrooms_total: z.number().nullable(),
  bathrooms_total: z.number().nullable(),
  living_area: z.coerce.number().nullable(),
  list_office_name: z.string().nullable(),
  is_own_listing: z.boolean(),
  address_display: z.boolean(),
  photo_url: z.string().nullable(),
  photo_storage_path: z.string().nullable(),
  total_count: z.coerce.number(),
});
export type SoldRow = z.infer<typeof SoldRowSchema>;

export const SOLD_WINDOWS = [
  { days: 90, label: "Last 3 months" },
  { days: 180, label: "Last 6 months" },
  { days: 365, label: "Last 12 months" },
  { days: 730, label: "Last 2 years" },
] as const;

export async function soldSearch(db: SupabaseDb, f: SearchFilters, withinDays: number): Promise<{ rows: SoldRow[]; total: number }> {
  const { data, error } = await db.rpc("search_sold_listings", {
    p_cities: f.city.length ? f.city : undefined,
    p_min_price: f.minPrice,
    p_max_price: f.maxPrice,
    p_min_beds: f.beds,
    p_min_baths: f.baths,
    p_sub_types: f.type.length ? f.type.map((t) => HOME_TYPES[t]) : undefined,
    p_bbox: f.bbox,
    p_closed_within_days: withinDays,
    p_limit: PAGE_SIZE,
    p_offset: (f.page - 1) * PAGE_SIZE,
  });
  if (error) throw new Error(`sold search failed: ${error.message}`);
  const rows = z.array(SoldRowSchema).parse(data ?? []);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

const MemberListingSchema = z.object({
  listing_key: z.string(),
  listing_id: z.string().nullable(),
  standard_status: z.string(),
  property_sub_type: z.string().nullable(),
  list_price: z.coerce.number().nullable(),
  city: z.string().nullable(),
  postal_code: z.string().nullable(),
  bedrooms_total: z.number().nullable(),
  bathrooms_total: z.number().nullable(),
  living_area: z.coerce.number().nullable(),
  list_office_name: z.string().nullable(),
  is_own_listing: z.boolean(),
  address_display: z.boolean(),
  data: z.record(z.unknown()),
  mls_media: z.array(z.object({ url: z.string().nullable(), storage_path: z.string().nullable(), sort_order: z.number() })),
});
export type MemberListing = z.infer<typeof MemberListingSchema>;

/** A listing as a VOW member may see it (incl. Closed), IDX columns only; VOW fields come from the RPCs. */
export async function memberListing(db: SupabaseDb, key: string) {
  const { data, error } = await db
    .from("mls_listings")
    .select(
      "listing_key, listing_id, standard_status, property_sub_type, list_price, city, postal_code, bedrooms_total, bathrooms_total, living_area, list_office_name, is_own_listing, address_display, data, mls_media(url, storage_path, sort_order)",
    )
    .eq("listing_key", key)
    .maybeSingle();
  if (error) throw new Error(`listing failed: ${error.message}`);
  if (!data) return null;
  const listing = MemberListingSchema.parse(data);
  const [sold, history] = await Promise.all([db.rpc("listing_sold_detail", { p_key: key }), db.rpc("listing_price_history", { p_key: key })]);
  if (sold.error || history.error) throw new Error("sold detail failed");
  return {
    listing,
    sold: sold.data?.[0] ? { price: Number(sold.data[0].close_price), date: sold.data[0].close_date, originalPrice: sold.data[0].original_list_price === null ? null : Number(sold.data[0].original_list_price), daysOnMarket: sold.data[0].cumulative_days_on_market } : null,
    history: (history.data ?? []).map((e) => ({ at: e.observed_at, price: e.list_price === null ? null : Number(e.list_price), status: e.standard_status })),
  };
}
