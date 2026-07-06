import { describe, expect, it } from "vitest";
import { parseDealForm } from "./deal-schema";

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const VALID = {
  address: "501 W Fox Ct, Redwood City",
  escrow_number: "FSMO-10825000849",
  seller_name: "Dana Whitfield",
  seller_type: "normal",
  ratification_date: "2026-02-24",
  days_to_close: "15",
  rent_back_days: "0",
  sale_price: "1175000",
};

describe("parseDealForm", () => {
  it("parses a complete form", () => {
    const result = parseDealForm(form(VALID));
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      address: "501 W Fox Ct, Redwood City",
      escrow_number: "FSMO-10825000849",
      seller_name: "Dana Whitfield",
      seller_type: "normal",
      ratification_date: "2026-02-24",
      days_to_close: 15,
      rent_back_days: 0,
      sale_price: 1175000,
    });
  });

  it("treats blank optional fields as empty/null", () => {
    const result = parseDealForm(
      form({ ...VALID, escrow_number: "", seller_name: "", sale_price: "" }),
    );
    expect(result.error).toBeNull();
    expect(result.data?.sale_price).toBeNull();
    expect(result.data?.escrow_number).toBe("");
  });

  it("defaults rent_back_days to 0 when omitted", () => {
    const { rent_back_days: _omit, ...rest } = VALID;
    const result = parseDealForm(form(rest));
    expect(result.error).toBeNull();
    expect(result.data?.rent_back_days).toBe(0);
  });

  it("rejects a missing address", () => {
    const result = parseDealForm(form({ ...VALID, address: "  " }));
    expect(result.error).toMatch(/address/i);
  });

  it("rejects impossible dates and out-of-range numbers", () => {
    expect(parseDealForm(form({ ...VALID, ratification_date: "2026-02-30" })).error).toMatch(
      /ratification_date/,
    );
    expect(parseDealForm(form({ ...VALID, days_to_close: "0" })).error).toMatch(/days_to_close/);
    expect(parseDealForm(form({ ...VALID, rent_back_days: "91" })).error).toMatch(
      /rent_back_days/,
    );
    expect(parseDealForm(form({ ...VALID, seller_type: "llc" })).error).toMatch(/seller_type/);
  });
});
