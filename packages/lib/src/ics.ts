// iCalendar (RFC 5545) helpers shared by the website (open houses, the sale
// timeline) and the console (appointment drafts, S6b PR 8). Pure functions:
// no network, no calendar is changed; a person opens the file.

/** "2026-11-17T23:00:00.000Z" → "20261117T230000Z". */
export const icsStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** RFC 5545 text escaping. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 75 octets (RFC 5545 3.1), never inside a UTF-8 character. */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length ? 74 : 75; // continuation lines start with a space
    if (bytes + n > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** Joins content lines with CRLF, folded, ending with CRLF. */
export const icsJoin = (lines: string[]) => lines.map(icsFold).join("\r\n") + "\r\n";

const PACIFIC = "America/Los_Angeles";

function pacificOffsetMinutes(utcMs: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(utcMs))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const asUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  return Math.round((asUtc - utcMs) / 60_000);
}

/**
 * A wall-clock date and time in California ("2026-11-17", "15:00") as a UTC
 * instant, daylight saving included.
 */
export function pacificToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let utc = wall - pacificOffsetMinutes(wall) * 60_000;
  utc = wall - pacificOffsetMinutes(utc) * 60_000;
  return new Date(utc);
}

export interface AppointmentIcsInput {
  /** Stable id (the approved draft's id). */
  uid: string;
  title: string;
  /** YYYY-MM-DD and HH:MM, California time. */
  date: string;
  start: string;
  minutes: number;
  location: string;
  description: string;
  now?: Date;
}

/** One appointment as a calendar file, in UTC. */
export function appointmentIcs(a: AppointmentIcsInput): string {
  const start = pacificToUtc(a.date, a.start);
  const end = new Date(start.getTime() + a.minutes * 60_000);
  return icsJoin([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vabrato Real Estate Services//Appointments//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsEscape(a.uid)}@vabrato.com`,
    `DTSTAMP:${icsStamp((a.now ?? new Date()).toISOString())}`,
    `DTSTART:${icsStamp(start.toISOString())}`,
    `DTEND:${icsStamp(end.toISOString())}`,
    `SUMMARY:${icsEscape(a.title)}`,
    ...(a.location ? [`LOCATION:${icsEscape(a.location)}`] : []),
    ...(a.description ? [`DESCRIPTION:${icsEscape(a.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ]);
}
