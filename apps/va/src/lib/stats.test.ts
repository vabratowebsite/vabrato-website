import { describe, expect, it } from "vitest";
import { cmaRange, fmtMoney, fmtRatio, fmtStat, missingComps, monthLabel } from "./stats";

const comp = (listing_key: string, close: number, sqft: number) => ({ listing_key, close_price: String(close), living_area: String(sqft), price_per_sqft: String(Math.round(close / sqft)) });

describe("stats display", () => {
  it("formats money, ratios and withheld values", () => {
    expect(fmtMoney("1500000")).toBe("$1,500,000");
    expect(fmtMoney(null)).toBe("—");
    expect(fmtRatio(1.05)).toBe("105.0%");
    expect(fmtStat(null)).toBe("—");
    expect(fmtStat(1234)).toBe("1,234");
    expect(monthLabel("2026-11-01")).toBe("Nov 2026");
  });
});

describe("CMA range", () => {
  const comps = [comp("A", 1_000_000, 1000), comp("B", 1_200_000, 1000), comp("C", 1_400_000, 1000), comp("D", 1_600_000, 1000)];

  it("scales the comps' price per square foot to the subject, rounded to $5,000", () => {
    expect(cmaRange(comps, 1500)).toEqual({ comps: 4, medianPpsf: 1300, low: 1725000, mid: 1950000, high: 2175000 });
  });

  it("gives no range without a subject size or with fewer than 3 usable comps", () => {
    expect(cmaRange(comps, null)).toBeNull();
    expect(cmaRange(comps.slice(0, 2), 1500)).toBeNull();
    expect(cmaRange([...comps.slice(0, 2), { listing_key: "X", close_price: "900000", living_area: null, price_per_sqft: null }], 1500)).toBeNull();
  });

  it("lists saved comps the feed no longer returns", () => {
    expect(missingComps(["A", "GONE", "B"], [{ listing_key: "A" }, { listing_key: "B" }])).toEqual(["GONE"]);
  });
});
