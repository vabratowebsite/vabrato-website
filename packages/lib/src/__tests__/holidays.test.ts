import { describe, expect, it } from "vitest";
import {
  addDays,
  assertISODate,
  diffDays,
  federalHolidays,
  isBusinessDay,
  isFederalHoliday,
  isWeekend,
  rollForward,
} from "../holidays";

describe("federalHolidays", () => {
  it("2026 matches the prototype's hardcoded list exactly", () => {
    const expected = [
      "2026-01-01", // New Year's Day (Thu)
      "2026-01-19", // MLK
      "2026-02-16", // Washington's Birthday
      "2026-05-25", // Memorial Day
      "2026-06-19", // Juneteenth (Fri)
      "2026-07-03", // Independence Day observed (Jul 4 is a Saturday)
      "2026-09-07", // Labor Day
      "2026-10-12", // Columbus Day
      "2026-11-11", // Veterans Day
      "2026-11-26", // Thanksgiving
      "2026-12-25", // Christmas (Fri)
    ];
    expect([...federalHolidays(2026).keys()].sort()).toEqual(expected);
  });

  it("2027 shifts Juneteenth (Sat), July 4 (Sun), Christmas (Sat), and gains New Year's 2028 observed on Dec 31", () => {
    const days = federalHolidays(2027);
    expect(days.has("2027-06-18")).toBe(true); // Juneteenth Sat -> Fri
    expect(days.has("2027-06-19")).toBe(false);
    expect(days.has("2027-07-05")).toBe(true); // July 4 Sun -> Mon
    expect(days.has("2027-12-24")).toBe(true); // Christmas Sat -> Fri
    expect(days.has("2027-12-31")).toBe(true); // New Year's 2028 Sat -> Fri Dec 31
    expect(days.has("2027-01-01")).toBe(true); // New Year's 2027 (Fri, no shift)
    expect(days.size).toBe(12); // 11 + borrowed New Year's 2028
  });

  it("2025 floating holidays land on the documented dates", () => {
    const days = federalHolidays(2025);
    expect(days.has("2025-01-20")).toBe(true); // MLK: 3rd Monday of Jan
    expect(days.has("2025-02-17")).toBe(true); // Washington: 3rd Monday of Feb
    expect(days.has("2025-05-26")).toBe(true); // Memorial: last Monday of May
    expect(days.has("2025-09-01")).toBe(true); // Labor: 1st Monday of Sep
    expect(days.has("2025-10-13")).toBe(true); // Columbus: 2nd Monday of Oct
    expect(days.has("2025-11-27")).toBe(true); // Thanksgiving: 4th Thursday of Nov
    expect(days.size).toBe(11);
  });
});

describe("isWeekend / isBusinessDay", () => {
  it("classifies days", () => {
    expect(isWeekend("2026-03-07")).toBe(true); // Sat
    expect(isWeekend("2026-03-08")).toBe(true); // Sun
    expect(isWeekend("2026-03-09")).toBe(false); // Mon
    expect(isFederalHoliday("2026-07-03")).toBe(true);
    expect(isBusinessDay("2026-07-03")).toBe(false);
    expect(isBusinessDay("2026-11-27")).toBe(true); // day after Thanksgiving is not federal
  });
});

describe("rollForward", () => {
  it("keeps business days as-is", () => {
    expect(rollForward("2026-02-24")).toBe("2026-02-24");
  });

  it("rolls weekends to Monday", () => {
    expect(rollForward("2026-03-07")).toBe("2026-03-09");
    expect(rollForward("2026-03-08")).toBe("2026-03-09");
  });

  it("rolls an observed-holiday Friday across the weekend", () => {
    expect(rollForward("2026-07-03")).toBe("2026-07-06");
  });

  it("rolls Thanksgiving to the (working) Friday after", () => {
    expect(rollForward("2026-11-26")).toBe("2026-11-27");
  });

  it("crosses a holiday+weekend cluster and a year boundary", () => {
    expect(rollForward("2027-12-24")).toBe("2027-12-27"); // observed Xmas + weekend
    expect(rollForward("2027-12-31")).toBe("2028-01-03"); // observed New Year's + weekend
  });
});

describe("date math", () => {
  it("addDays crosses months, years, and leap days", () => {
    expect(addDays("2026-02-24", 15)).toBe("2026-03-11");
    expect(addDays("2027-12-31", 1)).toBe("2028-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // leap year
    expect(addDays("2026-03-11", -15)).toBe("2026-02-24");
  });

  it("diffDays is the inverse of addDays", () => {
    expect(diffDays("2026-02-24", "2026-03-11")).toBe(15);
    expect(diffDays("2026-03-11", "2026-02-24")).toBe(-15);
  });

  it("assertISODate rejects malformed and impossible dates", () => {
    expect(() => assertISODate("2026-02-24")).not.toThrow();
    expect(() => assertISODate("2026-2-24")).toThrow(/Invalid ISO date/);
    expect(() => assertISODate("02/24/2026")).toThrow(/Invalid ISO date/);
    expect(() => assertISODate("2026-02-30")).toThrow(/Invalid ISO date/);
    expect(() => assertISODate("2026-13-01")).toThrow(/Invalid ISO date/);
  });
});
