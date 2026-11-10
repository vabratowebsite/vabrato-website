import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ListingDetail } from "@/components/listings/ListingDetail";
import { cityLine, formatPrice, listingPath, listingSlug, listingTitle, typeLine } from "@/lib/format";
import { mlsLastUpdated } from "@/lib/public/listings";
import { pageMetadata } from "@/lib/seo";
import { addressParts, loadListing } from "../listing-data";

// Listing detail (mockup 03). IDX data only. A listing that is no longer in
// the feed or no longer public returns 404, never a cached copy (review
// item 6: data revalidates within 15 minutes or by tag from the sync job).
export const revalidate = 900;

type Params = { params: Promise<{ key: string; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { key } = await params;
  const listing = await loadListing(decodeURIComponent(key));
  if (!listing) return { title: "Listing not found | Vabrato" };
  const parts = addressParts(listing);
  const title = listingTitle(parts);
  return pageMetadata({
    title: `${title}${parts.address_display ? `, ${listing.city}` : ""} | ${formatPrice(listing.list_price)} | Vabrato`,
    description: `${typeLine(listing)} for sale in ${cityLine(parts)}. Listed at ${formatPrice(listing.list_price)}.`,
    path: listingPath(parts),
  });
}

export default async function ListingPage({ params }: Params) {
  const { key, slug } = await params;
  const listing = await loadListing(decodeURIComponent(key));
  if (!listing) notFound();
  const parts = addressParts(listing);
  if (slug !== listingSlug(parts)) permanentRedirect(listingPath(parts));
  const lastUpdated = await mlsLastUpdated();
  return <ListingDetail listing={listing} parts={parts} lastUpdated={lastUpdated} />;
}
