import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { btnPrimary, btnSecondary, mutedCls } from "@/components/ui";
import { setBuyerAgreementAction, setTourStatusAction } from "@/lib/member-actions";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { ReplyForm } from "./reply-form";

// One member: conversation, tour requests (staff confirm; never automatic),
// and the buyer agreement on file (review item 16). Messages are shown as
// plain text. Wiring instructions are never sent by message.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ memberId: string }> };

const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function MemberThread({ params }: Props) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { memberId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(memberId)) notFound();
  const supabase = await supabaseServer();
  const { data: member } = await supabase.from("profiles").select("id, full_name, email, role, buyer_agreement_on_file_at").eq("id", memberId).maybeSingle();
  if (!member) notFound();
  const [{ data: messages }, { data: tours }] = await Promise.all([
    supabase.from("messages").select("id, sender_id, body, created_at").eq("member_id", memberId).order("created_at").limit(300),
    supabase.from("leads").select("id, listing_key, payload, tour_status, created_at").eq("profile_id", memberId).eq("kind", "tour").order("created_at", { ascending: false }),
  ]);
  await supabase.rpc("mark_messages_read", { p_member: memberId });

  return (
    <ConsoleShell profile={profile} current="messages" eyebrow="Member messages" title={member.full_name || member.email}>
      <Link href="/messages" className="inline-flex min-h-[44px] items-center font-body text-body-sm text-navy underline">
        ← All messages
      </Link>
      <p role="note" className="border border-red/40 bg-red-50 px-4 py-3 font-body text-body-sm text-red">
        Never send wiring or payment instructions by message. Clients verify wiring by calling escrow.
      </p>

      <Panel title="Conversation">
        <ol aria-label="Messages, oldest first" className="mb-6 space-y-3">
          {(messages ?? []).map((m) => (
            <li key={m.id} className={`border p-4 font-body text-body-sm ${m.sender_id === memberId ? "border-line bg-soft" : "border-navy bg-white"}`}>
              <p className="text-caption text-muted">
                {m.sender_id === memberId ? member.full_name || "Client" : m.sender_id === profile.id ? "You" : "Vabrato team"} · {fmt(m.created_at)}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-ink">{m.body}</p>
            </li>
          ))}
        </ol>
        <ReplyForm memberId={memberId} />
      </Panel>

      <Panel title="Buyer agreement">
        <form action={setBuyerAgreementAction.bind(null, memberId)} className="flex flex-wrap items-center gap-4 font-body text-body-sm text-ink">
          <span>{member.buyer_agreement_on_file_at ? `On file since ${fmt(member.buyer_agreement_on_file_at)}` : "Not on file"}</span>
          <input type="hidden" name="onFile" value={member.buyer_agreement_on_file_at ? "false" : "true"} />
          <button type="submit" className={btnSecondary}>
            {member.buyer_agreement_on_file_at ? "Mark as not on file" : "Mark as on file"}
          </button>
        </form>
      </Panel>

      <Panel title="Tour requests">
        {tours && tours.length ? (
          <ul className="divide-y divide-line font-body text-body-sm text-ink">
            {tours.map((t) => {
              const p = (t.payload ?? {}) as { tourDate?: string; tourMode?: string };
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="flex flex-wrap items-center gap-2">
                    {t.listing_key} · {p.tourDate ?? "any day"} {p.tourMode === "video" ? "(video)" : ""}
                    <Pill tone={t.tour_status === "confirmed" ? "green" : t.tour_status === "requested" ? "gold" : "outline"}>{t.tour_status}</Pill>
                  </span>
                  {t.tour_status === "requested" && (
                    <span className="flex gap-2">
                      <form action={setTourStatusAction.bind(null, memberId)}>
                        <input type="hidden" name="lead" value={t.id} />
                        <input type="hidden" name="status" value="confirmed" />
                        <button type="submit" className={btnPrimary}>
                          Confirm
                        </button>
                      </form>
                      <form action={setTourStatusAction.bind(null, memberId)}>
                        <input type="hidden" name="lead" value={t.id} />
                        <input type="hidden" name="status" value="declined" />
                        <button type="submit" className={btnSecondary}>
                          Decline
                        </button>
                      </form>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={mutedCls}>No tour requests from this client.</p>
        )}
      </Panel>
    </ConsoleShell>
  );
}
