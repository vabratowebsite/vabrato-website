import { ListingCard, SectionTitle } from "@vabrato/ui/web";
import { JsonLd } from "@/components/JsonLd";
import { MlsAttribution } from "@/components/MlsAttribution";
import { listingTitle } from "@/lib/format";
import { openHouseShort, pacificDay, toCardProps } from "@/lib/listing-view";
import { mlsLastUpdated, searchListings } from "@/lib/public/listings";
import { DEFAULT_FILTERS } from "@/lib/search-params";
import { openHouseJsonLd, pageMetadata } from "@/lib/seo";
import { listingPath } from "@/lib/format";

export const revalidate = 900;

export const metadata = pageMetadata({
  title: "Open houses in San Mateo and Santa Clara Counties | Vabrato",
  description: "Upcoming public open houses across San Mateo and Santa Clara Counties, by day.",
  path: "/open-houses",
});

export default async function OpenHousesPage() {
  const [{ rows }, lastUpdated] = await Promise.all([
    searchListings({ ...DEFAULT_FILTERS, tab: "open-houses", sort: "open_house" }, { pageSize: 100 }),
    mlsLastUpdated(),
  ]);
  const days = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.next_open_house_start) continue;
    const day = pacificDay(r.next_open_house_start);
    days.set(day, [...(days.get(day) ?? []), r]);
  }
  return (
    <div className="mx-auto max-w-site space-y-10 px-4 py-10 md:px-6">
      <SectionTitle as="h1" title="Open houses" eyebrow="This week and beyond" action={{ label: "Search all homes", href: "/search" }} />
      {days.size === 0 && <p className="font-body text-body text-ink">No public open houses are scheduled right now. Check back soon, or request a private tour from any listing.</p>}
      {[...days.entries()].map(([day, list]) => (
        <section key={day} aria-labelledby={`d-${day}`}>
          <h2 id={`d-${day}`} className="mb-4 font-subhead text-subhead-lg text-ink">
            {new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((r) => (
              <li key={r.listing_key}>
                <ListingCard {...toCardProps(r)} badges={["open"]} badgeText={{ open: openHouseShort(r.next_open_house_start!, r.next_open_house_end) }} />
                <JsonLd data={openHouseJsonLd(r, { start: r.next_open_house_start!, end: r.next_open_house_end }, listingPath(r))} />
                <span className="sr-only">{listingTitle(r)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <MlsAttribution lastUpdated={lastUpdated} />
    </div>
  );
}
