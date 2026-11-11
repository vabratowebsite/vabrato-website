import { PT } from "./today";

// Featured listings on the website's home page (S6 PR 4, 0024). Staff pin
// listings; the home page shows live pins first, then our own listings, then
// the newest others. Dates are Pacific days.

/** Midnight Pacific time at the start of a YYYY-MM-DD day, as an ISO instant. */
export function ptDayStart(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const guess = Date.UTC(y, mo - 1, d, 8); // PST midnight; adjusted below for PDT
  const check = new Date(guess);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: PT, hour: "numeric", hourCycle: "h23" }).format(check));
  return new Date(guess - hour * 3_600_000).toISOString();
}

/** End of a YYYY-MM-DD Pacific day (midnight starting the next day): "show until" dates are inclusive. */
export function ptDayEnd(day: string): string | null {
  if (!ptDayStart(day)) return null;
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return ptDayStart(new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10));
}

/** YYYY-MM-DD (Pacific) for a date input's default value. */
export function ptDay(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export type PinState = "live" | "scheduled" | "ended" | "not_for_sale";

export function pinState(pin: { starts_at: string | null; ends_at: string | null }, forSale: boolean, now: Date = new Date()): PinState {
  if (pin.ends_at && Date.parse(pin.ends_at) <= now.getTime()) return "ended";
  if (pin.starts_at && Date.parse(pin.starts_at) > now.getTime()) return "scheduled";
  return forSale ? "live" : "not_for_sale";
}

export const PIN_LABEL: Record<PinState, string> = {
  live: "On the home page",
  scheduled: "Scheduled",
  ended: "Ended",
  not_for_sale: "Hidden: not for sale",
};
