// Market statistics and CMA display helpers (S6 PR 5). Pure functions so
// they unit-test without a database.

export const fmtMoney = (n: number | string | null | undefined) => {
  const v = n == null || n === "" ? NaN : Number(n);
  return Number.isFinite(v) ? `$${Math.round(v).toLocaleString("en-US")}` : "—";
};

/** "—" plus a reason for a withheld median, so the page never shows a made-up number. */
export const fmtStat = (v: number | null | undefined, format: (n: number) => string = (n) => n.toLocaleString("en-US")) => (v == null ? "—" : format(v));

export const fmtRatio = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

export const monthLabel = (iso: string) => {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};

export interface Comp {
  listing_key: string;
  close_price: number | string | null;
  living_area: number | string | null;
  price_per_sqft: number | string | null;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export interface CmaRange {
  comps: number;
  medianPpsf: number;
  low: number;
  mid: number;
  high: number;
}

/**
 * A price range for the subject from the chosen comps' price per square
 * foot (25th, 50th and 75th percentile × subject size), rounded to $5,000.
 * Null without a subject size or with fewer than 3 usable comps. This is a
 * comparison of recent sales, not an appraisal (the page says so).
 */
export function cmaRange(comps: Comp[], subjectSqft: number | null): CmaRange | null {
  if (!subjectSqft || subjectSqft <= 0) return null;
  const ppsf = comps
    .map((c) => Number(c.price_per_sqft ?? (Number(c.close_price) / Number(c.living_area))))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (ppsf.length < 3) return null;
  const round = (n: number) => Math.round(n / 5000) * 5000;
  return {
    comps: ppsf.length,
    medianPpsf: Math.round(quantile(ppsf, 0.5)),
    low: round(quantile(ppsf, 0.25) * subjectSqft),
    mid: round(quantile(ppsf, 0.5) * subjectSqft),
    high: round(quantile(ppsf, 0.75) * subjectSqft),
  };
}

/** Keys saved on a CMA that the feed no longer returns (left the feed or no longer sold). */
export const missingComps = (saved: string[], found: { listing_key: string }[]) => saved.filter((k) => !found.some((f) => f.listing_key === k));
