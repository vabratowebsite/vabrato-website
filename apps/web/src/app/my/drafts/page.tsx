import { Panel } from "@vabrato/ui/web";
import { DraftEditor } from "@/member/components/DraftEditor";
import { DeleteAssistantData } from "@/member/components/MemberTodos";
import { MemberShell } from "@/member/components/MemberShell";
import { isRecipient, type DraftKind } from "@/member/assistant/kinds";
import { requirePortalMember } from "@/member/session";
import { fmtDay } from "@/member/view";

// "My drafts" (S5b PR 3; owner answers 2026-11-14): drafts the member saved
// from Ask Vabrato. Private to the member (their agent doesn't see them) and
// deleted 30 days after the last edit (purge_member_drafts, 0038). The member
// edits and sends them; AI never sends.

const USED: Record<string, string> = { email: "Opened in email", copy: "Copied", agent: "Sent to my agent" };

export default async function DraftsPage() {
  const member = await requirePortalMember("/my/drafts");
  const { data } = await member.supabase
    .from("member_drafts")
    .select("id, kind, recipient, about, subject, body, sent_via, used_at, updated_at")
    .eq("profile_id", member.profile.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  const drafts = data ?? [];
  const [{ count: todos }, { count: flyers }] = await Promise.all([
    member.supabase.from("member_todos").select("id", { count: "exact", head: true }).eq("profile_id", member.profile.id).in("status", ["pending", "declined"]),
    member.supabase.from("member_promos").select("id", { count: "exact", head: true }).eq("profile_id", member.profile.id),
  ]);

  return (
    <MemberShell member={member} role={member.role} current="drafts" eyebrow="Assistant" title="My drafts">
      <p className="font-body text-body-sm text-ink">
        Drafts you saved from{" "}
        <a href="/my/assistant" className="text-navy underline">
          Ask Vabrato
        </a>
        . Only you can see them; your agent doesn&apos;t. Each is deleted 30 days after your last edit. You send them yourself: nothing is sent for you.
      </p>

      {drafts.length ? (
        <ol className="space-y-6 [overflow-wrap:anywhere]" aria-label="Your saved drafts, newest first">
          {drafts.map((d) => (
            <li key={d.id}>
              <DraftEditor
                id={d.id}
                draftKind={d.kind as DraftKind}
                recipient={isRecipient(d.recipient) ? d.recipient : "other"}
                about={d.about}
                subject={d.subject}
                body={d.body}
                stamp={[d.sent_via && d.used_at ? `${USED[d.sent_via] ?? "Used"} ${fmtDay(d.used_at)}` : null, `edited ${fmtDay(d.updated_at)}`].filter(Boolean).join(" · ")}
                heading={<h2 className="font-subhead text-subhead-sm text-ink">{d.subject || (d.kind === "cover_letter" ? "Offer cover letter" : "Untitled draft")}</h2>}
              />
            </li>
          ))}
        </ol>
      ) : (
        <Panel title="No saved drafts">
          <p className="font-body text-body text-ink">
            When Ask Vabrato writes a draft for you, choose &ldquo;Save to My drafts&rdquo; to keep it here for 30 days.
          </p>
        </Panel>
      )}

      <Panel title="Your assistant data">
        <div className="space-y-3 font-body text-body-sm text-ink">
          <p>
            This removes your saved drafts, your flyers, and the to-dos waiting for your agent or declined (
            <a href="/my/todos" className="text-navy underline">
              My to-dos
            </a>
            ). Approved to-dos stay until you delete them.
          </p>
          <DeleteAssistantData count={drafts.length + (todos ?? 0) + (flyers ?? 0)} />
        </div>
      </Panel>
    </MemberShell>
  );
}
