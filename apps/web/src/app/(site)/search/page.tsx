import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@vabrato/ui/web";
import { MlsAttribution } from "@/components/MlsAttribution";
import { SearchFilterBar } from "@/components/search/SearchFilterBar";
import { SearchMap } from "@/components/search/SearchMap";
import { Pagination, ResultsGrid, SoldMembersBanner } from "@/components/search/results";
import { formatPacificTime } from "@/lib/format";
import { mapPins } from "@/lib/map-pins";
import { listCities, mlsLastUpdated, searchListings } from "@/lib/public/listings";
import { PAGE_SIZE, parseSearchParams, toQueryString, type SearchFilters, type Tab } from "@/lib/search-params";
import { pageMetadata } from "@/lib/seo";

// Map + list search (mockup 02). IDX for-sale listings only; the Sold tab is
// for members (MLS-6) and fetches nothing sold.

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const filters = parseSearchParams(await searchParams);
  const qs = toQueryString({ ...filters, bbox: undefined });
  return pageMetadata({
    title: "Homes for sale in San Mateo and Santa Clara Counties | Vabrato",
    description: "Search homes for sale across San Mateo and Santa Clara Counties, with open houses and listing details.",
    path: `/search${qs ? `?${qs}` : ""}`,
  });
}

const TABS: { tab: Tab; label: string }[] = [
  { tab: "for-sale", label: "For sale" },
  { tab: "sold", label: "Sold" },
  { tab: "open-houses", label: "Open houses" },
];

export default async function SearchPage({ searchParams }: Props) {
  const filters = parseSearchParams(await searchParams);
  const [cities, results, lastUpdated] = await Promise.all([listCities(), searchListings(filters), mlsLastUpdated()]);
  const href = (f: Partial<SearchFilters>) => {
    const qs = toQueryString({ ...filters, page: 1, ...f });
    return `/search${qs ? `?${qs}` : ""}`;
  };
  const chosen = cities.filter((c) => filters.city.includes(c.slug)).map((c) => c.name);
  const heading = chosen.length === 0 ? "Homes for sale" : chosen.length === 1 ? `${chosen[0]} & nearby` : chosen.slice(0, 3).join(", ");
  const pins = mapPins(results.rows);
  const showMap = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN) && filters.tab !== "sold";

  return (
    <>
      <div className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-site flex-wrap items-end justify-between gap-4 px-4 py-4 md:px-6">
          <div className="flex flex-wrap items-end gap-4">
            <nav aria-label="Listing type">
              <ul className="flex border border-navy">
                {TABS.map((t) => (
                  <li key={t.tab}>
                    <a
                      href={href({ tab: t.tab })}
                      aria-current={filters.tab === t.tab ? "page" : undefined}
                      className={`flex min-h-[44px] items-center px-4 font-body text-[12px] font-medium uppercase tracking-label ${filters.tab === t.tab ? "bg-navy text-white" : "text-navy hover:bg-navy-50"}`}
                    >
                      {t.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <SearchFilterBar filters={filters} cities={cities} />
          </div>
          <Button href="/join" variant="navy" underline={false}>
            Save search
          </Button>
        </div>
      </div>

      <div className={`mx-auto max-w-site ${showMap ? "grid lg:grid-cols-2" : ""}`}>
        {showMap && (
          <Suspense fallback={null}>
            <SearchMap pins={pins} />
          </Suspense>
        )}
        <section id="results" aria-labelledby="results-heading" className="space-y-6 px-4 py-8 md:px-6">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h1 id="results-heading" className="font-display text-display-md uppercase text-navy">
                {heading}
              </h1>
              <p className="font-body text-body-sm text-muted" aria-live="polite">
                {filters.tab === "sold"
                  ? "Sold homes are shown to members."
                  : `${results.total} ${filters.tab === "open-houses" ? "homes with open houses" : results.total === 1 ? "home for sale" : "homes for sale"}`}
                {lastUpdated ? ` · updated ${formatPacificTime(lastUpdated)}` : ""}
              </p>
            </div>
          </header>

          {filters.tab === "sold" ? <SoldMembersBanner /> : <ResultsGrid rows={results.rows} headingLevel="h2" />}
          {filters.tab !== "sold" && <SoldMembersBanner />}

          <Pagination page={filters.page} total={results.total} pageSize={PAGE_SIZE} hrefFor={(p) => href({ page: p })} />
          <MlsAttribution lastUpdated={lastUpdated} />
        </section>
      </div>
    </>
  );
}
