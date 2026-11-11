import Link from "next/link";
import { Panel, cx, focusLight } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { mutedCls } from "@/components/ui";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// Member messages. Threads the signed-in staff member may see: members
// assigned to them, clients on their deals, everyone for admins (RLS).
export const dynamic = "force-dynamic";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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
    <ConsoleShell profile={profile} current="messages" title="Member messages">
      {ids.length === 0 ? (
        <Panel title="No messages yet">
          <p className={mutedCls}>When clients message you from their portal, the conversations appear here.</p>
        </Panel>
      ) : (
        <ul className="space-y-3">
          {ids.map((id) => {
            const t = threads.get(id)!;
            return (
              <li key={id}>
                <Link href={`/messages/${id}`} className={cx("block border border-line bg-white p-4 hover:border-navy", focusLight)}>
                  <span className="flex flex-wrap items-center justify-between gap-2 font-body">
                    <span className="text-body font-medium text-navy underline">{name.get(id) ?? "Member"}</span>
                    <span className={cx("text-caption", t.unread ? "font-medium text-red" : "text-muted")}>
                      {t.unread ? `${t.unread} unread · ` : ""}
                      {fmt(t.last)}
                    </span>
                  </span>
                  <span className="mt-1 block truncate font-body text-body-sm text-muted">{t.preview}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ConsoleShell>
  );
}
