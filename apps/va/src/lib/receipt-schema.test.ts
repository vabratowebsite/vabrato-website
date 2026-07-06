import { describe, expect, it } from "vitest";
import { parseReceiptForm } from "./receipt-schema";

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("parseReceiptForm", () => {
  it("parses a complete receipt", () => {
    const result = parseReceiptForm(
      form({ vendor: "Encore", amount: "2400", category: "Staging", receipt_date: "2026-02-10" }),
    );
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      vendor: "Encore",
      amount: 2400,
      category: "Staging",
      receipt_date: "2026-02-10",
    });
  });

  it("defaults category to Other and date to today", () => {
    const result = parseReceiptForm(form({ vendor: "Nadia", amount: "320" }));
    expect(result.error).toBeNull();
    expect(result.data?.category).toBe("Other");
    expect(result.data?.receipt_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects missing vendor, non-positive amounts, bad dates", () => {
    expect(parseReceiptForm(form({ vendor: "", amount: "10" })).error).toMatch(/Vendor/);
    expect(parseReceiptForm(form({ vendor: "X", amount: "0" })).error).toMatch(/positive/);
    expect(parseReceiptForm(form({ vendor: "X", amount: "-5" })).error).toMatch(/positive/);
    expect(
      parseReceiptForm(form({ vendor: "X", amount: "5", receipt_date: "2026-02-30" })).error,
    ).toMatch(/valid date/);
  });
});
