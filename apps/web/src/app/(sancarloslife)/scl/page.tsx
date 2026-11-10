import { SectionTitle } from "@vabrato/ui/web";
import { ConnectBand } from "@/components/home/ConnectBand";
import { MlsAttribution } from "@/components/MlsAttribution";
import { ResultsGrid } from "@/components/search/results";
import { SITE_URL } from "@/lib/org";
import { mlsLastUpdated, searchListings } from "@/lib/public/listings";
import { DEFAULT_FILTERS, parseSearchParams } from "@/lib/search-params";
import { pageMetadata } from "@/lib/seo";

// homes.sancarloslife.com home: San Carlos IDX listings only. Canonical to the
// vabrato.com San Carlos page so the two sites don't compete.
export const revalidate = 900;

export const metadata = pageMetadata({
  title: "San Carlos homes for sale | Vabrato Real Estate Services",
  description: "Homes for sale and open houses in San Carlos, CA, from Vabrato Real Estate Services.",
  path: "/",
  canonical: `${SITE_URL}/neighborhoods/san-carlos`,
});

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SclHome({ searchParams }: Props) {
  const requested = parseSearchParams(await searchParams);
  // City is fixed to San Carlos whatever the URL says.
  const filters = { ...DEFAULT_FILTERS, sort: requested.sort, page: requested.page, city: ["san-carlos"] };
  const [forSale, openHouses, lastUpdated] = await Promise.all([
    searchListings(filters, { pageSize: 24 }),
    searchListings({ ...filters, tab: "open-houses" }, { pageSize: 6 }),
    mlsLastUpdated(),
  ]);
  return (
    <>
      <div className="mx-auto max-w-site space-y-12 px-4 py-10 md:px-6">
        <SectionTitle as="h1" title="San Carlos homes for sale" eyebrow="Presented with San Carlos Life" />
        <ResultsGrid rows={forSale.rows} headingLevel="h2" />
        {openHouses.rows.length > 0 && (
          <section aria-labelledby="oh">
            <h2 id="oh" className="mb-4 font-subhead text-subhead-lg text-ink">
              Upcoming open houses
            </h2>
            <ResultsGrid rows={openHouses.rows} />
          </section>
        )}
        <MlsAttribution lastUpdated={lastUpdated} />
      </div>
      <ConnectBand site="sancarloslife" />
    </>
  );
}
