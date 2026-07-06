// Formatting comes from @vabrato/lib; only the due-state coloring is local.
export { fmtLong, fmtShort, todayISO } from "@vabrato/lib";

import { addDays, todayISO } from "@vabrato/lib";

export function dueState(due: string, done: boolean): { color: string; label: string } {
  if (done) return { color: "#4F7A52", label: "Done" };
  const today = todayISO();
  if (due < today) return { color: "#B44A3D", label: "Overdue" };
  if (due <= addDays(today, 3)) return { color: "#BE8A2C", label: "Due soon" };
  return { color: "#9A9184", label: "Scheduled" };
}
