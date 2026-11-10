import { formatShortPrice, listingPath, listingTitle } from "./format";
import type { SearchRow } from "./public/listings";

// Map pins for the current results. Listings whose address may not be shown
// have no coordinates and get no pin (MLS-3).

export interface MapPin {
  key: string;
  lng: number;
  lat: number;
  label: string;
  title: string;
  href: string;
  ours: boolean;
}

export function mapPins(rows: SearchRow[]): MapPin[] {
  return rows.flatMap((r) =>
    r.address_display && r.latitude !== null && r.longitude !== null
      ? [{ key: r.listing_key, lng: r.longitude, lat: r.latitude, label: formatShortPrice(r.list_price), title: listingTitle(r), href: listingPath(r), ours: r.is_own_listing }]
      : [],
  );
}

/** Bounds that fit every pin, padded; null when there are none. */
export function pinBounds(pins: MapPin[], pad = 0.01): [[number, number], [number, number]] | null {
  if (!pins.length) return null;
  const lngs = pins.map((p) => p.lng);
  const lats = pins.map((p) => p.lat);
  return [
    [Math.min(...lngs) - pad, Math.min(...lats) - pad],
    [Math.max(...lngs) + pad, Math.max(...lats) + pad],
  ];
}
