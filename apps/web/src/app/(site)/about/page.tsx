import { ListingPhotoPlaceholder, SectionTitle } from "@vabrato/ui/web";
import { JsonLd } from "@/components/JsonLd";
import { listAgents } from "@/lib/public/content";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const revalidate = 900;

export const metadata = pageMetadata({
  title: "About Vabrato Real Estate Services | Our team",
  description: "Meet the brokers of Vabrato Real Estate Services in San Carlos, CA.",
  path: "/about",
});

export default async function AboutPage() {
  const agents = await listAgents();
  return (
    <div className="mx-auto max-w-site space-y-12 px-4 py-12 md:px-6">
      <SectionTitle as="h1" title="About Vabrato" eyebrow="Real estate, built by people who build" action={{ label: "Contact us", href: "/contact" }} />
      <p className="max-w-prose font-body text-body-lg text-ink">PLACEHOLDER: Vabrato story and values from today&apos;s vabrato.com (content checklist).</p>
      <section aria-labelledby="team-heading">
        <h2 id="team-heading" className="mb-6 font-subhead text-subhead-lg text-ink">
          Our team
        </h2>
        {agents.length === 0 ? (
          <p className="font-body text-body text-muted">Team profiles are coming soon.</p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => (
              <li key={a.slug}>
                <a href={`/team/${a.slug}`} className="group block">
                  <div className="aspect-[4/5] overflow-hidden bg-soft">
                    <ListingPhotoPlaceholder tint="steel" label={`${a.display_name} photo (placeholder)`} />
                  </div>
                  <p className="mt-3 font-subhead text-subhead-md text-ink group-hover:underline">{a.display_name}</p>
                  <p className="font-body text-body-sm text-muted">
                    {a.title}
                    {a.license_number ? ` · DRE #${a.license_number}` : ""}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "About", path: "/about" }])} />
    </div>
  );
}
