import { cache } from "react";
import { getListing } from "@/lib/public/listings";

/** One query per request for metadata + page. */
export const loadListing = cache((key: string) => getListing(key));

export function addressParts(l: NonNullable<Awaited<ReturnType<typeof getListing>>>) {
  const d = l.data;
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const street = l.address_display
    ? [s(d.StreetNumber), s(d.StreetName), s(d.StreetSuffix), s(d.UnitNumber) ? `#${s(d.UnitNumber)}` : null].filter(Boolean).join(" ") ||
      s(d.UnparsedAddress)?.split(",")[0] ||
      null
    : null;
  return { listing_key: l.listing_key, street, city: l.city, postal_code: l.postal_code, address_display: l.address_display };
}
