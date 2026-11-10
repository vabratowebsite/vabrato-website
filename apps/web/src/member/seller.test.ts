import { describe, expect, it } from "vitest";
import { activityBars, closingHeadline, pacificToday, pickDeal, timelineItems, type SellerDeal } from "./seller";

const deal = (id: string, status: SellerDeal["status"] = "active"): SellerDeal => ({
  id,
  address: `${id} Fictional Dr`,
  ratification_date: "2026-11-04",
  days_to_close: 21,
  rent_back_days: 0,
  sale_price: null,
  status,
  listing_key: null,
});

describe("seller portal helpers", () => {
  it("counts down to closing", () => {
    expect(closingHeadline(deal("a"), "2026-11-25", "2026-11-10")).toBe("15 days to closing");
    expect(closingHeadline(deal("a"), "2026-11-11", "2026-11-10")).toBe("1 day to closing");
    expect(closingHeadline(deal("a"), "2026-11-10", "2026-11-10")).toBe("Closing today");
    expect(closingHeadline(deal("a", "closed"), "2026-11-10", "2026-11-20")).toBe("Closed");
  });

  it("shows a requested deal only when it's one of the member's", () => {
    const deals = [deal("a"), deal("b")];
    expect(pickDeal(deals, "b")?.id).toBe("b");
    expect(pickDeal(deals, "someone-elses")?.id).toBe("a");
    expect(pickDeal([], "b")).toBeNull();
  });

  it("maps milestones to done / next / upcoming", () => {
    const items = timelineItems({
      coe: "2026-11-25",
      nextIndex: 1,
      milestones: [
        { key: "ratified", label: "Contract ratified", date: "2026-11-04", complete: true },
        { key: "contingency:appraisal", label: "Appraisal contingency removal", date: "2026-11-14", complete: false },
        { key: "coe", label: "Close of escrow", date: "2026-11-25", complete: false },
      ],
    });
    expect(items.map((i) => i.state)).toEqual(["done", "next", "upcoming"]);
  });

  it("scales activity bars to the busiest week", () => {
    const w = (week_start: string, views: number) => ({ week_start, views, saves: 0, tour_requests: 0, open_house_signins: 0 });
    expect(activityBars([w("2026-10-19", 0), w("2026-10-26", 50), w("2026-11-02", 100)])).toEqual([
      { label: "Oct 19", value: 0, pct: 0 },
      { label: "Oct 26", value: 50, pct: 50 },
      { label: "Nov 2", value: 100, pct: 100 },
    ]);
    expect(activityBars([w("2026-10-19", 0)])[0]!.pct).toBe(0);
  });

  it("uses California's date, not the server's", () => {
    expect(pacificToday(new Date("2026-11-11T05:00:00Z"))).toBe("2026-11-10");
    expect(pacificToday(new Date("2026-11-11T09:00:00Z"))).toBe("2026-11-11");
  });
});
