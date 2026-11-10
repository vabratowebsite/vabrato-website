import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ListingDetail } from "@/components/listings/ListingDetail";
import { formatPrice, listingPath, listingSlug, listingTitle, slugify } from "@/lib/format";
import { SITE_URL } from "@/lib/org";
import { getListing, mlsLastUpdated } from "@/lib/public/listings";
import { pageMetadata } from "@/lib/seo";
import { addressParts } from "@/app/(site)/listing/[key]/listing-data";

// Listing on homes.sancarloslife.com: San Carlos listings only, same detail
// as vabrato.com, canonical pointing at the vabrato.com URL (review item 1).
export const revalidate = 900;

type Params = { params: Promise<{ key: string; slug: string }> };

async function load(key: string) {
  const listing = await getListing(decodeURIComponent(key));
  return listing && slugify(listing.city ?? "") === "san-carlos" ? listing : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const listing = await load((await params).key);
  if (!listing) return { title: "Listing not found" };
  const parts = addressParts(listing);
  return pageMetadata({
    title: `${listingTitle(parts)} | ${formatPrice(listing.list_price)} | San Carlos homes`,
    description: `Home for sale in San Carlos, CA. Listed at ${formatPrice(listing.list_price)}.`,
    path: listingPath(parts),
    canonical: `${SITE_URL}${listingPath(parts)}`,
  });
}

export default async function SclListingPage({ params }: Params) {
  const { key, slug } = await params;
  const listing = await load(key);
  if (!listing) notFound();
  const parts = addressParts(listing);
  if (slug !== listingSlug(parts)) permanentRedirect(listingPath(parts));
  return <ListingDetail listing={listing} parts={parts} lastUpdated={await mlsLastUpdated()} site="sancarloslife" linkBase={SITE_URL} />;
}
