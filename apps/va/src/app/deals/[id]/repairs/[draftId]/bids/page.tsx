import { notFound } from "next/navigation";
import { fmtShort } from "@vabrato/lib";
import { AccessDenied } from "@/components/access-denied";
import { PrintButton } from "@/components/print-button";
import { PRINT_CSS } from "@/lib/print";
import { NOT_THE_REPORT, groupByTrade, type ItemsContent } from "@/lib/repair-kinds";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// The printable bid list (S6b PR 7b): an approved list's items by trade, for
// contractor quotes. Our code lays it out; the items are the approved list.
// No client names or contact details; the property address only.
export const dynamic = "force-dynamic";

export default async function BidListPage({ params }: { params: Promise<{ id: string; draftId: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { id, draftId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(draftId)) notFound();
  const supabase = await supabaseServer();
  const [{ data: set }, { data: deal }] = await Promise.all([
    supabase.from("ai_drafts").select("id, status, owner_id, content, approved_at").eq("id", draftId).eq("deal_id", id).eq("kind", "inspection_items").maybeSingle(),
    supabase.from("deals").select("address").eq("id", id).maybeSingle(),
  ]);
  if (!set || set.status !== "approved" || !deal) notFound();
  const c = set.content as unknown as ItemsContent;
  const { data: owner } = await supabase.from("profiles").select("full_name").eq("id", set.owner_id).maybeSingle();
  const groups = groupByTrade(c.items);

  return (
    <main id="main" className="mx-auto max-w-[8.5in] bg-white p-8 font-body text-ink">
      <style>{PRINT_CSS}</style>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3" data-no-print>
        <a href={`/deals/${id}/repairs/${draftId}`} className="font-body text-body-sm text-navy underline">
          ← Back to the repair items
        </a>
        <PrintButton />
      </div>
      <h1 className="font-display text-display-sm text-navy">Bid list</h1>
      <p className="mt-1 text-body-md">{deal.address}</p>
      <p className="mt-2 text-body-sm">
        Drafted by the assistant, approved by {owner?.full_name ?? "staff"}
        {set.approved_at ? ` on ${fmtShort(set.approved_at.slice(0, 10))}` : ""}. {NOT_THE_REPORT}
      </p>
      {c.may_be_incomplete && <p className="mt-2 text-body-sm font-medium">This list may be incomplete: check the report.</p>}
      {groups.map((g) => (
        <section key={g.trade} aria-labelledby={`trade-${g.trade}`} className="mt-6 break-inside-avoid">
          <h2 id={`trade-${g.trade}`} className="font-body text-body-lg font-medium text-ink">
            {g.label}
          </h2>
          <ol className="mt-2 list-decimal space-y-2 pl-6 text-body-sm">
            {g.items.map((it) => (
              <li key={it.id}>
                <span className="font-medium">{it.title}</span>
                {it.location ? ` (${it.location})` : ""}
                {it.page ? `, report page ${it.page}` : ""}
                {it.detail ? <span className="block">{it.detail}</span> : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
