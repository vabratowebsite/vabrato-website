import { describe, expect, it, vi } from "vitest";
import { cityStatTiles } from "./city-stats";
import { cityStats } from "./public/listings";

const stats = { months: 12, sold: { count: 6, median_price: 1_500_000, median_days_on_market: 20, median_sale_to_list: 1.05 }, market: { active: 3, months_of_inventory: 6 } };

describe("city page market stats (public_stats, MLS-10)", () => {
  it("formats tiles and shows a dash for withheld figures", () => {
    expect(cityStatTiles(stats).map((t) => t.value)).toEqual(["$1.50M", "105%", "20", "6"]);
    const few = { ...stats, sold: { count: 3, median_price: null, median_days_on_market: null, median_sale_to_list: null }, market: { active: 3, months_of_inventory: null } };
    expect(cityStatTiles(few).map((t) => t.value)).toEqual(["—", "—", "—", "—"]);
  });

  it("returns null when the flag is off, and on any error instead of breaking the page", async () => {
    const off = { rpc: vi.fn(async () => ({ data: null, error: null })) } as never;
    expect(await cityStats("san-carlos", off)).toBeNull();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const missing = { rpc: vi.fn(async () => ({ data: null, error: { message: "function public.public_city_stats does not exist" } })) } as never;
    expect(await cityStats("san-carlos", missing)).toBeNull();
    err.mockRestore();
    const on = { rpc: vi.fn(async () => ({ data: { ...stats, by_month: [] }, error: null })) } as never;
    expect(await cityStats("san-carlos", on)).toEqual(stats);
  });
});
