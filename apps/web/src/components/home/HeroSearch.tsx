import { HOME_TYPES, type HomeType } from "@/lib/search-params";
import type { City } from "@/lib/public/listings";

// Hero "Buy" tab: a GET form into /search with real filter values.

const field = "min-h-[44px] w-full border-b border-muted bg-white font-body text-body-sm text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy";
const label = "font-body text-label font-medium uppercase tracking-label text-muted";
const TYPE_LABELS: Record<HomeType, string> = { house: "Houses", condo: "Condos", townhome: "Townhomes", "multi-family": "Multi-family" };

export function HeroSearch({ cities, action = "/search" }: { cities: City[]; action?: string }) {
  return (
    <form action={action} method="get" className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
      <label className="flex flex-col">
        <span className={label}>Location</span>
        <select name="city" className={field} defaultValue="">
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col">
        <span className={label}>Max price</span>
        <select name="maxPrice" className={field} defaultValue="">
          <option value="">Any</option>
          {[1_000_000, 2_000_000, 3_000_000, 4_000_000, 6_000_000].map((p) => (
            <option key={p} value={p}>
              Up to ${p / 1_000_000}M
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col">
        <span className={label}>Beds</span>
        <select name="beds" className={field} defaultValue="">
          <option value="">Any</option>
          {[2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}+
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col">
        <span className={label}>Type</span>
        <select name="type" className={field} defaultValue="">
          <option value="">Any</option>
          {(Object.keys(HOME_TYPES) as HomeType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="min-h-[48px] bg-navy px-8 font-body text-[12px] font-medium uppercase tracking-label text-white hover:bg-navy-deep focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2">
        Search
      </button>
    </form>
  );
}
