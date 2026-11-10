import { SectionTitle, SoldTile } from "@vabrato/ui/web";
import { MlsAttribution } from "@/components/MlsAttribution";
import { ResultsGrid } from "@/components/search/results";
import { cityLine, formatPrice } from "@/lib/format";
import { flagEnabled, mlsLastUpdated, ownSoldListings, searchListings } from "@/lib/public/listings";
import { DEFAULT_FILTERS } from "@/lib/search-params";
import { pageMetadata } from "@/lib/seo";

// Our office's listings (SPEC G1 Properties). For sale for everyone; sold
// only once `public_sold` is on (MLS-10), from public_own_sold().
export const revalidate = 900;

export const metadata = pageMetadata({
  title: "Vabrato listings | Homes for sale by Vabrato Real Estate Services",
  description: "Homes listed by Vabrato Real Estate Services in San Mateo and Santa Clara Counties.",
  path: "/properties",
});

export default async function PropertiesPage() {
  const [forSale, showSold, lastUpdated] = await Promise.all([
    searchListings(DEFAULT_FILTERS, { pageSize: 100, ownOnly: true }),
    flagEnabled("public_sold"),
    mlsLastUpdated(),
  ]);
  const sold = showSold ? await ownSoldListings(12) : [];
  return (
    <div className="mx-auto max-w-site space-y-12 px-4 py-10 md:px-6">
      <section aria-labelledby="for-sale">
        <SectionTitle as="h1" title="Our listings" eyebrow="Vabrato Real Estate Services" action={{ label: "Search all homes", href: "/search" }} />
        <h2 id="for-sale" className="sr-only">
          For sale
        </h2>
        <ResultsGrid rows={forSale.rows} />
      </section>
      {sold.length > 0 && (
        <section aria-labelledby="sold">
          <SectionTitle title="Sold properties" />
          <h2 id="sold" className="sr-only">
            Sold
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {sold.map((s) => (
              <li key={s.listing_key}>
                <SoldTile
                  address={s.street ?? `Home in ${s.city ?? "the area"}`}
                  detail={`${cityLine(s)} · Sold ${formatPrice(s.close_price)}`}
                  href={`/search?city=${encodeURIComponent((s.city ?? "").toLowerCase().replace(/\s+/g, "-"))}`}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      <MlsAttribution lastUpdated={lastUpdated} />
    </div>
  );
}
