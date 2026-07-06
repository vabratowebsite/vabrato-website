import { describe, expect, it } from "vitest";
import { parsePropertyForm } from "./property-schema";

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("parsePropertyForm", () => {
  it("parses with defaults", () => {
    const result = parsePropertyForm(form({ address: "12 Elm St, San Mateo" }));
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      address: "12 Elm St, San Mateo",
      source: null,
      status: "watching",
    });
  });

  it("keeps a provided source and status", () => {
    const result = parsePropertyForm(
      form({ address: "9 Oak Ave", source: "Zillow", status: "offer_made" }),
    );
    expect(result.data).toMatchObject({ source: "Zillow", status: "offer_made" });
  });

  it("rejects blank address and unknown status", () => {
    expect(parsePropertyForm(form({ address: "  " })).error).toMatch(/Address/);
    expect(parsePropertyForm(form({ address: "9 Oak", status: "dreaming" })).error).toBeTruthy();
  });
});
