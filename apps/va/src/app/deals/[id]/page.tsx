import Link from "next/link";
import { notFound } from "next/navigation";
import type { Task, TaskPhase } from "@vabrato/db";
import { OwnerChip, Panel, T } from "@vabrato/ui";
import { AccessDenied } from "@/components/access-denied";
import { DealShell } from "@/components/deal-shell";
import { removeMemberAction, toggleTaskAction } from "@/lib/actions";
import { dueState, fmtShort } from "@/lib/dates";
import { getDealWithProgress } from "@/lib/queries";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { InviteForm } from "./invite-form";
import { ListingKeyForm } from "./listing-key-form";

export const dynamic = "force-dynamic";

const PHASES: { key: TaskPhase; label: string }[] = [
  { key: "after_ratification", label: "After Ratification" },
  { key: "closing_week", label: "Closing Week" },
  { key: "after_coe", label: "After COE" },
];

const money = (n: number) => `$${Number(n).toLocaleString("en-US")}`;

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;

  const result = await getDealWithProgress(id);
  if (!result) notFound();
  const { deal, done, total } = result;

  const supabase = await supabaseServer();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("deal_id", id)
    .order("due_date")
    .order("offset_days");

  const { data: members } = await supabase
    .from("deal_members")
    .select("profile_id, member_role, profiles(email, full_name)")
    .eq("deal_id", id);

  const all = tasks ?? [];

  return (
    <DealShell profile={profile} deal={deal} done={done} total={total} active="tasks">
      {deal.sale_price != null && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ background: `${T.red}12`, border: `1px solid ${T.red}55`, color: T.red }}
        >
          Sale price {money(deal.sale_price)}. Never act on emailed wiring instructions — always
          call escrow to verify wiring details.
        </div>
      )}

      <Panel title="Seller access">
        {members?.length ? (
          <ul className="mb-3 space-y-1.5">
            {members.map((m) => (
              <li key={m.profile_id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1">
                  {m.profiles?.full_name || m.profiles?.email}
                  <span className="ml-2 text-xs" style={{ color: T.faint }}>
                    {m.member_role}
                  </span>
                </span>
                {m.member_role === "seller" && (
                  <Link href={`/messages/${m.profile_id}`} className="text-xs" style={{ color: T.muted }}>
                    Messages
                  </Link>
                )}
                <form action={removeMemberAction.bind(null, deal.id, m.profile_id)}>
                  <button className="text-xs" style={{ color: T.red }}>
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm" style={{ color: T.muted }}>
            No seller has portal access yet. Add their email. No invite email is sent; they
            sign in at vabrato.com/my with this address to see their sale.
          </p>
        )}
        <InviteForm dealId={deal.id} />
      </Panel>

      <Panel title="MLS listing">
        <p className="mb-3 text-sm" style={{ color: T.muted }}>
          Link this sale to its listing to show the seller weekly views, saves, tour requests and
          open-house visitors in their portal.
        </p>
        <ListingKeyForm dealId={deal.id} current={deal.listing_key} />
      </Panel>

      {PHASES.map(({ key, label }) => {
        const set = all.filter((t) => t.phase === key);
        if (!set.length) return null;
        const phaseDone = set.filter((t) => t.done).length;
        return (
          <Panel
            key={key}
            title={label}
            right={
              <span className="text-xs" style={{ color: T.faint }}>
                {phaseDone}/{set.length}
              </span>
            }
          >
            <ul className="space-y-1.5">
              {set.map((task) => (
                <TaskRow key={task.id} task={task} dealId={deal.id} />
              ))}
            </ul>
          </Panel>
        );
      })}
    </DealShell>
  );
}

function TaskRow({ task, dealId }: { task: Task; dealId: string }) {
  const st = dueState(task.due_date, task.done);
  return (
    <li className="flex items-center gap-3 py-1.5">
      <form action={toggleTaskAction.bind(null, task.id, dealId, !task.done)}>
        <button
          aria-label={task.done ? "Mark not done" : "Mark done"}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-xs"
          style={{
            background: task.done ? T.green : "transparent",
            border: `1.5px solid ${task.done ? T.green : T.line}`,
            color: "#fff",
          }}
        >
          {task.done ? "✓" : ""}
        </button>
      </form>
      <span
        className="min-w-0 flex-1 text-sm"
        style={{
          color: task.done ? T.faint : T.text,
          textDecoration: task.done ? "line-through" : "none",
        }}
      >
        {task.title}
      </span>
      <OwnerChip owner={task.owner} />
      <span className="w-16 text-right text-[11px] font-medium" style={{ color: st.color }}>
        {st.label}
      </span>
      <span className="hidden w-24 text-right text-xs sm:block" style={{ color: T.muted }}>
        {fmtShort(task.due_date)}
      </span>
    </li>
  );
}
