import { redirect } from "next/navigation";
import { Button, KpiTile, Panel, PanelAction, Pill, StatusLadder } from "@vabrato/ui/web";
import { LADDER_LABEL, STATUS_LABELS, isPropertyStatus } from "@vabrato/lib";
import { MlsAttribution } from "@/components/MlsAttribution";
import { ResultsGrid } from "@/components/search/results";
import { mlsLastUpdated } from "@/lib/public/listings";
import { alertFeed, unseenAlertCount } from "@/member/alerts";
import { AlertFeed } from "@/member/components/AlertFeed";
import { MemberShell } from "@/member/components/MemberShell";
import { TrackForm } from "@/member/components/TrackForm";
import { listingTitle } from "@/lib/format";
import { SearchFormFrequency } from "@/member/components/SearchFrequency";
import { savedListings } from "@/member/listings";
import { buys } from "@/member/roles";
import { isFrequency, searchHref } from "@/member/saved";
import { requirePortalMember } from "@/member/session";

// Buyer portal home (mockup 05): KPIs, latest saved homes, saved searches.
// "What changed" is the alert feed (PR 3); PR 4 adds homes I'm pursuing and tours.
export default async function BuyerHome() {
  const member = await requirePortalMember("/my/buyer");
  if (!buys(member.role)) redirect("/my/seller");
  const first = member.profile.full_name.split(/\s+/)[0];
  const [saved, searches, lastUpdated, changes, newCount, pursuing] = await Promise.all([
    savedListings(member.supabase),
    member.supabase.from("saved_searches").select("id, name, criteria, frequency").order("created_at", { ascending: false }).limit(5),
    mlsLastUpdated(),
    alertFeed(member.supabase, 5),
    unseenAlertCount(member.supabase),
    member.supabase.from("tracked_properties").select("id, address, status, listing_key").eq("buyer_id", member.profile.id).order("created_at", { ascending: false }),
  ]);
  const homes = pursuing.data ?? [];
  const tracked = new Set(homes.map((h) => h.listing_key).filter(Boolean));
  const trackable = saved.rows.filter((r) => !tracked.has(r.listing_key)).map((r) => ({ key: r.listing_key, label: `${listingTitle(r)}${r.address_display && r.city ? `, ${r.city}` : ""}` }));
  const searchList = searches.data ?? [];

  return (
    <MemberShell member={member} role={member.role} current="buyer" eyebrow="Buyer portal" title={first ? `Welcome, ${first}` : "Welcome"} topRight={<Button href="/search" size="sm">Search homes</Button>}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile value={String(saved.keys.length)} label="Saved homes" />
        <KpiTile value={String(searchList.length)} label="Saved searches" />
        <KpiTile value={String(newCount)} label="New updates" />
      </div>

      <Panel title="Homes I'm pursuing">
        <div className="space-y-6">
          {homes.length > 0 && (
            <ul className="divide-y divide-line">
              {homes.map((h) => {
                const status = isPropertyStatus(h.status) ? h.status : "watching";
                const ladder = LADDER_LABEL[status];
                return (
                  <li key={h.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto] md:items-center">
                    <a href={`/my/pursuing/${h.id}`} className="font-body text-body font-medium text-navy underline">
                      {h.address}
                    </a>
                    {ladder ? <StatusLadder current={ladder} label={`Progress for ${h.address}`} /> : <Pill tone="outline">{STATUS_LABELS[status]}</Pill>}
                  </li>
                );
              })}
            </ul>
          )}
          <TrackForm saved={trackable} />
        </div>
      </Panel>

      <Panel title="What changed" action={changes.length ? <PanelAction href="/my/alerts">All activity</PanelAction> : undefined}>
        <AlertFeed items={changes} emptyText="New listings that match your saved searches, and price changes on your saved homes, will show up here." />
      </Panel>

      <Panel title="Saved homes" action={saved.keys.length ? <PanelAction href="/my/saved">All saved homes</PanelAction> : undefined}>
        {saved.rows.length ? (
          <ResultsGrid rows={saved.rows.slice(0, 2)} headingLevel="h3" />
        ) : (
          <div className="space-y-4 font-body text-body text-ink">
            <p>Tap the heart on any listing to save it. Saved homes appear here, and we can alert you to price changes.</p>
            <Button href="/search" variant="navy" underline={false}>
              Search homes
            </Button>
          </div>
        )}
      </Panel>

      <Panel title="Saved searches" action={searchList.length ? <PanelAction href="/my/searches">Manage</PanelAction> : undefined}>
        {searchList.length ? (
          <ul className="divide-y divide-line font-body text-body-sm text-ink">
            {searchList.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <a href={searchHref(s.criteria)} className="font-medium text-navy underline">
                  {s.name}
                </a>
                <SearchFormFrequency frequency={isFrequency(s.frequency) ? s.frequency : "off"} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-body text-body text-ink">On the search page, set your filters and choose &ldquo;Save search&rdquo; to get alerts for new matches.</p>
        )}
      </Panel>
      {(saved.rows.length > 0 || changes.length > 0) && <MlsAttribution lastUpdated={lastUpdated} />}
    </MemberShell>
  );
}
