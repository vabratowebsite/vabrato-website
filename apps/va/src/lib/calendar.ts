// Month-grid math for the deal calendar. month0 is 0-based (JS convention).

export interface MonthGrid {
  label: string;
  /** Sun-first grid: null cells pad the first week. */
  cells: (string | null)[];
}

export function buildMonthGrid(year: number, month0: number): MonthGrid {
  const first = new Date(Date.UTC(year, month0, 1));
  const label = first.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const startPad = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const cells: (string | null)[] = Array.from({ length: startPad }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${pad(month0 + 1)}-${pad(d)}`);
  }
  return { label, cells };
}

export function shiftMonth(
  year: number,
  month0: number,
  delta: number,
): { year: number; month0: number } {
  const d = new Date(Date.UTC(year, month0 + delta, 1));
  return { year: d.getUTCFullYear(), month0: d.getUTCMonth() };
}

export function monthOf(iso: string): { year: number; month0: number } {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  return { year: y, month0: m - 1 };
}
