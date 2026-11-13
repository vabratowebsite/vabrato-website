import { describe, expect, it } from "vitest";
import { appointmentIcs, icsEscape, icsFold, pacificToUtc } from "./ics";

// S6b PR 8: calendar files shared by the website and the console. Fictional
// appointments.

describe("calendar files", () => {
  it("escapes text and folds long lines at 75 octets, never inside a character", () => {
    expect(icsEscape("Walkthrough; bring keys, notes\\list\nok")).toBe("Walkthrough\\; bring keys\\, notes\\\\list\\nok");
    const folded = icsFold(`DESCRIPTION:${"é".repeat(60)}`);
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(`DESCRIPTION:${"é".repeat(60)}`);
  });

  it("California wall-clock times become UTC, daylight saving included", () => {
    expect(pacificToUtc("2026-11-17", "15:00").toISOString()).toBe("2026-11-17T23:00:00.000Z"); // PST, UTC-8
    expect(pacificToUtc("2026-07-01", "09:30").toISOString()).toBe("2026-07-01T16:30:00.000Z"); // PDT, UTC-7
    expect(pacificToUtc("2026-03-08", "10:00").toISOString()).toBe("2026-03-08T17:00:00.000Z"); // the day DST starts
    expect(pacificToUtc("2026-11-01", "10:00").toISOString()).toBe("2026-11-01T18:00:00.000Z"); // the day DST ends
  });

  it("an appointment file: one event in UTC with its length, place and a stable id", () => {
    const ics = appointmentIcs({ uid: "draft-1", title: "Final walkthrough", date: "2026-11-17", start: "15:00", minutes: 45, location: "1 Fixture Way, Belmont", description: "With Dana", now: new Date("2026-11-13T00:00:00Z") });
    expect(ics).toContain("UID:draft-1@vabrato.com\r\n");
    expect(ics).toContain("DTSTART:20261117T230000Z\r\n");
    expect(ics).toContain("DTEND:20261117T234500Z\r\n");
    expect(ics).toContain("LOCATION:1 Fixture Way\\, Belmont\r\n");
    expect(ics).toContain("SUMMARY:Final walkthrough\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(appointmentIcs({ uid: "x", title: "T", date: "2026-11-17", start: "15:00", minutes: 30, location: "", description: "" })).not.toContain("LOCATION");
  });
});
