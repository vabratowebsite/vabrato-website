import { redirect } from "next/navigation";
import { Button, KpiTile, Panel, PanelAction, Pill, Timeline, WiringBanner } from "@vabrato/ui/web";
import { fmtShort } from "@vabrato/lib";
import { MlsAttribution } from "@/components/MlsAttribution";
import { mlsLastUpdated } from "@/lib/public/listings";
import { ActivityBars } from "@/member/components/ActivityBars";
import { MemberShell } from "@/member/components/MemberShell";
import { sells } from "@/member/roles";
import { STATUS_PILL, activityBars, closingHeadline, dealTimeline, fmtCount, listingPerformance, pacificToday, pickDeal, sellerDeals, timelineItems } from "@/member/seller";
import { requirePortalMember } from "@/member/session";

const money = (n: number) => `$${Number(n).toLocaleString("en-US")}`;

// Seller portal home (mockup 06): wiring banner, listing KPIs, the sale
// timeline from the schedule engine, the seller's to-dos (read-only: staff
// mark them done) and weekly listing activity. RLS: only deals this member is on.
export default async function SellerHome({ searchParams }: { searchParams: Promise<{ deal?: string }> }) {
  const member = await requirePortalMember("/my/seller");
  if (!sells(member.role)) redirect("/my/buyer");
  const { deal: requested } = await searchParams;
  const deals = await sellerDeals(member.supabase);
  const deal = pickDeal(deals, requested);

  if (!deal) {
    return (
      <MemberShell member={member} role={member.role} current="seller" eyebrow="Seller portal" title="Selling with Vabrato">
        <Panel title="No sale on file yet">
          <div className="space-y-4 font-body text-body text-ink">
            <p>
              When your agent adds you to a transaction, your sale timeline appears here. Make sure they use this email address: <strong>{member.profile.email}</strong>.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button href="/sell" variant="navy" underline={false}>
                Get a home valuation
              </Button>
              <Button href="/transform">Pre-sale projects</Button>
            </div>
          </div>
        </Panel>
      </MemberShell>
    );
  }

  const today = pacificToday();
  const [{ timeline, todos }, perf, lastUpdated] = await Promise.all([
    dealTimeline(member.supabase, deal, today),
    deal.listing_key ? listingPerformance(member.supabase, deal.id) : Promise.resolve(null),
    deal.listing_key ? mlsLastUpdated() : Promise.resolve(null),
  ]);
  const pill = STATUS_PILL[deal.status];
  const linked = perf?.linked ? perf : null;
  const open = todos.filter((t) => !t.done).length;

  return (
    <MemberShell
      member={member}
      role={member.role}
      current="seller"
      eyebrow={`Seller portal · ${deal.address}`}
      title={closingHeadline(deal, timeline.coe, today)}
      topRight={
        <Pill tone={pill.tone} dot>
          {pill.label}
        </Pill>
      }
    >
      <WiringBanner salePrice={deal.sale_price != null ? money(deal.sale_price) : undefined} />

      {deals.length > 1 && (
        <nav aria-label="Your sales" className="flex flex-wrap gap-2 font-body text-body-sm">
          {deals.map((d) => (
            <a key={d.id} href={`/my/seller?deal=${d.id}`} aria-current={d.id === deal.id ? "page" : undefined} className={`border px-3 py-2 ${d.id === deal.id ? "border-navy bg-navy text-white" : "border-line bg-white text-navy underline"}`}>
              {d.address}
            </a>
          ))}
        </nav>
      )}

      {linked ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile value={fmtCount(linked.totals.views)} label="Listing views" />
          <KpiTile value={fmtCount(linked.totals.saves)} label="Saves" />
          <KpiTile value={fmtCount(linked.totals.tour_requests)} label="Tour requests" />
          <KpiTile value={fmtCount(linked.totals.open_house_signins)} label="Open-house visitors" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiTile value={fmtShort(deal.ratification_date)} label="Contract ratified" />
          <KpiTile value={fmtShort(timeline.coe)} label="Close of escrow" />
          <KpiTile value={String(open)} label="Your open to-dos" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Your sale timeline" action={<PanelAction href={`/api/my/seller/calendar?deal=${deal.id}`}>Add to calendar</PanelAction>}>
          <div className="space-y-4">
            <Timeline items={timelineItems(timeline)} label={`Sale timeline for ${deal.address}`} />
            <p className="font-body text-caption text-muted">Dates come from your contract. Weekends and federal holidays are skipped automatically.</p>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Your to-dos">
            {todos.length > 0 ? (
              <div className="space-y-3">
                <ul aria-label="Your to-dos" className="list-none">
                  {todos.map((t) => (
                    <li key={`${t.title}-${t.due_date}`} className="flex min-h-[44px] items-center gap-3 border-b border-line py-2 last:border-b-0">
                      <span aria-hidden="true" className={`flex h-[18px] w-[18px] flex-none items-center justify-center border-2 text-[12px] leading-none ${t.done ? "border-navy bg-navy text-white" : "border-muted bg-white"}`}>
                        {t.done ? "✓" : ""}
                      </span>
                      <span className={`flex-1 font-body text-body-sm ${t.done ? "text-muted line-through" : "text-ink"}`}>
                        <span className="sr-only">{t.done ? "Done: " : "To do: "}</span>
                        {t.title}
                      </span>
                      <span className="font-body text-caption text-muted">{fmtShort(t.due_date)}</span>
                    </li>
                  ))}
                </ul>
                <p className="font-body text-caption text-muted">Your Vabrato team checks these off as they&apos;re done. Questions? <a href="/my/messages" className="text-navy underline">Message the team</a>.</p>
              </div>
            ) : (
              <p className="font-body text-body text-ink">Nothing for you to do right now. We&apos;ll add anything that needs you here.</p>
            )}
          </Panel>

          <Panel title="Weekly listing activity" action={linked ? <PanelAction href={`/my/seller/performance?deal=${deal.id}`}>Details</PanelAction> : undefined}>
            {linked ? (
              <ActivityBars bars={activityBars(linked.weeks.slice(-4))} caption="Listing views by week, last 4 weeks" />
            ) : (
              <p className="font-body text-body text-ink">Listing activity shows here once your agent links your MLS listing to this sale.</p>
            )}
          </Panel>
        </div>
      </div>

      {linked && <MlsAttribution lastUpdated={lastUpdated} />}
    </MemberShell>
  );
}
