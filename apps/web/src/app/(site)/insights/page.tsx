import { SectionTitle } from "@vabrato/ui/web";
import { listPosts } from "@/lib/public/content";
import { pageMetadata } from "@/lib/seo";

// Insights hub: market updates, news and events. Market statistics inside
// posts stay behind `public_stats` (MLS-10).
export const revalidate = 900;

export const metadata = pageMetadata({
  title: "Insights: Peninsula real estate news and market updates | Vabrato",
  description: "Market updates, news and events from Vabrato Real Estate Services.",
  path: "/insights",
});

const KIND_LABEL = { insight: "Insight", news: "News", event: "Event", market_update: "Market update" } as const;

export default async function InsightsPage() {
  const posts = await listPosts(60);
  return (
    <div className="mx-auto max-w-site space-y-10 px-4 py-12 md:px-6">
      <SectionTitle as="h1" title="Insights" eyebrow="News, events and market updates" />
      {posts.length === 0 ? (
        <p className="font-body text-body text-muted">Articles are coming soon.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {posts.map((p) => (
            <li key={p.slug} className="py-6">
              <p className="font-body text-label uppercase tracking-label text-gold-ink">
                {KIND_LABEL[p.kind]}
                {p.published_at ? ` · ${new Date(p.published_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })}` : ""}
              </p>
              <h2 className="mt-1 font-subhead text-subhead-lg text-ink">
                <a href={`/insights/${p.slug}`} className="hover:underline">
                  {p.title}
                </a>
              </h2>
              <p className="mt-2 max-w-prose font-body text-body text-ink">{p.excerpt}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
