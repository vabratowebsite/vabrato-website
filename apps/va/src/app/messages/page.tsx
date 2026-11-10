import Link from "next/link";
import { Panel, T } from "@vabrato/ui";
import { AccessDenied } from "@/components/access-denied";
import { Header } from "@/components/header";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// Member messages (minimal inbox until the S6 console). Threads the signed-in
// staff member may see: members assigned to them, clients on their deals,
// everyone for admins (RLS).
export const dynamic = "force-dynamic";

export default async function MessagesInbox() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const supabase = await supabaseServer();
  const { data: messages } = await supabase.from("messages").select("member_id, sender_id, body, created_at, read_at").order("created_at", { ascending: false }).limit(500);
  const threads = new Map<string, { last: string; preview: string; unread: number }>();
  for (const m of messages ?? []) {
    const t = threads.get(m.member_id) ?? { last: m.created_at, preview: m.body.slice(0, 120), unread: 0 };
    if (m.sender_id === m.member_id && !m.read_at) t.unread += 1;
    threads.set(m.member_id, t);
  }
  const ids = [...threads.keys()];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));

  return (
    <div>
      <Header profile={profile} />
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-5 font-serif text-xl">Member messages</h1>
        {ids.length === 0 ? (
          <Panel title="No messages yet">
            <p className="text-sm" style={{ color: T.muted }}>
              When clients message you from their portal, the conversations appear here.
            </p>
          </Panel>
        ) : (
          <ul className="space-y-3">
            {ids.map((id) => {
              const t = threads.get(id)!;
              return (
                <li key={id}>
                  <Link href={`/messages/${id}`} className="block rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{name.get(id) ?? "Member"}</span>
                      <span className="text-xs" style={{ color: t.unread ? T.red : T.muted }}>
                        {t.unread ? `${t.unread} unread · ` : ""}
                        {new Date(t.last).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm" style={{ color: T.muted }}>
                      {t.preview}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
