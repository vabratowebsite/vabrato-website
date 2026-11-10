import { notFound, permanentRedirect } from "next/navigation";
import { listingPath } from "@/lib/format";
import { addressParts, loadListing } from "./listing-data";

// /listing/{key} without a slug: send to the canonical URL.
export default async function ListingKeyOnly({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const listing = await loadListing(decodeURIComponent(key));
  if (!listing) notFound();
  permanentRedirect(listingPath(addressParts(listing)));
}
