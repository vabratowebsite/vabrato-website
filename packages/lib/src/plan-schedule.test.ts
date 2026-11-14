import { describe, expect, it } from "vitest";
import { haversineMiles, orderTourDay, planDate, planIcs, type TourHome } from "./plan-schedule";

// Schedules (S5b PR 5): plan dates from an anchor, the tour-day order and the
// calendar file. Fictional homes and coordinates.

describe("plan dates", () => {
  it("anchor + offset, without rolling off weekends", () => {
    expect(planDate("2026-12-04", -14, "2026-11-14")).toEqual({ date: "2026-11-20", asap: false });
    expect(planDate("2026-12-04", -6, "2026-11-14")).toEqual({ date: "2026-11-28", asap: false }); // a Saturday, kept
    expect(planDate("2026-12-04", 3, "2026-11-14")).toEqual({ date: "2026-12-07", asap: false });
  });

  it("a date already past becomes today, flagged; the anchor is never moved", () => {
    expect(planDate("2026-12-04", -30, "2026-11-14")).toEqual({ date: "2026-11-14", asap: true });
    expect(planDate("2026-12-04", 0, "2026-11-14")).toEqual({ date: "2026-12-04", asap: false });
  });

  it("refuses dates that aren't ISO", () => {
    expect(() => planDate("Dec 4", -1, "2026-11-14")).toThrow();
  });
});

describe("tour day", () => {
  const home = (key: string, lat: number | null, lng: number | null, openHouse: TourHome["openHouse"] = null): TourHome => ({ key, lat, lng, openHouse });

  it("measures straight-line miles", () => {
    // About 3.6 miles between two fictional points on the Peninsula.
    const m = haversineMiles({ lat: 37.507, lng: -122.26 }, { lat: 37.485, lng: -122.2 });
    expect(m).toBeGreaterThan(3.3);
    expect(m).toBeLessThan(3.9);
  });

  it("open houses first by start time, then nearest neighbour, then homes without a location", () => {
    const stops = orderTourDay([
      home("FAR", 37.6, -122.4),
      home("HIDDEN", null, null),
      home("OH-2PM", 37.5, -122.25, { start: "14:00", end: "16:00" }),
      home("NEAR", 37.51, -122.26),
      home("OH-10AM", 37.48, -122.23, { start: "10:00", end: "12:00" }),
    ]);
    expect(stops.map((s) => s.home.key)).toEqual(["OH-10AM", "OH-2PM", "NEAR", "FAR", "HIDDEN"]);
    expect(stops[0]!.milesFromPrevious).toBeNull();
    expect(stops[2]!.milesFromPrevious).toBeGreaterThan(0);
    expect(stops[4]!.milesFromPrevious).toBeNull();
  });

  it("with no open houses, starts from the first located home given", () => {
    expect(orderTourDay([home("A", 37.5, -122.25), home("C", 37.7, -122.45), home("B", 37.52, -122.27)]).map((s) => s.home.key)).toEqual(["A", "B", "C"]);
  });
});

describe("calendar file", () => {
  it("one all-day event per item, escaped and folded", () => {
    const ics = planIcs({ name: "Moving plan", items: [{ title: "Book movers; get 3 quotes", date: "2026-11-20", detail: "Ask for a binding estimate, in writing" }], now: new Date("2026-11-14T00:00:00Z") });
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261120");
    expect(ics).toContain("DTEND;VALUE=DATE:20261121");
    expect(ics).toContain("SUMMARY:Book movers\\; get 3 quotes");
    expect(ics).toContain("DESCRIPTION:Ask for a binding estimate\\, in writing");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
