import { describe, expect, it } from "vitest";
import { pickFeatured, type SearchRow } from "./public/listings";

const row = (listing_key: string) => ({ listing_key }) as SearchRow;

describe("home page featured listings", () => {
  it("puts staff pins first, then our listings, then the newest, without repeats", () => {
    const keys = pickFeatured([row("P1")], [row("O1"), row("P1")], [row("N1"), row("O1"), row("N2")]).map((r) => r.listing_key);
    expect(keys).toEqual(["P1", "O1", "N1"]);
  });
  it("works with no pins", () => {
    expect(pickFeatured([], [row("O1")], [row("N1"), row("N2"), row("N3")]).map((r) => r.listing_key)).toEqual(["O1", "N1", "N2"]);
  });
});
