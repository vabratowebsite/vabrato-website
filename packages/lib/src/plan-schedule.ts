import { addDays, assertISODate, diffDays } from "./holidays";
import { icsEscape, icsJoin, icsStamp } from "./ics";

// Ask Vabrato's schedules (S5b PR 5), pure helpers: a plan item's date from
// an anchor date, the order of a tour day, and a calendar file. The anchor
// for a sale comes from the schedule engine (dates of record); this file
// never moves it. No network, no model code.

export interface PlanDate {
  /** ISO date. */
  date: string;
  /** The planned date had already passed: do it as soon as possible (date = today). */
  asap: boolean;
}

/** anchor + offsetDays; a date already past becomes today, flagged. Moving tasks may fall on a weekend, so nothing is rolled. */
export function planDate(anchor: string, offsetDays: number, today: string): PlanDate {
  assertISODate(anchor);
  assertISODate(today);
  const date = addDays(anchor, Math.trunc(offsetDays));
  return diffDays(today, date) < 0 ? { date: today, asap: true } : { date, asap: false };
}

// --- Tour day -----------------------------------------------------------------------------------

export interface TourHome {
  key: string;
  /** Null when the seller hid the address (MLS-3): such homes go last, without distances. */
  lat: number | null;
  lng: number | null;
  /** An open house on the tour date, local "HH:MM" times. */
  openHouse: { start: string; end: string | null } | null;
}

export interface TourStop<H extends TourHome> {
  home: H;
  /** Straight-line miles from the stop before (not driving distance); null for the first stop or without coordinates. */
  milesFromPrevious: number | null;
}

/** Great-circle distance in miles. */
export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const hasPoint = (h: TourHome): h is TourHome & { lat: number; lng: number } => typeof h.lat === "number" && typeof h.lng === "number";

/**
 * The order for a tour day: homes with an open house that day first, by start
 * time; then the rest by nearest neighbour from the last stop; homes without
 * coordinates last. Distances are straight lines, not driving.
 */
export function orderTourDay<H extends TourHome>(homes: H[]): TourStop<H>[] {
  const open = homes.filter((h) => h.openHouse).sort((a, b) => a.openHouse!.start.localeCompare(b.openHouse!.start));
  const rest = homes.filter((h) => !h.openHouse);
  const located = rest.filter(hasPoint);
  const unlocated = rest.filter((h) => !hasPoint(h));
  const order: H[] = [...open];
  const pool = [...located];
  const lastOpen = [...open].reverse().find((h) => hasPoint(h));
  let from: { lat: number; lng: number } | undefined = lastOpen && hasPoint(lastOpen) ? { lat: lastOpen.lat, lng: lastOpen.lng } : undefined;
  while (pool.length) {
    let best = 0;
    if (from) {
      let bestMiles = Infinity;
      pool.forEach((h, i) => {
        const m = haversineMiles(from!, { lat: h.lat as number, lng: h.lng as number });
        if (m < bestMiles) [bestMiles, best] = [m, i];
      });
    }
    const [next] = pool.splice(best, 1);
    order.push(next!);
    from = { lat: next!.lat as number, lng: next!.lng as number };
  }
  order.push(...unlocated);
  return order.map((home, i) => {
    const prev = order[i - 1];
    const miles = prev && hasPoint(prev) && hasPoint(home) ? Math.round(haversineMiles(prev, home) * 10) / 10 : null;
    return { home, milesFromPrevious: miles };
  });
}

// --- Calendar ------------------------------------------------------------------------------------

export interface PlanIcsItem {
  title: string;
  /** ISO date: an all-day event. */
  date: string;
  detail?: string;
}

/** A plan as all-day calendar events, for the member's own calendar. Nothing is sent anywhere. */
export function planIcs(opts: { name: string; items: PlanIcsItem[]; now?: Date }): string {
  const day = (iso: string) => iso.replace(/-/g, "");
  const stamp = icsStamp((opts.now ?? new Date()).toISOString());
  const events = opts.items.flatMap((it, i) => {
    assertISODate(it.date);
    return [
      "BEGIN:VEVENT",
      `UID:plan-${stamp}-${i}@vabrato.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(it.date)}`,
      `DTEND;VALUE=DATE:${day(addDays(it.date, 1))}`,
      `SUMMARY:${icsEscape(it.title)}`,
      ...(it.detail ? [`DESCRIPTION:${icsEscape(it.detail)}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    ];
  });
  return icsJoin(["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//Vabrato Real Estate Services//${icsEscape(opts.name)}//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...events, "END:VCALENDAR"]);
}
