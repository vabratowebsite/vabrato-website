import { Panel, WiringBanner } from "@vabrato/ui/web";
import { DeleteDocumentButton, DocumentUploader } from "@/member/components/DocumentUploader";
import { MemberShell } from "@/member/components/MemberShell";
import { sizeLabel } from "@/member/documents";
import { requirePortalMember } from "@/member/session";
import { fmtDay } from "@/member/view";

// Documents: the member's own uploads (member-docs) and anything the
// transaction desk shared on their deal (deal-docs). Downloads are
// short-lived signed URLs (review item 8). Money is never arranged here, so
// the wiring banner is shown (CLAUDE.md, review item 8).
export default async function DocumentsPage() {
  const member = await requirePortalMember("/my/documents");
  const { supabase, profile } = member;
  const [{ data: docs }, { data: deals }] = await Promise.all([
    supabase.from("member_documents").select("id, name, size_bytes, content_type, uploaded_by, created_at").order("created_at", { ascending: false }),
    supabase.from("deals").select("id, address").eq("status", "active"),
  ]);
  const dealDocs = await Promise.all(
    (deals ?? []).map(async (d) => {
      const { data } = await supabase.storage.from("deal-docs").list(`deal/${d.id}`, { limit: 100, sortBy: { column: "name", order: "asc" } });
      // Folder entries (no id), such as the staff-only folder, are never listed.
      return { deal: d, files: (data ?? []).filter((f) => f.id && f.name && !f.name.startsWith(".")) };
    }),
  );

  return (
    <MemberShell member={member} role={member.role} current="documents" eyebrow="Your files" title="Documents">
      <WiringBanner />
      <Panel title="Your documents">
        <div className="space-y-6">
          <DocumentUploader />
          {docs && docs.length > 0 ? (
            <ul className="divide-y divide-line font-body text-body-sm text-ink">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <a href={`/api/my/documents/${d.id}`} className="font-medium text-navy underline">
                      {d.name}
                    </a>
                    <p className="text-caption text-muted">
                      {sizeLabel(d.size_bytes)} · added {fmtDay(d.created_at)}
                      {d.uploaded_by && d.uploaded_by !== profile.id ? " by your Vabrato team" : ""}
                    </p>
                  </div>
                  {d.uploaded_by === profile.id && <DeleteDocumentButton id={d.id} name={d.name} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-body text-body text-ink">No documents yet. Upload inspection reports, disclosures or HOA packets to keep them in one place. Your agent can see what you upload.</p>
          )}
        </div>
      </Panel>
      {dealDocs.map(({ deal, files }) => (
        <Panel key={deal.id} title={`From your transaction desk · ${deal.address}`}>
          {files.length ? (
            <ul className="divide-y divide-line font-body text-body-sm text-ink">
              {files.map((f) => (
                <li key={f.name} className="py-3">
                  <a href={`/api/my/deal-docs?path=${encodeURIComponent(`deal/${deal.id}/${f.name}`)}`} className="font-medium text-navy underline">
                    {f.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-body text-body text-ink">Your transaction coordinator hasn&apos;t shared documents for this sale yet.</p>
          )}
        </Panel>
      ))}
    </MemberShell>
  );
}
