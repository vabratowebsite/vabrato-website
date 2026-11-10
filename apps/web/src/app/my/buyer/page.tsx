import { redirect } from "next/navigation";
import { Button, KpiTile, Panel, PanelAction } from "@vabrato/ui/web";
import { MlsAttribution } from "@/components/MlsAttribution";
import { ResultsGrid } from "@/components/search/results";
import { mlsLastUpdated } from "@/lib/public/listings";
import { MemberShell } from "@/member/components/MemberShell";
import { SearchFormFrequency } from "@/member/components/SearchFrequency";
import { savedListings } from "@/member/listings";
import { buys } from "@/member/roles";
import { isFrequency, searchHref } from "@/member/saved";
import { requirePortalMember } from "@/member/session";

// Buyer portal home (mockup 05): KPIs, latest saved homes, saved searches.
// PR 3 adds "What changed" (alerts); PR 4 adds homes I'm pursuing and tours.
export default async function BuyerHome() {
  const member = await requirePortalMember("/my/buyer");
  if (!buys(member.role)) redirect("/my/seller");
  const first = member.profile.full_name.split(/\s+/)[0];
  const [saved, searches, lastUpdated] = await Promise.all([
    savedListings(member.supabase),
    member.supabase.from("saved_searches").select("id, name, criteria, frequency").order("created_at", { ascending: false }).limit(5),
    mlsLastUpdated(),
  ]);
  const searchList = searches.data ?? [];

  return (
    <MemberShell member={member} role={member.role} current="buyer" eyebrow="Buyer portal" title={first ? `Welcome, ${first}` : "Welcome"} topRight={<Button href="/search" size="sm">Search homes</Button>}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile value={String(saved.keys.length)} label="Saved homes" />
        <KpiTile value={String(searchList.length)} label="Saved searches" />
        <KpiTile value={String(saved.rows.length)} label="Saved homes on the market" />
      </div>

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
      {saved.rows.length > 0 && <MlsAttribution lastUpdated={lastUpdated} />}
    </MemberShell>
  );
}
