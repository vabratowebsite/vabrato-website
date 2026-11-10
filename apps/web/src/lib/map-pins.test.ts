import { describe, expect, it } from "vitest";
import { mapPins, pinBounds } from "./map-pins";
import type { SearchRow } from "./public/listings";

const r = (key: string, over: Partial<SearchRow>): SearchRow =>
  ({ listing_key: key, listing_id: null, standard_status: "Active", property_type: null, property_sub_type: null, list_price: 2195000, street: "1 Example Way", city: "Belmont", postal_code: null, bedrooms_total: null, bathrooms_total: null, living_area: null, latitude: 37.5, longitude: -122.3, list_office_name: null, is_own_listing: false, address_display: true, on_market_date: null, modification_ts: "", photo_url: null, photo_storage_path: null, next_open_house_start: null, next_open_house_end: null, total_count: 2, ...over }) as SearchRow;

describe("map pins", () => {
  it("pins only listings whose address may be shown", () => {
    const pins = mapPins([r("A", { is_own_listing: true }), r("B", { address_display: false, latitude: null, longitude: null })]);
    expect(pins).toEqual([{ key: "A", lng: -122.3, lat: 37.5, label: "$2.19M", title: "1 Example Way", href: "/listing/A/1-example-way-belmont", ours: true }]);
  });

  it("fits bounds around the pins", () => {
    expect(pinBounds([])).toBeNull();
    expect(pinBounds(mapPins([r("A", {}), r("C", { latitude: 37.6, longitude: -122.1 })]), 0)).toEqual([
      [-122.3, 37.5],
      [-122.1, 37.6],
    ]);
  });
});
