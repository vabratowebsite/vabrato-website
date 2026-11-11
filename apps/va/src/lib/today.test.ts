import { describe, expect, it } from "vitest";
import { feedRows, fmtWhen, leadKindLabel, shortName } from "./today";

const NOW = new Date("2026-11-11T20:00:00Z"); // 12:00 PM Pacific

describe("Today helpers", () => {
  it("formats times in Pacific, with the date when not today", () => {
    expect(fmtWhen("2026-11-11T19:46:00Z", NOW)).toBe("11:46 AM");
    expect(fmtWhen("2026-11-10T10:17:00Z", NOW)).toBe("Nov 10, 2:17 AM");
    expect(fmtWhen(null, NOW)).toBe("never");
  });

  it("summarises the MLS feed, flagging stale or failed runs in words", () => {
    const rows = feedRows(
      { last_success_at: "2026-11-11T19:46:00Z", last_failure_at: null, last_status: "succeeded", stale: false },
      [
        { kind: "incremental", status: "succeeded", finished_at: "2026-11-11T19:46:00Z", counts: { upserted: 37, media: 212 } },
        { kind: "reconcile", status: "succeeded", finished_at: "2026-11-11T10:17:00Z", counts: { removed: 4 } },
      ],
      NOW,
    );
    expect(rows.map((r) => `${r.label}: ${r.value}`)).toEqual([
      "Sync health: OK",
      "Last incremental sync: 11:46 AM · OK",
      "Changed in last run: 37 listings · 212 photos",
      "Nightly reconcile: 2:17 AM · 4 removed",
    ]);
    expect(feedRows({ last_success_at: null, last_failure_at: null, last_status: null, stale: true }, [], NOW)[0]).toEqual({ label: "Sync health", value: "No successful sync yet", tone: "red" });
  });

  it("labels lead kinds and shortens names", () => {
    expect(leadKindLabel("open_house_signin")).toBe("Open-house sign-in");
    expect(shortName("Jordan Lee Example", "j@example.test")).toBe("J. Example");
    expect(shortName(null, "casey@example.test")).toBe("casey");
  });
});
