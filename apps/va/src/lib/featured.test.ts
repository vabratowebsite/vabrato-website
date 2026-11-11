import { describe, expect, it } from "vitest";
import { pinState, ptDay, ptDayEnd, ptDayStart } from "./featured";

describe("featured pins", () => {
  it("turns a Pacific day into its midnight instant, in winter and summer", () => {
    expect(ptDayStart("2026-12-01")).toBe("2026-12-01T08:00:00.000Z");
    expect(ptDayStart("2026-07-04")).toBe("2026-07-04T07:00:00.000Z");
    expect(ptDayStart("2026-02-30")).toBeNull();
    expect(ptDayStart("12/01/2026")).toBeNull();
    // Inclusive last day, across the November DST change and a month end.
    expect(ptDayEnd("2026-10-31")).toBe("2026-11-01T07:00:00.000Z");
    expect(ptDayEnd("2026-11-01")).toBe("2026-11-02T08:00:00.000Z");
    expect(ptDayEnd("2026-02-31")).toBeNull();
  });

  it("formats an instant as its Pacific day", () => {
    expect(ptDay("2026-12-01T07:59:00Z")).toBe("2026-11-30");
    expect(ptDay(null)).toBe("");
  });

  it("says whether a pin shows now", () => {
    const now = new Date("2026-11-11T20:00:00Z");
    expect(pinState({ starts_at: null, ends_at: null }, true, now)).toBe("live");
    expect(pinState({ starts_at: null, ends_at: null }, false, now)).toBe("not_for_sale");
    expect(pinState({ starts_at: "2026-11-12T08:00:00Z", ends_at: null }, true, now)).toBe("scheduled");
    expect(pinState({ starts_at: null, ends_at: "2026-11-11T08:00:00Z" }, true, now)).toBe("ended");
  });
});
