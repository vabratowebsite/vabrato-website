import { describe, expect, it } from "vitest";
import { listingBadges, openHouseLong, openHouseShort, pacificDay, toCardProps } from "./listing-view";
import type { SearchRow } from "./public/listings";

const row = (over: Partial<SearchRow> = {}): SearchRow => ({
  listing_key: "FX-001",
  listing_id: "ML8000001",
  standard_status: "Active",
  property_type: "Residential",
  property_sub_type: "Single Family Residence",
  list_price: 2195000,
  street: "107 Sample Ct",
  city: "San Carlos",
  postal_code: "94070",
  bedrooms_total: 4,
  bathrooms_total: 3,
  living_area: 2150,
  latitude: 37.51,
  longitude: -122.26,
  list_office_name: "Example Realty Group",
  is_own_listing: false,
  address_display: true,
  on_market_date: "2026-10-01",
  modification_ts: "2026-11-09T08:01:00Z",
  photo_url: "https://mock.mls.invalid/media/FX-001-P1.svg",
  photo_storage_path: null,
  next_open_house_start: null,
  next_open_house_end: null,
  total_count: 1,
  ...over,
});
const NOW = new Date("2026-11-10T12:00:00Z");

describe("listing cards", () => {
  it("formats open houses in Pacific time", () => {
    expect(openHouseShort("2026-11-15T21:00:00Z", "2026-11-16T00:00:00Z")).toBe("Sun 1–4 PM");
    expect(openHouseLong("2026-11-15T19:30:00Z", "2026-11-15T21:00:00Z")).toBe("Sun, Nov 15 · 11:30 AM–1 PM");
    expect(pacificDay("2026-11-16T05:00:00Z")).toBe("2026-11-15");
  });

  it("badges our listings, pending, open houses and new listings", () => {
    expect(listingBadges(row({ is_own_listing: true }), NOW).badges).toEqual(["ours"]);
    expect(listingBadges(row({ standard_status: "Pending" }), NOW)).toEqual({ badges: ["contingent"], badgeText: { contingent: "Pending" } });
    expect(listingBadges(row({ next_open_house_start: "2026-11-15T21:00:00Z", next_open_house_end: "2026-11-16T00:00:00Z" }), NOW).badgeText.open).toBe(
      "Open Sun 1–4 PM",
    );
    expect(listingBadges(row({ on_market_date: "2026-11-08" }), NOW).badges).toEqual(["new"]);
    expect(listingBadges(row(), NOW).badges).toEqual([]);
  });

  it("shows the IDX icon and listing broker on other brokers' listings only (MLS-2)", () => {
    expect(toCardProps(row()).attribution).toEqual({ idx: true, listingBroker: "Example Realty Group" });
    expect(toCardProps(row({ is_own_listing: true })).attribution?.idx).toBe(false);
  });

  it("never puts a hidden street on a card, and uses the placeholder for mock photos", () => {
    const card = toCardProps(row({ address_display: false, street: null, city: "Los Gatos", listing_key: "FX-012" }));
    expect(card).toMatchObject({ address: "Home in Los Gatos", href: "/listing/FX-012/los-gatos", photo: undefined });
  });
});
