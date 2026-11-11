import { describe, expect, it } from "vitest";
import { compSearchArgs, parseCmaSubject } from "./cma";

const src = (o: Record<string, string>) => new URLSearchParams(o);

describe("CMA subject", () => {
  it("keeps only the allowed subject keys, as numbers", () => {
    const r = parseCmaSubject(src({ city: "san-carlos", sub_type: "Condominium", beds: "3", sqft: "1500", min_beds: "2", max_beds: "4", months: "6", notes: " Corner lot. ", ClosePrice: "1" }));
    expect(r).toEqual({ ok: true, subject: { city_slug: "san-carlos", sub_type: "Condominium", beds: 3, sqft: 1500, min_beds: 2, max_beds: 4, months: 6, notes: "Corner lot." } });
  });

  it("refuses bad values", () => {
    expect(parseCmaSubject(src({ city: "" })).ok).toBe(false);
    expect(parseCmaSubject(src({ city: "san-carlos", sub_type: "Castle" })).ok).toBe(false);
    expect(parseCmaSubject(src({ city: "san-carlos", beds: "2.5" })).ok).toBe(false);
    expect(parseCmaSubject(src({ city: "san-carlos", min_beds: "4", max_beds: "2" })).ok).toBe(false);
  });

  it("turns the subject into a comps search", () => {
    expect(compSearchArgs({ city_slug: "belmont", min_sqft: 1000 })).toEqual({ p_city_slugs: ["belmont"], p_min_sqft: 1000, p_months: 6, p_limit: 30 });
  });
});
