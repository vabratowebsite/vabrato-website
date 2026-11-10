// Listing display formatting. Everything that can reveal a street address goes
// through listingTitle / listingSlug, which honor InternetAddressDisplayYN
// (MLS-3; review item 7: hidden addresses never reach titles, slugs, meta,
// JSON-LD, sitemaps or .ics files).

export interface AddressParts {
  listing_key: string;
  street: string | null;
  city: string | null;
  postal_code?: string | null;
  address_display: boolean;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "$2,195,000" */
export function formatPrice(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : n;
  return v === null || v === undefined || !Number.isFinite(v) ? "Price on request" : usd.format(v);
}

/** Map pin label: "$2.2M", "$985K". */
export function formatShortPrice(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 2).replace(/\.?0+$/, "")}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

const SUB_TYPE_LABEL: Record<string, string> = {
  "Single Family Residence": "House",
  Condominium: "Condo",
  Townhouse: "Townhome",
  "Multi Family": "Multi-family",
};

export function propertyTypeLabel(subType: string | null | undefined): string {
  return (subType && SUB_TYPE_LABEL[subType]) || subType || "Home";
}

/** "House · 4 bd · 3 ba · 2,150 sf" */
export function typeLine(l: {
  property_sub_type?: string | null;
  bedrooms_total?: number | null;
  bathrooms_total?: number | null;
  living_area?: number | string | null;
}): string {
  const parts = [propertyTypeLabel(l.property_sub_type)];
  if (l.bedrooms_total !== null && l.bedrooms_total !== undefined) parts.push(`${l.bedrooms_total} bd`);
  if (l.bathrooms_total !== null && l.bathrooms_total !== undefined) parts.push(`${l.bathrooms_total} ba`);
  const sqft = l.living_area === null || l.living_area === undefined ? null : Number(l.living_area);
  if (sqft && Number.isFinite(sqft)) parts.push(`${Math.round(sqft).toLocaleString("en-US")} sf`);
  return parts.join(" · ");
}

/** "San Carlos, CA 94070" */
export function cityLine(l: Pick<AddressParts, "city" | "postal_code">): string {
  return [l.city, ["CA", l.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/** Street when it may be shown, else "Home in Los Gatos". */
export function listingTitle(l: AddressParts): string {
  if (l.address_display && l.street) return l.street;
  return l.city ? `Home in ${l.city}` : "Home for sale";
}

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Street + city, or the city alone when the address is hidden (the key is already in the path). */
export function listingSlug(l: AddressParts): string {
  const base = l.address_display && l.street ? `${l.street} ${l.city ?? ""}` : (l.city ?? "home");
  return slugify(base) || "home";
}

export function listingPath(l: AddressParts): string {
  return `/listing/${encodeURIComponent(l.listing_key)}/${listingSlug(l)}`;
}

const PT = "America/Los_Angeles";

/** "Nov 10, 2026, 9:46 PM PT" */
export function formatPacificTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.toLocaleString("en-US", { timeZone: PT, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} PT`;
}
