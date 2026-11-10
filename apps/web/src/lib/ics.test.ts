import { describe, expect, it } from "vitest";
import { icsEscape, openHouseIcs } from "./ics";

const base = { listing_key: "FX-001", street: "107 Sample Ct", city: "San Carlos", postal_code: "94070", address_display: true };
const make = (listing = base) =>
  openHouseIcs({ listing, openHouseKey: "OH-001", start: "2026-11-15T21:00:00Z", end: "2026-11-16T00:00:00Z", url: "https://vabrato.com/listing/FX-001/x", now: new Date("2026-11-10T00:00:00Z") });

describe("open house .ics", () => {
  it("is a valid VEVENT with CRLF line endings", () => {
    const ics = make();
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261115T210000Z\r\n");
    expect(ics).toContain("DTEND:20261116T000000Z\r\n");
    expect(ics).toContain("UID:OH-001@vabrato.com");
    expect(ics).toContain("LOCATION:107 Sample Ct\\, San Carlos\\, CA 94070");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });

  it("gives only the city when the address is hidden (review item 7)", () => {
    const ics = make({ ...base, street: "205 Fixture St", address_display: false });
    expect(ics).not.toContain("Fixture");
    expect(ics).toContain("LOCATION:San Carlos\\, CA");
    expect(ics).toContain("SUMMARY:Open house: Home in San Carlos");
  });

  it("escapes text", () => {
    expect(icsEscape("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
  });
});
