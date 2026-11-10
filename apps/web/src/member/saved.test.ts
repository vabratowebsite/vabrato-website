import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, parseSearchParams } from "@/lib/search-params";
import { sameOrigin } from "./api";
import { criteriaFromFilters, describeSearch, filtersFromCriteria, isFrequency, searchHref } from "./saved";
import { historyRows } from "./view";

const names: Record<string, string> = { "san-carlos": "San Carlos", belmont: "Belmont", "redwood-city": "Redwood City" };
const name = (s: string) => names[s];

describe("saved search criteria", () => {
  it("stores the canonical /search filters, without page or the sold tab", () => {
    const f = parseSearchParams(new URLSearchParams("city=san-carlos&beds=3&maxPrice=2500000&page=4&tab=sold&sort=price_asc"));
    expect(criteriaFromFilters(f)).toEqual({ city: "san-carlos", beds: "3", maxPrice: "2500000", sort: "price_asc" });
  });

  it("round-trips, and ignores anything unknown or invalid", () => {
    const f = parseSearchParams(new URLSearchParams("city=belmont,san-carlos&type=condo&tab=open-houses"));
    expect(filtersFromCriteria(criteriaFromFilters(f))).toEqual({ ...f, page: 1 });
    expect(filtersFromCriteria({ city: "<script>", beds: "lots", race: "x", income: "y" })).toEqual(DEFAULT_FILTERS);
    expect(filtersFromCriteria(null)).toEqual(DEFAULT_FILTERS);
    expect(filtersFromCriteria(["city", "belmont"])).toEqual(DEFAULT_FILTERS);
  });

  it("links back to the search", () => {
    expect(searchHref({ city: "san-carlos", beds: "3" })).toBe("/search?city=san-carlos&beds=3");
    expect(searchHref({})).toBe("/search");
  });
});

describe("describeSearch (mockup 05 names)", () => {
  it.each([
    ["city=san-carlos&beds=3&maxPrice=2500000", "San Carlos 3bd+ under $2.5M"],
    ["city=san-carlos,belmont&type=condo", "San Carlos & Belmont Condos"],
    ["city=san-carlos,belmont,redwood-city", "San Carlos + 2 more"],
    ["minPrice=1000000&maxPrice=1500000", "All areas $1M–$1.5M"],
    ["minPrice=800000", "All areas over $800K"],
    ["tab=open-houses&baths=2", "All areas 2ba+ open houses"],
  ])("%s → %s", (q, out) => {
    expect(describeSearch(parseSearchParams(new URLSearchParams(q)), name)).toBe(out);
  });

  it("stays within the 80-character name limit", () => {
    const many = Object.keys(names).join(",");
    expect(describeSearch(parseSearchParams(new URLSearchParams(`city=${many}&type=house&beds=3&baths=2&minPrice=1000000&maxPrice=3000000&bbox=-122.3,37.4,-122.2,37.6`)), name).length).toBeLessThanOrEqual(80);
  });
});

describe("alert frequency", () => {
  it("accepts only instant, daily or off", () => {
    expect(["instant", "daily", "off"].every(isFrequency)).toBe(true);
    expect(isFrequency("hourly")).toBe(false);
  });
});

describe("price history rows", () => {
  it("labels listing, price changes, status changes and the sale (using the sold detail once)", () => {
    const rows = historyRows(
      [
        { at: "2026-08-01T17:00:00Z", price: 2100000, status: "Active" },
        { at: "2026-08-20T17:00:00Z", price: 2000000, status: "Active" },
        { at: "2026-09-01T17:00:00Z", price: 2000000, status: "Pending" },
        { at: "2026-09-20T17:00:00Z", price: 2000000, status: "Closed" },
      ],
      { price: 2050000, date: "2026-09-20" },
    );
    expect(rows.map((r) => [r.event, r.price])).toEqual([
      ["Listed for sale", "$2,100,000"],
      ["Price changed", "$2,000,000"],
      ["Pending", "$2,000,000"],
      ["Sold", "$2,050,000"],
    ]);
    expect(rows[3]!.date).toBe("Sep 20, 2026");
  });
});

describe("member API origin check (review item 7)", () => {
  const req = (headers: Record<string, string>) => new Request("https://vabrato.com/api/my/saved-homes", { method: "POST", headers });
  it("accepts our own pages and refuses everything else", () => {
    expect(sameOrigin(req({ origin: "https://vabrato.com", host: "vabrato.com" }))).toBe(true);
    expect(sameOrigin(req({ origin: "https://evil.example", host: "vabrato.com" }))).toBe(false);
    expect(sameOrigin(req({ host: "vabrato.com" }))).toBe(false);
    expect(sameOrigin(req({ origin: "null", host: "vabrato.com" }))).toBe(false);
  });
});
