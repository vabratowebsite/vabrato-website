import { describe, expect, it, vi } from "vitest";
import { featuredPins, pickFeatured, type SearchRow } from "./public/listings";

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

// A fake client: featured_listings query chain, then the listing_cards RPC.
function fakeDb(pins: { data: unknown; error: { message: string } | null }, cards?: { data: unknown; error: { message: string } | null }) {
  const chain = { select: () => chain, order: () => chain, limit: async () => pins };
  return { from: vi.fn(() => chain), rpc: vi.fn(async () => cards ?? { data: [], error: null }) } as never;
}

describe("featuredPins falls back instead of breaking the home page", () => {
  it("returns no pins when featured_listings isn't there yet (0024 not applied)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeDb({ data: null, error: { message: 'relation "public.featured_listings" does not exist' } });
    expect(await featuredPins(db)).toEqual([]);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("featured pins unavailable"));
    err.mockRestore();
  });

  it("returns no pins when anon can't call listing_cards yet, or rows don't parse", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await featuredPins(fakeDb({ data: [{ listing_key: "P1" }], error: null }, { data: null, error: { message: "permission denied for function listing_cards" } }))).toEqual([]);
    expect(await featuredPins(fakeDb({ data: [{ listing_key: "P1" }], error: null }, { data: [{ listing_key: "P1" }], error: null }))).toEqual([]);
    err.mockRestore();
  });

  it("with no pins, doesn't call listing_cards", async () => {
    const db = fakeDb({ data: [], error: null }) as unknown as { rpc: ReturnType<typeof vi.fn> };
    expect(await featuredPins(db as never)).toEqual([]);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
