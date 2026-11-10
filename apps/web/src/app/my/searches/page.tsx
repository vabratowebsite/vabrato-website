import { redirect } from "next/navigation";
import { Button, Panel, Pill } from "@vabrato/ui/web";
import { MlsAttribution } from "@/components/MlsAttribution";
import { mlsLastUpdated } from "@/lib/public/listings";
import { toSearchArgs } from "@/lib/search-params";
import { SearchFormFrequency } from "@/member/components/SearchFrequency";
import { MemberShell } from "@/member/components/MemberShell";
import { SubmitButton } from "@/member/components/controls";
import { SavedSearchForm } from "@/member/components/SearchForms";
import { filtersFromCriteria, isFrequency, searchHref } from "@/member/saved";
import { buys } from "@/member/roles";
import { requirePortalMember } from "@/member/session";
import { deleteSearchAction } from "./actions";

// Saved searches (mockup 05 panel): name, alert frequency, how many homes
// match right now, and a link back to the search. Alerts themselves are
// sent by the alert job (S5 PR 3) when alert emails are on.
export default async function SavedSearchesPage() {
  const member = await requirePortalMember("/my/searches");
  if (!buys(member.role)) redirect("/my/seller");
  const { data: searches } = await member.supabase.from("saved_searches").select("id, name, criteria, frequency, created_at").order("created_at", { ascending: false });
  const list = searches ?? [];
  const lastUpdated = await mlsLastUpdated();
  const counts = await Promise.all(
    list.map(async (s) => {
      // The typed client wants undefined, not null, for omitted filters.
      const args = Object.fromEntries(Object.entries(toSearchArgs(filtersFromCriteria(s.criteria), 1)).filter(([, v]) => v !== null));
      const { data } = await member.supabase.rpc("search_listings", args);
      return Number(data?.[0]?.total_count ?? 0);
    }),
  );

  return (
    <MemberShell member={member} role={member.role} current="searches" eyebrow="Buyer portal" title="Saved searches">
      {!member.profile.alerts_email_opt_in && list.length > 0 && (
        <p role="note" className="border border-gold bg-gold-50 p-4 font-body text-body-sm text-ink">
          Alert emails are off for your account.{" "}
          <a href="/my/account" className="text-navy underline">
            Turn them on
          </a>{" "}
          to get new listings and price drops for these searches.
        </p>
      )}
      {list.length === 0 ? (
        <Panel title="No saved searches yet">
          <div className="space-y-4 font-body text-body text-ink">
            <p>Set your filters on the search page and choose &ldquo;Save search&rdquo;. We&apos;ll keep it here and alert you to new matches.</p>
            <Button href="/search" variant="navy" underline={false}>
              Search homes
            </Button>
          </div>
        </Panel>
      ) : (
        <ul className="space-y-4">
          {list.map((s, i) => (
            <li key={s.id}>
              <Panel title={s.name} headingLevel="h2">
                <div className="space-y-4">
                  <p className="flex flex-wrap items-center gap-3 font-body text-body-sm text-ink">
                    <SearchFormFrequency frequency={isFrequency(s.frequency) ? s.frequency : "off"} />
                    <a href={searchHref(s.criteria)} className="font-medium text-navy underline">
                      {counts[i]} {counts[i] === 1 ? "home" : "homes"} for sale now<span className="sr-only"> for {s.name}</span>
                    </a>
                  </p>
                  <SavedSearchForm id={s.id} name={s.name} frequency={isFrequency(s.frequency) ? s.frequency : "off"} />
                  <form action={deleteSearchAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <SubmitButton variant="outline">
                      Delete<span className="sr-only"> {s.name}</span>
                    </SubmitButton>
                  </form>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
      <p className="font-body text-caption text-muted">
        <Pill tone="neutral">Up to 25</Pill> You can keep up to 25 saved searches.
      </p>
      <MlsAttribution lastUpdated={lastUpdated} />
    </MemberShell>
  );
}
