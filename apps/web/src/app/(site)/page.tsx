import {
  BeforeAfterSlider,
  Button,
  FAQAccordion,
  Hero,
  ListingCard,
  ListingPhotoPlaceholder,
  NeighborhoodTiles,
  NewsList,
  PortalPitch,
  SectionTitle,
  SoldTile,
  StatStrip,
  TestimonialCarousel,
  VideoGrid,
  VideoThumb,
  WelcomeBlock,
} from "@vabrato/ui/web";
import { ConnectBand } from "@/components/home/ConnectBand";
import { HeroSearch } from "@/components/home/HeroSearch";
import { MlsAttribution } from "@/components/MlsAttribution";
import { cityLine, formatPrice } from "@/lib/format";
import { FEATURED_CITIES, HERO, HOME_FAQ, MEET, PORTAL_POINTS, TRANSFORM, WELCOME } from "@/lib/home-content";
import { toCardProps } from "@/lib/listing-view";
import { latestPosts, publishedTestimonials, publishedVideos } from "@/lib/public/content";
import { flagEnabled, listCities, mlsLastUpdated, ownSoldListings, searchListings } from "@/lib/public/listings";
import { DEFAULT_FILTERS } from "@/lib/search-params";
import { pageMetadata } from "@/lib/seo";

// Home (mockup 01). Every section from today's vabrato.com plus search,
// portal pitch, neighborhoods and FAQ. MLS-derived sections: featured
// listings (IDX, MLS-1/2), sold properties (public_sold) and track record
// (public_stats + public_sold) (MLS-10). Content sections render only when
// something is published.
export const revalidate = 900;

export const metadata = pageMetadata({
  title: "Vabrato Real Estate Services | San Carlos and Peninsula real estate",
  description: "Peninsula real estate from brokers with a law degree and a general contractor's license. Search homes in San Mateo and Santa Clara Counties.",
  path: "/",
});

const placeholderPhoto = (label: string, tint: "slate" | "steel" | "mauve" = "slate") => <ListingPhotoPlaceholder tint={tint} label={label} />;

export default async function HomePage() {
  const [cities, own, latest, showSold, showStats, posts, testimonials, videos, lastUpdated] = await Promise.all([
    listCities(),
    searchListings(DEFAULT_FILTERS, { pageSize: 3, ownOnly: true }),
    searchListings(DEFAULT_FILTERS, { pageSize: 6 }),
    flagEnabled("public_sold"),
    flagEnabled("public_stats"),
    latestPosts(3),
    publishedTestimonials(8),
    publishedVideos(4),
    mlsLastUpdated(),
  ]);
  const sold = showSold ? await ownSoldListings(4) : [];

  // Featured: our listings first, topped up with the newest others.
  const featured = [...own.rows, ...latest.rows.filter((r) => !own.rows.some((o) => o.listing_key === r.listing_key))].slice(0, 3);

  const recentSales = sold.filter((s) => s.close_date && Date.parse(s.close_date) > Date.now() - 365 * 86_400_000);
  const trackRecord =
    showStats && sold.length
      ? [
          { value: formatPrice(Math.max(...sold.map((s) => s.close_price ?? 0))), label: "Top sale" },
          { value: String(recentSales.length), label: "Sales, last 12 months" },
          { value: String(new Set(sold.map((s) => s.city)).size), label: "Peninsula cities" },
        ]
      : null;

  const quickLinks = [
    ...(showSold ? [{ label: "Sold listings", href: "/properties#sold" }] : []),
    { label: "For sale", href: "/search" },
    { label: "Open houses", href: "/open-houses" },
    { label: "Home valuation", href: "/sell" },
  ];

  const tiles = FEATURED_CITIES.map((slug) => cities.find((c) => c.slug === slug))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c, i) => ({ name: c.name, href: `/neighborhoods/${c.slug}`, image: placeholderPhoto(`${c.name} photo (placeholder)`, (["slate", "steel", "mauve"] as const)[i % 3]) }));

  return (
    <>
      <h1 className="sr-only">Vabrato Real Estate Services</h1>
      <Hero
        eyebrow={HERO.eyebrow}
        title={HERO.title}
        subtitle={HERO.subtitle}
        tabs={[
          { id: "buy", label: "Buy", panel: <HeroSearch cities={cities} /> },
          {
            id: "sell",
            label: "Sell",
            panel: (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="font-body text-body text-ink">Thinking of selling? Get a no-obligation valuation from a Vabrato broker.</p>
                <Button href="/sell" variant="navy" underline={false}>
                  Get a home valuation
                </Button>
              </div>
            ),
          },
          {
            id: "worth",
            label: "What's my home worth?",
            panel: (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="font-body text-body text-ink">A broker prepares your valuation from recent sales. It&apos;s free, and we never share your details.</p>
                <Button href="/sell" variant="navy" underline={false}>
                  Request a valuation
                </Button>
              </div>
            ),
          },
        ]}
      />

      <nav aria-label="Quick links" className="mx-auto max-w-site px-4 py-6 md:px-6">
        <ul className="flex flex-wrap justify-center gap-4">
          {quickLinks.map((l) => (
            <li key={l.href}>
              <Button href={l.href} size="sm">
                {l.label}
              </Button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-auto max-w-site space-y-20 px-4 py-10 md:px-6">
        <WelcomeBlock eyebrow={WELCOME.eyebrow} title={WELCOME.title} subtitle={WELCOME.subtitle} action={{ label: "Meet the team", href: "/about" }} media={<div className="aspect-[4/3]">{placeholderPhoto("Vabrato team photo (placeholder)")}</div>}>
          <p>{WELCOME.body}</p>
        </WelcomeBlock>

        <WelcomeBlock
          reverse
          eyebrow={MEET.eyebrow}
          title={MEET.title}
          subtitle={MEET.subtitle}
          action={{ label: "Our team", href: "/about" }}
          media={<VideoThumb poster={placeholderPhoto("Video still (placeholder)", "steel")} youtubeUrl="https://www.youtube.com/" title="Meet Vabrato (video link placeholder)" />}
        >
          <p>{MEET.body}</p>
        </WelcomeBlock>

        <section aria-label="Featured listings">
          <SectionTitle title="Featured listings" action={{ label: "View all for sale", href: "/search" }} />
          <ul className="grid gap-4 md:grid-cols-3">
            {featured.map((r) => (
              <li key={r.listing_key}>
                <ListingCard {...toCardProps(r)} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      {trackRecord && <StatStrip eyebrow="Live from MLSListings" title="Our track record" stats={trackRecord} />}

      <div className="mx-auto max-w-site space-y-20 px-4 py-16 md:px-6">
        <section aria-label="We can transform your home">
          <SectionTitle title="We can transform your home" action={{ label: "View all projects", href: "/transform" }} />
          <p className="mb-6 max-w-prose font-body text-body text-ink">{TRANSFORM.body}</p>
          <BeforeAfterSlider before={placeholderPhoto("Before photo (placeholder)", "mauve")} after={placeholderPhoto("After photo (placeholder)", "steel")} />
          <div className="mt-6 flex flex-wrap gap-4">
            <Button href="/transform" variant="navy" underline={false}>
              Estimate my pre-sale project
            </Button>
          </div>
        </section>

        {testimonials.length > 0 && (
          <TestimonialCarousel
            eyebrow="Verified reviews"
            items={testimonials.map((t) => ({ quote: t.quote, author: `${t.author_display}${t.role ? ` · ${t.role[0]!.toUpperCase()}${t.role.slice(1)}` : ""}`, source: t.source ?? undefined }))}
            action={<Button href="/testimonials">Read all reviews</Button>}
          />
        )}

        <PortalPitch
          title="Your move, in one place."
          points={PORTAL_POINTS}
          media={<div className="aspect-[4/3]">{placeholderPhoto("Portal screenshot (placeholder)", "steel")}</div>}
          primary={{ label: "Create free account", href: "/join" }}
          secondary={{ label: "How it works", href: "/join" }}
        />

        {videos.length > 0 && (
          <section aria-label="Latest videos">
            <SectionTitle title="Latest videos" />
            <VideoGrid
              items={videos.map((v) => ({
                title: v.title,
                youtubeUrl: `https://www.youtube.com/watch?v=${v.youtube_id}`,
                poster: placeholderPhoto("Video still", "slate"),
              }))}
            />
          </section>
        )}

        {posts.length > 0 && (
          <NewsList
            subtitle="Exclusive market trends"
            allHref="/insights"
            posts={posts.map((p) => ({ title: p.title, excerpt: p.excerpt, href: `/insights/${p.slug}` }))}
          />
        )}

        {sold.length > 0 && (
          <section aria-label="Sold properties">
            <SectionTitle title="Sold properties" action={{ label: "View more sold properties", href: "/properties#sold" }} />
            <ul className="grid gap-4 md:grid-cols-2">
              {sold.map((s) => (
                <li key={s.listing_key}>
                  <SoldTile address={s.street ?? `Home in ${s.city ?? "the area"}`} detail={`${cityLine(s)} · Sold ${formatPrice(s.close_price)}`} href="/properties#sold" />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Neighborhoods">
          <SectionTitle title="Neighborhoods" action={{ label: "All areas", href: "/neighborhoods" }} />
          <NeighborhoodTiles items={tiles} />
        </section>

        <section aria-labelledby="faq-heading" className="grid gap-10 md:grid-cols-[1fr_2fr]">
          <div>
            <p className="font-body text-label uppercase tracking-label text-gold-ink">Answers from our brokers</p>
            <h2 id="faq-heading" className="mt-2 font-display text-display-md uppercase text-navy">
              Peninsula real estate, answered.
            </h2>
          </div>
          <FAQAccordion items={HOME_FAQ.map((f) => ({ question: f.q, answer: f.a }))} />
        </section>

        <MlsAttribution lastUpdated={lastUpdated} />
      </div>

      <ConnectBand />
    </>
  );
}
