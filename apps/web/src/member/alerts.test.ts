import { describe, expect, it } from "vitest";
import { feedLabel, timeAgo } from "./alerts";
import { UNSUBSCRIBE_TOKEN } from "./unsubscribe";

describe("alert feed labels", () => {
  it("labels each kind; status changes use the listing's current status", () => {
    expect(feedLabel("new_match", null)).toEqual({ label: "New match", tone: "navy" });
    expect(feedLabel("price_drop", null)).toEqual({ label: "Price reduced", tone: "red" });
    expect(feedLabel("status_change", { standard_status: "Pending" }).label).toBe("Now pending");
    expect(feedLabel("status_change", null).label).toBe("Status update");
  });

  it("says how long ago", () => {
    const now = Date.parse("2026-11-10T20:00:00Z");
    expect(timeAgo("2026-11-10T19:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-11-10T18:00:00Z", now)).toBe("2 hours ago");
    expect(timeAgo("2026-11-08T20:00:00Z", now)).toBe("2 days ago");
  });
});

describe("unsubscribe token", () => {
  it("accepts only UUID tokens", () => {
    expect(UNSUBSCRIBE_TOKEN.test("1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b")).toBe(true);
    expect(UNSUBSCRIBE_TOKEN.test("1' or '1'='1")).toBe(false);
    expect(UNSUBSCRIBE_TOKEN.test("")).toBe(false);
  });
});

describe("email postal address", () => {
  it("matches the address in the site footer", async () => {
    const { VABRATO_POSTAL_ADDRESS } = await import("@vabrato/lib");
    const { ORG, ORG_ADDRESS_LINE } = await import("@/lib/org");
    expect(VABRATO_POSTAL_ADDRESS).toBe(`${ORG.name}, ${ORG_ADDRESS_LINE}`);
  });
});
