import { BreadcrumbBar, Button } from "@vabrato/ui/web";
import { JsonLd } from "@/components/JsonLd";
import { MlsAttribution } from "@/components/MlsAttribution";
import { cityLine, formatPrice, listingPath, listingTitle, propertyTypeLabel, slugify, type AddressParts } from "@/lib/format";
import { listingQa } from "@/lib/listing-qa";
import { openHouseLong } from "@/lib/listing-view";
import { monthlyHoa } from "@/lib/payment";
import { resolveListingPhoto } from "@/lib/photos";
import type { Listing } from "@/lib/public/listings";
import { breadcrumbJsonLd, listingJsonLd, openHouseJsonLd } from "@/lib/seo";
import { ListingViewBeacon } from "@/member/components/ListingViewBeacon";
import { PriceHistory } from "@/member/components/PriceHistory";
import { SaveHomeButton } from "@/member/components/SaveIslands";
import { AskAboutHomeLink } from "@/member/components/AskAboutHomeLink";
import { FactsRow, LockedHistory, ListingGallery, ListingQa, PropertyDetails, StatusPills } from "./detail";
import { PaymentEstimate } from "./PaymentEstimate";
import { TourRequest } from "./TourRequest";

// Listing detail body (mockup 03), shared by vabrato.com and
// homes.sancarloslife.com. `linkBase` prefixes links to pages that exist only
// on vabrato.com ("" there, the vabrato.com origin on the SCL host).

export function ListingDetail({
  listing,
  parts,
  lastUpdated,
  site = "vabrato",
  linkBase = "",
}: {
  listing: Listing;
  parts: AddressParts;
  lastUpdated: string | null;
  site?: "vabrato" | "sancarloslife";
  linkBase?: string;
}) {
  const path = listingPath(parts);
  const title = listingTitle(parts);
  const photos = listing.mls_media.map((m) => resolveListingPhoto(m)?.src).filter((s): s is string => Boolean(s));
  const hoa = monthlyHoa(listing.data.AssociationFee, listing.data.AssociationFeeFrequency);
  const qa = listingQa({ ...parts, list_price: listing.list_price, list_office_name: listing.list_office_name, is_own_listing: listing.is_own_listing, data: listing.data, open_houses: listing.mls_open_houses });
  const crumbs =
    site === "vabrato"
      ? [
          { label: "Home", href: "/" },
          { label: "Properties", href: "/search" },
          ...(listing.city ? [{ label: listing.city, href: `/neighborhoods/${slugify(listing.city)}` }] : []),
          { label: title },
        ]
      : [{ label: "San Carlos homes", href: "/" }, { label: title }];
  const remarks = typeof listing.data.PublicRemarks === "string" ? listing.data.PublicRemarks : null;
  const upcoming = listing.mls_open_houses.filter((o) => o.start_time);

  return (
    <>
      {site === "vabrato" && listing.is_own_listing && <ListingViewBeacon listingKey={listing.listing_key} />}
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
                {site === "vabrato" ? (
                  <SaveHomeButton listingKey={listing.listing_key} address={title} />
                ) : (
                  <Button href={`${linkBase}/join`} size="sm" underline={false}>
                    Save
                  </Button>
                )}
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
            {upcoming.length ? (
              <ul className="mt-4 flex flex-wrap gap-3">
                {upcoming.map((o) => (
                  <li key={o.open_house_key} className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex min-h-[44px] items-center border border-ink px-5 font-body text-[12px] font-medium uppercase tracking-label text-ink">
                      {openHouseLong(o.start_time!, o.end_time)}
                    </span>
                    <a
                      href={`${linkBase}/listing/${encodeURIComponent(listing.listing_key)}/open-house/${encodeURIComponent(o.open_house_key)}`}
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

          {site === "vabrato" ? <PriceHistory listingKey={listing.listing_key} /> : <LockedHistory joinHref={`${linkBase}/join`} />}
          <ListingQa items={qa} />
          {/* S5b PR 4: signed-in buyers only, while "Ask about a home" is on; it links into /my. */}
          {site === "vabrato" && <AskAboutHomeLink listingKey={listing.listing_key} address={title} />}
        </div>

        <aside className="space-y-6" aria-label="Contact and estimates">
          <TourRequest
            listingKey={listing.listing_key}
            site={site}
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
            <Button href={`${linkBase}/sell`} className="mt-4 w-full">
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
      {site === "vabrato" && <JsonLd data={breadcrumbJsonLd(crumbs.map((c) => ({ name: c.label, path: c.href ?? path })))} />}
      {upcoming.map((o) => (
        <JsonLd key={o.open_house_key} data={openHouseJsonLd(parts, { start: o.start_time!, end: o.end_time }, path)} />
      ))}
    </>
  );
}
