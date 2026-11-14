import { Panel } from "@vabrato/ui/web";
import { MemberShell } from "@/member/components/MemberShell";
import { DeleteAssistantData, TodoDelete, TodoDone, type TodoRow } from "@/member/components/MemberTodos";
import { requirePortalMember } from "@/member/session";
import { fmtDay } from "@/member/view";
import { fmtLong } from "@vabrato/lib";

// "My to-dos" (S5b PR 2; owner answers 2026-11-13): to-dos the member added
// from Ask Vabrato's suggestions. Each waits for their agent's approval, then
// is theirs to tick off. The sale's own schedule stays on My sale.

export default async function TodosPage() {
  const member = await requirePortalMember("/my/todos");
  const { data } = await member.supabase
    .from("member_todos")
    .select("id, title, source_name, page, due_date, status, done, created_at, decided_at")
    .eq("profile_id", member.profile.id)
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = data ?? [];
  const { count: drafts } = await member.supabase.from("member_drafts").select("id", { count: "exact", head: true }).eq("profile_id", member.profile.id);
  // S5b PR 5: plan steps carry a due date ("Due Dec 1"); dated to-dos come first, by date.
  const source = (r: (typeof rows)[number]) =>
    [r.due_date ? `Due ${fmtLong(r.due_date)}` : null, r.source_name ? `From ${r.source_name}${r.page ? `, p. ${r.page}` : ""}` : null].filter(Boolean).join(" · ");
  const byDue = (a: (typeof rows)[number], b: (typeof rows)[number]) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
  const toRow = (r: (typeof rows)[number]): TodoRow => ({ id: r.id, title: r.title, source: source(r), done: r.done });
  const pending = rows.filter((r) => r.status === "pending").sort(byDue);
  const approved = rows.filter((r) => r.status === "approved").sort((a, b) => Number(a.done) - Number(b.done) || byDue(a, b));
  const declined = rows.filter((r) => r.status === "declined");

  return (
    <MemberShell member={member} role={member.role} current="todos" eyebrow="Assistant" title="My to-dos">
      <p className="font-body text-body-sm text-ink">
        To-dos you added from Ask Vabrato&apos;s suggestions. Your agent sees them and approves each one first. Your sale&apos;s own schedule stays on My sale.
      </p>

      <Panel title="To do">
        {approved.length ? (
          <ul className="divide-y divide-line font-body text-body-sm">
            {approved.map((r) => (
              <li key={r.id} className="py-2">
                <TodoDone todo={toRow(r)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-body text-body text-ink">Nothing here yet. Once your agent approves a to-do, it shows here for you to tick off.</p>
        )}
      </Panel>

      <Panel title="Waiting for your agent">
        {pending.length ? (
          <ul className="divide-y divide-line font-body text-body-sm text-ink">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>
                  {r.title}
                  <span className="block text-caption text-muted">
                    {source(r) ? `${source(r)} · ` : ""}added {fmtDay(r.created_at)}
                  </span>
                </span>
                <TodoDelete todo={toRow(r)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-body text-body text-ink">
            Nothing waiting. Summarize a document with{" "}
            <a href="/my/assistant" className="text-navy underline">
              Ask Vabrato
            </a>{" "}
            to get suggested to-dos.
          </p>
        )}
      </Panel>

      {declined.length > 0 && (
        <Panel title="Your agent declined these">
          <ul className="divide-y divide-line font-body text-body-sm text-ink">
            {declined.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>
                  {r.title}
                  {source(r) && <span className="block text-caption text-muted">{source(r)}</span>}
                </span>
                <TodoDelete todo={toRow(r)} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Your assistant data">
        <div className="space-y-3 font-body text-body-sm text-ink">
          <p>
            Ask Vabrato doesn&apos;t keep your questions or summaries. It stores only the to-dos above and the drafts you save (
            <a href="/my/drafts" className="text-navy underline">
              My drafts
            </a>
            ). This removes your saved drafts, the to-dos waiting for your agent and the ones your agent declined; approved to-dos stay until you delete them.
          </p>
          <DeleteAssistantData count={pending.length + declined.length + (drafts ?? 0)} />
        </div>
      </Panel>
    </MemberShell>
  );
}
