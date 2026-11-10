import { Panel, WiringBanner } from "@vabrato/ui/web";
import { MemberShell } from "@/member/components/MemberShell";
import { MessageForm } from "@/member/components/MessageForm";
import { assignedAgent, requirePortalMember } from "@/member/session";

// Messages with the member's Vabrato team. Rendered as plain text (React
// escapes it; no links or HTML are interpreted; review item 9). Staff reply
// from the agent console. The wiring banner reminds members that wiring
// instructions never arrive by message (review item 8).
export default async function MessagesPage() {
  const member = await requirePortalMember("/my/messages");
  const { supabase, profile } = member;
  const [{ data: messages }, agent] = await Promise.all([
    supabase.from("messages").select("id, sender_id, body, created_at").eq("member_id", profile.id).order("created_at", { ascending: true }).limit(200),
    assignedAgent(supabase, profile.agent_id),
  ]);
  if ((messages ?? []).some((m) => m.sender_id !== profile.id)) await supabase.rpc("mark_messages_read", { p_member: profile.id });
  const staffName = agent?.display_name ?? "Your Vabrato team";
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <MemberShell member={member} role={member.role} current="messages" eyebrow="Your team" title="Messages">
      <WiringBanner />
      <Panel title={`Conversation with ${staffName}`}>
        <div className="space-y-6">
          {messages && messages.length > 0 ? (
            <ol className="space-y-4" aria-label="Messages, oldest first">
              {messages.map((m) => {
                const mine = m.sender_id === profile.id;
                return (
                  <li key={m.id} className={`max-w-[80%] border p-4 font-body text-body-sm ${mine ? "ml-auto border-navy bg-white" : "border-line bg-white"}`}>
                    <p className="text-caption text-muted">
                      {mine ? "You" : staffName} · <time dateTime={m.created_at}>{fmt(m.created_at)}</time>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-ink">{m.body}</p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="font-body text-body text-ink">No messages yet. Ask your agent anything about homes, tours or your sale.</p>
          )}
          <MessageForm />
        </div>
      </Panel>
    </MemberShell>
  );
}
