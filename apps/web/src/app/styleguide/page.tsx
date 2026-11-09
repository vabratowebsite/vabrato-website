import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  ALLOWED_PAIRS,
  DISALLOWED_PAIRS,
  LEGACY_GOLD_INK,
  colors,
  contrastRatio,
  pairRatio,
  space,
  tracking,
  typeScale,
} from "@vabrato/ui";
import {
  AIConceptBadge,
  AIDraftLabel,
  AgentHero,
  AgentStatRow,
  Avatar,
  BeforeAfterSlider,
  BellIcon,
  BreadcrumbBar,
  Button,
  ConnectNewsletter,
  ContactForm,
  FAQAccordion,
  Footer,
  Hero,
  HeroSearchForm,
  KpiTile,
  ListingCard,
  ListingPhotoPlaceholder,
  NeighborhoodTiles,
  NewsList,
  Panel,
  PanelAction,
  Pill,
  PortalPitch,
  PortalShell,
  ReviewCard,
  SectionTitle,
  SiteHeader,
  SkillList,
  SocialRail,
  SoldTile,
  StatStrip,
  StatusLadder,
  TestimonialCarousel,
  Timeline,
  TodoItem,
  TodoList,
  VideoFeature,
  VideoGrid,
  WelcomeBlock,
  WiringBanner,
} from "@vabrato/ui/web";
import { faqs, listings, nav, social, soldListings, testimonials, timeline } from "./sample-data";

export const metadata: Metadata = {
  title: "Styleguide · Vabrato",
  robots: { index: false, follow: false },
};

const photo = (label: string, tint: "slate" | "steel" | "mauve" = "slate", iconless = false) => (
  <ListingPhotoPlaceholder label={label} tint={tint} iconless={iconless} />
);

function Block({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="border-t border-line py-12">
      <div className="mx-auto mb-6 max-w-site px-4 md:px-6">
        <h2 id={`${id}-h`} className="font-subhead text-subhead-lg text-navy">
          {title}
        </h2>
        {note && <p className="mt-1 max-w-3xl font-body text-body-sm text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const Wrap = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`mx-auto max-w-site px-4 md:px-6 ${className}`}>{children}</div>
);

const toc = [
  ["tokens", "Tokens"],
  ["contrast", "Contrast"],
  ["type", "Type"],
  ["buttons", "Buttons"],
  ["chrome", "Site chrome"],
  ["listings", "Listings"],
  ["home", "Home sections"],
  ["agent", "Agent profile"],
  ["portal", "Portal"],
] as const;

export default function StyleguidePage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:p-2 focus:text-navy"
      >
        Skip to content
      </a>
      <SiteHeader nav={nav} currentHref="/about" />
      <BreadcrumbBar items={[{ label: "Home", href: "/" }, { label: "Styleguide" }]} />
      <main id="main">
        <Wrap className="py-10">
          <p className="font-body text-label font-medium uppercase tracking-wide text-gold-ink">
            S2 · Design system
          </p>
          <h1 className="font-display text-display-lg uppercase text-navy">Styleguide</h1>
          <p className="mt-2 max-w-2xl font-body text-body-sm text-muted">
            Every token and component in <code>@vabrato/ui</code>, with fictional sample data.
            Listing photos are grey placeholders; no MLS data appears on this page.
          </p>
          <nav aria-label="Styleguide sections" className="mt-6">
            <ul className="flex flex-wrap gap-2">
              {toc.map(([id, label]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="inline-block border border-muted px-3 py-1 font-body text-caption text-navy hover:bg-navy hover:text-white"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Wrap>

        <Block
          id="tokens"
          title="Color tokens"
          note="CSS variables (--color-*) and a TS export (colors) from @vabrato/ui."
        >
          <Wrap>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
              {Object.entries(colors).map(([name, hex]) => (
                <li key={name} className="border border-line">
                  <div className="h-16" style={{ background: hex }} />
                  <div className="p-2 font-body text-caption">
                    <p className="font-medium text-ink">{name}</p>
                    <p className="text-muted">{hex}</p>
                  </div>
                </li>
              ))}
            </ul>
            <h3 className="mt-10 font-subhead text-subhead-sm text-ink">Spacing (4px scale)</h3>
            <ul className="mt-3 space-y-1">
              {Object.entries(space).map(([k, px]) => (
                <li key={k} className="flex items-center gap-3 font-body text-caption text-muted">
                  <span className="w-16">space-{k}</span>
                  <span className="h-2 bg-navy" style={{ width: px }} />
                  <span>{px}px</span>
                </li>
              ))}
            </ul>
            <h3 className="mt-10 font-subhead text-subhead-sm text-ink">Letter-spacing</h3>
            <ul className="mt-3 space-y-2">
              {Object.entries(tracking).map(([k, v]) => (
                <li
                  key={k}
                  className="font-body text-caption uppercase text-ink"
                  style={{ letterSpacing: v }}
                >
                  tracking-{k} · {v} · Listing No. ML00000XXX
                </li>
              ))}
            </ul>
          </Wrap>
        </Block>

        <Block
          id="contrast"
          title="Contrast (WCAG 2.2 AA)"
          note={`Computed from the tokens; the same table is enforced by tokens.test.ts. gold-ink was darkened from the brand's ${LEGACY_GOLD_INK} (${contrastRatio(LEGACY_GOLD_INK, colors.white).toFixed(2)}:1 on white) to ${colors["gold-ink"]}.`}
        >
          <Wrap>
            <div role="region" aria-label="Contrast table" tabIndex={0} className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse font-body text-body-sm">
                <caption className="sr-only">Token pairs and contrast ratios</caption>
                <thead>
                  <tr className="border-b border-line text-left font-body text-label uppercase tracking-label text-muted">
                    <th scope="col" className="py-2">
                      Sample
                    </th>
                    <th scope="col">Pair</th>
                    <th scope="col">Use</th>
                    <th scope="col">Ratio</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...ALLOWED_PAIRS.map((p) => ({ ...p, ok: true })),
                    ...DISALLOWED_PAIRS.map((p) => ({ ...p, ok: false })),
                  ].map((p) => (
                    <tr key={`${p.fg}-${p.bg}-${p.use}`} className="border-b border-line">
                      <td className="py-2">
                        {p.ok ? (
                          <span
                            className="inline-block px-2 py-0.5"
                            style={{ color: colors[p.fg], background: colors[p.bg] }}
                          >
                            Aa
                          </span>
                        ) : (
                          <span className="inline-block border border-dashed border-muted px-2 py-0.5 text-muted">
                            n/a
                          </span>
                        )}
                      </td>
                      <td>
                        {p.fg} on {p.bg}
                      </td>
                      <td className="text-muted">{p.note}</td>
                      <td>{pairRatio(p).toFixed(2)}:1</td>
                      <td className={p.ok ? "text-green" : "text-red"}>
                        {p.ok ? "Pass" : "Fail · not used"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Wrap>
        </Block>

        <Block
          id="type"
          title="Type"
          note="Bodoni Moda (display, uppercase) · Libre Baskerville (subheads) · Roboto (body)."
        >
          <Wrap className="space-y-4">
            {Object.entries(typeScale).map(([k, [size, lh]]) => {
              const family = k.startsWith("display")
                ? "font-display uppercase text-navy"
                : k.startsWith("subhead")
                  ? "font-subhead text-ink"
                  : k === "label"
                    ? "font-body uppercase tracking-label text-ink"
                    : "font-body text-ink";
              return (
                <p key={k} className={family} style={{ fontSize: size, lineHeight: lh }}>
                  <span className="mr-4 inline-block w-28 font-body text-caption normal-case tracking-normal text-muted">
                    {k} · {size}px
                  </span>
                  Real estate, built by people who build.
                </p>
              );
            })}
          </Wrap>
        </Block>

        <Block
          id="buttons"
          title="Buttons"
          note="Thin outlined uppercase with a short underline; navy; gold; ghost on dark."
        >
          <Wrap className="flex flex-wrap items-center gap-6">
            <Button>Meet the team</Button>
            <Button variant="navy">Create free account</Button>
            <Button variant="gold">Contact Mark</Button>
            <Button size="sm">View all for sale</Button>
            <Button href="#buttons" variant="navy" size="sm">
              Link button
            </Button>
          </Wrap>
          <div className="mt-6 bg-navy py-8">
            <Wrap className="flex flex-wrap items-center gap-6">
              <Button variant="ghost-dark">Read more</Button>
              <Button variant="gold" size="sm">
                Request tour
              </Button>
              <SocialRail links={social} fixed={false} />
            </Wrap>
          </div>
        </Block>

        <Block
          id="chrome"
          title="Site chrome"
          note="SiteHeader and BreadcrumbBar are at the top of this page; SocialRail (desktop, right) and Footer at the bottom. SectionTitle:"
        >
          <Wrap>
            <SectionTitle
              title="Featured listings"
              action={{ label: "View all for sale", href: "#listings" }}
            />
            <SectionTitle
              eyebrow="Client stories"
              title="What our clients are saying"
              hairline={false}
            >
              Optional supporting copy under the title.
            </SectionTitle>
          </Wrap>
        </Block>

        <Block
          id="listings"
          title="Listings"
          note="ListingCard badges: NEW, CONTINGENT, SOLD, LIST: SOLD, PRICE ↓, OPEN; save heart; IDX icon + listing broker on other brokers' listings (MLS-2). Sold UI is gated by public_sold on real pages (MLS-10)."
        >
          <Wrap>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((l) => (
                <ListingCard key={l.listingNo} {...l} />
              ))}
            </div>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {soldListings.map((l) => (
                <ListingCard key={l.address} {...l} />
              ))}
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <SoldTile
                address="100 Sample Oak Rd"
                detail="Woodside, CA 94062 · Sold $6,250,000"
                href="#"
              />
              <SoldTile
                address="300 Ridge Crest Dr"
                detail="Redwood City, CA 94062 · Sold $3,420,000"
                href="#"
                tint="steel"
              />
            </div>
          </Wrap>
          <div className="mt-10">
            <StatStrip
              eyebrow="Live from MLSListings · Sample figures"
              title="Our track record"
              stats={[
                { value: "$6.25M", label: "Top sale · Woodside" },
                { value: "12", label: "Sales, last 12 months" },
                { value: "9", label: "Peninsula cities served" },
                { value: "101%", label: "Avg. sale-to-list" },
              ]}
            />
          </div>
        </Block>

        <Block id="home" title="Home sections">
          <Hero
            eyebrow="San Carlos · Peninsula · Silicon Valley"
            title={["Real estate, built by", "people who build."]}
            subtitle="Brokers, a law degree and a general contractor's license on every deal."
            tabs={[
              {
                id: "buy",
                label: "Buy",
                panel: (
                  <HeroSearchForm
                    action="/search"
                    fields={[
                      {
                        name: "q",
                        label: "Location",
                        placeholder: "San Carlos, Belmont, Redwood City…",
                      },
                      {
                        name: "price",
                        label: "Price",
                        options: ["Any", "$1M – $2M", "$2M – $4M", "$4M+"],
                      },
                      { name: "beds", label: "Beds", options: ["Any", "2+", "3+", "4+"] },
                      { name: "type", label: "Type", options: ["Houses", "Condos", "Townhouses"] },
                    ]}
                  />
                ),
              },
              {
                id: "sold",
                label: "Sold",
                panel: (
                  <p className="font-body text-body-sm text-muted">
                    Sold search is for signed-in members (VOW). Sample panel.
                  </p>
                ),
              },
              {
                id: "worth",
                label: "What's my home worth?",
                panel: (
                  <HeroSearchForm
                    action="/home-valuation"
                    submitLabel="Get estimate"
                    fields={[
                      { name: "address", label: "Your address", placeholder: "123 Sample St" },
                    ]}
                  />
                ),
              },
            ]}
          />
          <WelcomeBlock
            eyebrow="Vabrato Real Estate Services"
            title="Welcome"
            subtitle="We're thrilled you're visiting us!"
            action={{ label: "Meet the team", href: "#agent" }}
            media={<div className="aspect-[4/3]">{photo("Team photo", "steel")}</div>}
          >
            <p>
              Sample copy: you&apos;re probably here because you&apos;re thinking about buying or
              selling a home.
            </p>
          </WelcomeBlock>
          <VideoFeature
            eyebrow="Our story · 2 min video"
            title="Meet Vabrato"
            subtitle="Friendly, professional, and experts."
            video={{
              poster: photo("Video still", "mauve", true),
              youtubeUrl: "https://www.youtube.com/watch?v=sample",
              title: "Meet Vabrato",
            }}
            action={<Button size="sm">Our team</Button>}
          >
            <p>Sample copy about the brokerage.</p>
          </VideoFeature>
          <Wrap className="py-12">
            <SectionTitle
              title="We can transform your home"
              action={{ label: "View all projects", href: "#" }}
            />
            <BeforeAfterSlider
              before={photo("Before photo", "mauve", true)}
              after={photo("After photo", "steel", true)}
            />
          </Wrap>
          <TestimonialCarousel
            eyebrow="5.0 · Sample reviews"
            items={testimonials}
            action={<Button size="sm">Read all reviews</Button>}
            media={<div className="aspect-[4/3]">{photo("Client photo")}</div>}
          />
          <Wrap className="py-12">
            <SectionTitle title="Latest videos" action={{ label: "View all videos", href: "#" }} />
            <VideoGrid
              items={[1, 2, 3, 4].map((n) => ({
                title: `Sample video ${n}: a Peninsula home tour`,
                youtubeUrl: `https://www.youtube.com/watch?v=sample${n}`,
                poster: photo("Video still", n % 2 ? "slate" : "steel", true),
                meta: "YouTube · Sample date",
              }))}
            />
          </Wrap>
          <NewsList
            subtitle="Exclusive market trends"
            blurb="Monthly market updates for San Mateo and Santa Clara counties. Sample copy."
            allHref="#"
            posts={[1, 2, 3].map((n) => ({
              title: `Sample post ${n}: what buyers are asking this month`,
              excerpt: "Sample excerpt for the news list.",
              href: `#post-${n}`,
              image: photo("Post image", "steel"),
            }))}
          />
          <PortalPitch
            title="Your move, in one place."
            media={photo("Portal preview")}
            points={[
              { who: "Buyers", text: "save homes, track every offer from Watching to Purchased." },
              { who: "Sellers", text: "see your sale timeline, to-dos and showings." },
              { who: "Members only", text: "full sold history and price changes." },
            ]}
            primary={{ label: "Create free account", href: "/join" }}
            secondary={{ label: "How it works", href: "#" }}
          />
          <Wrap className="py-12">
            <SectionTitle title="Neighborhoods" action={{ label: "All areas", href: "#" }} />
            <NeighborhoodTiles
              items={["Redwood City", "Woodside", "Los Altos Hills", "San Carlos"].map(
                (name, i) => ({
                  name,
                  href: `#${name}`,
                  meta: "Sample stats",
                  image: photo("Area photo", (["slate", "steel", "mauve", "slate"] as const)[i]),
                }),
              )}
            />
          </Wrap>
          <Wrap className="grid gap-10 py-12 md:grid-cols-2">
            <SectionTitle
              eyebrow="Answers from our brokers"
              title="Peninsula real estate, answered."
              hairline={false}
            />
            <FAQAccordion items={faqs} />
          </Wrap>
          <ConnectNewsletter />
        </Block>

        <Block
          id="agent"
          title="Agent profile"
          note="Sample agent; the real profile copy arrives in S4."
        >
          <AgentHero
            photo={photo("Agent photo", "steel")}
            firstName="Sample"
            lastName="Agent"
            title="Broker, J.D., General Contractor"
            licenses={["CA DRE Lic. # 00000000", "GC Lic. # 0000000"]}
            phone="650.555.0100"
            email="agent@example.com"
            social={social}
            bookHref="#"
            contactHref="#contact"
            contactLabel="Contact agent"
          />
          <Wrap className="space-y-12">
            <AgentStatRow
              stats={[
                { value: "3", label: "Active listings" },
                { value: "12", label: "Sold, last 3 yrs" },
                { value: "2003", label: "In real estate since" },
                { value: "4.9 ★", label: "Client reviews" },
              ]}
              footnote="Sample figures."
            />
            <div className="grid gap-10 md:grid-cols-2">
              <SkillList
                title="My skills at work for you"
                items={[
                  { title: "Local real estate since 2003", detail: "Sample detail." },
                  {
                    title: "Law degree",
                    detail: "Real estate is all about legally binding agreements.",
                  },
                  { title: "Licensed general contractor", detail: "From foundations to roofs." },
                ]}
              />
              <div id="contact">
                <ContactForm note="Your message goes straight to the agent." />
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              <ReviewCard
                quote="Placeholder for a real client review."
                reviewer="Reviewer"
                role="Seller"
                source="Google"
              />
              <ReviewCard
                quote="Placeholder for a real client review."
                reviewer="Reviewer"
                role="Buyer"
                source="Zillow"
              />
              <ReviewCard
                quote="Placeholder for a real client review."
                reviewer="Reviewer"
                role="Seller"
                source="Google"
              />
            </div>
          </Wrap>
        </Block>

        <Block
          id="portal"
          title="Portal"
          note="PortalShell with sample seller data. AI labels are visual only; no AI calls in S2."
        >
          <Wrap>
            <div className="overflow-hidden border border-line">
              <PortalShell
                embedded
                eyebrow="Seller portal · 88 Hillcrest Dr, San Carlos (sample)"
                title="14 days to closing"
                nav={[
                  {
                    items: [
                      { label: "My sale", href: "#portal", current: true },
                      { label: "To-dos", href: "#todos", count: 3 },
                      { label: "Documents", href: "#docs" },
                      { label: "Messages", href: "#msgs" },
                    ],
                  },
                  { label: "Assistant", items: [{ label: "Ask Vabrato", href: "#ask" }] },
                ]}
                topRight={
                  <>
                    <Pill tone="green" dot>
                      In escrow
                    </Pill>
                    <BellIcon size={20} className="text-gold-ink" />
                    <Avatar initials="SC" label="Signed in as Sample Client" />
                  </>
                }
                sidebarFooter={
                  <>
                    <p className="font-bold">Your team</p>
                    <p>Sample Agent · Broker</p>
                    <p>Sample TC · Transaction desk</p>
                  </>
                }
              >
                <div className="space-y-6">
                  <WiringBanner salePrice="$2,850,000" />
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiTile value="1,842" label="Listing views" />
                    <KpiTile value="96" label="Saves" />
                    <KpiTile value="23" label="Showings" delta="+4" />
                    <KpiTile value="4" label="Offers received" />
                  </div>
                  <div className="grid gap-6 xl:grid-cols-2">
                    <Panel
                      title="Your sale timeline"
                      action={<PanelAction href="#">Add to calendar</PanelAction>}
                    >
                      <Timeline items={timeline} />
                      <p className="mt-4 font-body text-caption text-muted">
                        Dates from the schedule engine: weekends and federal holidays are skipped
                        automatically.
                      </p>
                    </Panel>
                    <Panel title="Your to-dos">
                      <TodoList label="To-dos">
                        <TodoItem label="Sign seller disclosures (TDS, SPQ)" done />
                        <TodoItem label="Confirm move-out date with movers" due="Nov 3" />
                        <TodoItem
                          label="Repair GFCI outlets (inspection p.14)"
                          tag={<AIDraftLabel variant="suggested" />}
                        />
                        <TodoItem label="Transfer utilities" due="Nov 9" />
                      </TodoList>
                    </Panel>
                  </div>
                  <div className="grid gap-6 xl:grid-cols-2">
                    <Panel title="Homes I'm pursuing">
                      <div className="space-y-4">
                        <div>
                          <p className="mb-2 font-subhead text-body text-ink">
                            1450 Hillview Ct, Belmont
                          </p>
                          <StatusLadder current="Offer made" label="1450 Hillview Ct status" />
                        </div>
                        <div>
                          <p className="mb-2 font-subhead text-body text-ink">
                            44 Maple Way, Redwood City
                          </p>
                          <StatusLadder current="Watching" label="44 Maple Way status" />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Pill tone="red">Price ↓ $100K</Pill>
                          <Pill tone="neutral">Open Sun 1–4</Pill>
                          <Pill tone="gold" dot>
                            Pre-listing · List date Mar 6
                          </Pill>
                          <Pill tone="outline">Members</Pill>
                        </div>
                      </div>
                    </Panel>
                    <Panel title="Ask Vabrato (labels only)">
                      <div className="space-y-4">
                        <div className="bg-soft p-4">
                          <AIDraftLabel />
                          <p className="mt-2 font-body text-body-sm text-ink">
                            Sample AI summary text with page references (p.14).
                          </p>
                        </div>
                        <div className="bg-soft p-4">
                          <AIDraftLabel variant="you-send" />
                          <p className="mt-2 font-body text-body-sm text-ink">
                            &ldquo;Hi Sample Movers, we&apos;re closing on…&rdquo;
                          </p>
                        </div>
                        <div className="relative aspect-video max-w-xs">
                          {photo("Concept image", "mauve")}
                          <AIConceptBadge
                            label="Light & warm"
                            className="absolute bottom-2 left-2"
                          />
                        </div>
                      </div>
                    </Panel>
                  </div>
                </div>
              </PortalShell>
            </div>
          </Wrap>
        </Block>
      </main>
      <SocialRail links={social} />
      <Footer
        phones={[
          { label: "Office", number: "650.555.0100" },
          { label: "Mobile", number: "650.555.0101" },
        ]}
        address="935 Chestnut St, San Carlos, CA 94070"
        dre="DRE# 02142060"
        nav={[{ label: "Home valuation", href: "#" }, ...nav]}
        social={social}
        mlsDisclaimer={
          <p>
            [MLS disclaimer slot] Listing data © MLSListings Inc. Information deemed reliable but
            not guaranteed. Last updated: sample time. (S3/S4 supply the logo and real text.)
          </p>
        }
      />
    </>
  );
}
