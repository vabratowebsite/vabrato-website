import { describe, expect, it } from "vitest";
import { listingQa } from "./listing-qa";

const base = {
  listing_key: "FX-012",
  street: null,
  city: "Los Gatos",
  postal_code: "95030",
  address_display: false,
  list_price: 2975000,
  list_office_name: "Example Realty Group",
  is_own_listing: false,
  data: {},
  open_houses: [{ start_time: "2026-11-15T21:00:00Z", end_time: "2026-11-16T00:00:00Z" }],
};

describe("templated listing Q&A", () => {
  it("answers from the listing's own fields", () => {
    const qa = listingQa(base);
    expect(qa.map((q) => q.q)).toEqual([
      "How much are property taxes on Home in Los Gatos?",
      "Is there an HOA?",
      "When can I see it?",
      "Who is the listing broker?",
    ]);
    expect(qa[0]!.a).toContain("$32,700");
    expect(qa[1]!.a).toBe("No HOA dues are listed for this home.");
    expect(qa[2]!.a).toContain("Sun, Nov 15 · 1–4 PM");
    expect(qa[3]!.a).toContain("Example Realty Group");
  });

  it("never talks about schools, ratings or who lives nearby (FH-1, review item 14)", () => {
    const text = JSON.stringify(listingQa({ ...base, data: { AssociationFee: 300 } })).toLowerCase();
    for (const w of ["school", "rating", "neighbors", "safe", "crime", "family", "families", "church", "demographic"]) expect(text).not.toContain(w);
  });
});
