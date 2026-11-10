import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel, T } from "@vabrato/ui";
import { AccessDenied } from "@/components/access-denied";
import { Header } from "@/components/header";
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
    <div>
      <Header profile={profile} />
      <main className="mx-auto max-w-4xl space-y-5 p-6">
        <Link href="/messages" className="text-sm" style={{ color: T.muted }}>
          ← All messages
        </Link>
        <h1 className="font-serif text-xl">{member.full_name || member.email}</h1>
        <p className="text-sm" style={{ color: T.red }}>
          Never send wiring or payment instructions by message. Clients verify wiring by calling escrow.
        </p>

        <Panel title="Conversation">
          <ol className="mb-4 space-y-3">
            {(messages ?? []).map((m) => (
              <li key={m.id} className="rounded-lg p-3 text-sm" style={{ background: m.sender_id === memberId ? T.canvas : T.surface, border: `1px solid ${T.line}` }}>
                <p className="text-xs" style={{ color: T.muted }}>
                  {m.sender_id === memberId ? member.full_name || "Client" : m.sender_id === profile.id ? "You" : "Vabrato team"} · {fmt(m.created_at)}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>
              </li>
            ))}
          </ol>
          <ReplyForm memberId={memberId} />
        </Panel>

        <Panel title="Buyer agreement">
          <form action={setBuyerAgreementAction.bind(null, memberId)} className="flex items-center gap-3 text-sm">
            <span>{member.buyer_agreement_on_file_at ? `On file since ${fmt(member.buyer_agreement_on_file_at)}` : "Not on file"}</span>
            <input type="hidden" name="onFile" value={member.buyer_agreement_on_file_at ? "false" : "true"} />
            <button type="submit" className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ border: `1px solid ${T.line}` }}>
              {member.buyer_agreement_on_file_at ? "Mark as not on file" : "Mark as on file"}
            </button>
          </form>
        </Panel>

        <Panel title="Tour requests">
          {tours && tours.length ? (
            <ul className="space-y-3 text-sm">
              {tours.map((t) => {
                const p = (t.payload ?? {}) as { tourDate?: string; tourMode?: string };
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {t.listing_key} · {p.tourDate ?? "any day"} {p.tourMode === "video" ? "(video)" : ""} · <strong>{t.tour_status}</strong>
                    </span>
                    {t.tour_status === "requested" && (
                      <span className="flex gap-2">
                        <form action={setTourStatusAction.bind(null, memberId)}>
                          <input type="hidden" name="lead" value={t.id} />
                          <input type="hidden" name="status" value="confirmed" />
                          <button type="submit" className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: T.ink, color: T.gold }}>
                            Confirm
                          </button>
                        </form>
                        <form action={setTourStatusAction.bind(null, memberId)}>
                          <input type="hidden" name="lead" value={t.id} />
                          <input type="hidden" name="status" value="declined" />
                          <button type="submit" className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ border: `1px solid ${T.line}` }}>
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
            <p className="text-sm" style={{ color: T.muted }}>
              No tour requests from this client.
            </p>
          )}
        </Panel>
      </main>
    </div>
  );
}
