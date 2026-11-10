import { notFound, redirect } from "next/navigation";
import { ListingCard, Panel } from "@vabrato/ui/web";
import { MlsAttribution } from "@/components/MlsAttribution";
import { SearchFilterBar } from "@/components/search/SearchFilterBar";
import { Pagination } from "@/components/search/results";
import { flagEnabled, listCities, mlsLastUpdated } from "@/lib/public/listings";
import { PAGE_SIZE, parseSearchParams, toQueryString } from "@/lib/search-params";
import { VowForm } from "@/member/components/AccountForms";
import { MemberShell } from "@/member/components/MemberShell";
import { SOLD_WINDOWS, soldSearch } from "@/member/listings";
import { buys } from "@/member/roles";
import { requirePortalMember } from "@/member/session";
import { soldCardProps } from "@/member/view";

// "Sold near me" (mockup 05 Explore): VOW sold search (MLS-6). Doesn't exist
// while vow_enabled is off (review item 1); asks for the terms until accepted.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SoldPage({ searchParams }: Props) {
  if (!(await flagEnabled("vow_enabled"))) notFound();
  const member = await requirePortalMember("/my/sold");
  if (!buys(member.role)) redirect("/my/seller");
  const sp = await searchParams;

  if (!member.profile.vow_accepted_at) {
    return (
      <MemberShell member={member} role={member.role} current="sold" eyebrow="Explore" title="Sold near me">
        <Panel title="Accept the Terms of Use to see sold homes">
          <div className="space-y-4 font-body text-body text-ink">
            <p>MLSListings lets us show sold prices and price history to clients who accept these terms.</p>
            <VowForm />
          </div>
        </Panel>
      </MemberShell>
    );
  }

  const filters = { ...parseSearchParams(sp), tab: "for-sale" as const };
  const within = SOLD_WINDOWS.find((w) => String(w.days) === sp.within)?.days ?? 365;
  const [cities, result, lastUpdated] = await Promise.all([listCities(), soldSearch(member.supabase, filters, within), mlsLastUpdated()]);
  const href = (page: number) => {
    const q = new URLSearchParams(toQueryString({ ...filters, page }));
    if (within !== 365) q.set("within", String(within));
    const s = q.toString();
    return s ? `/my/sold?${s}` : "/my/sold";
  };

  return (
    <MemberShell member={member} role={member.role} current="sold" eyebrow="Explore" title="Sold near me">
      <div className="space-y-4">
        <SearchFilterBar filters={filters} cities={cities} action="/my/sold" label="Search sold homes" />
        <nav aria-label="Sold within" className="flex flex-wrap gap-2 font-body text-body-sm">
          {SOLD_WINDOWS.map((w) => {
            const q = new URLSearchParams(toQueryString({ ...filters, page: 1 }));
            q.set("within", String(w.days));
            return (
              <a
                key={w.days}
                href={`/my/sold?${q.toString()}`}
                aria-current={w.days === within ? "page" : undefined}
                className="min-h-[44px] border border-line px-4 py-2.5 text-navy aria-[current=page]:border-navy aria-[current=page]:font-medium"
              >
                {w.label}
              </a>
            );
          })}
        </nav>
      </div>
      <section aria-label="Sold homes" className="space-y-4">
        <p className="font-body text-body-sm text-muted" aria-live="polite">
          {result.total} {result.total === 1 ? "home" : "homes"} sold
        </p>
        {result.rows.length === 0 ? (
          <p className="border border-line bg-white p-6 font-body text-body text-ink">No sold homes match these filters. Try a longer period or more cities.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {result.rows.map((r) => (
              <li key={r.listing_key}>
                <ListingCard {...soldCardProps(r)} headingLevel="h2" />
              </li>
            ))}
          </ul>
        )}
        <Pagination page={filters.page} total={result.total} pageSize={PAGE_SIZE} hrefFor={href} />
      </section>
      <MlsAttribution lastUpdated={lastUpdated} />
    </MemberShell>
  );
}
