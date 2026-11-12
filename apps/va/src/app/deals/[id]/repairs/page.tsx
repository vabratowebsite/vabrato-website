import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtShort } from "@vabrato/lib";
import { Panel, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { DealShell } from "@/components/deal-shell";
import { StartRepairItems } from "@/components/repairs";
import { mutedCls } from "@/components/ui";
import { aiKeyConfigured } from "@/lib/ai";
import { aiFeaturesOn } from "@/lib/ai-flags";
import { NOT_THE_REPORT, type ItemsContent, type ResponseContent } from "@/lib/repair-kinds";
import { getDealWithProgress } from "@/lib/queries";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// Repairs (S6b PR 7b): repair item lists read from the deal's inspection
// reports, and the responses to the buyer's request written from them. Read
// as the signed-in person (0028 policies: their own drafts, and approved
// ones on deals they work).
export const dynamic = "force-dynamic";
// Reading a report runs as a server action under this page's limit.
export const maxDuration = 300;

const INSPECTION_TYPES = ["home_inspection", "pest_inspection"];

export default async function DealRepairsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const result = await getDealWithProgress(id);
  if (!result) notFound();
  const { deal, done, total } = result;
  const supabase = await supabaseServer();
  const [{ data: drafts }, { data: docs }, ai] = await Promise.all([
    supabase.from("ai_drafts").select("id, kind, status, owner_id, content, approved_at, created_at").eq("deal_id", id).in("kind", ["inspection_items", "repair_response"]).neq("status", "discarded").order("created_at", { ascending: false }),
    supabase.from("deal_documents").select("id, file_name, doc_types").eq("deal_id", id).overlaps("doc_types", INSPECTION_TYPES),
    aiFeaturesOn(supabase, ["ai_staff_inspection_items"]),
  ]);
  const sets = (drafts ?? []).filter((d) => d.kind === "inspection_items");
  const responses = (drafts ?? []).filter((d) => d.kind === "repair_response");
  const canRead = ai.ai_staff_inspection_items && aiKeyConfigured();

  return (
    <DealShell profile={profile} deal={deal} done={done} total={total} active="repairs">
      <Panel title="Repair items">
        <p className={mutedCls}>
          {NOT_THE_REPORT} The assistant lists the items from one inspection report; you edit and approve them. The bid list and the response to the buyer&apos;s request are made from an approved list.
        </p>
        {sets.length ? (
          <ul className="mt-3 divide-y divide-line">
            {sets.map((s) => {
              const c = s.content as unknown as ItemsContent;
              const n = responses.filter((r) => (r.content as unknown as ResponseContent).items_id === s.id).length;
              return (
                <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <div>
                    <Link href={`/deals/${id}/repairs/${s.id}`} className="font-body text-body-sm font-medium text-navy underline">
                      {c.document_name}
                    </Link>
                    <p className={mutedCls}>
                      {c.items.length} items{c.may_be_incomplete ? " (may be incomplete)" : ""}
                      {c.revised_from ? " · a revision" : ""} · started {fmtShort(s.created_at.slice(0, 10))}
                      {n ? ` · ${n} ${n === 1 ? "response" : "responses"}` : ""}
                    </p>
                  </div>
                  <Pill tone={s.status === "approved" ? "green" : "neutral"}>{s.status === "approved" ? `Approved ${fmtShort((s.approved_at ?? s.created_at).slice(0, 10))}` : "Draft"}</Pill>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={`${mutedCls} mt-3`}>No repair items yet.</p>
        )}
      </Panel>

      <Panel title="Inspection reports">
        {(docs ?? []).length ? (
          <ul className="divide-y divide-line">
            {(docs ?? []).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-body text-body-sm text-ink">{d.file_name}</span>
                {canRead ? <StartRepairItems dealId={id} documentId={d.id} name={d.file_name} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={mutedCls}>
            No inspection reports yet. Upload one on the{" "}
            <Link href={`/deals/${id}/documents`} className="text-navy underline">
              Documents
            </Link>{" "}
            tab and set its type to a home or pest inspection report.
          </p>
        )}
        {!canRead && (docs ?? []).length > 0 && <p className={`${mutedCls} mt-2`}>Reading reports into repair items is switched off. An admin can turn it on in Assistant settings.</p>}
      </Panel>
    </DealShell>
  );
}
