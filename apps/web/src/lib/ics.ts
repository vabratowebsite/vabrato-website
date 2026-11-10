import { listingTitle, type AddressParts } from "./format";

// iCalendar file for "Add to calendar" on an open house. The location is the
// street only when the address may be shown (review item 7).

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** RFC 5545 text escaping. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds lines longer than 75 octets (RFC 5545 3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function openHouseIcs(opts: {
  listing: AddressParts;
  openHouseKey: string;
  start: string;
  end: string | null;
  url: string;
  now?: Date;
}): string {
  const { listing } = opts;
  const title = listingTitle(listing);
  const location =
    listing.address_display && listing.street
      ? `${listing.street}, ${listing.city ?? ""}, CA ${listing.postal_code ?? ""}`.trim()
      : `${listing.city ?? ""}, CA`;
  const end = opts.end ?? new Date(Date.parse(opts.start) + 2 * 3_600_000).toISOString();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vabrato Real Estate Services//Open houses//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsEscape(opts.openHouseKey)}@vabrato.com`,
    `DTSTAMP:${stamp((opts.now ?? new Date()).toISOString())}`,
    `DTSTART:${stamp(opts.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${icsEscape(`Open house: ${title}`)}`,
    `LOCATION:${icsEscape(location)}`,
    `DESCRIPTION:${icsEscape(`Details: ${opts.url}`)}`,
    `URL:${icsEscape(opts.url)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
