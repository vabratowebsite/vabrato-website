import { redirect } from "next/navigation";
import { KpiTile, Panel } from "@vabrato/ui/web";
import { fmtShort } from "@vabrato/lib";
import { MlsAttribution } from "@/components/MlsAttribution";
import { mlsLastUpdated } from "@/lib/public/listings";
import { ActivityBars } from "@/member/components/ActivityBars";
import { MemberShell } from "@/member/components/MemberShell";
import { sells } from "@/member/roles";
import { activityBars, fmtCount, listingPerformance, pickDeal, sellerDeals } from "@/member/seller";
import { requirePortalMember } from "@/member/session";

const money = (n: number) => `$${Number(n).toLocaleString("en-US")}`;

// Listing activity for the seller's own listing: our site's views, saves,
// tour requests and open-house sign-ins by week (counts only, never who), plus
// the listing's MLS status and list price (IDX level).
export default async function SellerPerformance({ searchParams }: { searchParams: Promise<{ deal?: string }> }) {
  const member = await requirePortalMember("/my/seller/performance");
  if (!sells(member.role)) redirect("/my/buyer");
  const { deal: requested } = await searchParams;
  const deal = pickDeal(await sellerDeals(member.supabase), requested);
  const [perf, lastUpdated] = await Promise.all([deal ? listingPerformance(member.supabase, deal.id) : Promise.resolve(null), mlsLastUpdated()]);
  const linked = perf?.linked ? perf : null;

  return (
    <MemberShell member={member} role={member.role} current="seller-performance" eyebrow={deal ? `Seller portal · ${deal.address}` : "Seller portal"} title="Listing activity">
      {!linked ? (
        <Panel title="No listing linked yet">
          <p className="font-body text-body text-ink">
            {deal ? "Activity shows here once your agent links your MLS listing to this sale." : "When your agent adds you to a sale, its listing activity appears here."}{" "}
            <a href="/my/messages" className="text-navy underline">
              Message your agent
            </a>
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiTile value={fmtCount(linked.totals.views)} label="Listing views" />
            <KpiTile value={fmtCount(linked.totals.saves)} label="Saves" />
            <KpiTile value={fmtCount(linked.totals.tour_requests)} label="Tour requests" />
            <KpiTile value={fmtCount(linked.totals.open_house_signins)} label="Open-house visitors" />
          </div>

          {linked.listing && (
            <Panel title="Your listing">
              <dl className="grid gap-4 font-body text-body text-ink sm:grid-cols-2">
                <div>
                  <dt className="text-label uppercase tracking-label text-muted">MLS status</dt>
                  <dd>{linked.listing.standard_status ?? "Not available"}</dd>
                </div>
                <div>
                  <dt className="text-label uppercase tracking-label text-muted">List price</dt>
                  <dd>{linked.listing.list_price != null ? money(linked.listing.list_price) : "Not available"}</dd>
                </div>
              </dl>
            </Panel>
          )}

          <Panel title="Views by week">
            <ActivityBars bars={activityBars(linked.weeks)} caption="Listing views by week, last 8 weeks" />
          </Panel>

          <Panel title="Week by week">
            <div className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy" tabIndex={0} role="region" aria-label="Week-by-week activity table">
              <table className="w-full min-w-[480px] font-body text-body-sm text-ink">
                <caption className="sr-only">Listing activity by week, last 8 weeks</caption>
                <thead>
                  <tr className="border-b border-line text-left text-label uppercase tracking-label text-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Week of</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Views</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Saves</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Tour requests</th>
                    <th scope="col" className="py-2 text-right font-medium">Open-house visitors</th>
                  </tr>
                </thead>
                <tbody>
                  {[...linked.weeks].reverse().map((w) => (
                    <tr key={w.week_start} className="border-b border-line last:border-b-0">
                      <th scope="row" className="py-2 pr-4 text-left font-normal">{fmtShort(w.week_start)}</th>
                      <td className="py-2 pr-4 text-right">{fmtCount(w.views)}</td>
                      <td className="py-2 pr-4 text-right">{fmtCount(w.saves)}</td>
                      <td className="py-2 pr-4 text-right">{fmtCount(w.tour_requests)}</td>
                      <td className="py-2 text-right">{fmtCount(w.open_house_signins)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <p className="font-body text-caption text-muted">
            Views count visitors to your listing on vabrato.com, once per visitor per day. Saves, tour requests and open-house visitors are totals; we never show who.
          </p>
          <MlsAttribution lastUpdated={lastUpdated} />
        </>
      )}
    </MemberShell>
  );
}
