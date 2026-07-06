import type { Deal } from "@vabrato/db";
import { diffDays, fmtLong, fmtShort, todayISO } from "@vabrato/lib";
import { Panel, T } from "@vabrato/ui";
import { AccessDenied } from "@/components/access-denied";
import { Header } from "@/components/header";
import { requireSignIn } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";
import { buildTimeline } from "@/lib/timeline";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${Number(n).toLocaleString("en-US")}`;

export default async function Home() {
  const { profile, allowed } = await requireSignIn();
  if (!allowed) return <AccessDenied profile={profile} />;

  // RLS scopes this to deals the signed-in seller is a member of.
  const supabase = await supabaseServer();
  const { data: deals } = await supabase
    .from("deals")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <Header profile={profile} />
      <main className="mx-auto max-w-3xl space-y-8 p-6">
        {!deals?.length ? (
          <Panel title="No sale on file yet">
            <p className="text-sm" style={{ color: T.muted }}>
              When your agent adds you to a transaction, your sale timeline will appear here.
              Make sure they use this email address: {profile.email}.
            </p>
          </Panel>
        ) : (
          deals.map((deal) => <DealTimeline key={deal.id} deal={deal} />)
        )}
      </main>
    </div>
  );
}

async function DealTimeline({ deal }: { deal: Deal }) {
  const supabase = await supabaseServer();
  const today = todayISO();

  const { data: contingencies } = await supabase
    .from("deal_contingencies")
    .select("kind, due_date, removed_at")
    .eq("deal_id", deal.id);
  const { data: sellerTasks } = await supabase
    .from("tasks")
    .select("title, due_date, done, owner")
    .eq("deal_id", deal.id)
    .eq("owner", "Seller")
    .order("due_date");

  const timeline = buildTimeline(deal, contingencies ?? [], sellerTasks ?? [], today);
  const daysToCoe = Math.max(0, diffDays(today, timeline.coe));

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-serif text-xl leading-tight">{deal.address}</h1>
        <p className="mt-1 text-sm" style={{ color: T.muted }}>
          Ratified {fmtLong(deal.ratification_date)} · Closing {fmtLong(timeline.coe)}
          {deal.status === "active" && daysToCoe > 0 && (
            <span style={{ color: T.goldDeep }}> · {daysToCoe} days to go</span>
          )}
        </p>
      </div>

      {deal.sale_price != null && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ background: `${T.red}12`, border: `1px solid ${T.red}55`, color: T.red }}
        >
          Sale price {money(deal.sale_price)}. Vabrato and escrow will never email you wiring
          instructions — always call your escrow officer to verify wiring details before moving
          money.
        </div>
      )}

      <Panel title="Your sale timeline">
        <ol className="space-y-0">
          {timeline.milestones.map((m, i) => {
            const isNext = i === timeline.nextIndex;
            const last = i === timeline.milestones.length - 1;
            return (
              <li key={m.key} className="relative flex gap-3 pb-5" style={last ? { paddingBottom: 0 } : undefined}>
                {!last && (
                  <span
                    className="absolute left-[7px] top-4 h-full w-px"
                    style={{ background: T.lineSoft }}
                  />
                )}
                <span
                  className="relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full"
                  style={{
                    background: m.complete ? T.gold : T.surface,
                    border: `2px solid ${m.complete ? T.gold : isNext ? T.goldDeep : T.line}`,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="text-sm"
                    style={{
                      color: m.complete ? T.faint : T.text,
                      fontWeight: isNext ? 600 : 400,
                    }}
                  >
                    {m.label}
                    {isNext && (
                      <span
                        className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                        style={{ background: `${T.gold}22`, color: T.goldDeep }}
                      >
                        Up next
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: T.muted }}>
                    {fmtShort(m.date)}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Panel>

      {sellerTasks && sellerTasks.length > 0 && (
        <Panel title="Things you'll need to do">
          <ul className="space-y-2">
            {sellerTasks.map((t) => (
              <li key={`${t.title}-${t.due_date}`} className="flex items-center gap-3 text-sm">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: t.done ? T.green : T.gold }}
                />
                <span
                  className="min-w-0 flex-1"
                  style={{
                    color: t.done ? T.faint : T.text,
                    textDecoration: t.done ? "line-through" : "none",
                  }}
                >
                  {t.title}
                </span>
                <span className="text-xs" style={{ color: T.muted }}>
                  {fmtShort(t.due_date)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </section>
  );
}
