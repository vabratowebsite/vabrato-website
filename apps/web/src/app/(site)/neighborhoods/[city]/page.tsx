import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BreadcrumbBar, Button, FAQAccordion, SectionTitle } from "@vabrato/ui/web";
import { JsonLd } from "@/components/JsonLd";
import { MlsAttribution } from "@/components/MlsAttribution";
import { ResultsGrid } from "@/components/search/results";
import { cityFaq } from "@/lib/city-faq";
import { cityGuide } from "@/lib/public/content";
import { flagEnabled, listCities, mlsLastUpdated, searchListings } from "@/lib/public/listings";
import { officialSchoolLinks } from "@/lib/schools";
import { DEFAULT_FILTERS } from "@/lib/search-params";
import { breadcrumbJsonLd, faqJsonLd, pageMetadata, placeJsonLd } from "@/lib/seo";

// City page (SPEC <service_area>): live IDX listings, new this week, upcoming
// open houses, nearby cities and a FAQ, so pages without a guide aren't thin.
// Priority cities add a hand-written guide. Market stats stay hidden until
// `public_stats` is on (MLS-10).
export const revalidate = 900;

type Props = { params: Promise<{ city: string }> };

const loadCity = cache(async (slug: string) => {
  const cities = await listCities();
  const city = cities.find((c) => c.slug === slug);
  return city ? { city, cities } : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await loadCity((await params).city);
  if (!found) return { title: "City not found | Vabrato" };
  const { city } = found;
  return pageMetadata({
    title: `${city.name}, CA homes for sale and open houses | Vabrato`,
    description: `Homes for sale, open houses and local information for ${city.name} in ${city.county} County.`,
    path: `/neighborhoods/${city.slug}`,
  });
}

const NEW_DAYS = 7;

export default async function CityPage({ params }: Props) {
  const found = await loadCity((await params).city);
  if (!found) notFound();
  const { city, cities } = found;
  const filters = { ...DEFAULT_FILTERS, city: [city.slug] };
  const [listings, openHouses, guide, showStats, lastUpdated] = await Promise.all([
    searchListings(filters, { pageSize: 12 }),
    searchListings({ ...filters, tab: "open-houses" }, { pageSize: 6 }),
    cityGuide(city.slug),
    flagEnabled("public_stats"),
    mlsLastUpdated(),
  ]);
  const newThisWeek = listings.rows.filter((r) => r.on_market_date && Date.now() - Date.parse(r.on_market_date) <= NEW_DAYS * 86_400_000);
  const nearby = cities.filter((c) => c.county === city.county && c.slug !== city.slug).slice(0, 8);
  const faq = guide?.faq.length ? guide.faq : cityFaq(city);
  const schools = officialSchoolLinks(guide?.school_links ?? []);
  const path = `/neighborhoods/${city.slug}`;
  const crumbs = [
    { label: "Home", href: "/" },
    { label: "Neighborhoods", href: "/neighborhoods" },
    { label: city.name },
  ];

  return (
    <>
      <BreadcrumbBar items={crumbs} />
      <div className="mx-auto max-w-site space-y-14 px-4 py-10 md:px-6">
        <header className="space-y-4">
          <p className="font-body text-label uppercase tracking-label text-gold-ink">{city.county} County</p>
          <h1 className="font-display text-display-lg uppercase text-navy">{city.name}</h1>
          {guide?.intro && <p className="max-w-prose font-body text-body-lg text-ink">{guide.intro}</p>}
          <div className="flex flex-wrap gap-3">
            <Button href={`/search?city=${city.slug}`} variant="navy" underline={false}>
              Search {city.name} homes
            </Button>
            <Button href="/sell">What&apos;s my home worth?</Button>
          </div>
        </header>

        <section aria-labelledby="for-sale">
          <SectionTitle title={`Homes for sale in ${city.name}`} action={{ label: "See all", href: `/search?city=${city.slug}` }} />
          <h2 id="for-sale" className="sr-only">
            Homes for sale in {city.name}
          </h2>
          <ResultsGrid rows={listings.rows} />
        </section>

        {newThisWeek.length > 0 && (
          <section aria-labelledby="new-week">
            <h2 id="new-week" className="mb-4 font-subhead text-subhead-lg text-ink">
              New this week
            </h2>
            <ResultsGrid rows={newThisWeek} />
          </section>
        )}

        {openHouses.rows.length > 0 && (
          <section aria-labelledby="oh">
            <h2 id="oh" className="mb-4 font-subhead text-subhead-lg text-ink">
              Upcoming open houses
            </h2>
            <ResultsGrid rows={openHouses.rows} />
          </section>
        )}

        {showStats && (
          <section aria-labelledby="stats">
            <h2 id="stats" className="font-subhead text-subhead-lg text-ink">
              {city.name} market
            </h2>
            <p className="font-body text-body-sm text-muted">Market statistics are being prepared.</p>
          </section>
        )}

        {guide && guide.neighborhoods.length > 0 && (
          <section aria-labelledby="hoods">
            <h2 id="hoods" className="mb-4 font-subhead text-subhead-lg text-ink">
              Neighborhoods in {city.name}
            </h2>
            <ul className="grid gap-6 md:grid-cols-2">
              {guide.neighborhoods.map((n) => (
                <li key={n.name}>
                  <h3 className="font-subhead text-subhead-md text-ink">{n.name}</h3>
                  <p className="font-body text-body-sm text-ink">{n.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {schools.length > 0 && (
          <section aria-labelledby="schools">
            <h2 id="schools" className="mb-2 font-subhead text-subhead-lg text-ink">
              Schools
            </h2>
            <p className="mb-3 font-body text-body-sm text-muted">Official district websites. Confirm boundaries for a specific address with the district.</p>
            <ul className="space-y-2">
              {schools.map((s) => (
                <li key={s.url}>
                  <a href={s.url} rel="noopener" className="font-body text-body text-navy underline">
                    {s.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="faq" className="grid gap-8 md:grid-cols-[1fr_2fr]">
          <h2 id="faq" className="font-display text-display-sm uppercase text-navy">
            {city.name} questions
          </h2>
          <FAQAccordion items={faq.map((f) => ({ question: f.q, answer: f.a }))} jsonLd={false} />
        </section>

        <nav aria-labelledby="nearby">
          <h2 id="nearby" className="mb-3 font-subhead text-subhead-md text-ink">
            Nearby in {city.county} County
          </h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {nearby.map((c) => (
              <li key={c.slug}>
                <a href={`/neighborhoods/${c.slug}`} className="inline-flex min-h-[44px] items-center font-body text-body-sm text-navy underline">
                  {c.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <MlsAttribution lastUpdated={lastUpdated} />
      </div>
      <JsonLd data={placeJsonLd(city, path)} />
      <JsonLd data={breadcrumbJsonLd(crumbs.map((c) => ({ name: c.label, path: c.href ?? path })))} />
      <JsonLd data={faqJsonLd(faq)} />
    </>
  );
}
