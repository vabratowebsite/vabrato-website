import type { CityStats } from "./public/listings";

// City page market tiles (behind public_stats, MLS-10). Withheld medians
// (fewer than 5 sales) show as a dash, never a guess.

const money = (n: number | null) => (n == null ? "—" : `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`);

export function cityStatTiles(s: CityStats): { value: string; label: string }[] {
  return [
    { value: money(s.sold.median_price), label: "Median sale price" },
    { value: s.sold.median_sale_to_list == null ? "—" : `${Math.round(s.sold.median_sale_to_list * 100)}%`, label: "Sale to list price" },
    { value: s.sold.median_days_on_market == null ? "—" : String(s.sold.median_days_on_market), label: "Median days on market" },
    { value: s.market.months_of_inventory == null ? "—" : String(s.market.months_of_inventory), label: "Months of inventory" },
  ];
}
