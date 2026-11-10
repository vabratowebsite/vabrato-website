import { describe, expect, it } from "vitest";
import { cityLine, formatPacificTime, formatPrice, formatShortPrice, listingPath, listingSlug, listingTitle, slugify, typeLine } from "./format";

const shown = { listing_key: "FX-001", street: "100 Example Way", city: "San Carlos", postal_code: "94070", address_display: true };
const hidden = { ...shown, listing_key: "FX-012", street: "205 Fixture St", city: "Los Gatos", address_display: false };

describe("format", () => {
  it("formats prices", () => {
    expect(formatPrice(2195000)).toBe("$2,195,000");
    expect(formatPrice("1200000.00")).toBe("$1,200,000");
    expect(formatPrice(null)).toBe("Price on request");
    // Mockup 02 pins: "$2.19M".
    expect(formatShortPrice(2195000)).toBe("$2.19M");
    expect(formatShortPrice(2000000)).toBe("$2M");
    expect(formatShortPrice(985000)).toBe("$985K");
  });

  it("builds card lines", () => {
    expect(typeLine({ property_sub_type: "Single Family Residence", bedrooms_total: 4, bathrooms_total: 3, living_area: 2150 })).toBe(
      "House · 4 bd · 3 ba · 2,150 sf",
    );
    expect(typeLine({ property_sub_type: "Condominium" })).toBe("Condo");
    expect(cityLine(shown)).toBe("San Carlos, CA 94070");
  });

  it("uses the street only when the address may be shown (MLS-3, review item 7)", () => {
    expect(listingTitle(shown)).toBe("100 Example Way");
    expect(listingTitle(hidden)).toBe("Home in Los Gatos");
    expect(listingSlug(shown)).toBe("100-example-way-san-carlos");
    expect(listingSlug(hidden)).toBe("los-gatos");
    expect(listingPath(hidden)).toBe("/listing/FX-012/los-gatos");
    expect(listingPath(hidden)).not.toMatch(/fixture/i);
  });

  it("slugifies safely", () => {
    expect(slugify("  Café   del Mar #4 ")).toBe("cafe-del-mar-4");
    expect(listingSlug({ ...shown, street: "!!!", city: "" })).toBe("home");
  });

  it("formats Pacific time", () => {
    expect(formatPacificTime("2026-11-11T05:46:00Z")).toBe("Nov 10, 2026, 9:46 PM PT");
  });
});
