import { describe, expect, it } from "vitest";
import { fmtLong, fmtShort, todayISO } from "../format";

describe("date formatting", () => {
  it("formats independently of local timezone", () => {
    expect(fmtLong("2026-03-11")).toBe("Mar 11, 2026");
    expect(fmtShort("2026-03-11")).toBe("Wed, Mar 11");
    expect(fmtShort("2026-07-04")).toBe("Sat, Jul 4");
  });

  it("todayISO returns a valid ISO date", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
