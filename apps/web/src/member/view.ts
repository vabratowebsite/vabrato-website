import type { ListingCardProps } from "@vabrato/ui/web";
import { cityLine, formatPrice, listingTitle, typeLine } from "@/lib/format";
import { resolveListingPhoto } from "@/lib/photos";
import type { MemberListing, SoldRow } from "./listings";

// Display helpers for member (VOW) listings. Hidden addresses stay hidden
// (MLS-3): the street comes only from address_display rows.

export const fmtDay = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

export function soldCardProps(r: SoldRow): ListingCardProps {
  const parts = { listing_key: r.listing_key, street: r.street, city: r.city, postal_code: r.postal_code, address_display: r.address_display };
  const title = listingTitle(parts);
  const photo = resolveListingPhoto({ url: r.photo_url, storage_path: r.photo_storage_path });
  return {
    address: title,
    cityLine: cityLine(parts),
    price: formatPrice(r.close_price),
    typeLine: typeLine(r),
    listingNo: r.listing_id ?? r.listing_key,
    href: `/my/listing/${encodeURIComponent(r.listing_key)}`,
    photo: photo ? { src: photo.src, alt: `Photo of ${title}` } : undefined,
    badges: ["sold", ...(r.is_own_listing ? (["ours"] as const) : [])],
    badgeText: { sold: r.close_date ? `Sold ${fmtDay(r.close_date)}` : "Sold" },
    attribution: { idx: !r.is_own_listing, listingBroker: r.list_office_name ?? undefined },
  };
}

export function memberListingParts(l: MemberListing) {
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const d = l.data;
  const street = l.address_display
    ? [s(d.StreetNumber), s(d.StreetName), s(d.StreetSuffix), s(d.UnitNumber) ? `#${s(d.UnitNumber)}` : null].filter(Boolean).join(" ") || s(d.UnparsedAddress)?.split(",")[0] || null
    : null;
  return { listing_key: l.listing_key, street, city: l.city, postal_code: l.postal_code, address_display: l.address_display };
}

/** Event labels for a price history (oldest first). */
export function historyRows(events: { at: string; price: number | null; status: string }[], sold: { price: number; date: string | null } | null) {
  const evs = sold ? events.filter((e) => e.status !== "Closed") : events;
  const rows = evs.map((e, i) => {
    const prev = evs[i - 1];
    const event =
      e.status === "Closed"
        ? "Sold"
        : i === 0
          ? "Listed for sale"
          : prev && prev.status !== e.status
            ? ({ Active: "Back on the market", Pending: "Pending", ActiveUnderContract: "Under contract" } as Record<string, string>)[e.status] ?? e.status
            : "Price changed";
    return { date: fmtDay(e.at), event, price: formatPrice(e.price) };
  });
  if (sold) rows.push({ date: fmtDay(sold.date), event: "Sold", price: formatPrice(sold.price) });
  return rows;
}
