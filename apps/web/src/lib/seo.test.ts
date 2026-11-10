import { describe, expect, it } from "vitest";
import { BROKER_DISCLOSURE } from "./org";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  listingJsonLd,
  openHouseJsonLd,
  organizationJsonLd,
  pageMetadata,
  personJsonLd,
  placeJsonLd,
  serializeJsonLd,
} from "./seo";

const base = {
  listing_key: "FX-012",
  street: "205 Fixture St",
  city: "Los Gatos",
  postal_code: "95030",
  list_price: 2975000,
  standard_status: "Active",
  bedrooms_total: 4,
  living_area: 2900,
  latitude: 37.23,
  longitude: -121.98,
};

describe("JSON-LD", () => {
  it("describes the brokerage with the required disclosure", () => {
    const org = organizationJsonLd() as unknown as Record<string, unknown>;
    expect(org).toMatchObject({ "@context": "https://schema.org", "@type": "RealEstateAgent", name: "Vabrato Real Estate Services" });
    expect(org.description).toBe(BROKER_DISCLOSURE);
    expect(BROKER_DISCLOSURE).toBe(
      "Vabrato Real Estate Services · DRE #02142060 · Mark Martinho, Designated Broker, DRE #01372898",
    );
  });

  it("builds a RealEstateListing with offer, address and geo", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- walking nested JSON-LD in a test
    const ld = listingJsonLd({ ...base, address_display: true, on_market_date: "2026-11-01" }, "/listing/FX-012/x") as Record<string, any>;
    expect(ld["@type"]).toBe("RealEstateListing");
    expect(ld.offers).toMatchObject({ "@type": "Offer", price: 2975000, priceCurrency: "USD" });
    expect(ld.about.address.streetAddress).toBe("205 Fixture St");
    expect(ld.about.geo).toMatchObject({ latitude: 37.23 });
    expect(ld.url).toMatch(/^https:\/\/.+\/listing\/FX-012\/x$/);
  });

  it("never puts a hidden address or coordinates in structured data (review item 7)", () => {
    const ld = listingJsonLd({ ...base, address_display: false }, "/listing/FX-012/los-gatos");
    const ev = openHouseJsonLd({ ...base, address_display: false }, { start: "2026-11-15T19:00:00Z", end: null }, "/listing/FX-012/los-gatos");
    for (const json of [JSON.stringify(ld), JSON.stringify(ev)]) {
      expect(json).not.toContain("Fixture St");
      expect(json).not.toContain("GeoCoordinates");
      expect(json).toContain("Home in Los Gatos");
    }
  });

  it("builds the other types with their required properties", () => {
    expect(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Belmont", path: "/neighborhoods/belmont" }]).itemListElement).toHaveLength(2);
    expect(faqJsonLd([{ q: "Q?", a: "A." }]).mainEntity).toEqual([{ "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A." } }]);
    expect(placeJsonLd({ name: "Belmont", county: "San Mateo" }, "/neighborhoods/belmont")).toMatchObject({ "@type": "Place", name: "Belmont, CA" });
    expect(personJsonLd({ name: "Viv Kelvin", path: "/team/viv-kelvin" })).toMatchObject({ "@type": "Person", worksFor: { "@id": expect.any(String) } });
    expect(articleJsonLd({ title: "T", excerpt: "E", path: "/insights/t", publishedAt: null })).toMatchObject({
      "@type": "Article",
      headline: "T",
      author: { "@type": "Organization", name: "Vabrato Real Estate Services" },
    });
  });

  it("never emits review markup for our own testimonials (review item 15)", () => {
    const all = JSON.stringify([organizationJsonLd(), personJsonLd({ name: "X", path: "/x" })]);
    expect(all).not.toMatch(/Review|AggregateRating/);
  });

  it("escapes JSON-LD so it can't break out of the script tag", () => {
    expect(serializeJsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });

  it("sets canonical URLs", () => {
    expect(pageMetadata({ title: "T", description: "D", path: "/sell" }).alternates?.canonical).toMatch(/\/sell$/);
  });
});
