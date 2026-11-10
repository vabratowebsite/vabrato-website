import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { BreadcrumbBar, Button } from "@vabrato/ui/web";
import { JsonLd } from "@/components/JsonLd";
import { MlsAttribution } from "@/components/MlsAttribution";
import { FactsRow, LockedHistory, ListingGallery, ListingQa, PropertyDetails, StatusPills } from "@/components/listings/detail";
import { PaymentEstimate } from "@/components/listings/PaymentEstimate";
import { TourRequest } from "@/components/listings/TourRequest";
import { cityLine, formatPrice, listingPath, listingSlug, listingTitle, propertyTypeLabel, slugify, typeLine } from "@/lib/format";
import { listingQa } from "@/lib/listing-qa";
import { openHouseLong } from "@/lib/listing-view";
import { monthlyHoa } from "@/lib/payment";
import { resolveListingPhoto } from "@/lib/photos";
import { mlsLastUpdated } from "@/lib/public/listings";
import { breadcrumbJsonLd, listingJsonLd, openHouseJsonLd, pageMetadata } from "@/lib/seo";
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
  const where = cityLine(parts);
  return pageMetadata({
    title: `${title}${parts.address_display ? `, ${listing.city}` : ""} | ${formatPrice(listing.list_price)} | Vabrato`,
    description: `${typeLine(listing)} for sale in ${where}. Listed at ${formatPrice(listing.list_price)}.`,
    path: listingPath(parts),
  });
}

export default async function ListingPage({ params }: Params) {
  const { key, slug } = await params;
  const listing = await loadListing(decodeURIComponent(key));
  if (!listing) notFound();
  const parts = addressParts(listing);
  const path = listingPath(parts);
  if (slug !== listingSlug(parts)) permanentRedirect(path);

  const title = listingTitle(parts);
  const lastUpdated = await mlsLastUpdated();
  const photos = listing.mls_media.map((m) => resolveListingPhoto(m)?.src).filter((s): s is string => Boolean(s));
  const hoa = monthlyHoa(listing.data.AssociationFee, listing.data.AssociationFeeFrequency);
  const qa = listingQa({ ...parts, list_price: listing.list_price, list_office_name: listing.list_office_name, is_own_listing: listing.is_own_listing, data: listing.data, open_houses: listing.mls_open_houses });
  const crumbs = [
    { label: "Home", href: "/" },
    { label: "Properties", href: "/search" },
    ...(listing.city ? [{ label: listing.city, href: `/neighborhoods/${slugify(listing.city)}` }] : []),
    { label: title },
  ];
  const remarks = typeof listing.data.PublicRemarks === "string" ? listing.data.PublicRemarks : null;

  return (
    <>
      <BreadcrumbBar items={crumbs} />
      <ListingGallery listing={listing} title={title} />

      <div className="mx-auto grid max-w-site gap-10 px-4 py-10 md:px-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-10">
          <header className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-3">
              <StatusPills listing={listing} />
              <h1 className="font-display text-display-md uppercase text-navy md:text-display-lg">{title}</h1>
              <p className="font-subhead text-subhead-md text-muted">{cityLine(parts)}</p>
            </div>
            <div className="text-right">
              <p className="font-subhead text-[40px] leading-none text-ink">{formatPrice(listing.list_price)}</p>
              <p className="mt-2 font-body text-caption text-muted">
                <a href="#payment" className="underline">
                  Estimate monthly payment
                </a>
              </p>
              <div className="mt-4 flex justify-end gap-3">
                <Button href="/join" size="sm" underline={false}>
                  Save
                </Button>
              </div>
            </div>
          </header>

          <FactsRow listing={listing} />

          {remarks && (
            <section aria-labelledby="about-heading">
              <h2 id="about-heading" className="font-subhead text-subhead-lg text-ink">
                About this home
              </h2>
              <p className="mt-3 max-w-prose font-body text-body text-ink">{remarks}</p>
            </section>
          )}

          <section aria-labelledby="oh-heading">
            <h2 id="oh-heading" className="font-subhead text-subhead-lg text-ink">
              Open houses
            </h2>
            {listing.mls_open_houses.length ? (
              <ul className="mt-4 flex flex-wrap gap-3">
                {listing.mls_open_houses
                  .filter((o) => o.start_time)
                  .map((o) => (
                    <li key={o.open_house_key} className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex min-h-[44px] items-center border border-ink px-5 font-body text-[12px] font-medium uppercase tracking-label text-ink">
                        {openHouseLong(o.start_time!, o.end_time)}
                      </span>
                      <a
                        href={`/listing/${encodeURIComponent(listing.listing_key)}/open-house/${encodeURIComponent(o.open_house_key)}`}
                        className="inline-flex min-h-[44px] items-center bg-navy px-5 font-body text-[12px] font-medium uppercase tracking-label text-white hover:bg-navy-deep"
                      >
                        + Add to calendar<span className="sr-only">: {openHouseLong(o.start_time!, o.end_time)}</span>
                      </a>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-3 font-body text-body-sm text-muted">No open houses are scheduled. Request a private tour instead.</p>
            )}
          </section>

          <section aria-labelledby="details-heading">
            <h2 id="details-heading" className="mb-2 font-subhead text-subhead-lg text-ink">
              Property details
            </h2>
            <PropertyDetails listing={listing} typeLabel={propertyTypeLabel(listing.property_sub_type)} />
          </section>

          <LockedHistory />
          <ListingQa items={qa} />
        </div>

        <aside className="space-y-6" aria-label="Contact and estimates">
          <TourRequest
            listingKey={listing.listing_key}
            agentName={listing.is_own_listing && listing.list_agent_full_name ? listing.list_agent_full_name : "Mark Martinho"}
            agentTitle={listing.is_own_listing ? "Vabrato Real Estate Services" : "Designated Broker, Vabrato"}
          />
          {listing.list_price ? (
            <div id="payment">
              <PaymentEstimate price={listing.list_price} hoaPerMonth={hoa} />
            </div>
          ) : null}
          <section aria-labelledby="sell-heading" className="border border-line p-6">
            <p className="font-body text-label uppercase tracking-label text-muted">Thinking of selling nearby?</p>
            <h2 id="sell-heading" className="mt-2 font-subhead text-subhead-md text-ink">
              See what your home is worth
            </h2>
            <Button href="/sell" className="mt-4 w-full">
              Get a home valuation
            </Button>
          </section>
        </aside>
      </div>

      <div className="mx-auto max-w-site px-4 pb-12 md:px-6">
        <MlsAttribution lastUpdated={lastUpdated} />
      </div>

      <JsonLd
        data={listingJsonLd(
          {
            ...parts,
            list_price: listing.list_price,
            standard_status: listing.standard_status,
            bedrooms_total: listing.bedrooms_total,
            living_area: listing.living_area,
            latitude: listing.latitude,
            longitude: listing.longitude,
            on_market_date: typeof listing.data.OnMarketDate === "string" ? listing.data.OnMarketDate : null,
            photos,
          },
          path,
        )}
      />
      <JsonLd data={breadcrumbJsonLd(crumbs.map((c) => ({ name: c.label, path: c.href ?? path })))} />
      {listing.mls_open_houses
        .filter((o) => o.start_time)
        .map((o) => (
          <JsonLd key={o.open_house_key} data={openHouseJsonLd(parts, { start: o.start_time!, end: o.end_time }, path)} />
        ))}
    </>
  );
}
