import type { ListingBadge, ListingCardProps } from "@vabrato/ui/web";
import { cityLine, formatPrice, listingPath, listingTitle, typeLine } from "./format";
import { resolveListingPhoto } from "./photos";
import type { SearchRow } from "./public/listings";

// Search row -> ListingCard. Other brokers' listings carry the IDX icon and
// the listing broker (MLS-2). Hidden addresses never reach the card.

const PT = "America/Los_Angeles";
const NEW_DAYS = 7;

/** "Sat 1–4 PM" in Pacific time. */
export function openHouseShort(startIso: string, endIso?: string | null): string {
  const start = new Date(startIso);
  const day = start.toLocaleDateString("en-US", { timeZone: PT, weekday: "short" });
  return `${day} ${timeRange(start, endIso ? new Date(endIso) : null)}`;
}

/** "Sat, Nov 15 · 1–4 PM" in Pacific time. */
export function openHouseLong(startIso: string, endIso?: string | null): string {
  const start = new Date(startIso);
  const day = start.toLocaleDateString("en-US", { timeZone: PT, weekday: "short", month: "short", day: "numeric" });
  return `${day} · ${timeRange(start, endIso ? new Date(endIso) : null)}`;
}

/** Calendar day key (YYYY-MM-DD) in Pacific time, for grouping. */
export function pacificDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: PT });
}

function timeRange(start: Date, end: Date | null): string {
  const parts = (d: Date) => {
    const s = d.toLocaleTimeString("en-US", { timeZone: PT, hour: "numeric", minute: "2-digit" });
    const [hm, ap] = s.split(" ") as [string, string];
    return { hm: hm.endsWith(":00") ? hm.slice(0, -3) : hm, ap };
  };
  const a = parts(start);
  if (!end) return `${a.hm} ${a.ap}`;
  const b = parts(end);
  return a.ap === b.ap ? `${a.hm}–${b.hm} ${b.ap}` : `${a.hm} ${a.ap}–${b.hm} ${b.ap}`;
}

export function listingBadges(row: SearchRow, now: Date = new Date()): { badges: ListingBadge[]; badgeText: Partial<Record<ListingBadge, string>> } {
  const badges: ListingBadge[] = [];
  const badgeText: Partial<Record<ListingBadge, string>> = {};
  if (row.is_own_listing) badges.push("ours");
  if (row.standard_status === "Pending" || row.standard_status === "ActiveUnderContract") {
    badges.push("contingent");
    badgeText.contingent = row.standard_status === "Pending" ? "Pending" : "Contingent";
  } else if (row.next_open_house_start) {
    badges.push("open");
    badgeText.open = `Open ${openHouseShort(row.next_open_house_start, row.next_open_house_end)}`;
  } else if (row.on_market_date && now.getTime() - Date.parse(row.on_market_date) <= NEW_DAYS * 86_400_000) {
    badges.push("new");
  }
  return { badges: badges.slice(0, 2), badgeText };
}

export function toCardProps(row: SearchRow, now?: Date): ListingCardProps {
  const title = listingTitle(row);
  const photo = resolveListingPhoto({ url: row.photo_url, storage_path: row.photo_storage_path });
  const { badges, badgeText } = listingBadges(row, now);
  return {
    address: title,
    cityLine: cityLine(row),
    price: formatPrice(row.list_price),
    typeLine: typeLine(row),
    listingNo: row.listing_id ?? row.listing_key,
    href: listingPath(row),
    photo: photo ? { src: photo.src, alt: `Photo of ${title}` } : undefined,
    badges,
    badgeText,
    attribution: { idx: !row.is_own_listing, listingBroker: row.list_office_name ?? undefined },
  };
}
