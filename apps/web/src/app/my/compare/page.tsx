import { redirect } from "next/navigation";
import { Button, Panel } from "@vabrato/ui/web";
import { MlsAttribution } from "@/components/MlsAttribution";
import { cityLine, formatPrice, listingPath, listingTitle, propertyTypeLabel } from "@/lib/format";
import { openHouseLong } from "@/lib/listing-view";
import { mlsLastUpdated } from "@/lib/public/listings";
import { MemberShell } from "@/member/components/MemberShell";
import { CompareWithAskVabrato } from "@/member/components/CompareWithAskVabrato";
import { aiKeyConfigured } from "@/member/ai";
import { memberAiStatus } from "@/member/ai-status";
import { cards, savedListings } from "@/member/listings";
import { buys } from "@/member/roles";
import { LISTING_KEY } from "@/member/saved";
import { requirePortalMember } from "@/member/session";

// Compare up to 4 homes side by side (mockup 05 nav). IDX fields only; other
// brokers' listings show the listing broker (MLS-2).
type Props = { searchParams: Promise<{ key?: string | string[] }> };

export default async function ComparePage({ searchParams }: Props) {
  const member = await requirePortalMember("/my/compare");
  if (!buys(member.role)) redirect("/my/seller");
  const sp = await searchParams;
  const asked = [sp.key ?? []].flat().filter((k) => LISTING_KEY.test(k)).slice(0, 4);
  const [rows, lastUpdated, ai] = await Promise.all([
    asked.length ? cards(member.supabase, asked) : savedListings(member.supabase).then((s) => s.rows.slice(0, 4)),
    mlsLastUpdated(),
    memberAiStatus(member.supabase),
  ]);
  // S5b PR 4: only while "Compare homes" is on (it needs MLSListings' approval too).
  const canAsk = aiKeyConfigured() && ai.on.includes("ai_member_compare");
  const ordered = asked.length ? asked.map((k) => rows.find((r) => r.listing_key === k)).filter((r): r is (typeof rows)[number] => Boolean(r)) : rows;

  const facts: [string, (r: (typeof ordered)[number]) => string][] = [
    ["Price", (r) => formatPrice(r.list_price)],
    ["Beds", (r) => (r.bedrooms_total ?? "—").toString()],
    ["Baths", (r) => (r.bathrooms_total ?? "—").toString()],
    ["Living area", (r) => (r.living_area ? `${Number(r.living_area).toLocaleString("en-US")} sq ft` : "—")],
    ["Price per sq ft", (r) => (r.list_price && r.living_area ? formatPrice(Math.round(Number(r.list_price) / Number(r.living_area))) : "—")],
    ["Home type", (r) => propertyTypeLabel(r.property_sub_type)],
    ["Location", (r) => cityLine(r)],
    ["Status", (r) => ({ Active: "For sale", ActiveUnderContract: "Under contract", Pending: "Pending" } as Record<string, string>)[r.standard_status] ?? r.standard_status],
    ["Next open house", (r) => (r.next_open_house_start ? openHouseLong(r.next_open_house_start, r.next_open_house_end) : "None scheduled")],
    ["Listing broker", (r) => (r.is_own_listing ? "Vabrato Real Estate Services" : (r.list_office_name ?? "—"))],
  ];

  return (
    <MemberShell member={member} role={member.role} current="compare" eyebrow="Buyer portal" title="Compare homes">
      {ordered.length < 2 ? (
        <Panel title="Pick homes to compare">
          <div className="space-y-4 font-body text-body text-ink">
            <p>Save at least two homes, then choose up to four on your Saved homes page.</p>
            <Button href="/my/saved" variant="navy" underline={false}>
              Saved homes
            </Button>
          </div>
        </Panel>
      ) : (
        <div className="overflow-x-auto border border-line bg-white">
          <table className="w-full min-w-[640px] font-body text-body-sm text-ink">
            <caption className="sr-only">Side-by-side comparison of {ordered.length} homes</caption>
            <thead>
              <tr className="border-b border-line">
                <td className="w-40 px-4 py-3" />
                {ordered.map((r) => (
                  <th key={r.listing_key} scope="col" className="px-4 py-3 text-left align-top font-subhead text-subhead-sm font-normal">
                    <a href={listingPath(r)} className="text-navy underline">
                      {listingTitle(r)}
                    </a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facts.map(([label, get]) => (
                <tr key={label} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-medium text-muted">
                    {label}
                  </th>
                  {ordered.map((r) => (
                    <td key={r.listing_key} className="px-4 py-3 align-top">
                      {get(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canAsk && ordered.length >= 2 && <CompareWithAskVabrato keys={ordered.map((r) => r.listing_key)} />}
      <MlsAttribution lastUpdated={lastUpdated} />
    </MemberShell>
  );
}
