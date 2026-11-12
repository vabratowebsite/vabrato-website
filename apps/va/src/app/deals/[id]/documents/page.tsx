import { notFound } from "next/navigation";
import { SELLER_TYPE_LABELS, checklistFor, cleanDocTypes, fmtShort, type ChecklistFile } from "@vabrato/lib";
import { Panel, Pill, WiringBanner } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { DealShell } from "@/components/deal-shell";
import { ChecklistMarkControl, DocItem, DocumentUploader } from "@/components/documents";
import { StartRepairItems } from "@/components/repairs";
import { mutedCls } from "@/components/ui";
import { aiFeaturesOn } from "@/lib/ai-flags";
import { aiKeyConfigured } from "@/lib/ai";
import { parseDocPath } from "@/lib/documents";
import { getDealWithProgress } from "@/lib/queries";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// Documents (S6b PR 7a): the deal's files, the checklist for its seller type
// and what's missing. Uploads are staff-only until someone shares one with
// the seller (owner decision 2026-11-12). The sellers' own uploads count
// toward the checklist once tagged. Everything here is read as the signed-in
// person (RLS: staff with deal access).
export const dynamic = "force-dynamic";
// The document check reads a whole file; its server action runs under this page's limit.
export const maxDuration = 300;

const size = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const STATUS_LABEL = { on_file: "On file", missing: "Missing", not_needed: "Not needed", open: "Not decided" } as const;
const fileHref = (dealId: string, bucket: string, path: string) => `/deals/${dealId}/file?b=${bucket}&p=${encodeURIComponent(path)}`;

export default async function DealDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const result = await getDealWithProgress(id);
  if (!result) notFound();
  const { deal, done, total } = result;
  const supabase = await supabaseServer();
  const bucket = supabase.storage.from("deal-docs");

  // The console can deploy before migration 0032 is applied: with no
  // documents table, show nothing that uploads, shares or lists files.
  const { data: docs, error: notReady } = await supabase
    .from("deal_documents")
    .select("id, path, file_name, size_bytes, doc_types, shared, uploaded_by, created_at")
    .eq("deal_id", id)
    .order("created_at", { ascending: false });
  if (notReady) {
    return (
      <DealShell profile={profile} deal={deal} done={done} total={total} active="documents">
        <WiringBanner />
        <Panel title="Documents aren't set up yet">
          <p className={mutedCls}>This part of the console needs a database update that hasn&apos;t been applied yet. Ask an admin; nothing is lost in the meantime.</p>
        </Panel>
      </DealShell>
    );
  }

  const [{ data: sellers }, { data: marks }, { data: top }, { data: staffFiles }, ai] = await Promise.all([
    supabase.from("deal_members").select("profile_id").eq("deal_id", id).eq("member_role", "seller"),
    supabase.from("deal_checklist_marks").select("item_key, note, marked_by, marked_at").eq("deal_id", id),
    bucket.list(`deal/${id}`, { limit: 1000 }),
    bucket.list(`deal/${id}/staff`, { limit: 1000 }),
    aiFeaturesOn(supabase, ["ai_staff_document_check", "ai_staff_inspection_items"]),
  ]);
  const sellerIds = (sellers ?? []).map((s) => s.profile_id);
  const [{ data: memberDocs }, { data: memberTypes }] = sellerIds.length
    ? await Promise.all([
        supabase.from("member_documents").select("id, name, storage_path, size_bytes, created_at").in("profile_id", sellerIds).order("created_at", { ascending: false }),
        supabase.from("deal_member_document_types").select("member_document_id, doc_types").eq("deal_id", id),
      ])
    : [{ data: [] }, { data: [] }];
  const people = new Set([...(docs ?? []).map((d) => d.uploaded_by), ...(marks ?? []).map((m) => m.marked_by)].filter((x): x is string => Boolean(x)));
  const { data: names } = people.size ? await supabase.from("profiles").select("id, full_name").in("id", [...people]) : { data: [] };
  const nameOf = (pid: string | null) => (names ?? []).find((n) => n.id === pid)?.full_name ?? "staff";

  const filed = new Set((docs ?? []).map((d) => d.path));
  const unfiled = [
    ...(top ?? []).filter((f) => f.id && !f.name.startsWith(".")).map((f) => ({ path: `deal/${id}/${f.name}`, at: f.created_at })),
    ...(staffFiles ?? []).filter((f) => f.id && !f.name.startsWith(".")).map((f) => ({ path: `deal/${id}/staff/${f.name}`, at: f.created_at })),
  ].filter((f) => !filed.has(f.path) && parseDocPath(f.path, id));

  const typesOf = new Map((memberTypes ?? []).map((t) => [t.member_document_id, cleanDocTypes(t.doc_types)]));
  const files: ChecklistFile[] = [
    ...(docs ?? []).map((d) => ({ id: d.id, name: d.file_name, doc_types: d.doc_types })),
    ...(memberDocs ?? []).map((d) => ({ id: d.id, name: d.name, doc_types: typesOf.get(d.id) ?? [] })),
  ];
  const checklist = checklistFor(
    deal.seller_type,
    files,
    (marks ?? []).map((m) => ({ item_key: m.item_key, note: m.note, marked_by_name: nameOf(m.marked_by), marked_at: m.marked_at })),
  );
  const canCheck = ai.ai_staff_document_check && aiKeyConfigured();
  const canReadRepairs = ai.ai_staff_inspection_items && aiKeyConfigured();
  const isInspection = (types: string[]) => types.some((t) => t === "home_inspection" || t === "pest_inspection");
  const rowItem = (r: (typeof checklist.rows)[number]) => (
    <li key={r.key} className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-body text-body-sm font-medium text-ink">{r.label}</p>
        {r.hint && <p className={mutedCls}>{r.hint}</p>}
        {r.status === "on_file" && <p className={mutedCls}>On file: {r.files.map((f) => f.name).join(", ")}</p>}
        {r.status === "not_needed" && r.mark && (
          <p className={mutedCls}>
            Not needed{r.mark.note ? `: ${r.mark.note}` : ""} ({r.mark.marked_by_name}
            {r.mark.marked_at ? `, ${fmtShort(r.mark.marked_at.slice(0, 10))}` : ""})
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={r.status === "on_file" ? "green" : r.status === "missing" ? "red" : "neutral"}>{STATUS_LABEL[r.status]}</Pill>
        {r.status !== "on_file" && <ChecklistMarkControl dealId={id} itemKey={r.key} label={r.label} marked={r.status === "not_needed"} />}
      </div>
    </li>
  );

  return (
    <DealShell profile={profile} deal={deal} done={done} total={total} active="documents">
      <WiringBanner />

      <Panel title={`Checklist for a ${SELLER_TYPE_LABELS[deal.seller_type]} sale: ${checklist.done} of ${checklist.total} done`}>
        <p className={mutedCls}>
          {checklist.missing ? `${checklist.missing} missing.` : "Nothing missing."} A file counts once its type is set. On file means a document of that type is filed: it doesn&apos;t mean it&apos;s signed or complete, so open it or use Check this document. Items that don&apos;t apply can be marked not needed. Draft list for California listing-side sales; ask an admin to change it.
        </p>
        <ul className="mt-3 divide-y divide-line" aria-label="Required documents">
          {checklist.required.map(rowItem)}
        </ul>
        <h3 className="mt-6 font-body text-body-md font-medium text-ink">If they apply</h3>
        <p className={mutedCls}>These count once they&apos;re on file or marked not needed.</p>
        <ul className="mt-2 divide-y divide-line" aria-label="Documents if they apply">
          {checklist.ifApplies.map(rowItem)}
        </ul>
      </Panel>

      <Panel title="Upload a document">
        <p className={`${mutedCls} mb-3`}>Uploads are staff-only. Use &ldquo;Share with seller&rdquo; to put one in the seller&apos;s Documents page.</p>
        <DocumentUploader dealId={id} />
      </Panel>

      <Panel title={`Documents (${(docs ?? []).length})`}>
        {canCheck && <p className={mutedCls}>&ldquo;Check this document&rdquo; sends that one file to the assistant, which suggests its types and points out missing signatures or blanks. You decide what to save.</p>}
        {(docs ?? []).length ? (
          <ul className="divide-y divide-line">
            {(docs ?? []).map((d) => (
              <DocItem
                key={`${d.id}-${d.path}-${d.doc_types.join(",")}`}
                dealId={id}
                source="deal"
                id={d.id}
                name={d.file_name}
                href={fileHref(id, "deal-docs", d.path)}
                meta={`${size(d.size_bytes)} · added ${fmtShort(d.created_at.slice(0, 10))} by ${nameOf(d.uploaded_by)}`}
                types={cleanDocTypes(d.doc_types)}
                shared={d.shared}
                canCheck={canCheck}
                extra={canReadRepairs && isInspection(d.doc_types) ? <StartRepairItems dealId={id} documentId={d.id} name={d.file_name} /> : null}
              />
            ))}
          </ul>
        ) : (
          <p className={mutedCls}>No documents yet.</p>
        )}
      </Panel>

      {sellerIds.length > 0 && (
        <Panel title={`From the seller (${(memberDocs ?? []).length})`}>
          <p className={mutedCls}>What the seller uploaded in their portal. Set a type and it counts toward the checklist.</p>
          {(memberDocs ?? []).length ? (
            <ul className="divide-y divide-line">
              {(memberDocs ?? []).map((d) => (
                <DocItem
                  key={`${d.id}-${(typesOf.get(d.id) ?? []).join(",")}`}
                  dealId={id}
                  source="member"
                  id={d.id}
                  name={d.name}
                  href={fileHref(id, "member-docs", d.storage_path)}
                  meta={`${size(d.size_bytes)} · uploaded ${fmtShort(d.created_at.slice(0, 10))}`}
                  types={typesOf.get(d.id) ?? []}
                  canCheck={canCheck}
                />
              ))}
            </ul>
          ) : (
            <p className={mutedCls}>The seller hasn&apos;t uploaded anything.</p>
          )}
        </Panel>
      )}

      {unfiled.length > 0 && (
        <Panel title={`Not filed yet (${unfiled.length})`}>
          <p className={mutedCls}>Files in this deal&apos;s folder that aren&apos;t on the list, for example ones shared before the Documents tab existed. File them to count them, or delete them.</p>
          <ul className="divide-y divide-line">
            {unfiled.map((f) => {
              const where = parseDocPath(f.path, id)!;
              return (
                <DocItem
                  key={f.path}
                  dealId={id}
                  source="unfiled"
                  id={f.path}
                  name={where.name}
                  href={fileHref(id, "deal-docs", f.path)}
                  meta={`${where.shared ? "The seller can see this" : "Staff only"}${f.at ? ` · added ${fmtShort(f.at.slice(0, 10))}` : ""}`}
                  types={[]}
                  canCheck={false}
                />
              );
            })}
          </ul>
        </Panel>
      )}
    </DealShell>
  );
}
