import { describe, expect, it } from "vitest";
import { cityFaq } from "./city-faq";

describe("templated city FAQ", () => {
  it("answers without statistics, ratings or demographics (MLS-10, FH-1)", () => {
    const faq = cityFaq({ name: "Belmont", county: "San Mateo" });
    expect(faq).toHaveLength(4);
    const text = JSON.stringify(faq).toLowerCase();
    expect(text).not.toMatch(/\d+ (homes|listings)|median|average|\$|rating|ranked|safe|crime|families|demographic/);
    expect(faq[3]!.a).toBe("Belmont is in San Mateo County, California.");
  });
});
