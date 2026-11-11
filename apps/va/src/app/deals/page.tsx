import Link from "next/link";
import { computeCoe } from "@vabrato/lib";
import { Panel, Pill, cx, focusLight } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { btnPrimary, mutedCls } from "@/components/ui";
import { fmtLong } from "@/lib/dates";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// Transactions list (the former VA desk home). RLS: deals this person can access.
export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;

  const supabase = await supabaseServer();
  const { data: deals } = await supabase.from("deals").select("*").order("created_at", { ascending: false });
  const dealIds = (deals ?? []).map((d) => d.id);
  const { data: taskRows } = dealIds.length ? await supabase.from("tasks").select("deal_id, done").in("deal_id", dealIds) : { data: [] };
  const progress = new Map<string, { done: number; total: number }>();
  for (const t of taskRows ?? []) {
    const p = progress.get(t.deal_id) ?? { done: 0, total: 0 };
    p.total += 1;
    if (t.done) p.done += 1;
    progress.set(t.deal_id, p);
  }

  return (
    <ConsoleShell
      profile={profile}
      current="deals"
      eyebrow="Transactions"
      title="Deals"
      topRight={
        <Link href="/deals/new" className={btnPrimary}>
          + New transaction
        </Link>
      }
    >
      {!deals?.length ? (
        <Panel title="No transactions yet">
          <p className={mutedCls}>Start your first one: enter the ratification date and the console builds the full dated, owner-assigned task list.</p>
        </Panel>
      ) : (
        <ul className="space-y-3">
          {deals.map((deal) => {
            const p = progress.get(deal.id) ?? { done: 0, total: 0 };
            const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
            const coe = computeCoe(deal.ratification_date, deal.days_to_close);
            return (
              <li key={deal.id}>
                <Link href={`/deals/${deal.id}`} className={cx("block border border-line bg-white p-5 hover:border-navy", focusLight)}>
                  <span className="flex flex-wrap items-center justify-between gap-4 font-body">
                    <span>
                      <span className="block font-subhead text-subhead-sm text-navy underline">{deal.address}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-caption text-muted">
                        {deal.seller_name && <span>Seller {deal.seller_name}</span>}
                        {deal.escrow_number && <span>Escrow #{deal.escrow_number}</span>}
                        <Pill tone={deal.status === "active" ? "green" : deal.status === "closed" ? "navy" : "outline"}>{deal.status}</Pill>
                      </span>
                    </span>
                    <span className="flex items-center gap-6 text-body-sm">
                      <span>
                        <span className="block text-label uppercase tracking-label text-muted">Close of escrow</span>
                        <span className="text-ink">{fmtLong(coe)}</span>
                      </span>
                      <span className="w-32">
                        <span className="mb-1 flex justify-between text-caption text-muted">
                          <span>
                            {p.done}/{p.total} tasks
                          </span>
                          <span>{pct}%</span>
                        </span>
                        <span aria-hidden="true" className="block h-2 bg-navy-50">
                          <span className="block h-full bg-navy" style={{ width: `${pct}%` }} />
                        </span>
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ConsoleShell>
  );
}
