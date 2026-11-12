import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtShort } from "@vabrato/lib";
import { Panel, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { DealShell } from "@/components/deal-shell";
import { DraftPanel } from "@/components/draft-panel";
import { DecisionsForm, ItemsEditor, ResponseEditor, ReviseButton, TradeRequest } from "@/components/repairs";
import { mutedCls } from "@/components/ui";
import { aiKeyConfigured } from "@/lib/ai";
import { aiFeaturesOn } from "@/lib/ai-flags";
import { NOT_THE_REPORT, groupByTrade, tradeLabel, tradeRequestText, vendorsFor, type ItemsContent, type RepairItem, type ResponseContent } from "@/lib/repair-kinds";
import { getDealWithProgress } from "@/lib/queries";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// One repair items list (S6b PR 7b): while a draft, the agent edits and
// approves it; once approved, the bid list by trade and the response to the
// buyer's request are made from it. Revise copies it into a new draft.
export const dynamic = "force-dynamic";
// Writing the response runs as a server action under this page's limit.
export const maxDuration = 300;

const SEVERITY = { safety: "Safety", repair: "Repair", maintenance: "Maintenance", monitor: "Monitor" } as const;

function ItemLine({ it }: { it: RepairItem }) {
  return (
    <li className="py-2">
      <p className="font-body text-body-sm font-medium text-ink">{it.title}</p>
      <p className={mutedCls}>
        {[it.location, it.severity_label ? `${it.severity_label} (${SEVERITY[it.severity].toLowerCase()})` : SEVERITY[it.severity], tradeLabel(it.trade), it.page ? `report page ${it.page}` : it.added ? "added by the agent" : null].filter(Boolean).join(" · ")}
      </p>
      {it.detail && <p className="font-body text-body-sm text-ink">{it.detail}</p>}
    </li>
  );
}

export default async function RepairItemsPage({ params }: { params: Promise<{ id: string; draftId: string }> }) {
  const { id, draftId } = await params;
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  if (!/^[0-9a-f-]{36}$/.test(draftId)) notFound();
  const result = await getDealWithProgress(id);
  if (!result) notFound();
  const { deal, done, total } = result;
  const supabase = await supabaseServer();
  const { data: set } = await supabase.from("ai_drafts").select("id, status, owner_id, content, approved_at, created_at").eq("id", draftId).eq("deal_id", id).eq("kind", "inspection_items").maybeSingle();
  if (!set || set.status === "discarded") notFound();
  const c = set.content as unknown as ItemsContent;

  const [{ data: doc }, { data: owner }, { data: responses }, ai] = await Promise.all([
    supabase.from("deal_documents").select("id, path").eq("id", c.document_id).eq("deal_id", id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", set.owner_id).maybeSingle(),
    supabase.from("ai_drafts").select("id, status, subject, content, sent_via, owner_id, created_at").eq("deal_id", id).eq("kind", "repair_response").neq("status", "discarded").eq("content->>items_id", draftId).order("created_at", { ascending: false }),
    aiFeaturesOn(supabase, ["ai_staff_repair_response", "ai_staff_vendor_request"]),
  ]);
  const approved = set.status === "approved";
  const mine = set.owner_id === profile.id;
  const approvedBy = owner?.full_name ?? "staff";
  const approvedOn = set.approved_at ? fmtShort(set.approved_at.slice(0, 10)) : null;
  const groups = groupByTrade(c.items);
  const { data: vendors } = approved ? await supabase.from("vendors").select("id, name, role, email, preferred").order("preferred", { ascending: false }).order("name") : { data: [] };
  const canWrite = ai.ai_staff_repair_response && aiKeyConfigured();
  // Each response is signed by the person who wrote it.
  const writerIds = [...new Set((responses ?? []).map((r) => r.owner_id))];
  const { data: writers } = writerIds.length ? await supabase.from("profiles").select("id, full_name").in("id", writerIds) : { data: [] };
  const writerName = (pid: string) => (writers ?? []).find((w) => w.id === pid)?.full_name ?? "";

  return (
    <DealShell profile={profile} deal={deal} done={done} total={total} active="repairs">
      <Panel title={`Repair items: ${c.document_name}`}>
        <div className="space-y-2">
          <p className="font-body text-body-sm text-ink">
            <strong>{NOT_THE_REPORT}</strong>{" "}
            {doc ? (
              <a href={`/deals/${id}/file?b=deal-docs&p=${encodeURIComponent(doc.path)}`} className="text-navy underline">
                Open the report
              </a>
            ) : (
              <span>Report deleted.</span>
            )}
          </p>
          {c.may_be_incomplete && (
            <p role="note" className="border border-gold bg-gold-50 p-3 font-body text-body-sm text-ink">
              This list may be incomplete: the assistant lists at most 60 items. Check the report for anything missing and add it.
            </p>
          )}
          <p className={mutedCls}>
            {approved ? `Drafted by the assistant, approved by ${approvedBy}${approvedOn ? ` on ${approvedOn}` : ""}.` : "Draft. Lists nobody approves are deleted after 30 days without changes."}
            {c.revised_from ? (
              <>
                {" "}
                Revised from{" "}
                <Link href={`/deals/${id}/repairs/${c.revised_from}`} className="text-navy underline">
                  an approved list
                </Link>
                .
              </>
            ) : null}
          </p>
          <Pill tone={approved ? "green" : "neutral"}>{approved ? "Approved" : "Draft"}</Pill>
        </div>
        <div className="mt-4">
          {!approved && mine ? (
            <ItemsEditor dealId={id} id={set.id} initial={c.items} />
          ) : (
            <>
              <ol className="divide-y divide-line" aria-label="Repair items">
                {c.items.map((it) => (
                  <ItemLine key={it.id} it={it} />
                ))}
              </ol>
              {approved && (
                <div className="mt-4">
                  <ReviseButton dealId={id} id={set.id} />
                </div>
              )}
            </>
          )}
        </div>
      </Panel>

      {approved && (
        <Panel title="Bid list">
          <p className={mutedCls}>
            The items by trade, for contractor quotes. Drafted by the assistant, approved by {approvedBy}
            {approvedOn ? ` on ${approvedOn}` : ""}. {NOT_THE_REPORT}{" "}
            <a href={`/deals/${id}/repairs/${set.id}/bids`} className="text-navy underline">
              Print the bid list
            </a>
          </p>
          <div className="mt-3 space-y-4">
            {groups.map((g) => {
              const text = tradeRequestText(deal.address, g.label, g.items);
              const { matching, others } = vendorsFor(g.trade, vendors ?? []);
              const ordered = [...matching, ...others];
              return (
                <details key={g.trade} className="border border-line p-3">
                  <summary className="cursor-pointer font-body text-body-sm font-medium text-ink">
                    {g.label} ({g.items.length})
                  </summary>
                  <ul className="mt-2 divide-y divide-line">
                    {g.items.map((it) => (
                      <ItemLine key={it.id} it={it} />
                    ))}
                  </ul>
                  <div className="mt-3">
                    {ai.ai_staff_vendor_request && aiKeyConfigured() ? (
                      <DraftPanel
                        heading={`Ask a vendor: ${g.label}`}
                        target={{ target: "vendor", dealId: id }}
                        initial={null}
                        emailTo={[]}
                        portal={false}
                        vendors={ordered.map((v) => ({ id: v.id, name: v.name, role: v.role, email: v.email }))}
                        noteLabel="What do you need? (required)"
                        noteHint="The items for this trade are filled in. Add a date if there is one; don't type lockbox codes or how to get in."
                        initialNote={text}
                      />
                    ) : (
                      <TradeRequest text={text} vendors={ordered.map((v) => ({ id: v.id, name: v.name, email: v.email }))} />
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </Panel>
      )}

      {approved && (
        <Panel title="Response to the buyer's request for repairs">
          {canWrite ? (
            <DecisionsForm dealId={id} itemsId={set.id} items={c.items} agentName={profile.full_name ?? ""} />
          ) : (
            <p className={mutedCls}>Writing the response with the assistant is switched off. An admin can turn it on in Assistant settings.</p>
          )}
          {(responses ?? []).length > 0 && (
            <div className="mt-6 space-y-6">
              <h3 className="font-body text-body-md font-medium text-ink">Responses</h3>
              {(responses ?? []).map((r) => {
                const rc = r.content as unknown as ResponseContent;
                return (
                  <section key={r.id} aria-label={`Response started ${fmtShort(r.created_at.slice(0, 10))}`} className="border border-line p-3">
                    <p className={`${mutedCls} mb-2`}>
                      {r.status === "approved" ? "Approved" : "Draft"} · started {fmtShort(r.created_at.slice(0, 10))}
                      {r.sent_via ? ` · ${r.sent_via === "print" ? "printed" : r.sent_via === "email" ? "opened in email" : "copied"}` : ""}
                    </p>
                    <ResponseEditor dealId={id} id={r.id} status={r.status} subject={r.subject} opening={rc.opening} closing={rc.closing} decisions={rc.decisions} agentName={writerName(r.owner_id)} sentVia={r.sent_via} />
                  </section>
                );
              })}
            </div>
          )}
        </Panel>
      )}
    </DealShell>
  );
}
