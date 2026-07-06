import Link from "next/link";
import { computeCoe } from "@vabrato/lib";
import { Panel, T } from "@vabrato/ui";
import { AccessDenied } from "@/components/access-denied";
import { Header } from "@/components/header";
import { fmtLong } from "@/lib/dates";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;

  const supabase = await supabaseServer();
  const { data: deals } = await supabase
    .from("deals")
    .select("*")
    .order("created_at", { ascending: false });

  const dealIds = (deals ?? []).map((d) => d.id);
  const { data: taskRows } = dealIds.length
    ? await supabase.from("tasks").select("deal_id, done").in("deal_id", dealIds)
    : { data: [] };
  const progress = new Map<string, { done: number; total: number }>();
  for (const t of taskRows ?? []) {
    const p = progress.get(t.deal_id) ?? { done: 0, total: 0 };
    p.total += 1;
    if (t.done) p.done += 1;
    progress.set(t.deal_id, p);
  }

  return (
    <div>
      <Header profile={profile} />
      <main className="mx-auto max-w-4xl p-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="font-serif text-xl">Transactions</h1>
          <Link
            href="/deals/new"
            className="rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: T.ink, color: T.gold }}
          >
            + New transaction
          </Link>
        </div>

        {!deals?.length ? (
          <Panel title="No transactions yet">
            <p className="text-sm" style={{ color: T.muted }}>
              Start your first one — enter the ratification date and the desk builds the full
              dated, owner-assigned task list.
            </p>
          </Panel>
        ) : (
          <ul className="space-y-3">
            {deals.map((deal) => {
              const p = progress.get(deal.id) ?? { done: 0, total: 0 };
              const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
              const coe = computeCoe(deal.ratification_date, deal.days_to_close);
              return (
                <li key={deal.id}>
                  <Link
                    href={`/deals/${deal.id}`}
                    className="block rounded-2xl p-5 transition-shadow hover:shadow-md"
                    style={{ background: T.surface, border: `1px solid ${T.line}` }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-serif">{deal.address}</div>
                        <div className="mt-0.5 text-xs" style={{ color: T.muted }}>
                          {deal.seller_name ? `Seller ${deal.seller_name} · ` : ""}
                          {deal.escrow_number ? `Escrow #${deal.escrow_number} · ` : ""}
                          {deal.status}
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>
                            COE
                          </div>
                          <div style={{ color: T.goldDeep }}>{fmtLong(coe)}</div>
                        </div>
                        <div className="w-28">
                          <div className="mb-1 flex justify-between text-xs" style={{ color: T.muted }}>
                            <span>
                              {p.done}/{p.total}
                            </span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full" style={{ background: T.lineSoft }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: T.gold }} />
                          </div>
                        </div>
                      </div>
                    </div>
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
