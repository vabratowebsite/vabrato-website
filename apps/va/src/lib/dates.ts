// Display helpers. All schedule math lives in @vabrato/lib; these only format.
// ISO strings are rendered via UTC so the shown day never shifts with the
// viewer's timezone.

export function fmtLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Today as local-calendar ISO. */
export function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function dueState(due: string, done: boolean): { color: string; label: string } {
  if (done) return { color: "#4F7A52", label: "Done" };
  const today = todayISO();
  if (due < today) return { color: "#B44A3D", label: "Overdue" };
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);
  const pad = (n: number) => String(n).padStart(2, "0");
  const soonISO = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`;
  if (due <= soonISO) return { color: "#BE8A2C", label: "Due soon" };
  return { color: "#9A9184", label: "Scheduled" };
}
