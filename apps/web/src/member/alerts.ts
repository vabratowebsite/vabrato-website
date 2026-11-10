import type { SupabaseDb } from "@vabrato/lib";
import { formatPrice, listingPath, listingTitle } from "@/lib/format";
import type { SearchRow } from "@/lib/public/listings";
import { cards } from "./listings";

// "What changed" (mockup 05): the member's alert deliveries with the
// listing's current IDX card data. New list price only (review item 3);
// hidden addresses stay hidden (listing_cards withholds the street).

export type AlertKind = "new_match" | "back_on_market" | "price_drop" | "price_change" | "status_change";

export interface FeedItem {
  id: number;
  kind: AlertKind;
  label: string;
  tone: "red" | "navy" | "gold" | "green";
  title: string;
  href: string | null;
  price: string | null;
  search: string | null;
  broker: string | null;
  at: string;
  seen: boolean;
}

const STATUS: Record<string, string> = { Active: "Back to active", Pending: "Now pending", ActiveUnderContract: "Now under contract" };

export function feedLabel(kind: AlertKind, row: Pick<SearchRow, "standard_status"> | null): { label: string; tone: FeedItem["tone"] } {
  switch (kind) {
    case "new_match":
      return { label: "New match", tone: "navy" };
    case "back_on_market":
      return { label: "Back on the market", tone: "green" };
    case "price_drop":
      return { label: "Price reduced", tone: "red" };
    case "price_change":
      return { label: "Price changed", tone: "gold" };
    case "status_change":
      return { label: (row && STATUS[row.standard_status]) ?? "Status update", tone: "gold" };
  }
}

export async function alertFeed(db: SupabaseDb, limit = 50): Promise<FeedItem[]> {
  const { data, error } = await db
    .from("alert_deliveries")
    .select("id, kind, listing_key, new_price, created_at, seen_at, saved_searches(name)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`alert feed failed: ${error.message}`);
  const rows = data ?? [];
  const live = new Map((await cards(db, [...new Set(rows.map((r) => r.listing_key))])).map((c) => [c.listing_key, c]));
  return rows.map((r) => {
    const card = live.get(r.listing_key) ?? null;
    const { label, tone } = feedLabel(r.kind as AlertKind, card);
    const search = (r.saved_searches as { name: string } | null)?.name ?? null;
    return {
      id: r.id,
      kind: r.kind as AlertKind,
      label,
      tone,
      title: card ? listingTitle(card) : "A home that's no longer on the market",
      href: card ? listingPath(card) : null,
      price: card && r.new_price !== null ? formatPrice(r.new_price) : null,
      search,
      broker: card && !card.is_own_listing ? (card.list_office_name ?? null) : null,
      at: r.created_at,
      seen: Boolean(r.seen_at),
    };
  });
}

export async function unseenAlertCount(db: SupabaseDb): Promise<number> {
  const { count } = await db.from("alert_deliveries").select("id", { count: "exact", head: true }).is("seen_at", null);
  return count ?? 0;
}

/** "2 hours ago" in Pacific time terms (feed timestamps). */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
