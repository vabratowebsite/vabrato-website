import { KpiTile, Panel } from "@vabrato/ui/web";
import type { MarketStats } from "@vabrato/db";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { MlsAttribution } from "@/components/mls-attribution";
import { btnSecondary, inputCls, labelCls, mutedCls } from "@/components/ui";
import { requireSignIn } from "@/lib/staff";
import { fmtMoney, fmtRatio, fmtStat, monthLabel } from "@/lib/stats";
import { supabaseServer } from "@/lib/supabase-server";

// Market statistics (S6 PR 5): sold-listing aggregates per city, computed in
// the database (0025 market_stats). Off until MLSListings confirms sold data
// in writing (market_stats_enabled). Medians from fewer than 5 sales are
// withheld.
export const dynamic = "force-dynamic";

const PERIODS = [3, 6, 12, 24];

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ city?: string; months?: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: cities } = await supabase.from("cities").select("slug, name, county").order("priority", { ascending: false }).order("name");
  const city = (cities ?? []).some((c) => c.slug === sp.city) ? sp.city! : (cities?.[0]?.slug ?? "san-carlos");
  const months = PERIODS.includes(Number(sp.months)) ? Number(sp.months) : 12;
  const [{ data }, { data: lastUpdated }] = await Promise.all([supabase.rpc("market_stats", { p_slug: city, p_months: months }), supabase.rpc("mls_last_updated")]);
  const stats = data as unknown as MarketStats | { enabled: false } | null;

  return (
    <ConsoleShell profile={profile} current="stats" eyebrow="Reports" title="Market stats">
      {!stats || stats.enabled === false ? (
        <Panel title="Off for now">
          <p className="font-body text-body-sm text-ink">
            Market statistics use sold listings. They stay off until MLSListings confirms in writing that we may use sold data and statistics derived from it (the <code>market_stats_enabled</code> flag). Everything is built and tested on fictional data.
          </p>
        </Panel>
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="city" className={labelCls}>
                City
              </label>
              <select id="city" name="city" defaultValue={city} className={`${inputCls} mt-1`}>
                {(cities ?? []).map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name} ({c.county})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="months" className={labelCls}>
                Period
              </label>
              <select id="months" name="months" defaultValue={String(months)} className={`${inputCls} mt-1`}>
                {PERIODS.map((m) => (
                  <option key={m} value={m}>
                    Last {m} months
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={btnSecondary}>
              Show
            </button>
          </form>

          <Panel title={`${stats.city_name}, last ${stats.months} months`}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiTile value={fmtStat(stats.sold.count)} label="Homes sold" />
              <KpiTile value={fmtMoney(stats.sold.median_price)} label="Median sale price" />
              <KpiTile value={stats.sold.median_price_per_sqft == null ? "—" : `${fmtMoney(stats.sold.median_price_per_sqft)}/sq ft`} label="Median price per sq ft" />
              <KpiTile value={fmtRatio(stats.sold.median_sale_to_list)} label="Median sale to list" />
              <KpiTile value={fmtStat(stats.sold.median_days_on_market)} label="Median days on market" />
              <KpiTile value={fmtStat(stats.market.active)} label="Active now" />
              <KpiTile value={fmtStat(stats.market.pending)} label="Pending or in contract" />
              <KpiTile value={fmtStat(stats.market.months_of_inventory)} label="Months of inventory" />
            </div>
            <p className={`${mutedCls} mt-4`}>“—” means fewer than {stats.min_sales_for_medians} sales, too few for a fair median. Months of inventory = active listings ÷ average monthly sales.</p>
          </Panel>

          <Panel title="By month">
            <div className="overflow-x-auto" role="region" aria-label="Sales by month" tabIndex={0}>
              <table className="w-full min-w-[360px] font-body text-body-sm text-ink">
                <thead>
                  <tr className="border-b border-line text-left text-label uppercase tracking-label text-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Month</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Sold</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Median price</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.by_month.map((m) => (
                    <tr key={m.month} className="border-b border-line">
                      <th scope="row" className="py-2 pr-4 text-left font-normal">{monthLabel(m.month)}</th>
                      <td className="py-2 pr-4 text-right">{m.sold}</td>
                      <td className="py-2 pr-4 text-right">{fmtMoney(m.median_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <MlsAttribution lastUpdated={(lastUpdated as string | null) ?? null} />
        </>
      )}
    </ConsoleShell>
  );
}
