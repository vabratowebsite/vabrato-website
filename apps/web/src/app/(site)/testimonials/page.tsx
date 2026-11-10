import { ReviewCard, SectionTitle } from "@vabrato/ui/web";
import { publishedTestimonials } from "@/lib/public/content";
import { pageMetadata } from "@/lib/seo";

// Client testimonials. No Review / AggregateRating markup for our own reviews
// (review item 15).
export const revalidate = 900;

export const metadata = pageMetadata({
  title: "Client testimonials | Vabrato Real Estate Services",
  description: "What buyers and sellers say about working with Vabrato Real Estate Services.",
  path: "/testimonials",
});

export default async function TestimonialsPage() {
  const items = await publishedTestimonials(60);
  return (
    <div className="mx-auto max-w-site space-y-10 px-4 py-12 md:px-6">
      <SectionTitle as="h1" title="What our clients are saying" action={{ label: "Contact us", href: "/contact" }} />
      {items.length === 0 ? (
        <p className="font-body text-body text-muted">Client testimonials are coming soon.</p>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <li key={`${t.author_display}-${t.quote.slice(0, 20)}`}>
              <ReviewCard quote={t.quote} reviewer={t.author_display} role={t.role ? t.role[0]!.toUpperCase() + t.role.slice(1) : undefined} source={t.source ?? undefined} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
