import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, parseSearchParams, SEARCH_FILTER_KEYS, toQueryString, toSearchArgs } from "./search-params";

describe("search params", () => {
  it("defaults to for-sale, newest, page 1", () => {
    expect(parseSearchParams({})).toEqual(DEFAULT_FILTERS);
    expect(DEFAULT_FILTERS).toMatchObject({ tab: "for-sale", sort: "newest", page: 1, city: [], type: [] });
  });

  it("round-trips through a canonical query string", () => {
    const qs = "city=belmont,san-carlos&minPrice=1500000&maxPrice=4000000&beds=3&baths=2&type=house,townhome&tab=open-houses&sort=price_asc&page=2";
    const f = parseSearchParams(new URLSearchParams(qs));
    expect(f).toMatchObject({ city: ["belmont", "san-carlos"], minPrice: 1500000, beds: 3, type: ["house", "townhome"], tab: "open-houses", page: 2 });
    expect(parseSearchParams(new URLSearchParams(toQueryString(f)))).toEqual(f);
    expect(toQueryString(DEFAULT_FILTERS)).toBe("");
  });

  it("drops invalid values instead of failing", () => {
    const f = parseSearchParams({ city: "San Carlos;drop", beds: "lots", sort: "cheapest", page: "-3", type: "castle", bbox: "1,2,3" });
    expect(f).toEqual(DEFAULT_FILTERS);
  });

  it("accepts repeated params and a map box", () => {
    const f = parseSearchParams(new URLSearchParams("city=belmont&city=san-carlos&bbox=-122.30,37.47,-122.20,37.52"));
    expect(f.city).toEqual(["belmont", "san-carlos"]);
    expect(f.bbox).toEqual([-122.3, 37.47, -122.2, 37.52]);
    expect(parseSearchParams({ bbox: "-122.2,37.47,-122.3,37.52" }).bbox).toBeUndefined();
  });

  it("maps to search_listings arguments", () => {
    const args = toSearchArgs(parseSearchParams({ type: "condo", tab: "open-houses", page: "3" }));
    expect(args).toMatchObject({ p_sub_types: ["Condominium"], p_open_houses_only: true, p_sort: "open_house", p_limit: 24, p_offset: 48, p_cities: null });
  });

  it("offers no demographic filters (FH-1)", () => {
    // The complete filter list. Adding one means reviewing it against FH-1.
    expect(SEARCH_FILTER_KEYS).toEqual(["baths", "bbox", "beds", "city", "maxPrice", "minPrice", "page", "sort", "tab", "type"]);
  });
});
