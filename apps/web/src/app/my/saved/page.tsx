import { redirect } from "next/navigation";
import { Button, Panel } from "@vabrato/ui/web";
import { MlsAttribution } from "@/components/MlsAttribution";
import { ResultsGrid } from "@/components/search/results";
import { listingTitle } from "@/lib/format";
import { mlsLastUpdated } from "@/lib/public/listings";
import { MemberShell } from "@/member/components/MemberShell";
import { RemoveSavedButton } from "@/member/components/SaveIslands";
import { savedListings } from "@/member/listings";
import { buys } from "@/member/roles";
import { requirePortalMember } from "@/member/session";

// Saved homes: live cards (IDX) plus saves whose listing has left the feed.
// Only listing keys are stored, so those show without any old MLS data
// (review item 5). MLS-1/MLS-2 on the page (review item 4).
export default async function SavedHomesPage() {
  const member = await requirePortalMember("/my/saved");
  if (!buys(member.role)) redirect("/my/seller");
  const [{ rows, gone }, lastUpdated] = await Promise.all([savedListings(member.supabase), mlsLastUpdated()]);

  return (
    <MemberShell member={member} role={member.role} current="saved" eyebrow="Buyer portal" title="Saved homes">
      {rows.length === 0 && gone.length === 0 ? (
        <Panel title="No saved homes yet">
          <div className="space-y-4 font-body text-body text-ink">
            <p>Tap the heart on any listing to save it here.</p>
            <Button href="/search" variant="navy" underline={false}>
              Search homes
            </Button>
          </div>
        </Panel>
      ) : (
        <>
          <section aria-label="Saved homes on the market" className="space-y-4">
            <p className="font-body text-body-sm text-muted" aria-live="polite">
              {rows.length} {rows.length === 1 ? "home" : "homes"} on the market
            </p>
            {rows.length > 0 && <ResultsGrid rows={rows} headingLevel="h2" />}
          </section>
          {rows.length > 1 && (
            <Panel title="Compare homes">
              <form action="/my/compare" method="get" className="space-y-4 font-body text-body-sm text-ink">
                <fieldset>
                  <legend className="mb-2 text-body-sm text-ink">Choose up to 4 homes to compare side by side.</legend>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {rows.map((r) => (
                      <li key={r.listing_key}>
                        <label className="flex min-h-[44px] items-center gap-3">
                          <input type="checkbox" name="key" value={r.listing_key} className="h-5 w-5 accent-navy" />
                          {listingTitle(r)}
                          {r.city && r.address_display ? `, ${r.city}` : ""}
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
                <button
                  type="submit"
                  className="inline-flex min-h-[44px] items-center border border-navy px-6 text-label font-medium uppercase tracking-label text-navy hover:bg-navy-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                >
                  Compare
                </button>
              </form>
            </Panel>
          )}
          {gone.length > 0 && (
            <Panel title="No longer on the market">
              <ul className="divide-y divide-line font-body text-body-sm text-ink">
                {gone.map((k) => (
                  <li key={k} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span>A home you saved (listing {k}) is no longer for sale.</span>
                    <RemoveSavedButton listingKey={k} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
      <MlsAttribution lastUpdated={lastUpdated} />
    </MemberShell>
  );
}
