import { HOME_TYPES, type HomeType, type SearchFilters } from "@/lib/search-params";
import type { City } from "@/lib/public/listings";

// Search filters as a plain GET form: works without JavaScript, every result
// set is a shareable URL. No demographic filters (FH-1).

const PRICES = [500_000, 750_000, 1_000_000, 1_250_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000, 4_000_000, 5_000_000, 7_500_000, 10_000_000];
const TYPE_LABELS: Record<HomeType, string> = { house: "House", condo: "Condo", townhome: "Townhome", "multi-family": "Multi-family" };
const fmt = (n: number) => (n >= 1_000_000 ? `$${n / 1_000_000}M` : `$${n / 1_000}K`);

const box = "min-h-[44px] border border-muted bg-white px-3 font-body text-body-sm text-ink focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy";
const summary = `${box} flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden`;

export function SearchFilterBar({ filters, cities, action = "/search", label = "Search homes" }: { filters: SearchFilters; cities: City[]; action?: string; label?: string }) {
  const chosen = cities.filter((c) => filters.city.includes(c.slug));
  return (
    <form action={action} method="get" role="search" aria-label={label} className="flex flex-wrap items-end gap-2">
      {filters.tab !== "for-sale" && <input type="hidden" name="tab" value={filters.tab} />}
      <details className="relative">
        <summary className={summary}>
          <span className="sr-only">Location: </span>
          {chosen.length ? chosen.map((c) => c.name).join(", ") : "All cities"} ▾
        </summary>
        <fieldset className="absolute z-20 mt-1 max-h-80 w-72 overflow-auto border border-line bg-white p-3 shadow-card">
          <legend className="sr-only">Cities</legend>
          {["San Mateo", "Santa Clara"].map((county) => (
            <div key={county} className="mb-2">
              <p className="mb-1 font-body text-label uppercase tracking-label text-muted">{county} County</p>
              {cities
                .filter((c) => c.county === county)
                .map((c) => (
                  <label key={c.slug} className="flex min-h-[32px] items-center gap-2 font-body text-body-sm text-ink">
                    <input type="checkbox" name="city" value={c.slug} defaultChecked={filters.city.includes(c.slug)} className="h-4 w-4 accent-navy" />
                    {c.name}
                  </label>
                ))}
            </div>
          ))}
        </fieldset>
      </details>
      <label className="flex flex-col font-body text-caption text-muted">
        Min price
        <select name="minPrice" defaultValue={filters.minPrice ?? ""} className={box}>
          <option value="">No min</option>
          {PRICES.map((p) => (
            <option key={p} value={p}>
              {fmt(p)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col font-body text-caption text-muted">
        Max price
        <select name="maxPrice" defaultValue={filters.maxPrice ?? ""} className={box}>
          <option value="">No max</option>
          {PRICES.map((p) => (
            <option key={p} value={p}>
              {fmt(p)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col font-body text-caption text-muted">
        Beds
        <select name="beds" defaultValue={filters.beds ?? ""} className={box}>
          <option value="">Any</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}+ bd
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col font-body text-caption text-muted">
        Baths
        <select name="baths" defaultValue={filters.baths ?? ""} className={box}>
          <option value="">Any</option>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}+ ba
            </option>
          ))}
        </select>
      </label>
      <details className="relative">
        <summary className={summary}>Home type ▾</summary>
        <fieldset className="absolute z-20 mt-1 w-56 border border-line bg-white p-3 shadow-card">
          <legend className="sr-only">Home type</legend>
          {(Object.keys(HOME_TYPES) as HomeType[]).map((t) => (
            <label key={t} className="flex min-h-[32px] items-center gap-2 font-body text-body-sm text-ink">
              <input type="checkbox" name="type" value={t} defaultChecked={filters.type.includes(t)} className="h-4 w-4 accent-navy" />
              {TYPE_LABELS[t]}
            </label>
          ))}
        </fieldset>
      </details>
      <label className="flex flex-col font-body text-caption text-muted">
        Sort
        <select name="sort" defaultValue={filters.sort} className={box}>
          <option value="newest">Newest</option>
          <option value="price_desc">Price: high to low</option>
          <option value="price_asc">Price: low to high</option>
          <option value="beds">Most bedrooms</option>
          <option value="open_house">Next open house</option>
        </select>
      </label>
      <button type="submit" className="min-h-[44px] bg-navy px-6 font-body text-[12px] font-medium uppercase tracking-label text-white hover:bg-navy-deep focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-2">
        Search
      </button>
    </form>
  );
}
