// Formatting comes from @vabrato/lib; only the due state is local.
export { fmtLong, fmtShort, todayISO } from "@vabrato/lib";

import { addDays, todayISO } from "@vabrato/lib";

export type DueTone = "green" | "red" | "amber" | "muted";

/** Task due state shown as text (colour is a second cue, never the only one). */
export function dueState(due: string, done: boolean, today: string = todayISO()): { tone: DueTone; label: string } {
  if (done) return { tone: "green", label: "Done" };
  if (due < today) return { tone: "red", label: "Overdue" };
  if (due <= addDays(today, 3)) return { tone: "amber", label: "Due soon" };
  return { tone: "muted", label: "Scheduled" };
}
