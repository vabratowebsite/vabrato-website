import type { Metadata } from "next";
import type {
  Article,
  BreadcrumbList,
  Event,
  FAQPage,
  Person,
  Place,
  PostalAddress,
  RealEstateAgent,
  RealEstateListing,
  WithContext,
} from "schema-dts";
import { listingTitle, type AddressParts } from "./format";
import { BROKER_DISCLOSURE, ORG, SITE_URL } from "./org";

// schema.org JSON-LD builders (SPEC G6). Validated against validator.schema.org
// (review item 15). Never Review / AggregateRating markup for our own
// testimonials. Hidden addresses never reach structured data (review item 7).

export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/** Page metadata with a canonical URL. Indexing stays off site-wide until S9 (root layout). */
export function pageMetadata(opts: { title: string; description: string; path: string; canonical?: string }): Metadata {
  const canonical = opts.canonical ?? absoluteUrl(opts.path);
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical },
    openGraph: { title: opts.title, description: opts.description, url: canonical, siteName: ORG.name, type: "website" },
  };
}

const orgAddress: PostalAddress = {
  "@type": "PostalAddress",
  streetAddress: ORG.address.street,
  addressLocality: ORG.address.city,
  addressRegion: ORG.address.region,
  postalCode: ORG.address.postalCode,
  addressCountry: "US",
};

export function organizationJsonLd(): WithContext<RealEstateAgent> {
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    "@id": absoluteUrl("/#organization"),
    name: ORG.name,
    url: SITE_URL,
    address: orgAddress,
    areaServed: [
      { "@type": "AdministrativeArea", name: "San Mateo County, CA" },
      { "@type": "AdministrativeArea", name: "Santa Clara County, CA" },
    ],
    description: BROKER_DISCLOSURE,
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): WithContext<BreadcrumbList> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}

export function faqJsonLd(items: { q: string; a: string }[]): WithContext<FAQPage> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({ "@type": "Question", name: it.q, acceptedAnswer: { "@type": "Answer", text: it.a } })),
  };
}

/** Address for structured data: street only when it may be shown. */
export function listingAddress(l: AddressParts): PostalAddress {
  return {
    "@type": "PostalAddress",
    ...(l.address_display && l.street ? { streetAddress: l.street } : {}),
    ...(l.city ? { addressLocality: l.city } : {}),
    addressRegion: "CA",
    ...(l.postal_code ? { postalCode: l.postal_code } : {}),
    addressCountry: "US",
  };
}

export interface ListingForJsonLd extends AddressParts {
  list_price: number | null;
  standard_status: string;
  bedrooms_total: number | null;
  living_area: number | null;
  latitude: number | null;
  longitude: number | null;
  on_market_date?: string | null;
  photos?: string[];
}

export function listingJsonLd(l: ListingForJsonLd, path: string): WithContext<RealEstateListing> {
  const name = listingTitle(l);
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name,
    url: absoluteUrl(path),
    ...(l.on_market_date ? { datePosted: l.on_market_date } : {}),
    ...(l.photos?.length ? { image: l.photos } : {}),
    ...(l.list_price !== null
      ? {
          offers: {
            "@type": "Offer",
            price: l.list_price,
            priceCurrency: "USD",
            availability: l.standard_status === "Active" ? "https://schema.org/InStock" : "https://schema.org/LimitedAvailability",
          },
        }
      : {}),
    about: {
      "@type": "Residence",
      name,
      address: listingAddress(l),
      ...(l.address_display && l.latitude !== null && l.longitude !== null
        ? { geo: { "@type": "GeoCoordinates", latitude: l.latitude, longitude: l.longitude } }
        : {}),
      ...(l.living_area ? { floorSize: { "@type": "QuantitativeValue", value: l.living_area, unitCode: "FTK" } } : {}),
    },
  } as WithContext<RealEstateListing>;
}

export function openHouseJsonLd(l: AddressParts, oh: { start: string; end: string | null }, path: string): WithContext<Event> {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: `Open house: ${listingTitle(l)}`,
    startDate: oh.start,
    ...(oh.end ? { endDate: oh.end } : {}),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: listingTitle(l), address: listingAddress(l) },
    url: absoluteUrl(path),
    organizer: { "@id": absoluteUrl("/#organization") },
  };
}

export function placeJsonLd(city: { name: string; county: string }, path: string): WithContext<Place> {
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: `${city.name}, CA`,
    url: absoluteUrl(path),
    containedInPlace: { "@type": "AdministrativeArea", name: `${city.county} County, CA` },
  };
}

export function personJsonLd(a: { name: string; title?: string; path: string; image?: string }): WithContext<Person> {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: a.name,
    url: absoluteUrl(a.path),
    ...(a.title ? { jobTitle: a.title } : {}),
    ...(a.image ? { image: a.image } : {}),
    worksFor: { "@id": absoluteUrl("/#organization") },
  };
}

export function articleJsonLd(p: { title: string; excerpt: string; path: string; publishedAt: string | null }): WithContext<Article> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: p.title,
    description: p.excerpt,
    url: absoluteUrl(p.path),
    ...(p.publishedAt ? { datePublished: p.publishedAt } : {}),
    // Posts are written by the brokerage, not a named agent.
    author: { "@type": "Organization", name: ORG.name, url: SITE_URL },
    publisher: { "@id": absoluteUrl("/#organization") },
  };
}

/** JSON for a <script type="application/ld+json">, safe to inline (no `</script>` breakout). */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
