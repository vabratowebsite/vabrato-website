import { describe, expect, it } from "vitest";
import { filterHref, fmtDuration, medianDuration, parseLeadFilters, payloadRows } from "./leads";

describe("leads helpers", () => {
  it("parses inbox filters, ignoring unknown values", () => {
    expect(parseLeadFilters({})).toEqual({ view: "new", kind: null, site: null });
    expect(parseLeadFilters({ view: "all", kind: "tour", site: "sancarloslife" })).toEqual({ view: "all", kind: "tour", site: "sancarloslife" });
    expect(parseLeadFilters({ view: "everything", kind: "'; drop", site: "x" })).toEqual({ view: "new", kind: null, site: null });
  });

  it("builds filter links that keep the other filters", () => {
    const f = parseLeadFilters({ view: "mine", kind: "tour" });
    expect(filterHref(f, { site: "vabrato" })).toBe("/leads?view=mine&kind=tour&site=vabrato");
    expect(filterHref(f, { view: "new", kind: null })).toBe("/leads");
  });

  it("shows known request details only", () => {
    expect(payloadRows({ tourDate: "2026-11-15", tourMode: "video", secret: "x", address: "" })).toEqual([
      { label: "Preferred day", value: "2026-11-15" },
      { label: "Tour type", value: "Video tour" },
    ]);
    expect(payloadRows(null)).toEqual([]);
  });

  it("formats and medians durations", () => {
    expect(fmtDuration(4_200)).toBe("4 s");
    expect(fmtDuration(185_000)).toBe("3 min");
    expect(fmtDuration(7_500_000)).toBe("2 h 5 min");
    const t = (s: number) => new Date(Date.UTC(2026, 10, 11, 0, 0, s)).toISOString();
    expect(medianDuration([{ start: t(0), end: t(10) }, { start: t(0), end: t(30) }, { start: t(0), end: null }])).toBe(20_000);
    expect(medianDuration([{ start: t(0), end: null }])).toBeNull();
  });
});
