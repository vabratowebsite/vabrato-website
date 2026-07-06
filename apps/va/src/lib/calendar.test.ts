import { describe, expect, it } from "vitest";
import { buildMonthGrid, monthOf, shiftMonth } from "./calendar";

describe("buildMonthGrid", () => {
  it("pads to the first weekday and includes every day", () => {
    // March 2026 starts on a Sunday (no pad), 31 days.
    const march = buildMonthGrid(2026, 2);
    expect(march.label).toBe("March 2026");
    expect(march.cells[0]).toBe("2026-03-01");
    expect(march.cells).toHaveLength(31);

    // February 2026 starts on a Sunday too; check a padded month: May 2026 starts Friday.
    const may = buildMonthGrid(2026, 4);
    expect(may.cells.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(may.cells[5]).toBe("2026-05-01");
    expect(may.cells.at(-1)).toBe("2026-05-31");
  });

  it("handles leap February", () => {
    const feb = buildMonthGrid(2028, 1);
    expect(feb.cells.filter(Boolean)).toHaveLength(29);
  });
});

describe("shiftMonth / monthOf", () => {
  it("wraps across year boundaries", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month0: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month0: 11 });
  });

  it("monthOf reads an ISO date", () => {
    expect(monthOf("2026-02-24")).toEqual({ year: 2026, month0: 1 });
  });
});
