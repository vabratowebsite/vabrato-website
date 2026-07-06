// Date math + US federal holidays, computed for any year (the prototype's
// hardcoded 2026 list falls out of these rules exactly).
//
// All dates are ISO `yyyy-mm-dd` strings; math runs in UTC so results never
// depend on the machine's timezone. Holidays use *observed* dates: a fixed
// holiday falling on Saturday is observed the Friday before, Sunday the
// Monday after (so New Year's can be observed on Dec 31 of the prior year).

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Validates shape and calendar reality (rejects e.g. 2026-02-30). */
export function assertISODate(iso: string): void {
  if (!ISO_RE.test(iso) || toISO(toUTC(iso)) !== iso) {
    throw new Error(`Invalid ISO date: ${JSON.stringify(iso)} (expected yyyy-mm-dd)`);
  }
}

export function addDays(iso: string, n: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** Days from `fromISO` to `toISOStr` (positive when `toISOStr` is later). */
export function diffDays(fromISO: string, toISOStr: string): number {
  return Math.round((toUTC(toISOStr).getTime() - toUTC(fromISO).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: string): number {
  return toUTC(iso).getUTCDay();
}

export function isWeekend(iso: string): boolean {
  const dow = dayOfWeek(iso);
  return dow === 0 || dow === 6;
}

const MONDAY = 1;
const THURSDAY = 4;

/** nth (1-based) occurrence of `weekday` in `month` (1-based) of `year`. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const firstDow = dayOfWeek(`${year}-${String(month).padStart(2, "0")}-01`);
  const day = 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const lastDay = toISO(new Date(Date.UTC(year, month, 0)));
  const back = (dayOfWeek(lastDay) - weekday + 7) % 7;
  return addDays(lastDay, -back);
}

/** Observed date for a fixed-date holiday: Sat → Fri before, Sun → Mon after. */
function observed(iso: string): string {
  const dow = dayOfWeek(iso);
  if (dow === 6) return addDays(iso, -1);
  if (dow === 0) return addDays(iso, 1);
  return iso;
}

function rawHolidays(year: number): [string, string][] {
  return [
    [observed(`${year}-01-01`), "New Year's Day"],
    [nthWeekday(year, 1, MONDAY, 3), "Birthday of Martin Luther King, Jr."],
    [nthWeekday(year, 2, MONDAY, 3), "Washington's Birthday"],
    [lastWeekday(year, 5, MONDAY), "Memorial Day"],
    [observed(`${year}-06-19`), "Juneteenth National Independence Day"],
    [observed(`${year}-07-04`), "Independence Day"],
    [nthWeekday(year, 9, MONDAY, 1), "Labor Day"],
    [nthWeekday(year, 10, MONDAY, 2), "Columbus Day"],
    [observed(`${year}-11-11`), "Veterans Day"],
    [nthWeekday(year, 11, THURSDAY, 4), "Thanksgiving Day"],
    [observed(`${year}-12-25`), "Christmas Day"],
  ];
}

const holidayCache = new Map<number, Map<string, string>>();

/** Observed US federal holidays falling within `year`, ISO date → name. */
export function federalHolidays(year: number): Map<string, string> {
  let map = holidayCache.get(year);
  if (!map) {
    map = new Map();
    // Adjacent years contribute when an observed date crosses the boundary
    // (e.g. New Year's observed Dec 31 of the prior year).
    for (const y of [year - 1, year, year + 1]) {
      for (const [iso, name] of rawHolidays(y)) {
        if (iso.startsWith(`${year}-`)) map.set(iso, name);
      }
    }
    holidayCache.set(year, map);
  }
  return map;
}

export function federalHolidayName(iso: string): string | null {
  return federalHolidays(Number(iso.slice(0, 4))).get(iso) ?? null;
}

export function isFederalHoliday(iso: string): boolean {
  return federalHolidayName(iso) !== null;
}

export function isBusinessDay(iso: string): boolean {
  return !isWeekend(iso) && !isFederalHoliday(iso);
}

/** The date itself if it's a business day, else the next business day. */
export function rollForward(iso: string): string {
  let d = iso;
  while (!isBusinessDay(d)) d = addDays(d, 1);
  return d;
}
