import { SectionTitle } from "@vabrato/ui/web";
import { JsonLd } from "@/components/JsonLd";
import { listCities } from "@/lib/public/listings";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

// Neighborhoods hub: every city in both counties (SPEC <service_area>).
// /explore redirects here (next.config.ts).
export const revalidate = 900;

export const metadata = pageMetadata({
  title: "Neighborhoods in San Mateo and Santa Clara Counties | Vabrato",
  description: "Homes for sale, open houses and local guides for every city in San Mateo and Santa Clara Counties.",
  path: "/neighborhoods",
});

export default async function NeighborhoodsPage() {
  const cities = await listCities();
  return (
    <div className="mx-auto max-w-site space-y-12 px-4 py-12 md:px-6">
      <SectionTitle as="h1" title="Neighborhoods" eyebrow="San Mateo and Santa Clara Counties" action={{ label: "Search all homes", href: "/search" }} />
      {["San Mateo", "Santa Clara"].map((county) => (
        <section key={county} aria-labelledby={`c-${county}`}>
          <h2 id={`c-${county}`} className="mb-4 font-subhead text-subhead-lg text-ink">
            {county} County
          </h2>
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
            {cities
              .filter((c) => c.county === county)
              .map((c) => (
                <li key={c.slug}>
                  <a href={`/neighborhoods/${c.slug}`} className="inline-flex min-h-[44px] items-center font-body text-body text-navy underline-offset-4 hover:underline">
                    {c.name}
                    {c.kind === "unincorporated" ? <span className="ml-2 text-caption text-muted">(unincorporated)</span> : null}
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Neighborhoods", path: "/neighborhoods" }])} />
    </div>
  );
}
