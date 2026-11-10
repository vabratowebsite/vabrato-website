import { listingPath } from "@/lib/format";
import { openHouseIcs } from "@/lib/ics";
import { absoluteUrl } from "@/lib/seo";
import { addressParts, loadListing } from "../../listing-data";

// "Add to calendar" (.ics) for one open house. Hidden addresses give the city
// only as the location (review item 7).
export const revalidate = 900;

export async function GET(_req: Request, { params }: { params: Promise<{ key: string; oh: string }> }) {
  const { key, oh } = await params;
  const listing = await loadListing(decodeURIComponent(key));
  const openHouse = listing?.mls_open_houses.find((o) => o.open_house_key === decodeURIComponent(oh));
  if (!listing || !openHouse?.start_time) return new Response("Not found", { status: 404 });
  const parts = addressParts(listing);
  const body = openHouseIcs({
    listing: parts,
    openHouseKey: openHouse.open_house_key,
    start: openHouse.start_time,
    end: openHouse.end_time,
    url: absoluteUrl(listingPath(parts)),
  });
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="open-house-${listing.listing_key.replace(/[^A-Za-z0-9-]/g, "")}.ics"`,
    },
  });
}
