// Appointment drafts and call notes (S6b PR 8): types, limits and the date
// wording, shared by pages, client components and the server. No model code.

export interface AppointmentFields {
  title: string;
  /** YYYY-MM-DD, California time; "" when not known yet. */
  date: string;
  /** HH:MM, 24-hour, California time; "" when not known yet. */
  start: string;
  /** Length in minutes; null when not known yet. */
  minutes: number | null;
  location: string;
  /** Who it's with (first names), as the person wants it shown. */
  with: string;
}

export const APPT_LIMITS = { title: 120, location: 200, with: 120, sentence: 500, minMinutes: 15, maxMinutes: 480, firstTime: "07:00", lastTime: "21:00" } as const;
export const CALL_LIMITS = { notes: 2000, todos: 8, todoTitle: 120, maxDays: 60 } as const;

export const LENGTH_CHOICES = [15, 30, 45, 60, 90, 120, 180, 240] as const;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date "YYYY-MM-DD", or null. */
export function validDate(s: string | null | undefined): string | null {
  const m = s ? ISO.exec(s.trim()) : null;
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? s!.trim() : null;
}

/** YYYY-MM-DD plus n days. */
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "HH:MM" from 07:00 to 21:00 in 5-minute steps, or null. */
export function validTime(s: string | null | undefined): string | null {
  const m = s ? /^(\d{2}):(\d{2})$/.exec(s.trim()) : null;
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59 || min % 5 !== 0) return null;
  const t = s!.trim();
  return t >= APPT_LIMITS.firstTime && t <= APPT_LIMITS.lastTime ? t : null;
}

/** "3:00 PM". */
export function timeText(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "Tuesday, November 17 at 3:00 PM": how the confirmation must state the time. */
export function whenText(date: string, start: string): string {
  const d = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  return `${d} at ${timeText(start)}`;
}

/** "45 minutes", "1 hour", "1 hour 30 minutes". */
export function lengthText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h ? `${h} ${h === 1 ? "hour" : "hours"}` : "";
  const mins = m ? `${m} minutes` : "";
  return [hours, mins].filter(Boolean).join(" ");
}

/** Today in California, YYYY-MM-DD. */
export const pacificToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

export const CALL_NOTE_LINES = {
  suggested: "Suggested by the assistant from your notes. Check each to-do; nothing is added until you add it.",
  notKeptDeal: "Your notes aren't kept.",
  notKeptLead: "Your notes aren't kept unless you tick the box.",
} as const;
export const APPT_LINES = {
  noBooking: "Nothing goes on a calendar unless you open the calendar file. The console books nothing.",
} as const;
