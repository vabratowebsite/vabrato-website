import { notFound } from "next/navigation";
import type { Task, TaskPhase } from "@vabrato/db";
import { computeCoe, diffDays } from "@vabrato/lib";
import { OwnerChip, Panel, T } from "@vabrato/ui";
import { AccessDenied } from "@/components/access-denied";
import { Header } from "@/components/header";
import { toggleTaskAction } from "@/lib/actions";
import { dueState, fmtLong, fmtShort, todayISO } from "@/lib/dates";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

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

  const supabase = await supabaseServer();
  const { data: deal } = await supabase.from("deals").select("*").eq("id", id).maybeSingle();
  if (!deal) notFound();

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("deal_id", id)
    .order("due_date")
    .order("offset_days");

  const all = tasks ?? [];
  const doneCount = all.filter((t) => t.done).length;
  const pct = all.length ? Math.round((doneCount / all.length) * 100) : 0;
  const coe = computeCoe(deal.ratification_date, deal.days_to_close);
  const daysToCoe = Math.max(0, diffDays(todayISO(), coe));

  return (
    <div>
      <Header profile={profile} />

      <div
        className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-4"
        style={{ background: T.surface, borderBottom: `1px solid ${T.line}` }}
      >
        <div>
          <div className="font-serif text-lg leading-tight">{deal.address}</div>
          <div className="mt-0.5 text-xs" style={{ color: T.muted }}>
            {deal.escrow_number ? `Escrow #${deal.escrow_number} · ` : ""}
            {deal.seller_name ? `Seller ${deal.seller_name}` : ""}
            {deal.seller_type !== "normal" && (
              <span className="ml-1" style={{ color: T.goldDeep }}>
                · {deal.seller_type.replace(/_/g, " ")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <HeaderStat label="Ratified" value={fmtShort(deal.ratification_date)} />
          <HeaderStat label="Close of escrow" value={fmtLong(coe)} accent />
          <HeaderStat label="Days to COE" value={String(daysToCoe)} />
          <div className="w-36">
            <div className="mb-1 flex justify-between text-xs" style={{ color: T.muted }}>
              <span>Progress</span>
              <span>
                {doneCount}/{all.length} · {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: T.lineSoft }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: T.gold }} />
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl space-y-5 p-6">
        {deal.sale_price != null && (
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{ background: `${T.red}12`, border: `1px solid ${T.red}55`, color: T.red }}
          >
            Sale price {money(deal.sale_price)}. Never act on emailed wiring instructions — always
            call escrow to verify wiring details.
          </div>
        )}

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
      </main>
    </div>
  );
}

function HeaderStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>
        {label}
      </div>
      <div className="text-sm font-medium" style={{ color: accent ? T.goldDeep : T.text }}>
        {value}
      </div>
    </div>
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
