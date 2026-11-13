import { Panel, WiringBanner } from "@vabrato/ui/web";
import { DeleteDocumentButton, DocumentUploader } from "@/member/components/DocumentUploader";
import { MemberShell } from "@/member/components/MemberShell";
import { memberAiStatus } from "@/member/ai-status";
import { sizeLabel } from "@/member/documents";
import { docRef, listMemberDocuments } from "@/member/documents-list";
import { requirePortalMember } from "@/member/session";
import { fmtDay } from "@/member/view";

// Documents: the member's own uploads (member-docs) and anything the
// transaction desk shared on their deal (deal-docs). Downloads are
// short-lived signed URLs (review item 8). Money is never arranged here, so
// the wiring banner is shown (CLAUDE.md, review item 8).
export default async function DocumentsPage() {
  const member = await requirePortalMember("/my/documents");
  const { profile } = member;
  const [{ uploads: docs, deals: dealDocs }, ai] = await Promise.all([listMemberDocuments(member), memberAiStatus(member.supabase)]);
  // Ask Vabrato can summarize a file (S5b PR 2): not iPhone photos (HEIC), which it can't read.
  const canSummarize = ai.on.includes("ai_member_summarize");
  const summarizeLink = (ref: string, name: string) => (
    <a href={`/my/assistant?doc=${encodeURIComponent(ref)}`} className="inline-flex min-h-[44px] items-center px-2 text-body-sm text-navy underline">
      Summarize<span className="sr-only"> {name}</span>
    </a>
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
                  <div className="flex flex-wrap items-center gap-2">
                    {canSummarize && d.content_type !== "image/heic" && summarizeLink(docRef.upload(d.id), d.name)}
                    {d.uploaded_by === profile.id && <DeleteDocumentButton id={d.id} name={d.name} />}
                  </div>
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
                <li key={f.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <a href={`/api/my/deal-docs?path=${encodeURIComponent(f.path)}`} className="font-medium text-navy underline">
                    {f.name}
                  </a>
                  {canSummarize && summarizeLink(docRef.deal(f.path), f.name)}
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
