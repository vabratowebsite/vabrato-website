import { describe, expect, it } from "vitest";
import { and, anyOf, date, eq, ge, gt, literal, ne, or, queryString, ts } from "./odata";

describe("OData query builder", () => {
  it("formats literals", () => {
    expect(literal("O'Brien Ct")).toBe("'O''Brien Ct'");
    expect(literal(1500000)).toBe("1500000");
    expect(literal(true)).toBe("true");
    expect(literal(null)).toBe("null");
    expect(literal(ts("2026-11-01T08:00:00Z"))).toBe("2026-11-01T08:00:00.000Z");
    expect(literal(date("2023-11-01T08:00:00Z"))).toBe("2023-11-01");
  });

  it("builds filters with grouping", () => {
    expect(and(gt("ModificationTimestamp", ts("2026-11-01T00:00:00Z")), eq("StandardStatus", "Active"))).toBe(
      "(ModificationTimestamp gt 2026-11-01T00:00:00.000Z) and (StandardStatus eq 'Active')",
    );
    expect(or(eq("City", "San Carlos"))).toBe("City eq 'San Carlos'");
    expect(and(undefined, false, ne("StandardStatus", "Closed"))).toBe("StandardStatus ne 'Closed'");
    expect(anyOf("ListingKey", ["A", "B"])).toBe("(ListingKey eq 'A') or (ListingKey eq 'B')");
    expect(ge("CloseDate", date("2023-01-01"))).toBe("CloseDate ge 2023-01-01");
  });

  it("rejects field names that could inject OData", () => {
    expect(() => eq("City eq 'x' or 1", "y")).toThrow(/Invalid OData field/);
    expect(() => queryString({ select: ["ListPrice,PrivateRemarks"] })).toThrow(/Invalid OData field/);
    expect(() => queryString({ orderby: "ListPrice asc; drop" })).toThrow(/orderby/);
  });

  it("rejects bad numbers and timestamps", () => {
    expect(() => literal(Number.NaN)).toThrow();
    expect(() => ts("not a date")).toThrow();
    expect(() => queryString({ top: -1 })).toThrow();
    expect(() => anyOf("ListingKey", [])).toThrow();
  });

  it("encodes the query string", () => {
    const qs = new URLSearchParams(
      queryString({ filter: eq("City", "San Carlos"), select: ["ListingKey", "ListPrice"], orderby: "ListPrice desc", top: 50, skip: 100, count: true }),
    );
    expect(Object.fromEntries(qs)).toEqual({
      $filter: "City eq 'San Carlos'",
      $select: "ListingKey,ListPrice",
      $orderby: "ListPrice desc",
      $top: "50",
      $skip: "100",
      $count: "true",
    });
  });
});
