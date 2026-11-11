import Link from "next/link";
import { notFound } from "next/navigation";
import type { Task, TaskPhase } from "@vabrato/db";
import { OwnerChip, Panel, WiringBanner, cx, focusLight } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { DealShell } from "@/components/deal-shell";
import { linkAction, linkDanger, mutedCls } from "@/components/ui";
import { removeMemberAction, toggleTaskAction } from "@/lib/actions";
import { dueState, fmtShort } from "@/lib/dates";
import { getDealWithProgress } from "@/lib/queries";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { InviteForm } from "./invite-form";
import { ListingKeyForm } from "./listing-key-form";

export const dynamic = "force-dynamic";

const PHASES: { key: TaskPhase; label: string }[] = [
  { key: "after_ratification", label: "After ratification" },
  { key: "closing_week", label: "Closing week" },
  { key: "after_coe", label: "After close of escrow" },
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
  const [{ data: tasks }, { data: members }] = await Promise.all([
    supabase.from("tasks").select("*").eq("deal_id", id).order("due_date").order("offset_days"),
    supabase.from("deal_members").select("profile_id, member_role, profiles(email, full_name)").eq("deal_id", id),
  ]);
  const all = tasks ?? [];

  return (
    <DealShell profile={profile} deal={deal} done={done} total={total} active="tasks">
      <WiringBanner salePrice={deal.sale_price != null ? money(deal.sale_price) : undefined} />

      <Panel title="Seller access">
        {members?.length ? (
          <ul className="mb-4 divide-y divide-line">
            {members.map((m) => {
              const who = m.profiles?.full_name || m.profiles?.email || "Member";
              return (
                <li key={m.profile_id} className="flex flex-wrap items-center gap-2 py-1 font-body text-body-sm">
                  <span className="min-w-0 flex-1 text-ink">
                    {who} <span className="text-muted">· {m.member_role}</span>
                  </span>
                  {m.member_role === "seller" && (
                    <Link href={`/messages/${m.profile_id}`} className={linkAction}>
                      Messages<span className="sr-only"> with {who}</span>
                    </Link>
                  )}
                  <form action={removeMemberAction.bind(null, deal.id, m.profile_id)}>
                    <button type="submit" className={linkDanger}>
                      Remove<span className="sr-only"> {who}</span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={`${mutedCls} mb-4`}>No seller has portal access yet. Add their email. No invite email is sent; they sign in at vabrato.com/my with this address to see their sale.</p>
        )}
        <InviteForm dealId={deal.id} />
      </Panel>

      <Panel title="MLS listing">
        <p className={`${mutedCls} mb-4`}>Link this sale to its listing to show the seller weekly views, saves, tour requests and open-house visitors in their portal.</p>
        <ListingKeyForm dealId={deal.id} current={deal.listing_key} />
      </Panel>

      {PHASES.map(({ key, label }) => {
        const set = all.filter((t) => t.phase === key);
        if (!set.length) return null;
        const phaseDone = set.filter((t) => t.done).length;
        return (
          <Panel key={key} title={label} action={<span className="font-body text-caption text-muted">{phaseDone} of {set.length} done</span>}>
            <ul className="divide-y divide-line">
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

const STATE_TEXT: Record<string, string> = { green: "text-green", red: "text-red", amber: "text-gold-ink", muted: "text-muted" };

function TaskRow({ task, dealId }: { task: Task; dealId: string }) {
  const st = dueState(task.due_date, task.done);
  return (
    <li className="flex flex-wrap items-center gap-3 py-1">
      <form action={toggleTaskAction.bind(null, task.id, dealId, !task.done)}>
        <button
          type="submit"
          aria-label={`${task.done ? "Mark not done" : "Mark done"}: ${task.title}`}
          aria-pressed={task.done}
          className={cx("flex h-11 w-11 items-center justify-center", focusLight)}
        >
          <span aria-hidden="true" className={cx("flex h-5 w-5 items-center justify-center border-2 text-[12px] leading-none", task.done ? "border-navy bg-navy text-white" : "border-muted bg-white")}>
            {task.done ? "✓" : ""}
          </span>
        </button>
      </form>
      <span className={cx("min-w-0 flex-1 font-body text-body-sm", task.done ? "text-muted line-through" : "text-ink")}>{task.title}</span>
      <OwnerChip owner={task.owner} />
      <span className={cx("w-20 text-right font-body text-caption font-medium", STATE_TEXT[st.tone] ?? "text-muted")}>{st.label}</span>
      <span className="hidden w-24 text-right font-body text-caption text-muted sm:block">{fmtShort(task.due_date)}</span>
    </li>
  );
}
